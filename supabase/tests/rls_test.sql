-- =====================================================================
-- Tests de sécurité RLS / triggers — exécutés avec psql après les migrations et le seed.
-- Chaque bloc s'arrête à la première erreur (ON_ERROR_STOP).
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on

create schema tests;
grant usage on schema tests to authenticated;
create function tests.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
create function tests.should_fail(q text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    return;
  end;
  raise exception 'ÉCHEC : cette requête aurait dû être refusée : %', q;
end $$;
grant execute on all functions in schema tests to authenticated;

-- Acteurs
\set admin   '''aaaaaaaa-0000-0000-0000-000000000001'''
\set prof    '''bbbbbbbb-0000-0000-0000-000000000001'''
\set prof2   '''bbbbbbbb-0000-0000-0000-000000000002'''
\set s1      '''cccccccc-0000-0000-0000-000000000001'''
\set s2      '''cccccccc-0000-0000-0000-000000000002'''
\set s3      '''cccccccc-0000-0000-0000-000000000003'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:admin, 'admin@test.sn', '{"role":"admin","first_name":"Awa","last_name":"Admin"}'),
  (:prof,  'prof@test.sn',  '{"role":"instructor","first_name":"Moussa","last_name":"Diop","specialty":"Maths","phone":"770000000"}'),
  (:prof2, 'prof2@test.sn', '{"role":"instructor","first_name":"Fatou","last_name":"Sow"}'),
  (:s1, 's1@test.sn', format('{"role":"student","first_name":"Aliou","last_name":"Ba","class_id":%s,"guardian_name":"Mme Ba","guardian_phone":"771111111","guardian_consent":true}',
        (select id from public.classes where code = '6E'))::jsonb),
  (:s2, 's2@test.sn', format('{"role":"student","first_name":"Binta","last_name":"Fall","class_id":%s}',
        (select id from public.classes where code = '6E'))::jsonb),
  (:s3, 's3@test.sn', format('{"role":"student","first_name":"Cheikh","last_name":"Ndiaye","class_id":%s}',
        (select id from public.classes where code = 'TLE'))::jsonb);

do $$ begin
  assert (select role from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'student',
         'T1 : impossible de s''inscrire comme admin';
  assert (select status from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000001') = 'pending',
         'T2 : intervenant en attente';
  assert (select guardian_consent and consent_at is not null from public.students
          where profile_id = 'cccccccc-0000-0000-0000-000000000001'), 'T3 : consentement horodaté';
  raise notice 'OK  inscription : rôles, statuts et consentement';
end $$;

-- Promotion de l'admin (opération manuelle documentée dans le README)
update public.profiles set role = 'admin' where id = :admin;
do $$ begin
  assert (select count(*) from public.notifications n
          where n.type = 'instructor_application') = 0, 'pas d''admin au moment des candidatures';
end $$;

-- ---------- Élève : ne peut pas changer son rôle -------------------------------
select tests.login(:s1); set role authenticated;
update public.profiles set role = 'admin', status = 'active', first_name = 'Aliou' where id = :s1;
do $$ begin
  assert public.auth_role() = 'student', 'T4 : élève non promu';
  assert (select count(*) from public.students) = 1, 'T5 : un élève ne voit que sa fiche';
  assert (select count(*) from public.instructor_contacts) = 0, 'T6 : contacts intervenants cachés';
  raise notice 'OK  élève : rôle protégé, données privées isolées';
end $$;
reset role;

-- ---------- Intervenant non validé : aucun cours possible ---------------------
select tests.login(:prof); set role authenticated;
select tests.should_fail(format($q$insert into public.courses (title, class_id, subject_id, instructor_id)
  values ('Cours test', (select id from public.classes where code='6E'),
          (select id from public.subjects where name='Mathématiques'), %L)$q$, :prof));
update public.instructors set application_status = 'approved' where profile_id = :prof;
do $$ begin
  assert (select application_status from public.instructors
          where profile_id = 'bbbbbbbb-0000-0000-0000-000000000001') = 'pending', 'T7 : auto-validation bloquée';
  raise notice 'OK  intervenant en attente : création de cours et auto-validation refusées';
end $$;
reset role;

-- ---------- Admin : validation + affectation ---------------------------------
select tests.login(:admin); set role authenticated;
select public.review_instructor(:prof, 'approved');
insert into public.teaching_assignments (instructor_id, class_id, subject_id, assigned_by)
values (:prof, (select id from public.classes where code = '6E'),
        (select id from public.subjects where name = 'Mathématiques'), :admin);
do $$ begin
  assert (select (public.admin_stats() ->> 'instructors')::int) = 1, 'T8 : stats admin';
  raise notice 'OK  admin : validation, affectation et statistiques';
end $$;
reset role;

select tests.login(:s1); set role authenticated;
select tests.should_fail($q$select public.review_instructor('bbbbbbbb-0000-0000-0000-000000000002', 'approved')$q$);
select tests.should_fail($q$select public.admin_stats()$q$);
reset role;

-- ---------- Intervenant validé : cours limité à ses affectations ------------
select tests.login(:prof); set role authenticated;
insert into public.courses (id, title, description, class_id, subject_id, instructor_id, status)
values ('dddddddd-0000-0000-0000-000000000001', 'Les fractions', 'Comprendre les fractions',
        (select id from public.classes where code = '6E'),
        (select id from public.subjects where name = 'Mathématiques'), :prof, 'published');
select tests.should_fail(format($q$insert into public.courses (title, class_id, subject_id, instructor_id)
  values ('Hors affectation', (select id from public.classes where code='TLE'),
          (select id from public.subjects where name='Mathématiques'), %L)$q$, :prof));
insert into public.lessons (id, course_id, title, content, position)
values ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Leçon 1', 'Contenu', 1);
insert into public.exercises (id, course_id, title, instructions, max_score)
values ('ffffffff-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Exercice 1', 'Calculer 1/2 + 1/4', 20);
insert into public.course_sessions (course_id, title, starts_at, ends_at, room, live_url)
values ('dddddddd-0000-0000-0000-000000000001', 'Séance du samedi', now() + interval '2 days',
        now() + interval '2 days 2 hours', 'Salle 1', 'https://meet.jit.si/khoule-6e');
do $$ begin raise notice 'OK  intervenant : cours, leçon, exercice, séance (hors affectation refusé)'; end $$;
reset role;

-- ---------- Élèves : visibilité par classe et inscription --------------------
select tests.login(:s3); set role authenticated;
do $$ begin
  assert (select count(*) from public.courses) = 0, 'T9 : un élève de Terminale ne voit pas le cours de 6e';
end $$;
select tests.should_fail($q$insert into public.enrollments (course_id, student_id)
  values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003')$q$);
reset role;

select tests.login(:s1); set role authenticated;
do $$ begin
  assert (select count(*) from public.notifications where type = 'new_course') = 1, 'T10 : notif nouveau cours';
  assert (select count(*) from public.lessons) = 0, 'T11 : leçons invisibles avant inscription';
end $$;
insert into public.enrollments (course_id, student_id) values ('dddddddd-0000-0000-0000-000000000001', :s1);
do $$ begin
  assert (select count(*) from public.lessons) = 1, 'T12 : leçons visibles après inscription';
  raise notice 'OK  élèves : catalogue par classe, inscription, accès au contenu';
end $$;
insert into public.lesson_progress (student_id, lesson_id) values (:s1, 'eeeeeeee-0000-0000-0000-000000000001');
reset role;

-- ---------- Devoir, soumission, note ----------------------------------------
select tests.login(:prof); set role authenticated;
insert into public.assignments (id, course_id, exercise_id, due_at)
values ('99999999-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
        'ffffffff-0000-0000-0000-000000000001', now() + interval '7 days');
do $$ begin
  assert (select count(*) from public.students) = 1, 'T13 : l''intervenant voit uniquement ses élèves inscrits';
end $$;
reset role;

select tests.login(:s1); set role authenticated;
insert into public.submissions (id, assignment_id, student_id, content, file_paths, status)
values ('88888888-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', :s1, '3/4',
        array['cccccccc-0000-0000-0000-000000000001/99999999-0000-0000-0000-000000000001/copie.pdf'], 'corrected');
insert into storage.objects (bucket_id, name)
values ('submissions', 'cccccccc-0000-0000-0000-000000000001/99999999-0000-0000-0000-000000000001/copie.pdf');
do $$ begin
  assert (select status from public.submissions) = 'submitted', 'T14 : statut forcé à submitted';
end $$;
reset role;

select tests.login(:s2); set role authenticated;
select tests.should_fail($q$insert into public.submissions (assignment_id, student_id, content)
  values ('99999999-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'triche')$q$);
select tests.should_fail($q$insert into storage.objects (bucket_id, name)
  values ('submissions', 'cccccccc-0000-0000-0000-000000000001/99999999-0000-0000-0000-000000000001/x.pdf')$q$);
do $$ begin
  assert (select count(*) from public.submissions) = 0, 'T15 : copies des autres invisibles';
  assert (select count(*) from storage.objects) = 0, 'T16 : fichiers des autres invisibles';
  assert (select count(*) from public.profiles where role = 'student') = 1, 'T17 : élèves non camarades invisibles';
  raise notice 'OK  isolation entre élèves (copies, fichiers, profils)';
end $$;
reset role;

select tests.login(:prof); set role authenticated;
do $$ begin
  assert (select count(*) from storage.objects) = 1, 'T18 : l''intervenant lit la copie';
end $$;
insert into public.corrections (submission_id, instructor_id, feedback)
values ('88888888-0000-0000-0000-000000000001', :prof, 'Très bien, attention aux simplifications.');
select tests.should_fail($q$insert into public.grades (submission_id, score, max_score)
  values ('88888888-0000-0000-0000-000000000001', 25, 20)$q$);
insert into public.grades (submission_id, score, max_score) values ('88888888-0000-0000-0000-000000000001', 16, 1);
do $$ begin
  assert (select max_score from public.grades) = 20, 'T19 : barème recopié depuis l''exercice';
  assert (select count(*) from public.course_progress('dddddddd-0000-0000-0000-000000000001')
          where lessons_done = 1 and average_pct = 80) = 1, 'T20 : progression élève';
  raise notice 'OK  correction et notation (barème contrôlé)';
end $$;
reset role;

select tests.login(:prof2); set role authenticated;
select tests.should_fail($q$insert into public.grades (submission_id, score, max_score)
  values ('88888888-0000-0000-0000-000000000001', 1, 20)$q$);
reset role;

select tests.login(:s1); set role authenticated;
update public.submissions set content = 'modifié après correction';
do $$ begin
  assert (select content from public.submissions) = '3/4', 'T21b : copie corrigée non modifiable';
  assert (select status from public.submissions) = 'corrected', 'T21 : copie marquée corrigée';
  assert (select count(*) from public.grades) = 1, 'T22 : l''élève voit sa note';
  assert (select count(*) from public.notifications where type in ('new_grade', 'new_correction')) = 2, 'T23 : notifs note + correction';
  assert (select count(*) from public.my_progress() where average_pct = 80) = 1, 'T24 : ma progression';
  assert (select count(*) from public.search_catalog('fraction')) = 1, 'T25 : recherche';
  raise notice 'OK  élève : note, correction, notifications, progression, recherche';
end $$;

-- ---------- Questions / messages --------------------------------------------
insert into public.questions (id, course_id, author_id, title, body)
values ('77777777-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', :s1,
        'Comment additionner ?', 'Je ne comprends pas les dénominateurs différents.');
select tests.should_fail(format($q$insert into public.messages (sender_id, recipient_id, body) values (%L, %L, 'salut')$q$, :s1, :s2));
insert into public.messages (sender_id, recipient_id, body) values (:s1, :prof, 'Bonjour monsieur');
insert into public.messages (sender_id, course_id, body) values (:s1, 'dddddddd-0000-0000-0000-000000000001', 'Bonjour à tous');
reset role;

select tests.login(:prof); set role authenticated;
insert into public.answers (question_id, author_id, body)
values ('77777777-0000-0000-0000-000000000001', :prof, 'Il faut d''abord réduire au même dénominateur.');
update public.messages set read_at = now(), body = 'falsifié' where recipient_id = :prof;
do $$ begin
  assert (select status from public.questions) = 'answered', 'T26 : question marquée répondue';
  assert (select body from public.messages where recipient_id is not null) = 'Bonjour monsieur', 'T27 : message non falsifiable';
  assert (select count(*) from public.notifications where type in ('new_message', 'new_question', 'new_submission')) = 3,
         'T28 : notifs intervenant';
  raise notice 'OK  questions/réponses et messagerie (élève→élève interdit)';
end $$;
reset role;

select tests.login(:s1); set role authenticated;
update public.answers set is_accepted = true, is_hidden = true, body = 'réécrit';
update public.questions set is_hidden = true;
do $$ begin
  assert (select is_accepted and not is_hidden and body <> 'réécrit' from public.answers), 'T28b : réponse acceptée, non falsifiée';
  assert (select not is_hidden from public.questions), 'T28c : l''élève ne peut pas masquer';
  raise notice 'OK  garde-fous Q&R (acceptation, modération réservée)';
end $$;
reset role;

select tests.login(:s2); set role authenticated;
do $$ begin
  assert (select count(*) from public.questions) = 0, 'T29 : questions réservées aux inscrits';
  assert (select count(*) from public.messages) = 0, 'T30 : fil de cours réservé aux inscrits';
end $$;
reset role;

-- ---------- Bibliothèque « Documents & annales » ----------------------------
select tests.login(:prof); set role authenticated;
insert into public.library_documents (title, kind, class_id, subject_id, year, file_path, uploaded_by)
values ('BFEM 2024 Maths', 'annale', (select id from public.classes where code = '6E'),
        (select id from public.subjects where name = 'Mathématiques'), 2024,
        format('%s/%s/bfem.pdf', (select id from public.classes where code = '6E'), (select id from public.subjects where name = 'Mathématiques')), :prof);
insert into storage.objects (bucket_id, name)
values ('library', format('%s/%s/bfem.pdf', (select id from public.classes where code = '6E'), (select id from public.subjects where name = 'Mathématiques')));
select tests.should_fail(format($q$insert into public.library_documents (title, class_id, subject_id, url, uploaded_by)
  values ('Hors affectation', (select id from public.classes where code='TLE'), (select id from public.subjects where name='Mathématiques'),
          'https://exemple.sn', %L)$q$, :prof));
select tests.should_fail(format($q$insert into storage.objects (bucket_id, name) values ('library', '%s/%s/x.pdf')$q$,
  (select id from public.classes where code = 'TLE'), (select id from public.subjects where name = 'Mathématiques')));
select tests.should_fail($q$insert into storage.objects (bucket_id, name) values ('library', 'abc/def/x.pdf')$q$);
reset role;
select tests.login(:s1); set role authenticated;
do $$ begin
  assert (select count(*) from public.library_documents) = 1, 'T40 : l''élève de 6e voit l''annale';
  assert (select count(*) from storage.objects where bucket_id = 'library') = 1, 'T41 : l''élève de 6e peut télécharger';
  assert (select count(*) from public.notifications where type = 'new_document') = 1, 'T42 : notif nouveau document';
end $$;
select tests.should_fail(format($q$insert into public.library_documents (title, class_id, subject_id, url, uploaded_by)
  values ('Élève', 1, 1, 'https://x.sn', %L)$q$, :s1));
reset role;
select tests.login(:s3); set role authenticated;
do $$ begin
  assert (select count(*) from public.library_documents) = 0, 'T43 : invisible pour une autre classe';
  assert (select count(*) from storage.objects where bucket_id = 'library') = 0, 'T44 : fichier invisible pour une autre classe';
  raise notice 'OK  bibliothèque : dépôt selon affectation, lecture par classe, notification';
end $$;
reset role;

-- ---------- Disponibilités des intervenants ---------------------------------
select tests.login(:prof); set role authenticated;
insert into public.instructor_availabilities (instructor_id, day_of_week, start_time, end_time, mode)
values (:prof, 2, '17:00', '19:00', 'en_ligne'), (:prof, 4, '18:00', '20:00', 'both');
select tests.should_fail(format($q$insert into public.instructor_availabilities (instructor_id, day_of_week, start_time, end_time)
  values (%L, 1, '10:00', '12:00')$q$, :prof2));
select tests.should_fail(format($q$insert into public.instructor_availabilities (instructor_id, day_of_week, start_time, end_time)
  values (%L, 1, '12:00', '10:00')$q$, :prof));
reset role;
select tests.login(:s2); set role authenticated;
do $$ begin
  assert (select count(*) from public.instructor_availabilities) = 0, 'T38 : dispos invisibles des élèves';
end $$;
reset role;
select tests.login(:admin); set role authenticated;
do $$ begin
  assert (select count(*) from public.instructor_availabilities) = 2, 'T39 : l''admin voit le planning';
  raise notice 'OK  disponibilités : saisie par l''intervenant, planning admin, cachées aux élèves';
end $$;
reset role;

-- ---------- Admin : changement de rôle et inscription manuelle --------------
select tests.login(:s3); set role authenticated;
select tests.should_fail(format($q$insert into public.instructors (profile_id) values (%L)$q$, :s3));
reset role;
select tests.login(:admin); set role authenticated;
update public.profiles set role = 'instructor' where id = :s3;
insert into public.instructors (profile_id, application_status) values (:s3, 'approved')
  on conflict (profile_id) do update set application_status = excluded.application_status;
update public.profiles set role = 'student' where id = :s3;
insert into public.enrollments (course_id, student_id) values ('dddddddd-0000-0000-0000-000000000001', :s2);
do $$ begin
  assert (select count(*) from public.instructors where profile_id = 'cccccccc-0000-0000-0000-000000000003') = 1,
         'T36 : l''admin crée une fiche intervenant';
  assert (select count(*) from public.enrollments where student_id = 'cccccccc-0000-0000-0000-000000000002') = 1,
         'T37 : l''admin inscrit un élève';
  raise notice 'OK  admin : changement de rôle, inscription manuelle (interdit aux autres)';
end $$;
delete from public.enrollments where student_id = :s2;
delete from public.instructors where profile_id = :s3;
reset role;

-- ---------- Annonces + suspension -------------------------------------------
select tests.login(:admin); set role authenticated;
insert into public.announcements (title, body, audience, class_id, author_id)
values ('Cours de samedi', 'Rendez-vous à 9h à l''école de Khoulé.', 'class',
        (select id from public.classes where code = 'TLE'), :admin);
update public.profiles set status = 'suspended' where id = :s1;
reset role;

select tests.login(:s3); set role authenticated;
do $$ begin
  assert (select count(*) from public.announcements) = 1, 'T31 : annonce visible par la classe ciblée';
  assert (select count(*) from public.notifications where type = 'announcement') = 1, 'T32 : notif annonce';
end $$;
reset role;
select tests.login(:s2); set role authenticated;
do $$ begin
  assert (select count(*) from public.announcements) = 0, 'T33 : annonce invisible hors classe';
end $$;
reset role;
select tests.login(:s1); set role authenticated;
do $$ begin
  assert (select count(*) from public.lessons) = 0, 'T34 : compte suspendu = plus d''accès';
  assert (select count(*) from public.courses) = 0, 'T35 : compte suspendu = plus de catalogue';
  raise notice 'OK  annonces ciblées et suspension de compte';
end $$;
reset role;

\echo '=== Tous les tests RLS ont réussi ==='
