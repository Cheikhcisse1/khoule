import { useState, type FormEvent } from 'react';
import { must, supabase } from '../../lib/supabase';
import { loadRefData, useLoad } from '../../lib/hooks';
import { CYCLES } from '../../lib/format';
import type { SchoolClass, Subject } from '../../lib/types';
import { Button, Card, ConfirmButton, ErrorBox, Field, Modal, PageHeader, Spinner, useAction } from '../../components/ui';

export function AdminReferential() {
  const { data, error, loading, reload } = useLoad(() => loadRefData(true), []);
  const [editClass, setEditClass] = useState<Partial<SchoolClass> | null>(null);
  const [editSubject, setEditSubject] = useState<Partial<Subject> | null>(null);
  const { busy, run } = useAction();

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const has = (c: number, s: number) => data.classSubjects.some((x) => x.class_id === c && x.subject_id === s);
  const toggle = (c: number, s: number) => run(async () => {
    if (has(c, s)) must(await supabase.from('class_subjects').delete().eq('class_id', c).eq('subject_id', s));
    else must(await supabase.from('class_subjects').insert({ class_id: c, subject_id: s }));
    await reload();
  });

  const saveClass = (e: FormEvent) => {
    e.preventDefault();
    const row = { code: editClass!.code, name: editClass!.name, cycle: editClass!.cycle, sort_order: Number(editClass!.sort_order) };
    void run(async () => {
      if (editClass!.id) must(await supabase.from('classes').update(row).eq('id', editClass!.id));
      else must(await supabase.from('classes').insert(row));
      setEditClass(null); await reload();
    }, 'Classe enregistrée.');
  };
  const saveSubject = (e: FormEvent) => {
    e.preventDefault();
    const row = { name: editSubject!.name, color: editSubject!.color };
    void run(async () => {
      if (editSubject!.id) must(await supabase.from('subjects').update(row).eq('id', editSubject!.id));
      else must(await supabase.from('subjects').insert(row));
      setEditSubject(null); await reload();
    }, 'Matière enregistrée.');
  };

  return (
    <>
      <PageHeader title="Classes & matières" subtitle="Organisation pédagogique : cochez les matières enseignées à chaque niveau." />
      <div className="split">
        <Card title="Classes" actions={<Button variant="secondary" onClick={() => setEditClass({ cycle: 'college', sort_order: data.classes.length + 1 })}>+ Classe</Button>}>
          <ul className="list">
            {data.classes.map((c) => (
              <li key={c.id} className="list-row">
                <span><strong>{c.code}</strong> — {c.name} <span className="small muted">({CYCLES[c.cycle]})</span></span>
                <span className="row">
                  <button className="link" onClick={() => setEditClass(c)}>Modifier</button>
                  <ConfirmButton variant="ghost" message="Supprimer cette classe ? (impossible si des cours y sont rattachés)" onConfirm={() => void run(async () => {
                    must(await supabase.from('classes').delete().eq('id', c.id)); await reload();
                  }, 'Classe supprimée.')}>🗑️</ConfirmButton>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Matières" actions={<Button variant="secondary" onClick={() => setEditSubject({ color: '#1f7a4d' })}>+ Matière</Button>}>
          <ul className="list">
            {data.subjects.map((s) => (
              <li key={s.id} className="list-row">
                <span><span className="dot" style={{ background: s.color }} /> {s.name}</span>
                <span className="row">
                  <button className="link" onClick={() => setEditSubject(s)}>Modifier</button>
                  <ConfirmButton variant="ghost" message="Supprimer cette matière ?" onConfirm={() => void run(async () => {
                    must(await supabase.from('subjects').delete().eq('id', s.id)); await reload();
                  }, 'Matière supprimée.')}>🗑️</ConfirmButton>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Programme : matières par niveau">
        <div className="table-wrap">
          <table className="table matrix">
            <thead><tr><th>Matière</th>{data.classes.map((c) => <th key={c.id}>{c.code}</th>)}</tr></thead>
            <tbody>
              {data.subjects.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  {data.classes.map((c) => (
                    <td key={c.id}>
                      <input type="checkbox" checked={has(c.id, s.id)} disabled={busy} aria-label={`${s.name} en ${c.code}`}
                        onChange={() => void toggle(c.id, s.id)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editClass && (
        <Modal open onClose={() => setEditClass(null)} title={editClass.id ? 'Modifier la classe' : 'Nouvelle classe'}>
          <form className="form" onSubmit={saveClass}>
            <div className="grid-2">
              <Field label="Code" required><input value={editClass.code ?? ''} onChange={(e) => setEditClass({ ...editClass, code: e.target.value })} required /></Field>
              <Field label="Ordre"><input type="number" value={editClass.sort_order ?? 0} onChange={(e) => setEditClass({ ...editClass, sort_order: Number(e.target.value) })} /></Field>
            </div>
            <Field label="Nom" required><input value={editClass.name ?? ''} onChange={(e) => setEditClass({ ...editClass, name: e.target.value })} required /></Field>
            <Field label="Cycle">
              <select value={editClass.cycle} onChange={(e) => setEditClass({ ...editClass, cycle: e.target.value as SchoolClass['cycle'] })}>
                {Object.entries(CYCLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <div className="modal-actions"><Button type="submit" loading={busy}>Enregistrer</Button></div>
          </form>
        </Modal>
      )}
      {editSubject && (
        <Modal open onClose={() => setEditSubject(null)} title={editSubject.id ? 'Modifier la matière' : 'Nouvelle matière'}>
          <form className="form" onSubmit={saveSubject}>
            <Field label="Nom" required><input value={editSubject.name ?? ''} onChange={(e) => setEditSubject({ ...editSubject, name: e.target.value })} required /></Field>
            <Field label="Couleur"><input type="color" value={editSubject.color ?? '#1f7a4d'} onChange={(e) => setEditSubject({ ...editSubject, color: e.target.value })} /></Field>
            <div className="modal-actions"><Button type="submit" loading={busy}>Enregistrer</Button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
