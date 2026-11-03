-- =============================================================================
-- Cours d'université rattachés à une filière.
-- La direction d'une université / école supérieure inscrit ses professeurs
-- (school_teachers). Un professeur inscrit crée ses cours, TD et TP pour
-- l'établissement et, s'il le souhaite, pour une filière : seuls les étudiants
-- validés de l'établissement (et de cette filière) les voient.
-- =============================================================================

create table public.school_teachers (
  school_id  uuid not null references public.schools (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (school_id, user_id)
);
create index school_teachers_user_idx on public.school_teachers (user_id);
alter table public.school_teachers enable row level security;

create or replace function public.is_school_teacher(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_school is not null and exists (
    select 1 from public.school_teachers t where t.school_id = p_school and t.user_id = auth.uid())
$$;

create or replace function public.student_program_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.program_id from public.students s where s.profile_id = auth.uid()
$$;

revoke execute on function public.is_school_teacher(uuid), public.student_program_id() from public, anon;
grant execute on function public.is_school_teacher(uuid), public.student_program_id() to authenticated;

create policy school_teachers_read on public.school_teachers for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin() or public.is_school_staff(school_id));
revoke all on public.school_teachers from anon, authenticated;
grant select on public.school_teachers to authenticated;

-- Inscrire / retirer un professeur : administration ou direction de l'établissement du supérieur
create or replace function public.school_add_teacher(p_school uuid, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_name text;
begin
  if not (public.is_admin() or (public.is_school_director(p_school) and public.is_higher_school(p_school))) then
    raise exception 'Accès refusé';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then raise exception 'Aucun compte avec cette adresse e-mail'; end if;
  select p.first_name || ' ' || p.last_name into v_name
  from public.profiles p join public.instructors i on i.profile_id = p.id
  where p.id = v_user and p.status = 'active' and p.role = 'instructor' and i.application_status = 'approved';
  if v_name is null then raise exception 'Ce compte n''est pas un intervenant validé'; end if;
  insert into public.school_teachers (school_id, user_id) values (p_school, v_user) on conflict do nothing;
  insert into public.notifications (user_id, type, title, body, link)
  select v_user, 'school_teacher', 'Vous enseignez à ' || sc.name,
         'Vous pouvez créer vos cours, TD et TP pour cet établissement et ses filières.', '/intervenant/cours'
  from public.schools sc where sc.id = p_school;
  return v_name;
end $$;

create or replace function public.school_remove_teacher(p_school uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_admin() or (public.is_school_director(p_school) and public.is_higher_school(p_school))) then
    raise exception 'Accès refusé';
  end if;
  delete from public.school_teachers where school_id = p_school and user_id = p_user;
end $$;

revoke execute on function public.school_add_teacher(uuid, text), public.school_remove_teacher(uuid, uuid) from public, anon;
grant execute on function public.school_add_teacher(uuid, text), public.school_remove_teacher(uuid, uuid) to authenticated;

-- Filière du cours (doit appartenir à l'établissement du cours)
alter table public.courses add column program_id uuid references public.school_programs (id) on delete set null;
create index courses_program_idx on public.courses (program_id);

create or replace function public.check_course_program() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.program_id is not null and not exists (
       select 1 from public.school_programs pr where pr.id = new.program_id and pr.school_id = new.school_id) then
    raise exception 'Cette filière n''appartient pas à l''établissement du cours';
  end if;
  return new;
end $$;
create trigger courses_check_program before insert or update of program_id, school_id on public.courses
  for each row execute function public.check_course_program();

-- Création : le professeur inscrit dans une université crée ses propres cours pour elle
drop policy courses_insert on public.courses;
create policy courses_insert on public.courses for insert to authenticated with check (
  public.is_admin()
  or (school_id is null and instructor_id = (select auth.uid()) and public.is_active_instructor()
      and exists (select 1 from public.teaching_assignments ta
                  where ta.instructor_id = (select auth.uid()) and ta.class_id = courses.class_id
                    and ta.subject_id = courses.subject_id))
  or (school_id is not null and not public.is_higher_school(school_id) and public.staff_covers(school_id, class_id)
      and exists (select 1 from public.profiles p join public.instructors i on i.profile_id = p.id
                  where p.id = courses.instructor_id and p.status = 'active' and i.application_status = 'approved'))
  or (school_id is not null and public.is_higher_school(school_id) and instructor_id = (select auth.uid())
      and public.is_active_instructor() and public.is_school_teacher(school_id)
      and exists (select 1 from public.classes c where c.id = courses.class_id and c.cycle = 'superieur')));

-- Visibilité : un cours de filière n'est visible que des étudiants de cette filière
create or replace function public.can_view_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_access_course(p_course) or exists (
    select 1 from public.courses c
    where c.id = p_course and c.status = 'published'
      and ((c.school_id is null
            and (public.is_active_instructor()
                 or (public.is_active_student() and c.class_id = public.student_class_id())))
        or (c.school_id is not null and public.is_active_student()
            and c.class_id = public.student_class_id() and public.in_school(c.school_id)
            and (c.program_id is null or c.program_id = public.student_program_id()))))
$$;

-- Notification de publication : seulement la filière concernée
create or replace function public.course_after_publish() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    insert into public.notifications (user_id, type, title, body, link)
    select s.profile_id, 'new_course', 'Nouveau cours disponible', new.title, '/cours/' || new.id
    from public.students s
    join public.profiles p on p.id = s.profile_id
    where s.class_id = new.class_id and p.status = 'active'
      and (new.school_id is null or (s.school_id = new.school_id and s.school_status = 'approved'))
      and (new.program_id is null or s.program_id = new.program_id);
  end if;
  return null;
end $$;
