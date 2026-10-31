import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { must, supabase } from '../lib/supabase';
import { useLoad } from '../lib/hooks';
import { COURSE_SELECT } from '../lib/queries';
import { LiveNowButton } from '../components/LiveNow';
import { COURSE_STATUS, fullName } from '../lib/format';
import type { Course } from '../lib/types';
import { Badge, Button, Card, Empty, ErrorBox, RichText, Spinner, Tabs, useAction } from '../components/ui';
import { ExercisesPanel, LessonsPanel, MaterialsPanel } from '../components/course/ContentPanels';
import {
  CourseSettingsPanel, DiscussionPanel, QuestionsPanel, SessionsPanel, StudentsPanel,
} from '../components/course/CommunityPanels';

type Tab = 'lessons' | 'materials' | 'exercises' | 'sessions' | 'questions' | 'discussion' | 'students' | 'settings';

export function CoursePage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const uid = profile!.id;
  const isAdmin = profile!.role === 'admin';
  const [tab, setTab] = useState<Tab>('lessons');
  const { run, busy } = useAction();

  const { data, error, loading, reload } = useLoad(async () => {
    const course = must(await supabase.from('courses').select(COURSE_SELECT).eq('id', id!).maybeSingle()) as unknown as Course | null;
    let enrolled = false;
    if (course && profile!.role === 'student') {
      const { data: e } = await supabase.from('enrollments').select('status').eq('course_id', course.id).eq('student_id', uid).maybeSingle();
      enrolled = e?.status === 'active';
    }
    return { course, enrolled };
  }, [id, uid]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data?.course) return <Card><Empty icon="🔒" title="Cours introuvable ou non accessible">
    <Link to="/">Retour à l’accueil</Link></Empty></Card>;

  const { course, enrolled } = data;
  const manage = isAdmin || course.instructor_id === uid;
  const hasAccess = manage || enrolled;
  const color = course.subject?.color ?? '#1f7a4d';

  const enroll = () => run(async () => {
    must(await supabase.from('enrollments').upsert({ course_id: course.id, student_id: uid, status: 'active' }, { onConflict: 'course_id,student_id' }));
    await reload();
  }, 'Bienvenue dans ce cours !');

  const leave = () => run(async () => {
    must(await supabase.from('enrollments').update({ status: 'dropped' }).eq('course_id', course.id).eq('student_id', uid));
    await reload();
  }, 'Vous avez quitté ce cours.');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'lessons', label: '📖 Leçons' },
    { id: 'materials', label: '🗂️ Supports' },
    { id: 'exercises', label: manage ? '📝 Exercices & devoirs' : '📝 Exercices' },
    { id: 'sessions', label: '📅 Séances' },
    { id: 'questions', label: '❓ Questions' },
    { id: 'discussion', label: '💬 Discussion' },
    ...(manage ? [{ id: 'students' as Tab, label: '🎒 Élèves' }, { id: 'settings' as Tab, label: '⚙️ Paramètres' }] : []),
  ];
  const panelProps = { course, manage, userId: uid };

  return (
    <>
      <header className="course-hero" style={{ ['--accent' as string]: color }}>
        <div>
          <div className="row">
            <Badge color={color}>{course.subject?.name}</Badge>
            <Badge>{course.class?.name}</Badge>
            {course.status !== 'published' && <Badge tone="warning">{COURSE_STATUS[course.status]}</Badge>}
          </div>
          <h1>{course.title}</h1>
          <p>🧑‍🏫 <Link to={`/intervenants/${course.instructor_id}`}>{fullName(course.instructor)}</Link></p>
        </div>
        {manage && <LiveNowButton courseId={course.id} label="🔴 Démarrer le direct" />}
        {profile!.role === 'student' && (
          enrolled
            ? <Button variant="ghost" onClick={() => window.confirm('Quitter ce cours ?') && void leave()}>Quitter le cours</Button>
            : <Button loading={busy} onClick={() => void enroll()}>S’inscrire à ce cours</Button>
        )}
      </header>

      {course.description && <Card><RichText text={course.description} /></Card>}

      {hasAccess ? (
        <>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          <div className="tab-panel">
            {tab === 'lessons' && <LessonsPanel {...panelProps} />}
            {tab === 'materials' && <MaterialsPanel {...panelProps} />}
            {tab === 'exercises' && <ExercisesPanel {...panelProps} />}
            {tab === 'sessions' && <SessionsPanel {...panelProps} />}
            {tab === 'questions' && <QuestionsPanel {...panelProps} />}
            {tab === 'discussion' && <DiscussionPanel {...panelProps} />}
            {tab === 'students' && manage && <StudentsPanel {...panelProps} isAdmin={isAdmin} />}
            {tab === 'settings' && manage && <CourseSettingsPanel {...panelProps} isAdmin={isAdmin} onSaved={reload} />}
          </div>
        </>
      ) : (
        <Card title="Séances prévues">
          <SessionsPanel {...panelProps} />
          {profile!.role === 'student' && <p className="muted">Inscrivez-vous pour accéder aux leçons, supports, exercices et à la discussion.</p>}
        </Card>
      )}
    </>
  );
}
