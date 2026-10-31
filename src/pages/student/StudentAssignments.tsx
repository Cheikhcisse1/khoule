import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { useLoad } from '../../lib/hooks';
import { fetchStudentWork } from '../../lib/queries';
import { Card, Empty, ErrorBox, PageHeader, Spinner, Tabs } from '../../components/ui';
import { WorkCard } from '../../components/StudentWork';

type Filter = 'todo' | 'submitted' | 'corrected';

export function StudentAssignments() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const [filter, setFilter] = useState<Filter>('todo');
  const { data, error, loading, reload } = useLoad(() => fetchStudentWork(uid), [uid]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? 'Erreur'} onRetry={reload} />;

  const groups: Record<Filter, typeof data> = {
    todo: data.filter((w) => !w.submission),
    submitted: data.filter((w) => w.submission && w.submission.status === 'submitted'),
    corrected: data.filter((w) => w.submission?.status === 'corrected'),
  };
  const list = groups[filter];

  return (
    <>
      <PageHeader title="Mes devoirs" subtitle="Rendez vos devoirs en texte, photo ou PDF, puis consultez les corrections." />
      <Tabs value={filter} onChange={setFilter} tabs={[
        { id: 'todo', label: 'À rendre', count: groups.todo.length },
        { id: 'submitted', label: 'Rendus', count: groups.submitted.length },
        { id: 'corrected', label: 'Corrigés', count: groups.corrected.length },
      ]} />
      {list.length ? (
        <div className="stack">{list.map((w) => <WorkCard key={w.assignment.id} work={w} userId={uid} onChange={reload} />)}</div>
      ) : (
        <Card><Empty icon={filter === 'todo' ? '🎉' : '📭'} title={
          filter === 'todo' ? 'Aucun devoir à rendre' : filter === 'submitted' ? 'Aucun devoir en attente de correction' : 'Aucun devoir corrigé pour l’instant'} /></Card>
      )}
    </>
  );
}
