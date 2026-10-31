import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { must, supabase } from '../lib/supabase';
import { useLoad } from '../lib/hooks';
import { fullName, timeAgo } from '../lib/format';
import type { Answer, Question } from '../lib/types';
import { Avatar, Badge, Button, Card, Empty, ErrorBox, Field, RichText, Spinner, useAction } from '../components/ui';

export function QuestionDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const uid = profile!.id;
  const [text, setText] = useState('');
  const { busy, run } = useAction();

  const { data, error, loading, reload } = useLoad(async () => {
    const q = must(await supabase.from('questions')
      .select('*, author:profiles(first_name,last_name,role), course:courses(id,title,instructor_id)')
      .eq('id', id!).maybeSingle()) as unknown as (Question & { course: { id: string; title: string; instructor_id: string } }) | null;
    const answers = must(await supabase.from('answers').select('*, author:profiles(first_name,last_name,role)')
      .eq('question_id', id!).order('created_at')) as unknown as Answer[];
    return { q, answers };
  }, [id]);

  // Réponses en temps réel
  useEffect(() => {
    const ch = supabase.channel(`answers-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers', filter: `question_id=eq.${id}` }, () => void reload())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [id, reload]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data?.q) return <Card><Empty icon="🔒" title="Question introuvable" /></Card>;
  const { q, answers } = data;
  const moderator = profile!.role === 'admin' || q.course.instructor_id === uid;
  const isAuthor = q.author_id === uid;

  const reply = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      must(await supabase.from('answers').insert({ question_id: q.id, author_id: uid, body: text.trim() }));
      setText(''); await reload();
    }, 'Réponse publiée.');
  };
  const update = (table: 'questions' | 'answers', rowId: string, patch: Record<string, unknown>, msg?: string) =>
    run(async () => { must(await supabase.from(table).update(patch).eq('id', rowId)); await reload(); }, msg);

  return (
    <div className="narrow-page">
      <p><Link to={`/cours/${q.course.id}`}>← {q.course.title}</Link></p>
      <Card>
        <div className="qa-head">
          <Avatar person={q.author} />
          <div>
            <h1 className="qa-title">{q.title}</h1>
            <span className="small muted">{fullName(q.author)} · {timeAgo(q.created_at)}</span>
          </div>
          <Badge tone={q.status === 'answered' ? 'success' : q.status === 'open' ? 'warning' : 'neutral'}>
            {q.status === 'answered' ? 'Répondue' : q.status === 'open' ? 'En attente' : 'Fermée'}
          </Badge>
        </div>
        <RichText text={q.body} />
        {(moderator || isAuthor) && (
          <div className="row">
            {q.status !== 'closed'
              ? <Button variant="ghost" onClick={() => void update('questions', q.id, { status: 'closed' }, 'Question fermée.')}>Fermer</Button>
              : <Button variant="ghost" onClick={() => void update('questions', q.id, { status: 'open' })}>Rouvrir</Button>}
            {moderator && <Button variant="ghost" onClick={() => void update('questions', q.id, { is_hidden: !q.is_hidden })}>
              {q.is_hidden ? 'Rétablir' : 'Masquer (modération)'}</Button>}
          </div>
        )}
      </Card>

      <h2 className="section-title">{answers.length} réponse{answers.length > 1 ? 's' : ''}</h2>
      {answers.map((a) => (
        <Card key={a.id} className={`answer ${a.is_accepted ? 'accepted' : ''} ${a.is_hidden ? 'hidden-msg' : ''}`}>
          <div className="qa-head">
            <Avatar person={a.author} size={32} />
            <div>
              <strong>{fullName(a.author)}</strong> {a.author?.role === 'instructor' && <Badge tone="info">Intervenant</Badge>}
              <br /><span className="small muted">{timeAgo(a.created_at)}</span>
            </div>
            {a.is_accepted && <Badge tone="success">✓ Réponse utile</Badge>}
          </div>
          <RichText text={a.body} />
          <div className="row small-row">
            {isAuthor && !a.is_accepted && <button className="link" onClick={() => void update('answers', a.id, { is_accepted: true }, 'Merci pour votre retour !')}>✓ Cette réponse m’a aidé</button>}
            {moderator && <button className="link" onClick={() => void update('answers', a.id, { is_hidden: !a.is_hidden })}>{a.is_hidden ? 'Rétablir' : 'Masquer'}</button>}
            {(a.author_id === uid || moderator) && <button className="link" onClick={() => window.confirm('Supprimer cette réponse ?') &&
              void run(async () => { must(await supabase.from('answers').delete().eq('id', a.id)); await reload(); })}>Supprimer</button>}
          </div>
        </Card>
      ))}

      {q.status !== 'closed' && (
        <Card title="Répondre">
          <form className="form" onSubmit={reply}>
            <Field label="Votre réponse"><textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} required /></Field>
            <Button type="submit" loading={busy}>Publier</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
