import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { fullName } from '../lib/format';
import type { PersonName, SchoolProgram } from '../lib/types';
import { Button, Field, Modal } from './ui';

// Bulletins de notes : une page A4 par élève, au nom de l'établissement.
// Pas de bibliothèque PDF : la page est imprimée par le navigateur, qui propose « Enregistrer en PDF »
// (ordinateur comme téléphone). Les notes sont ramenées sur 20 et regroupées par matière.

export interface ReportGrade {
  student_id: string; score: number; max_score: number;
  course: { title: string; subject: { name: string } | null } | null;
}
export interface ReportStudent { profile_id: string; class_id: number | null; program_id: string | null; profile: PersonName }

const on20 = (g: ReportGrade) => (Number(g.score) / Number(g.max_score)) * 20;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (v: number | null) => (v == null ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ','));
// Mentions usuelles au Sénégal
const mention = (v: number | null) => v == null ? '—' : v >= 16 ? 'Très bien' : v >= 14 ? 'Bien' : v >= 12 ? 'Assez bien' : v >= 10 ? 'Passable' : 'Insuffisant';

function schoolYear() {
  const d = new Date(); const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `Année scolaire ${y}-${y + 1}`;
}

interface Job { classId: number; programId: string; period: string }

/** Bouton + choix de la classe (et filière) puis impression des bulletins. */
export function ReportCardsButton({ schoolName, higher, classes, programs, students, grades }: {
  schoolName: string; higher: boolean; classes: { id: number; name: string; code: string }[];
  programs: SchoolProgram[]; students: ReportStudent[]; grades: ReportGrade[];
}) {
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const withStudents = classes.filter((c) => students.some((s) => s.class_id === c.id));
  const [f, setF] = useState({ classId: String(withStudents[0]?.id ?? ''), programId: '', period: schoolYear() });

  const generate = (e: FormEvent) => {
    e.preventDefault();
    setOpen(false);
    setJob({ classId: Number(f.classId), programId: f.programId, period: f.period.trim() });
  };

  const list = job ? students.filter((s) => s.class_id === job.classId && (!job.programId || s.program_id === job.programId)) : [];
  const levelPrograms = programs.filter((pr) => !pr.class_ids.length || pr.class_ids.includes(Number(f.classId)));

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!withStudents.length}>Bulletins (PDF)</Button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Bulletins de notes">
          <form className="form" onSubmit={generate}>
            <Field label={higher ? 'Niveau' : 'Classe'} required>
              <select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value, programId: '' })} required>
                {withStudents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            {higher && levelPrograms.length > 0 && (
              <Field label="Filière">
                <select value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value })}>
                  <option value="">Toutes les filières</option>
                  {levelPrograms.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Période" hint="Ex. : 1er trimestre, Semestre 1…">
              <input value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} required />
            </Field>
            <p className="small muted">La fenêtre d’impression s’ouvre : choisissez « Enregistrer en PDF » comme imprimante.
              Une page par {higher ? 'étudiant' : 'élève'}.</p>
            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit">Générer</Button>
            </div>
          </form>
        </Modal>
      )}
      {job && (
        <PrintCards schoolName={schoolName} higher={higher} period={job.period}
          className={classes.find((c) => c.id === job.classId)?.name ?? ''}
          programName={programs.find((pr) => pr.id === job.programId)?.name}
          programOf={(id) => programs.find((pr) => pr.id === id)?.name}
          students={list} grades={grades} onDone={() => setJob(null)} />
      )}
    </>
  );
}

function PrintCards({ schoolName, higher, period, className, programName, programOf, students, grades, onDone }: {
  schoolName: string; higher: boolean; period: string; className: string; programName?: string;
  programOf: (id: string | null) => string | undefined; students: ReportStudent[]; grades: ReportGrade[]; onDone: () => void;
}) {
  // Impression dès que les pages sont dans le document, puis on les retire
  useEffect(() => {
    const done = () => onDone();
    window.addEventListener('afterprint', done, { once: true });
    const t = setTimeout(() => window.print(), 50);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [onDone]);

  // Moyenne générale de chaque élève (moyenne des matières) pour le rang
  const rows = students.map((s) => {
    const mine = grades.filter((g) => g.student_id === s.profile_id);
    const bySubject = new Map<string, { courses: Set<string>; notes: number[] }>();
    for (const g of mine) {
      const key = g.course?.subject?.name ?? g.course?.title ?? 'Autre';
      const e = bySubject.get(key) ?? { courses: new Set<string>(), notes: [] };
      if (g.course?.title) e.courses.add(g.course.title);
      e.notes.push(on20(g));
      bySubject.set(key, e);
    }
    const subjects = [...bySubject.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([name, e]) => ({ name, courses: [...e.courses].join(', '), count: e.notes.length, avg: mean(e.notes) }));
    return { s, subjects, general: mean(subjects.map((x) => x.avg!).filter((x) => x != null)) };
  });
  const ranked = rows.filter((r) => r.general != null).map((r) => r.general!).sort((a, b) => b - a);
  const classAvg = mean(ranked);
  const learner = higher ? 'Étudiant(e)' : 'Élève';

  return createPortal(
    <div className="print-root">
      {rows.length === 0 && <section className="report-card"><p>Aucun {higher ? 'étudiant' : 'élève'} validé dans cette sélection.</p></section>}
      {[...rows].sort((a, b) => fullName(a.s.profile).localeCompare(fullName(b.s.profile))).map(({ s, subjects, general }) => (
        <section key={s.profile_id} className="report-card">
          <header className="rc-head">
            <div>
              <strong className="rc-school">{schoolName}</strong>
              <span>Partenaire Khoulé Éducation</span>
            </div>
            <div className="rc-title">
              <strong>Bulletin de notes</strong>
              <span>{period}</span>
            </div>
          </header>
          <dl className="rc-id">
            <dt>{learner}</dt><dd>{s.profile.last_name.toUpperCase()} {s.profile.first_name}</dd>
            <dt>{higher ? 'Niveau' : 'Classe'}</dt><dd>{className}</dd>
            {higher && <><dt>Filière</dt><dd>{programOf(s.program_id) ?? programName ?? '—'}</dd></>}
            <dt>Effectif</dt><dd>{rows.length}</dd>
          </dl>
          <table className="rc-table">
            <thead><tr><th>Matière</th><th>Cours</th><th>Notes</th><th>Moyenne /20</th><th>Appréciation</th></tr></thead>
            <tbody>
              {subjects.length ? subjects.map((x) => (
                <tr key={x.name}><td><strong>{x.name}</strong></td><td>{x.courses}</td><td className="num">{x.count}</td>
                  <td className="num">{fmt(x.avg)}</td><td>{mention(x.avg)}</td></tr>
              )) : <tr><td colSpan={5}>Aucune note sur la période.</td></tr>}
            </tbody>
          </table>
          <div className="rc-summary">
            <p><span>Moyenne générale</span><strong>{fmt(general)} / 20</strong></p>
            <p><span>Rang</span><strong>{general == null ? '—' : `${ranked.indexOf(general) + 1}${ranked.indexOf(general) === 0 ? 'er' : 'e'} / ${ranked.length}`}</strong></p>
            <p><span>Moyenne de la {higher ? 'promotion' : 'classe'}</span><strong>{fmt(classAvg)} / 20</strong></p>
            <p><span>Mention</span><strong>{mention(general)}</strong></p>
          </div>
          <div className="rc-sign">
            <div><span>Appréciation du conseil</span><div className="rc-box" /></div>
            <div><span>Signature et cachet de la direction</span><div className="rc-box" /></div>
          </div>
          <footer className="rc-foot">Édité le {new Date().toLocaleDateString('fr-FR')} · khoule-education.vercel.app</footer>
        </section>
      ))}
    </div>,
    document.body,
  );
}
