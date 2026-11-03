// Edge Function : l'administrateur crée le compte d'un responsable d'établissement (directeur, proviseur…)
// et obtient ses identifiants à lui remettre. Identifiant proposé : prenom.nom@nom-de-l-ecole.sn
//  - action "create" : compte confirmé et actif, rattaché à l'école comme responsable
//  - action "reset"  : nouveau mot de passe provisoire pour un responsable d'établissement
// Le responsable doit choisir son propre mot de passe à la première connexion (must_change_password).
// La clé service_role reste côté serveur (fournie automatiquement par Supabase).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const ALLOWED = ['https://khoule-education.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173'];
const TITLES = ['directeur', 'proviseur', 'principal', 'doyen', 'autre'];

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED.includes(origin) ? origin : ALLOWED[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

// Lettres et chiffres sans caractères ambigus (0/O, 1/l/I), plus un séparateur lisible
const ALPHA = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
function tempPassword(): string {
  const pick = (set: string, n: number) => {
    const r = crypto.getRandomValues(new Uint32Array(n));
    return Array.from(r, (x) => set[x % set.length]).join('');
  };
  return `${pick(ALPHA, 5)}-${pick(DIGITS, 3)}-${pick(ALPHA + DIGITS, 5)}`;
}

/** « Lycée de Khoulé » → « lycee-de-khoule » ; « Awa Ndiaye » → « awa.ndiaye » */
const slug = (s: string, sep = '-') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^\\${sep}+|\\${sep}+$`, 'g'), '');

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin'));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...h, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    // 1. L'appelant doit être un administrateur actif (vérifié avec SON jeton, MFA comprise)
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: isAdmin, error: roleError } = await caller.rpc('is_admin');
    if (roleError || !isAdmin) return json({ error: 'Accès refusé' }, 403);
    const { data: me } = await caller.auth.getUser();
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = await req.json().catch(() => ({})) as Record<string, string>;

    // ---------- Nouveau mot de passe provisoire ----------
    if (body.action === 'reset') {
      if (typeof body.user_id !== 'string') return json({ error: 'Responsable manquant' }, 400);
      const { data: st } = await admin.from('school_staff').select('user_id').eq('user_id', body.user_id).limit(1);
      if (!st?.length) return json({ error: 'Ce compte n’est responsable d’aucun établissement' }, 400);
      const { data: u, error: ue } = await admin.auth.admin.getUserById(body.user_id);
      if (ue || !u.user) return json({ error: 'Compte introuvable' }, 404);
      const password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(body.user_id, {
        password, user_metadata: { ...u.user.user_metadata, must_change_password: true },
      });
      if (error) return json({ error: error.message }, 400);
      return json({ email: u.user.email, password });
    }

    // ---------- Création du compte ----------
    if (body.action !== 'create') return json({ error: 'Action inconnue' }, 400);
    const first = String(body.first_name ?? '').trim();
    const last = String(body.last_name ?? '').trim();
    const title = TITLES.includes(body.title) ? body.title : 'directeur';
    if (!first || !last || typeof body.school_id !== 'string') return json({ error: 'Prénom, nom et établissement sont obligatoires' }, 400);
    const { data: school } = await admin.from('schools').select('id, name').eq('id', body.school_id).maybeSingle();
    if (!school) return json({ error: 'Établissement introuvable' }, 404);

    let email = String(body.email ?? '').trim().toLowerCase();
    const custom = !!email;
    if (!email) email = `${slug(`${first} ${last}`, '.')}@${slug(school.name)}.sn`;
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) return json({ error: 'Adresse e-mail invalide' }, 400);

    const password = tempPassword();
    let created = null;
    for (let i = 0; i < 5 && !created; i++) {
      // Identifiant proposé déjà pris : on ajoute un numéro (awa.ndiaye2@…) ; adresse choisie : on s'arrête
      const tryEmail = i === 0 ? email : email.replace('@', `${i + 1}@`);
      const { data, error } = await admin.auth.admin.createUser({
        email: tryEmail, password, email_confirm: true,
        user_metadata: { role: 'instructor', first_name: first, last_name: last, must_change_password: true, created_by_admin: true },
      });
      if (!error) { created = data.user; email = tryEmail; break; }
      if (custom || !/already|registered|exists/i.test(error.message)) {
        return json({ error: /already|registered|exists/i.test(error.message) ? 'Un compte existe déjà avec cette adresse : utilisez « Nommer » avec cet e-mail.' : error.message }, 400);
      }
    }
    if (!created) return json({ error: 'Impossible de trouver un identifiant libre' }, 400);

    // 2. Compte actif et validé (pas de candidature à examiner), rattaché à l'école
    await admin.from('profiles').update({ status: 'active' }).eq('id', created.id);
    await admin.from('instructors').update({
      application_status: 'approved', instructor_type: 'autre', reviewed_by: me.user?.id ?? null, reviewed_at: new Date().toISOString(),
      specialty: `Responsable d’établissement — ${school.name}`,
    }).eq('profile_id', created.id);
    const { error: se } = await admin.from('school_staff').insert({ school_id: school.id, user_id: created.id, title, scope: 'school' });
    if (se) return json({ error: se.message }, 400);
    // La candidature automatique créée à l'inscription n'a plus lieu d'être signalée aux admins
    await admin.from('notifications').delete().eq('type', 'instructor_application').ilike('body', `${first} ${last}%`);

    return json({ email, password, name: `${first} ${last}`, school: school.name });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
