import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { must, supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/hooks';
import { fetchCourses, myEnrolledCourseIds } from '../../lib/queries';
import { Button, Card, Empty, ErrorBox, PageHeader, Spinner, Tabs, useAction } from '../../components/ui';
import { CourseCard } from '../../components/CourseBits';

export function StudentCourses() {
  const { profile, student } = useAuth();
  const uid = profile!.id;
  const [tab, setTab] = useState<'mine' | 'catalog'>('mine');
  const [subject, setSubject] = useState('');
  const { run } = useAction();

  const { data, error, loading, reload } = useLoad(async () => {
    const [ids, catalog] = await Promise.all([
      myEnrolledCourseIds(uid),
      student?.class_id ? fetchCourses({ classId: student.class_id }) : Promise.resolve([]),
    ]);
    const mine = ids.length ? await fetchCourses({ ids }) : [];
    return { ids, mine, catalog: catalog.filter((c) => c.status === 'published') };
  }, [uid, student?.class_id]);

  const subjects = useMemo(
    () => Array.from(new Set((data?.catalog ?? []).map((c) => c.subject?.name ?? ''))).sort(),
    [data],
  );

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? 'Erreur'} onRetry={reload} />;

  const available = data.catalog.filter((c) => !data.ids.includes(c.id) && (!subject || c.subject?.name === subject));

  const enroll = (courseId: string) =>
    run(async () => {
      must(await supabase.from('enrollments').upsert(
        { course_id: courseId, student_id: uid, status: 'active' }, { onConflict: 'course_id,student_id' }));
      await reload();
    }, 'Inscription réussie ! Le cours est dans « Mes cours ».');

  return (
    <>
      <PageHeader title="Mes cours" subtitle="Les cours proposés pour votre classe, toute la semaine." />
      <Tabs value={tab} onChange={setTab}
        tabs={[{ id: 'mine', label: 'Mes cours', count: data.mine.length }, { id: 'catalog', label: 'Cours disponibles', count: available.length }]} />

      {tab === 'mine' ? (
        data.mine.length ? (
          <div className="course-grid">{data.mine.map((c) => <CourseCard key={c.id} course={c} />)}</div>
        ) : (
          <Card><Empty icon="📚" title="Aucun cours suivi">
            <Button onClick={() => setTab('catalog')}>Découvrir les cours de ma classe</Button>
          </Empty></Card>
        )
      ) : (
        <>
          {!student?.class_id && (
            <div className="alert alert-info">Indiquez votre classe dans <Link to="/profil">votre profil</Link> pour voir les cours.</div>
          )}
          {subjects.length > 1 && (
            <div className="chips filter">
              <button className={`chip ${!subject ? 'on' : ''}`} onClick={() => setSubject('')}>Toutes les matières</button>
              {subjects.map((s) => (
                <button key={s} className={`chip ${subject === s ? 'on' : ''}`} onClick={() => setSubject(s)}>{s}</button>
              ))}
            </div>
          )}
          {available.length ? (
            <div className="course-grid">
              {available.map((c) => (
                <CourseCard key={c.id} course={c} footer={<Button onClick={() => void enroll(c.id)}>S’inscrire</Button>} />
              ))}
            </div>
          ) : (
            <Card><Empty icon="🔎" title="Aucun nouveau cours disponible pour le moment">
              Les intervenants publient régulièrement de nouveaux cours. Vous serez notifié.
            </Empty></Card>
          )}
        </>
      )}
    </>
  );
}
