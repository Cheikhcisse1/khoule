-- =====================================================================
-- Khoulé Éducation — 2. Fonctions d'autorisation et triggers
-- =====================================================================

-- Coordonnées privées des intervenants (séparées pour ne pas les exposer avec le profil public)
create table public.instructor_contacts (
  profile_id uuid primary key references public.instructors (profile_id) on delete cascade,
  phone      text,
  whatsapp   text
);

-- ---------------------------------------------------------------------
-- Fonctions d'autorisation (security definer : évitent la récursion RLS)
-- ---------------------------------------------------------------------
create or replace function public.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function public.auth_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.status = 'active'
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'admin' and p.status = 'active')
$$;

create or replace function public.is_active_instructor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 join public.instructors i on i.profile_id = p.id
                 where p.id = auth.uid() and p.role = 'instructor' and p.status = 'active'
                   and i.application_status = 'approved')
$$;

create or replace function public.is_active_student() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'student' and p.status = 'active')
$$;

create or replace function public.student_class_id() returns smallint
language sql stable security definer set search_path = '' as $$
  select s.class_id from public.students s where s.profile_id = auth.uid()
$$;

create or replace function public.is_course_instructor(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_instructor() and exists (
    select 1 from public.courses c where c.id = p_course and c.instructor_id = auth.uid())
$$;

create or replace function public.can_manage_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.is_course_instructor(p_course)
$$;

create or replace function public.is_enrolled(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_student() and exists (
    select 1 from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.course_id = p_course and e.student_id = auth.uid()
      and e.status = 'active' and c.status = 'published')
$$;

-- Accès au contenu d'un cours (leçons, supports, devoirs, discussion)
create or replace function public.can_access_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_manage_course(p_course) or public.is_enrolled(p_course)
$$;

-- Visibilité de la fiche d'un cours (catalogue) : cours publiés de la classe de l'élève
create or replace function public.can_view_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_access_course(p_course) or exists (
    select 1 from public.courses c
    where c.id = p_course and c.status = 'published'
      and (public.is_active_instructor()
           or (public.is_active_student() and c.class_id = public.student_class_id())))
$$;

create or replace function public.assignment_course(p_assignment uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.course_id from public.assignments a where a.id = p_assignment
$$;

create or replace function public.submission_course(p_submission uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.course_id from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  where s.id = p_submission
$$;

create or replace function public.can_view_submission(p_submission uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.submissions s where s.id = p_submission and s.student_id = auth.uid())
      or public.can_manage_course(public.submission_course(p_submission))
$$;

create or replace function public.question_course(p_question uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select q.course_id from public.questions q where q.id = p_question
$$;

-- L'intervenant connecté enseigne-t-il à cet élève ?
create or replace function public.teaches_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_instructor() and exists (
    select 1 from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.student_id = p_student and c.instructor_id = auth.uid())
$$;

-- Qui peut voir la fiche (nom, prénom, rôle) d'un utilisateur ?
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
      -- élèves inscrits à un même cours (fil de discussion)
      or (public.is_active_student() and exists (
            select 1 from public.enrollments mine
            join public.enrollments other on other.course_id = mine.course_id
            where mine.student_id = auth.uid() and other.student_id = p_target
              and mine.status = 'active' and other.status = 'active'))
$$;

-- Messages directs : un élève ne peut écrire qu'à un intervenant ou un admin
create or replace function public.can_message(p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.auth_role() is not null and public.can_see_profile(p_target) and (
    public.auth_role() in ('admin', 'instructor')
    or exists (select 1 from public.profiles p where p.id = p_target and p.role in ('admin', 'instructor')))
$$;

-- ---------------------------------------------------------------------
-- Utilitaire : créer une notification
-- ---------------------------------------------------------------------
create or replace function public.notify(p_user uuid, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user, p_type, p_title, p_body, p_link)
$$;
revoke execute on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_course_students(p_course uuid, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, title, body, link)
  select e.student_id, p_type, p_title, p_body, p_link
  from public.enrollments e where e.course_id = p_course and e.status = 'active'
$$;
revoke execute on function public.notify_course_students(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Création automatique du profil à l'inscription
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text  := coalesce(meta ->> 'role', 'student');
begin
  -- Jamais d'admin via l'inscription publique
  if v_role not in ('student', 'instructor') then
    v_role := 'student';
  end if;

  insert into public.profiles (id, role, status, first_name, last_name)
  values (new.id, v_role,
          case when v_role = 'instructor' then 'pending' else 'active' end,
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Protection des champs sensibles (rôle, statut, candidature)
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- auth.uid() nul = rôle service / SQL editor : pas de restriction
  if auth.uid() is not null and not public.is_admin() then
    new.role   := old.role;
    new.status := old.status;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

create or replace function public.protect_instructor_fields() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.application_status := old.application_status;
    new.rejection_reason   := old.rejection_reason;
    new.reviewed_by        := old.reviewed_by;
    new.reviewed_at        := old.reviewed_at;
  end if;
  return new;
end $$;
create trigger instructors_protect before update on public.instructors
  for each row execute function public.protect_instructor_fields();

create or replace function public.protect_student_fields() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.guardian_consent and not old.guardian_consent then
    new.consent_at := now();
  end if;
  return new;
end $$;
create trigger students_protect before update on public.students
  for each row execute function public.protect_student_fields();

-- Validation / refus d'une candidature (admin uniquement)
create or replace function public.review_instructor(p_instructor uuid, p_decision text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Décision invalide';
  end if;

  update public.instructors
     set application_status = p_decision,
         rejection_reason   = case when p_decision = 'rejected' then p_reason end,
         reviewed_by        = auth.uid(),
         reviewed_at        = now()
   where profile_id = p_instructor;
  if not found then
    raise exception 'Intervenant introuvable';
  end if;

  update public.profiles
     set status = case when p_decision = 'approved' then 'active' else 'pending' end
   where id = p_instructor;

  perform public.notify(p_instructor, 'application_review',
    case when p_decision = 'approved' then 'Candidature acceptée 🎉' else 'Candidature non retenue' end,
    case when p_decision = 'approved'
         then 'Bienvenue parmi les intervenants de Khoulé Éducation ! Vous pouvez créer vos cours.'
         else coalesce(p_reason, 'Contactez l''administration pour plus d''informations.') end,
    '/intervenant');
end $$;

-- ---------------------------------------------------------------------
-- updated_at générique
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger courses_touch     before update on public.courses     for each row execute function public.touch_updated_at();
create trigger lessons_touch     before update on public.lessons     for each row execute function public.touch_updated_at();
create trigger submissions_touch before update on public.submissions for each row execute function public.touch_updated_at();
create trigger corrections_touch before update on public.corrections for each row execute function public.touch_updated_at();
create trigger grades_touch      before update on public.grades      for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Cours : date de publication + notification des élèves de la classe
-- ---------------------------------------------------------------------
create or replace function public.course_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;
create trigger courses_before_write before insert or update on public.courses
  for each row execute function public.course_before_write();

create or replace function public.course_after_publish() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    insert into public.notifications (user_id, type, title, body, link)
    select s.profile_id, 'new_course', 'Nouveau cours disponible',
           new.title, '/cours/' || new.id
    from public.students s
    join public.profiles p on p.id = s.profile_id
    where s.class_id = new.class_id and p.status = 'active';
  end if;
  return null;
end $$;
create trigger courses_after_publish after insert or update of status on public.courses
  for each row execute function public.course_after_publish();

-- Nouvelle séance
create or replace function public.session_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_course_students(new.course_id, 'new_session', 'Nouvelle séance programmée',
    new.title || ' — ' || to_char(new.starts_at at time zone 'Africa/Dakar', 'DD/MM/YYYY HH24:MI'),
    '/calendrier');
  return null;
end $$;
create trigger course_sessions_after_insert after insert on public.course_sessions
  for each row execute function public.session_after_insert();

-- ---------------------------------------------------------------------
-- Devoirs / soumissions / notes
-- ---------------------------------------------------------------------
create or replace function public.assignment_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select e.course_id into new.course_id from public.exercises e where e.id = new.exercise_id;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;
create trigger assignments_before_insert before insert or update on public.assignments
  for each row execute function public.assignment_before_insert();

create or replace function public.assignment_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text;
begin
  select title into v_title from public.exercises where id = new.exercise_id;
  perform public.notify_course_students(new.course_id, 'new_assignment', 'Nouveau devoir',
    v_title || coalesce(' — à rendre le ' || to_char(new.due_at at time zone 'Africa/Dakar', 'DD/MM à HH24:MI'), ''),
    '/eleve/devoirs');
  return null;
end $$;
create trigger assignments_after_insert after insert on public.assignments
  for each row execute function public.assignment_after_insert();

create or replace function public.submission_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'submitted';
    new.submitted_at := now();
  elsif auth.uid() is not null and not public.can_manage_course(public.assignment_course(new.assignment_id)) then
    -- l'élève ne peut modifier ni le statut ni le devoir visé
    new.status := old.status;
    new.assignment_id := old.assignment_id;
    new.student_id := old.student_id;
  end if;
  return new;
end $$;
create trigger submissions_before_write before insert or update on public.submissions
  for each row execute function public.submission_before_write();

create or replace function public.submission_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_instructor uuid; v_title text; v_student text;
begin
  select c.instructor_id, e.title into v_instructor, v_title
  from public.assignments a
  join public.courses c on c.id = a.course_id
  join public.exercises e on e.id = a.exercise_id
  where a.id = new.assignment_id;
  select first_name || ' ' || last_name into v_student from public.profiles where id = new.student_id;
  perform public.notify(v_instructor, 'new_submission', 'Nouveau devoir rendu',
    v_student || ' a rendu « ' || v_title || ' »', '/intervenant/corrections');
  return null;
end $$;
create trigger submissions_after_insert after insert on public.submissions
  for each row execute function public.submission_after_insert();

create or replace function public.grade_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select s.student_id, a.course_id, a.id, e.max_score
    into new.student_id, new.course_id, new.assignment_id, new.max_score
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  join public.exercises e on e.id = a.exercise_id
  where s.id = new.submission_id;
  new.graded_by := coalesce(auth.uid(), new.graded_by);
  if new.score > new.max_score then
    raise exception 'La note (%) dépasse le barème (%)', new.score, new.max_score;
  end if;
  return new;
end $$;
create trigger grades_before_write before insert or update on public.grades
  for each row execute function public.grade_before_write();

create or replace function public.grade_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.submissions set status = 'corrected' where id = new.submission_id;
  perform public.notify(new.student_id, 'new_grade', 'Nouvelle note',
    'Vous avez obtenu ' || trim(to_char(new.score, 'FM990.##')) || '/' || trim(to_char(new.max_score, 'FM990.##')),
    '/eleve/notes');
  return null;
end $$;
create trigger grades_after_write after insert or update of score on public.grades
  for each row execute function public.grade_after_write();

create or replace function public.correction_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_student uuid;
begin
  select student_id into v_student from public.submissions where id = new.submission_id;
  perform public.notify(v_student, 'new_correction', 'Correction disponible',
    'Votre devoir a été corrigé. Consultez les commentaires de votre intervenant.', '/eleve/devoirs');
  return null;
end $$;
create trigger corrections_after_insert after insert on public.corrections
  for each row execute function public.correction_after_insert();

-- ---------------------------------------------------------------------
-- Questions / réponses
-- ---------------------------------------------------------------------
create or replace function public.question_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_instructor uuid;
begin
  select instructor_id into v_instructor from public.courses where id = new.course_id;
  if v_instructor <> new.author_id then
    perform public.notify(v_instructor, 'new_question', 'Nouvelle question', new.title,
      '/questions/' || new.id);
  end if;
  return null;
end $$;
create trigger questions_after_insert after insert on public.questions
  for each row execute function public.question_after_insert();

create or replace function public.answer_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_q public.questions%rowtype; v_role text;
begin
  select * into v_q from public.questions where id = new.question_id;
  select role into v_role from public.profiles where id = new.author_id;
  if v_role in ('instructor', 'admin') and v_q.status = 'open' then
    update public.questions set status = 'answered' where id = v_q.id;
  end if;
  if v_q.author_id <> new.author_id then
    perform public.notify(v_q.author_id, 'new_answer', 'Nouvelle réponse à votre question', v_q.title,
      '/questions/' || v_q.id);
  end if;
  return null;
end $$;
create trigger answers_after_insert after insert on public.answers
  for each row execute function public.answer_after_insert();

-- ---------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------
create or replace function public.message_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    -- seuls read_at (destinataire) et is_hidden (modérateur du cours) peuvent évoluer
    new.body := old.body;
    new.sender_id := old.sender_id;
    new.recipient_id := old.recipient_id;
    new.course_id := old.course_id;
    new.created_at := old.created_at;
    if old.course_id is null or not public.can_manage_course(old.course_id) then
      new.is_hidden := old.is_hidden;
    end if;
  end if;
  return new;
end $$;
create trigger messages_before_update before update on public.messages
  for each row execute function public.message_before_update();

create or replace function public.message_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_sender text;
begin
  if new.recipient_id is not null then
    select first_name || ' ' || last_name into v_sender from public.profiles where id = new.sender_id;
    perform public.notify(new.recipient_id, 'new_message', 'Nouveau message de ' || v_sender,
      left(new.body, 120), '/messages?avec=' || new.sender_id);
  end if;
  return null;
end $$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.message_after_insert();

-- ---------------------------------------------------------------------
-- Annonces
-- ---------------------------------------------------------------------
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
         or (new.audience = 'class' and s.class_id = new.class_id));
  return null;
end $$;
create trigger announcements_after_insert after insert on public.announcements
  for each row execute function public.announcement_after_insert();
