import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase, translateError } from '../lib/supabase';
import { checkPassword } from '../lib/password';
import { Button, Field, Modal } from './ui';

/**
 * Compte créé par l'administration (responsable d'établissement) : le mot de passe provisoire
 * doit être remplacé à la première connexion avant de pouvoir utiliser la plateforme.
 */
export function ForcePassword() {
  const { session, profile } = useAuth();
  const [pw, setPw] = useState({ a: '', b: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!session?.user.user_metadata?.must_change_password) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.a !== pw.b) return setError('Les deux mots de passe ne correspondent pas.');
    const bad = await checkPassword(pw.a, [profile?.first_name ?? '', profile?.last_name ?? '', (session.user.email ?? '').split('@')[0]]);
    if (bad) return setError(bad);
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw.a, data: { must_change_password: false } });
    setBusy(false);
    if (err) setError(translateError(err.message));
  };

  return (
    <Modal open onClose={() => {}} title="Choisissez votre mot de passe">
      <form className="form" onSubmit={submit}>
        <p className="muted">Bienvenue sur Khoulé Éducation ! Votre compte a été créé par l’administration avec un mot de passe provisoire.
          Choisissez maintenant votre mot de passe personnel : vous seul(e) le connaîtrez.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <Field label="Nouveau mot de passe" hint="8 caractères minimum, avec au moins une lettre et un chiffre" required>
          <input type="password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label="Confirmer le mot de passe" required>
          <input type="password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} autoComplete="new-password" required />
        </Field>
        <Button type="submit" loading={busy} className="btn-block">Enregistrer mon mot de passe</Button>
      </form>
    </Modal>
  );
}
