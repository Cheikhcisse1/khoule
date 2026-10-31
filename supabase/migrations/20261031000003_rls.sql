-- =====================================================================
-- Khoulé Éducation — 3. Row Level Security
-- Principe : tout est refusé par défaut ; chaque table ouvre le strict nécessaire.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'roles','classes','subjects','class_subjects','profiles','students','instructors',
    'instructor_contacts','instructor_subjects','instructor_classes','teaching_assignments',
    'courses','schedules','course_sessions','enrollments','lessons','course_materials',
    'lesson_progress','exercises','assignments','submissions','corrections','grades',
    'questions','answers','messages','notifications','announcements']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Référentiels : lisibles par tous (formulaire d'inscription), modifiables par l'admin
-- ---------------------------------------------------------------------
create policy roles_read on public.roles for select to anon, authenticated using (true);

create policy classes_read on public.classes for select to anon, authenticated using (true);
create policy classes_admin on public.classes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy subjects_read on public.subjects for select to anon, authenticated using (true);
create policy subjects_admin on public.subjects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy class_subjects_read on public.class_subjects for select to anon, authenticated using (true);
create policy class_subjects_admin on public.class_subjects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------
create policy profiles_read on public.profiles for select to authenticated
  using (public.can_see_profile(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.is_admin());

-- Élèves (données de mineurs : élève, admin, intervenants de ses cours)
create policy students_read on public.students for select to authenticated
  using (profile_id = auth.uid() or public.is_admin() or public.teaches_student(profile_id));
create policy students_update on public.students for update to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
create policy students_delete on public.students for delete to authenticated
  using (public.is_admin());

-- Intervenants : fiche publique une fois validée
create policy instructors_read on public.instructors for select to authenticated
  using (profile_id = auth.uid() or public.is_admin()
         or (application_status = 'approved' and public.auth_role() is not null));
create policy instructors_update on public.instructors for update to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
create policy instructors_delete on public.instructors for delete to authenticated
  using (public.is_admin());

create policy instructor_contacts_rw on public.instructor_contacts for all to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

create policy instructor_subjects_read on public.instructor_subjects for select to authenticated using (true);
create policy instructor_subjects_write on public.instructor_subjects for all to authenticated
  using (instructor_id = auth.uid() or public.is_admin())
  with check (instructor_id = auth.uid() or public.is_admin());

create policy instructor_classes_read on public.instructor_classes for select to authenticated using (true);
create policy instructor_classes_write on public.instructor_classes for all to authenticated
  using (instructor_id = auth.uid() or public.is_admin())
  with check (instructor_id = auth.uid() or public.is_admin());

create policy teaching_assignments_read on public.teaching_assignments for select to authenticated using (true);
create policy teaching_assignments_admin on public.teaching_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Cours
-- ---------------------------------------------------------------------
create policy courses_read on public.courses for select to authenticated
  using (public.can_view_course(id) or instructor_id = auth.uid());

-- Un intervenant ne crée/modifie un cours que pour une classe + matière qui lui sont affectées
create policy courses_insert on public.courses for insert to authenticated
  with check (
    public.is_admin()
    or (instructor_id = auth.uid() and public.is_active_instructor() and exists (
          select 1 from public.teaching_assignments ta
          where ta.instructor_id = auth.uid() and ta.class_id = courses.class_id
            and ta.subject_id = courses.subject_id)));
create policy courses_update on public.courses for update to authenticated
  using (public.can_manage_course(id))
  with check (
    public.is_admin()
    or (instructor_id = auth.uid() and exists (
          select 1 from public.teaching_assignments ta
          where ta.instructor_id = auth.uid() and ta.class_id = courses.class_id
            and ta.subject_id = courses.subject_id)));
create policy courses_delete on public.courses for delete to authenticated
  using (public.can_manage_course(id));

-- Tables de contenu d'un cours : même logique (lecture = accès au cours, écriture = gestion)
create policy schedules_read on public.schedules for select to authenticated
  using (public.can_view_course(course_id));
create policy schedules_write on public.schedules for all to authenticated
  using (public.can_manage_course(course_id)) with check (public.can_manage_course(course_id));

create policy course_sessions_read on public.course_sessions for select to authenticated
  using (public.can_view_course(course_id));
create policy course_sessions_write on public.course_sessions for all to authenticated
  using (public.can_manage_course(course_id)) with check (public.can_manage_course(course_id));

create policy lessons_read on public.lessons for select to authenticated
  using (public.can_manage_course(course_id) or (published and public.is_enrolled(course_id)));
create policy lessons_write on public.lessons for all to authenticated
  using (public.can_manage_course(course_id)) with check (public.can_manage_course(course_id));

create policy course_materials_read on public.course_materials for select to authenticated
  using (public.can_access_course(course_id));
create policy course_materials_write on public.course_materials for all to authenticated
  using (public.can_manage_course(course_id)) with check (public.can_manage_course(course_id));

create policy exercises_read on public.exercises for select to authenticated
  using (public.can_manage_course(course_id) or (published and public.is_enrolled(course_id)));
create policy exercises_write on public.exercises for all to authenticated
  using (public.can_manage_course(course_id)) with check (public.can_manage_course(course_id));

create policy assignments_read on public.assignments for select to authenticated
  using (public.can_access_course(course_id));
create policy assignments_write on public.assignments for all to authenticated
  using (public.can_manage_course(course_id))
  with check (public.can_manage_course(
    (select e.course_id from public.exercises e where e.id = exercise_id)));

-- ---------------------------------------------------------------------
-- Inscriptions et progression
-- ---------------------------------------------------------------------
create policy enrollments_read on public.enrollments for select to authenticated
  using (student_id = auth.uid() or public.can_manage_course(course_id));
-- L'élève s'inscrit lui-même à un cours publié de SA classe
create policy enrollments_insert on public.enrollments for insert to authenticated
  with check (
    public.is_admin()
    or (student_id = auth.uid() and public.is_active_student() and exists (
          select 1 from public.courses c
          where c.id = course_id and c.status = 'published'
            and c.class_id = public.student_class_id())));
create policy enrollments_update on public.enrollments for update to authenticated
  using (student_id = auth.uid() or public.can_manage_course(course_id))
  with check (student_id = auth.uid() or public.can_manage_course(course_id));
create policy enrollments_delete on public.enrollments for delete to authenticated
  using (public.can_manage_course(course_id));

create policy lesson_progress_read on public.lesson_progress for select to authenticated
  using (student_id = auth.uid() or public.can_manage_course(
    (select l.course_id from public.lessons l where l.id = lesson_id)));
create policy lesson_progress_insert on public.lesson_progress for insert to authenticated
  with check (student_id = auth.uid() and public.is_enrolled(
    (select l.course_id from public.lessons l where l.id = lesson_id)));
create policy lesson_progress_delete on public.lesson_progress for delete to authenticated
  using (student_id = auth.uid());

-- ---------------------------------------------------------------------
-- Soumissions, corrections, notes
-- ---------------------------------------------------------------------
create policy submissions_read on public.submissions for select to authenticated
  using (student_id = auth.uid() or public.can_manage_course(public.assignment_course(assignment_id)));
create policy submissions_insert on public.submissions for insert to authenticated
  with check (
    student_id = auth.uid()
    and public.is_enrolled(public.assignment_course(assignment_id))
    and exists (select 1 from public.assignments a
                where a.id = assignment_id
                  and (a.allow_late or a.due_at is null or now() <= a.due_at)));
-- L'élève peut modifier sa copie tant qu'elle n'est pas corrigée
create policy submissions_update on public.submissions for update to authenticated
  using ((student_id = auth.uid() and status = 'submitted')
         or public.can_manage_course(public.assignment_course(assignment_id)))
  with check (student_id = auth.uid()
         or public.can_manage_course(public.assignment_course(assignment_id)));
create policy submissions_delete on public.submissions for delete to authenticated
  using ((student_id = auth.uid() and status = 'submitted') or public.is_admin());

create policy corrections_read on public.corrections for select to authenticated
  using (public.can_view_submission(submission_id));
create policy corrections_write on public.corrections for all to authenticated
  using (public.can_manage_course(public.submission_course(submission_id)))
  with check (public.can_manage_course(public.submission_course(submission_id)));

create policy grades_read on public.grades for select to authenticated
  using (student_id = auth.uid() or public.can_manage_course(course_id));
create policy grades_write on public.grades for all to authenticated
  using (public.can_manage_course(public.submission_course(submission_id)))
  with check (public.can_manage_course(public.submission_course(submission_id)));

-- ---------------------------------------------------------------------
-- Questions / réponses (modération : intervenant du cours + admin)
-- ---------------------------------------------------------------------
create policy questions_read on public.questions for select to authenticated
  using (public.can_access_course(course_id)
         and (not is_hidden or author_id = auth.uid() or public.can_manage_course(course_id)));
create policy questions_insert on public.questions for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_course(course_id));
create policy questions_update on public.questions for update to authenticated
  using (author_id = auth.uid() or public.can_manage_course(course_id))
  with check (author_id = auth.uid() or public.can_manage_course(course_id));
create policy questions_delete on public.questions for delete to authenticated
  using (author_id = auth.uid() or public.can_manage_course(course_id));

create policy answers_read on public.answers for select to authenticated
  using (public.can_access_course(public.question_course(question_id))
         and (not is_hidden or author_id = auth.uid()
              or public.can_manage_course(public.question_course(question_id))));
create policy answers_insert on public.answers for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_course(public.question_course(question_id)));
create policy answers_update on public.answers for update to authenticated
  using (author_id = auth.uid() or public.can_manage_course(public.question_course(question_id)))
  with check (author_id = auth.uid() or public.can_manage_course(public.question_course(question_id)));
create policy answers_delete on public.answers for delete to authenticated
  using (author_id = auth.uid() or public.can_manage_course(public.question_course(question_id)));

-- ---------------------------------------------------------------------
-- Messagerie
-- ---------------------------------------------------------------------
create policy messages_read on public.messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_admin()
         or (course_id is not null and public.can_access_course(course_id)
             and (not is_hidden or public.can_manage_course(course_id))));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and (
    (recipient_id is not null and public.can_message(recipient_id))
    or (course_id is not null and public.can_access_course(course_id))));
create policy messages_update on public.messages for update to authenticated
  using (recipient_id = auth.uid() or public.is_admin()
         or (course_id is not null and public.can_manage_course(course_id)))
  with check (true);
create policy messages_delete on public.messages for delete to authenticated
  using (sender_id = auth.uid() or public.is_admin()
         or (course_id is not null and public.can_manage_course(course_id)));

-- ---------------------------------------------------------------------
-- Notifications (créées par triggers) et annonces
-- ---------------------------------------------------------------------
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());
create policy notifications_admin_insert on public.notifications for insert to authenticated
  with check (public.is_admin());

create policy announcements_read on public.announcements for select to authenticated
  using (public.is_admin() or (
    public.auth_role() is not null
    and published_at <= now() and (expires_at is null or expires_at > now())
    and (audience = 'all'
         or (audience = 'students' and public.auth_role() = 'student')
         or (audience = 'instructors' and public.auth_role() = 'instructor')
         or (audience = 'class' and class_id = public.student_class_id()))));
create policy announcements_admin on public.announcements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
