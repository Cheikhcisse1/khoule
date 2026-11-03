-- =============================================================================
-- Espaces école : chaque établissement (école, collège, lycée, université…) a ses
-- responsables (directeur / proviseur = toute l'école ; responsable de filière =
-- seulement certaines classes). Un responsable voit et gère SON école uniquement :
-- élèves (validation), notes, travaux, progression, cours de l'école, annonces.
-- Les cours communautaires (school_id null) restent ouverts comme avant.
-- =============================================================================

-- 1. Tables ------------------------------------------------------------------
create table public.schools (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) > 1),
  kind       text not null default 'autre'
               check (kind in ('elementaire', 'college', 'lycee', 'universite', 'ecole_superieure', 'autre')),
  city       text,
  created_at timestamptz not null default now()
);

create table public.school_staff (
  school_id  uuid not null references public.schools (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null default 'directeur'
               check (title in ('directeur', 'proviseur', 'principal', 'doyen', 'chef_departement', 'responsable_filiere', 'autre')),
  -- 'school' : toute l'école ; 'classes' : uniquement les classes listées
  scope      text not null default 'school' check (scope in ('school', 'classes')),
  class_ids  smallint[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (school_id, user_id),
  check (scope = 'school' or cardinality(class_ids) > 0)
);
create index school_staff_user_idx on public.school_staff (user_id);

alter table public.students
  add column school_id uuid references public.schools (id) on delete set null,
  add column school_status text check (school_status in ('pending', 'approved', 'rejected')),
  add constraint students_school_status_chk check ((school_id is null) = (school_status is null));
create index students_school_idx on public.students (school_id);

alter table public.courses add column school_id uuid references public.schools (id) on delete cascade;
create index courses_school_idx on public.courses (school_id);

alter table public.announcements add column school_id uuid references public.schools (id) on delete cascade;
create index announcements_school_idx on public.announcements (school_id);

-- 2. Fonctions d'autorisation ---------------------------------------------------
-- Le responsable connecté couvre-t-il cette classe de cette école ?
create or replace function public.staff_covers(p_school uuid, p_class smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_school is not null and public.auth_role() is not null and exists (
    select 1 from public.school_staff st
    where st.school_id = p_school and st.user_id = auth.uid()
      and (st.scope = 'school' or p_class = any (st.class_ids)))
$$;

create or replace function public.is_school_staff(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_school is not null and public.auth_role() is not null and exists (
    select 1 from public.school_staff st where st.school_id = p_school and st.user_id = auth.uid())
$$;

create or replace function public.is_school_director(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_school is not null and public.auth_role() is not null and exists (
    select 1 from public.school_staff st where st.school_id = p_school and st.user_id = auth.uid() and st.scope = 'school')
$$;

-- Élève (même en attente de validation) d'une école et d'une classe couvertes par le responsable
create or replace function public.staff_sees_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.students s
                 where s.profile_id = p_student and s.school_id is not null
                   and public.staff_covers(s.school_id, s.class_id))
$$;

-- L'utilisateur connecté est-il un élève validé de cette école ?
create or replace function public.in_school(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.students s
                 where s.profile_id = auth.uid() and s.school_id = p_school and s.school_status = 'approved')
$$;

create or replace function public.can_manage_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.is_course_instructor(p_course) or exists (
    select 1 from public.courses c
    where c.id = p_course and c.school_id is not null and public.staff_covers(c.school_id, c.class_id))
$$;

create or replace function public.can_view_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_access_course(p_course) or exists (
    select 1 from public.courses c
    where c.id = p_course and c.status = 'published'
      and ((c.school_id is null
            and (public.is_active_instructor()
                 or (public.is_active_student() and c.class_id = public.student_class_id())))
        or (c.school_id is not null and public.is_active_student()
            and c.class_id = public.student_class_id() and public.in_school(c.school_id))))
$$;

create or replace function public.can_view_submission(p_submission uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.submissions s where s.id = p_submission
                   and (s.student_id = auth.uid() or public.staff_sees_student(s.student_id)))
      or public.can_manage_course(public.submission_course(p_submission))
$$;

create or replace function public.can_see_profile(p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_target = auth.uid()
      or public.is_admin()
      or (public.auth_role() is not null and exists (
            select 1 from public.profiles p
            left join public.instructors i on i.profile_id = p.id
            where p.id = p_target and p.status = 'active'
              and (p.role = 'admin' or (p.role = 'instructor' and i.application_status = 'approved'))))
      or public.teaches_student(p_target)
      or public.staff_sees_student(p_target)
      or (public.is_active_student() and exists (
            select 1 from public.enrollments mine
            join public.enrollments other on other.course_id = mine.course_id
            where mine.student_id = auth.uid() and other.student_id = p_target
              and mine.status = 'active' and other.status = 'active'))
$$;

-- 3. Politiques RLS -------------------------------------------------------------
alter table public.schools enable row level security;
alter table public.school_staff enable row level security;
revoke all on public.school_staff from anon;

create policy schools_read on public.schools for select to anon, authenticated using (true);
create policy schools_admin on public.schools for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Équipe : visible par ses membres et l'admin ; modifiée par l'admin ou via les fonctions sécurisées
create policy school_staff_read on public.school_staff for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin() or public.is_school_staff(school_id));
create policy school_staff_admin on public.school_staff for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy students_read on public.students;
create policy students_read on public.students for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin() or public.teaches_student(profile_id)
         or public.staff_sees_student(profile_id));

drop policy courses_insert on public.courses;
create policy courses_insert on public.courses for insert to authenticated with check (
  public.is_admin()
  or (school_id is null and instructor_id = (select auth.uid()) and public.is_active_instructor()
      and exists (select 1 from public.teaching_assignments ta
                  where ta.instructor_id = (select auth.uid()) and ta.class_id = courses.class_id
                    and ta.subject_id = courses.subject_id))
  or (school_id is not null and public.staff_covers(school_id, class_id)
      and exists (select 1 from public.profiles p join public.instructors i on i.profile_id = p.id
                  where p.id = courses.instructor_id and p.status = 'active' and i.application_status = 'approved')));

drop policy courses_update on public.courses;
create policy courses_update on public.courses for update to authenticated
  using (public.can_manage_course(id))
  with check (
    public.is_admin()
    or (school_id is null and instructor_id = (select auth.uid())
        and exists (select 1 from public.teaching_assignments ta
                    where ta.instructor_id = (select auth.uid()) and ta.class_id = courses.class_id
                      and ta.subject_id = courses.subject_id))
    or (school_id is not null and (public.staff_covers(school_id, class_id) or instructor_id = (select auth.uid()))));

drop policy enrollments_insert on public.enrollments;
create policy enrollments_insert on public.enrollments for insert to authenticated with check (
  public.is_admin()
  or (student_id = (select auth.uid()) and public.is_active_student() and exists (
        select 1 from public.courses c
        where c.id = enrollments.course_id and c.status = 'published' and c.class_id = public.student_class_id()
          and (c.school_id is null or public.in_school(c.school_id)))));

drop policy enrollments_read on public.enrollments;
create policy enrollments_read on public.enrollments for select to authenticated
  using (student_id = (select auth.uid()) or public.can_manage_course(course_id) or public.staff_sees_student(student_id));

drop policy grades_read on public.grades;
create policy grades_read on public.grades for select to authenticated
  using (student_id = (select auth.uid()) or public.can_manage_course(course_id) or public.staff_sees_student(student_id));

drop policy submissions_read on public.submissions;
create policy submissions_read on public.submissions for select to authenticated
  using (student_id = (select auth.uid()) or public.can_manage_course(public.assignment_course(assignment_id))
         or public.staff_sees_student(student_id));

drop policy lesson_progress_read on public.lesson_progress;
create policy lesson_progress_read on public.lesson_progress for select to authenticated
  using (student_id = (select auth.uid())
         or public.can_manage_course((select l.course_id from public.lessons l where l.id = lesson_progress.lesson_id))
         or public.staff_sees_student(student_id));

drop policy announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated using (
  public.is_admin()
  or public.is_school_staff(school_id)
  or (public.auth_role() is not null and published_at <= now() and (expires_at is null or expires_at > now())
      and (audience = 'all'
           or (audience = 'students' and public.auth_role() = 'student')
           or (audience = 'instructors' and public.auth_role() = 'instructor')
           or (audience = 'class' and class_id = public.student_class_id()))
      and (school_id is null or public.in_school(school_id)
           or exists (select 1 from public.courses c where c.school_id = announcements.school_id
                        and c.instructor_id = (select auth.uid())))));

-- Annonces d'école : le directeur écrit à toute l'école, un responsable de filière à ses classes
create policy announcements_school on public.announcements for all to authenticated
  using (public.is_school_staff(school_id))
  with check (school_id is not null and author_id = (select auth.uid())
              and ((audience = 'class' and public.staff_covers(school_id, class_id))
                   or (audience <> 'class' and public.is_school_director(school_id))));

-- 4. Garde-fous (triggers) --------------------------------------------------------
-- Les fonctions de validation positionnent khoule.trusted pour la durée de la transaction.
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and coalesce(current_setting('khoule.trusted', true), '') <> 'on' then
    new.role   := old.role;
    new.status := old.status;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Un élève peut choisir (ou quitter) une école, mais jamais s'auto-valider
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
  return new;
end $$;

-- Un cours d'école ne change pas d'école, et seule la direction peut le changer de classe
create or replace function public.protect_course_school() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_admin() or auth.uid() is null then return new; end if;
  if new.school_id is distinct from old.school_id then
    raise exception 'Le changement d''école d''un cours est réservé à l''administration';
  end if;
  if new.school_id is not null and new.class_id <> old.class_id and not public.staff_covers(new.school_id, new.class_id) then
    raise exception 'Seule la direction de l''école peut changer la classe de ce cours';
  end if;
  return new;
end $$;
create trigger courses_protect_school before update on public.courses
  for each row execute function public.protect_course_school();

-- Nouveau cours publié : seulement les élèves validés de l'école pour un cours d'école
create or replace function public.course_after_publish() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    insert into public.notifications (user_id, type, title, body, link)
    select s.profile_id, 'new_course', 'Nouveau cours disponible', new.title, '/cours/' || new.id
    from public.students s
    join public.profiles p on p.id = s.profile_id
    where s.class_id = new.class_id and p.status = 'active'
      and (new.school_id is null or (s.school_id = new.school_id and s.school_status = 'approved'));
  end if;
  return null;
end $$;

-- Annonce : une annonce d'école ne notifie que les membres de cette école
create or replace function public.announcement_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select p.id, 'announcement', '📢 ' || new.title, left(new.body, 160), '/annonces'
  from public.profiles p
  left join public.students s on s.profile_id = p.id
  where p.status = 'active' and p.id is distinct from new.author_id
    and (new.audience = 'all'
         or (new.audience = 'students' and p.role = 'student')
         or (new.audience = 'instructors' and p.role = 'instructor')
         or (new.audience = 'class' and s.class_id = new.class_id))
    and (new.school_id is null
         or (s.school_id = new.school_id and s.school_status = 'approved')
         or exists (select 1 from public.school_staff st where st.school_id = new.school_id and st.user_id = p.id)
         or exists (select 1 from public.courses c where c.school_id = new.school_id and c.instructor_id = p.id));
  return null;
end $$;

-- Inscription : l'élève peut choisir une école partenaire ; ses responsables sont prévenus
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role   text  := coalesce(meta ->> 'role', 'student');
  v_school uuid;
  v_class  smallint;
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
    insert into public.students (profile_id, class_id, school, birth_year, phone,
                                 guardian_name, guardian_relation, guardian_phone, guardian_email,
                                 guardian_consent, consent_at, school_id, school_status)
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
            v_school, case when v_school is not null then 'pending' end);

    insert into public.notifications (user_id, type, title, body, link)
    select p.id, 'student_signup', 'Nouvelle inscription élève à valider',
           coalesce(meta ->> 'first_name', '') || ' ' || coalesce(meta ->> 'last_name', '') || ' attend la validation de son compte.',
           '/admin/utilisateurs'
    from public.profiles p where p.role = 'admin' and p.status = 'active';

    if v_school is not null then
      insert into public.notifications (user_id, type, title, body, link)
      select st.user_id, 'school_signup', 'Nouvel élève de votre établissement',
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

-- 5. Actions sécurisées des responsables ------------------------------------------
-- Valider ou refuser un élève de son école (valider active aussi son compte s'il était en attente)
create or replace function public.school_review_student(p_student uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_school uuid; v_class smallint;
begin
  select s.school_id, s.class_id into v_school, v_class from public.students s where s.profile_id = p_student;
  if v_school is null or not (public.is_admin() or public.staff_covers(v_school, v_class)) then
    raise exception 'Accès refusé';
  end if;
  perform set_config('khoule.trusted', 'on', true);
  update public.students set school_status = case when p_approve then 'approved' else 'rejected' end
   where profile_id = p_student;
  if p_approve then
    update public.profiles set status = 'active' where id = p_student and status = 'pending';
    insert into public.notifications (user_id, type, title, body, link)
    select p_student, 'school_approved', 'Votre établissement vous a validé 🎉',
           'Vous avez maintenant accès aux cours de ' || sc.name || '.', '/eleve/cours'
    from public.schools sc where sc.id = v_school;
  end if;
  perform set_config('khoule.trusted', 'off', true);
end $$;

-- Retirer un élève de son école (son compte reste actif)
create or replace function public.school_remove_student(p_student uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_school uuid; v_class smallint;
begin
  select s.school_id, s.class_id into v_school, v_class from public.students s where s.profile_id = p_student;
  if v_school is null or not (public.is_admin() or public.staff_covers(v_school, v_class)) then
    raise exception 'Accès refusé';
  end if;
  perform set_config('khoule.trusted', 'on', true);
  update public.students set school_id = null, school_status = null where profile_id = p_student;
  perform set_config('khoule.trusted', 'off', true);
end $$;

-- Nommer un responsable par son e-mail : l'admin pour tout ; le directeur pour ses responsables de filière
create or replace function public.school_add_staff(p_school uuid, p_email text, p_title text, p_scope text, p_class_ids smallint[])
returns text
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_name text;
begin
  if not (public.is_admin() or (public.is_school_director(p_school) and p_scope = 'classes')) then
    raise exception 'Accès refusé';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then raise exception 'Aucun compte avec cette adresse e-mail'; end if;
  select p.first_name || ' ' || p.last_name into v_name from public.profiles p where p.id = v_user and p.status = 'active';
  if v_name is null then raise exception 'Ce compte n''est pas encore actif'; end if;
  insert into public.school_staff (school_id, user_id, title, scope, class_ids)
  values (p_school, v_user, p_title, p_scope, case when p_scope = 'school' then '{}' else coalesce(p_class_ids, '{}') end)
  on conflict (school_id, user_id) do update
    set title = excluded.title, scope = excluded.scope, class_ids = excluded.class_ids;
  insert into public.notifications (user_id, type, title, body, link)
  select v_user, 'school_staff', 'Vous êtes responsable dans ' || sc.name, 'Votre espace école est disponible.', '/ecole'
  from public.schools sc where sc.id = p_school;
  return v_name;
end $$;

create or replace function public.school_remove_staff(p_school uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_admin() or (public.is_school_director(p_school) and exists (
            select 1 from public.school_staff st where st.school_id = p_school and st.user_id = p_user and st.scope = 'classes'))) then
    raise exception 'Accès refusé';
  end if;
  delete from public.school_staff where school_id = p_school and user_id = p_user;
end $$;

revoke execute on function public.school_review_student(uuid, boolean), public.school_remove_student(uuid),
  public.school_add_staff(uuid, text, text, text, smallint[]), public.school_remove_staff(uuid, uuid) from public, anon;
grant execute on function public.school_review_student(uuid, boolean), public.school_remove_student(uuid),
  public.school_add_staff(uuid, text, text, text, smallint[]), public.school_remove_staff(uuid, uuid) to authenticated;

-- Fonctions d'aide : jamais appelables sans être connecté (convention du projet)
revoke execute on function public.staff_covers(uuid, smallint), public.is_school_staff(uuid), public.is_school_director(uuid),
  public.staff_sees_student(uuid), public.in_school(uuid), public.protect_course_school() from public, anon;
grant execute on function public.staff_covers(uuid, smallint), public.is_school_staff(uuid), public.is_school_director(uuid),
  public.staff_sees_student(uuid), public.in_school(uuid) to authenticated;

-- Suppression d'une école (on delete set null) : le statut de rattachement est effacé avec elle
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
  if new.school_id is null then
    new.school_status := null;
  end if;
  return new;
end $$;
