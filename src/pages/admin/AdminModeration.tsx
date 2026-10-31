import { useState } from 'react';
import { Link } from 'react-router-dom';
import { must, supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/hooks';
import { fullName, timeAgo } from '../../lib/format';
import type { PersonName } from '../../lib/types';
import { Badge, Button, Card, ConfirmButton, Empty, ErrorBox, PageHeader, Spinner, Tabs, useAction } from '../../components/ui';

type Kind = 'questions' | 'answers' | 'messages';
interface Item {
  id: string; body: string; title?: string; is_hidden: boolean; created_at: string;
  author?: PersonName; sender?: PersonName; question_id?: string; course?: { id: string; title: string } | null;
}

const SELECT: Record<Kind, string> = {
  questions: 'id, title, body, is_hidden, created_at, author:profiles(first_name,last_name), course:courses(id,title)',
  answers: 'id, body, is_hidden, created_at, question_id, author:profiles(first_name,last_name)',
  messages: 'id, body, is_hidden, created_at, sender:profiles!messages_sender_id_fkey(first_name,last_name), course:courses(id,title)',
};

export function AdminModeration() {
  const [kind, setKind] = useState<Kind>('questions');
  const [onlyHidden, setOnlyHidden] = useState(false);
  const { run } = useAction();

  const { data, error, loading, reload } = useLoad(async () => {
    let q = supabase.from(kind).select(SELECT[kind]).order('created_at', { ascending: false }).limit(100);
    if (kind === 'messages') q = q.not('course_id', 'is', null); // les messages privés ne sont pas modérés ici
    if (onlyHidden) q = q.eq('is_hidden', true);
    return must(await q) as unknown as Item[];
  }, [kind, onlyHidden]);

  const toggle = (i: Item) => run(async () => {
    must(await supabase.from(kind).update({ is_hidden: !i.is_hidden }).eq('id', i.id)); await reload();
  }, i.is_hidden ? 'Contenu rétabli.' : 'Contenu masqué.');
  const remove = (i: Item) => run(async () => {
    must(await supabase.from(kind).delete().eq('id', i.id)); await reload();
  }, 'Contenu supprimé.');

  return (
    <>
      <PageHeader title="Modération" subtitle="Masquez ou supprimez les contenus inappropriés (questions, réponses, discussions de cours)."
        actions={<label className="check"><input type="checkbox" checked={onlyHidden} onChange={(e) => setOnlyHidden(e.target.checked)} /><span>Uniquement les contenus masqués</span></label>} />
      <Tabs value={kind} onChange={setKind} tabs={[
        { id: 'questions', label: 'Questions' }, { id: 'answers', label: 'Réponses' }, { id: 'messages', label: 'Discussions de cours' },
      ]} />
      {loading ? <Spinner /> : error || !data ? <ErrorBox error={error ?? ''} onRetry={reload} /> : data.length === 0 ? (
        <Card><Empty icon="🛡️" title="Rien à modérer" /></Card>
      ) : (
        <Card>
          <ul className="list">
            {data.map((i) => (
              <li key={i.id} className="list-row moderation">
                <div>
                  {i.title && <strong>{i.title}<br /></strong>}
                  <span className="clamp-2">{i.body}</span>
                  <span className="small muted">
                    {fullName(i.author ?? i.sender)} · {timeAgo(i.created_at)}
                    {i.course && <> · <Link to={`/cours/${i.course.id}`}>{i.course.title}</Link></>}
                    {i.question_id && <> · <Link to={`/questions/${i.question_id}`}>voir la question</Link></>}
                    {kind === 'questions' && <> · <Link to={`/questions/${i.id}`}>ouvrir</Link></>}
                  </span>
                </div>
                <div className="row">
                  {i.is_hidden && <Badge tone="danger">Masqué</Badge>}
                  <Button variant="secondary" onClick={() => void toggle(i)}>{i.is_hidden ? 'Rétablir' : 'Masquer'}</Button>
                  <ConfirmButton variant="ghost" message="Supprimer définitivement ?" onConfirm={() => void remove(i)}>🗑️</ConfirmButton>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
