import { useState, type FormEvent } from 'react';
import { must, supabase } from '../lib/supabase';
import { useLoad } from '../lib/hooks';
import { DAYS } from '../lib/format';
import { Badge, Button, ConfirmButton, Field, Spinner, useAction } from './ui';

export interface Availability {
  id: number;
  instructor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  mode: 'presentiel' | 'en_ligne' | 'both';
  note: string | null;
}

/** Jours dans l'ordre de la semaine scolaire : lundi → dimanche. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const MODE_LABEL: Record<Availability['mode'], string> = {
  presentiel: 'En salle', en_ligne: 'En ligne', both: 'Salle ou en ligne',
};

const hhmm = (t: string) => t.slice(0, 5);

export async function fetchAvailabilities(instructorId?: string): Promise<Availability[]> {
  let q = supabase.from('instructor_availabilities').select('*').order('day_of_week').order('start_time');
  if (instructorId) q = q.eq('instructor_id', instructorId);
  return must(await q) as Availability[];
}

/** Le créneau [start, end] du jour `day` tient-il dans une disponibilité déclarée ? */
export function fitsAvailability(slots: Availability[], day: number, start: string, end: string): boolean {
  return slots.some((s) => s.day_of_week === day && hhmm(s.start_time) <= hhmm(start) && hhmm(s.end_time) >= hhmm(end));
}

export function availabilitySummary(slots: Availability[]): string {
  if (!slots.length) return 'Aucune disponibilité déclarée';
  return WEEK_ORDER.filter((d) => slots.some((s) => s.day_of_week === d))
    .map((d) => `${DAYS[d].slice(0, 3)}. ${slots.filter((s) => s.day_of_week === d)
      .map((s) => `${hhmm(s.start_time)}–${hhmm(s.end_time)}`).join(', ')}`)
    .join(' · ');
}

/** Liste des disponibilités groupées par jour (lecture seule ou modifiable). */
export function AvailabilityList({ slots, onDelete }: { slots: Availability[]; onDelete?: (s: Availability) => void }) {
  if (!slots.length) return <p className="muted small">Aucune disponibilité déclarée.</p>;
  return (
    <ul className="avail-list">
      {WEEK_ORDER.filter((d) => slots.some((s) => s.day_of_week === d)).map((d) => (
        <li key={d}>
          <strong className="avail-day">{DAYS[d]}</strong>
          <span className="avail-slots">
            {slots.filter((s) => s.day_of_week === d).map((s) => (
              <span key={s.id} className="avail-slot">
                🕘 {hhmm(s.start_time)}–{hhmm(s.end_time)} <Badge>{MODE_LABEL[s.mode]}</Badge>
                {s.note && <small className="muted"> {s.note}</small>}
                {onDelete && (
                  <ConfirmButton variant="ghost" message="Supprimer ce créneau de disponibilité ?" onConfirm={() => onDelete(s)}
                    aria-label="Supprimer">✕</ConfirmButton>
                )}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Saisie des disponibilités hebdomadaires d'un intervenant. */
export function AvailabilityEditor({ instructorId }: { instructorId: string }) {
  const { data, loading, reload } = useLoad(() => fetchAvailabilities(instructorId), [instructorId]);
  const [f, setF] = useState({ days: [] as number[], start: '17:00', end: '19:00', mode: 'both', note: '' });
  const { busy, run } = useAction();

  const toggleDay = (d: number) => setF((s) => ({ ...s, days: s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d] }));

  const add = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!f.days.length) throw new Error('Choisissez au moins un jour.');
      if (f.end <= f.start) throw new Error('L’heure de fin doit être après l’heure de début.');
      must(await supabase.from('instructor_availabilities').insert(f.days.map((d) => ({
        instructor_id: instructorId, day_of_week: d, start_time: f.start, end_time: f.end, mode: f.mode, note: f.note || null,
      }))));
      setF((s) => ({ ...s, days: [], note: '' }));
      await reload();
    }, 'Disponibilités enregistrées.');
  };

  const remove = (s: Availability) => run(async () => {
    must(await supabase.from('instructor_availabilities').delete().eq('id', s.id));
    await reload();
  });

  return (
    <div className="stack">
      {loading ? <Spinner /> : <AvailabilityList slots={data ?? []} onDelete={(s) => void remove(s)} />}
      <form className="form avail-form" onSubmit={add}>
        <Field label="Jours">
          <div className="chips">
            {WEEK_ORDER.map((d) => (
              <label key={d} className={`chip ${f.days.includes(d) ? 'on' : ''}`}>
                <input type="checkbox" checked={f.days.includes(d)} onChange={() => toggleDay(d)} />
                {DAYS[d]}
              </label>
            ))}
          </div>
        </Field>
        <div className="grid-2">
          <div className="grid-2">
            <Field label="De"><input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} required /></Field>
            <Field label="À"><input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} required /></Field>
          </div>
          <Field label="Format">
            <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
              {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Remarque" hint="Facultatif, ex. : « sauf pendant les examens »">
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <Button type="submit" variant="secondary" loading={busy}>+ Ajouter ces disponibilités</Button>
      </form>
    </div>
  );
}
