-- =============================================================================
-- Assistant IA (Groq, gratuit) : « Coup de pouce » élève, assistant intervenant,
-- pré-correction Stylo Rouge. Les écritures passent uniquement par l'Edge Function
-- `ai` (clé service côté serveur) ; les utilisateurs ne font que lire / effacer
-- leur propre historique.
-- =============================================================================

create table public.ai_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  mode       text not null check (mode in ('tutor', 'instructor')),
  -- fil de discussion : 'general', 'course:<uuid>' ou 'assignment:<uuid>'
  thread     text not null default 'general' check (length(thread) <= 60),
  role       text not null check (role in ('user', 'assistant')),
  content    text not null check (length(content) <= 20000),
  created_at timestamptz not null default now()
);
create index ai_messages_user_thread_idx on public.ai_messages (user_id, mode, thread, created_at desc);

-- Quota quotidien par personne (offre gratuite Groq : limiter les appels)
create table public.ai_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null default current_date,
  count   integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_messages enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.ai_messages, public.ai_usage from anon;
revoke insert, update on public.ai_messages, public.ai_usage from authenticated;

-- Historique : visible par son auteur et par l'admin (pas par les intervenants)
create policy ai_messages_select on public.ai_messages for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy ai_messages_delete on public.ai_messages for delete to authenticated
  using (user_id = (select auth.uid()));
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Réserve atomiquement un appel ; renvoie le nombre restant, ou -1 si le quota est atteint.
create or replace function public.ai_consume(p_user uuid, p_limit integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  insert into public.ai_usage (user_id, day, count) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
    where public.ai_usage.count < p_limit
  returning count into v;
  if v is null then return -1; end if;
  return p_limit - v;
end $$;
revoke execute on function public.ai_consume(uuid, integer) from public, anon, authenticated;
grant execute on function public.ai_consume(uuid, integer) to service_role;

-- Ménage : historique conservé 90 jours, compteurs 30 jours
create or replace function public.ai_cleanup() returns void
language sql security definer set search_path = '' as $$
  delete from public.ai_messages where created_at < now() - interval '90 days';
  delete from public.ai_usage where day < current_date - 30;
$$;
revoke execute on function public.ai_cleanup() from public, anon, authenticated;
grant execute on function public.ai_cleanup() to service_role;
