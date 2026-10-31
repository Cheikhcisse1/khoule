import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { must, supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/hooks';
import { fetchStudentWork } from '../../lib/queries';
import { formatDate, score } from '../../lib/format';
import { Badge, Card, Empty, ErrorBox, PageHeader, Progress, Spinner } from '../../components/ui';

interface ProgressRow {
  course_id: string; title: string; subject: string; color: string;
  lessons_done: number; lessons_total: number; submissions: number; assignments_total: number; average_pct: number | null;
}

export function StudentGrades() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data, error, loading, reload } = useLoad(async () => {
    const [progress, work, history] = await Promise.all([
      supabase.rpc('my_progress').then(must),
      fetchStudentWork(uid),
      supabase.from('enrollments').select('enrolled_at, status, course:courses(id,title, subject:subjects(name))')
        .eq('student_id', uid).order('enrolled_at', { ascending: false }).then(must),
    ]);
    return {
      progress: progress as ProgressRow[],
      graded: work.filter((w) => w.grade),
      history: history as unknown as { enrolled_at: string; status: string; course: { id: string; title: string; subject: { name: string } } }[],
    };
  }, [uid]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? 'Erreur'} onRetry={reload} />;

  return (
    <>
      <PageHeader title="Notes & progression" subtitle="Suivez vos résultats et votre avancement dans chaque cours." />

      <Card title="Progression par cours">
        {data.progress.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Cours</th><th>Leçons</th><th>Devoirs rendus</th><th>Moyenne</th></tr></thead>
              <tbody>
                {data.progress.map((p) => (
                  <tr key={p.course_id}>
                    <td><Link to={`/cours/${p.course_id}`}><strong>{p.title}</strong></Link><br /><span className="small muted">{p.subject}</span></td>
                    <td style={{ minWidth: 140 }}>
                      <span className="small">{p.lessons_done}/{p.lessons_total}</span>
                      <Progress value={Number(p.lessons_done)} max={Number(p.lessons_total)} />
                    </td>
                    <td>{p.submissions}/{p.assignments_total}</td>
                    <td>{p.average_pct !== null ? <Badge tone={Number(p.average_pct) >= 50 ? 'success' : 'warning'}>
                      {(Number(p.average_pct) / 5).toFixed(1)}/20</Badge> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="Aucun cours suivi" />}
      </Card>

      <Card title="Mes notes">
        {data.graded.length ? (
          <ul className="list">
            {data.graded.map((w) => (
              <li key={w.assignment.id} className="list-row">
                <div>
                  <strong>{w.assignment.exercise?.title}</strong>
                  <br /><span className="small muted">{w.assignment.course?.title} · {formatDate(w.grade!.created_at)}</span>
                  {w.correction && <p className="small clamp-2">💬 {w.correction.feedback}</p>}
                </div>
                <Badge tone={w.grade!.score / w.grade!.max_score >= 0.5 ? 'success' : 'warning'}>
                  {score(w.grade!.score, w.grade!.max_score)}
                </Badge>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Aucune note pour l’instant.</p>}
      </Card>

      <Card title="Historique de mes cours">
        {data.history.length ? (
          <ul className="list">
            {data.history.map((h) => (
              <li key={h.course.id} className="list-row">
                <Link to={`/cours/${h.course.id}`}>{h.course.title}</Link>
                <span className="small muted">{h.course.subject?.name} · inscrit le {formatDate(h.enrolled_at)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Aucun cours.</p>}
      </Card>
    </>
  );
}
