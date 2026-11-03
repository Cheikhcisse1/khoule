import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { must, supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/hooks';
import { formatDate, fullName } from '../../lib/format';
import { STAFF_TITLES, isHigher } from '../../lib/schools';
import type { Course, PersonName, SchoolProgram, SchoolStaff, Student } from '../../lib/types';
import { PrintSheet } from '../../components/ReportCards';
import { Badge, Button, Card, ConfirmButton, Empty, ErrorBox, Field, Modal, Spinner, StatCard, useAction } from '../../components/ui';

// Vie scolaire d'un établissement partenaire : planning, liste d'appel, suivi de l'élève, administratif.
// Les droits sont vérifiés par la base (can_take_roll, staff_sees_student…) : l'écran ne fait qu'afficher.

export type SchoolStudent = Student & { profile: PersonName & { status: string } };
export interface ClassRef { id: number; code: string; name: string }
export interface StudentGrade { student_id: string; score: number; max_score: number; course: { title: string; subject: { name: string } | null } | null }

export type Status = 'present' | 'absent' | 'retard' | 'excuse';
export const STATUS: Record<Status, { label: string; short: string; tone: 'success' | 'danger' | 'warning' | 'info' }> = {
  present: { label: 'Présent', short: 'P', tone: 'success' },
  absent: { label: 'Absent', short: 'A', tone: 'danger' },
  retard: { label: 'En retard', short: 'R', tone: 'warning' },
  excuse: { label: 'Excusé', short: 'E', tone: 'info' },
};
interface Mark { student_id: string; status: Status; note: string | null }
interface Sheet { id: string; class_id: number; program_id: string | null; course_id: string | null; day: string; label: string; marks: Mark[] }

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const on20 = (g: StudentGrade) => (Number(g.score) / Number(g.max_score)) * 20;
const fmt20 = (v: number | null) => (v == null ? '—' : `${(Math.round(v * 10) / 10).toString().replace('.', ',')}/20`);

// ---------------------------------------------------------------------------
// Planning : emploi du temps de la semaine, construit à partir des séances des cours.
// La direction (canEdit) y place les créneaux de chaque professeur ; le professeur les voit dans son menu Planning.
// Heures en heure de Dakar (UTC+0, sans changement d'heure) : les dates sont manipulées en UTC.
interface PlannedSession {
  id: string; title: string; starts_at: string; ends_at: string; room: string | null; status: string;
  course: { id: string; title: string; class_id: number; program_id: string | null; instructor_id: string; subject: { name: string; color: string | null } | null } | null;
}
const DAY_MS = 86400000;
const mondayUtc = (d: Date) => { const x = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); return new Date(x - ((new Date(x).getUTCDay() + 6) % 7) * DAY_MS); };
const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const hhmm = (d: string) => new Date(d).toISOString().slice(11, 16);

export function PlanningPanel({ courses, myClasses, programs, canEdit = false }:
  { courses: Course[]; myClasses: ClassRef[]; programs: SchoolProgram[]; canEdit?: boolean }) {
  const [start, setStart] = useState(() => mondayUtc(new Date()));
  const [classId, setClassId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [editing, setEditing] = useState<PlannedSession | 'new' | null>(null);
  const end = new Date(start.getTime() + 7 * DAY_MS);
  const ids = courses.map((c) => c.id);
  const { data, error, loading, reload } = useLoad(async () => (ids.length
    ? must(await supabase.from('course_sessions')
        .select('id, title, starts_at, ends_at, room, status, course:courses(id, title, class_id, program_id, instructor_id, subject:subjects(name,color))')
        .in('course_id', ids).gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at')) as unknown as PlannedSession[]
    : []), [start.getTime(), ids.join(',')]);

  // Professeurs des cours de l'établissement
  const teachers = [...new Map(courses.map((c) => [c.instructor_id, c.instructor])).entries()]
    .map(([id, person]) => ({ id, name: fullName(person) })).sort((a, b) => a.name.localeCompare(b.name));
  const list = (data ?? []).filter((x) => (!classId || String(x.course?.class_id) === classId) && (!teacherId || x.course?.instructor_id === teacherId));
  const className = (id?: number) => myClasses.find((c) => c.id === id)?.code ?? '';
  const teacherName = (id?: string) => teachers.find((t) => t.id === id)?.name ?? '';

  return (
    <>
      <div className="toolbar">
        <div className="row">
          <Button variant="ghost" onClick={() => setStart(new Date(start.getTime() - 7 * DAY_MS))}>← Semaine précédente</Button>
          <strong>Semaine du {formatDate(start)}</strong>
          <Button variant="ghost" onClick={() => setStart(new Date(start.getTime() + 7 * DAY_MS))}>Semaine suivante →</Button>
        </div>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Classe">
          <option value="">Toutes les classes</option>
          {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {canEdit && teachers.length > 1 && (
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} aria-label="Professeur">
            <option value="">Tous les professeurs</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {canEdit && <Button onClick={() => setEditing('new')} disabled={!courses.length}>+ Ajouter un créneau</Button>}
      </div>
      {loading ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : (
        <div className="timetable">
          {DAYS.map((day, i) => {
            const d = new Date(start.getTime() + i * DAY_MS);
            const items = list.filter((x) => dayKey(x.starts_at) === dayKey(d));
            return (
              <section key={day} className={`tt-day ${dayKey(d) === dayKey(new Date()) ? 'today' : ''}`}>
                <h3>{day} <span className="muted small">{d.getUTCDate()}/{d.getUTCMonth() + 1}</span></h3>
                {items.length ? items.map((x) => {
                  const body = (
                    <>
                      <strong>{hhmm(x.starts_at)}–{hhmm(x.ends_at)}</strong>
                      <span>{x.course?.subject?.name ?? x.course?.title}</span>
                      <small>{className(x.course?.class_id)}{x.course?.program_id ? ` · ${programs.find((pr) => pr.id === x.course?.program_id)?.name ?? ''}` : ''}{x.room ? ` · ${x.room}` : ''}</small>
                      {canEdit && <small>{teacherName(x.course?.instructor_id)}</small>}
                    </>
                  );
                  const props = { className: `tt-slot ${x.status === 'cancelled' ? 'cancelled' : ''}`, style: { ['--accent' as string]: x.course?.subject?.color ?? '#188038' } };
                  return canEdit
                    ? <button key={x.id} type="button" {...props} onClick={() => setEditing(x)} title="Modifier ce créneau">{body}</button>
                    : <Link key={x.id} to={`/cours/${x.course?.id}`} {...props}>{body}</Link>;
                }) : <p className="muted small">—</p>}
              </section>
            );
          })}
        </div>
      )}
      <p className="small muted">{canEdit
        ? 'Ajoutez les créneaux de chaque professeur : ils apparaissent dans son planning et celui des élèves du cours. Touchez un créneau pour le modifier.'
        : 'Votre planning est préparé par la direction de l’établissement et par vous-même (onglet « Séances » de chaque cours).'}</p>
      {editing && (
        <SlotModal slot={editing === 'new' ? null : editing} courses={courses} teachers={teachers} defaultDay={dayKey(start)}
          onClose={() => setEditing(null)} onSaved={reload} />
      )}
    </>
  );
}

function SlotModal({ slot, courses, teachers, defaultDay, onClose, onSaved }: {
  slot: PlannedSession | null; courses: Course[]; teachers: { id: string; name: string }[]; defaultDay: string;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [f, setF] = useState({
    teacher: slot?.course?.instructor_id ?? teachers[0]?.id ?? '', course_id: slot?.course?.id ?? '',
    day: slot ? dayKey(slot.starts_at) : defaultDay, from: slot ? hhmm(slot.starts_at) : '08:00', to: slot ? hhmm(slot.ends_at) : '10:00',
    room: slot?.room ?? '', weeks: '1', cancelled: slot?.status === 'cancelled',
  });
  const { busy, run } = useAction();
  const del = useAction();
  const mine = courses.filter((c) => c.instructor_id === f.teacher);
  const course = courses.find((c) => c.id === f.course_id);
  const at = (day: string, t: string) => `${day}T${t}:00Z`;

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!course) throw new Error('Choisissez le cours.');
      if (f.to <= f.from) throw new Error('L’heure de fin doit être après l’heure de début.');
      if (slot) {
        must(await supabase.from('course_sessions').update({
          starts_at: at(f.day, f.from), ends_at: at(f.day, f.to), room: f.room.trim() || null,
          status: f.cancelled ? 'cancelled' : 'scheduled',
        }).eq('id', slot.id));
      } else {
        const n = Math.min(Math.max(Number(f.weeks) || 1, 1), 20);
        const base = new Date(`${f.day}T00:00:00Z`).getTime();
        must(await supabase.from('course_sessions').insert(Array.from({ length: n }, (_, i) => {
          const day = dayKey(new Date(base + i * 7 * DAY_MS));
          return { course_id: course.id, title: course.title, starts_at: at(day, f.from), ends_at: at(day, f.to), room: f.room.trim() || null, status: 'scheduled' };
        })));
      }
      onClose(); await onSaved();
    }, slot ? 'Créneau modifié.' : 'Créneau ajouté au planning du professeur.');
  };

  return (
    <Modal open onClose={onClose} title={slot ? 'Modifier le créneau' : 'Ajouter un créneau'}>
      <form className="form" onSubmit={save}>
        {!slot && (
          <div className="grid-2">
            <Field label="Professeur" required>
              <select value={f.teacher} onChange={(e) => setF({ ...f, teacher: e.target.value, course_id: '' })} required>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Cours" required>
              <select value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value })} required>
                <option value="">Choisir…</option>
                {mine.map((c) => <option key={c.id} value={c.id}>{c.title} · {c.class?.code}</option>)}
              </select>
            </Field>
          </div>
        )}
        {slot && <p><strong>{slot.course?.title}</strong> · {teachers.find((t) => t.id === slot.course?.instructor_id)?.name}</p>}
        <div className="grid-2">
          <Field label={slot ? 'Date' : 'Première date'} required><input type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} required /></Field>
          <Field label="Salle"><input value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} placeholder="Ex. : Salle 3, Amphi A" /></Field>
          <Field label="Début" required><input type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} required /></Field>
          <Field label="Fin" required><input type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} required /></Field>
          {!slot && (
            <Field label="Répéter chaque semaine" hint="Nombre de semaines (1 = une seule fois, 20 au plus)">
              <input type="number" min={1} max={20} value={f.weeks} onChange={(e) => setF({ ...f, weeks: e.target.value })} />
            </Field>
          )}
        </div>
        {slot && (
          <label className="check"><input type="checkbox" checked={f.cancelled} onChange={(e) => setF({ ...f, cancelled: e.target.checked })} />
            <span>Séance annulée (reste visible, barrée)</span></label>
        )}
        <p className="small muted">Heure de Dakar. Le professeur est prévenu par une notification.</p>
        <div className="modal-actions">
          {slot && (
            <ConfirmButton variant="ghost" message="Supprimer ce créneau ?" onConfirm={() => void del.run(async () => {
              must(await supabase.from('course_sessions').delete().eq('id', slot.id)); onClose(); await onSaved();
            }, 'Créneau supprimé.')}>Supprimer</ConfirmButton>
          )}
          {slot && <Link className="btn btn-ghost" to={`/cours/${slot.course?.id}`}>Ouvrir le cours</Link>}
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy}>{slot ? 'Enregistrer' : 'Ajouter'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Liste d'appel
export function RollPanel({ st, students, myClasses, programs, courses }:
  { st: SchoolStaff; students: SchoolStudent[]; myClasses: ClassRef[]; programs: SchoolProgram[]; courses: Course[] }) {
  const higher = isHigher(st.school?.kind);
  const { data, error, loading, reload } = useLoad(async () =>
    must(await supabase.from('attendance_sheets').select('id, class_id, program_id, course_id, day, label, marks:attendance_marks(student_id, status, note)')
      .eq('school_id', st.school_id).order('day', { ascending: false }).order('created_at', { ascending: false }).limit(60)) as Sheet[], [st.school_id]);
  const [editing, setEditing] = useState<Sheet | 'new' | null>(null);
  const { run } = useAction();

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;
  const code = (id: number) => myClasses.find((c) => c.id === id)?.name ?? '';
  const count = (s: Sheet, k: Status) => s.marks.filter((m) => m.status === k).length;

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
        <p className="muted" style={{ margin: 0 }}>Faites l’appel en quelques clics : tout le monde est « présent » par défaut, touchez seulement les absents et les retards.</p>
        <Button onClick={() => setEditing('new')} disabled={!myClasses.length}>+ Faire l’appel</Button>
      </div>
      {data.length ? (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th>Date</th><th>{higher ? 'Niveau' : 'Classe'}</th><th>Créneau</th><th>Présents</th><th>Absents</th><th>Retards</th><th /></tr></thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td>{formatDate(s.day)}</td>
                  <td>{code(s.class_id)}{s.program_id ? <span className="small muted"> · {programs.find((p) => p.id === s.program_id)?.name}</span> : ''}</td>
                  <td>{s.label || '—'}</td>
                  <td>{count(s, 'present')}</td>
                  <td>{count(s, 'absent') ? <Badge tone="danger">{count(s, 'absent')}</Badge> : 0}</td>
                  <td>{count(s, 'retard')}</td>
                  <td className="row">
                    <Button variant="secondary" onClick={() => setEditing(s)}>Modifier</Button>
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
      {editing && (
        <RollModal st={st} sheet={editing === 'new' ? null : editing} students={students} myClasses={myClasses}
          programs={programs} courses={courses} onClose={() => setEditing(null)} onSaved={reload} />
      )}
    </>
  );
}

function RollModal({ st, sheet, students, myClasses, programs, courses, onClose, onSaved }: {
  st: SchoolStaff; sheet: Sheet | null; students: SchoolStudent[]; myClasses: ClassRef[]; programs: SchoolProgram[];
  courses: Course[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const higher = isHigher(st.school?.kind);
  const firstClass = myClasses.find((c) => students.some((s) => s.class_id === c.id)) ?? myClasses[0];
  const [f, setF] = useState({
    class_id: String(sheet?.class_id ?? firstClass?.id ?? ''), program_id: sheet?.program_id ?? '',
    course_id: sheet?.course_id ?? '', day: sheet?.day ?? iso(new Date()), label: sheet?.label ?? '',
  });
  const [marks, setMarks] = useState<Record<string, Status>>(() => Object.fromEntries((sheet?.marks ?? []).map((m) => [m.student_id, m.status])));
  const { busy, run } = useAction();

  const roster = students.filter((s) => String(s.class_id) === f.class_id && (!f.program_id || s.program_id === f.program_id))
    .sort((a, b) => a.profile.last_name.localeCompare(b.profile.last_name));
  const classCourses = courses.filter((c) => String(c.class_id) === f.class_id);
  const statusOf = (id: string): Status => marks[id] ?? 'present';
  const absents = roster.filter((s) => statusOf(s.profile_id) === 'absent').length;

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!roster.length) throw new Error('Aucun élève validé dans cette classe.');
      const fields = { class_id: Number(f.class_id), program_id: f.program_id || null, course_id: f.course_id || null, day: f.day, label: f.label.trim() };
      const id = sheet
        ? (must(await supabase.from('attendance_sheets').update(fields).eq('id', sheet.id)), sheet.id)
        : (must(await supabase.from('attendance_sheets').insert({ school_id: st.school_id, ...fields }).select('id').single()) as { id: string }).id;
      must(await supabase.from('attendance_marks').upsert(
        roster.map((s) => ({ sheet_id: id, student_id: s.profile_id, status: statusOf(s.profile_id) })),
      ));
      onClose(); await onSaved();
    }, `Appel enregistré : ${roster.length - absents} présent(s), ${absents} absent(s).`);
  };

  return (
    <Modal open onClose={onClose} title={sheet ? 'Modifier l’appel' : 'Faire l’appel'} wide>
      <form className="form" onSubmit={save}>
        <div className="grid-2">
          <Field label={higher ? 'Niveau' : 'Classe'} required>
            <select value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value, program_id: '', course_id: '' })} disabled={!!sheet}>
              {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Date" required><input type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} required /></Field>
          {higher && programs.length > 0 && (
            <Field label="Filière">
              <select value={f.program_id} onChange={(e) => setF({ ...f, program_id: e.target.value })} disabled={!!sheet}>
                <option value="">Toutes les filières</option>
                {programs.filter((p) => !p.class_ids.length || p.class_ids.includes(Number(f.class_id))).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Cours (facultatif)">
            <select value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value })}>
              <option value="">—</option>
              {classCourses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </Field>
          <Field label="Créneau" hint="Ex. : 8h–10h Mathématiques"><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} maxLength={120} /></Field>
        </div>
        {roster.length ? (
          <ul className="roll">
            {roster.map((s) => (
              <li key={s.profile_id}>
                <span><strong>{s.profile.last_name.toUpperCase()}</strong> {s.profile.first_name}</span>
                <span className="roll-choices" role="radiogroup" aria-label={`Présence de ${fullName(s.profile)}`}>
                  {(Object.keys(STATUS) as Status[]).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={statusOf(s.profile_id) === k} title={STATUS[k].label}
                      className={`roll-btn roll-${k} ${statusOf(s.profile_id) === k ? 'on' : ''}`}
                      onClick={() => setMarks((m) => ({ ...m, [s.profile_id]: k }))}>{STATUS[k].short}</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : <Empty icon="🎒" title="Aucun élève validé dans cette classe" />}
        <p className="small muted">P = présent · A = absent · R = en retard · E = excusé</p>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy} disabled={!roster.length}>Enregistrer l’appel ({roster.length})</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Suivi de l'élève : notes, assiduité, observations de l'équipe
const FOLLOW_KINDS: Record<string, { label: string; tone: 'info' | 'success' | 'danger' | 'warning' }> = {
  observation: { label: 'Observation', tone: 'info' },
  encouragement: { label: 'Encouragement', tone: 'success' },
  avertissement: { label: 'Avertissement', tone: 'danger' },
  convocation: { label: 'Convocation des parents', tone: 'warning' },
};

export function FollowupModal({ st, student, grades, className, onClose }:
  { st: SchoolStaff; student: SchoolStudent; grades: StudentGrade[]; className: string; onClose: () => void }) {
  const sid = student.profile_id;
  const { data, error, loading, reload } = useLoad(async () => {
    const [marks, notes] = await Promise.all([
      supabase.from('attendance_marks').select('status, note, sheet:attendance_sheets(day, label)').eq('student_id', sid).then(must),
      supabase.from('student_followups').select('id, kind, body, created_at, author:profiles(first_name,last_name)')
        .eq('student_id', sid).order('created_at', { ascending: false }).then(must),
    ]);
    return {
      marks: marks as unknown as { status: Status; note: string | null; sheet: { day: string; label: string } | null }[],
      notes: notes as unknown as { id: string; kind: string; body: string; created_at: string; author: PersonName | null }[],
    };
  }, [sid]);
  const [f, setF] = useState({ kind: 'observation', body: '' });
  const { busy, run } = useAction();

  const mine = grades.filter((g) => g.student_id === sid);
  const bySubject = new Map<string, number[]>();
  for (const g of mine) {
    const k = g.course?.subject?.name ?? g.course?.title ?? 'Autre';
    bySubject.set(k, [...(bySubject.get(k) ?? []), on20(g)]);
  }
  const subjects = [...bySubject.entries()].map(([name, xs]) => ({ name, n: xs.length, avg: xs.reduce((a, b) => a + b, 0) / xs.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const general = subjects.length ? subjects.reduce((t, x) => t + x.avg, 0) / subjects.length : null;

  const add = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      must(await supabase.from('student_followups').insert({ school_id: st.school_id, student_id: sid, kind: f.kind, body: f.body.trim() }));
      setF({ kind: 'observation', body: '' });
      await reload();
    }, 'Note de suivi ajoutée.');
  };

  return (
    <Modal open onClose={onClose} title={`Suivi de ${fullName(student.profile)}`} wide>
      <p className="muted">{className}{student.birth_year ? ` · né(e) en ${student.birth_year}` : ''}
        {student.guardian_name ? ` · tuteur : ${student.guardian_name}${student.guardian_phone ? ` (${student.guardian_phone})` : ''}` : ''}</p>
      {loading ? <Spinner /> : error || !data ? <ErrorBox error={error ?? ''} onRetry={reload} /> : (() => {
        const n = (k: Status) => data.marks.filter((m) => m.status === k).length;
        const rate = data.marks.length ? Math.round(((n('present') + n('retard')) / data.marks.length) * 100) : null;
        return (
          <div className="stack">
            <div className="stats">
              <StatCard icon="📈" label="Moyenne générale" value={fmt20(general)} />
              <StatCard icon="✅" label="Assiduité" value={rate == null ? '—' : `${rate} %`} tone="blue" hint={`${data.marks.length} appel(s)`} />
              <StatCard icon="🚫" label="Absences" value={n('absent')} tone="clay" hint={`${n('excuse')} excusée(s)`} />
              <StatCard icon="⏰" label="Retards" value={n('retard')} tone="gold" />
            </div>
            <div className="split">
              <Card title="Notes par matière">
                {subjects.length ? (
                  <ul className="list">{subjects.map((x) => (
                    <li key={x.name} className="list-row"><span><strong>{x.name}</strong> <span className="small muted">· {x.n} note(s)</span></span><strong>{fmt20(x.avg)}</strong></li>
                  ))}</ul>
                ) : <p className="muted">Aucune note.</p>}
              </Card>
              <Card title="Absences et retards">
                {data.marks.filter((m) => m.status !== 'present').length ? (
                  <ul className="list">{data.marks.filter((m) => m.status !== 'present')
                    .sort((a, b) => (b.sheet?.day ?? '').localeCompare(a.sheet?.day ?? '')).slice(0, 12).map((m, i) => (
                      <li key={i} className="list-row"><span>{m.sheet ? formatDate(m.sheet.day) : ''} {m.sheet?.label ? <span className="small muted">· {m.sheet.label}</span> : ''}</span>
                        <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge></li>
                    ))}</ul>
                ) : <p className="muted">Aucune absence ni retard. 👏</p>}
              </Card>
            </div>
            <Card title="Observations de l’équipe" actions={<span className="small muted">Visibles uniquement par la direction</span>}>
              <form className="inline-form" onSubmit={add}>
                <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Type">
                  {Object.entries(FOLLOW_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <input value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required minLength={2} maxLength={2000}
                  placeholder="Ex. : progrès nets en mathématiques, à encourager" aria-label="Observation" />
                <Button type="submit" loading={busy}>Ajouter</Button>
              </form>
              {data.notes.length ? (
                <ul className="list" style={{ marginTop: '.75rem' }}>{data.notes.map((x) => (
                  <li key={x.id}>
                    <Badge tone={FOLLOW_KINDS[x.kind]?.tone ?? 'info'}>{FOLLOW_KINDS[x.kind]?.label ?? x.kind}</Badge>{' '}
                    <span className="small muted">{formatDate(x.created_at)} · {fullName(x.author)}</span>
                    <p style={{ margin: '.25rem 0 0' }}>{x.body}</p>
                  </li>
                ))}</ul>
              ) : <p className="muted small">Aucune observation.</p>}
            </Card>
          </div>
        );
      })()}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Administratif : registre des inscrits, export, certificats de scolarité
export function AdminPanel({ st, students, cls, programs, onFollow }: {
  st: SchoolStaff; students: SchoolStudent[]; cls: (id: number | null) => ClassRef | undefined;
  programs: SchoolProgram[]; onFollow: (s: SchoolStudent) => void;
}) {
  const { profile } = useAuth();
  const higher = isHigher(st.school?.kind);
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  const [print, setPrint] = useState<SchoolStudent[] | null>(null);
  const list = students.filter((s) => (!classId || String(s.class_id) === classId) && fullName(s.profile).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.profile.last_name.localeCompare(b.profile.last_name));
  const prog = (id: string | null) => programs.find((p) => p.id === id)?.name ?? '';
  const classes = [...new Map(students.map((s) => [s.class_id, cls(s.class_id)])).values()].filter(Boolean) as ClassRef[];
  const year = (() => { const d = new Date(); const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${y + 1}`; })();

  const exportCsv = () => {
    const cell = (v: unknown) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const rows = [['Nom', 'Prénom', higher ? 'Niveau' : 'Classe', ...(higher ? ['Filière'] : []), 'Année de naissance', 'Téléphone', 'Parent / tuteur', 'Lien', 'Téléphone tuteur', 'E-mail tuteur', 'Accord tuteur']];
    for (const s of list) rows.push([s.profile.last_name, s.profile.first_name, cls(s.class_id)?.name ?? '', ...(higher ? [prog(s.program_id)] : []),
      String(s.birth_year ?? ''), s.phone ?? '', s.guardian_name ?? '', s.guardian_relation ?? '', s.guardian_phone ?? '', s.guardian_email ?? '', s.guardian_consent ? 'oui' : 'non']);
    const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `registre-${(st.school?.name ?? 'ecole').replace(/[^\p{L}\p{N}]+/gu, '-')}.csv`;
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  return (
    <>
      <div className="toolbar">
        <input placeholder="Rechercher un nom…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Classe">
          <option value="">Toutes les classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button variant="secondary" onClick={exportCsv} disabled={!list.length}>Exporter le registre (CSV)</Button>
        <Button variant="secondary" onClick={() => setPrint(list)} disabled={!list.length}>Certificats de scolarité ({list.length})</Button>
      </div>
      {list.length ? (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th>Nom</th><th>{higher ? 'Niveau' : 'Classe'}</th>{higher && <th>Filière</th>}<th>Naissance</th><th>Parent / tuteur</th><th /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.profile_id}>
                  <td><strong>{s.profile.last_name.toUpperCase()}</strong> {s.profile.first_name}</td>
                  <td>{cls(s.class_id)?.name}</td>
                  {higher && <td>{prog(s.program_id) || '—'}</td>}
                  <td>{s.birth_year ?? '—'}</td>
                  <td className="small">{s.guardian_name ?? '—'}{s.guardian_phone ? ` · ${s.guardian_phone}` : ''}</td>
                  <td className="row">
                    <Button variant="secondary" onClick={() => onFollow(s)}>Suivi</Button>
                    <Button variant="ghost" onClick={() => setPrint([s])}>Certificat</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Card><Empty icon="🗂️" title="Aucun inscrit validé" /></Card>}
      <p className="small muted">Registre des {higher ? 'étudiants' : 'élèves'} validés de l’établissement. Données personnelles : à ne partager qu’avec l’équipe.</p>

      {print && (
        <PrintSheet onDone={() => setPrint(null)}>
          {print.map((s) => (
            <section key={s.profile_id} className="report-card certificate">
              <header className="rc-head">
                <div><strong className="rc-school">{st.school?.name}</strong><span>{st.school?.city ?? ''}</span></div>
                <div className="rc-title"><strong>Certificat de scolarité</strong><span>Année {year}</span></div>
              </header>
              <p className="cert-body">
                Je soussigné(e), <strong>{fullName(profile)}</strong>, {(STAFF_TITLES[st.title] ?? 'responsable').toLowerCase()} de <strong>{st.school?.name}</strong>,
                certifie que <strong>{s.profile.last_name.toUpperCase()} {s.profile.first_name}</strong>
                {s.birth_year ? <>, né(e) en {s.birth_year},</> : ''} est régulièrement inscrit(e) en <strong>{cls(s.class_id)?.name}</strong>
                {higher && s.program_id ? <>, filière <strong>{prog(s.program_id)}</strong>,</> : ''} au titre de l’année {year}.
              </p>
              <p className="cert-body">Le présent certificat est délivré à l’intéressé(e) pour servir et valoir ce que de droit.</p>
              <p className="cert-place">Fait à {st.school?.city || '…………………'}, le {new Date().toLocaleDateString('fr-FR')}</p>
              <div className="rc-sign"><div /><div><span>Signature et cachet de la direction</span><div className="rc-box" /></div></div>
              <footer className="rc-foot">Document édité depuis Khoulé Éducation</footer>
            </section>
          ))}
        </PrintSheet>
      )}
    </>
  );
}
