import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { must, supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/hooks';
import { uploadFile } from '../../lib/storage';
import { formatDateTime, fullName, score } from '../../lib/format';
import type { Correction, Grade, PersonName, Submission } from '../../lib/types';
import { Badge, Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, RichText, Spinner, Tabs, useAction } from '../../components/ui';
import { FileLinks, FilePicker } from '../../components/Files';
import { correctionText, preCorrect } from '../../lib/ai';

interface Row extends Submission {
  student: PersonName;
  assignment: {
    id: string; due_at: string | null; course_id: string;
    exercise: { title: string; max_score: number; instructions: string };
    course: { id: string; title: string; instructor_id: string };
  };
}

export function Corrections() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const [tab, setTab] = useState<'submitted' | 'corrected'>('submitted');
  const [current, setCurrent] = useState<Row | null>(null);

  const { data, error, loading, reload } = useLoad(async () => {
    let q = supabase.from('submissions')
      .select('*, student:profiles(first_name,last_name), assignment:assignments!inner(id, due_at, course_id, exercise:exercises(title,max_score,instructions), course:courses!inner(id,title,instructor_id))')
      .order('submitted_at', { ascending: false }).limit(300);
    if (profile!.role !== 'admin') q = q.eq('assignment.course.instructor_id', uid);
    return must(await q) as unknown as Row[];
  }, [uid]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;
  const list = data.filter((s) => s.status === tab);

  return (
    <>
      <PageHeader title="Corrections" subtitle="Corrigez les devoirs rendus et attribuez une note : l’élève est notifié." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'submitted', label: 'À corriger', count: data.filter((s) => s.status === 'submitted').length },
        { id: 'corrected', label: 'Corrigés', count: data.filter((s) => s.status === 'corrected').length },
      ]} />
      {list.length ? (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th>Élève</th><th>Devoir</th><th>Rendu</th><th /></tr></thead>
            <tbody>
              {list.map((s) => {
                const late = s.assignment.due_at && new Date(s.submitted_at) > new Date(s.assignment.due_at);
                return (
                  <tr key={s.id}>
                    <td><strong>{fullName(s.student)}</strong></td>
                    <td>{s.assignment.exercise.title}<br /><Link className="small" to={`/cours/${s.assignment.course.id}`}>{s.assignment.course.title}</Link></td>
                    <td>{formatDateTime(s.submitted_at)} {late && <Badge tone="danger">En retard</Badge>}</td>
                    <td><Button variant={tab === 'submitted' ? 'primary' : 'secondary'} onClick={() => setCurrent(s)}>
                      {tab === 'submitted' ? 'Corriger' : 'Revoir'}</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Card><Empty icon={tab === 'submitted' ? '🎉' : '📭'} title={tab === 'submitted' ? 'Aucune copie en attente' : 'Aucune copie corrigée'} /></Card>
      )}
      {current && <GradeModal row={current} userId={uid} onClose={() => setCurrent(null)} onSaved={reload} />}
    </>
  );
}

function GradeModal({ row, userId, onClose, onSaved }: { row: Row; userId: string; onClose: () => void; onSaved: () => void }) {
  const max = Number(row.assignment.exercise.max_score);
  const { data, loading } = useLoad(async () => {
    const [c, g] = await Promise.all([
      supabase.from('corrections').select('*').eq('submission_id', row.id).maybeSingle().then(must),
      supabase.from('grades').select('*').eq('submission_id', row.id).maybeSingle().then(must),
    ]);
    return { correction: c as Correction | null, grade: g as Grade | null };
  }, [row.id]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [value, setValue] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const { busy, run } = useAction();

  const [aiNote, setAiNote] = useState<string | null>(null);
  const ai = useAction();

  const fb = feedback ?? data?.correction?.feedback ?? '';
  // Pré-correction Stylo Rouge : remplit la note et les commentaires, l'intervenant relit avant d'enregistrer.
  const runAi = () => void ai.run(async () => {
    const r = await preCorrect(row.id);
    const n = Math.min(max, Math.max(0, Math.round(Number(r.result.note) * 2) / 2));
    setValue(String(n));
    setFeedback(correctionText(r.result));
    setAiNote(`Proposition de Stylo Rouge (confiance ${r.result.confiance ?? 'moyenne'}) : relisez et ajustez avant d'enregistrer.`
      + (r.skipped_files ? ` ${r.skipped_files} fichier(s) non lu(s) par l'IA (PDF ou trop lourd) : vérifiez-les vous-même.` : ''));
  });
  const sc = value ?? (data?.grade ? String(data.grade.score) : '');

  const save = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(sc.replace(',', '.'));
    if (Number.isNaN(n) || n < 0 || n > max) return void run(async () => { throw new Error(`La note doit être comprise entre 0 et ${max}.`); });
    void run(async () => {
      const file_path = files[0] ? await uploadFile('corrections', row.id, files[0]) : data?.correction?.file_path ?? null;
      must(await supabase.from('corrections').upsert(
        { submission_id: row.id, instructor_id: userId, feedback: fb.trim() || 'Corrigé.', file_path }, { onConflict: 'submission_id' }));
      must(await supabase.from('grades').upsert({
        submission_id: row.id, score: n, max_score: max, student_id: row.student_id,
        course_id: row.assignment.course_id, assignment_id: row.assignment_id,
      }, { onConflict: 'submission_id' }));
      onClose(); onSaved();
    }, 'Correction enregistrée, l’élève est notifié.');
  };

  return (
    <Modal open onClose={onClose} title={`${row.assignment.exercise.title} — ${fullName(row.student)}`} wide>
      {loading ? <Spinner /> : (
        <div className="split">
          <section>
            <h3 className="section-title">Copie de l’élève</h3>
            <div className="work-block">
              {row.content ? <RichText text={row.content} /> : <p className="muted">Pas de texte.</p>}
              <FileLinks bucket="submissions" paths={row.file_paths} />
            </div>
            <details><summary className="small">Consignes</summary><RichText text={row.assignment.exercise.instructions} /></details>
          </section>
          <form className="form" onSubmit={save}>
            <div className="ai-box">
              <Button type="button" variant="secondary" loading={ai.busy} onClick={runAi}>🖍️ Pré-corriger avec Stylo Rouge</Button>
              <span className="small muted">{aiNote ?? 'L’IA lit la consigne, le texte et les photos de la copie, puis propose une note et des commentaires. Rien n’est envoyé à l’élève sans votre validation.'}</span>
            </div>
            <Field label={`Note sur ${max}`} required>
              <input inputMode="decimal" value={sc} onChange={(e) => setValue(e.target.value)} required placeholder={`0 – ${max}`} />
            </Field>
            <Field label="Commentaires / correction" required>
              <textarea rows={8} value={fb} onChange={(e) => setFeedback(e.target.value)} required />
            </Field>
            <Field label="Copie annotée (facultatif)"><FilePicker files={files} onChange={setFiles} multiple={false} /></Field>
            {data?.correction?.file_path && <FileLinks bucket="corrections" paths={[data.correction.file_path]} />}
            {data?.grade && <p className="small muted">Note actuelle : {score(data.grade.score, data.grade.max_score)}</p>}
            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
              <Button type="submit" loading={busy}>Enregistrer la correction</Button>
            </div>
          </form>
        </div>
      )}
    </Modal>
  );
}
