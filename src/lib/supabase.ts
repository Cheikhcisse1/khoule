import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

// Seule la clé publique "anon" est utilisée côté navigateur : la sécurité repose sur la RLS.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Lève une erreur lisible si la requête Supabase a échoué, sinon renvoie les données. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(translateError(res.error.message));
  return res.data as T;
}

export function translateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return 'Veuillez confirmer votre adresse e-mail (lien reçu par e-mail).';
  if (m.includes('user already registered')) return 'Un compte existe déjà avec cette adresse e-mail.';
  if (m.includes('password should be at least')) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (m.includes('row-level security') || m.includes('accès refusé') || m.includes('permission denied'))
    return 'Action non autorisée pour votre compte.';
  if (m.includes('duplicate key')) return 'Cet élément existe déjà.';
  if (m.includes('failed to fetch')) return 'Connexion impossible. Vérifiez votre accès Internet.';
  return message;
}
