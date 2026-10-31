import { useState, type FormEvent } from 'react';
import { must, supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/hooks';
import { guessKind, removeFile, uploadFile } from '../../lib/storage';
import { fetchStudentWork } from '../../lib/queries';
import { fileSize, formatDate, formatDateTime, fromLocalInput, toLocalInput } from '../../lib/format';
import type { Assignment, Course, Exercise, Lesson, Material } from '../../lib/types';
import {
  Badge, Button, ConfirmButton, Empty, ErrorBox, Field, Modal, RichText, Spinner, useAction, useToast,
} from '../ui';
import { FileLinks, FilePicker } from '../Files';
import { WorkCard } from '../StudentWork';
import { openFile } from '../../lib/storage';

export interface PanelProps {
  course: Course;
  manage: boolean;
  userId: string;
}

// ---------------------------------------------------------------------------
// Leçons
// ---------------------------------------------------------------------------
function VideoEmbed({ url }: { url: string }) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  if (yt) {
    return (
      <div className="video">
        <iframe src={`https://www.youtube-nocookie.com/embed/${yt[1]}`} title="Vidéo de la leçon" allowFullScreen
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" />
      </div>
    );
  }
  return <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">▶️ Voir la vidéo</a>;
}

export function LessonsPanel({ course, manage, userId }: PanelProps) {
  const { data, error, loading, reload } = useLoad(async () => {
    const lessons = must(await supabase.from('lessons').select('*').eq('course_id', course.id).order('position')) as Lesson[];
    const done = manage ? [] : (must(await supabase.from('lesson_progress').select('lesson_id').eq('student_id', userId)) as { lesson_id: string }[]);
    return { lessons, done: new Set(done.map((d) => d.lesson_id)) };
  }, [course.id]);
  const [edit, setEdit] = useState<Partial<Lesson> | null>(null);
  const { run } = useAction();

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const toggleDone = (l: Lesson) => run(async () => {
    if (data.done.has(l.id)) must(await supabase.from('lesson_progress').delete().eq('lesson_id', l.id).eq('student_id', userId));
    else must(await supabase.from('lesson_progress').insert({ lesson_id: l.id, student_id: userId }));
    await reload();
  });

  return (
    <div className="stack">
      {manage && (
        <div className="panel-actions">
          <Button onClick={() => setEdit({ title: '', content: '', published: true, position: data.lessons.length + 1 })}>+ Nouvelle leçon</Button>
        </div>
      )}
      {data.lessons.length === 0 && <Empty icon="📖" title="Aucune leçon pour le moment" />}
      {data.lessons.map((l, i) => (
        <details key={l.id} className="lesson" open={data.lessons.length === 1}>
          <summary>
            <span className={`lesson-num ${data.done.has(l.id) ? 'done' : ''}`}>{data.done.has(l.id) ? '✓' : i + 1}</span>
            <span className="lesson-title">{l.title}</span>
            {!l.published && <Badge tone="warning">Masquée</Badge>}
          </summary>
          <div className="lesson-body">
            <RichText text={l.content} />
            {l.video_url && <VideoEmbed url={l.video_url} />}
            <div className="row">
              {manage ? (
                <>
                  <Button variant="secondary" onClick={() => setEdit(l)}>Modifier</Button>
                  <ConfirmButton variant="ghost" message="Supprimer cette leçon ?" onConfirm={() => void run(async () => {
                    must(await supabase.from('lessons').delete().eq('id', l.id)); await reload();
                  }, 'Leçon supprimée.')}>Supprimer</ConfirmButton>
                </>
              ) : (
                <Button variant={data.done.has(l.id) ? 'ghost' : 'primary'} onClick={() => void toggleDone(l)}>
                  {data.done.has(l.id) ? '↺ Marquer comme non terminée' : '✓ J’ai terminé cette leçon'}
                </Button>
              )}
            </div>
          </div>
        </details>
      ))}
      {edit && <LessonModal lesson={edit} courseId={course.id} onClose={() => setEdit(null)} onSaved={reload} />}
    </div>
  );
}

function LessonModal({ lesson, courseId, onClose, onSaved }:
  { lesson: Partial<Lesson>; courseId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(lesson);
  const { busy, run } = useAction();
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const row = { course_id: courseId, title: f.title, content: f.content, video_url: f.video_url || null,
        published: f.published ?? true, position: Number(f.position) || 0 };
      if (lesson.id) must(await supabase.from('lessons').update(row).eq('id', lesson.id));
      else must(await supabase.from('lessons').insert(row));
      onClose();
      onSaved();
    }, 'Leçon enregistrée.');
  };
  return (
    <Modal open onClose={onClose} title={lesson.id ? 'Modifier la leçon' : 'Nouvelle leçon'} wide>
      <form className="form" onSubmit={save}>
        <div className="grid-2">
          <Field label="Titre" required><input value={f.title ?? ''} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
          <Field label="Ordre"><input type="number" value={f.position ?? 0} onChange={(e) => setF({ ...f, position: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Contenu de la leçon" hint="Texte libre ; les liens https:// deviennent cliquables.">
          <textarea rows={12} value={f.content ?? ''} onChange={(e) => setF({ ...f, content: e.target.value })} />
        </Field>
        <Field label="Lien vidéo (YouTube ou autre)" hint="Doit commencer par https://">
          <input type="url" pattern="https://.*" value={f.video_url ?? ''} onChange={(e) => setF({ ...f, video_url: e.target.value })} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={f.published ?? true} onChange={(e) => setF({ ...f, published: e.target.checked })} />
          <span>Visible par les élèves</span>
        </label>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy}>Enregistrer</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Supports pédagogiques
// ---------------------------------------------------------------------------
const KIND_ICON: Record<string, string> = { pdf: '📕', document: '📄', image: '🖼️', video: '🎬', link: '🔗' };

export function MaterialsPanel({ course, manage, userId }: PanelProps) {
  const { data, error, loading, reload } = useLoad(async () =>
    must(await supabase.from('course_materials').select('*').eq('course_id', course.id).order('created_at', { ascending: false })) as Material[],
  [course.id]);
  const [adding, setAdding] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [link, setLink] = useState({ title: '', url: '' });
  const { busy, run } = useAction();
  const toast = useToast();

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const upload = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      for (const file of files) {
        const path = await uploadFile('course-materials', course.id, file);
        must(await supabase.from('course_materials').insert({
          course_id: course.id, title: file.name.replace(/\.[^.]+$/, ''), kind: guessKind(file),
          file_path: path, size_bytes: file.size, created_by: userId,
        }));
      }
      if (link.url) {
        must(await supabase.from('course_materials').insert({
          course_id: course.id, title: link.title || link.url, kind: 'link', url: link.url, created_by: userId,
        }));
      }
      setFiles([]); setLink({ title: '', url: '' }); setAdding(false);
      await reload();
    }, 'Supports ajoutés.');
  };

  const remove = (m: Material) => run(async () => {
    must(await supabase.from('course_materials').delete().eq('id', m.id));
    if (m.file_path) await removeFile('course-materials', m.file_path);
    await reload();
  }, 'Support supprimé.');

  const open = (m: Material) => {
    if (m.url) window.open(m.url, '_blank', 'noopener');
    else if (m.file_path) openFile('course-materials', m.file_path).catch((e: Error) => toast(e.message, 'error'));
  };

  return (
    <div className="stack">
      {manage && <div className="panel-actions"><Button onClick={() => setAdding(true)}>+ Ajouter des supports</Button></div>}
      {data.length === 0 ? <Empty icon="🗂️" title="Aucun support pour ce cours" /> : (
        <ul className="materials">
          {data.map((m) => (
            <li key={m.id}>
              <button className="material" onClick={() => open(m)}>
                <span className="material-icon" aria-hidden>{KIND_ICON[m.kind]}</span>
                <span><strong>{m.title}</strong><small className="muted">{m.kind === 'link' ? 'Lien externe' : fileSize(m.size_bytes)} · {formatDate(m.created_at)}</small></span>
              </button>
              {manage && <ConfirmButton variant="ghost" message="Supprimer ce support ?" onConfirm={() => void remove(m)}>🗑️</ConfirmButton>}
            </li>
          ))}
        </ul>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Ajouter des supports">
        <form className="form" onSubmit={upload}>
          <FilePicker files={files} onChange={setFiles} accept="application/pdf,image/*,video/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.txt" />
          <p className="small muted">— ou un lien (vidéo YouTube, document en ligne…) —</p>
          <div className="grid-2">
            <Field label="Titre du lien"><input value={link.title} onChange={(e) => setLink({ ...link, title: e.target.value })} /></Field>
            <Field label="Adresse (https://…)"><input type="url" pattern="https://.*" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} /></Field>
          </div>
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Annuler</Button>
            <Button type="submit" loading={busy} disabled={!files.length && !link.url}>Ajouter</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exercices, évaluations et devoirs
// ---------------------------------------------------------------------------
export function ExercisesPanel(props: PanelProps) {
  return props.manage ? <ExercisesManage {...props} /> : <ExercisesStudent {...props} />;
}

function ExercisesStudent({ course, userId }: PanelProps) {
  const { data, error, loading, reload } = useLoad(async () => {
    const [work, exercises] = await Promise.all([
      fetchStudentWork(userId, course.id),
      supabase.from('exercises').select('*').eq('course_id', course.id).order('created_at').then(must),
    ]);
    const assigned = new Set(work.map((w) => w.assignment.exercise_id));
    return { work, practice: (exercises as Exercise[]).filter((e) => !assigned.has(e.id)) };
  }, [course.id]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;
  if (!data.work.length && !data.practice.length) return <Empty icon="📝" title="Pas encore d’exercice" />;

  return (
    <div className="stack">
      {data.work.length > 0 && <h3 className="section-title">Devoirs</h3>}
      {data.work.map((w) => <WorkCard key={w.assignment.id} work={w} userId={userId} onChange={reload} showCourse={false} />)}
      {data.practice.length > 0 && <h3 className="section-title">Exercices d’entraînement</h3>}
      {data.practice.map((ex) => (
        <details key={ex.id} className="work">
          <summary><strong>{ex.kind === 'evaluation' ? '🧪' : '✏️'} {ex.title}</strong></summary>
          <RichText text={ex.instructions} />
          {ex.attachment_path && <FileLinks bucket="course-materials" paths={[ex.attachment_path]} />}
        </details>
      ))}
    </div>
  );
}

function ExercisesManage({ course }: PanelProps) {
  const { data, error, loading, reload } = useLoad(async () => {
    const [exercises, assignments, subs] = await Promise.all([
      supabase.from('exercises').select('*').eq('course_id', course.id).order('created_at', { ascending: false }).then(must),
      supabase.from('assignments').select('*').eq('course_id', course.id).then(must),
      supabase.from('submissions').select('assignment_id, status, assignment:assignments!inner(course_id)').eq('assignment.course_id', course.id).then(must),
    ]);
    return { exercises: exercises as Exercise[], assignments: assignments as Assignment[],
      subs: subs as unknown as { assignment_id: string; status: string }[] };
  }, [course.id]);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<Exercise | null>(null);
  const { run } = useAction();

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="panel-actions"><Button onClick={() => setCreating(true)}>+ Nouvel exercice / évaluation</Button></div>
      {data.exercises.length === 0 && <Empty icon="📝" title="Aucun exercice" />}
      {data.exercises.map((ex) => {
        const asg = data.assignments.filter((a) => a.exercise_id === ex.id);
        return (
          <article key={ex.id} className="work">
            <header className="work-head">
              <div>
                <h3>{ex.kind === 'evaluation' ? '🧪 Évaluation' : '✏️ Exercice'} — {ex.title}</h3>
                <span className="small muted">Barème /{ex.max_score} · créé le {formatDate(ex.created_at)}</span>
              </div>
              <div className="row">
                <Button variant="secondary" onClick={() => setAssigning(ex)}>📅 Donner en devoir</Button>
                <ConfirmButton variant="ghost" message="Supprimer cet exercice et les devoirs associés ?" onConfirm={() => void run(async () => {
                  must(await supabase.from('exercises').delete().eq('id', ex.id)); await reload();
                }, 'Exercice supprimé.')}>🗑️</ConfirmButton>
              </div>
            </header>
            <details className="work-details"><summary>Consignes</summary><RichText text={ex.instructions} />
              {ex.attachment_path && <FileLinks bucket="course-materials" paths={[ex.attachment_path]} />}</details>
            {asg.map((a) => {
              const s = data.subs.filter((x) => x.assignment_id === a.id);
              return (
                <div key={a.id} className="assignment-line">
                  <span>📌 Devoir {a.due_at ? `à rendre le ${formatDateTime(a.due_at)}` : 'sans date limite'}</span>
                  <span className="small muted">{s.length} copie(s) · {s.filter((x) => x.status === 'submitted').length} à corriger</span>
                  <ConfirmButton variant="ghost" message="Retirer ce devoir ? Les copies seront supprimées." onConfirm={() => void run(async () => {
                    must(await supabase.from('assignments').delete().eq('id', a.id)); await reload();
                  })}>Retirer</ConfirmButton>
                </div>
              );
            })}
          </article>
        );
      })}
      {creating && <ExerciseModal courseId={course.id} onClose={() => setCreating(false)} onSaved={reload} />}
      {assigning && <AssignModal exercise={assigning} onClose={() => setAssigning(null)} onSaved={reload} />}
    </div>
  );
}

function ExerciseModal({ courseId, onClose, onSaved }: { courseId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ title: '', instructions: '', kind: 'exercise', max_score: 20, assign: true, due: '', allow_late: true });
  const [files, setFiles] = useState<File[]>([]);
  const { busy, run } = useAction();
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const attachment = files[0] ? await uploadFile('course-materials', `${courseId}/exercices`, files[0]) : null;
      const ex = must(await supabase.from('exercises').insert({
        course_id: courseId, title: f.title, instructions: f.instructions, kind: f.kind,
        max_score: Number(f.max_score), attachment_path: attachment,
      }).select().single()) as Exercise;
      if (f.assign) {
        must(await supabase.from('assignments').insert({
          course_id: courseId, exercise_id: ex.id, due_at: fromLocalInput(f.due), allow_late: f.allow_late,
        }));
      }
      onClose();
      onSaved();
    }, f.assign ? 'Devoir publié : les élèves inscrits sont notifiés.' : 'Exercice créé.');
  };
  return (
    <Modal open onClose={onClose} title="Nouvel exercice" wide>
      <form className="form" onSubmit={save}>
        <div className="grid-2">
          <Field label="Titre" required><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
          <div className="grid-2">
            <Field label="Type">
              <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                <option value="exercise">Exercice</option><option value="evaluation">Évaluation</option>
              </select>
            </Field>
            <Field label="Barème"><input type="number" min={1} max={100} value={f.max_score} onChange={(e) => setF({ ...f, max_score: Number(e.target.value) })} /></Field>
          </div>
        </div>
        <Field label="Consignes" required><textarea rows={8} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} required /></Field>
        <Field label="Fichier joint (énoncé PDF, image…)"><FilePicker files={files} onChange={setFiles} multiple={false} /></Field>
        <fieldset className="fieldset">
          <label className="check">
            <input type="checkbox" checked={f.assign} onChange={(e) => setF({ ...f, assign: e.target.checked })} />
            <span><strong>Donner en devoir</strong> aux élèves inscrits (ils pourront rendre une copie)</span>
          </label>
          {f.assign && (
            <div className="grid-2">
              <Field label="Date limite"><input type="datetime-local" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
              <label className="check"><input type="checkbox" checked={f.allow_late} onChange={(e) => setF({ ...f, allow_late: e.target.checked })} />
                <span>Accepter les copies en retard</span></label>
            </div>
          )}
        </fieldset>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy}>Créer</Button>
        </div>
      </form>
    </Modal>
  );
}

function AssignModal({ exercise, onClose, onSaved }: { exercise: Exercise; onClose: () => void; onSaved: () => void }) {
  const [due, setDue] = useState(toLocalInput(new Date(Date.now() + 7 * 86400000)));
  const [late, setLate] = useState(true);
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title={`Donner « ${exercise.title} » en devoir`}>
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          must(await supabase.from('assignments').insert({ course_id: exercise.course_id, exercise_id: exercise.id, due_at: fromLocalInput(due), allow_late: late }));
          onClose(); onSaved();
        }, 'Devoir publié.');
      }}>
        <Field label="Date limite"><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <label className="check"><input type="checkbox" checked={late} onChange={(e) => setLate(e.target.checked)} /><span>Accepter les retards</span></label>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy}>Publier le devoir</Button>
        </div>
      </form>
    </Modal>
  );
}
