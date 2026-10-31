import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase, translateError } from '../lib/supabase';
import { ROLE_LABEL, formatDate } from '../lib/format';
import { Avatar, Badge, Button, Card, Field, PageHeader, useAction } from '../components/ui';
import { IdentityForm, InstructorProfileForm, StudentProfileForm } from '../components/ProfileForms';

export function ProfilePage() {
  const { profile, session } = useAuth();
  const [password, setPassword] = useState('');
  const { busy, run } = useAction();
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
