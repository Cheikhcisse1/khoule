import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, translateError } from '../lib/supabase';
import { Button, Field } from '../components/ui';
import { AuthShell } from './AuthShell';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}nouveau-mot-de-passe`,
    });
    setBusy(false);
    if (error) setError(translateError(error.message));
    else setSent(true);
  };

  return (
    <AuthShell title="Mot de passe oublié" subtitle="Recevez un lien pour choisir un nouveau mot de passe.">
      {sent ? (
        <div className="alert alert-success">Si un compte existe pour {email}, un e-mail vient d’être envoyé.</div>
      ) : (
        <form onSubmit={submit} className="form">
          {error && <div className="alert alert-error">{error}</div>}
          <Field label="Adresse e-mail" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button type="submit" loading={busy} className="btn-block">Envoyer le lien</Button>
        </form>
      )}
      <p className="center"><Link to="/connexion">Retour à la connexion</Link></p>
    </AuthShell>
  );
}

export function ResetPassword() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('8 caractères minimum.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(translateError(error.message));
    else navigate('/', { replace: true });
  };

  return (
    <AuthShell title="Nouveau mot de passe">
      <form onSubmit={submit} className="form">
        {error && <div className="alert alert-error">{error}</div>}
        <Field label="Nouveau mot de passe" required>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Button type="submit" loading={busy} className="btn-block">Enregistrer</Button>
      </form>
    </AuthShell>
  );
}
