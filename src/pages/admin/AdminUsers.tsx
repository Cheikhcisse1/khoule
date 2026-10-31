import { useState } from 'react';
import { Link } from 'react-router-dom';
import { must, supabase } from '../../lib/supabase';
import { useLoad, useRefData } from '../../lib/hooks';
import { INSTRUCTOR_TYPES, ROLE_LABEL, formatDate, fullName } from '../../lib/format';
import type { Instructor, Profile, Student } from '../../lib/types';
import { Badge, Button, Card, ConfirmButton, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Tabs, useAction } from '../../components/ui';

interface UserRow extends Profile {
  student: Student | null;
  instructor: Instructor | null;
}
type Tab = 'applications' | 'students' | 'instructors' | 'admins';

export function AdminUsers() {
  const { data: ref } = useRefData();
  const [tab, setTab] = useState<Tab>('applications');
  const [q, setQ] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [rejecting, setRejecting] = useState<UserRow | null>(null);
  const [detail, setDetail] = useState<UserRow | null>(null);
  const { run } = useAction();

  const { data, error, loading, reload } = useLoad(async () => {
    const [users, subj, cls, contacts] = await Promise.all([
      supabase.from('profiles').select('*, student:students(*), instructor:instructors!instructors_profile_id_fkey(*)')
        .order('created_at', { ascending: false }).then(must),
      supabase.from('instructor_subjects').select('instructor_id, subject_id').then(must),
      supabase.from('instructor_classes').select('instructor_id, class_id').then(must),
      supabase.from('instructor_contacts').select('profile_id, phone').then(must),
    ]);
    return {
      users: users as unknown as UserRow[],
      wishSubjects: subj as { instructor_id: string; subject_id: number }[],
      wishClasses: cls as { instructor_id: string; class_id: number }[],
      phones: contacts as { profile_id: string; phone: string | null }[],
    };
  }, []);

  if (loading || !ref) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const match = (u: UserRow) => fullName(u).toLowerCase().includes(q.toLowerCase());
  const lists: Record<Tab, UserRow[]> = {
    applications: data.users.filter((u) => u.role === 'instructor' && u.instructor?.application_status !== 'approved'),
    students: data.users.filter((u) => u.role === 'student' && (!classFilter || String(u.student?.class_id) === classFilter)),
    instructors: data.users.filter((u) => u.role === 'instructor' && u.instructor?.application_status === 'approved'),
    admins: data.users.filter((u) => u.role === 'admin'),
  };
  const list = lists[tab].filter(match);
  const className = (id?: number | null) => ref.classes.find((c) => c.id === id)?.code ?? '—';
  const wishes = (id: string) => ({
    subjects: data.wishSubjects.filter((w) => w.instructor_id === id).map((w) => ref.subjects.find((s) => s.id === w.subject_id)?.name),
    classes: data.wishClasses.filter((w) => w.instructor_id === id).map((w) => className(w.class_id)),
  });

  const review = (u: UserRow, decision: 'approved' | 'rejected', reason?: string) => run(async () => {
    must(await supabase.rpc('review_instructor', { p_instructor: u.id, p_decision: decision, p_reason: reason ?? null }));
    await reload();
  }, decision === 'approved' ? `${u.first_name} est maintenant intervenant. Pensez à l’affecter.` : 'Candidature refusée.');

  const setStatus = (u: UserRow, status: 'active' | 'suspended') => run(async () => {
    must(await supabase.from('profiles').update({ status }).eq('id', u.id)); await reload();
  }, status === 'suspended' ? 'Compte suspendu.' : 'Compte réactivé.');

  const remove = (u: UserRow) => run(async () => {
    // La suppression du compte d'authentification nécessite la clé service : Edge Function sécurisée
    const { error } = await supabase.functions.invoke('admin-delete-user', { body: { user_id: u.id } });
    if (error) throw new Error('Suppression impossible : vérifiez que la fonction « admin-delete-user » est déployée (voir README). Vous pouvez suspendre le compte en attendant.');
    await reload();
  }, 'Compte supprimé définitivement.');

  const promote = (u: UserRow) => run(async () => {
    must(await supabase.from('profiles').update({ role: 'admin', status: 'active' }).eq('id', u.id)); await reload();
  }, `${u.first_name} est maintenant administrateur.`);

  return (
    <>
      <PageHeader title="Utilisateurs" subtitle="Validez les intervenants, gérez les comptes et protégez les données des élèves." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'applications', label: 'Candidatures', count: lists.applications.filter((u) => u.instructor?.application_status === 'pending').length },
        { id: 'students', label: 'Élèves', count: lists.students.length },
        { id: 'instructors', label: 'Intervenants', count: lists.instructors.length },
        { id: 'admins', label: 'Administrateurs' },
      ]} />
      <div className="toolbar">
        <input placeholder="Rechercher un nom…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        {tab === 'students' && (
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Filtrer par classe">
            <option value="">Toutes les classes</option>
            {ref.classes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
        )}
      </div>

      {list.length === 0 ? <Card><Empty icon="👥" title="Aucun utilisateur" /></Card> : tab === 'applications' ? (
        <div className="stack">
          {list.map((u) => {
            const w = wishes(u.id);
            return (
              <Card key={u.id}>
                <div className="work-head">
                  <div>
                    <h3>{fullName(u)} {u.instructor?.application_status === 'rejected' && <Badge tone="danger">Refusée</Badge>}</h3>
                    <span className="small muted">{INSTRUCTOR_TYPES[u.instructor?.instructor_type ?? 'autre']} · candidature du {formatDate(u.created_at)}
                      {data.phones.find((p) => p.profile_id === u.id)?.phone ? ` · 📞 ${data.phones.find((p) => p.profile_id === u.id)?.phone}` : ''}</span>
                  </div>
                  <div className="row">
                    <Button onClick={() => void review(u, 'approved')}>✓ Valider</Button>
                    {u.instructor?.application_status !== 'rejected' && <Button variant="ghost" onClick={() => setRejecting(u)}>Refuser</Button>}
                  </div>
                </div>
                <dl className="dl">
                  <dt>Niveau d’études</dt><dd>{u.instructor?.education_level || '—'}</dd>
                  <dt>Spécialité</dt><dd>{u.instructor?.specialty || '—'}</dd>
                  <dt>Expérience</dt><dd>{u.instructor?.experience || '—'}</dd>
                  <dt>Matières souhaitées</dt><dd>{w.subjects.join(', ') || '—'}</dd>
                  <dt>Classes souhaitées</dt><dd>{w.classes.join(', ') || '—'}</dd>
                </dl>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th>Nom</th><th>{tab === 'students' ? 'Classe' : 'Profil'}</th><th>Statut</th><th>Inscrit le</th><th /></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td><button className="link" onClick={() => setDetail(u)}><strong>{fullName(u)}</strong></button></td>
                  <td>{tab === 'students' ? className(u.student?.class_id)
                    : tab === 'instructors' ? `${INSTRUCTOR_TYPES[u.instructor?.instructor_type ?? 'autre']} · ${u.instructor?.specialty ?? ''}` : ROLE_LABEL[u.role]}</td>
                  <td>{u.status === 'active' ? <Badge tone="success">Actif</Badge> : u.status === 'suspended' ? <Badge tone="danger">Suspendu</Badge> : <Badge tone="warning">En attente</Badge>}</td>
                  <td className="small">{formatDate(u.created_at)}</td>
                  <td className="row">
                    {tab === 'instructors' && <Link className="btn btn-ghost" to={`/admin/affectations?intervenant=${u.id}`}>Affecter</Link>}
                    <Link className="btn btn-ghost" to={`/messages?avec=${u.id}`}>💬</Link>
                    {u.status === 'suspended'
                      ? <Button variant="secondary" onClick={() => void setStatus(u, 'active')}>Réactiver</Button>
                      : <ConfirmButton variant="ghost" message={`Suspendre le compte de ${fullName(u)} ?`} onConfirm={() => void setStatus(u, 'suspended')}>Suspendre</ConfirmButton>}
                    <ConfirmButton variant="ghost" message={`Supprimer DÉFINITIVEMENT ${fullName(u)} et toutes ses données ?`} onConfirm={() => void remove(u)}>🗑️</ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejecting && <RejectModal user={rejecting} onClose={() => setRejecting(null)} onConfirm={(r) => { void review(rejecting, 'rejected', r); setRejecting(null); }} />}
      {detail && (
        <Modal open onClose={() => setDetail(null)} title={fullName(detail)}>
          <dl className="dl">
            <dt>Rôle</dt><dd>{ROLE_LABEL[detail.role]}</dd>
            {detail.student && <>
              <dt>Classe</dt><dd>{className(detail.student.class_id)}</dd>
              <dt>Établissement</dt><dd>{detail.student.school || '—'}</dd>
              <dt>Année de naissance</dt><dd>{detail.student.birth_year || '—'}</dd>
              <dt>Parent / tuteur</dt><dd>{detail.student.guardian_name || '—'} {detail.student.guardian_relation ? `(${detail.student.guardian_relation})` : ''}</dd>
              <dt>Téléphone tuteur</dt><dd>{detail.student.guardian_phone || '—'}</dd>
              <dt>E-mail tuteur</dt><dd>{detail.student.guardian_email || '—'}</dd>
              <dt>Consentement</dt><dd>{detail.student.guardian_consent ? `Oui${detail.student.consent_at ? ` (${formatDate(detail.student.consent_at)})` : ''}` : 'Non'}</dd>
            </>}
            {detail.instructor && <>
              <dt>Spécialité</dt><dd>{detail.instructor.specialty || '—'}</dd>
              <dt>Études</dt><dd>{detail.instructor.education_level || '—'}</dd>
            </>}
          </dl>
          {detail.role !== 'admin' && (
            <div className="modal-actions">
              <ConfirmButton variant="secondary" message={`Donner tous les droits d’administration à ${fullName(detail)} ?`}
                onConfirm={() => { void promote(detail); setDetail(null); }}>Promouvoir administrateur</ConfirmButton>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

function RejectModal({ user, onClose, onConfirm }: { user: UserRow; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal open onClose={onClose} title={`Refuser la candidature de ${fullName(user)}`}>
      <Field label="Motif (communiqué à l’intervenant)"><textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="danger" onClick={() => onConfirm(reason)}>Refuser</Button>
      </div>
    </Modal>
  );
}
