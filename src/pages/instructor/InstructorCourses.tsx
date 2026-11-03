import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { must, supabase } from '../../lib/supabase';
import { useLoad, useRefData } from '../../lib/hooks';
import { useMySchools } from '../../lib/schools';
import { fetchCourses } from '../../lib/queries';
import type { Course, SchoolProgram } from '../../lib/types';
import { Button, Card, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, useAction } from '../../components/ui';
import { COURSE_FORMAT } from '../../lib/format';
import { CourseCard } from '../../components/CourseBits';

interface Pair { class_id: number; subject_id: number; class: { code: string; name: string }; subject: { name: string } }
/** Université / école supérieure où le professeur a été inscrit par la direction */
interface TeacherSchool { school_id: string; school: { name: string } | null }

export function InstructorCourses() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const [open, setOpen] = useState(false);
  const { data: mySchools } = useMySchools(uid);

  const { data, error, loading, reload } = useLoad(async () => {
    const [courses, pairs, schools] = await Promise.all([
      fetchCourses({ instructorId: uid }),
      supabase.from('teaching_assignments').select('class_id, subject_id, class:classes(code,name), subject:subjects(name)')
        .eq('instructor_id', uid).then(must),
      supabase.from('school_teachers').select('school_id, school:schools(name)').eq('user_id', uid).then(must),
    ]);
    return { courses, pairs: pairs as unknown as Pair[], schools: schools as unknown as TeacherSchool[] };
  }, [uid]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  return (
    <>
      <PageHeader title="Mes cours" subtitle="Créez vos cours puis publiez-les pour les rendre visibles aux élèves de la classe."
        actions={<Button onClick={() => setOpen(true)} disabled={!data.pairs.length && !data.schools.length}>+ Nouveau cours</Button>} />
      {data.schools.length > 0 && (
        <p className="small muted">Vous enseignez aussi à : {data.schools.map((s) => s.school?.name).join(', ')}. Choisissez l’établissement et la filière en créant le cours.</p>
      )}
      {!data.pairs.length && !data.schools.length && !mySchools?.length && (
        <div className="alert alert-info">Vous pourrez créer des cours dès que l’administration vous aura affecté une classe et une matière.</div>
      )}
      {data.courses.length ? (
        <div className="course-grid">{data.courses.map((c) => <CourseCard key={c.id} course={c} />)}</div>
      ) : (
        <Card><Empty icon="📚" title="Aucun cours pour l’instant" /></Card>
      )}
      {open && <NewCourseModal pairs={data.pairs} schools={data.schools} instructorId={uid} onClose={() => setOpen(false)} />}
    </>
  );
}

export function NewCourseModal({ pairs, schools = [], instructorId, onClose }:
  { pairs: Pair[]; schools?: TeacherSchool[]; instructorId: string; onClose: () => void }) {
  const { data: ref } = useRefData();
  // Cible : '' = cours communautaire (classe + matière affectées), sinon l'établissement du supérieur
  const [target, setTarget] = useState(pairs.length ? '' : (schools[0]?.school_id ?? ''));
  const { data: programs } = useLoad(async () => (target
    ? must(await supabase.from('school_programs').select('*').eq('school_id', target).order('name')) as SchoolProgram[]
    : []), [target]);
  const [f, setF] = useState({ title: '', description: '', pair: pairs[0] ? `${pairs[0].class_id}:${pairs[0].subject_id}` : '', publish: false, format: 'cours',
    class_id: '', subject_id: '', program_id: '' });
  const { busy, run } = useAction();
  const navigate = useNavigate();
  const levels = ref?.classes.filter((c) => c.cycle === 'superieur') ?? [];
  const levelSubjects = ref?.subjects.filter((s) => ref.classSubjects.some((cs) => String(cs.class_id) === f.class_id && cs.subject_id === s.id)) ?? [];
  const levelPrograms = (programs ?? []).filter((pr) => !f.class_id || !pr.class_ids.length || pr.class_ids.includes(Number(f.class_id)));

  const save = (e: FormEvent) => {
    e.preventDefault();
    const [class_id, subject_id] = target ? [Number(f.class_id), Number(f.subject_id)] : f.pair.split(':').map(Number);
    void run(async () => {
      const c = must(await supabase.from('courses').insert({
        title: f.title, description: f.description, class_id, subject_id, instructor_id: instructorId,
        status: f.publish ? 'published' : 'draft', format: f.format,
        school_id: target || null, program_id: target && f.program_id ? f.program_id : null,
      }).select('id').single()) as Pick<Course, 'id'>;
      navigate(`/cours/${c.id}`);
    }, 'Cours créé. Ajoutez maintenant vos leçons et supports.');
  };

  return (
    <Modal open onClose={onClose} title="Nouveau cours">
      <form className="form" onSubmit={save}>
        {schools.length > 0 && (
          <Field label="Pour" hint="Un cours d’établissement n’est visible que de ses étudiants validés (et de la filière choisie)">
            <select value={target} onChange={(e) => { setTarget(e.target.value); setF({ ...f, class_id: '', subject_id: '', program_id: '' }); }}>
              {pairs.length > 0 && <option value="">Khoulé Éducation (cours communautaire)</option>}
              {schools.map((s) => <option key={s.school_id} value={s.school_id}>🏫 {s.school?.name}</option>)}
            </select>
          </Field>
        )}
        {target ? (
          <>
            <div className="grid-2">
              <Field label="Niveau" required>
                <select value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value, subject_id: '', program_id: '' })} required>
                  <option value="">Choisir…</option>
                  {levels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Matière" required>
                <select value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value })} required>
                  <option value="">Choisir…</option>
                  {levelSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Filière" hint={levelPrograms.length ? 'Laissez « Tout l’établissement » pour un cours commun à toutes les filières' : 'Aucune filière créée par la direction pour ce niveau'}>
              <select value={f.program_id} onChange={(e) => setF({ ...f, program_id: e.target.value })}>
                <option value="">Tout l’établissement</option>
                {levelPrograms.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <Field label="Classe et matière" required>
            <select value={f.pair} onChange={(e) => setF({ ...f, pair: e.target.value })} required>
              {pairs.map((p) => (
                <option key={`${p.class_id}:${p.subject_id}`} value={`${p.class_id}:${p.subject_id}`}>{p.class.name} · {p.subject.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Format" hint="Pour le supérieur : cours magistral, TD ou TP avec le même groupe d’étudiants">
          <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}>
            {Object.entries(COURSE_FORMAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Titre du cours" required>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} placeholder="Ex. : Les fractions — révisions · Droit des obligations — TD groupe A" />
        </Field>
        <Field label="Description" hint="Objectifs, prérequis, matériel à apporter…">
          <textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={f.publish} onChange={(e) => setF({ ...f, publish: e.target.checked })} />
          <span>Publier immédiatement ({target ? 'les étudiants concernés' : 'les élèves de la classe'} seront notifiés)</span>
        </label>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy}>Créer le cours</Button>
        </div>
      </form>
    </Modal>
  );
}
