import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { ROLE_LABEL, fullName, timeAgo } from '../lib/format';
import type { AppNotification, Role } from '../lib/types';
import { Avatar } from './ui';
import { Logo } from './Logo';
import { ErrorBoundary } from './ErrorBoundary';

interface NavEntry { to: string; label: string; icon: string; end?: boolean; section?: string }

const NAV: Record<Role, NavEntry[]> = {
  student: [
    { to: '/eleve', label: 'Accueil', icon: '🏠', end: true },
    { to: '/eleve/cours', label: 'Mes cours', icon: '📚' },
    { to: '/eleve/devoirs', label: 'Devoirs', icon: '📝' },
    { to: '/eleve/notes', label: 'Notes & progression', icon: '📈' },
    { to: '/calendrier', label: 'Calendrier', icon: '📅' },
    { to: '/questions', label: 'Questions', icon: '❓' },
    { to: '/messages', label: 'Messages', icon: '💬' },
    { to: '/annonces', label: 'Annonces', icon: '📢' },
  ],
  instructor: [
    { to: '/intervenant', label: 'Tableau de bord', icon: '🏠', end: true },
    { to: '/intervenant/cours', label: 'Mes cours', icon: '📚' },
    { to: '/intervenant/corrections', label: 'Corrections', icon: '✅' },
    { to: '/calendrier', label: 'Calendrier', icon: '📅' },
    { to: '/questions', label: 'Questions', icon: '❓' },
    { to: '/messages', label: 'Messages', icon: '💬' },
    { to: '/annonces', label: 'Annonces', icon: '📢' },
  ],
  admin: [
    { to: '/admin', label: 'Tableau de bord', icon: '📊', end: true },
    { to: '/admin/utilisateurs', label: 'Utilisateurs', icon: '👥', section: 'Communauté' },
    { to: '/admin/affectations', label: 'Affectations', icon: '🧑‍🏫' },
    { to: '/admin/annonces', label: 'Annonces', icon: '📢' },
    { to: '/messages', label: 'Messages', icon: '💬' },
    { to: '/admin/cours', label: 'Tous les cours', icon: '📚', section: 'Pédagogie' },
    { to: '/admin/referentiel', label: 'Classes & matières', icon: '🏫' },
    { to: '/intervenant/corrections', label: 'Corrections & notes', icon: '✅' },
    { to: '/calendrier', label: 'Calendrier', icon: '📅' },
    { to: '/questions', label: 'Questions', icon: '❓', section: 'Contrôle' },
    { to: '/admin/moderation', label: 'Modération', icon: '🛡️' },
    { to: '/recherche', label: 'Recherche', icon: '🔍' },
  ],
};

export function Layout() {
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  if (!profile) return null;
  const items = NAV[profile.role];

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/recherche?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className={`shell ${menuOpen ? 'menu-open' : ''}`}>
      <aside className="sidebar" aria-label="Navigation principale">
        <Link to="/" className="sidebar-brand"><Logo /></Link>
        <nav>
          {items.map((i) => (
            <div key={i.to}>
              {i.section && <div className="nav-section">{i.section}</div>}
              <NavLink to={i.to} end={i.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <span className="nav-icon" aria-hidden>{i.icon}</span>
                {i.label}
              </NavLink>
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink to="/profil" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon" aria-hidden>👤</span>Mon profil
          </NavLink>
          <button className="nav-item" onClick={() => void signOut().then(() => navigate('/'))}>
            <span className="nav-icon" aria-hidden>🚪</span>Se déconnecter
          </button>
        </div>
      </aside>
      <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Ouvrir le menu">☰</button>
          <form className="search" onSubmit={onSearch} role="search">
            <span aria-hidden>🔍</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un cours, une matière, un intervenant…"
              aria-label="Rechercher" />
          </form>
          <NotificationBell userId={profile.id} />
          <Link to="/profil" className="user-chip">
            <Avatar person={profile} size={34} />
            <span className="user-chip-text">
              <strong>{fullName(profile)}</strong>
              <small>{ROLE_LABEL[profile.role]}</small>
            </span>
          </Link>
        </header>
        <main className="content">
          <ErrorBoundary resetKey={location.pathname}><Outlet /></ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => !cancelled && setItems((data as AppNotification[]) ?? []));
    // Temps réel : nouvelles notifications de l'utilisateur
    const channel = supabase
      .channel(`notif-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => setItems((prev) => [payload.new as AppNotification, ...prev].slice(0, 30)))
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const unread = items.filter((n) => !n.read_at).length;

  const markAll = async () => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    await supabase.from('notifications').update({ read_at: now }).is('read_at', null);
  };

  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
    }
    if (n.link) navigate(n.link);
  };

  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={`Notifications (${unread} non lues)`}>
        🔔{unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <div className="dropdown-head">
            <strong>Notifications</strong>
            {unread > 0 && <button className="link" onClick={() => void markAll()}>Tout marquer comme lu</button>}
          </div>
          {items.length === 0 ? (
            <p className="muted pad">Aucune notification pour l’instant.</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button className={`notif ${n.read_at ? '' : 'unread'}`} onClick={() => void openItem(n)}>
                    <strong>{n.title}</strong>
                    {n.body && <span>{n.body}</span>}
                    <small>{timeAgo(n.created_at)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
