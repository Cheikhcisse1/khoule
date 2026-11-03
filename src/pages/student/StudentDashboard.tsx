import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { must, supabase } from '../../lib/supabase';
import { useLoad, useRefData } from '../../lib/hooks';
import { SESSION_SELECT, fetchStudentWork, fetchUpcomingSessions, myEnrolledCourseIds } from '../../lib/queries';
import { formatDate, formatDateTime } from '../../lib/format';
import type { Announcement, CourseSession } from '../../lib/types';
import { Card, ErrorBox, PageHeader, Progress, Spinner, StatCard } from '../../components/ui';
import { DueBadge, SessionItem } from '../../components/CourseBits';
import { Icon } from '../../components/Layout';

interface ProgressRow {
  course_id: string; title: string; subject: string; color: string;
  lessons_done: number; lessons_total: number; average_pct: number | null;
}

export function StudentDashboard() {
  const { profile, student } = useAuth();
  const { data: ref } = useRefData();
  const uid = profile!.id;

  const { data, error, loading, reload } = useLoad(async () => {
    const ids = await myEnrolledCourseIds(uid);
    const nowIso = new Date().toISOString();
    const [sessions, work, progress, announcements, live] = await Promise.all([
      fetchUpcomingSessions(ids, 5),
      fetchStudentWork(uid),
      supabase.rpc('my_progress').then(must),
      supabase.from('announcements').select('*').order('pinned', { ascending: false })
        .order('published_at', { ascending: false }).limit(3).then(must),
      // Cours en direct en ce moment dans la classe de l'élève (inscrit ou non)
      supabase.from('course_sessions').select(SESSION_SELECT).lte('starts_at', new Date(Date.now() + 15 * 60000).toISOString())
        .gte('ends_at', nowIso).neq('status', 'cancelled').not('live_url', 'is', null).order('starts_at').then(must),
    ]);
    return { ids, sessions, work, progress: progress as ProgressRow[], announcements: announcements as Announcement[],
      live: live as unknown as CourseSession[] };
  }, [uid]);

  const className = ref?.classes.find((c) => c.id === student?.class_id)?.name;

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? 'Erreur'} onRetry={reload} />;

  const todo = data.work.filter((w) => !w.submission);
  const graded = data.progress.filter((p) => p.average_pct !== null);
  const avg = graded.length ? Math.round(graded.reduce((s, p) => s + Number(p.average_pct), 0) / graded.length) : null;
  const nextWork = [...todo].sort((a, b) => (a.assignment.due_at ?? '9999').localeCompare(b.assignment.due_at ?? '9999'))[0];

  // Une seule « prochaine étape » : ce que l'élève doit faire maintenant
  const next = data.ids.length === 0
    ? { icon: 'menu_book', kicker: 'Pour commencer', title: 'Choisis les cours de ta classe', to: '/eleve/cours', cta: 'Voir les cours' }
    : nextWork
      ? { icon: 'assignment', kicker: 'Ta prochaine étape', title: nextWork.assignment.exercise?.title ?? 'Devoir à rendre',
          sub: nextWork.assignment.course?.title, to: '/eleve/devoirs', cta: 'Faire le devoir', due: nextWork.assignment.due_at }
      : data.sessions[0]
        ? { icon: 'calendar_month', kicker: 'Prochaine séance', title: data.sessions[0].title,
            sub: formatDateTime(data.sessions[0].starts_at), to: '/calendrier', cta: 'Voir le calendrier' }
        : { icon: 'lightbulb', kicker: 'Tout est à jour', title: 'Une question sur une leçon ? Demande un coup de pouce.',
            to: '/assistant', cta: 'Coup de pouce' };

  return (
    <>
      <PageHeader title={`Bonjour ${profile!.first_name} 👋`} subtitle={className ? `Classe : ${className}` : 'Pensez à indiquer votre classe dans votre profil.'} />

      {data.live.map((s) => (
        <div key={s.id} className="live-banner">
          <div>
            <strong><span className="live-dot" aria-hidden />En direct : {s.title}</strong><br />
            <span className="small muted">{s.course?.subject?.name} · {s.course?.class?.code}
              {new Date(s.starts_at) > new Date() ? ' · commence bientôt' : ' · en cours'}</span>
          </div>
          <a href={s.live_url!} target="_blank" rel="noopener noreferrer" className="btn btn-live">🎥 Rejoindre le cours</a>
        </div>
      ))}

      <div className="next-step">
        <span className="next-step-icon"><Icon name={next.icon} /></span>
        <div className="next-step-text">
          <small>{next.kicker}</small>
          <strong>{next.title}</strong>
          {'sub' in next && next.sub && <span className="small muted">{next.sub}</span>}
        </div>
        {'due' in next && <DueBadge due={next.due ?? null} submitted={false} />}
        <Link to={next.to} className="btn btn-primary">{next.cta}</Link>
      </div>

      <div className="stats">
        <StatCard icon="📚" label="Cours suivis" value={data.ids.length} />
        <StatCard icon="📝" label="Devoirs à rendre" value={todo.length} tone="gold" />
        <StatCard icon="⭐" label="Moyenne générale" value={avg !== null ? `${(avg / 5).toFixed(1)}/20` : '—'} tone="clay" />
        <StatCard icon="📅" label="Prochaines séances" value={data.sessions.length} tone="blue" />
      </div>

      <div className="grid-dash">
        <Card title="Prochaines séances" actions={<Link to="/calendrier">Calendrier →</Link>}>
          {data.sessions.length ? <ul className="sessions">{data.sessions.map((s) => <SessionItem key={s.id} s={s} />)}</ul>
            : <p className="muted">Aucune séance programmée.</p>}
        </Card>

        <Card title="Devoirs à rendre" actions={<Link to="/eleve/devoirs">Tous les devoirs →</Link>}>
          {todo.length ? (
            <ul className="list">
              {todo.slice(0, 5).map((w) => (
                <li key={w.assignment.id} className="list-row">
                  <div><strong>{w.assignment.exercise?.title}</strong><br /><span className="small muted">{w.assignment.course?.title}</span></div>
                  <DueBadge due={w.assignment.due_at} submitted={false} />
                </li>
              ))}
            </ul>
          ) : <p className="muted">Rien à rendre, bravo ! 🎉</p>}
        </Card>

        <Card title="Ma progression" actions={<Link to="/eleve/notes">Détails →</Link>}>
          {data.progress.length ? (
            <ul className="list">
              {data.progress.map((p) => (
                <li key={p.course_id} className="progress-row">
                  <Link to={`/cours/${p.course_id}`}><strong>{p.title}</strong></Link>
                  <span className="small muted">{p.subject} · {p.lessons_done}/{p.lessons_total} leçons</span>
                  <Progress value={Number(p.lessons_done)} max={Number(p.lessons_total)} />
                </li>
              ))}
            </ul>
          ) : <p className="muted">Inscrivez-vous à un cours pour suivre votre progression.</p>}
        </Card>

        <Card title="Annonces" actions={<Link to="/annonces">Toutes →</Link>}>
          {data.announcements.length ? (
            <ul className="list">
              {data.announcements.map((a) => (
                <li key={a.id}><strong>{a.pinned ? '📌 ' : ''}{a.title}</strong><p className="small clamp-2">{a.body}</p>
                  <span className="small muted">{formatDate(a.published_at)}</span></li>
              ))}
            </ul>
          ) : <p className="muted">Aucune annonce.</p>}
        </Card>
      </div>
    </>
  );
}
