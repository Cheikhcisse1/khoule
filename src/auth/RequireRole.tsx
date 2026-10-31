import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { homeFor, useAuth } from './AuthProvider';
import type { Role } from '../lib/types';
import { FullPageSpinner } from '../components/ui';

/**
 * Garde de route côté interface. La vraie protection est assurée par la RLS :
 * ce composant évite seulement d'afficher des écrans inutilisables.
 */
export function RequireRole({ roles, children, allowPending = false }: {
  roles?: Role[];
  children: ReactNode;
  allowPending?: boolean;
}) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/connexion" state={{ from: location.pathname }} replace />;
  if (!profile) return <FullPageSpinner />;
  if (profile.status === 'suspended') return <Navigate to="/compte-suspendu" replace />;
  if (profile.status === 'pending' && !allowPending) return <Navigate to={homeFor(profile)} replace />;
  if (roles && !roles.includes(profile.role)) return <Navigate to={homeFor(profile)} replace />;
  return <>{children}</>;
}
