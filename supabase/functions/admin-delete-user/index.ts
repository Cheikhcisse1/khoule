// Edge Function : suppression définitive d'un compte (auth + données en cascade).
// La clé service_role reste côté serveur (variable fournie automatiquement par Supabase).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    // 1. Vérifier que l'appelant est un administrateur actif (avec SON jeton)
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: isAdmin, error: roleError } = await caller.rpc('is_admin');
    if (roleError || !isAdmin) return json({ error: 'Accès refusé' }, 403);

    const { user_id } = await req.json();
    if (typeof user_id !== 'string') return json({ error: 'user_id manquant' }, 400);
    const { data: me } = await caller.auth.getUser();
    if (me.user?.id === user_id) return json({ error: 'Impossible de supprimer son propre compte' }, 400);

    // 2. Supprimer avec la clé service (cascade sur profiles → données liées)
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // fichiers de l'utilisateur : {user_id}/... (les copies sont dans {user_id}/{devoir}/...)
    const removeFolder = async (bucket: string, folder: string): Promise<void> => {
      const { data: entries } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
      const files = (entries ?? []).filter((e) => e.id).map((e) => `${folder}/${e.name}`);
      if (files.length) await admin.storage.from(bucket).remove(files);
      for (const sub of (entries ?? []).filter((e) => !e.id)) await removeFolder(bucket, `${folder}/${sub.name}`);
    };
    await removeFolder('submissions', user_id);
    await removeFolder('avatars', user_id);
    const { error } = await admin.auth.admin.deleteUser(user_id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
