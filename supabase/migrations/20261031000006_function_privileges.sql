-- =====================================================================
-- Khoulé Éducation — 6. Privilèges d'exécution des fonctions
-- * aucun appel RPC possible sans être connecté (anon) ;
-- * les fonctions de trigger ne sont pas appelables via l'API ;
-- * les fonctions d'autorisation et RPC restent accessibles aux connectés
--   (elles sont utilisées par la RLS et vérifient elles-mêmes l'appelant).
-- =====================================================================
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.prorettype = 'trigger'::regtype as is_trigger
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.is_trigger then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- notify() et notify_course_students() restent internes (appelées par les triggers uniquement)
revoke execute on function public.notify(uuid, text, text, text, text) from authenticated;
revoke execute on function public.notify_course_students(uuid, text, text, text, text) from authenticated;

-- Les fonctions créées plus tard ne seront plus exécutables par anon par défaut
alter default privileges in schema public revoke execute on functions from public, anon;
