-- =====================================================================
-- Khoulé Éducation — 1. Schéma relationnel
-- =====================================================================
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------
-- Référentiels
-- ---------------------------------------------------------------------
create table public.roles (
  id    text primary key check (id in ('admin', 'instructor', 'student')),
  label text not null
);
insert into public.roles (id, label) values
  ('admin', 'Administrateur'), ('instructor', 'Intervenant'), ('student', 'Élève');

create table public.classes (
  id         smallint generated always as identity primary key,
  code       text not null unique,                -- 'CI', '6E', 'TLE'…
  name       text not null,                       -- 'Classe d''initiation'
  cycle      text not null check (cycle in ('elementaire', 'college', 'lycee')),
  sort_order smallint not null,
  created_at timestamptz not null default now()
);

create table public.subjects (
  id         smallint generated always as identity primary key,
  name       text not null unique,
  color      text not null default '#1f7a4d',
  created_at timestamptz not null default now()
);

-- Matières enseignées par niveau
create table public.class_subjects (
  class_id   smallint not null references public.classes (id) on delete cascade,
  subject_id smallint not null references public.subjects (id) on delete cascade,
  primary key (class_id, subject_id)
);

-- ---------------------------------------------------------------------
-- Utilisateurs
-- ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'student' references public.roles (id),
  status     text not null default 'active' check (status in ('pending', 'active', 'suspended')),
  first_name text not null check (length(trim(first_name)) > 0),
  last_name  text not null check (length(trim(last_name)) > 0),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_status_idx on public.profiles (role, status);

create table public.students (
  profile_id        uuid primary key references public.profiles (id) on delete cascade,
  class_id          smallint references public.classes (id) on delete set null,
  school            text,
  birth_year        smallint check (birth_year between 1990 and 2030),
  phone             text,
  guardian_name     text,
  guardian_relation text,
  guardian_phone    text,
  guardian_email    text,
  guardian_consent  boolean not null default false,
  consent_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index students_class_idx on public.students (class_id);

create table public.instructors (
  profile_id         uuid primary key references public.profiles (id) on delete cascade,
  instructor_type    text not null default 'enseignant'
                       check (instructor_type in ('enseignant', 'professeur', 'etudiant', 'autre')),
  education_level    text,
  specialty          text,
  experience         text,
  bio                text,   -- téléphone : table instructor_contacts (admin uniquement)
  application_status text not null default 'pending'
                       check (application_status in ('pending', 'approved', 'rejected')),
  rejection_reason   text,
  reviewed_by        uuid references public.profiles (id) on delete set null,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index instructors_status_idx on public.instructors (application_status);

-- Souhaits déclarés par l'intervenant
create table public.instructor_subjects (
  instructor_id uuid not null references public.instructors (profile_id) on delete cascade,
  subject_id    smallint not null references public.subjects (id) on delete cascade,
  primary key (instructor_id, subject_id)
);
create table public.instructor_classes (
  instructor_id uuid not null references public.instructors (profile_id) on delete cascade,
  class_id      smallint not null references public.classes (id) on delete cascade,
  primary key (instructor_id, class_id)
);

-- Affectations décidées par l'administrateur
create table public.teaching_assignments (
  id            bigint generated always as identity primary key,
  instructor_id uuid not null references public.instructors (profile_id) on delete cascade,
  class_id      smallint not null references public.classes (id) on delete cascade,
  subject_id    smallint not null references public.subjects (id) on delete cascade,
  assigned_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (instructor_id, class_id, subject_id)
);
create index teaching_assignments_class_subject_idx on public.teaching_assignments (class_id, subject_id);

-- ---------------------------------------------------------------------
-- Cours
-- ---------------------------------------------------------------------
create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(trim(title)) > 2),
  description   text,
  class_id      smallint not null references public.classes (id) on delete restrict,
  subject_id    smallint not null references public.subjects (id) on delete restrict,
  instructor_id uuid not null references public.profiles (id) on delete restrict,
  status        text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index courses_class_subject_idx on public.courses (class_id, subject_id) where status = 'published';
create index courses_instructor_idx on public.courses (instructor_id);
create index courses_title_trgm_idx on public.courses using gin (title extensions.gin_trgm_ops);

-- Créneaux récurrents (principalement samedi/dimanche)
create table public.schedules (
  id          bigint generated always as identity primary key,
  course_id   uuid not null references public.courses (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),   -- 0 = dimanche, 6 = samedi
  start_time  time not null,
  end_time    time not null,
  room        text,
  valid_from  date not null default current_date,
  valid_until date,
  created_at  timestamptz not null default now(),
  check (end_time > start_time),
  check (valid_until is null or valid_until >= valid_from)
);
create index schedules_course_idx on public.schedules (course_id);

-- Séances datées (présentiel et/ou en ligne)
create table public.course_sessions (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  title      text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  room       text,
  live_url   text check (live_url is null or live_url ~* '^https://'),
  status     text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  notes      text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index course_sessions_course_start_idx on public.course_sessions (course_id, starts_at);
create index course_sessions_start_idx on public.course_sessions (starts_at);

create table public.enrollments (
  id          bigint generated always as identity primary key,
  course_id   uuid not null references public.courses (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'active' check (status in ('active', 'dropped')),
  enrolled_at timestamptz not null default now(),
  unique (course_id, student_id)
);
create index enrollments_student_idx on public.enrollments (student_id);

create table public.lessons (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  title      text not null,
  content    text,
  video_url  text check (video_url is null or video_url ~* '^https://'),
  position   integer not null default 0,
  published  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lessons_course_pos_idx on public.lessons (course_id, position);

-- Supports pédagogiques (fichier dans Storage ou lien externe)
create table public.course_materials (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  lesson_id  uuid references public.lessons (id) on delete set null,
  title      text not null,
  kind       text not null default 'document' check (kind in ('pdf', 'document', 'image', 'video', 'link')),
  file_path  text,
  url        text check (url is null or url ~* '^https://'),
  size_bytes bigint,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (file_path is not null or url is not null)
);
create index course_materials_course_idx on public.course_materials (course_id);

create table public.lesson_progress (
  student_id   uuid not null references public.profiles (id) on delete cascade,
  lesson_id    uuid not null references public.lessons (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (student_id, lesson_id)
);

-- ---------------------------------------------------------------------
-- Exercices, devoirs, soumissions, corrections, notes
-- ---------------------------------------------------------------------
create table public.exercises (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references public.courses (id) on delete cascade,
  lesson_id       uuid references public.lessons (id) on delete set null,
  title           text not null,
  instructions    text not null,
  kind            text not null default 'exercise' check (kind in ('exercise', 'evaluation')),
  max_score       numeric(5, 2) not null default 20 check (max_score > 0),
  attachment_path text,
  published       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index exercises_course_idx on public.exercises (course_id);

create table public.assignments (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  due_at      timestamptz,
  allow_late  boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index assignments_course_idx on public.assignments (course_id);
create index assignments_exercise_idx on public.assignments (exercise_id);

create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  content       text,
  file_paths    text[] not null default '{}',
  status        text not null default 'submitted' check (status in ('submitted', 'corrected')),
  submitted_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assignment_id, student_id),
  check (coalesce(length(content), 0) > 0 or cardinality(file_paths) > 0)
);
create index submissions_student_idx on public.submissions (student_id);

create table public.corrections (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  instructor_id uuid references public.profiles (id) on delete set null,
  feedback      text not null,
  file_path     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.grades (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  -- colonnes dénormalisées (remplies par trigger) pour les bulletins et RLS
  student_id    uuid not null references public.profiles (id) on delete cascade,
  course_id     uuid not null references public.courses (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  score         numeric(5, 2) not null check (score >= 0),
  max_score     numeric(5, 2) not null check (max_score > 0),
  graded_by     uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (score <= max_score)
);
create index grades_student_idx on public.grades (student_id);
create index grades_course_idx on public.grades (course_id);

-- ---------------------------------------------------------------------
-- Questions / réponses
-- ---------------------------------------------------------------------
create table public.questions (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  lesson_id  uuid references public.lessons (id) on delete set null,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  title      text not null check (length(trim(title)) > 2),
  body       text not null,
  status     text not null default 'open' check (status in ('open', 'answered', 'closed')),
  is_hidden  boolean not null default false,    -- modération
  created_at timestamptz not null default now()
);
create index questions_course_idx on public.questions (course_id, created_at desc);
create index questions_author_idx on public.questions (author_id);

create table public.answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (length(trim(body)) > 0),
  is_accepted boolean not null default false,
  is_hidden   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index answers_question_idx on public.answers (question_id, created_at);

-- ---------------------------------------------------------------------
-- Messagerie, notifications, annonces
-- ---------------------------------------------------------------------
-- Message direct (recipient_id) OU message dans le fil d'un cours (course_id)
create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid references public.profiles (id) on delete cascade,
  course_id    uuid references public.courses (id) on delete cascade,
  body         text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  read_at      timestamptz,
  is_hidden    boolean not null default false,
  created_at   timestamptz not null default now(),
  check ((recipient_id is null) <> (course_id is null)),
  check (recipient_id is null or recipient_id <> sender_id)
);
create index messages_recipient_idx on public.messages (recipient_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);
create index messages_course_idx on public.messages (course_id, created_at);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  audience     text not null default 'all' check (audience in ('all', 'students', 'instructors', 'class')),
  class_id     smallint references public.classes (id) on delete cascade,
  pinned       boolean not null default false,
  author_id    uuid references public.profiles (id) on delete set null,
  published_at timestamptz not null default now(),
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  check ((audience = 'class') = (class_id is not null))
);
create index announcements_published_idx on public.announcements (published_at desc);
