import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/ui';
import { AuthShell } from './AuthShell';

export function Suspended() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <AuthShell title="Compte suspendu">
      <p>Votre compte a été suspendu par l’administration de Khoulé Éducation.</p>
      <p className="muted">Pour toute question, contactez le responsable de la plateforme ou votre intervenant.</p>
      <Button variant="secondary" className="btn-block" onClick={() => void signOut().then(() => navigate('/'))}>
        Se déconnecter
      </Button>
    </AuthShell>
  );
}
