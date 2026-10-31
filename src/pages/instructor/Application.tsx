import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { Logo } from '../../components/Logo';
import { InstructorProfileForm } from '../../components/ProfileForms';
import { AvailabilityEditor } from '../../components/Availability';
import { Button, Card } from '../../components/ui';

/** Espace d'un intervenant dont la candidature n'est pas encore validée. */
export function Application() {
  const { profile, instructor, signOut } = useAuth();
  const navigate = useNavigate();
  if (profile?.status === 'active') return <Navigate to="/intervenant" replace />;

  const rejected = instructor?.application_status === 'rejected';

  return (
    <div className="application">
      <header className="application-head">
        <Logo />
        <Button variant="ghost" onClick={() => void signOut().then(() => navigate('/'))}>Se déconnecter</Button>
      </header>
      <div className="application-body">
        {rejected ? (
          <div className="alert alert-error">
            <div>
              <strong>Votre candidature n’a pas été retenue.</strong>
              {instructor?.rejection_reason && <p>Motif : {instructor.rejection_reason}</p>}
              <p>Vous pouvez compléter votre profil ci-dessous et contacter l’administration.</p>
            </div>
          </div>
        ) : (
          <div className="alert alert-info">
            <div>
              <strong>Merci {profile?.first_name}, votre candidature est en cours d’examen ⏳</strong>
              <p>Complétez votre profil pour aider l’administration à vous affecter aux bonnes classes et matières.
                Vous recevrez une notification dès la validation.</p>
            </div>
          </div>
        )}
        <Card title="Mon profil d’intervenant">
          <InstructorProfileForm />
        </Card>
        {profile && (
          <Card title="📆 Mes disponibilités dans la semaine">
            <p className="small muted">Indiquez les jours et heures où vous pouvez donner cours (en salle ou en ligne).</p>
            <AvailabilityEditor instructorId={profile.id} />
          </Card>
        )}
      </div>
    </div>
  );
}
