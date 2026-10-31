import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { must, supabase } from '../../lib/supabase';
import { useLoad, useRefData } from '../../lib/hooks';
import { INSTRUCTOR_TYPES, ROLE_LABEL, formatDate, fullName } from '../../lib/format';
import type { Instructor, Profile, ProfileStatus, Role, Student } from '../../lib/types';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Button, Card, ConfirmButton, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Tabs, useAction } from '../../components/ui';

interface UserRow extends Profile {
  student: Student | null;
  instructor: Instructor | null;
}
type Tab = 'applications' | 'students' | 'instructors' | 'admins';

export function AdminUsers() {
  const { profile: me } = useAuth();
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
                  <td><button className="link" onClick={() => setDetail(u)}><strong>{fullName(u)}</strong></button>
                    {u.id === me?.id && <> <Badge tone="info">Vous</Badge></>}</td>
                  <td>{tab === 'students' ? className(u.student?.class_id)
                    : tab === 'instructors' ? `${INSTRUCTOR_TYPES[u.instructor?.instructor_type ?? 'autre']} · ${u.instructor?.specialty ?? ''}` : ROLE_LABEL[u.role]}</td>
                  <td>{u.status === 'active' ? <Badge tone="success">Actif</Badge> : u.status === 'suspended' ? <Badge tone="danger">Suspendu</Badge> : <Badge tone="warning">En attente</Badge>}</td>
                  <td className="small">{formatDate(u.created_at)}</td>
                  <td className="row">
                    {tab === 'instructors' && <Link className="btn btn-ghost" to={`/admin/affectations?intervenant=${u.id}`}>Affecter</Link>}
                    <Button variant="secondary" onClick={() => setDetail(u)}>✏️ Modifier</Button>
                    {u.id !== me?.id && <>
                      <Link className="btn btn-ghost" to={`/messages?avec=${u.id}`}>💬</Link>
                      {u.status === 'suspended'
                        ? <Button variant="secondary" onClick={() => void setStatus(u, 'active')}>Réactiver</Button>
                        : <ConfirmButton variant="ghost" message={`Suspendre le compte de ${fullName(u)} ?`} onConfirm={() => void setStatus(u, 'suspended')}>Suspendre</ConfirmButton>}
                      <ConfirmButton variant="ghost" message={`Supprimer DÉFINITIVEMENT ${fullName(u)} et toutes ses données ?`} onConfirm={() => void remove(u)}>🗑️</ConfirmButton>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejecting && <RejectModal user={rejecting} onClose={() => setRejecting(null)} onConfirm={(r) => { void review(rejecting, 'rejected', r); setRejecting(null); }} />}
      {detail && (
        <UserEditModal user={detail} isSelf={detail.id === me?.id} onClose={() => setDetail(null)}
          onSaved={() => { setDetail(null); void reload(); }} />
      )}
    </>
  );
}

/** Fiche complète d'un utilisateur, modifiable par l'administrateur. */
function UserEditModal({ user, isSelf, onClose, onSaved }:
  { user: UserRow; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const { data: ref } = useRefData();
  const [p, setP] = useState({ first_name: user.first_name, last_name: user.last_name, role: user.role, status: user.status });
  const [s, setS] = useState<Partial<Student>>(user.student ?? { guardian_consent: false });
  const [i, setI] = useState<Partial<Instructor>>(user.instructor ?? { instructor_type: 'enseignant', application_status: 'approved' });
  const { busy, run } = useAction();
  if (!ref) return null;

  const setStudent = (k: keyof Student) => (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value || null });
  const setInst = (k: keyof Instructor) => (e: { target: { value: string } }) => setI({ ...i, [k]: e.target.value || null });

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!isSelf && p.role === 'admin' && user.role !== 'admin'
      && !window.confirm(`Donner tous les droits d’administration à ${p.first_name} ${p.last_name} ?`)) return;
    void run(async () => {
      must(await supabase.from('profiles').update(p).eq('id', user.id));
      if (p.role === 'student') {
        must(await supabase.from('students').upsert({
          profile_id: user.id, class_id: s.class_id ? Number(s.class_id) : null, school: s.school ?? null,
          birth_year: s.birth_year ? Number(s.birth_year) : null, phone: s.phone ?? null,
          guardian_name: s.guardian_name ?? null, guardian_relation: s.guardian_relation ?? null,
          guardian_phone: s.guardian_phone ?? null, guardian_email: s.guardian_email ?? null,
          guardian_consent: Boolean(s.guardian_consent),
        }));
      }
      if (p.role === 'instructor') {
        must(await supabase.from('instructors').upsert({
          profile_id: user.id, instructor_type: i.instructor_type ?? 'enseignant', education_level: i.education_level ?? null,
          specialty: i.specialty ?? null, experience: i.experience ?? null, bio: i.bio ?? null,
          application_status: p.status === 'active' ? 'approved' : (i.application_status ?? 'pending'),
        }));
      }
      onSaved();
    }, 'Fiche enregistrée.');
  };

  return (
    <Modal open onClose={onClose} title={`Fiche de ${fullName(user)}`} wide>
      <form className="form" onSubmit={save}>
        <div className="grid-2">
          <Field label="Prénom" required><input value={p.first_name} onChange={(e) => setP({ ...p, first_name: e.target.value })} required /></Field>
          <Field label="Nom" required><input value={p.last_name} onChange={(e) => setP({ ...p, last_name: e.target.value })} required /></Field>
          <Field label="Rôle" hint={isSelf ? 'Vous ne pouvez pas modifier votre propre rôle.' : undefined}>
            <select value={p.role} disabled={isSelf} onChange={(e) => setP({ ...p, role: e.target.value as Role })}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Statut du compte">
            <select value={p.status} disabled={isSelf} onChange={(e) => setP({ ...p, status: e.target.value as ProfileStatus })}>
              <option value="active">Actif</option><option value="pending">En attente</option><option value="suspended">Suspendu</option>
            </select>
          </Field>
        </div>

        {p.role === 'student' && (
          <fieldset className="fieldset">
            <legend>Scolarité et parent / tuteur</legend>
            <div className="grid-2">
              <Field label="Classe">
                <select value={s.class_id ?? ''} onChange={setStudent('class_id')}>
                  <option value="">—</option>
                  {ref.classes.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
              </Field>
              <Field label="Établissement"><input value={s.school ?? ''} onChange={setStudent('school')} /></Field>
              <Field label="Année de naissance"><input type="number" value={s.birth_year ?? ''} onChange={setStudent('birth_year')} /></Field>
              <Field label="Téléphone de l’élève"><input type="tel" value={s.phone ?? ''} onChange={setStudent('phone')} /></Field>
              <Field label="Parent / tuteur"><input value={s.guardian_name ?? ''} onChange={setStudent('guardian_name')} /></Field>
              <Field label="Lien de parenté"><input value={s.guardian_relation ?? ''} onChange={setStudent('guardian_relation')} /></Field>
              <Field label="Téléphone du tuteur"><input type="tel" value={s.guardian_phone ?? ''} onChange={setStudent('guardian_phone')} /></Field>
              <Field label="E-mail du tuteur"><input type="email" value={s.guardian_email ?? ''} onChange={setStudent('guardian_email')} /></Field>
            </div>
            <label className="check">
              <input type="checkbox" checked={Boolean(s.guardian_consent)} onChange={(e) => setS({ ...s, guardian_consent: e.target.checked })} />
              <span>Accord du parent / tuteur{user.student?.consent_at ? ` (donné le ${formatDate(user.student.consent_at)})` : ''}</span>
            </label>
          </fieldset>
        )}

        {p.role === 'instructor' && (
          <fieldset className="fieldset">
            <legend>Profil d’intervenant</legend>
            <div className="grid-2">
              <Field label="Type">
                <select value={i.instructor_type ?? 'enseignant'} onChange={setInst('instructor_type')}>
                  {Object.entries(INSTRUCTOR_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Niveau d’études"><input value={i.education_level ?? ''} onChange={setInst('education_level')} /></Field>
              <Field label="Spécialité"><input value={i.specialty ?? ''} onChange={setInst('specialty')} /></Field>
            </div>
            <Field label="Expérience"><textarea rows={2} value={i.experience ?? ''} onChange={setInst('experience')} /></Field>
            <Field label="Présentation"><textarea rows={2} value={i.bio ?? ''} onChange={setInst('bio')} /></Field>
            <p className="small muted">Un intervenant au statut « Actif » est automatiquement considéré comme validé.
              Affectez-lui ensuite des classes dans <Link to={`/admin/affectations?intervenant=${user.id}`}>Affectations</Link>.</p>
          </fieldset>
        )}

        <div className="modal-actions">
          <Link className="btn btn-ghost" to={`/messages?avec=${user.id}`}>💬 Écrire</Link>
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy}>Enregistrer</Button>
        </div>
      </form>
    </Modal>
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
