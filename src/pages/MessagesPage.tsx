import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { must, supabase } from '../lib/supabase';
import { fullName, timeAgo } from '../lib/format';
import { STAFF_TITLES } from '../lib/schools';
import type { Message, Profile } from '../lib/types';
import { Avatar, Button, Empty, PageHeader, Spinner, useAction } from '../components/ui';

type Contact = Pick<Profile, 'id' | 'first_name' | 'last_name' | 'role'>;

export function MessagesPage() {
  const { profile } = useAuth();
  const uid = profile!.id;
  const [params, setParams] = useSearchParams();
  const partnerId = params.get('avec');

  const [messages, setMessages] = useState<Message[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [text, setText] = useState('');
  const { busy, run } = useAction();
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [msgs, people] = await Promise.all([
      supabase.from('messages').select('*').is('course_id', null)
        .or(`sender_id.eq.${uid},recipient_id.eq.${uid}`).order('created_at').limit(1000).then(must),
      supabase.from('profiles').select('id, first_name, last_name, role').neq('id', uid).eq('status', 'active')
        .order('last_name').limit(500).then(must),
    ]);
    setMessages(msgs as Message[]);
    const list = people as Contact[];
    // Un élève ne peut écrire qu'aux intervenants et à l'administration
    setContacts(profile!.role === 'student' ? list.filter((p) => p.role !== 'student') : list);
    setLoading(false);
    // Fonction des responsables d'établissement et « Étudiant » pour le supérieur (au lieu de « Intervenant » / « Élève »)
    const { data: extra } = await supabase.rpc('people_labels', { p_ids: list.map((p) => p.id) });
    const map: Record<string, string> = {};
    for (const p of list) map[p.id] = p.role === 'admin' ? 'Administrateur' : p.role === 'student' ? 'Élève' : 'Intervenant';
    for (const x of (extra ?? []) as { id: string; staff_title: string | null; school_name: string | null; higher_student: boolean }[]) {
      if (x.staff_title) map[x.id] = `${STAFF_TITLES[x.staff_title] ?? 'Responsable'}${x.school_name ? ` · ${x.school_name}` : ''}`;
      else if (x.higher_student) map[x.id] = 'Étudiant';
    }
    setLabels(map);
  }, [uid, profile]);

  useEffect(() => {
    void load();
    const ch = supabase.channel(`dm-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${uid}` },
        (p) => setMessages((m) => [...m, p.new as Message]))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [uid, load]);

  const conversations = useMemo(() => {
    const map = new Map<string, { last: Message; unread: number }>();
    for (const m of messages) {
      const other = m.sender_id === uid ? m.recipient_id! : m.sender_id;
      const cur = map.get(other);
      const unread = (cur?.unread ?? 0) + (m.recipient_id === uid && !m.read_at ? 1 : 0);
      map.set(other, { last: m, unread });
    }
    return Array.from(map.entries()).sort((a, b) => b[1].last.created_at.localeCompare(a[1].last.created_at));
  }, [messages, uid]);

  const thread = messages.filter((m) => (m.sender_id === partnerId && m.recipient_id === uid) || (m.sender_id === uid && m.recipient_id === partnerId));
  const partner = contacts.find((c) => c.id === partnerId);

  // Marque comme lus les messages reçus de l'interlocuteur ouvert
  useEffect(() => {
    if (!partnerId) return;
    const unread = messages.filter((m) => m.sender_id === partnerId && m.recipient_id === uid && !m.read_at);
    if (!unread.length) return;
    const now = new Date().toISOString();
    setMessages((ms) => ms.map((m) => (unread.some((u) => u.id === m.id) ? { ...m, read_at: now } : m)));
    void supabase.from('messages').update({ read_at: now }).in('id', unread.map((u) => u.id));
  }, [partnerId, messages, uid]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [thread.length, partnerId]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !partnerId) return;
    void run(async () => {
      const m = must(await supabase.from('messages').insert({ sender_id: uid, recipient_id: partnerId, body: text.trim() }).select().single()) as Message;
      setMessages((ms) => [...ms, m]);
      setText('');
    });
  };

  if (loading) return <Spinner />;
  const name = (id: string) => fullName(contacts.find((c) => c.id === id));
  const filtered = contacts.filter((c) => fullName(c).toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <PageHeader title="Messages" subtitle={profile!.role === 'student'
        ? 'Échangez avec vos intervenants. Restez poli et ne partagez pas d’informations personnelles.' : undefined} />
      <div className={`messenger ${partnerId ? 'has-thread' : ''}`}>
        <aside className="conv-list">
          <input className="conv-search" placeholder="Rechercher un contact…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {filter ? (
            <ul>
              {filtered.slice(0, 30).map((c) => (
                <li key={c.id}><button className="conv" onClick={() => { setParams({ avec: c.id }); setFilter(''); }}>
                  <Avatar person={c} size={34} /><span><strong>{fullName(c)}</strong><small>{labels[c.id]}</small></span>
                </button></li>
              ))}
              {!filtered.length && <li className="muted pad">Aucun contact.</li>}
            </ul>
          ) : (
            <ul>
              {conversations.map(([other, info]) => (
                <li key={other}>
                  <button className={`conv ${other === partnerId ? 'active' : ''}`} onClick={() => setParams({ avec: other })}>
                    <Avatar person={contacts.find((c) => c.id === other)} size={34} />
                    <span>
                      <strong>{name(other)}</strong>
                      <small className="clamp-1">{info.last.sender_id === uid ? 'Vous : ' : ''}{info.last.body}</small>
                    </span>
                    {info.unread > 0 && <span className="bell-count static">{info.unread}</span>}
                  </button>
                </li>
              ))}
              {!conversations.length && <li className="muted pad">Aucune conversation. Recherchez un contact ci-dessus.</li>}
            </ul>
          )}
        </aside>

        <section className="chat">
          {partnerId ? (
            <>
              <header className="chat-head">
                <button className="icon-btn back-btn" onClick={() => setParams({})} aria-label="Retour">←</button>
                <Avatar person={partner} size={34} />
                <div><strong>{fullName(partner)}</strong><br /><small className="muted">{partner ? labels[partner.id] : ''}</small></div>
              </header>
              <div className="chat-scroll">
                {thread.length === 0 && <Empty icon="👋" title="Démarrez la conversation" />}
                {thread.map((m) => (
                  <div key={m.id} className={`bubble-row ${m.sender_id === uid ? 'mine' : ''}`}>
                    <div className="bubble">
                      <p>{m.body}</p>
                      <span className="bubble-meta">{timeAgo(m.created_at)}{m.sender_id === uid && m.read_at ? ' · Lu' : ''}</span>
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              <form className="chat-input" onSubmit={send}>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Écrire un message…" maxLength={4000} aria-label="Message" />
                <Button type="submit" loading={busy}>Envoyer</Button>
              </form>
            </>
          ) : (
            <Empty icon="💬" title="Sélectionnez une conversation" />
          )}
        </section>
      </div>
    </>
  );
}
