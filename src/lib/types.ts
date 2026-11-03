export type Role = 'admin' | 'instructor' | 'student';
export type ProfileStatus = 'pending' | 'active' | 'suspended';

export interface Profile {
  id: string;
  role: Role;
  status: ProfileStatus;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  created_at: string;
}

export type PersonName = Pick<Profile, 'first_name' | 'last_name'> & { role?: Role };

export interface SchoolClass {
  id: number;
  code: string;
  name: string;
  cycle: 'elementaire' | 'college' | 'lycee' | 'superieur';
  sort_order: number;
}

export interface Subject {
  id: number;
  name: string;
  color: string;
}

export interface Student {
  profile_id: string;
  class_id: number | null;
  school: string | null;
  birth_year: number | null;
  phone: string | null;
  guardian_name: string | null;
  guardian_relation: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;
  guardian_consent: boolean;
  consent_at: string | null;
  school_id: string | null;
  school_status: 'pending' | 'approved' | 'rejected' | null;
  program_id: string | null;
}

/** Filière d'une université ou école supérieure */
export interface SchoolProgram {
  id: string;
  school_id: string;
  name: string;
  class_ids: number[];
  created_at: string;
}

export interface School {
  id: string;
  name: string;
  kind: 'elementaire' | 'college' | 'lycee' | 'universite' | 'ecole_superieure' | 'autre';
  city: string | null;
  created_at: string;
}

export interface SchoolStaff {
  school_id: string;
  user_id: string;
  title: string;
  scope: 'school' | 'classes';
  class_ids: number[];
  school?: School;
  profile?: PersonName;
}

export interface Instructor {
  profile_id: string;
  instructor_type: 'enseignant' | 'professeur' | 'etudiant' | 'autre';
  education_level: string | null;
  specialty: string | null;
  experience: string | null;
  bio: string | null;
  application_status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at?: string;
}

export type CourseStatus = 'draft' | 'published' | 'archived';

export interface Course {
  id: string;
  title: string;
  description: string | null;
  class_id: number;
  subject_id: number;
  instructor_id: string;
  status: CourseStatus;
  format: 'cours' | 'td' | 'tp';
  school_id: string | null;
  school?: Pick<School, 'name'> | null;
  program_id: string | null;
  program?: Pick<SchoolProgram, 'name'> | null;
  published_at: string | null;
  created_at: string;
  subject?: Pick<Subject, 'name' | 'color'>;
  class?: Pick<SchoolClass, 'code' | 'name'>;
  instructor?: PersonName;
}

export interface Lesson {
  id: string;
  course_id: string;
  title: string;
  content: string | null;
  video_url: string | null;
  position: number;
  published: boolean;
}

export interface Material {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  kind: 'pdf' | 'document' | 'image' | 'video' | 'link';
  file_path: string | null;
  url: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface CourseSession {
  id: string;
  course_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  room: string | null;
  live_url: string | null;
  status: 'scheduled' | 'done' | 'cancelled';
  notes: string | null;
  course?: Pick<Course, 'id' | 'title'> & { subject?: Pick<Subject, 'name' | 'color'>; class?: Pick<SchoolClass, 'code'> };
}

export interface Schedule {
  id: number;
  course_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  valid_from: string;
  valid_until: string | null;
  course?: Pick<Course, 'id' | 'title'> & { subject?: Pick<Subject, 'name' | 'color'>; class?: Pick<SchoolClass, 'code'> };
}

export interface Exercise {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  instructions: string;
  kind: 'exercise' | 'evaluation';
  max_score: number;
  attachment_path: string | null;
  published: boolean;
  created_at: string;
}

export interface Assignment {
  id: string;
  course_id: string;
  exercise_id: string;
  due_at: string | null;
  allow_late: boolean;
  created_at: string;
  exercise?: Exercise;
  course?: Pick<Course, 'id' | 'title'>;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string | null;
  file_paths: string[];
  status: 'submitted' | 'corrected';
  submitted_at: string;
}

export interface Correction {
  id: string;
  submission_id: string;
  feedback: string;
  file_path: string | null;
  created_at: string;
}

export interface Grade {
  id: string;
  submission_id: string;
  student_id: string;
  course_id: string;
  assignment_id: string;
  score: number;
  max_score: number;
  created_at: string;
}

export interface Question {
  id: string;
  course_id: string;
  lesson_id: string | null;
  author_id: string;
  title: string;
  body: string;
  status: 'open' | 'answered' | 'closed';
  is_hidden: boolean;
  created_at: string;
  author?: PersonName;
  course?: Pick<Course, 'title' | 'instructor_id'>;
}

export interface Answer {
  id: string;
  question_id: string;
  author_id: string;
  body: string;
  is_accepted: boolean;
  is_hidden: boolean;
  created_at: string;
  author?: PersonName;
}

export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  course_id: string | null;
  body: string;
  read_at: string | null;
  is_hidden: boolean;
  created_at: string;
  sender?: PersonName;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: 'all' | 'students' | 'instructors' | 'class';
  class_id: number | null;
  school_id?: string | null;
  pinned: boolean;
  published_at: string;
  expires_at: string | null;
}
