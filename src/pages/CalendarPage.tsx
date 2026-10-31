import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { must, supabase } from '../lib/supabase';
import { useLoad } from '../lib/hooks';
import { myEnrolledCourseIds } from '../lib/queries';
import { formatTime } from '../lib/format';
import type { CourseSession } from '../lib/types';
import { Button, Card, ErrorBox, PageHeader, Spinner } from '../components/ui';
import { SessionItem } from '../components/CourseBits';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

type Row = CourseSession & { course: NonNullable<CourseSession['course']> & { instructor_id: string } };

export function CalendarPage() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [selected, setSelected] = useState<string | null>(new Date().toDateString());
  const [onlyMine, setOnlyMine] = useState(true);

  const { data, error, loading, reload } = useLoad(async () => {
    const from = new Date(month); from.setDate(from.getDate() - 7);
    const to = new Date(month); to.setMonth(to.getMonth() + 1); to.setDate(to.getDate() + 7);
    const [sessions, enrolled] = await Promise.all([
      supabase.from('course_sessions')
        .select('*, course:courses(id,title,instructor_id, subject:subjects(name,color), class:classes(code))')
        .gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).order('starts_at').then(must),
      profile!.role === 'student' ? myEnrolledCourseIds(uid) : Promise.resolve([] as string[]),
    ]);
    return { sessions: sessions as unknown as Row[], enrolled };
  }, [month.getTime(), uid]);

  const visible = useMemo(() => {
    if (!data) return [];
    if (!onlyMine || profile!.role === 'admin') return data.sessions;
    if (profile!.role === 'student') return data.sessions.filter((s) => data.enrolled.includes(s.course_id));
    return data.sessions.filter((s) => s.course.instructor_id === uid);
  }, [data, onlyMine, profile, uid]);

  const days = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7; // semaine commençant le lundi
    const start = new Date(first); start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);

  const byDay = (d: Date) => visible.filter((s) => new Date(s.starts_at).toDateString() === d.toDateString());
  const shift = (n: number) => setMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() + n); return d; });
  const selectedDay = selected ? days.find((d) => d.toDateString() === selected) : null;

  return (
    <>
      <PageHeader title="Calendrier des cours" subtitle="Les séances ont lieu toute la semaine, selon les disponibilités des intervenants."
        actions={profile!.role !== 'admin' && (
          <label className="check"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            <span>{profile!.role === 'student' ? 'Uniquement mes cours' : 'Uniquement mes séances'}</span></label>
        )} />
      <Card>
        <div className="cal-head">
          <Button variant="ghost" onClick={() => shift(-1)} aria-label="Mois précédent">←</Button>
          <h2>{month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h2>
          <Button variant="ghost" onClick={() => shift(1)} aria-label="Mois suivant">→</Button>
        </div>
        {loading ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : (
          <div className="cal">
            {WEEKDAYS.map((w, i) => <div key={w} className={`cal-wd ${i >= 5 ? 'weekend' : ''}`}>{w}</div>)}
            {days.map((d) => {
              const items = byDay(d);
              const out = d.getMonth() !== month.getMonth();
              const today = d.toDateString() === new Date().toDateString();
              const we = d.getDay() === 0 || d.getDay() === 6;
              return (
                <button key={d.toISOString()} onClick={() => setSelected(d.toDateString())}
                  className={`cal-day ${out ? 'out' : ''} ${today ? 'today' : ''} ${we ? 'weekend' : ''} ${selected === d.toDateString() ? 'sel' : ''}`}>
                  <span className="cal-n">{d.getDate()}</span>
                  {items.slice(0, 3).map((s) => (
                    <span key={s.id} className={`cal-ev ${s.status === 'cancelled' ? 'cancelled' : ''}`} style={{ background: s.course.subject?.color }}>
                      {formatTime(s.starts_at)} {s.course.subject?.name}
                    </span>
                  ))}
                  {items.length > 3 && <span className="cal-more">+{items.length - 3}</span>}
                </button>
              );
            })}
          </div>
        )}
      </Card>
      {selectedDay && (
        <Card title={selectedDay.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}>
          {byDay(selectedDay).length ? <ul className="sessions">{byDay(selectedDay).map((s) => <SessionItem key={s.id} s={s} />)}</ul>
            : <p className="muted">Aucune séance ce jour-là.</p>}
        </Card>
      )}
    </>
  );
}
