-- =====================================================================
-- Khoulé Éducation — 11. Renforcement de la sécurité
-- 1. Les nouveaux comptes élèves attendent la validation de l'administration.
-- 2. Un administrateur qui a activé la vérification en deux étapes (2FA)
--    n'a ses droits que lorsqu'il s'est connecté avec son code (niveau aal2).
-- 3. Seuls les types de fichiers courants (PDF, images, documents, vidéos)
--    sont acceptés dans le stockage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Validation des comptes élèves
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text  := coalesce(meta ->> 'role', 'student');
begin
  if v_role not in ('student', 'instructor') then
    v_role := 'student';
  end if;

  -- Tous les nouveaux comptes sont en attente : l'administration valide élèves et intervenants
  insert into public.profiles (id, role, status, first_name, last_name)
  values (new.id, v_role, 'pending',
          coalesce(nullif(trim(meta ->> 'first_name'), ''), 'Utilisateur'),
          coalesce(nullif(trim(meta ->> 'last_name'), ''), '—'));

  if v_role = 'student' then
    insert into public.students (profile_id, class_id, school, birth_year, phone,
                                 guardian_name, guardian_relation, guardian_phone, guardian_email,
                                 guardian_consent, consent_at)
    values (new.id,
            nullif(meta ->> 'class_id', '')::smallint,
            nullif(trim(meta ->> 'school'), ''),
            nullif(meta ->> 'birth_year', '')::smallint,
            nullif(trim(meta ->> 'phone'), ''),
            nullif(trim(meta ->> 'guardian_name'), ''),
            nullif(trim(meta ->> 'guardian_relation'), ''),
            nullif(trim(meta ->> 'guardian_phone'), ''),
            nullif(trim(meta ->> 'guardian_email'), ''),
            coalesce((meta ->> 'guardian_consent')::boolean, false),
            case when coalesce((meta ->> 'guardian_consent')::boolean, false) then now() end);

    insert into public.notifications (user_id, type, title, body, link)
    select p.id, 'student_signup', 'Nouvelle inscription élève à valider',
           coalesce(meta ->> 'first_name', '') || ' ' || coalesce(meta ->> 'last_name', '') || ' attend la validation de son compte.',
           '/admin/utilisateurs'
    from public.profiles p where p.role = 'admin' and p.status = 'active';
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

-- L'élève est prévenu quand son compte est validé
create or replace function public.profile_after_activation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'student' and old.status = 'pending' and new.status = 'active' then
    insert into public.notifications (user_id, type, title, body, link)
    values (new.id, 'account_validated', 'Votre compte est validé 🎉',
            'Bienvenue sur Khoulé Éducation ! Vous pouvez maintenant rejoindre les cours de votre classe.', '/eleve/cours');
  end if;
  return null;
end $$;
revoke execute on function public.profile_after_activation() from public, anon, authenticated;
create trigger profiles_after_activation after update of status on public.profiles
  for each row execute function public.profile_after_activation();

-- ---------------------------------------------------------------------
-- 2. Droits administrateur liés à la vérification en deux étapes
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'admin' and p.status = 'active')
     and (coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
          or not exists (select 1 from auth.mfa_factors f
                         where f.user_id = auth.uid() and f.status = 'verified'))
$$;

-- Statistiques : comptes élèves en attente
create or replace function public.pending_students_count() returns bigint
language sql stable security definer set search_path = '' as $$
  select case when public.is_admin()
    then (select count(*) from public.profiles where role = 'student' and status = 'pending') else 0 end
$$;
revoke execute on function public.pending_students_count() from public, anon;
grant execute on function public.pending_students_count() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Types de fichiers autorisés dans le stockage
-- ---------------------------------------------------------------------
update storage.buckets set allowed_mime_types = array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet', 'text/plain',
  'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/ogg']
where id in ('course-materials', 'library');

update storage.buckets set allowed_mime_types = array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text', 'text/plain']
where id in ('submissions', 'corrections');
