import { must, supabase } from '../lib/supabase';
import { useLoad } from '../lib/hooks';
import { formatDate } from '../lib/format';
import type { Announcement } from '../lib/types';
import { Card, Empty, ErrorBox, PageHeader, RichText, Spinner } from '../components/ui';

export function AnnouncementsPage() {
  const { data, error, loading, reload } = useLoad(async () =>
    must(await supabase.from('announcements').select('*').order('pinned', { ascending: false })
      .order('published_at', { ascending: false }).limit(50)) as Announcement[], []);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;
  return (
    <div className="narrow-page">
      <PageHeader title="Annonces" subtitle="Informations de l’équipe Khoulé Éducation." />
      {data.length === 0 ? <Card><Empty icon="📢" title="Aucune annonce" /></Card> : data.map((a) => (
        <Card key={a.id} className={a.pinned ? 'pinned' : ''} title={<>{a.pinned && '📌 '}{a.title}</>}>
          <RichText text={a.body} />
          <p className="small muted">Publiée le {formatDate(a.published_at)}</p>
        </Card>
      ))}
    </div>
  );
}
