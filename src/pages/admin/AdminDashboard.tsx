import { Link } from 'react-router-dom';
import { must, supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/hooks';
import { BarList, Button, Card, ErrorBox, PageHeader, Spinner, StatCard, useAction } from '../../components/ui';

interface Stats {
  students: number; instructors: number; pending_instructors: number; suspended: number;
  courses_published: number; courses_draft: number; enrollments: number; upcoming_sessions: number;
  submissions_30d: number; pending_corrections: number; questions_open: number;
  students_by_class: { label: string; value: number }[];
  courses_by_subject: { label: string; value: number }[];
  weekly_activity: { week: string; submissions: number; enrollments: number }[];
}

// Tables exportées dans la sauvegarde (l'administrateur les lit toutes grâce à la RLS)
const BACKUP_TABLES = [
  'profiles', 'students', 'instructors', 'instructor_contacts', 'instructor_availabilities', 'classes', 'subjects',
  'class_subjects', 'teaching_assignments', 'courses', 'schedules', 'course_sessions', 'enrollments', 'lessons',
  'course_materials', 'lesson_progress', 'exercises', 'assignments', 'submissions', 'corrections', 'grades',
  'questions', 'answers', 'messages', 'announcements', 'library_documents',
];

/** Télécharge toutes les données de la plateforme dans un fichier JSON daté. */
async function downloadBackup() {
  const backup: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const page = must(await supabase.from(table).select('*').range(from, from + 999)) as unknown[];
      rows.push(...page);
      if (page.length < 1000) break;
    }
    backup[table] = rows;
  }
  const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), tables: backup }, null, 1)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sauvegarde-khoule-education-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function AdminDashboard() {
  const { data, error, loading, reload } = useLoad(async () => {
    const [stats, pendingStudents] = await Promise.all([
      supabase.rpc('admin_stats').then(must),
      supabase.rpc('pending_students_count').then(must),
    ]);
    return { ...(stats as Stats), pending_students: Number(pendingStudents) };
  }, []);
  const { busy, run } = useAction();
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;
  const maxWeek = Math.max(1, ...data.weekly_activity.map((w) => Math.max(w.submissions, w.enrollments)));

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle="Vue d’ensemble de la plateforme Khoulé Éducation."
        actions={<Button variant="secondary" loading={busy} onClick={() => void run(downloadBackup,
          'Sauvegarde téléchargée. Conservez ce fichier en lieu sûr : il contient des données personnelles.')}>
          💾 Télécharger une sauvegarde</Button>} />
      {data.pending_students > 0 && (
        <div className="alert alert-info">
          <span>🎒 <strong>{data.pending_students}</strong> compte(s) élève en attente de validation.</span>
          <Link to="/admin/utilisateurs" className="btn btn-primary">Valider</Link>
        </div>
      )}
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

      <Card title="Accès rapide">
        <div className="quick-grid">
          {[
            { to: '/admin/utilisateurs', icon: '🧑‍🏫', title: 'Valider les candidatures', hint: 'Intervenants en attente', count: data.pending_instructors },
            { to: '/admin/utilisateurs', icon: '👥', title: 'Gérer les comptes', hint: 'Modifier, suspendre, rôles' },
            { to: '/admin/affectations', icon: '🧩', title: 'Affecter les intervenants', hint: 'Classes et matières' },
            { to: '/admin/cours', icon: '📚', title: 'Tous les cours', hint: 'Créer, publier, archiver' },
            { to: '/documents', icon: '📤', title: 'Documents & annales', hint: 'Déposer, consulter, supprimer' },
            { to: '/intervenant/corrections', icon: '✅', title: 'Corrections & notes', hint: 'Copies à corriger', count: data.pending_corrections },
            { to: '/questions', icon: '❓', title: 'Questions des élèves', hint: 'Sans réponse', count: data.questions_open },
            { to: '/calendrier', icon: '📅', title: 'Calendrier', hint: 'Séances de la semaine' },
            { to: '/admin/annonces', icon: '📢', title: 'Publier une annonce', hint: 'Tous, élèves, une classe…' },
            { to: '/admin/referentiel', icon: '🏫', title: 'Classes & matières', hint: 'Programme par niveau' },
            { to: '/admin/moderation', icon: '🛡️', title: 'Modération', hint: 'Questions, réponses, discussions' },
            { to: '/messages', icon: '💬', title: 'Messagerie', hint: 'Écrire à un membre' },
            { to: '/recherche', icon: '🔍', title: 'Recherche', hint: 'Cours, matières, intervenants' },
          ].map((q) => (
            <Link key={q.title} to={q.to} className="quick">
              <span className="quick-icon" aria-hidden>{q.icon}</span>
              <strong>{q.title}</strong>
              <small>{q.hint}</small>
              {q.count ? <span className="badge badge-warning">{q.count} en attente</span> : null}
            </Link>
          ))}
        </div>
      </Card>

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
