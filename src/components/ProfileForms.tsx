import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { must, supabase } from '../lib/supabase';
import { useLoad, useRefData } from '../lib/hooks';
import { CYCLES, CYCLE_ORDER, INSTRUCTOR_TYPES } from '../lib/format';
import type { Instructor, School, Student } from '../lib/types';
import { SCHOOL_STATUS } from '../lib/schools';
import { Button, Field, Spinner, useAction } from './ui';

/** Nom / prénom (tous profils). */
export function IdentityForm() {
  const { profile, refresh } = useAuth();
  const [first, setFirst] = useState(profile?.first_name ?? '');
  const [last, setLast] = useState(profile?.last_name ?? '');
  const { busy, run } = useAction();
  if (!profile) return null;

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      must(await supabase.from('profiles').update({ first_name: first.trim(), last_name: last.trim() }).eq('id', profile.id));
      await refresh();
    }, 'Profil mis à jour.');
  };

  return (
    <form className="form" onSubmit={save}>
      <div className="grid-2">
        <Field label="Prénom" required><input value={first} onChange={(e) => setFirst(e.target.value)} required /></Field>
        <Field label="Nom" required><input value={last} onChange={(e) => setLast(e.target.value)} required /></Field>
      </div>
      <Button type="submit" loading={busy}>Enregistrer</Button>
    </form>
  );
}

/** Profil pédagogique d'un intervenant + souhaits (classes, matières). */
export function InstructorProfileForm({ onSaved }: { onSaved?: () => void }) {
  const { profile, refresh } = useAuth();
  const { data: ref } = useRefData();
  const { busy, run } = useAction();
  const uid = profile?.id;

  const { data, loading } = useLoad(async () => {
    const [inst, contact, subjects, classes] = await Promise.all([
      supabase.from('instructors').select('*').eq('profile_id', uid!).single().then(must),
      supabase.from('instructor_contacts').select('*').eq('profile_id', uid!).maybeSingle().then(must),
      supabase.from('instructor_subjects').select('subject_id').eq('instructor_id', uid!).then(must),
      supabase.from('instructor_classes').select('class_id').eq('instructor_id', uid!).then(must),
    ]);
    return {
      inst: inst as Instructor,
      phone: (contact as { phone: string | null } | null)?.phone ?? '',
      subjects: (subjects as { subject_id: number }[]).map((s) => s.subject_id),
      classes: (classes as { class_id: number }[]).map((c) => c.class_id),
    };
  }, [uid]);

  const [form, setForm] = useState<Partial<Instructor>>({});
  const [phone, setPhone] = useState('');
  const [subjects, setSubjects] = useState<number[]>([]);
  const [classes, setClasses] = useState<number[]>([]);

  useEffect(() => {
    if (!data) return;
    setForm(data.inst);
    setPhone(data.phone);
    setSubjects(data.subjects);
    setClasses(data.classes);
  }, [data]);

  if (loading || !ref || !uid) return <Spinner />;

  const toggle = (list: number[], set: (v: number[]) => void, id: number) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      must(await supabase.from('instructors').update({
        instructor_type: form.instructor_type, education_level: form.education_level, specialty: form.specialty,
        experience: form.experience, bio: form.bio,
      }).eq('profile_id', uid));
      must(await supabase.from('instructor_contacts').upsert({ profile_id: uid, phone: phone || null }));
      // remplace les souhaits
      must(await supabase.from('instructor_subjects').delete().eq('instructor_id', uid));
      if (subjects.length) must(await supabase.from('instructor_subjects').insert(subjects.map((s) => ({ instructor_id: uid, subject_id: s }))));
      must(await supabase.from('instructor_classes').delete().eq('instructor_id', uid));
      if (classes.length) must(await supabase.from('instructor_classes').insert(classes.map((c) => ({ instructor_id: uid, class_id: c }))));
      await refresh();
      onSaved?.();
    }, 'Profil enregistré.');
  };

  const setF = (k: keyof Instructor) => (e: { target: { value: string } }) => setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <form className="form" onSubmit={save}>
      <div className="grid-2">
        <Field label="Vous êtes">
          <select value={form.instructor_type ?? 'enseignant'} onChange={setF('instructor_type')}>
            {Object.entries(INSTRUCTOR_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Niveau d’études"><input value={form.education_level ?? ''} onChange={setF('education_level')} /></Field>
        <Field label="Spécialité"><input value={form.specialty ?? ''} onChange={setF('specialty')} /></Field>
        <Field label="Téléphone" hint="Visible uniquement par l’administration"><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
      <Field label="Expérience"><textarea rows={3} value={form.experience ?? ''} onChange={setF('experience')} /></Field>
      <Field label="Présentation (visible par les élèves)"><textarea rows={3} value={form.bio ?? ''} onChange={setF('bio')} /></Field>

      <fieldset className="fieldset">
        <legend>Matières que je peux enseigner</legend>
        <div className="chips">
          {ref.subjects.map((s) => (
            <label key={s.id} className={`chip ${subjects.includes(s.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={subjects.includes(s.id)} onChange={() => toggle(subjects, setSubjects, s.id)} />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="fieldset">
        <legend>Classes que je souhaite accompagner</legend>
        {CYCLE_ORDER.map((cy) => (
          <div key={cy} className="chips-group">
            <span className="muted small">{CYCLES[cy]}</span>
            <div className="chips">
              {ref.classes.filter((c) => c.cycle === cy).map((c) => (
                <label key={c.id} className={`chip ${classes.includes(c.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={classes.includes(c.id)} onChange={() => toggle(classes, setClasses, c.id)} />
                  {c.code}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
      <Button type="submit" loading={busy}>Enregistrer mon profil</Button>
    </form>
  );
}

/** Scolarité et parent/tuteur d'un élève. */
export function StudentProfileForm() {
  const { student, refresh } = useAuth();
  const { data: ref } = useRefData();
  const { data: schools } = useLoad(async () => must(await supabase.from('schools').select('id,name,city').order('name')) as Pick<School, 'id' | 'name' | 'city'>[], []);
  const [form, setForm] = useState<Partial<Student>>(student ?? {});
  const { busy, run } = useAction();

  useEffect(() => { setForm(student ?? {}); }, [student]);
  if (!student || !ref) return <Spinner />;

  const setF = (k: keyof Student) => (e: { target: { value: string } }) => setForm((s) => ({ ...s, [k]: e.target.value || null }));

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      must(await supabase.from('students').update({
        class_id: form.class_id ? Number(form.class_id) : null, school: form.school, phone: form.phone,
        school_id: form.school_id || null,
        guardian_name: form.guardian_name, guardian_relation: form.guardian_relation,
        guardian_phone: form.guardian_phone, guardian_email: form.guardian_email,
        guardian_consent: form.guardian_consent,
      }).eq('profile_id', student.profile_id));
      await refresh();
    }, 'Informations mises à jour.');
  };

  return (
    <form className="form" onSubmit={save}>
      <div className="grid-2">
        <Field label="Classe actuelle" hint="Changez-la à la rentrée pour voir les cours de votre nouvelle classe.">
          <select value={form.class_id ?? ''} onChange={setF('class_id')}>
            {ref.classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </select>
        </Field>
        <Field label="Établissement"><input value={form.school ?? ''} onChange={setF('school')} /></Field>
        <Field label="Établissement partenaire" hint={student.school_id ? `Statut : ${SCHOOL_STATUS[student.school_status ?? 'pending']}` : 'Si votre école a un espace sur Khoulé, son responsable validera votre demande.'}>
          <select value={form.school_id ?? ''} onChange={setF('school_id')}>
            <option value="">— Aucun —</option>
            {schools?.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` (${s.city})` : ''}</option>)}
          </select>
        </Field>
      </div>
      <fieldset className="fieldset">
        <legend>Parent ou tuteur légal</legend>
        <div className="grid-2">
          <Field label="Nom complet"><input value={form.guardian_name ?? ''} onChange={setF('guardian_name')} /></Field>
          <Field label="Lien"><input value={form.guardian_relation ?? ''} onChange={setF('guardian_relation')} /></Field>
          <Field label="Téléphone"><input type="tel" value={form.guardian_phone ?? ''} onChange={setF('guardian_phone')} /></Field>
          <Field label="E-mail"><input type="email" value={form.guardian_email ?? ''} onChange={setF('guardian_email')} /></Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={Boolean(form.guardian_consent)}
            onChange={(e) => setForm((s) => ({ ...s, guardian_consent: e.target.checked }))} />
          <span>Accord du parent / tuteur pour l’utilisation de la plateforme
            {student.consent_at && <small className="muted"> (donné le {new Date(student.consent_at).toLocaleDateString('fr-FR')})</small>}</span>
        </label>
      </fieldset>
      <Button type="submit" loading={busy}>Enregistrer</Button>
    </form>
  );
}
