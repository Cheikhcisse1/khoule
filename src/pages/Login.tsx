import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase, translateError } from '../lib/supabase';
import { homeFor, useAuth } from '../auth/AuthProvider';
import { Button, Field } from '../components/ui';
import { AuthShell } from './AuthShell';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  useEffect(() => {
    if (session && profile) navigate(from && profile.status === 'active' ? from : homeFor(profile), { replace: true });
  }, [session, profile, from, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(translateError(error.message));
  };

  return (
    <AuthShell title="Bon retour !" subtitle="Connectez-vous à votre espace Khoulé Éducation.">
      <form onSubmit={submit} className="form">
        {error && <div className="alert alert-error">{error}</div>}
        <Field label="Adresse e-mail" required>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Mot de passe" required>
          <input type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" loading={busy} className="btn-block">Se connecter</Button>
        <div className="form-links">
          <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
          <Link to="/inscription">Créer un compte</Link>
        </div>
      </form>
    </AuthShell>
  );
}
