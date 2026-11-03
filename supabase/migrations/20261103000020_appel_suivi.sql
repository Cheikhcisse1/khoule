-- =============================================================================
-- Vie scolaire des établissements partenaires :
--   - liste d'appel : une feuille par classe (et filière), jour et créneau,
--     avec le statut de chaque élève validé (présent, absent, retard, excusé) ;
--   - suivi de l'élève : observations internes de l'équipe (encouragement,
--     avertissement, convocation…), visibles de la direction seulement.
-- Qui fait l'appel : la direction (classes couvertes) et l'enseignant du cours lié.
-- Un élève voit ses propres présences ; jamais celles des autres.
-- =============================================================================

create table public.attendance_sheets (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  class_id   smallint not null references public.classes (id),
  program_id uuid references public.school_programs (id) on delete set null,
  course_id  uuid references public.courses (id) on delete set null,
  day        date not null default current_date,
  label      text not null default '' check (length(label) <= 120),
  taken_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index attendance_sheets_school_idx on public.attendance_sheets (school_id, class_id, day desc);

create table public.attendance_marks (
  sheet_id   uuid not null references public.attendance_sheets (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status     text not null check (status in ('present', 'absent', 'retard', 'excuse')),
  note       text check (length(note) <= 300),
  primary key (sheet_id, student_id)
);
create index attendance_marks_student_idx on public.attendance_marks (student_id);

create table public.student_followups (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null default auth.uid(),
  kind       text not null default 'observation'
               check (kind in ('observation', 'encouragement', 'avertissement', 'convocation')),
  body       text not null check (length(trim(body)) > 1 and length(body) <= 2000),
  created_at timestamptz not null default now()
);
create index student_followups_student_idx on public.student_followups (student_id, created_at desc);

alter table public.attendance_sheets enable row level security;
alter table public.attendance_marks enable row level security;
alter table public.student_followups enable row level security;

-- Peut faire l'appel pour cette école / classe / ce cours ?
create or replace function public.can_take_roll(p_school uuid, p_class smallint, p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.staff_covers(p_school, p_class)
      or (p_course is not null and public.is_course_instructor(p_course)
          and exists (select 1 from public.courses c where c.id = p_course and c.school_id = p_school))
$$;

create or replace function public.can_manage_sheet(p_sheet uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attendance_sheets a
                 where a.id = p_sheet and public.can_take_roll(a.school_id, a.class_id, a.course_id))
$$;

-- L'élève fait-il partie (validé) de la classe de cette feuille ?
create or replace function public.sheet_has_student(p_sheet uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attendance_sheets a join public.students s
                   on s.school_id = a.school_id and s.class_id = a.class_id and s.school_status = 'approved'
                 where a.id = p_sheet and s.profile_id = p_student)
$$;

create or replace function public.is_my_sheet(p_sheet uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attendance_marks m where m.sheet_id = p_sheet and m.student_id = auth.uid())
$$;

revoke execute on function public.can_take_roll(uuid, smallint, uuid), public.can_manage_sheet(uuid),
  public.sheet_has_student(uuid, uuid), public.is_my_sheet(uuid) from public, anon;
grant execute on function public.can_take_roll(uuid, smallint, uuid), public.can_manage_sheet(uuid),
  public.sheet_has_student(uuid, uuid), public.is_my_sheet(uuid) to authenticated;

-- Feuilles d'appel
create policy attendance_sheets_read on public.attendance_sheets for select to authenticated
  using (public.can_take_roll(school_id, class_id, course_id) or public.is_my_sheet(id));
create policy attendance_sheets_write on public.attendance_sheets for insert to authenticated
  with check (public.can_take_roll(school_id, class_id, course_id)
              and (program_id is null or exists (select 1 from public.school_programs pr where pr.id = program_id and pr.school_id = attendance_sheets.school_id)));
create policy attendance_sheets_update on public.attendance_sheets for update to authenticated
  using (public.can_take_roll(school_id, class_id, course_id))
  with check (public.can_take_roll(school_id, class_id, course_id));
create policy attendance_sheets_delete on public.attendance_sheets for delete to authenticated
  using (public.can_take_roll(school_id, class_id, course_id));

-- Présences
create policy attendance_marks_read on public.attendance_marks for select to authenticated
  using (student_id = (select auth.uid()) or public.can_manage_sheet(sheet_id));
create policy attendance_marks_insert on public.attendance_marks for insert to authenticated
  with check (public.can_manage_sheet(sheet_id) and public.sheet_has_student(sheet_id, student_id));
create policy attendance_marks_update on public.attendance_marks for update to authenticated
  using (public.can_manage_sheet(sheet_id))
  with check (public.can_manage_sheet(sheet_id) and public.sheet_has_student(sheet_id, student_id));
create policy attendance_marks_delete on public.attendance_marks for delete to authenticated
  using (public.can_manage_sheet(sheet_id));

-- Suivi : direction de l'établissement de l'élève (et classes couvertes) uniquement
create policy student_followups_read on public.student_followups for select to authenticated
  using (public.is_admin() or (public.staff_sees_student(student_id)
         and exists (select 1 from public.students s where s.profile_id = student_id and s.school_id = student_followups.school_id)));
create policy student_followups_insert on public.student_followups for insert to authenticated
  with check (author_id = (select auth.uid()) and (public.is_admin() or (public.staff_sees_student(student_id)
         and exists (select 1 from public.students s where s.profile_id = student_id and s.school_id = student_followups.school_id))));
create policy student_followups_delete on public.student_followups for delete to authenticated
  using (public.is_admin() or author_id = (select auth.uid()) or public.is_school_director(school_id));

revoke all on public.attendance_sheets, public.attendance_marks, public.student_followups from anon;
grant select, insert, update, delete on public.attendance_sheets, public.attendance_marks to authenticated;
grant select, insert, delete on public.student_followups to authenticated;
