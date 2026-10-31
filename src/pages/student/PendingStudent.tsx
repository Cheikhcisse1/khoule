import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { useRefData } from '../../lib/hooks';
import { Button } from '../../components/ui';
import { AuthShell } from '../AuthShell';

/** Élève inscrit dont le compte n'a pas encore été validé par l'administration. */
export function PendingStudent() {
  const { profile, student, signOut, refresh } = useAuth();
  const { data: ref } = useRefData();
  const navigate = useNavigate();
  if (profile?.status === 'active') return <Navigate to="/eleve" replace />;
  const className = ref?.classes.find((c) => c.id === student?.class_id)?.name;

  return (
    <AuthShell title={`Merci ${profile?.first_name ?? ''} ! ⏳`}>
      <p>Votre inscription est bien enregistrée{className ? <> en <b>{className}</b></> : ''}.</p>
      <p>Pour protéger les élèves, <b>chaque compte est vérifié par l’administration de Khoulé Éducation</b> avant
        de pouvoir accéder aux cours. Vous recevrez une notification dès que votre compte sera validé.</p>
      <div className="alert alert-info">
        <span>Vous pouvez aussi prévenir l’administration ou votre intervenant que vous venez de vous inscrire.</span>
      </div>
      <div className="row">
        <Button onClick={() => void refresh()}>Vérifier à nouveau</Button>
        <Button variant="ghost" onClick={() => void signOut().then(() => navigate('/'))}>Se déconnecter</Button>
      </div>
    </AuthShell>
  );
}
