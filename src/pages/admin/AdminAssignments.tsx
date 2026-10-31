import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { must, supabase } from '../../lib/supabase';
import { useLoad, useRefData } from '../../lib/hooks';
import { DAYS, fullName } from '../../lib/format';
import { AvailabilityList, WEEK_ORDER, fetchAvailabilities } from '../../components/Availability';
import type { Profile } from '../../lib/types';
import { Button, Card, ConfirmButton, Empty, ErrorBox, Field, PageHeader, Spinner, useAction } from '../../components/ui';

interface Row { id: number; instructor_id: string; class_id: number; subject_id: number }

export function AdminAssignments() {
  const { data: ref } = useRefData();
  const [params, setParams] = useSearchParams();
  const selected = params.get('intervenant') ?? '';
  const [pair, setPair] = useState({ class_id: '', subject_id: '' });
  const { busy, run } = useAction();

  const { data, error, loading, reload } = useLoad(async () => {
    const [rows, instructors, wishS, wishC, availabilities] = await Promise.all([
      supabase.from('teaching_assignments').select('id, instructor_id, class_id, subject_id').then(must),
      supabase.from('profiles').select('id, first_name, last_name, role, status, instructor:instructors!instructors_profile_id_fkey!inner(application_status, specialty)')
        .eq('role', 'instructor').eq('instructor.application_status', 'approved').order('last_name').then(must),
      supabase.from('instructor_subjects').select('instructor_id, subject_id').then(must),
      supabase.from('instructor_classes').select('instructor_id, class_id').then(must),
      fetchAvailabilities(),
    ]);
    return {
      availabilities,
      rows: rows as Row[],
      instructors: instructors as unknown as (Profile & { instructor: { specialty: string | null } })[],
      wishS: wishS as { instructor_id: string; subject_id: number }[],
      wishC: wishC as { instructor_id: string; class_id: number }[],
    };
  }, []);

  if (loading || !ref) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const cls = (id: number) => ref.classes.find((c) => c.id === id);
  const sub = (id: number) => ref.subjects.find((s) => s.id === id);
  const name = (id: string) => fullName(data.instructors.find((i) => i.id === id));
  const subjectsForClass = pair.class_id
    ? ref.subjects.filter((s) => ref.classSubjects.some((cs) => cs.class_id === Number(pair.class_id) && cs.subject_id === s.id))
    : ref.subjects;

  const add = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      must(await supabase.from('teaching_assignments').insert({
        instructor_id: selected, class_id: Number(pair.class_id), subject_id: Number(pair.subject_id),
      }));
      await supabase.from('notifications').insert({
        user_id: selected, type: 'teaching_assignment', title: 'Nouvelle affectation',
        body: `Vous pouvez créer des cours de ${sub(Number(pair.subject_id))?.name} en ${cls(Number(pair.class_id))?.name}.`, link: '/intervenant/cours',
      });
      setPair({ class_id: '', subject_id: '' }); await reload();
    }, 'Affectation ajoutée, l’intervenant est notifié.');
  };

  const wishesS = data.wishS.filter((w) => w.instructor_id === selected).map((w) => sub(w.subject_id)?.name);
  const wishesC = data.wishC.filter((w) => w.instructor_id === selected).map((w) => cls(w.class_id)?.code);

  // Classes sans aucun intervenant affecté, pour repérer les besoins
  const uncovered = ref.classes.filter((c) => !data.rows.some((r) => r.class_id === c.id));

  return (
    <>
      <PageHeader title="Affectations" subtitle="Un intervenant ne peut créer des cours que pour les classes et matières qui lui sont affectées." />
      <div className="split">
        <Card title="Affecter un intervenant">
          {data.instructors.length === 0 ? <Empty icon="🧑‍🏫" title="Aucun intervenant validé" /> : (
            <form className="form" onSubmit={add}>
              <Field label="Intervenant">
                <select value={selected} onChange={(e) => setParams(e.target.value ? { intervenant: e.target.value } : {})}>
                  <option value="">Choisir…</option>
                  {data.instructors.map((i) => <option key={i.id} value={i.id}>{fullName(i)}{i.instructor.specialty ? ` — ${i.instructor.specialty}` : ''}</option>)}
                </select>
              </Field>
              {selected && (
                <>
                  <p className="small muted">Souhaits : {wishesS.join(', ') || 'aucune matière'} · {wishesC.join(', ') || 'aucune classe'}</p>
                  <div className="small"><strong>Disponibilités :</strong>
                    <AvailabilityList slots={data.availabilities.filter((a) => a.instructor_id === selected)} /></div>
                </>
              )}
              <div className="grid-2">
                <Field label="Classe">
                  <select value={pair.class_id} onChange={(e) => setPair({ class_id: e.target.value, subject_id: '' })} required>
                    <option value="">—</option>
                    {ref.classes.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                  </select>
                </Field>
                <Field label="Matière">
                  <select value={pair.subject_id} onChange={(e) => setPair({ ...pair, subject_id: e.target.value })} required>
                    <option value="">—</option>
                    {subjectsForClass.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              </div>
              <Button type="submit" loading={busy} disabled={!selected}>Affecter</Button>
            </form>
          )}
        </Card>
        <Card title="Classes sans intervenant">
          {uncovered.length ? <div className="chips">{uncovered.map((c) => <span key={c.id} className="chip warn">{c.code}</span>)}</div>
            : <p className="muted">Toutes les classes ont au moins un intervenant. 👏</p>}
        </Card>
      </div>

      <Card title="📆 Planning des disponibilités (semaine)">
        {data.instructors.length === 0 ? <p className="muted">Aucun intervenant validé.</p> : (
          <div className="table-wrap">
            <table className="planning">
              <thead><tr><th>Intervenant</th>{WEEK_ORDER.map((d) => <th key={d}>{DAYS[d].slice(0, 3)}.</th>)}</tr></thead>
              <tbody>
                {data.instructors.map((i) => {
                  const mine = data.availabilities.filter((a) => a.instructor_id === i.id);
                  return (
                    <tr key={i.id}>
                      <th scope="row">
                        <button className="link" onClick={() => setParams({ intervenant: i.id })}>{fullName(i)}</button>
                        {!mine.length && <><br /><small className="muted">non renseigné</small></>}
                      </th>
                      {WEEK_ORDER.map((d) => {
                        const slots = mine.filter((a) => a.day_of_week === d);
                        return (
                          <td key={d} className={slots.length ? 'has' : ''}>
                            {slots.map((s) => <div key={s.id}>{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</div>)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Affectations en cours (${data.rows.length})`}>
        {data.rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Intervenant</th><th>Classe</th><th>Matière</th><th /></tr></thead>
              <tbody>
                {[...data.rows].sort((a, b) => (cls(a.class_id)?.sort_order ?? 0) - (cls(b.class_id)?.sort_order ?? 0)).map((r) => (
                  <tr key={r.id} className={r.instructor_id === selected ? 'highlight' : ''}>
                    <td>{name(r.instructor_id)}</td>
                    <td>{cls(r.class_id)?.code}</td>
                    <td>{sub(r.subject_id)?.name}</td>
                    <td><ConfirmButton variant="ghost" message="Retirer cette affectation ? Les cours existants sont conservés." onConfirm={() => void run(async () => {
                      must(await supabase.from('teaching_assignments').delete().eq('id', r.id)); await reload();
                    }, 'Affectation retirée.')}>Retirer</ConfirmButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="🧩" title="Aucune affectation" />}
      </Card>
    </>
  );
}
