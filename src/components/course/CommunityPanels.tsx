import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { must, supabase } from '../../lib/supabase';
import { useLoad, useRefData } from '../../lib/hooks';
import { COURSE_STATUS, DAYS, formatDateTime, fromLocalInput, fullName, timeAgo, toLocalInput } from '../../lib/format';
import type { Course, CourseSession, Message, Question, Schedule } from '../../lib/types';
import { Avatar, Badge, Button, ConfirmButton, Empty, ErrorBox, Field, Modal, Progress, Spinner, useAction } from '../ui';
import { ScheduleLine, SessionItem } from '../CourseBits';
import type { PanelProps } from './ContentPanels';

// ---------------------------------------------------------------------------
// Séances et créneaux du week-end
// ---------------------------------------------------------------------------
const DAKAR_OFFSET = 'Z'; // Africa/Dakar = UTC+0 toute l'année

function jitsiLink(course: Course) {
  const slug = course.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '');
  return `https://meet.jit.si/KhouleEducation-${slug}-${Math.random().toString(36).slice(2, 8)}`;
}

export function SessionsPanel({ course, manage }: PanelProps) {
  const { data, error, loading, reload } = useLoad(async () => {
    const [sessions, schedules] = await Promise.all([
      supabase.from('course_sessions').select('*').eq('course_id', course.id).order('starts_at').then(must),
      supabase.from('schedules').select('*').eq('course_id', course.id).order('day_of_week').then(must),
    ]);
    return { sessions: sessions as CourseSession[], schedules: schedules as Schedule[] };
  }, [course.id]);
  const [editing, setEditing] = useState<Partial<CourseSession> | null>(null);
  const [slot, setSlot] = useState<Partial<Schedule> | null>(null);
  const { busy, run } = useAction();

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const now = Date.now();
  const upcoming = data.sessions.filter((s) => new Date(s.ends_at).getTime() >= now);
  const past = data.sessions.filter((s) => new Date(s.ends_at).getTime() < now).reverse();

  // Crée les séances des 4 prochaines semaines à partir des créneaux récurrents
  const generate = () => run(async () => {
    const rows: Partial<CourseSession>[] = [];
    const existing = new Set(data.sessions.map((s) => new Date(s.starts_at).toISOString()));
    for (let d = 0; d < 28; d++) {
      const day = new Date(); day.setUTCHours(0, 0, 0, 0); day.setUTCDate(day.getUTCDate() + d);
      const iso = day.toISOString().slice(0, 10);
      for (const s of data.schedules) {
        if (s.day_of_week !== day.getUTCDay() || iso < s.valid_from || (s.valid_until && iso > s.valid_until)) continue;
        const starts = new Date(`${iso}T${s.start_time.slice(0, 5)}:00${DAKAR_OFFSET}`);
        if (starts.getTime() < Date.now() || existing.has(starts.toISOString())) continue;
        rows.push({ course_id: course.id, title: `${course.title} — ${DAYS[s.day_of_week]}`, room: s.room,
          starts_at: starts.toISOString(), ends_at: new Date(`${iso}T${s.end_time.slice(0, 5)}:00${DAKAR_OFFSET}`).toISOString() });
      }
    }
    if (!rows.length) throw new Error('Aucune nouvelle séance à créer (déjà programmées ou aucun créneau).');
    must(await supabase.from('course_sessions').insert(rows));
    await reload();
  }, 'Séances des 4 prochaines semaines programmées.');

  return (
    <div className="stack">
      <div className="split">
        <section>
          <h3 className="section-title">Créneaux habituels</h3>
          {data.schedules.length ? (
            <ul className="list">
              {data.schedules.map((s) => (
                <li key={s.id} className="list-row">
                  <ScheduleLine s={s} />
                  {manage && <ConfirmButton variant="ghost" message="Supprimer ce créneau ?" onConfirm={() => void run(async () => {
                    must(await supabase.from('schedules').delete().eq('id', s.id)); await reload();
                  })}>🗑️</ConfirmButton>}
                </li>
              ))}
            </ul>
          ) : <p className="muted">Aucun créneau récurrent.</p>}
          {manage && (
            <div className="row">
              <Button variant="secondary" onClick={() => setSlot({ day_of_week: 6, start_time: '09:00', end_time: '11:00' })}>+ Créneau</Button>
              {data.schedules.length > 0 && <Button variant="ghost" loading={busy} onClick={() => void generate()}>⚡ Générer les séances (4 semaines)</Button>}
            </div>
          )}
        </section>
        <section>
          <h3 className="section-title">Prochaines séances</h3>
          {upcoming.length ? (
            <ul className="sessions">
              {upcoming.map((s) => (
                <div key={s.id}>
                  <SessionItem s={s} showCourse={false} />
                  {manage && (
                    <div className="row small-row">
                      <button className="link" onClick={() => setEditing(s)}>Modifier</button>
                      {s.status !== 'cancelled' && <button className="link" onClick={() => void run(async () => {
                        must(await supabase.from('course_sessions').update({ status: 'cancelled' }).eq('id', s.id)); await reload();
                      }, 'Séance annulée.')}>Annuler la séance</button>}
                    </div>
                  )}
                </div>
              ))}
            </ul>
          ) : <p className="muted">Aucune séance à venir.</p>}
          {manage && <Button onClick={() => setEditing({ title: course.title, room: '' })}>+ Programmer une séance</Button>}
        </section>
      </div>

      {past.length > 0 && (
        <details>
          <summary className="section-title">Séances passées ({past.length})</summary>
          <ul className="sessions">{past.map((s) => <SessionItem key={s.id} s={s} showCourse={false} />)}</ul>
        </details>
      )}

      {editing && <SessionModal course={course} session={editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {slot && (
        <Modal open onClose={() => setSlot(null)} title="Nouveau créneau récurrent">
          <form className="form" onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              must(await supabase.from('schedules').insert({ course_id: course.id, day_of_week: slot.day_of_week,
                start_time: slot.start_time, end_time: slot.end_time, room: slot.room || null }));
              setSlot(null); await reload();
            }, 'Créneau ajouté.');
          }}>
            <Field label="Jour">
              <select value={slot.day_of_week} onChange={(e) => setSlot({ ...slot, day_of_week: Number(e.target.value) })}>
                <option value={6}>Samedi</option><option value={0}>Dimanche</option>
                {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}
              </select>
            </Field>
            <div className="grid-2">
              <Field label="Début"><input type="time" value={slot.start_time} onChange={(e) => setSlot({ ...slot, start_time: e.target.value })} required /></Field>
              <Field label="Fin"><input type="time" value={slot.end_time} onChange={(e) => setSlot({ ...slot, end_time: e.target.value })} required /></Field>
            </div>
            <Field label="Salle / lieu"><input value={slot.room ?? ''} onChange={(e) => setSlot({ ...slot, room: e.target.value })} placeholder="Ex. : École de Khoulé, salle 2" /></Field>
            <div className="modal-actions"><Button type="submit" loading={busy}>Ajouter</Button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function SessionModal({ course, session, onClose, onSaved }:
  { course: Course; session: Partial<CourseSession>; onClose: () => void; onSaved: () => void }) {
  const nextSaturday = () => {
    const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); d.setHours(9, 0, 0, 0); return d;
  };
  const start0 = session.starts_at ? new Date(session.starts_at) : nextSaturday();
  const [f, setF] = useState({
    title: session.title ?? '', room: session.room ?? '', live_url: session.live_url ?? '', notes: session.notes ?? '',
    starts: toLocalInput(start0), ends: toLocalInput(session.ends_at ?? new Date(start0.getTime() + 2 * 3600000)),
    status: session.status ?? 'scheduled',
  });
  const { busy, run } = useAction();
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const row = { course_id: course.id, title: f.title, room: f.room || null, live_url: f.live_url || null, notes: f.notes || null,
        starts_at: fromLocalInput(f.starts), ends_at: fromLocalInput(f.ends), status: f.status };
      if (session.id) must(await supabase.from('course_sessions').update(row).eq('id', session.id));
      else must(await supabase.from('course_sessions').insert(row));
      onClose(); onSaved();
    }, session.id ? 'Séance modifiée.' : 'Séance programmée : les élèves sont notifiés.');
  };
  return (
    <Modal open onClose={onClose} title={session.id ? 'Modifier la séance' : 'Programmer une séance'}>
      <form className="form" onSubmit={save}>
        <Field label="Titre" required><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
        <div className="grid-2">
          <Field label="Début" required><input type="datetime-local" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} required /></Field>
          <Field label="Fin" required><input type="datetime-local" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} required /></Field>
        </div>
        <Field label="Salle / lieu"><input value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} /></Field>
        <Field label="Lien du cours en direct" hint="Jitsi, Google Meet, Zoom… (https://)">
          <div className="input-group">
            <input type="url" pattern="https://.*" value={f.live_url} onChange={(e) => setF({ ...f, live_url: e.target.value })} />
            <Button type="button" variant="secondary" onClick={() => setF({ ...f, live_url: jitsiLink(course) })}>Créer un lien Jitsi</Button>
          </div>
        </Field>
        <Field label="Remarques"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {session.id && (
          <Field label="Statut">
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as CourseSession['status'] })}>
              <option value="scheduled">Programmée</option><option value="done">Terminée</option><option value="cancelled">Annulée</option>
            </select>
          </Field>
        )}
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy}>Enregistrer</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Questions du cours
// ---------------------------------------------------------------------------
export function QuestionsPanel({ course, userId }: PanelProps) {
  const { data, error, loading, reload } = useLoad(async () =>
    must(await supabase.from('questions').select('*, author:profiles(first_name,last_name,role)')
      .eq('course_id', course.id).order('created_at', { ascending: false })) as unknown as Question[], [course.id]);
  const [f, setF] = useState({ title: '', body: '' });
  const { busy, run } = useAction();
  const navigate = useNavigate();

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const ask = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const q = must(await supabase.from('questions').insert({ course_id: course.id, author_id: userId, title: f.title, body: f.body })
        .select('id').single()) as { id: string };
      navigate(`/questions/${q.id}`);
    }, 'Question envoyée à l’intervenant.');
  };

  return (
    <div className="split">
      <section>
        <h3 className="section-title">Questions posées</h3>
        {data.length === 0 ? <Empty icon="❓" title="Aucune question pour l’instant" /> : <QuestionList questions={data} />}
      </section>
      <section>
        <h3 className="section-title">Poser une question</h3>
        <form className="form card" onSubmit={ask}>
          <Field label="Sujet" required><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} /></Field>
          <Field label="Ma question" required><textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required /></Field>
          <Button type="submit" loading={busy}>Envoyer</Button>
        </form>
      </section>
    </div>
  );
}

const Q_STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'neutral' }> = {
  open: { label: 'En attente', tone: 'warning' }, answered: { label: 'Répondue', tone: 'success' }, closed: { label: 'Fermée', tone: 'neutral' },
};

export function QuestionList({ questions, showCourse }: { questions: Question[]; showCourse?: boolean }) {
  return (
    <ul className="list">
      {questions.map((q) => (
        <li key={q.id}>
          <Link to={`/questions/${q.id}`} className="question-row">
            <div>
              <strong>{q.title}</strong>
              <span className="small muted">
                {fullName(q.author)} · {timeAgo(q.created_at)}{showCourse && q.course ? ` · ${q.course.title}` : ''}
              </span>
            </div>
            <div className="row">
              {q.is_hidden && <Badge tone="danger">Masquée</Badge>}
              <Badge tone={Q_STATUS[q.status].tone}>{Q_STATUS[q.status].label}</Badge>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Fil de discussion du cours (temps réel)
// ---------------------------------------------------------------------------
export function DiscussionPanel({ course, manage, userId }: PanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const { busy, run } = useAction();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(first_name,last_name,role)')
        .eq('course_id', course.id).order('created_at').limit(200);
      setMessages((data as unknown as Message[]) ?? []);
      setLoading(false);
    };
    void load();
    const ch = supabase.channel(`course-${course.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `course_id=eq.${course.id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [course.id]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void run(async () => {
      must(await supabase.from('messages').insert({ sender_id: userId, course_id: course.id, body: text.trim() }));
      setText('');
    });
  };

  if (loading) return <Spinner />;
  return (
    <div className="chat">
      <div className="chat-scroll">
        {messages.length === 0 && <Empty icon="💬" title="Lancez la discussion !">Échangez avec la classe et l’intervenant.</Empty>}
        {messages.map((m) => (
          <div key={m.id} className={`bubble-row ${m.sender_id === userId ? 'mine' : ''}`}>
            <Avatar person={m.sender} size={30} />
            <div className={`bubble ${m.is_hidden ? 'hidden-msg' : ''} ${m.sender?.role === 'instructor' ? 'teacher' : ''}`}>
              <span className="bubble-meta">{fullName(m.sender)}{m.sender?.role === 'instructor' && ' · Intervenant'} · {timeAgo(m.created_at)}</span>
              <p>{m.body}</p>
              {manage && (
                <button className="link small" onClick={() => void run(async () => {
                  must(await supabase.from('messages').update({ is_hidden: !m.is_hidden }).eq('id', m.id));
                })}>{m.is_hidden ? 'Rétablir' : 'Masquer'}</button>
              )}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form className="chat-input" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Écrire un message à la classe…" maxLength={4000} aria-label="Message" />
        <Button type="submit" loading={busy}>Envoyer</Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Élèves inscrits et progression (intervenant / admin)
// ---------------------------------------------------------------------------
interface ProgressRow {
  student_id: string; first_name: string; last_name: string; enrolled_at: string;
  lessons_done: number; lessons_total: number; submissions: number; assignments_total: number; average_pct: number | null;
}

export function StudentsPanel({ course }: PanelProps) {
  const { data, error, loading, reload } = useLoad(async () =>
    must(await supabase.rpc('course_progress', { p_course: course.id })) as ProgressRow[], [course.id]);
  const { run } = useAction();
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;
  if (!data.length) return <Empty icon="🎒" title="Aucun élève inscrit">Les élèves de la classe peuvent s’inscrire dès que le cours est publié.</Empty>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Élève</th><th>Leçons</th><th>Devoirs rendus</th><th>Moyenne</th><th /></tr></thead>
        <tbody>
          {data.map((s) => (
            <tr key={s.student_id}>
              <td><strong>{s.first_name} {s.last_name}</strong><br /><span className="small muted">inscrit {timeAgo(s.enrolled_at)}</span></td>
              <td style={{ minWidth: 130 }}><span className="small">{s.lessons_done}/{s.lessons_total}</span><Progress value={Number(s.lessons_done)} max={Number(s.lessons_total)} /></td>
              <td>{s.submissions}/{s.assignments_total}</td>
              <td>{s.average_pct !== null ? `${(Number(s.average_pct) / 5).toFixed(1)}/20` : '—'}</td>
              <td className="row">
                <Link className="btn btn-ghost" to={`/messages?avec=${s.student_id}`}>💬</Link>
                <ConfirmButton variant="ghost" message={`Désinscrire ${s.first_name} de ce cours ?`} onConfirm={() => void run(async () => {
                  must(await supabase.from('enrollments').delete().eq('course_id', course.id).eq('student_id', s.student_id)); await reload();
                }, 'Élève désinscrit.')}>Retirer</ConfirmButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paramètres du cours
// ---------------------------------------------------------------------------
export function CourseSettingsPanel({ course, userId, onSaved, isAdmin }: PanelProps & { onSaved: () => void; isAdmin: boolean }) {
  const { data: ref } = useRefData();
  const navigate = useNavigate();
  const { data: allowed } = useLoad(async () =>
    must(await supabase.from('teaching_assignments').select('class_id, subject_id').eq('instructor_id', course.instructor_id)) as
      { class_id: number; subject_id: number }[], [course.instructor_id]);
  const [f, setF] = useState({ title: course.title, description: course.description ?? '', status: course.status,
    pair: `${course.class_id}:${course.subject_id}` });
  const { busy, run } = useAction();

  if (!ref || !allowed) return <Spinner />;
  const pairs = isAdmin
    ? ref.classSubjects
    : allowed;
  const label = (p: { class_id: number; subject_id: number }) =>
    `${ref.classes.find((c) => c.id === p.class_id)?.code} · ${ref.subjects.find((s) => s.id === p.subject_id)?.name}`;

  const save = (e: FormEvent) => {
    e.preventDefault();
    const [class_id, subject_id] = f.pair.split(':').map(Number);
    void run(async () => {
      must(await supabase.from('courses').update({ title: f.title, description: f.description, status: f.status, class_id, subject_id }).eq('id', course.id));
      onSaved();
    }, 'Cours mis à jour.');
  };

  return (
    <form className="form narrow" onSubmit={save}>
      <Field label="Titre" required><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
      <Field label="Description"><textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <div className="grid-2">
        <Field label="Classe et matière">
          <select value={f.pair} onChange={(e) => setF({ ...f, pair: e.target.value })}>
            {pairs.map((p) => <option key={`${p.class_id}:${p.subject_id}`} value={`${p.class_id}:${p.subject_id}`}>{label(p)}</option>)}
          </select>
        </Field>
        <Field label="Statut">
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Course['status'] })}>
            {Object.entries(COURSE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <p className="small muted">Publier le cours le rend visible à tous les élèves de la classe (ils sont notifiés).</p>
      <div className="row">
        <Button type="submit" loading={busy}>Enregistrer</Button>
        <ConfirmButton variant="ghost" message="Supprimer définitivement ce cours et tout son contenu ?" onConfirm={() => void run(async () => {
          must(await supabase.from('courses').delete().eq('id', course.id));
          navigate(isAdmin ? '/admin/cours' : '/intervenant/cours');
        }, 'Cours supprimé.')}>Supprimer le cours</ConfirmButton>
      </div>
      <p className="small muted">Créé le {formatDateTime(course.created_at)} · {userId === course.instructor_id ? 'Vous êtes l’intervenant responsable.' : `Intervenant : ${fullName(course.instructor)}`}</p>
    </form>
  );
}
