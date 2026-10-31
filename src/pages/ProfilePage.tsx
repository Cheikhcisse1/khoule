import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase, translateError } from '../lib/supabase';
import { ROLE_LABEL, formatDate } from '../lib/format';
import { Avatar, Badge, Button, Card, Field, PageHeader, useAction } from '../components/ui';
import { IdentityForm, InstructorProfileForm, StudentProfileForm } from '../components/ProfileForms';
import { AvailabilityEditor } from '../components/Availability';
import { MfaSettings } from '../components/Mfa';

export function ProfilePage() {
  const { profile, session } = useAuth();
  const [password, setPassword] = useState('');
  const { busy, run } = useAction();
  const { hash } = useLocation();

  // Lien direct vers une section (ex. /profil#disponibilites)
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => { document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }); }, 300);
    return () => clearTimeout(t);
  }, [hash]);

  if (!profile) return null;

  const changePassword = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (password.length < 8) throw new Error('8 caractères minimum.');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(translateError(error.message));
      setPassword('');
    }, 'Mot de passe modifié.');
  };

  return (
    <div className="narrow-page">
      <PageHeader title="Mon profil" />
      <Card>
        <div className="qa-head">
          <Avatar person={profile} size={56} />
          <div>
            <h2 className="qa-title">{profile.first_name} {profile.last_name}</h2>
            <span className="muted small">{session?.user.email} · membre depuis le {formatDate(profile.created_at)}</span>
          </div>
          <Badge tone="info">{ROLE_LABEL[profile.role]}</Badge>
        </div>
      </Card>
      <Card title="Identité"><IdentityForm /></Card>
      {profile.role === 'student' && <Card title="Scolarité et parent / tuteur"><StudentProfileForm /></Card>}
      {profile.role === 'instructor' && <Card title="Profil d’intervenant"><InstructorProfileForm /></Card>}
      {(profile.role === 'instructor' || profile.role === 'admin') && (
        <section id="disponibilites">
          <Card title="📆 Mes disponibilités">
            <p className="small muted">Les cours peuvent avoir lieu toute la semaine. Indiquez vos créneaux libres :
              l’administration s’en sert pour vous affecter, et vos séances sont vérifiées par rapport à ces créneaux.</p>
            <AvailabilityEditor instructorId={profile.id} />
          </Card>
        </section>
      )}
      {(profile.role === 'admin' || profile.role === 'instructor') && (
        <Card title="🔐 Vérification en deux étapes"><MfaSettings /></Card>
      )}
      <Card title="Sécurité">
        <form className="form" onSubmit={changePassword}>
          <Field label="Nouveau mot de passe"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
          <Button type="submit" loading={busy} variant="secondary">Changer le mot de passe</Button>
        </form>
      </Card>
      <Card title="Mes données">
        <p className="small">
          Vos données sont utilisées uniquement pour l’accompagnement scolaire au sein de Khoulé Éducation.
          Les coordonnées des élèves et de leurs parents ne sont visibles que par l’administration et les intervenants de leurs cours.
          Pour demander la suppression de votre compte, écrivez à l’administration via la messagerie.
        </p>
      </Card>
    </div>
  );
}
