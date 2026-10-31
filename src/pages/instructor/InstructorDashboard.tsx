import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { must, supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/hooks';
import { fetchUpcomingSessions } from '../../lib/queries';
import { COURSE_STATUS } from '../../lib/format';
import { Badge, Card, Empty, ErrorBox, PageHeader, Spinner, StatCard } from '../../components/ui';
import { SessionItem } from '../../components/CourseBits';
import { AvailabilityList, fetchAvailabilities } from '../../components/Availability';
import { LiveControl, LiveNowButton, fetchMyLiveSessions } from '../../components/LiveNow';

export interface CourseStat {
  course_id: string; title: string; class_code: string; subject: string; status: string;
  students: number; lessons: number; assignments: number; pending_submissions: number; open_questions: number; average_pct: number | null;
}

export function InstructorDashboard() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data, error, loading, reload } = useLoad(async () => {
    const stats = must(await supabase.rpc('instructor_course_stats')) as CourseStat[];
    const mine = stats.map((s) => s.course_id);
    const [sessions, assignments, availabilities, live] = await Promise.all([
      fetchUpcomingSessions(mine, 5),
      supabase.from('teaching_assignments').select('class:classes(code), subject:subjects(name)').eq('instructor_id', uid).then(must),
      fetchAvailabilities(uid),
      fetchMyLiveSessions(uid),
    ]);
    return { stats, sessions, availabilities, live,
      assignments: assignments as unknown as { class: { code: string }; subject: { name: string } }[] };
  }, [uid]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;
  const sum = (k: keyof CourseStat) => data.stats.reduce((s, c) => s + Number(c[k] ?? 0), 0);

  return (
    <>
      <PageHeader title={`Bonjour ${profile!.first_name} 👋`} subtitle="Merci de contribuer à la réussite des élèves de Khoulé."
        actions={<>
          {data.assignments.length > 0 && <LiveNowButton onStarted={reload} />}
          <Link to="/documents" className="btn btn-secondary">📤 Déposer un document / une annale</Link>
          <Link to="/intervenant/cours" className="btn btn-primary">+ Nouveau cours</Link>
        </>} />
      <LiveControl sessions={data.live} onEnded={reload} />
      {data.stats.length === 0 && data.assignments.length > 0 && (
        <div className="alert alert-info">
          <span><strong>Pour commencer :</strong> déposez vos annales et fiches dans <Link to="/documents">Documents & annales</Link>,
            ou créez un cours pour publier leçons, supports, exercices et séances.</span>
        </div>
      )}

      <div className="stats">
        <StatCard icon="📚" label="Cours" value={data.stats.length} />
        <StatCard icon="🎒" label="Élèves suivis" value={sum('students')} tone="blue" />
        <StatCard icon="✅" label="Copies à corriger" value={sum('pending_submissions')} tone="gold" />
        <StatCard icon="❓" label="Questions en attente" value={sum('open_questions')} tone="clay" />
      </div>

      <div className="grid-dash">
        <Card title="Mes cours" actions={<Link to="/intervenant/cours">Gérer →</Link>}>
          {data.stats.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Cours</th><th>Élèves</th><th>À corriger</th><th>Moyenne</th></tr></thead>
                <tbody>
                  {data.stats.map((c) => (
                    <tr key={c.course_id}>
                      <td><Link to={`/cours/${c.course_id}`}><strong>{c.title}</strong></Link><br />
                        <span className="small muted">{c.class_code} · {c.subject}</span>{' '}
                        {c.status !== 'published' && <Badge tone="warning">{COURSE_STATUS[c.status]}</Badge>}</td>
                      <td>{c.students}</td>
                      <td>{c.pending_submissions > 0 ? <Badge tone="warning">{c.pending_submissions}</Badge> : '0'}</td>
                      <td>{c.average_pct !== null ? `${(Number(c.average_pct) / 5).toFixed(1)}/20` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty icon="📚" title="Vous n’avez pas encore de cours"><Link to="/intervenant/cours">Créer mon premier cours</Link></Empty>}
        </Card>

        <Card title="Prochaines séances" actions={<Link to="/calendrier">Calendrier →</Link>}>
          {data.sessions.length ? <ul className="sessions">{data.sessions.map((s) => <SessionItem key={s.id} s={s} />)}</ul>
            : <p className="muted">Aucune séance programmée.</p>}
        </Card>

        <Card title="Mes affectations">
          {data.assignments.length ? (
            <div className="chips">{data.assignments.map((a, i) => <span key={i} className="chip on">{a.class.code} · {a.subject.name}</span>)}</div>
          ) : <p className="muted">L’administration ne vous a pas encore affecté de classe. Vous serez notifié.</p>}
        </Card>

        <Card title="📆 Mes disponibilités" actions={<Link to="/profil#disponibilites">Modifier →</Link>}>
          {data.availabilities.length ? <AvailabilityList slots={data.availabilities} />
            : <p className="muted">Indiquez vos créneaux libres dans la semaine pour que l’administration puisse planifier vos cours.
              <br /><Link to="/profil#disponibilites">Ajouter mes disponibilités</Link></p>}
        </Card>
      </div>
    </>
  );
}
