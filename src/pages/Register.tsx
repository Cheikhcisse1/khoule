import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, translateError } from '../lib/supabase';
import { useRefData } from '../lib/hooks';
import { CYCLES, INSTRUCTOR_TYPES } from '../lib/format';
import { Button, Field } from '../components/ui';
import { AuthShell } from './AuthShell';

type Kind = 'eleve' | 'intervenant';
const CURRENT_YEAR = new Date().getFullYear();

export function Register() {
  const [params, setParams] = useSearchParams();
  const kind: Kind = params.get('profil') === 'intervenant' ? 'intervenant' : 'eleve';
  const { data: ref } = useRefData();
  const navigate = useNavigate();

  const [f, setF] = useState<Record<string, string>>({ instructor_type: 'enseignant' });
  const [consent, setConsent] = useState(false);
  const [charter, setCharter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: string) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const birthYear = Number(f.birth_year) || null;
  const isMinor = kind === 'eleve' && (!birthYear || CURRENT_YEAR - birthYear < 18);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if ((f.password ?? '').length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.');
    if (f.password !== f.password2) return setError('Les deux mots de passe ne correspondent pas.');
    if (kind === 'eleve' && !f.class_id) return setError('Veuillez choisir votre classe.');
    if (isMinor && (!f.guardian_name || !f.guardian_phone))
      return setError('Pour un élève mineur, le nom et le téléphone du parent ou tuteur sont obligatoires.');
    if (isMinor && !consent) return setError('L’accord du parent ou tuteur est nécessaire.');
    if (!charter) return setError('Veuillez accepter la charte d’utilisation.');

    const common = { first_name: f.first_name?.trim(), last_name: f.last_name?.trim(), phone: f.phone?.trim() };
    const data = kind === 'eleve'
      ? {
          ...common, role: 'student', class_id: f.class_id, school: f.school, birth_year: f.birth_year ?? '',
          guardian_name: f.guardian_name, guardian_relation: f.guardian_relation,
          guardian_phone: f.guardian_phone, guardian_email: f.guardian_email, guardian_consent: isMinor ? consent : false,
        }
      : {
          ...common, role: 'instructor', instructor_type: f.instructor_type, education_level: f.education_level,
          specialty: f.specialty, experience: f.experience,
        };

    setBusy(true);
    const { data: res, error } = await supabase.auth.signUp({
      email: (f.email ?? '').trim(),
      password: f.password,
      options: { data, emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}connexion` },
    });
    setBusy(false);
    if (error) return setError(translateError(error.message));
    if (res.session) navigate(kind === 'eleve' ? '/en-attente' : '/candidature', { replace: true });
    else setDone(true);
  };

  if (done) {
    return (
      <AuthShell title="Vérifiez votre boîte e-mail 📬">
        <p>Un lien de confirmation a été envoyé à <strong>{f.email}</strong>. Cliquez dessus pour activer votre compte.</p>
        {kind === 'intervenant' && (
          <p className="muted">Votre candidature sera ensuite examinée par l’administration.</p>
        )}
        <Link to="/connexion" className="btn btn-primary btn-block">Aller à la connexion</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Créer un compte" subtitle="Rejoignez la communauté éducative de Khoulé." wide>
      <div className="segmented" role="radiogroup" aria-label="Type de compte">
        <button type="button" role="radio" aria-checked={kind === 'eleve'} className={kind === 'eleve' ? 'on' : ''}
          onClick={() => setParams({ profil: 'eleve' })}>🎒 Je suis élève</button>
        <button type="button" role="radio" aria-checked={kind === 'intervenant'} className={kind === 'intervenant' ? 'on' : ''}
          onClick={() => setParams({ profil: 'intervenant' })}>🧑‍🏫 Je veux enseigner</button>
      </div>

      <form onSubmit={submit} className="form">
        {error && <div className="alert alert-error">{error}</div>}
        <div className="grid-2">
          <Field label="Prénom" required><input value={f.first_name ?? ''} onChange={set('first_name')} required autoComplete="given-name" /></Field>
          <Field label="Nom" required><input value={f.last_name ?? ''} onChange={set('last_name')} required autoComplete="family-name" /></Field>
        </div>

        {kind === 'eleve' ? (
          <>
            <div className="grid-2">
              <Field label="Classe actuelle" required>
                <select value={f.class_id ?? ''} onChange={set('class_id')} required>
                  <option value="">Choisir…</option>
                  {(['elementaire', 'college', 'lycee'] as const).map((cy) => (
                    <optgroup key={cy} label={CYCLES[cy]}>
                      {ref?.classes.filter((c) => c.cycle === cy).map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label="Année de naissance">
                <input type="number" min={1990} max={CURRENT_YEAR} value={f.birth_year ?? ''} onChange={set('birth_year')} />
              </Field>
            </div>
            <Field label="Établissement scolaire" hint="Facultatif">
              <input value={f.school ?? ''} onChange={set('school')} placeholder="Ex. : École élémentaire de Khoulé" />
            </Field>

            <fieldset className="fieldset">
              <legend>Parent ou tuteur légal {isMinor ? <span className="req">*</span> : <span className="muted">(facultatif pour un élève majeur)</span>}</legend>
              <div className="grid-2">
                <Field label="Nom complet" required={isMinor}><input value={f.guardian_name ?? ''} onChange={set('guardian_name')} /></Field>
                <Field label="Lien de parenté">
                  <select value={f.guardian_relation ?? ''} onChange={set('guardian_relation')}>
                    <option value="">—</option><option>Père</option><option>Mère</option><option>Tuteur / Tutrice</option><option>Autre</option>
                  </select>
                </Field>
                <Field label="Téléphone" required={isMinor}><input type="tel" value={f.guardian_phone ?? ''} onChange={set('guardian_phone')} placeholder="77 000 00 00" /></Field>
                <Field label="E-mail"><input type="email" value={f.guardian_email ?? ''} onChange={set('guardian_email')} /></Field>
              </div>
              {isMinor && (
                <label className="check">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>Le parent ou tuteur autorise l’élève à utiliser la plateforme et accepte que ses données soient utilisées
                    uniquement pour l’accompagnement scolaire.</span>
                </label>
              )}
            </fieldset>
          </>
        ) : (
          <>
            <div className="grid-2">
              <Field label="Vous êtes" required>
                <select value={f.instructor_type} onChange={set('instructor_type')}>
                  {Object.entries(INSTRUCTOR_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Niveau d’études" required>
                <input value={f.education_level ?? ''} onChange={set('education_level')} required placeholder="Ex. : Licence 3, Master, CAP…" />
              </Field>
            </div>
            <Field label="Spécialité" required><input value={f.specialty ?? ''} onChange={set('specialty')} required placeholder="Ex. : Mathématiques" /></Field>
            <Field label="Expérience d’enseignement" hint="Quelques lignes suffisent">
              <textarea rows={3} value={f.experience ?? ''} onChange={set('experience')} />
            </Field>
            <Field label="Téléphone" hint="Visible uniquement par l’administration">
              <input type="tel" value={f.phone ?? ''} onChange={set('phone')} />
            </Field>
          </>
        )}

        <div className="grid-2">
          <Field label="Adresse e-mail" required><input type="email" value={f.email ?? ''} onChange={set('email')} required autoComplete="email" /></Field>
          <span />
          <Field label="Mot de passe" hint="8 caractères minimum" required>
            <input type="password" value={f.password ?? ''} onChange={set('password')} required autoComplete="new-password" minLength={8} />
          </Field>
          <Field label="Confirmer le mot de passe" required>
            <input type="password" value={f.password2 ?? ''} onChange={set('password2')} required autoComplete="new-password" />
          </Field>
        </div>

        <label className="check">
          <input type="checkbox" checked={charter} onChange={(e) => setCharter(e.target.checked)} />
          <span>J’accepte la charte : respect, bienveillance, pas de partage d’informations personnelles en dehors de la plateforme.</span>
        </label>

        <Button type="submit" loading={busy} className="btn-block">
          {kind === 'eleve' ? 'Créer mon compte élève' : 'Envoyer ma candidature'}
        </Button>
        <p className="center muted">Déjà inscrit ? <Link to="/connexion">Se connecter</Link></p>
      </form>
    </AuthShell>
  );
}
