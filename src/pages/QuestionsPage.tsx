import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { must, supabase } from '../lib/supabase';
import { useLoad } from '../lib/hooks';
import type { Question } from '../lib/types';
import { Card, Empty, ErrorBox, PageHeader, Spinner, Tabs } from '../components/ui';
import { QuestionList } from '../components/course/CommunityPanels';

type Filter = 'open' | 'mine' | 'all';

export function QuestionsPage() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const [filter, setFilter] = useState<Filter>(profile!.role === 'student' ? 'mine' : 'open');

  const { data, error, loading, reload } = useLoad(async () =>
    must(await supabase.from('questions')
      .select('*, author:profiles(first_name,last_name,role), course:courses(title,instructor_id)')
      .order('created_at', { ascending: false }).limit(200)) as unknown as Question[], [uid]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  // Pour un intervenant, "En attente" = questions de ses cours sans réponse
  const relevant = profile!.role === 'instructor' ? data.filter((q) => q.course?.instructor_id === uid) : data;
  const lists: Record<Filter, Question[]> = {
    open: relevant.filter((q) => q.status === 'open'),
    mine: data.filter((q) => q.author_id === uid),
    all: data,
  };

  return (
    <>
      <PageHeader title="Questions & réponses" subtitle={profile!.role === 'student'
        ? 'Posez vos questions depuis la page d’un cours (onglet « Questions »).'
        : 'Répondez aux questions des élèves de vos cours.'} />
      <Tabs value={filter} onChange={setFilter} tabs={[
        { id: 'open', label: profile!.role === 'student' ? 'Sans réponse' : 'À traiter', count: lists.open.length },
        { id: 'mine', label: 'Mes questions', count: lists.mine.length },
        { id: 'all', label: 'Toutes' },
      ]} />
      <Card>
        {lists[filter].length ? <QuestionList questions={lists[filter]} showCourse />
          : <Empty icon="❓" title="Aucune question ici" />}
      </Card>
    </>
  );
}
