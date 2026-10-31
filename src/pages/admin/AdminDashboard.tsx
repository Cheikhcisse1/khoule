import { Link } from 'react-router-dom';
import { must, supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/hooks';
import { BarList, Card, ErrorBox, PageHeader, Spinner, StatCard } from '../../components/ui';

interface Stats {
  students: number; instructors: number; pending_instructors: number; suspended: number;
  courses_published: number; courses_draft: number; enrollments: number; upcoming_sessions: number;
  submissions_30d: number; pending_corrections: number; questions_open: number;
  students_by_class: { label: string; value: number }[];
  courses_by_subject: { label: string; value: number }[];
  weekly_activity: { week: string; submissions: number; enrollments: number }[];
}

export function AdminDashboard() {
  const { data, error, loading, reload } = useLoad(async () => must(await supabase.rpc('admin_stats')) as Stats, []);
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;
  const maxWeek = Math.max(1, ...data.weekly_activity.map((w) => Math.max(w.submissions, w.enrollments)));

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle="Vue d’ensemble de la plateforme Khoulé Éducation." />
      {data.pending_instructors > 0 && (
        <div className="alert alert-info">
          <span>🧑‍🏫 <strong>{data.pending_instructors}</strong> candidature(s) d’intervenant en attente.</span>
          <Link to="/admin/utilisateurs" className="btn btn-primary">Examiner</Link>
        </div>
      )}
      <div className="stats">
        <StatCard icon="🎒" label="Élèves actifs" value={data.students} />
        <StatCard icon="🧑‍🏫" label="Intervenants" value={data.instructors} tone="blue" hint={`${data.pending_instructors} en attente`} />
        <StatCard icon="📚" label="Cours publiés" value={data.courses_published} tone="gold" hint={`${data.courses_draft} brouillon(s)`} />
        <StatCard icon="✍️" label="Inscriptions" value={data.enrollments} tone="clay" />
        <StatCard icon="📅" label="Séances à venir" value={data.upcoming_sessions} />
        <StatCard icon="📝" label="Devoirs rendus (30 j)" value={data.submissions_30d} tone="blue" />
        <StatCard icon="✅" label="Copies à corriger" value={data.pending_corrections} tone="gold" />
        <StatCard icon="❓" label="Questions sans réponse" value={data.questions_open} tone="clay" />
      </div>

      <div className="grid-dash">
        <Card title="Élèves par classe"><BarList items={data.students_by_class} /></Card>
        <Card title="Cours publiés par matière"><BarList items={data.courses_by_subject} /></Card>
        <Card title="Activité des 8 dernières semaines" className="span-2">
          <div className="weekchart" role="img" aria-label="Devoirs rendus et inscriptions par semaine">
            {data.weekly_activity.map((w) => (
              <div key={w.week} className="weekchart-col">
                <div className="weekchart-bars">
                  <span className="wb wb-a" style={{ height: `${(w.submissions / maxWeek) * 100}%` }} title={`${w.submissions} devoirs`} />
                  <span className="wb wb-b" style={{ height: `${(w.enrollments / maxWeek) * 100}%` }} title={`${w.enrollments} inscriptions`} />
                </div>
                <span className="small muted">{w.week}</span>
              </div>
            ))}
          </div>
          <div className="legend"><span><i className="wb-a" /> Devoirs rendus</span><span><i className="wb-b" /> Inscriptions</span></div>
        </Card>
      </div>
    </>
  );
}
