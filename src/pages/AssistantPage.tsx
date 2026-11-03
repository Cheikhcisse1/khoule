import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { must, supabase } from '../lib/supabase';
import { useLoad } from '../lib/hooks';
import { askAi, type AiMode } from '../lib/ai';
import { Button, Card, ConfirmButton, Empty, ErrorBox, PageHeader, Spinner, useAction } from '../components/ui';

interface Line { id: string | number; role: 'user' | 'assistant'; content: string }

const SUGGESTIONS: Record<AiMode, string[]> = {
  tutor: [
    'Je ne comprends pas la consigne, peux-tu me l’expliquer ?',
    'Peux-tu me donner un indice pour commencer ?',
    'Voici ce que j’ai trouvé, est-ce que ma démarche est bonne ?',
    'Peux-tu me réexpliquer cette leçon avec un exemple ?',
  ],
  instructor: [
    'Propose-moi une séance de 1 h sur ce chapitre, avec une activité de départ.',
    'Crée 5 exercices progressifs avec leur corrigé et un barème sur 20.',
    'Explique cette notion autrement pour un élève en difficulté.',
    'Rédige une réponse claire à cette question d’élève :',
  ],
};

/** « Coup de pouce » (élève) ou assistant pédagogique (intervenant), avec ou sans contexte de cours / devoir. */
export function AssistantPage() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const mode: AiMode = profile!.role === 'student' ? 'tutor' : 'instructor';
  const [params] = useSearchParams();
  const courseId = params.get('cours') ?? undefined;
  const assignmentId = params.get('devoir') ?? undefined;
  const thread = assignmentId ? `assignment:${assignmentId}` : courseId ? `course:${courseId}` : 'general';

  const { data, error, loading, reload } = useLoad(async () => {
    let title = '';
    let instructorId: string | null = null;
    let courseLink: string | null = null;
    if (assignmentId) {
      const a = must(await supabase.from('assignments')
        .select('exercise:exercises(title), course:courses(id,title,instructor_id)').eq('id', assignmentId).maybeSingle()) as unknown as
        { exercise: { title: string } | null; course: { id: string; title: string; instructor_id: string } | null } | null;
      title = a ? `Devoir « ${a.exercise?.title ?? ''} » · ${a.course?.title ?? ''}` : '';
      instructorId = a?.course?.instructor_id ?? null;
      courseLink = a?.course ? `/cours/${a.course.id}` : null;
    } else if (courseId) {
      const c = must(await supabase.from('courses').select('id,title,instructor_id').eq('id', courseId).maybeSingle()) as
        { id: string; title: string; instructor_id: string } | null;
      title = c ? `Cours « ${c.title} »` : '';
      instructorId = c?.instructor_id ?? null;
      courseLink = c ? `/cours/${c.id}` : null;
    }
    const hist = must(await supabase.from('ai_messages').select('id,role,content')
      .eq('user_id', uid).eq('mode', mode).eq('thread', thread).order('created_at').limit(60)) as Line[];
    return { title, instructorId, courseLink, hist };
  }, [uid, mode, thread]);

  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const { busy, run } = useAction();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { if (data) setLines(data.hist); }, [data]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines, busy]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? 'Erreur'} onRetry={reload} />;

  const send = (e?: FormEvent, preset?: string) => {
    e?.preventDefault();
    const q = (preset ?? text).trim();
    if (!q || busy) return;
    setText('');
    setLines((l) => [...l, { id: `u${Date.now()}`, role: 'user', content: q }]);
    void run(async () => {
      try {
        const r = await askAi(mode, q, { courseId, assignmentId });
        setLines((l) => [...l, { id: `a${Date.now()}`, role: 'assistant', content: r.answer }]);
        setRemaining(r.remaining);
      } catch (err) {
        setLines((l) => l.slice(0, -1));
        setText(q);
        throw err;
      }
    });
  };

  const clear = async () => {
    must(await supabase.from('ai_messages').delete().eq('user_id', uid).eq('mode', mode).eq('thread', thread));
    setLines([]);
  };

  const tutor = mode === 'tutor';
  return (
    <>
      <PageHeader
        title={tutor ? '🤖 Coup de pouce' : '🤖 Assistant pédagogique'}
        subtitle={data.title || (tutor
          ? 'Bloqué sur un exercice ou une leçon ? L’assistant t’aide à avancer, étape par étape, sans faire le travail à ta place.'
          : 'Préparer une séance, créer des exercices corrigés, expliquer une notion autrement.')}
        actions={<div className="row">
          {data.courseLink && <Link className="btn btn-ghost" to={data.courseLink}>← Retour au cours</Link>}
          {tutor && data.instructorId && <Link className="btn btn-secondary" to={`/messages?avec=${data.instructorId}`}>Demander à mon intervenant</Link>}
        </div>}
      />

      <section className="chat">
        <div className="chat-scroll">
          {lines.length === 0 && (
            <Empty icon="💡" title={tutor ? 'Pose ta question' : 'Que voulez-vous préparer ?'}>
              <div className="ai-suggest">
                {SUGGESTIONS[mode].map((s) => <button key={s} type="button" className="chip" onClick={() => tutor || !s.endsWith(':') ? send(undefined, s) : setText(s + ' ')}>{s}</button>)}
              </div>
            </Empty>
          )}
          {lines.map((m) => (
            <div key={m.id} className={`bubble-row ${m.role === 'user' ? 'mine' : ''}`}>
              <div className={`bubble ${m.role === 'assistant' ? 'ai' : ''}`}><p>{m.content}</p></div>
            </div>
          ))}
          {busy && <div className="bubble-row"><div className="bubble ai"><p className="muted">L’assistant réfléchit…</p></div></div>}
          <div ref={bottom} />
        </div>
        <form className="chat-input" onSubmit={send}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} aria-label="Votre question"
            placeholder={tutor ? 'Écris ta question ou ce que tu as déjà essayé…' : 'Votre demande…'}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }} />
          <Button type="submit" loading={busy} disabled={!text.trim()}>Envoyer</Button>
        </form>
      </section>

      <Card>
        <p className="small muted" style={{ margin: 0 }}>
          {tutor
            ? 'L’assistant est une intelligence artificielle : il peut se tromper. Il t’aide à comprendre mais ne fait pas tes devoirs. Ne lui donne jamais ton nom, ton numéro ou ton adresse. Tes échanges sont visibles par toi et par l’administration de Khoulé Éducation.'
            : 'Réponses générées par IA (Groq, gratuit) : vérifiez-les avant de les utiliser avec vos élèves.'}
          {remaining !== null && ` Questions restantes aujourd’hui : ${remaining}.`}
        </p>
        {lines.length > 0 && <div className="row" style={{ marginTop: '.6rem' }}>
          <ConfirmButton variant="ghost" message="Effacer cette conversation ?" onConfirm={() => void run(clear, 'Conversation effacée')}>Effacer la conversation</ConfirmButton>
        </div>}
      </Card>
    </>
  );
}
