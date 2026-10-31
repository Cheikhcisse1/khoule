import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { must, supabase } from '../lib/supabase';
import { useLoad, useRefData } from '../lib/hooks';
import { fileSize, formatDate, fullName } from '../lib/format';
import { openFile, removeFile, uploadFile } from '../lib/storage';
import type { PersonName } from '../lib/types';
import {
  Badge, Button, Card, ConfirmButton, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, useAction, useToast,
} from '../components/ui';
import { FilePicker } from '../components/Files';

export const DOC_KINDS: Record<string, { label: string; icon: string }> = {
  annale: { label: 'Annale / sujet d’examen', icon: '📜' },
  corrige: { label: 'Corrigé', icon: '✅' },
  cours: { label: 'Cours', icon: '📘' },
  exercices: { label: 'Exercices', icon: '✏️' },
  fiche: { label: 'Fiche de révision', icon: '🗒️' },
  autre: { label: 'Autre', icon: '📄' },
};

interface LibraryDoc {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  class_id: number;
  subject_id: number;
  year: number | null;
  file_path: string | null;
  url: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
  author?: PersonName | null;
}

interface Pair { class_id: number; subject_id: number }

export function LibraryPage() {
  const { profile, student } = useAuth();
  const role = profile!.role;
  const { data: ref } = useRefData();
  const [classId, setClassId] = useState(role === 'student' ? String(student?.class_id ?? '') : '');
  const [subjectId, setSubjectId] = useState('');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(false);
  const { run } = useAction();
  const toast = useToast();

  const { data, error, loading, reload } = useLoad(async () => {
    const [docs, pairs] = await Promise.all([
      supabase.from('library_documents').select('*, author:profiles(first_name,last_name)')
        .order('created_at', { ascending: false }).limit(500).then(must),
      role === 'instructor'
        ? supabase.from('teaching_assignments').select('class_id, subject_id').eq('instructor_id', profile!.id).then(must)
        : Promise.resolve([]),
    ]);
    return { docs: docs as unknown as LibraryDoc[], pairs: pairs as Pair[] };
  }, [profile!.id]);

  const canUpload = role === 'admin' || (role === 'instructor' && (data?.pairs.length ?? 0) > 0);
  const uploadPairs: Pair[] = role === 'admin' ? (ref?.classSubjects ?? []) : (data?.pairs ?? []);

  const list = useMemo(() => (data?.docs ?? []).filter((d) =>
    (!classId || String(d.class_id) === classId) && (!subjectId || String(d.subject_id) === subjectId)
    && (!kind || d.kind === kind)
    && (!q || `${d.title} ${d.description ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [data, classId, subjectId, kind, q]);

  if (loading || !ref) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const cls = (id: number) => ref.classes.find((c) => c.id === id);
  const sub = (id: number) => ref.subjects.find((s) => s.id === id);

  const open = (d: LibraryDoc) => {
    if (d.url) window.open(d.url, '_blank', 'noopener');
    else if (d.file_path) openFile('library', d.file_path).catch((e: Error) => toast(e.message, 'error'));
  };

  const remove = (d: LibraryDoc) => run(async () => {
    must(await supabase.from('library_documents').delete().eq('id', d.id));
    if (d.file_path) await removeFile('library', d.file_path);
    await reload();
  }, 'Document supprimé.');

  return (
    <>
      <PageHeader title="Documents & annales"
        subtitle={role === 'student'
          ? 'Annales, corrigés, fiches et exercices déposés par les intervenants pour votre classe.'
          : 'Déposez des annales, corrigés, fiches et exercices pour les classes qui vous sont affectées.'}
        actions={canUpload && <Button onClick={() => setUploading(true)}>📤 Déposer un document</Button>} />

      {role === 'instructor' && !canUpload && (
        <div className="alert alert-info">Vous pourrez déposer des documents dès que l’administration vous aura affecté une classe et une matière.</div>
      )}

      <div className="toolbar">
        <input placeholder="Rechercher un titre…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        {role !== 'student' && (
          <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Classe">
            <option value="">Toutes les classes</option>
            {ref.classes.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        )}
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Matière">
          <option value="">Toutes les matières</option>
          {ref.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
          <option value="">Tous les types</option>
          {Object.entries(DOC_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {list.length === 0 ? (
        <Card><Empty icon="📚" title="Aucun document pour le moment">
          {canUpload ? 'Cliquez sur « Déposer un document » pour partager une annale ou une fiche.' : 'Les intervenants y déposeront annales, corrigés et fiches de révision.'}
        </Empty></Card>
      ) : (
        <ul className="materials">
          {list.map((d) => (
            <li key={d.id}>
              <button className="material" onClick={() => open(d)}>
                <span className="material-icon" aria-hidden>{DOC_KINDS[d.kind]?.icon ?? '📄'}</span>
                <span>
                  <strong>{d.title}{d.year ? ` (${d.year})` : ''}</strong>
                  <small className="muted">
                    {sub(d.subject_id)?.name} · {cls(d.class_id)?.code} · {DOC_KINDS[d.kind]?.label}
                    {d.size_bytes ? ` · ${fileSize(d.size_bytes)}` : d.url ? ' · Lien' : ''} · {formatDate(d.created_at)}
                    {d.author ? ` · ${fullName(d.author)}` : ''}
                  </small>
                  {d.description && <small>{d.description}</small>}
                </span>
              </button>
              {(role === 'admin' || d.uploaded_by === profile!.id) && (
                <ConfirmButton variant="ghost" message={`Supprimer « ${d.title} » ?`} onConfirm={() => void remove(d)} aria-label="Supprimer">🗑️</ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {uploading && (
        <UploadModal pairs={uploadPairs} userId={profile!.id} onClose={() => setUploading(false)}
          onDone={() => { setUploading(false); void reload(); }} />
      )}
    </>
  );
}

function UploadModal({ pairs, userId, onClose, onDone }:
  { pairs: Pair[]; userId: string; onClose: () => void; onDone: () => void }) {
  const { data: ref } = useRefData();
  const [f, setF] = useState({
    title: '', description: '', kind: 'annale', year: '', url: '',
    classId: pairs[0] ? String(pairs[0].class_id) : '', subjectId: pairs[0] ? String(pairs[0].subject_id) : '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const { busy, run } = useAction();
  if (!ref) return null;

  const classes = ref.classes.filter((c) => pairs.some((p) => p.class_id === c.id));
  const subjects = ref.subjects.filter((s) => pairs.some((p) => p.class_id === Number(f.classId) && p.subject_id === s.id));

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!files.length && !f.url) throw new Error('Ajoutez un fichier ou un lien.');
      if (!f.classId || !f.subjectId) throw new Error('Choisissez la classe et la matière.');
      const base = { description: f.description || null, kind: f.kind, class_id: Number(f.classId),
        subject_id: Number(f.subjectId), year: f.year ? Number(f.year) : null, uploaded_by: userId };
      // Plusieurs fichiers = plusieurs documents (le titre est complété par le nom du fichier)
      for (const file of files) {
        const path = await uploadFile('library', `${f.classId}/${f.subjectId}`, file);
        const name = file.name.replace(/\.[^.]+$/, '');
        must(await supabase.from('library_documents').insert({
          ...base, title: files.length > 1 || !f.title ? (f.title ? `${f.title} — ${name}` : name) : f.title,
          file_path: path, size_bytes: file.size,
        }));
      }
      if (f.url) {
        must(await supabase.from('library_documents').insert({ ...base, title: f.title || f.url, url: f.url }));
      }
      onDone();
    }, 'Document publié : les élèves de la classe sont notifiés.');
  };

  return (
    <Modal open onClose={onClose} title="Déposer un document" wide>
      <form className="form" onSubmit={save}>
        <div className="grid-2">
          <Field label="Classe" required>
            <select value={f.classId} onChange={(e) => {
              const first = pairs.find((p) => p.class_id === Number(e.target.value));
              setF({ ...f, classId: e.target.value, subjectId: first ? String(first.subject_id) : '' });
            }} required>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </Field>
          <Field label="Matière" required>
            <select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })} required>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Type de document">
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {Object.entries(DOC_KINDS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
          </Field>
          <Field label="Année" hint="Ex. : 2024 pour une annale du BFEM ou du Bac 2024">
            <input type="number" min={1980} max={2100} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} />
          </Field>
        </div>
        <Field label="Titre" hint="Facultatif si vous déposez des fichiers : le nom du fichier sera utilisé.">
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex. : Bac S2 — Mathématiques, 1er groupe" />
        </Field>
        <Field label="Description"><textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Fichiers" hint="PDF, Word, images… jusqu’à 50 Mo par fichier. Vous pouvez en sélectionner plusieurs.">
          <FilePicker files={files} onChange={setFiles} accept="application/pdf,image/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.txt" />
        </Field>
        <p className="small muted">— ou un lien (Google Drive, YouTube…) —</p>
        <Field label="Lien (https://…)"><input type="url" pattern="https://.*" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
        <div className="modal-actions">
          <Badge>{files.length} fichier(s)</Badge>
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy}>Publier</Button>
        </div>
      </form>
    </Modal>
  );
}
