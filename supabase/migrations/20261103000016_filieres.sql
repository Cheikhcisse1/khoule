-- =============================================================================
-- Filières des universités et écoles supérieures.
-- Le responsable d'un établissement du supérieur (doyen, directeur…) crée les
-- filières de son établissement mais ne crée pas de cours : les cours restent
-- l'affaire des professeurs (et de l'administration). L'étudiant choisit sa
-- filière à l'inscription quand il choisit un établissement partenaire.
-- =============================================================================

create or replace function public.is_higher_school(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.schools s where s.id = p_school and s.kind in ('universite', 'ecole_superieure'))
$$;

create or replace function public.is_school_director(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_school is not null and public.auth_role() is not null and exists (
    select 1 from public.school_staff st
    where st.school_id = p_school and st.user_id = auth.uid() and st.scope = 'school')
$$;

revoke execute on function public.is_higher_school(uuid), public.is_school_director(uuid) from public, anon;
grant execute on function public.is_higher_school(uuid), public.is_school_director(uuid) to authenticated;

create table public.school_programs (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  name       text not null check (length(trim(name)) > 1),
  -- niveaux ouverts dans la filière (classes L1…M2)
  class_ids  smallint[] not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
create index school_programs_school_idx on public.school_programs (school_id);
alter table public.school_programs enable row level security;

-- Lecture publique (comme la liste des établissements) : l'étudiant choisit sa filière à l'inscription
create policy school_programs_read on public.school_programs for select to anon, authenticated using (true);
create policy school_programs_write on public.school_programs for all to authenticated
  using (public.is_admin() or (public.is_school_director(school_id) and public.is_higher_school(school_id)))
  with check (public.is_admin() or (public.is_school_director(school_id) and public.is_higher_school(school_id)));
revoke all on public.school_programs from anon, authenticated;
grant select on public.school_programs to anon, authenticated;
grant insert, update, delete on public.school_programs to authenticated;

alter table public.students add column program_id uuid references public.school_programs (id) on delete set null;
create index students_program_idx on public.students (program_id);

-- La filière doit appartenir à l'établissement de l'étudiant
create or replace function public.protect_student_fields() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.guardian_consent and not old.guardian_consent then
    new.consent_at := now();
  end if;
  if auth.uid() is not null and not public.is_admin()
     and coalesce(current_setting('khoule.trusted', true), '') <> 'on' then
    if new.school_id is distinct from old.school_id then
      new.school_status := case when new.school_id is null then null else 'pending' end;
    else
      new.school_status := old.school_status;
    end if;
  end if;
  -- École supprimée (on delete set null) ou élève détaché : plus de statut
  if new.school_id is null then
    new.school_status := null;
  end if;
  if new.program_id is not null and not exists (
       select 1 from public.school_programs pr where pr.id = new.program_id and pr.school_id = new.school_id) then
    new.program_id := null;
  end if;
  return new;
end $$;

-- Inscription : on enregistre aussi la filière choisie (si elle appartient à l'établissement choisi)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role    text  := coalesce(meta ->> 'role', 'student');
  v_school  uuid;
  v_program uuid;
  v_class   smallint;
begin
  if v_role not in ('student', 'instructor') then
    v_role := 'student';
  end if;

  insert into public.profiles (id, role, status, first_name, last_name)
  values (new.id, v_role, 'pending',
          coalesce(nullif(trim(meta ->> 'first_name'), ''), 'Utilisateur'),
          coalesce(nullif(trim(meta ->> 'last_name'), ''), '—'));

  if v_role = 'student' then
    v_class := nullif(meta ->> 'class_id', '')::smallint;
    select sc.id into v_school from public.schools sc
     where sc.id::text = nullif(meta ->> 'school_id', '');
    select pr.id into v_program from public.school_programs pr
     where pr.id::text = nullif(meta ->> 'program_id', '') and pr.school_id = v_school;
    insert into public.students (profile_id, class_id, school, birth_year, phone,
                                 guardian_name, guardian_relation, guardian_phone, guardian_email,
                                 guardian_consent, consent_at, school_id, school_status, program_id)
    values (new.id, v_class,
            nullif(trim(meta ->> 'school'), ''),
            nullif(meta ->> 'birth_year', '')::smallint,
            nullif(trim(meta ->> 'phone'), ''),
            nullif(trim(meta ->> 'guardian_name'), ''),
            nullif(trim(meta ->> 'guardian_relation'), ''),
            nullif(trim(meta ->> 'guardian_phone'), ''),
            nullif(trim(meta ->> 'guardian_email'), ''),
            coalesce((meta ->> 'guardian_consent')::boolean, false),
            case when coalesce((meta ->> 'guardian_consent')::boolean, false) then now() end,
            v_school, case when v_school is not null then 'pending' end, v_program);

    insert into public.notifications (user_id, type, title, body, link)
    select p.id, 'student_signup',
           case when exists (select 1 from public.classes c where c.id = v_class and c.cycle = 'superieur')
                then 'Nouvelle inscription étudiant à valider' else 'Nouvelle inscription élève à valider' end,
           coalesce(meta ->> 'first_name', '') || ' ' || coalesce(meta ->> 'last_name', '') || ' attend la validation de son compte.',
           '/admin/utilisateurs'
    from public.profiles p where p.role = 'admin' and p.status = 'active';

    if v_school is not null then
      insert into public.notifications (user_id, type, title, body, link)
      select st.user_id, 'school_signup', 'Nouvelle inscription dans votre établissement',
             coalesce(meta ->> 'first_name', '') || ' ' || coalesce(meta ->> 'last_name', '') || ' demande à rejoindre votre établissement.',
             '/ecole'
      from public.school_staff st
      where st.school_id = v_school and (st.scope = 'school' or v_class = any (st.class_ids));
    end if;
  else
    insert into public.instructors (profile_id, instructor_type, education_level, specialty, experience)
    values (new.id,
            coalesce(nullif(meta ->> 'instructor_type', ''), 'enseignant'),
            nullif(trim(meta ->> 'education_level'), ''),
            nullif(trim(meta ->> 'specialty'), ''),
            nullif(trim(meta ->> 'experience'), ''));
    insert into public.instructor_contacts (profile_id, phone)
    values (new.id, nullif(trim(meta ->> 'phone'), ''));

    insert into public.notifications (user_id, type, title, body, link)
    select p.id, 'instructor_application', 'Nouvelle candidature d''intervenant',
           coalesce(meta ->> 'first_name', '') || ' ' || coalesce(meta ->> 'last_name', '') || ' souhaite rejoindre la plateforme.',
           '/admin/utilisateurs'
    from public.profiles p where p.role = 'admin' and p.status = 'active';
  end if;
  return new;
end $$;

-- Cours d'école : le responsable d'un établissement du supérieur ne peut plus en créer
drop policy courses_insert on public.courses;
create policy courses_insert on public.courses for insert to authenticated with check (
  public.is_admin()
  or (school_id is null and instructor_id = (select auth.uid()) and public.is_active_instructor()
      and exists (select 1 from public.teaching_assignments ta
                  where ta.instructor_id = (select auth.uid()) and ta.class_id = courses.class_id
                    and ta.subject_id = courses.subject_id))
  or (school_id is not null and not public.is_higher_school(school_id) and public.staff_covers(school_id, class_id)
      and exists (select 1 from public.profiles p join public.instructors i on i.profile_id = p.id
                  where p.id = courses.instructor_id and p.status = 'active' and i.application_status = 'approved')));
