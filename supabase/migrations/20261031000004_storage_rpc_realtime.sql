-- =====================================================================
-- Khoulé Éducation — 4. Storage, fonctions RPC, Realtime
-- =====================================================================

-- ---------------------------------------------------------------------
-- Buckets (privés sauf avatars). Le 1er dossier du chemin porte l'autorisation.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('course-materials', 'course-materials', false, 52428800, null),          -- 50 Mo
  ('submissions',      'submissions',      false, 20971520, null),          -- 20 Mo
  ('corrections',      'corrections',      false, 20971520, null),
  ('avatars',          'avatars',          true,  2097152,
     array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- course-materials/{course_id}/...
create policy materials_read on storage.objects for select to authenticated
  using (bucket_id = 'course-materials'
         and public.can_access_course(public.try_uuid((storage.foldername(name))[1])));
create policy materials_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'course-materials'
         and public.can_manage_course(public.try_uuid((storage.foldername(name))[1])));
create policy materials_update on storage.objects for update to authenticated
  using (bucket_id = 'course-materials'
         and public.can_manage_course(public.try_uuid((storage.foldername(name))[1])));
create policy materials_delete on storage.objects for delete to authenticated
  using (bucket_id = 'course-materials'
         and public.can_manage_course(public.try_uuid((storage.foldername(name))[1])));

-- submissions/{student_id}/{assignment_id}/...
create policy submissions_files_read on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.can_manage_course(public.assignment_course(public.try_uuid((storage.foldername(name))[2])))));
create policy submissions_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_enrolled(public.assignment_course(public.try_uuid((storage.foldername(name))[2]))));
create policy submissions_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'submissions' and (storage.foldername(name))[1] = auth.uid()::text);

-- corrections/{submission_id}/...
create policy corrections_files_read on storage.objects for select to authenticated
  using (bucket_id = 'corrections'
         and public.can_view_submission(public.try_uuid((storage.foldername(name))[1])));
create policy corrections_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'corrections'
         and public.can_manage_course(public.submission_course(public.try_uuid((storage.foldername(name))[1]))));
create policy corrections_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'corrections'
         and public.can_manage_course(public.submission_course(public.try_uuid((storage.foldername(name))[1]))));

-- avatars/{user_id}/...
create policy avatars_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- Statistiques administrateur
-- ---------------------------------------------------------------------
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'students',             (select count(*) from public.profiles where role = 'student' and status = 'active'),
    'instructors',          (select count(*) from public.instructors where application_status = 'approved'),
    'pending_instructors',  (select count(*) from public.instructors where application_status = 'pending'),
    'suspended',            (select count(*) from public.profiles where status = 'suspended'),
    'courses_published',    (select count(*) from public.courses where status = 'published'),
    'courses_draft',        (select count(*) from public.courses where status = 'draft'),
    'enrollments',          (select count(*) from public.enrollments where status = 'active'),
    'upcoming_sessions',    (select count(*) from public.course_sessions where starts_at > now() and status = 'scheduled'),
    'submissions_30d',      (select count(*) from public.submissions where submitted_at > now() - interval '30 days'),
    'pending_corrections',  (select count(*) from public.submissions where status = 'submitted'),
    'questions_open',       (select count(*) from public.questions where status = 'open'),
    'students_by_class',    (select coalesce(jsonb_agg(jsonb_build_object('label', c.code, 'value', n) order by c.sort_order), '[]')
                             from (select c.id, c.code, c.sort_order, count(s.profile_id) n
                                   from public.classes c left join public.students s on s.class_id = c.id
                                   group by c.id) c),
    'courses_by_subject',   (select coalesce(jsonb_agg(jsonb_build_object('label', name, 'value', n) order by n desc), '[]')
                             from (select sj.name, count(co.id) n from public.subjects sj
                                   join public.courses co on co.subject_id = sj.id and co.status = 'published'
                                   group by sj.name) x),
    'weekly_activity',      (select coalesce(jsonb_agg(jsonb_build_object('week', to_char(w, 'DD/MM'),
                                     'submissions', (select count(*) from public.submissions s
                                                     where s.submitted_at >= w and s.submitted_at < w + interval '7 days'),
                                     'enrollments', (select count(*) from public.enrollments e
                                                     where e.enrolled_at >= w and e.enrolled_at < w + interval '7 days'))
                                     order by w), '[]')
                             from generate_series(date_trunc('week', now()) - interval '7 weeks',
                                                  date_trunc('week', now()), interval '1 week') w)
  ) into result;
  return result;
end $$;

-- ---------------------------------------------------------------------
-- Statistiques de l'intervenant connecté (par cours)
-- ---------------------------------------------------------------------
create or replace function public.instructor_course_stats()
returns table (course_id uuid, title text, class_code text, subject text, status text,
               students bigint, lessons bigint, assignments bigint,
               pending_submissions bigint, open_questions bigint, average_pct numeric)
language sql stable security definer set search_path = '' as $$
  select c.id, c.title, cl.code, sj.name, c.status,
         (select count(*) from public.enrollments e where e.course_id = c.id and e.status = 'active'),
         (select count(*) from public.lessons l where l.course_id = c.id),
         (select count(*) from public.assignments a where a.course_id = c.id),
         (select count(*) from public.submissions s join public.assignments a on a.id = s.assignment_id
           where a.course_id = c.id and s.status = 'submitted'),
         (select count(*) from public.questions q where q.course_id = c.id and q.status = 'open'),
         (select round(avg(g.score / g.max_score * 100), 1) from public.grades g where g.course_id = c.id)
  from public.courses c
  join public.classes cl on cl.id = c.class_id
  join public.subjects sj on sj.id = c.subject_id
  where c.instructor_id = auth.uid() or public.is_admin()
  order by c.created_at desc
$$;

-- ---------------------------------------------------------------------
-- Progression des élèves d'un cours (intervenant du cours / admin)
-- ---------------------------------------------------------------------
create or replace function public.course_progress(p_course uuid)
returns table (student_id uuid, first_name text, last_name text, enrolled_at timestamptz,
               lessons_done bigint, lessons_total bigint,
               submissions bigint, assignments_total bigint, average_pct numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_course(p_course) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
  select p.id, p.first_name, p.last_name, e.enrolled_at,
         (select count(*) from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
           where l.course_id = p_course and lp.student_id = p.id),
         (select count(*) from public.lessons l where l.course_id = p_course and l.published),
         (select count(*) from public.submissions s join public.assignments a on a.id = s.assignment_id
           where a.course_id = p_course and s.student_id = p.id),
         (select count(*) from public.assignments a where a.course_id = p_course),
         (select round(avg(g.score / g.max_score * 100), 1) from public.grades g
           where g.course_id = p_course and g.student_id = p.id)
  from public.enrollments e
  join public.profiles p on p.id = e.student_id
  where e.course_id = p_course and e.status = 'active'
  order by p.last_name, p.first_name;
end $$;

-- ---------------------------------------------------------------------
-- Progression de l'élève connecté (security invoker : RLS appliquée)
-- ---------------------------------------------------------------------
create or replace function public.my_progress()
returns table (course_id uuid, title text, subject text, color text,
               lessons_done bigint, lessons_total bigint,
               submissions bigint, assignments_total bigint, average_pct numeric)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.title, sj.name, sj.color,
         (select count(*) from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
           where l.course_id = c.id and lp.student_id = auth.uid()),
         (select count(*) from public.lessons l where l.course_id = c.id and l.published),
         (select count(*) from public.submissions s join public.assignments a on a.id = s.assignment_id
           where a.course_id = c.id and s.student_id = auth.uid()),
         (select count(*) from public.assignments a where a.course_id = c.id),
         (select round(avg(g.score / g.max_score * 100), 1) from public.grades g
           where g.course_id = c.id and g.student_id = auth.uid())
  from public.enrollments e
  join public.courses c on c.id = e.course_id
  join public.subjects sj on sj.id = c.subject_id
  where e.student_id = auth.uid() and e.status = 'active'
  order by c.title
$$;

-- ---------------------------------------------------------------------
-- Recherche globale (security invoker : ne renvoie que ce que l'utilisateur peut voir)
-- ---------------------------------------------------------------------
create or replace function public.search_catalog(q text)
returns table (kind text, id text, title text, subtitle text)
language sql stable security invoker set search_path = '' as $$
  with term as (select '%' || extensions.unaccent(lower(trim(q))) || '%' as t)
  select * from (
    select 'course'::text, c.id::text, c.title, sj.name || ' · ' || cl.name
    from public.courses c
    join public.subjects sj on sj.id = c.subject_id
    join public.classes cl on cl.id = c.class_id, term
    where extensions.unaccent(lower(c.title || ' ' || coalesce(c.description, '') || ' ' || sj.name)) like term.t
    limit 20
  ) courses
  union all
  select * from (
    select 'subject'::text, sj.id::text, sj.name, 'Matière'
    from public.subjects sj, term
    where extensions.unaccent(lower(sj.name)) like term.t
    limit 10
  ) subjects
  union all
  select * from (
    select 'instructor'::text, p.id::text, p.first_name || ' ' || p.last_name,
           coalesce(i.specialty, 'Intervenant')
    from public.profiles p
    join public.instructors i on i.profile_id = p.id, term
    where i.application_status = 'approved' and p.status = 'active'
      and extensions.unaccent(lower(p.first_name || ' ' || p.last_name || ' ' || coalesce(i.specialty, ''))) like term.t
    limit 10
  ) instructors
$$;

-- ---------------------------------------------------------------------
-- Realtime : notifications, messages, réponses
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications, public.messages, public.answers;
  end if;
end $$;
