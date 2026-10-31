import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { must, supabase } from '../lib/supabase';
import { uploadFile } from '../lib/storage';
import { formatDateTime, isPast, score } from '../lib/format';
import type { StudentWork } from '../lib/queries';
import { Badge, Button, Field, Modal, RichText, useAction } from './ui';
import { FileLinks, FilePicker } from './Files';
import { DueBadge } from './CourseBits';

/** Carte d'un devoir côté élève : consignes, copie, correction, note. */
export function WorkCard({ work, userId, onChange, showCourse = true }:
  { work: StudentWork; userId: string; onChange: () => void; showCourse?: boolean }) {
  const { assignment: a, submission, correction, grade } = work;
  const [open, setOpen] = useState(false);
  const ex = a.exercise;
  const locked = submission?.status === 'corrected';
  const closed = !a.allow_late && isPast(a.due_at);

  return (
    <article className="work">
      <header className="work-head">
        <div>
          <h3>{ex?.kind === 'evaluation' ? '🧪 ' : '📝 '}{ex?.title}</h3>
          {showCourse && a.course && <Link to={`/cours/${a.course.id}`} className="small">{a.course.title}</Link>}
        </div>
        <div className="work-badges">
          {grade && <Badge tone="success">Note : {score(grade.score, grade.max_score)}</Badge>}
          {submission && !grade && <Badge tone="info">Rendu le {formatDateTime(submission.submitted_at)}</Badge>}
          <DueBadge due={a.due_at} submitted={Boolean(submission)} />
        </div>
      </header>

      <details className="work-details">
        <summary>Consignes {ex?.max_score ? `· barème /${ex.max_score}` : ''}</summary>
        <RichText text={ex?.instructions ?? ''} />
        {ex?.attachment_path && <FileLinks bucket="course-materials" paths={[ex.attachment_path]} />}
      </details>

      {submission && (
        <div className="work-block">
          <strong className="small">Ma copie</strong>
          <RichText text={submission.content} />
          <FileLinks bucket="submissions" paths={submission.file_paths} />
        </div>
      )}
      {correction && (
        <div className="work-block correction">
          <strong className="small">✅ Correction de l’intervenant</strong>
          <RichText text={correction.feedback} />
          {correction.file_path && <FileLinks bucket="corrections" paths={[correction.file_path]} />}
        </div>
      )}

      {!locked && (
        <div className="work-actions">
          {closed && !submission ? (
            <span className="muted small">La date limite est dépassée.</span>
          ) : (
            <Button variant={submission ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>
              {submission ? 'Modifier ma copie' : 'Rendre mon devoir'}
            </Button>
          )}
        </div>
      )}

      <SubmitModal open={open} onClose={() => setOpen(false)} work={work} userId={userId} onDone={onChange} />
    </article>
  );
}

function SubmitModal({ open, onClose, work, userId, onDone }:
  { open: boolean; onClose: () => void; work: StudentWork; userId: string; onDone: () => void }) {
  const [content, setContent] = useState(work.submission?.content ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const { busy, run } = useAction();
  const a = work.assignment;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const existing = work.submission?.file_paths ?? [];
      if (!content.trim() && !files.length && !existing.length) throw new Error('Écrivez une réponse ou ajoutez un fichier.');
      const paths: string[] = [];
      for (const f of files) paths.push(await uploadFile('submissions', `${userId}/${a.id}`, f));
      if (work.submission) {
        must(await supabase.from('submissions').update({ content: content.trim() || null, file_paths: [...existing, ...paths] })
          .eq('id', work.submission.id));
      } else {
        must(await supabase.from('submissions').insert({
          assignment_id: a.id, student_id: userId, content: content.trim() || null, file_paths: paths,
        }));
      }
      setFiles([]);
      onClose();
      onDone();
    }, 'Devoir envoyé ! Votre intervenant a été prévenu.');
  };

  return (
    <Modal open={open} onClose={onClose} title={`Rendre : ${a.exercise?.title ?? 'devoir'}`}>
      <form className="form" onSubmit={submit}>
        <Field label="Ma réponse" hint="Vous pouvez écrire directement ou joindre une photo / un PDF de votre copie.">
          <textarea rows={7} value={content} onChange={(e) => setContent(e.target.value)} />
        </Field>
        {work.submission?.file_paths.length ? (
          <div><span className="small muted">Fichiers déjà envoyés :</span><FileLinks bucket="submissions" paths={work.submission.file_paths} /></div>
        ) : null}
        <FilePicker files={files} onChange={setFiles} accept="image/*,application/pdf,.doc,.docx,.odt,.txt" />
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy}>Envoyer</Button>
        </div>
      </form>
    </Modal>
  );
}
