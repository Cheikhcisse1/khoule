import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase, translateError } from '../lib/supabase';
import { useLoad } from '../lib/hooks';
import { AuthShell } from '../pages/AuthShell';
import { Badge, Button, ConfirmButton, Field, Spinner, useAction } from './ui';

/** Écran de saisie du code à 6 chiffres après le mot de passe (2FA activée). */
export function MfaChallenge() {
  const { signOut } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === 'verified');
    if (listError || !factor) {
      setBusy(false);
      return setError('Aucune application d’authentification trouvée pour ce compte.');
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    setBusy(false);
    if (error) setError(error.message.toLowerCase().includes('invalid') ? 'Code incorrect ou expiré. Réessayez.' : translateError(error.message));
  };

  return (
    <AuthShell title="Vérification en deux étapes 🔐"
      subtitle="Ouvrez votre application d’authentification (Google Authenticator, Microsoft Authenticator…) et saisissez le code à 6 chiffres.">
      <form className="form" onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <Field label="Code à 6 chiffres" required>
          <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required className="code-input" />
        </Field>
        <Button type="submit" loading={busy} className="btn-block">Valider</Button>
        <button type="button" className="link center" onClick={() => void signOut()}>Se déconnecter</button>
      </form>
    </AuthShell>
  );
}

/** Activation / désactivation de la vérification en deux étapes depuis « Mon profil ». */
export function MfaSettings() {
  const { data, loading, reload } = useLoad(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw new Error(translateError(error.message));
    return data.all;
  }, []);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const { busy, run } = useAction();

  if (loading) return <Spinner />;
  const verified = (data ?? []).filter((f) => f.status === 'verified');

  const start = () => run(async () => {
    // nettoie une tentative précédente non terminée
    for (const f of (data ?? []).filter((x) => x.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data: res, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Khoulé ${Date.now()}` });
    if (error || !res) throw new Error(translateError(error?.message ?? 'Erreur'));
    setEnroll({ id: res.id, qr: res.totp.qr_code, secret: res.totp.secret });
  });

  const confirm = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll!.id, code: code.trim() });
      if (error) throw new Error('Code incorrect : vérifiez l’heure de votre téléphone et réessayez.');
      setEnroll(null);
      setCode('');
      await reload();
    }, 'Vérification en deux étapes activée ✅');
  };

  const disable = (id: string) => run(async () => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) throw new Error(translateError(error.message));
    await reload();
  }, 'Vérification en deux étapes désactivée.');

  if (verified.length) {
    return (
      <div className="stack">
        <p><Badge tone="success">✓ Activée</Badge> À chaque connexion, un code de votre application d’authentification vous sera demandé.</p>
        <div>
          <ConfirmButton variant="ghost" message="Désactiver la vérification en deux étapes ? Votre compte sera moins protégé."
            onConfirm={() => void disable(verified[0].id)}>Désactiver</ConfirmButton>
        </div>
      </div>
    );
  }

  if (enroll) {
    return (
      <form className="form" onSubmit={confirm}>
        <ol className="mfa-steps">
          <li>Installez <b>Google Authenticator</b> ou <b>Microsoft Authenticator</b> sur votre téléphone.</li>
          <li>Dans l’application, touchez <b>+</b> puis <b>Scanner un code QR</b> :</li>
        </ol>
        <img src={enroll.qr} alt="Code QR à scanner" className="mfa-qr" />
        <p className="small muted">Impossible de scanner ? Saisissez cette clé : <code>{enroll.secret}</code></p>
        <Field label="3. Saisissez le code à 6 chiffres affiché" required>
          <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required className="code-input" />
        </Field>
        <div className="row">
          <Button type="submit" loading={busy}>Activer</Button>
          <Button type="button" variant="ghost" onClick={() => setEnroll(null)}>Annuler</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="stack">
      <p>Protégez votre compte : même si quelqu’un obtient votre mot de passe, il ne pourra pas se connecter sans le code
        à 6 chiffres de votre téléphone. <b>Fortement recommandé pour les administrateurs.</b></p>
      <div><Button onClick={() => void start()} loading={busy}>🔐 Activer la vérification en deux étapes</Button></div>
    </div>
  );
}
