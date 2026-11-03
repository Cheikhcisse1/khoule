import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { must, supabase } from '../lib/supabase';
import { useLoad, useRefData } from '../lib/hooks';
import { COURSE_SELECT } from '../lib/queries';
import { COURSE_FORMAT, formatDate, fullName } from '../lib/format';
import { KIND_CYCLES, SCHOOL_KINDS, SCHOOL_STATUS, STAFF_TITLES, covers, isHigher, loadMySchools, useMySchools } from '../lib/schools';
import type { Announcement, Course, PersonName, SchoolProgram, SchoolStaff, Student } from '../lib/types';
import { CourseCard } from '../components/CourseBits';
import { ReportCardsButton } from '../components/ReportCards';
import { AdminPanel, FollowupModal, PlanningPanel, RollPanel } from './school/VieScolaire';
import {
  Badge, Button, Card, ConfirmButton, Empty, ErrorBox, Field, Modal, PageHeader, RichText, Spinner, StatCard, Tabs, useAction,
} from '../components/ui';

type Tab = 'dash' | 'students' | 'programs' | 'courses' | 'planning' | 'roll' | 'grades' | 'admin' | 'news' | 'team';
type SchoolStudent = Student & { profile: PersonName & { status: string } };
interface GradeRow { student_id: string; score: number; max_score: number; course: { title: string; subject: { name: string } | null } | null; assignment: { exercise: { title: string } | null } | null }

/**
 * Espace d'un responsable d'établissement (directeur, proviseur, responsable de filière).
 * Tout ce qui s'affiche est filtré par la base : le responsable ne voit que son école,
 * et un responsable de filière seulement ses classes.
 */
export function SchoolSpace() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const { data: mine, error, loading, reload } = useMySchools(uid);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('dash');

  if (loading) return <Spinner />;
  if (error || !mine) return <ErrorBox error={error ?? ''} onRetry={reload} />;
  if (!mine.length) {
    return (
      <>
        <PageHeader title="Mon école" />
        <Card><Empty icon="🏫" title="Vous n’êtes responsable d’aucun établissement">
          L’administration de Khoulé Éducation vous nomme responsable de votre école (directeur, proviseur ou responsable de filière).
        </Empty></Card>
      </>
    );
  }
  const st = mine.find((m) => m.school_id === schoolId) ?? mine[0];
  const director = st.scope === 'school';
  // Université / école supérieure : on parle d'étudiants, le responsable gère des filières (pas des cours)
  const higher = isHigher(st.school?.kind);

  return (
    <>
      <PageHeader
        title={<>🏫 {st.school?.name}</>}
        subtitle={`${SCHOOL_KINDS[st.school?.kind ?? 'autre']} · ${STAFF_TITLES[st.title] ?? st.title}${director ? '' : ' (vos classes uniquement)'}`}
        actions={mine.length > 1 ? (
          <select value={st.school_id} onChange={(e) => { setSchoolId(e.target.value); setTab('dash'); }} aria-label="Établissement">
            {mine.map((m) => <option key={m.school_id} value={m.school_id}>{m.school?.name}</option>)}
          </select>
        ) : undefined}
      />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'dash', label: '📊 Tableau de bord' },
        { id: 'students', label: higher ? '🎓 Étudiants' : '🎒 Élèves' },
        ...(higher ? [{ id: 'programs' as Tab, label: '🧭 Filières' }] : []),
        { id: 'courses', label: '📚 Cours' },
        { id: 'planning', label: '🗓️ Planning' },
        { id: 'roll', label: '📋 Appel' },
        { id: 'grades', label: '📈 Notes' },
        { id: 'admin', label: '🗂️ Administratif' },
        { id: 'news', label: '📢 Annonces' },
        ...(director ? [{ id: 'team' as Tab, label: '🧑‍💼 Équipe' }] : []),
      ]} />
      <div className="tab-panel">
        <SchoolPanels key={st.school_id} st={st} tab={tab} setTab={setTab} uid={uid} />
      </div>
    </>
  );
}

function SchoolPanels({ st, tab, setTab, uid }: { st: SchoolStaff; tab: Tab; setTab: (t: Tab) => void; uid: string }) {
  const { data: ref } = useRefData();
  const [follow, setFollow] = useState<SchoolStudent | null>(null);
  const { data, error, loading, reload } = useLoad(async () => {
    const [students, courses, programs] = await Promise.all([
      supabase.from('students')
        .select('*, profile:profiles(first_name,last_name,status)')
        .eq('school_id', st.school_id).then(must),
      supabase.from('courses').select(COURSE_SELECT).eq('school_id', st.school_id)
        .order('created_at', { ascending: false }).then(must),
      supabase.from('school_programs').select('*').eq('school_id', st.school_id).order('name').then(must),
    ]);
    const list = (students as unknown as SchoolStudent[])
      .sort((a, b) => fullName(a.profile).localeCompare(fullName(b.profile)));
    const approved = list.filter((s) => s.school_status === 'approved').map((s) => s.profile_id);
    const grades = approved.length
      ? must(await supabase.from('grades')
          .select('student_id, score, max_score, course:courses(title, subject:subjects(name)), assignment:assignments(exercise:exercises(title))')
          .in('student_id', approved)) as unknown as GradeRow[]
      : [];
    return { students: list, courses: courses as unknown as Course[], grades, programs: programs as SchoolProgram[] };
  }, [st.school_id]);

  if (loading || !ref) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const cls = (id: number | null) => ref.classes.find((c) => c.id === id);
  // Classes de l'établissement (selon son type) que ce responsable couvre
  const cycles = KIND_CYCLES[st.school?.kind ?? 'autre'];
  const myClasses = ref.classes.filter((c) => covers(st, c.id) && (st.scope === 'classes' || !cycles || cycles.includes(c.cycle)));
  const pending = data.students.filter((s) => s.school_status === 'pending');
  const approved = data.students.filter((s) => s.school_status === 'approved');
  const avg = (rows: GradeRow[]) => rows.length ? rows.reduce((t, g) => t + (Number(g.score) / Number(g.max_score)) * 20, 0) / rows.length : null;
  const higher = isHigher(st.school?.kind);
  const learner = higher ? 'étudiant' : 'élève';
  const fmt20 = (v: number | null) => (v == null ? '—' : `${(Math.round(v * 10) / 10).toString().replace('.', ',')}/20`);

  if (tab === 'dash') {
    return (
      <>
        <div className="stats">
          <StatCard icon={higher ? '🎓' : '🎒'} label={higher ? 'Étudiants validés' : 'Élèves validés'} value={approved.length} />
          <StatCard icon="⏳" label="Inscriptions à valider" value={pending.length} tone="gold" />
          {higher
            ? <StatCard icon="🧭" label="Filières" value={data.programs.length} tone="blue" />
            : <StatCard icon="📚" label="Cours de l’école" value={data.courses.length} tone="blue" />}
          <StatCard icon="📈" label="Moyenne des devoirs" value={fmt20(avg(data.grades))} tone="clay" />
        </div>
        {pending.length > 0 && (
          <div className="alert alert-info">
            {pending.length} {learner}(s) attendent votre validation. <button className="link-btn" onClick={() => setTab('students')}>Les voir</button>
          </div>
        )}
        <Card title="Effectifs par classe">
          {approved.length ? (
            <ul className="list">
              {myClasses.filter((c) => approved.some((s) => s.class_id === c.id)).map((c) => {
                const ids = approved.filter((s) => s.class_id === c.id).map((s) => s.profile_id);
                return (
                  <li key={c.id} className="list-row">
                    <span><strong>{c.name}</strong> · {ids.length} {learner}(s)</span>
                    <span className="muted small">Moyenne {fmt20(avg(data.grades.filter((g) => ids.includes(g.student_id))))}</span>
                  </li>
                );
              })}
            </ul>
          ) : <Empty icon="🎒" title={`Aucun ${learner} validé pour l’instant`} />}
        </Card>
      </>
    );
  }

  const followModal = follow && (
    <FollowupModal st={st} student={follow} grades={data.grades} onClose={() => setFollow(null)}
      className={`${cls(follow.class_id)?.name ?? ''}${follow.program_id ? ` · ${data.programs.find((p) => p.id === follow.program_id)?.name ?? ''}` : ''}`} />
  );

  if (tab === 'students') return <><StudentsPanel st={st} students={data.students} cls={cls} programs={data.programs} onChange={reload} onFollow={setFollow} />{followModal}</>;

  if (tab === 'planning') return <PlanningPanel courses={data.courses} myClasses={myClasses} programs={data.programs} canEdit />;

  if (tab === 'roll') return <RollPanel st={st} students={approved} myClasses={myClasses} programs={data.programs} courses={data.courses} />;

  if (tab === 'admin') return <><AdminPanel st={st} students={approved} cls={cls} programs={data.programs} onFollow={setFollow} />{followModal}</>;

  if (tab === 'programs') return <ProgramsPanel st={st} programs={data.programs} students={data.students} myClasses={myClasses} onChange={reload} />;

  if (tab === 'courses') return <CoursesPanel st={st} courses={data.courses} myClasses={myClasses} onChange={reload} />;

  if (tab === 'grades') {
    return (
      <Card title="Notes des élèves" actions={approved.length > 0 && (
        <div className="row">
          <ReportCardsButton schoolName={st.school?.name ?? ''} higher={higher} classes={myClasses}
            programs={data.programs} students={approved} grades={data.grades} />
          <Button variant="secondary" onClick={() => exportCsv(st, approved, data.grades, cls)}>Exporter (CSV)</Button>
        </div>
      )}>
        {approved.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Élève</th><th>Classe</th><th>Devoirs notés</th><th>Moyenne</th><th>Détail</th></tr></thead>
              <tbody>
                {approved.map((s) => {
                  const g = data.grades.filter((x) => x.student_id === s.profile_id);
                  return (
                    <tr key={s.profile_id}>
                      <td><strong>{fullName(s.profile)}</strong></td>
                      <td>{cls(s.class_id)?.code}</td>
                      <td>{g.length}</td>
                      <td>{fmt20(avg(g))}</td>
                      <td className="small">{g.slice(0, 4).map((x, i) => (
                        <div key={i}>{x.course?.title} · {x.assignment?.exercise?.title} : {String(x.score).replace('.', ',')}/{x.max_score}</div>
                      ))}{g.length > 4 && <span className="muted">… {g.length - 4} autre(s)</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="📈" title="Aucun élève validé" />}
        <p className="small muted">Notes de tous les cours suivis par vos élèves (cours de l’école et cours communautaires).</p>
      </Card>
    );
  }

  if (tab === 'news') return <NewsPanel st={st} myClasses={myClasses} uid={uid} />;

  return <TeamPanel st={st} />;
}

// ---------------------------------------------------------------------------
function StudentsPanel({ st, students, cls, programs, onChange, onFollow }:
  { st: SchoolStaff; students: SchoolStudent[]; cls: (id: number | null) => { code: string; name: string } | undefined;
    programs: SchoolProgram[]; onChange: () => Promise<void>; onFollow: (s: SchoolStudent) => void }) {
  const { run } = useAction();
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const list = students.filter((s) => s.school_status === filter);

  const review = (s: SchoolStudent, ok: boolean) => run(async () => {
    must(await supabase.rpc('school_review_student', { p_student: s.profile_id, p_approve: ok }));
    await onChange();
  }, ok ? `${fullName(s.profile)} est validé(e) : il ou elle accède aux cours de l’école.` : 'Demande refusée.');

  return (
    <>
      <Tabs value={filter} onChange={setFilter} tabs={[
        { id: 'pending', label: 'À valider', count: students.filter((s) => s.school_status === 'pending').length },
        { id: 'approved', label: 'Validés', count: students.filter((s) => s.school_status === 'approved').length },
        { id: 'rejected', label: 'Refusés' },
      ]} />
      {list.length ? (
        <div className="stack">
          {list.map((s) => (
            <Card key={s.profile_id}>
              <div className="list-row">
                <div>
                  <strong>{fullName(s.profile)}</strong> <Badge>{cls(s.class_id)?.name ?? '—'}</Badge>{' '}
                  {s.program_id && <><Badge tone="info">{programs.find((pr) => pr.id === s.program_id)?.name ?? 'Filière'}</Badge>{' '}</>}
                  <Badge tone={s.school_status === 'approved' ? 'success' : s.school_status === 'pending' ? 'warning' : 'neutral'}>{SCHOOL_STATUS[s.school_status ?? 'pending']}</Badge>
                  {s.profile.status === 'pending' && <span className="small muted"> · compte en attente (votre validation l’active)</span>}
                </div>
                <div className="row">
                  {s.school_status !== 'approved' && <Button onClick={() => void review(s, true)}>Valider</Button>}
                  {s.school_status === 'pending' && <Button variant="ghost" onClick={() => void review(s, false)}>Refuser</Button>}
                  {s.school_status === 'approved' && <Button variant="secondary" onClick={() => onFollow(s)}>Suivi</Button>}
                  {s.school_status === 'approved' && <Link className="btn btn-ghost" to={`/messages?avec=${s.profile_id}`}>Écrire</Link>}
                  {s.school_status === 'approved' && (
                    <ConfirmButton variant="ghost" message={`Retirer ${fullName(s.profile)} de l’établissement ? (son compte reste actif)`}
                      onConfirm={() => void run(async () => {
                        must(await supabase.rpc('school_remove_student', { p_student: s.profile_id })); await onChange();
                      }, 'Élève retiré de l’établissement.')}>Retirer</ConfirmButton>
                  )}
                </div>
              </div>
              <details className="small">
                <summary>Fiche</summary>
                <p>Né(e) en {s.birth_year ?? '—'} · Tél. {s.phone ?? '—'}</p>
                <p>Parent / tuteur : {s.guardian_name ?? '—'} {s.guardian_relation ? `(${s.guardian_relation})` : ''} · {s.guardian_phone ?? '—'} · {s.guardian_email ?? '—'}
                  {s.guardian_consent && ' · accord donné'}</p>
              </details>
            </Card>
          ))}
        </div>
      ) : (
        <Card><Empty icon="🎒" title={filter === 'pending' ? 'Aucune inscription à valider' : 'Aucun élève'}>
          {filter === 'pending' && 'Les élèves choisissent votre établissement à l’inscription ; ils apparaissent ici.'}
        </Empty></Card>
      )}
      {st.scope === 'classes' && <p className="small muted">Vous voyez uniquement les élèves des classes qui vous sont confiées.</p>}
    </>
  );
}

// ---------------------------------------------------------------------------
function CoursesPanel({ st, courses, myClasses, onChange }:
  { st: SchoolStaff; courses: Course[]; myClasses: { id: number; code: string; name: string }[]; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  // Supérieur : les cours sont créés par les professeurs ; le responsable organise les filières
  const higher = isHigher(st.school?.kind);
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
        <p className="muted" style={{ margin: 0 }}>{higher
          ? 'Les cours, TD et TP sont créés par les professeurs. Vous suivez ici ceux de votre établissement ; organisez vos filières dans l’onglet Filières.'
          : 'Cours réservés aux élèves validés de l’établissement. Vous pouvez les modifier, les publier et suivre les élèves.'}</p>
        {!higher && <Button onClick={() => setOpen(true)}>+ Nouveau cours</Button>}
      </div>
      {courses.length
        ? <div className="course-grid">{courses.map((c) => <CourseCard key={c.id} course={c} />)}</div>
        : <Card><Empty icon="📚" title="Aucun cours d’école pour l’instant" /></Card>}
      {open && <SchoolCourseModal st={st} myClasses={myClasses} onClose={() => setOpen(false)} onDone={onChange} />}
    </>
  );
}

function SchoolCourseModal({ st, myClasses, onClose, onDone }:
  { st: SchoolStaff; myClasses: { id: number; code: string; name: string }[]; onClose: () => void; onDone: () => Promise<void> }) {
  const { data: ref } = useRefData();
  const { data: teachers } = useLoad(async () =>
    must(await supabase.from('profiles').select('id, first_name, last_name')
      .eq('role', 'instructor').eq('status', 'active').order('last_name')) as (PersonName & { id: string })[], []);
  const [f, setF] = useState({ class_id: String(myClasses[0]?.id ?? ''), subject_id: '', instructor_id: '', title: '', description: '', format: 'cours', publish: false });
  const { busy, run } = useAction();

  if (!ref || !teachers) return <Modal open onClose={onClose} title="Nouveau cours de l’école"><Spinner /></Modal>;
  const subjects = ref.subjects.filter((s) => ref.classSubjects.some((cs) => String(cs.class_id) === f.class_id && cs.subject_id === s.id));

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      must(await supabase.from('courses').insert({
        title: f.title, description: f.description || null, class_id: Number(f.class_id), subject_id: Number(f.subject_id),
        instructor_id: f.instructor_id, status: f.publish ? 'published' : 'draft', format: f.format, school_id: st.school_id,
      }));
      onClose(); await onDone();
    }, f.publish ? 'Cours publié : les élèves validés de la classe sont notifiés.' : 'Cours créé en brouillon.');
  };

  return (
    <Modal open onClose={onClose} title="Nouveau cours de l’école">
      <form className="form" onSubmit={save}>
        <div className="grid-2">
          <Field label="Classe" required>
            <select value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value, subject_id: '' })} required>
              {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Matière" required>
            <select value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value })} required>
              <option value="">Choisir…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Enseignant" required hint="Intervenant ou professeur ayant un compte validé">
            <select value={f.instructor_id} onChange={(e) => setF({ ...f, instructor_id: e.target.value })} required>
              <option value="">Choisir…</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}
            </select>
          </Field>
          <Field label="Format">
            <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}>
              {Object.entries(COURSE_FORMAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Titre" required><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3}
          placeholder="Ex. : Mathématiques 3e — groupe B · Droit des obligations — TD 1" /></Field>
        <Field label="Description"><textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={f.publish} onChange={(e) => setF({ ...f, publish: e.target.checked })} />
          <span>Publier tout de suite (visible par les élèves validés de cette classe)</span></label>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy}>Créer le cours</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function ProgramsPanel({ st, programs, students, myClasses, onChange }:
  { st: SchoolStaff; programs: SchoolProgram[]; students: SchoolStudent[]; myClasses: { id: number; code: string; name: string }[]; onChange: () => Promise<void> }) {
  const director = st.scope === 'school';
  const [f, setF] = useState({ name: '', classes: [] as number[] });
  const { busy, run } = useAction();
  const toggle = (id: number) => setF((s) => ({ ...s, classes: s.classes.includes(id) ? s.classes.filter((x) => x !== id) : [...s.classes, id] }));
  const code = (id: number) => myClasses.find((c) => c.id === id)?.code ?? '';

  const add = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!f.classes.length) throw new Error('Choisissez au moins un niveau (L1, L2…).');
      must(await supabase.from('school_programs').insert({ school_id: st.school_id, name: f.name.trim(), class_ids: f.classes }));
      setF({ name: '', classes: [] });
      await onChange();
    }, 'Filière créée : les étudiants peuvent la choisir à l’inscription.');
  };

  return (
    <div className="split">
      <Card title="Filières de l’établissement">
        {programs.length ? (
          <ul className="list">
            {programs.map((pr) => (
              <li key={pr.id} className="list-row">
                <span><strong>{pr.name}</strong>
                  <span className="small muted"> · {pr.class_ids.map(code).join(', ') || 'tous niveaux'}
                    {' · '}{students.filter((s) => s.program_id === pr.id && s.school_status === 'approved').length} étudiant(s)</span></span>
                {director && (
                  <ConfirmButton variant="ghost" message={`Supprimer la filière « ${pr.name} » ? Les étudiants restent dans l’établissement, sans filière.`}
                    onConfirm={() => void run(async () => {
                      must(await supabase.from('school_programs').delete().eq('id', pr.id)); await onChange();
                    }, 'Filière supprimée.')}>Supprimer</ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        ) : <Empty icon="🧭" title="Aucune filière pour l’instant">Ex. : Licence Informatique, Master Droit des affaires.</Empty>}
      </Card>
      {director ? (
        <Card title="Créer une filière">
          <form className="form" onSubmit={add}>
            <Field label="Nom de la filière" required>
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} placeholder="Ex. : Licence Informatique" />
            </Field>
            <fieldset className="fieldset">
              <legend>Niveaux ouverts</legend>
              <div className="chips">
                {myClasses.map((c) => (
                  <label key={c.id} className={`chip ${f.classes.includes(c.id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={f.classes.includes(c.id)} onChange={() => toggle(c.id)} />{c.code}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" loading={busy}>Créer la filière</Button>
            <p className="small muted">Les cours, TD et TP sont créés par les professeurs, pas par la direction.</p>
          </form>
        </Card>
      ) : <Card><p className="muted">Seule la direction de l’établissement crée et supprime les filières.</p></Card>}
    </div>
  );
}

// ---------------------------------------------------------------------------
function NewsPanel({ st, myClasses, uid }: { st: SchoolStaff; myClasses: { id: number; code: string; name: string }[]; uid: string }) {
  const director = st.scope === 'school';
  const [f, setF] = useState({ title: '', body: '', audience: director ? 'all' : 'class', class_id: String(myClasses[0]?.id ?? ''), pinned: false });
  const { busy, run } = useAction();
  const { data, error, loading, reload } = useLoad(async () =>
    must(await supabase.from('announcements').select('*').eq('school_id', st.school_id)
      .order('published_at', { ascending: false })) as Announcement[], [st.school_id]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const publish = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      must(await supabase.from('announcements').insert({
        title: f.title, body: f.body, audience: f.audience, class_id: f.audience === 'class' ? Number(f.class_id) : null,
        pinned: f.pinned, author_id: uid, school_id: st.school_id,
      }));
      setF({ ...f, title: '', body: '' });
      await reload();
    }, 'Annonce publiée : les membres de l’établissement sont notifiés.');
  };

  return (
    <div className="split">
      <Card title="Nouvelle annonce de l’établissement">
        <form className="form" onSubmit={publish}>
          <Field label="Titre" required><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
          <Field label="Message" required><textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required /></Field>
          <div className="grid-2">
            <Field label="Destinataires">
              <select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
                {director && <option value="all">Tout l’établissement</option>}
                {director && <option value="students">Élèves de l’établissement</option>}
                <option value="class">Une classe</option>
              </select>
            </Field>
            {f.audience === 'class' && (
              <Field label="Classe">
                <select value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })} required>
                  {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
          </div>
          <label className="check"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /><span>📌 Épingler</span></label>
          <Button type="submit" loading={busy}>Publier</Button>
        </form>
      </Card>
      <section className="stack">
        {data.length === 0 && <Card><Empty icon="📢" title="Aucune annonce de l’établissement" /></Card>}
        {data.map((a) => (
          <Card key={a.id} title={<>{a.pinned && '📌 '}{a.title}</>} actions={
            <ConfirmButton variant="ghost" message="Supprimer cette annonce ?" onConfirm={() => void run(async () => {
              must(await supabase.from('announcements').delete().eq('id', a.id)); await reload();
            }, 'Annonce supprimée.')}>🗑️</ConfirmButton>
          }>
            <RichText text={a.body} />
            <p className="small muted">{formatDate(a.published_at)}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
function TeamPanel({ st }: { st: SchoolStaff }) {
  const { profile } = useAuth();
  const { data: ref } = useRefData();
  const [f, setF] = useState({ email: '', title: 'responsable_filiere', classes: [] as number[] });
  const { busy, run } = useAction();
  const { data, error, loading, reload } = useLoad(async () =>
    must(await supabase.from('school_staff').select('school_id, user_id, title, scope, class_ids, profile:profiles(first_name,last_name)')
      .eq('school_id', st.school_id)) as unknown as SchoolStaff[], [st.school_id]);

  if (loading || !ref) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!f.classes.length) return void run(async () => { throw new Error('Choisissez au moins une classe.'); });
    void run(async () => {
      must(await supabase.rpc('school_add_staff', { p_school: st.school_id, p_email: f.email, p_title: f.title, p_scope: 'classes', p_class_ids: f.classes }));
      setF({ email: '', title: 'responsable_filiere', classes: [] });
      await reload();
      await loadMySchools(profile!.id, true);
    }, 'Responsable de filière nommé.');
  };
  const toggle = (id: number) => setF((s) => ({ ...s, classes: s.classes.includes(id) ? s.classes.filter((x) => x !== id) : [...s.classes, id] }));

  return (
    <>
    <div className="split">
      <Card title="Équipe de direction">
        <ul className="list">
          {data.map((m) => (
            <li key={m.user_id} className="list-row">
              <span><strong>{fullName(m.profile)}</strong> · {STAFF_TITLES[m.title] ?? m.title}
                {m.scope === 'classes' && <span className="small muted"> · {m.class_ids.map((id) => ref.classes.find((c) => c.id === id)?.code).join(', ')}</span>}</span>
              {m.scope === 'classes' && (
                <ConfirmButton variant="ghost" message="Retirer ce responsable ?" onConfirm={() => void run(async () => {
                  must(await supabase.rpc('school_remove_staff', { p_school: st.school_id, p_user: m.user_id })); await reload();
                }, 'Responsable retiré.')}>Retirer</ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Nommer un responsable de filière">
        <form className="form" onSubmit={add}>
          <Field label="E-mail de son compte Khoulé" required><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
          <Field label="Fonction">
            <select value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}>
              {['responsable_filiere', 'chef_departement', 'autre'].map((k) => <option key={k} value={k}>{STAFF_TITLES[k]}</option>)}
            </select>
          </Field>
          <fieldset className="fieldset">
            <legend>Classes confiées</legend>
            <div className="chips">
              {ref.classes.filter((c) => { const cy = KIND_CYCLES[st.school?.kind ?? 'autre']; return !cy || cy.includes(c.cycle); }).map((c) => (
                <label key={c.id} className={`chip ${f.classes.includes(c.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={f.classes.includes(c.id)} onChange={() => toggle(c.id)} />{c.code}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" loading={busy}>Nommer</Button>
          <p className="small muted">Il ou elle verra uniquement les élèves, cours, notes et annonces de ces classes.</p>
        </form>
      </Card>
    </div>
    {isHigher(st.school?.kind) && <TeachersPanel st={st} />}
    </>
  );
}

/** Professeurs de l'université : ils créent eux-mêmes leurs cours, TD et TP pour l'établissement et ses filières. */
function TeachersPanel({ st }: { st: SchoolStaff }) {
  const [email, setEmail] = useState('');
  const { busy, run } = useAction();
  const { data, error, loading, reload } = useLoad(async () =>
    must(await supabase.from('school_teachers').select('user_id, profile:profiles(first_name,last_name)')
      .eq('school_id', st.school_id)) as unknown as { user_id: string; profile: PersonName }[], [st.school_id]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const add = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      must(await supabase.rpc('school_add_teacher', { p_school: st.school_id, p_email: email }));
      setEmail('');
      await reload();
    }, 'Professeur ajouté : il peut créer ses cours pour l’établissement.');
  };

  return (
    <div className="split" style={{ marginTop: '1rem' }}>
      <Card title="Professeurs de l’établissement">
        {data.length ? (
          <ul className="list">
            {data.map((t) => (
              <li key={t.user_id} className="list-row">
                <strong>{fullName(t.profile)}</strong>
                <ConfirmButton variant="ghost" message="Retirer ce professeur ? Ses cours déjà créés restent en place." onConfirm={() => void run(async () => {
                  must(await supabase.rpc('school_remove_teacher', { p_school: st.school_id, p_user: t.user_id })); await reload();
                }, 'Professeur retiré.')}>Retirer</ConfirmButton>
              </li>
            ))}
          </ul>
        ) : <Empty icon="🧑‍🏫" title="Aucun professeur inscrit" />}
      </Card>
      <Card title="Ajouter un professeur">
        <form className="form" onSubmit={add}>
          <Field label="E-mail de son compte Khoulé" required hint="Le professeur doit avoir un compte intervenant validé">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button type="submit" loading={busy}>Ajouter</Button>
          <p className="small muted">Il crée ensuite ses cours, TD et TP pour votre établissement et choisit la filière.</p>
        </form>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
function exportCsv(st: SchoolStaff, students: SchoolStudent[], grades: GradeRow[], cls: (id: number | null) => { code: string } | undefined) {
  const cell = (v: unknown) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = [['Nom', 'Prénom', 'Classe', 'Cours', 'Devoir', 'Note', 'Sur']];
  for (const s of students) {
    const g = grades.filter((x) => x.student_id === s.profile_id);
    if (!g.length) rows.push([s.profile.last_name, s.profile.first_name, cls(s.class_id)?.code ?? '', '', '', '', '']);
    for (const x of g) rows.push([s.profile.last_name, s.profile.first_name, cls(s.class_id)?.code ?? '', x.course?.title ?? '',
      x.assignment?.exercise?.title ?? '', String(x.score).replace('.', ','), String(x.max_score)]);
  }
  const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `notes-${(st.school?.name ?? 'ecole').replace(/[^\p{L}\p{N}]+/gu, '-')}.csv`;
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
