import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { must, supabase } from '../lib/supabase';
import { useLoad, useRefData } from '../lib/hooks';
import { Button, Field, Modal, Spinner, useAction } from './ui';

/** Salle Jitsi unique et lisible pour un cours. */
export function jitsiRoom(title: string): string {
  const slug = title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '');
  return `https://meet.jit.si/KhouleEducation-${slug.slice(0, 40)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface OwnCourse { id: string; title: string; class_id: number; subject_id: number; status: string }
interface Pair { class_id: number; subject_id: number }

/**
 * Démarre un cours en visio immédiatement : choisit (ou crée) le cours, programme une séance
 * qui commence maintenant, notifie les élèves et ouvre la salle de visioconférence.
 */
export function LiveNowButton({ courseId, label = '🔴 Démarrer un cours en direct' }: { courseId?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="btn-live" onClick={() => setOpen(true)}>{label}</Button>
      {open && <LiveNowModal courseId={courseId} onClose={() => setOpen(false)} />}
    </>
  );
}

function LiveNowModal({ courseId, onClose }: { courseId?: string; onClose: () => void }) {
  const { profile } = useAuth();
  const uid = profile!.id;
  const isAdmin = profile!.role === 'admin';
  const { data: ref } = useRefData();
  const { data, loading } = useLoad(async () => {
    const [courses, pairs] = await Promise.all([
      (isAdmin && courseId
        ? supabase.from('courses').select('id, title, class_id, subject_id, status').eq('id', courseId)
        : supabase.from('courses').select('id, title, class_id, subject_id, status').eq('instructor_id', uid).neq('status', 'archived')
          .order('created_at', { ascending: false })).then(must),
      supabase.from('teaching_assignments').select('class_id, subject_id').eq('instructor_id', uid).then(must),
    ]);
    return { courses: courses as OwnCourse[], pairs: pairs as Pair[] };
  }, [uid]);

  const [choice, setChoice] = useState(courseId ?? '');
  const [newCourse, setNewCourse] = useState({ title: '', pair: '' });
  const [f, setF] = useState({ title: '', duration: '60', provider: 'jitsi', link: '', room: '' });
  const { busy, run } = useAction();

  if (loading || !data || !ref) return <Modal open onClose={onClose} title="Démarrer un cours en direct"><Spinner /></Modal>;

  const pairs: Pair[] = isAdmin ? ref.classSubjects : data.pairs;
  const selected = choice || (data.courses[0]?.id ?? 'new');
  const creating = selected === 'new';
  const pairLabel = (p: Pair) => `${ref.classes.find((c) => c.id === p.class_id)?.code} · ${ref.subjects.find((s) => s.id === p.subject_id)?.name}`;

  const start = (e: FormEvent) => {
    e.preventDefault();
    // Ouverture de l'onglet tout de suite (sinon bloquée par le navigateur), redirigé ensuite vers la salle
    const win = window.open('', '_blank');
    void run(async () => {
      let id = selected;
      let title = data.courses.find((c) => c.id === id)?.title ?? '';
      if (creating) {
        const pair = newCourse.pair || (pairs[0] ? `${pairs[0].class_id}:${pairs[0].subject_id}` : '');
        if (!pair) throw new Error('Aucune classe ne vous est affectée : contactez l’administration.');
        if (newCourse.title.trim().length < 3) throw new Error('Donnez un titre au cours.');
        const [class_id, subject_id] = pair.split(':').map(Number);
        const c = must(await supabase.from('courses').insert({
          title: newCourse.title.trim(), class_id, subject_id, instructor_id: uid, status: 'published',
        }).select('id, title').single()) as { id: string; title: string };
        id = c.id; title = c.title;
      } else {
        // un cours encore en brouillon est publié pour que les élèves puissent rejoindre
        const c = data.courses.find((x) => x.id === id);
        if (c && c.status === 'draft') must(await supabase.from('courses').update({ status: 'published' }).eq('id', id));
      }
      const live_url = f.provider === 'jitsi' ? jitsiRoom(title) : f.link.trim();
      if (!/^https:\/\//i.test(live_url)) throw new Error('Collez un lien de visio valide (commençant par https://).');
      const now = new Date();
      must(await supabase.from('course_sessions').insert({
        course_id: id, title: f.title.trim() || `${title} — en direct`, room: f.room || null, live_url,
        starts_at: now.toISOString(), ends_at: new Date(now.getTime() + Number(f.duration) * 60000).toISOString(),
      }));
      if (win) win.location.href = live_url; else window.location.href = live_url;
      onClose();
    }, 'Cours en direct lancé : les élèves sont notifiés et voient le bouton « Rejoindre ».').then((ok) => { if (!ok) win?.close(); });
  };

  return (
    <Modal open onClose={onClose} title="🔴 Démarrer un cours en direct" wide>
      <form className="form" onSubmit={start}>
        {!courseId && (
          <Field label="Cours">
            <select value={selected} onChange={(e) => setChoice(e.target.value)}>
              {data.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              {pairs.length > 0 && <option value="new">+ Nouveau cours…</option>}
            </select>
          </Field>
        )}
        {creating && (
          pairs.length === 0 ? (
            <div className="alert alert-info">Aucune classe ne vous est encore affectée : l’administration doit d’abord vous affecter une classe et une matière.</div>
          ) : (
            <div className="grid-2">
              <Field label="Classe et matière">
                <select value={newCourse.pair} onChange={(e) => setNewCourse({ ...newCourse, pair: e.target.value })}>
                  {pairs.map((p) => <option key={`${p.class_id}:${p.subject_id}`} value={`${p.class_id}:${p.subject_id}`}>{pairLabel(p)}</option>)}
                </select>
              </Field>
              <Field label="Titre du cours" required>
                <input value={newCourse.title} onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
                  placeholder="Ex. : Révisions Bac — Suites numériques" />
              </Field>
            </div>
          )
        )}
        <div className="grid-2">
          <Field label="Sujet de la séance" hint="Facultatif">
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex. : Correction de l’annale 2024" />
          </Field>
          <Field label="Durée">
            <select value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })}>
              <option value="30">30 minutes</option><option value="60">1 heure</option>
              <option value="90">1 h 30</option><option value="120">2 heures</option><option value="180">3 heures</option>
            </select>
          </Field>
        </div>
        <Field label="Outil de visioconférence">
          <div className="segmented">
            <button type="button" className={f.provider === 'jitsi' ? 'on' : ''} onClick={() => setF({ ...f, provider: 'jitsi' })}>
              🎥 Jitsi (automatique, gratuit)</button>
            <button type="button" className={f.provider === 'own' ? 'on' : ''} onClick={() => setF({ ...f, provider: 'own' })}>
              🔗 Mon lien (Meet, Zoom…)</button>
          </div>
        </Field>
        {f.provider === 'own' && (
          <Field label="Lien de la réunion" required>
            <input type="url" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://meet.google.com/…" />
          </Field>
        )}
        {f.provider === 'jitsi' && (
          <p className="small muted">Une salle est créée automatiquement. Sur Jitsi, la première personne qui entre (vous) doit se connecter
            avec Google, GitHub ou Facebook pour ouvrir la salle ; les élèves entrent ensuite sans compte.</p>
        )}
        <Field label="Salle physique" hint="Facultatif, si le cours a aussi lieu en présentiel">
          <input value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} />
        </Field>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={busy} className="btn-live" disabled={creating && pairs.length === 0}>Démarrer maintenant</Button>
        </div>
      </form>
    </Modal>
  );
}
