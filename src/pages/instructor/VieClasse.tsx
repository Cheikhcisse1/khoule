import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { must, supabase } from '../../lib/supabase';
import { useLoad, useRefData } from '../../lib/hooks';
import { fetchCourses } from '../../lib/queries';
import { COURSE_FORMAT, formatDate } from '../../lib/format';
import type { Course } from '../../lib/types';
import { PlanningPanel, STATUS, iso, type Status } from '../school/VieScolaire';
import { Badge, Button, Card, ConfirmButton, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, useAction } from '../../components/ui';

// Côté intervenant : planning de ses séances et appel de ses propres cours.
// La base vérifie qu'il est bien l'enseignant du cours (can_take_roll / roll_roster).

/** Emploi du temps de la semaine de l'intervenant (séances de tous ses cours). */
export function InstructorPlanning() {
  const { profile } = useAuth();
  const { data: ref } = useRefData();
  const { data, error, loading, reload } = useLoad(() => fetchCourses({ instructorId: profile!.id }), [profile!.id]);
  if (loading || !ref) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;
  const classes = ref.classes.filter((c) => data.some((x) => x.class_id === c.id));
  return (
    <>
      <PageHeader title="Planning" subtitle="Vos séances de la semaine, tous cours confondus. Programmez-les dans l’onglet « Séances » de chaque cours." />
      {data.length ? <PlanningPanel courses={data} myClasses={classes} programs={[]} />
        : <Card><Empty icon="🗓️" title="Aucun cours pour l’instant" /></Card>}
    </>
  );
}

interface Sheet { id: string; course_id: string; day: string; label: string; marks: { student_id: string; status: Status }[] }
interface RosterRow { profile_id: string; first_name: string; last_name: string }

/** Feuilles d'appel des cours de l'intervenant. */
export function InstructorRoll() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const [editing, setEditing] = useState<{ course: Course; sheet: Sheet | null } | null>(null);
  const { run } = useAction();
  const { data, error, loading, reload } = useLoad(async () => {
    const courses = await fetchCourses({ instructorId: uid });
    const sheets = courses.length
      ? must(await supabase.from('attendance_sheets').select('id, course_id, day, label, marks:attendance_marks(student_id, status)')
          .in('course_id', courses.map((c) => c.id)).order('day', { ascending: false }).order('created_at', { ascending: false }).limit(80)) as Sheet[]
      : [];
    return { courses, sheets };
  }, [uid]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;
  const course = (id: string) => data.courses.find((c) => c.id === id);
  const n = (s: Sheet, k: Status) => s.marks.filter((m) => m.status === k).length;

  return (
    <>
      <PageHeader title="Appel" subtitle="Faites l’appel de vos cours : tout le monde est présent par défaut, touchez seulement les absents et les retards." />
      {data.courses.length ? (
        <div className="course-grid" style={{ marginBottom: '1.25rem' }}>
          {data.courses.map((c) => (
            <Card key={c.id}>
              <strong>{c.title}</strong>
              <p className="small muted">{c.class?.name} · {COURSE_FORMAT[c.format ?? 'cours'] ?? ''}{c.school ? ` · 🏫 ${c.school.name}` : ''}{c.program ? ` · ${c.program.name}` : ''}</p>
              <Button onClick={() => setEditing({ course: c, sheet: null })}>📋 Faire l’appel</Button>
            </Card>
          ))}
        </div>
      ) : <Card><Empty icon="📚" title="Aucun cours pour l’instant" /></Card>}

      <h2 className="section-title">Derniers appels</h2>
      {data.sheets.length ? (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th>Date</th><th>Cours</th><th>Créneau</th><th>Présents</th><th>Absents</th><th>Retards</th><th /></tr></thead>
            <tbody>
              {data.sheets.map((s) => (
                <tr key={s.id}>
                  <td>{formatDate(s.day)}</td>
                  <td>{course(s.course_id)?.title}</td>
                  <td>{s.label || '—'}</td>
                  <td>{n(s, 'present')}</td>
                  <td>{n(s, 'absent') ? <Badge tone="danger">{n(s, 'absent')}</Badge> : 0}</td>
                  <td>{n(s, 'retard')}</td>
                  <td className="row">
                    {course(s.course_id) && <Button variant="secondary" onClick={() => setEditing({ course: course(s.course_id)!, sheet: s })}>Modifier</Button>}
                    <ConfirmButton variant="ghost" message="Supprimer cette feuille d’appel ?" onConfirm={() => void run(async () => {
                      must(await supabase.from('attendance_sheets').delete().eq('id', s.id)); await reload();
                    }, 'Feuille supprimée.')}>🗑️</ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Card><Empty icon="📋" title="Aucun appel pour l’instant" /></Card>}
      {editing && <CourseRollModal course={editing.course} sheet={editing.sheet} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}

function CourseRollModal({ course, sheet, onClose, onSaved }:
  { course: Course; sheet: Sheet | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { data: roster, error, loading } = useLoad(async () =>
    must(await supabase.rpc('roll_roster', { p_course: course.id })) as RosterRow[], [course.id]);
  const [f, setF] = useState({ day: sheet?.day ?? iso(new Date()), label: sheet?.label ?? '' });
  const [marks, setMarks] = useState<Record<string, Status>>(() => Object.fromEntries((sheet?.marks ?? []).map((m) => [m.student_id, m.status])));
  const { busy, run } = useAction();
  const statusOf = (id: string): Status => marks[id] ?? 'present';

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!roster?.length) throw new Error('Aucun élève à appeler pour ce cours.');
      const id = sheet
        ? (must(await supabase.from('attendance_sheets').update({ day: f.day, label: f.label.trim() }).eq('id', sheet.id)), sheet.id)
        : (must(await supabase.from('attendance_sheets').insert({
            school_id: course.school_id, class_id: course.class_id, program_id: course.program_id, course_id: course.id,
            day: f.day, label: f.label.trim(),
          }).select('id').single()) as { id: string }).id;
      must(await supabase.from('attendance_marks').upsert(roster.map((s) => ({ sheet_id: id, student_id: s.profile_id, status: statusOf(s.profile_id) }))));
      onClose(); await onSaved();
    }, 'Appel enregistré.');
  };

  return (
    <Modal open onClose={onClose} title={`Appel — ${course.title}`} wide>
      <form className="form" onSubmit={save}>
        <div className="grid-2">
          <Field label="Date" required><input type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} required /></Field>
          <Field label="Créneau" hint="Ex. : 8h–10h"><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} maxLength={120} /></Field>
        </div>
        {loading ? <Spinner /> : error ? <div className="alert alert-error">{error}</div> : roster?.length ? (
          <ul className="roll">
            {roster.map((s) => (
              <li key={s.profile_id}>
                <span><strong>{s.last_name.toUpperCase()}</strong> {s.first_name}</span>
                <span className="roll-choices" role="radiogroup" aria-label={`Présence de ${s.first_name} ${s.last_name}`}>
                  {(Object.keys(STATUS) as Status[]).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={statusOf(s.profile_id) === k} title={STATUS[k].label}
                      className={`roll-btn roll-${k} ${statusOf(s.profile_id) === k ? 'on' : ''}`}
                      onClick={() => setMarks((m) => ({ ...m, [s.profile_id]: k }))}>{STATUS[k].short}</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : <Empty icon="🎒" title={course.school_id ? 'Aucun élève validé dans cette classe' : 'Aucun élève inscrit à ce cours'} />}
        <p className="small muted">P = présent · A = absent · R = en retard · E = excusé</p>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy} disabled={!roster?.length}>Enregistrer l’appel ({roster?.length ?? 0})</Button>
        </div>
      </form>
    </Modal>
  );
}
