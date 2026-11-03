import { useState, type FormEvent } from 'react';
import { must, supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/hooks';
import { fullName } from '../../lib/format';
import { SCHOOL_KINDS, STAFF_TITLES } from '../../lib/schools';
import type { School, SchoolStaff } from '../../lib/types';
import { Badge, Button, Card, ConfirmButton, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, useAction } from '../../components/ui';
import { FunctionsHttpError } from '@supabase/supabase-js';

interface Credentials { name?: string; school?: string; email: string; password: string }

/** Appel de la fonction serveur admin-create-staff (création de compte ou nouveau mot de passe). */
async function staffAccount(body: Record<string, unknown>): Promise<Credentials> {
  const { data, error } = await supabase.functions.invoke('admin-create-staff', { body });
  if (error) {
    const msg = error instanceof FunctionsHttpError ? (await error.context.json().catch(() => ({})))?.error : null;
    throw new Error(msg ?? 'Création impossible pour le moment.');
  }
  return data as Credentials;
}

/** Fiche à remettre au responsable : identifiants affichés une seule fois. */
function CredentialsModal({ c, onClose }: { c: Credentials; onClose: () => void }) {
  const site = window.location.origin;
  const text = [
    'Khoulé Éducation — accès responsable d’établissement',
    c.school ? `Établissement : ${c.school}` : '',
    c.name ? `Nom : ${c.name}` : '',
    `Adresse : ${site}/connexion`,
    `Identifiant : ${c.email}`,
    `Mot de passe provisoire : ${c.password}`,
    'À la première connexion, choisissez votre propre mot de passe.',
  ].filter(Boolean).join('\n');
  const [copied, setCopied] = useState(false);
  return (
    <Modal open onClose={onClose} title="Identifiants à remettre">
      <div className="credentials">
        {c.school && <p><span>Établissement</span><strong>{c.school}</strong></p>}
        {c.name && <p><span>Nom</span><strong>{c.name}</strong></p>}
        <p><span>Adresse</span><strong>{site}/connexion</strong></p>
        <p><span>Identifiant</span><strong>{c.email}</strong></p>
        <p><span>Mot de passe provisoire</span><strong className="mono">{c.password}</strong></p>
      </div>
      <div className="alert alert-info">Notez ou copiez ces informations maintenant : le mot de passe ne sera plus affiché.
        Remettez-les en main propre ou par un canal sûr. Le responsable choisira son propre mot de passe à la première connexion.</div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}>{copied ? 'Copié ✓' : 'Copier la fiche'}</Button>
        <Button onClick={onClose}>J’ai noté les identifiants</Button>
      </div>
    </Modal>
  );
}

type Row = School & { staff: SchoolStaff[]; students: { count: number }[] };

/** Administration générale : créer les établissements et nommer leurs responsables (directeur, proviseur…). */
export function AdminSchools() {
  const [f, setF] = useState({ name: '', kind: 'lycee', city: '' });
  const { busy, run } = useAction();
  const { data, error, loading, reload } = useLoad(async () =>
    must(await supabase.from('schools')
      .select('*, staff:school_staff(school_id, user_id, title, scope, class_ids, profile:profiles(first_name,last_name)), students(count)')
      .order('name')) as unknown as Row[], []);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      must(await supabase.from('schools').insert({ name: f.name.trim(), kind: f.kind, city: f.city.trim() || null }));
      setF({ name: '', kind: 'lycee', city: '' });
      await reload();
    }, 'Établissement créé. Nommez maintenant son responsable.');
  };

  return (
    <>
      <PageHeader title="Établissements" subtitle="Chaque établissement a son espace : ses responsables ne voient et ne gèrent que leur école." />
      <div className="split">
        <Card title="Nouvel établissement">
          <form className="form" onSubmit={create}>
            <Field label="Nom" required><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} placeholder="Ex. : Lycée de Khoulé, Université Cheikh Anta Diop" /></Field>
            <div className="grid-2">
              <Field label="Type">
                <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                  {Object.entries(SCHOOL_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Ville"><input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="Ex. : Khoulé, Dakar" /></Field>
            </div>
            <Button type="submit" loading={busy}>Créer l’établissement</Button>
          </form>
        </Card>
        <section className="stack">
          {data.length === 0 && <Card><Empty icon="🏫" title="Aucun établissement pour l’instant" /></Card>}
          {data.map((s) => <SchoolCard key={s.id} school={s} onChange={reload} />)}
        </section>
      </div>
    </>
  );
}

function SchoolCard({ school, onChange }: { school: Row; onChange: () => Promise<void> }) {
  const [f, setF] = useState({ email: '', title: 'directeur' });
  const [nf, setNf] = useState({ first_name: '', last_name: '', title: 'directeur', email: '' });
  const [creds, setCreds] = useState<Credentials | null>(null);
  const { busy, run } = useAction();
  const create = useAction();
  const [emailFor, setEmailFor] = useState<SchoolStaff | null>(null);

  const createAccount = (e: FormEvent) => {
    e.preventDefault();
    void create.run(async () => {
      setCreds(await staffAccount({ action: 'create', school_id: school.id, ...nf, email: nf.email.trim() }));
      setNf({ first_name: '', last_name: '', title: 'directeur', email: '' });
      await onChange();
    }, 'Compte créé et rattaché à l’établissement.');
  };

  const addDirector = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const name = must(await supabase.rpc('school_add_staff', {
        p_school: school.id, p_email: f.email, p_title: f.title, p_scope: 'school', p_class_ids: [],
      })) as string;
      setF({ email: '', title: 'directeur' });
      await onChange();
      return name;
    }, 'Responsable nommé : son espace école est disponible.');
  };

  return (
    <Card title={<>🏫 {school.name}</>} actions={
      <ConfirmButton variant="ghost" message={`Supprimer « ${school.name} » ? Ses cours d’école seront supprimés et ses élèves détachés.`}
        onConfirm={() => void run(async () => { must(await supabase.from('schools').delete().eq('id', school.id)); await onChange(); }, 'Établissement supprimé.')}>
        🗑️
      </ConfirmButton>
    }>
      <p className="small muted">
        <Badge>{SCHOOL_KINDS[school.kind]}</Badge> {school.city ?? ''} · {school.students?.[0]?.count ?? 0} élève(s) rattaché(s)
      </p>
      <h4 className="section-title">Responsables</h4>
      {school.staff.length ? (
        <ul className="list">
          {school.staff.map((st) => (
            <li key={st.user_id} className="row" style={{ justifyContent: 'space-between' }}>
              <span><strong>{fullName(st.profile)}</strong> · {STAFF_TITLES[st.title] ?? st.title}
                {st.scope === 'classes' && <span className="muted small"> (classes limitées)</span>}</span>
              <span className="row">
                <ConfirmButton variant="ghost" message={`Générer un nouveau mot de passe provisoire pour ${fullName(st.profile)} ? L’ancien ne fonctionnera plus.`}
                  onConfirm={() => void run(async () => {
                    const c = await staffAccount({ action: 'reset', user_id: st.user_id });
                    setCreds({ ...c, name: fullName(st.profile), school: school.name });
                  })}>Nouveau mot de passe</ConfirmButton>
                <Button variant="ghost" onClick={() => setEmailFor(st)}>Changer l’adresse</Button>
                <ConfirmButton variant="ghost" message="Retirer ce responsable ?" onConfirm={() => void run(async () => {
                  must(await supabase.rpc('school_remove_staff', { p_school: school.id, p_user: st.user_id })); await onChange();
                }, 'Responsable retiré.')}>Retirer</ConfirmButton>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">Aucun responsable : nommez le directeur ou le proviseur.</p>}
      <form className="inline-form" onSubmit={addDirector}>
        <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required
          placeholder="E-mail de son compte Khoulé" aria-label="E-mail du responsable" />
        <select value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Fonction">
          {['directeur', 'proviseur', 'principal', 'doyen', 'autre'].map((k) => <option key={k} value={k}>{STAFF_TITLES[k]}</option>)}
        </select>
        <Button type="submit" loading={busy}>Nommer</Button>
      </form>
      <p className="small muted">Pour une personne qui a déjà un compte Khoulé. Elle verra « Mon école » dans son menu.</p>

      <details className="create-account">
        <summary><strong>➕ Créer le compte du responsable</strong> (il n’a pas encore de compte)</summary>
        <form className="form" onSubmit={createAccount}>
          <div className="grid-2">
            <Field label="Prénom" required><input value={nf.first_name} onChange={(e) => setNf({ ...nf, first_name: e.target.value })} required /></Field>
            <Field label="Nom" required><input value={nf.last_name} onChange={(e) => setNf({ ...nf, last_name: e.target.value })} required /></Field>
            <Field label="Fonction">
              <select value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })}>
                {['directeur', 'proviseur', 'principal', 'doyen', 'autre'].map((k) => <option key={k} value={k}>{STAFF_TITLES[k]}</option>)}
              </select>
            </Field>
            <Field label="Son adresse e-mail" required hint="Sa vraie adresse (Gmail, e-mail de l’école…) : elle sert d’identifiant et reçoit « mot de passe oublié »">
              <input type="email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} required placeholder="prenom.nom@gmail.com" />
            </Field>
          </div>
          <Button type="submit" loading={create.busy}>Créer le compte et afficher ses identifiants</Button>
          <p className="small muted">Le compte est actif tout de suite, sans e-mail de confirmation. N’inventez pas d’adresse :
            le propriétaire du domaine pourrait demander un nouveau mot de passe et prendre le compte.</p>
        </form>
      </details>
      {creds && <CredentialsModal c={creds} onClose={() => setCreds(null)} />}
      {emailFor && <EmailModal st={emailFor} onClose={() => setEmailFor(null)} />}
    </Card>
  );
}

/** Remplacer l'adresse (identifiant) d'un responsable, par exemple une ancienne adresse inventée. */
function EmailModal({ st, onClose }: { st: SchoolStaff; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const { busy, run } = useAction();
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await staffAccount({ action: 'set_email', user_id: st.user_id, email: email.trim() });
      onClose();
    }, `Adresse mise à jour : ${fullName(st.profile)} se connecte désormais avec ${email.trim()}.`);
  };
  return (
    <Modal open onClose={onClose} title={`Adresse de ${fullName(st.profile)}`}>
      <form className="form" onSubmit={save}>
        <Field label="Nouvelle adresse e-mail" required hint="Sa vraie adresse : elle devient son identifiant de connexion (son mot de passe ne change pas)">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy}>Enregistrer</Button>
        </div>
      </form>
    </Modal>
  );
}
