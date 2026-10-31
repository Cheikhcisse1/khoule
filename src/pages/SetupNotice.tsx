import { AuthShell } from './AuthShell';

/** Affiché si les variables d'environnement Supabase sont absentes. */
export function SetupNotice() {
  return (
    <AuthShell title="Configuration requise" wide>
      <p>L’application n’est pas encore reliée à Supabase.</p>
      <ol>
        <li>Copiez <code>.env.example</code> en <code>.env.local</code>.</li>
        <li>Renseignez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> (Supabase → Project Settings → API).</li>
        <li>Redémarrez <code>npm run dev</code>.</li>
      </ol>
      <p className="muted">Voir le fichier README.md pour l’installation complète.</p>
    </AuthShell>
  );
}
