-- =====================================================================
-- Khoulé Éducation — 8. Disponibilités des intervenants
-- Les cours peuvent avoir lieu toute la semaine : chaque intervenant
-- déclare ses créneaux disponibles, utilisés pour planifier les séances.
-- =====================================================================
create table public.instructor_availabilities (
  id            bigint generated always as identity primary key,
  instructor_id uuid not null references public.instructors (profile_id) on delete cascade,
  day_of_week   smallint not null check (day_of_week between 0 and 6),   -- 0 = dimanche, 1 = lundi … 6 = samedi
  start_time    time not null,
  end_time      time not null,
  mode          text not null default 'both' check (mode in ('presentiel', 'en_ligne', 'both')),
  note          text,
  created_at    timestamptz not null default now(),
  check (end_time > start_time)
);
create index instructor_availabilities_instructor_idx on public.instructor_availabilities (instructor_id, day_of_week);

alter table public.instructor_availabilities enable row level security;

-- Lecture : l'intervenant lui-même et l'administration (aucun accès des élèves)
create policy availabilities_read on public.instructor_availabilities for select to authenticated
  using (instructor_id = auth.uid() or public.is_admin());
create policy availabilities_write on public.instructor_availabilities for all to authenticated
  using (instructor_id = auth.uid() or public.is_admin())
  with check (instructor_id = auth.uid() or public.is_admin());
