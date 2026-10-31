import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { must, supabase } from '../lib/supabase';
import { useLoad } from '../lib/hooks';
import { fetchCourses } from '../lib/queries';
import { INSTRUCTOR_TYPES, fullName } from '../lib/format';
import type { Instructor, Profile } from '../lib/types';
import { Avatar, Badge, Card, Empty, ErrorBox, RichText, Spinner } from '../components/ui';
import { CourseCard } from '../components/CourseBits';

export function InstructorPublicPage() {
  const { id } = useParams();
  const { profile: me } = useAuth();
  const { data, error, loading, reload } = useLoad(async () => {
    const [p, i, courses, subjects] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id!).maybeSingle().then(must),
      supabase.from('instructors').select('*').eq('profile_id', id!).maybeSingle().then(must),
      fetchCourses({ instructorId: id! }),
      supabase.from('instructor_subjects').select('subject:subjects(name,color)').eq('instructor_id', id!).then(must),
    ]);
    return { p: p as Profile | null, i: i as Instructor | null, courses: courses.filter((c) => c.status === 'published'),
      subjects: subjects as unknown as { subject: { name: string; color: string } }[] };
  }, [id]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data?.p) return <Card><Empty icon="🔒" title="Profil introuvable" /></Card>;

  return (
    <div className="narrow-page">
      <Card>
        <div className="qa-head">
          <Avatar person={data.p} size={64} />
          <div>
            <h1 className="qa-title">{fullName(data.p)}</h1>
            {data.i && <span className="muted">{INSTRUCTOR_TYPES[data.i.instructor_type]}{data.i.specialty ? ` · ${data.i.specialty}` : ''}</span>}
          </div>
          {me?.id !== data.p.id && <Link to={`/messages?avec=${data.p.id}`} className="btn btn-secondary">💬 Écrire</Link>}
        </div>
        {data.i?.bio && <RichText text={data.i.bio} />}
        <div className="chips">{data.subjects.map((s) => <Badge key={s.subject.name} color={s.subject.color}>{s.subject.name}</Badge>)}</div>
      </Card>
      <h2 className="section-title">Cours proposés</h2>
      {data.courses.length ? <div className="course-grid">{data.courses.map((c) => <CourseCard key={c.id} course={c} />)}</div>
        : <p className="muted">Aucun cours publié visible.</p>}
    </div>
  );
}
