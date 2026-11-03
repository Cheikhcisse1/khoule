-- =============================================================================
-- Appel par l'intervenant, depuis ses propres cours :
--   - cours d'établissement : élèves validés de la classe (et de la filière du cours) ;
--   - cours communautaire (sans établissement) : élèves inscrits au cours.
-- Un intervenant ne voit que les feuilles de SES cours ; la direction garde la vue d'ensemble.
-- =============================================================================

alter table public.attendance_sheets alter column school_id drop not null;
alter table public.attendance_sheets
  add constraint attendance_sheets_scope_chk check (school_id is not null or course_id is not null);

create or replace function public.can_take_roll(p_school uuid, p_class smallint, p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin()
      or (p_school is not null and public.staff_covers(p_school, p_class))
      or (p_course is not null and public.is_course_instructor(p_course)
          and exists (select 1 from public.courses c
                      where c.id = p_course and c.class_id = p_class and c.school_id is not distinct from p_school))
$$;

create or replace function public.sheet_has_student(p_sheet uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.attendance_sheets a
    where a.id = p_sheet and (
      (a.school_id is not null and exists (
         select 1 from public.students s
         where s.profile_id = p_student and s.school_id = a.school_id and s.class_id = a.class_id and s.school_status = 'approved'))
      or (a.school_id is null and exists (
         select 1 from public.enrollments e
         where e.course_id = a.course_id and e.student_id = p_student and e.status = 'active'))))
$$;

-- Liste des élèves à appeler pour un cours (réservée à qui peut faire l'appel de ce cours)
create or replace function public.roll_roster(p_course uuid)
returns table (profile_id uuid, first_name text, last_name text, program_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare c record;
begin
  select co.id, co.school_id, co.class_id, co.program_id into c from public.courses co where co.id = p_course;
  if c.id is null or not public.can_take_roll(c.school_id, c.class_id, c.id) then
    raise exception 'Accès refusé';
  end if;
  if c.school_id is not null then
    return query
      select s.profile_id, p.first_name, p.last_name, s.program_id
      from public.students s join public.profiles p on p.id = s.profile_id
      where s.school_id = c.school_id and s.class_id = c.class_id and s.school_status = 'approved'
        and p.status = 'active' and (c.program_id is null or s.program_id = c.program_id)
      order by p.last_name, p.first_name;
  else
    return query
      select p.id, p.first_name, p.last_name, null::uuid
      from public.enrollments e join public.profiles p on p.id = e.student_id
      where e.course_id = c.id and e.status = 'active' and p.status = 'active'
      order by p.last_name, p.first_name;
  end if;
end $$;
revoke execute on function public.roll_roster(uuid) from public, anon;
grant execute on function public.roll_roster(uuid) to authenticated;

-- Création : la classe de la feuille doit être celle du cours rattaché
drop policy attendance_sheets_write on public.attendance_sheets;
create policy attendance_sheets_write on public.attendance_sheets for insert to authenticated
  with check (public.can_take_roll(school_id, class_id, course_id)
              and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.class_id = attendance_sheets.class_id))
              and (program_id is null or exists (select 1 from public.school_programs pr where pr.id = program_id and pr.school_id = attendance_sheets.school_id)));
