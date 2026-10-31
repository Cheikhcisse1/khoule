import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { must, supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/hooks';
import { fetchCourses } from '../../lib/queries';
import type { Course } from '../../lib/types';
import { Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, useAction } from '../../components/ui';
import { CourseCard } from '../../components/CourseBits';

interface Pair { class_id: number; subject_id: number; class: { code: string; name: string }; subject: { name: string } }

export function InstructorCourses() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const [open, setOpen] = useState(false);

  const { data, error, loading, reload } = useLoad(async () => {
    const [courses, pairs] = await Promise.all([
      fetchCourses({ instructorId: uid }),
      supabase.from('teaching_assignments').select('class_id, subject_id, class:classes(code,name), subject:subjects(name)')
        .eq('instructor_id', uid).then(must),
    ]);
    return { courses, pairs: pairs as unknown as Pair[] };
  }, [uid]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  return (
    <>
      <PageHeader title="Mes cours" subtitle="Créez vos cours puis publiez-les pour les rendre visibles aux élèves de la classe."
        actions={<Button onClick={() => setOpen(true)} disabled={!data.pairs.length}>+ Nouveau cours</Button>} />
      {!data.pairs.length && (
        <div className="alert alert-info">Vous pourrez créer des cours dès que l’administration vous aura affecté une classe et une matière.</div>
      )}
      {data.courses.length ? (
        <div className="course-grid">{data.courses.map((c) => <CourseCard key={c.id} course={c} />)}</div>
      ) : (
        <Card><Empty icon="📚" title="Aucun cours pour l’instant" /></Card>
      )}
      {open && <NewCourseModal pairs={data.pairs} instructorId={uid} onClose={() => setOpen(false)} />}
    </>
  );
}

export function NewCourseModal({ pairs, instructorId, onClose }:
  { pairs: Pair[]; instructorId: string; onClose: () => void }) {
  const [f, setF] = useState({ title: '', description: '', pair: pairs[0] ? `${pairs[0].class_id}:${pairs[0].subject_id}` : '', publish: false });
  const { busy, run } = useAction();
  const navigate = useNavigate();

  const save = (e: FormEvent) => {
    e.preventDefault();
    const [class_id, subject_id] = f.pair.split(':').map(Number);
    void run(async () => {
      const c = must(await supabase.from('courses').insert({
        title: f.title, description: f.description, class_id, subject_id, instructor_id: instructorId,
        status: f.publish ? 'published' : 'draft',
      }).select('id').single()) as Pick<Course, 'id'>;
      navigate(`/cours/${c.id}`);
    }, 'Cours créé. Ajoutez maintenant vos leçons et supports.');
  };

  return (
    <Modal open onClose={onClose} title="Nouveau cours">
      <form className="form" onSubmit={save}>
        <Field label="Classe et matière" required>
          <select value={f.pair} onChange={(e) => setF({ ...f, pair: e.target.value })} required>
            {pairs.map((p) => (
              <option key={`${p.class_id}:${p.subject_id}`} value={`${p.class_id}:${p.subject_id}`}>{p.class.name} · {p.subject.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Titre du cours" required>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} placeholder="Ex. : Les fractions — révisions" />
        </Field>
        <Field label="Description" hint="Objectifs, prérequis, matériel à apporter…">
          <textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={f.publish} onChange={(e) => setF({ ...f, publish: e.target.checked })} />
          <span>Publier immédiatement (les élèves de la classe seront notifiés)</span>
        </label>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy}>Créer le cours</Button>
        </div>
      </form>
    </Modal>
  );
}
