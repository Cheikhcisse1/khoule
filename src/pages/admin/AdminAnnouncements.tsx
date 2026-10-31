import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { must, supabase } from '../../lib/supabase';
import { useLoad, useRefData } from '../../lib/hooks';
import { formatDate, fromLocalInput } from '../../lib/format';
import type { Announcement } from '../../lib/types';
import { Badge, Button, Card, ConfirmButton, Empty, ErrorBox, Field, PageHeader, RichText, Spinner, useAction } from '../../components/ui';

const AUDIENCE: Record<string, string> = { all: 'Tout le monde', students: 'Élèves', instructors: 'Intervenants', class: 'Une classe' };

export function AdminAnnouncements() {
  const { profile } = useAuth();
  const { data: ref } = useRefData();
  const [f, setF] = useState({ title: '', body: '', audience: 'all', class_id: '', pinned: false, expires: '' });
  const { busy, run } = useAction();
  const { data, error, loading, reload } = useLoad(async () =>
    must(await supabase.from('announcements').select('*').order('published_at', { ascending: false })) as Announcement[], []);

  if (loading || !ref) return <Spinner />;
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={reload} />;

  const publish = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      must(await supabase.from('announcements').insert({
        title: f.title, body: f.body, audience: f.audience, class_id: f.audience === 'class' ? Number(f.class_id) : null,
        pinned: f.pinned, expires_at: fromLocalInput(f.expires), author_id: profile!.id,
      }));
      setF({ title: '', body: '', audience: 'all', class_id: '', pinned: false, expires: '' });
      await reload();
    }, 'Annonce publiée : les destinataires sont notifiés.');
  };

  return (
    <>
      <PageHeader title="Annonces" subtitle="Informez la communauté : horaires, salles, événements, rappels." />
      <div className="split">
        <Card title="Nouvelle annonce">
          <form className="form" onSubmit={publish}>
            <Field label="Titre" required><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
            <Field label="Message" required><textarea rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required /></Field>
            <div className="grid-2">
              <Field label="Destinataires">
                <select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
                  {Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              {f.audience === 'class' && (
                <Field label="Classe">
                  <select value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })} required>
                    <option value="">—</option>
                    {ref.classes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Expire le" hint="Facultatif"><input type="datetime-local" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} /></Field>
            </div>
            <label className="check"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /><span>📌 Épingler en haut</span></label>
            <Button type="submit" loading={busy}>Publier</Button>
          </form>
        </Card>
        <section className="stack">
          {data.length === 0 && <Card><Empty icon="📢" title="Aucune annonce" /></Card>}
          {data.map((a) => (
            <Card key={a.id} title={<>{a.pinned && '📌 '}{a.title}</>} actions={
              <>
                <Button variant="ghost" onClick={() => void run(async () => {
                  must(await supabase.from('announcements').update({ pinned: !a.pinned }).eq('id', a.id)); await reload();
                })}>{a.pinned ? 'Désépingler' : 'Épingler'}</Button>
                <ConfirmButton variant="ghost" message="Supprimer cette annonce ?" onConfirm={() => void run(async () => {
                  must(await supabase.from('announcements').delete().eq('id', a.id)); await reload();
                }, 'Annonce supprimée.')}>🗑️</ConfirmButton>
              </>
            }>
              <RichText text={a.body} />
              <p className="small muted">
                <Badge>{a.audience === 'class' ? `Classe ${ref.classes.find((c) => c.id === a.class_id)?.code}` : AUDIENCE[a.audience]}</Badge>{' '}
                {formatDate(a.published_at)}{a.expires_at ? ` · expire le ${formatDate(a.expires_at)}` : ''}
              </p>
            </Card>
          ))}
        </section>
      </div>
    </>
  );
}
