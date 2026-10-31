import { useState } from 'react';
import { Link } from 'react-router-dom';
import { must, supabase } from '../../lib/supabase';
import { useLoad, useRefData } from '../../lib/hooks';
import { fetchCourses } from '../../lib/queries';
import { COURSE_STATUS, formatDate, fullName } from '../../lib/format';
import type { Course } from '../../lib/types';
import { Badge, Button, Card, ConfirmButton, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, useAction } from '../../components/ui';
import { NewCourseModal } from '../instructor/InstructorCourses';

export function AdminCourses() {
  const { data: ref } = useRefData();
  const [status, setStatus] = useState('');
  const [classId, setClassId] = useState('');
  const [creating, setCreating] = useState(false);
  const [instructor, setInstructor] = useState('');
  const { run } = useAction();

  const { data, error, loading, reload } = useLoad(async () => {
    const [courses, pairs] = await Promise.all([
      fetchCourses(),
      supabase.from('teaching_assignments').select('instructor_id, class_id, subject_id, class:classes(code,name), subject:subjects(name), instructor:instructors(profile_id)').then(must),
    ]);
    return { courses, pairs: pairs as unknown as { instructor_id: string; class_id: number; subject_id: number; class: { code: string; name: string }; subject: { name: string } }[] };
  }, []);

  if (loading || !ref) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const list = data.courses.filter((c) => (!status || c.status === status) && (!classId || String(c.class_id) === classId));
  const setCourseStatus = (c: Course, s: Course['status']) => run(async () => {
    must(await supabase.from('courses').update({ status: s }).eq('id', c.id)); await reload();
  }, `Cours « ${c.title} » : ${COURSE_STATUS[s].toLowerCase()}.`);

  const instructorIds = Array.from(new Set(data.pairs.map((p) => p.instructor_id)));

  return (
    <>
      <PageHeader title="Tous les cours" actions={<Button onClick={() => setCreating(true)}>+ Créer un cours</Button>} />
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Statut">
          <option value="">Tous les statuts</option>
          {Object.entries(COURSE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Classe">
          <option value="">Toutes les classes</option>
          {ref.classes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
      </div>
      {list.length ? (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th>Cours</th><th>Classe</th><th>Intervenant</th><th>Statut</th><th>Créé le</th><th /></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/cours/${c.id}`}><strong>{c.title}</strong></Link><br /><span className="small muted">{c.subject?.name}</span></td>
                  <td>{c.class?.code}</td>
                  <td>{fullName(c.instructor)}</td>
                  <td><Badge tone={c.status === 'published' ? 'success' : c.status === 'draft' ? 'warning' : 'neutral'}>{COURSE_STATUS[c.status]}</Badge></td>
                  <td className="small">{formatDate(c.created_at)}</td>
                  <td className="row">
                    {c.status !== 'published' && <Button variant="secondary" onClick={() => void setCourseStatus(c, 'published')}>Publier</Button>}
                    {c.status === 'published' && <Button variant="ghost" onClick={() => void setCourseStatus(c, 'archived')}>Archiver</Button>}
                    <ConfirmButton variant="ghost" message={`Supprimer « ${c.title} » et tout son contenu ?`} onConfirm={() => void run(async () => {
                      must(await supabase.from('courses').delete().eq('id', c.id)); await reload();
                    }, 'Cours supprimé.')}>🗑️</ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Card><Empty icon="📚" title="Aucun cours" /></Card>}

      {creating && !instructor && (
        <Modal open onClose={() => setCreating(false)} title="Créer un cours pour un intervenant">
          {instructorIds.length ? (
            <Field label="Intervenant (parmi ceux qui ont une affectation)">
              <select defaultValue="" onChange={(e) => setInstructor(e.target.value)}>
                <option value="" disabled>Choisir…</option>
                {instructorIds.map((id) => <InstructorOption key={id} id={id} />)}
              </select>
            </Field>
          ) : <Empty icon="🧩" title="Aucun intervenant affecté"><Link to="/admin/affectations">Créer une affectation</Link></Empty>}
        </Modal>
      )}
      {creating && instructor && (
        <NewCourseModal instructorId={instructor} pairs={data.pairs.filter((p) => p.instructor_id === instructor)}
          onClose={() => { setCreating(false); setInstructor(''); }} />
      )}
    </>
  );
}

function InstructorOption({ id }: { id: string }) {
  const { data } = useLoad(async () => must(await supabase.from('profiles').select('first_name,last_name').eq('id', id).single()) as
    { first_name: string; last_name: string }, [id]);
  return <option value={id}>{data ? fullName(data) : '…'}</option>;
}
