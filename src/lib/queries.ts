import { must, supabase } from './supabase';
import type { Assignment, Correction, Course, CourseSession, Grade, Submission } from './types';

export const COURSE_SELECT =
  '*, subject:subjects(name,color), class:classes(code,name), instructor:profiles(first_name,last_name), school:schools(name)';

export const SESSION_SELECT =
  '*, course:courses(id,title, subject:subjects(name,color), class:classes(code))';

export async function myEnrolledCourseIds(userId: string): Promise<string[]> {
  const rows = must(await supabase.from('enrollments').select('course_id').eq('student_id', userId).eq('status', 'active'));
  return (rows as { course_id: string }[]).map((r) => r.course_id);
}

export async function fetchCourses(filter?: { ids?: string[]; classId?: number; instructorId?: string }): Promise<Course[]> {
  let q = supabase.from('courses').select(COURSE_SELECT).order('created_at', { ascending: false });
  if (filter?.ids) q = q.in('id', filter.ids.length ? filter.ids : ['00000000-0000-0000-0000-000000000000']);
  if (filter?.classId) q = q.eq('class_id', filter.classId);
  if (filter?.instructorId) q = q.eq('instructor_id', filter.instructorId);
  return must(await q) as unknown as Course[];
}

export async function fetchUpcomingSessions(courseIds?: string[], limit = 6): Promise<CourseSession[]> {
  let q = supabase.from('course_sessions').select(SESSION_SELECT)
    .gte('ends_at', new Date().toISOString()).neq('status', 'cancelled')
    .order('starts_at').limit(limit);
  if (courseIds) q = q.in('course_id', courseIds.length ? courseIds : ['00000000-0000-0000-0000-000000000000']);
  return must(await q) as unknown as CourseSession[];
}

export interface StudentWork {
  assignment: Assignment;
  submission: Submission | null;
  correction: Correction | null;
  grade: Grade | null;
}

/** Devoirs de l'élève avec sa copie, la correction et la note éventuelles. */
export async function fetchStudentWork(userId: string, courseId?: string): Promise<StudentWork[]> {
  let q = supabase.from('assignments')
    .select('*, exercise:exercises(*), course:courses(id,title)')
    .order('due_at', { ascending: true, nullsFirst: false });
  if (courseId) q = q.eq('course_id', courseId);
  const assignments = must(await q) as unknown as Assignment[];
  const subs = must(await supabase.from('submissions').select('*').eq('student_id', userId)) as Submission[];
  const subIds = subs.map((s) => s.id);
  const none = ['00000000-0000-0000-0000-000000000000'];
  const [corrections, grades] = await Promise.all([
    supabase.from('corrections').select('*').in('submission_id', subIds.length ? subIds : none).then(must),
    supabase.from('grades').select('*').in('submission_id', subIds.length ? subIds : none).then(must),
  ]);
  return assignments.map((a) => {
    const submission = subs.find((s) => s.assignment_id === a.id) ?? null;
    return {
      assignment: a,
      submission,
      correction: (corrections as Correction[]).find((c) => c.submission_id === submission?.id) ?? null,
      grade: (grades as Grade[]).find((g) => g.submission_id === submission?.id) ?? null,
    };
  });
}
