-- =====================================================================
-- Khoulé Éducation — 9. Bibliothèque « Documents & annales »
-- Les intervenants déposent des documents (annales, fiches, exercices…)
-- par classe et matière, sans devoir créer un cours.
-- =====================================================================
create table public.library_documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) > 1),
  description text,
  kind        text not null default 'annale'
                check (kind in ('annale', 'cours', 'exercices', 'corrige', 'fiche', 'autre')),
  class_id    smallint not null references public.classes (id) on delete cascade,
  subject_id  smallint not null references public.subjects (id) on delete cascade,
  year        smallint check (year between 1980 and 2100),
  file_path   text,
  url         text check (url is null or url ~* '^https://'),
  size_bytes  bigint,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (file_path is not null or url is not null)
);
create index library_documents_class_subject_idx on public.library_documents (class_id, subject_id, created_at desc);

-- Conversion sûre d'un segment de chemin en identifiant (null si invalide)
create or replace function public.try_smallint(p text) returns smallint
language sql immutable set search_path = '' as $$
  select case when p ~ '^[0-9]{1,4}$' then p::smallint end
$$;

-- Peut-il publier pour ce couple classe + matière ?
create or replace function public.can_publish_library(p_class smallint, p_subject smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (public.is_active_instructor() and exists (
    select 1 from public.teaching_assignments ta
    where ta.instructor_id = auth.uid() and ta.class_id = p_class and ta.subject_id = p_subject))
$$;

-- Qui peut consulter les documents d'une classe ?
create or replace function public.can_read_library(p_class smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.is_active_instructor()
      or (public.is_active_student() and public.student_class_id() = p_class)
$$;

revoke execute on function public.can_publish_library(smallint, smallint),
  public.can_read_library(smallint), public.try_smallint(text) from public, anon;
grant execute on function public.can_publish_library(smallint, smallint),
  public.can_read_library(smallint), public.try_smallint(text) to authenticated;

alter table public.library_documents enable row level security;

create policy library_read on public.library_documents for select to authenticated
  using (public.can_read_library(class_id));
create policy library_insert on public.library_documents for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_publish_library(class_id, subject_id));
create policy library_update on public.library_documents for update to authenticated
  using (public.is_admin() or (uploaded_by = auth.uid() and public.is_active_instructor()))
  with check (public.can_publish_library(class_id, subject_id));
create policy library_delete on public.library_documents for delete to authenticated
  using (public.is_admin() or (uploaded_by = auth.uid() and public.is_active_instructor()));

-- Nouveau document : notification aux élèves de la classe
create or replace function public.library_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_subject text;
begin
  select name into v_subject from public.subjects where id = new.subject_id;
  insert into public.notifications (user_id, type, title, body, link)
  select s.profile_id, 'new_document', 'Nouveau document : ' || v_subject, new.title, '/documents'
  from public.students s join public.profiles p on p.id = s.profile_id
  where s.class_id = new.class_id and p.status = 'active';
  return null;
end $$;
revoke execute on function public.library_after_insert() from public, anon, authenticated;
create trigger library_documents_after_insert after insert on public.library_documents
  for each row execute function public.library_after_insert();

-- Stockage : bucket privé « library », chemin {class_id}/{subject_id}/fichier
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library', 'library', false, 52428800, null)
on conflict (id) do nothing;

create policy library_files_read on storage.objects for select to authenticated
  using (bucket_id = 'library'
         and public.can_read_library(public.try_smallint((storage.foldername(name))[1])));
create policy library_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'library'
         and public.can_publish_library(public.try_smallint((storage.foldername(name))[1]),
                                        public.try_smallint((storage.foldername(name))[2])));
create policy library_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'library' and (public.is_admin() or owner = auth.uid()));
