import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';

/** Mise en page des écrans d'authentification. */
export function AuthShell({ title, subtitle, children, wide }:
  { title: string; subtitle?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="auth-page">
      <div className={`auth-card ${wide ? 'auth-card-wide' : ''}`}>
        <Link to="/" className="auth-logo"><Logo /></Link>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
