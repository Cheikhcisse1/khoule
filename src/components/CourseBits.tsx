import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { COURSE_STATUS, DAYS, formatDateTime, formatTime, fullName } from '../lib/format';
import type { Course, CourseSession, Schedule } from '../lib/types';
import { Badge } from './ui';

export function CourseCard({ course, footer }: { course: Course; footer?: ReactNode }) {
  const color = course.subject?.color ?? '#1f7a4d';
  return (
    <article className="course-card" style={{ ['--accent' as string]: color }}>
      <Link to={`/cours/${course.id}`} className="course-card-link">
        <div className="course-card-band">
          <span>{course.subject?.name}</span>
          <span className="course-card-class">{course.class?.code}</span>
        </div>
        <div className="course-card-body">
          <h3>{course.title}</h3>
          {course.description && <p className="clamp-2 muted">{course.description}</p>}
          <p className="small">🧑‍🏫 {fullName(course.instructor)}</p>
        </div>
      </Link>
      {(footer || course.status !== 'published') && (
        <div className="course-card-foot">
          {course.status !== 'published' && <Badge tone={course.status === 'draft' ? 'warning' : 'neutral'}>{COURSE_STATUS[course.status]}</Badge>}
          {footer}
        </div>
      )}
    </article>
  );
}

export function SessionItem({ s, showCourse = true }: { s: CourseSession; showCourse?: boolean }) {
  const start = new Date(s.starts_at);
  const live = Date.now() >= start.getTime() - 15 * 60000 && Date.now() <= new Date(s.ends_at).getTime();
  return (
    <li className={`session ${s.status === 'cancelled' ? 'cancelled' : ''}`}>
      <div className="session-date" style={{ borderColor: s.course?.subject?.color }}>
        <span>{start.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'Africa/Dakar' })}</span>
        <strong>{start.toLocaleDateString('fr-FR', { day: 'numeric', timeZone: 'Africa/Dakar' })}</strong>
        <span>{start.toLocaleDateString('fr-FR', { month: 'short', timeZone: 'Africa/Dakar' })}</span>
      </div>
      <div className="session-main">
        <strong>{s.title}</strong>
        {showCourse && s.course && (
          <Link to={`/cours/${s.course.id}`} className="small">{s.course.subject?.name} · {s.course.class?.code} — {s.course.title}</Link>
        )}
        <span className="small muted">
          🕘 {formatTime(s.starts_at)} – {formatTime(s.ends_at)}{s.room ? ` · 📍 ${s.room}` : ''}
          {s.status === 'cancelled' && ' · Annulée'}
        </span>
      </div>
      {s.live_url && s.status !== 'cancelled' && (
        <a href={s.live_url} target="_blank" rel="noopener noreferrer" className={`btn ${live ? 'btn-primary pulse' : 'btn-secondary'}`}>
          {live ? '🔴 Rejoindre' : '🎥 Lien visio'}
        </a>
      )}
    </li>
  );
}

export function ScheduleLine({ s }: { s: Schedule }) {
  return (
    <span>
      {DAYS[s.day_of_week]} {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}{s.room ? ` · ${s.room}` : ''}
    </span>
  );
}

export function DueBadge({ due, submitted }: { due: string | null; submitted: boolean }) {
  if (submitted) return null;
  if (!due) return <Badge>Sans date limite</Badge>;
  const diff = new Date(due).getTime() - Date.now();
  if (diff < 0) return <Badge tone="danger">En retard · {formatDateTime(due)}</Badge>;
  if (diff < 2 * 86400000) return <Badge tone="warning">À rendre {formatDateTime(due)}</Badge>;
  return <Badge tone="info">À rendre {formatDateTime(due)}</Badge>;
}
