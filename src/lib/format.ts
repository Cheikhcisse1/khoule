const TZ = 'Africa/Dakar';

export const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export const CYCLES: Record<string, string> = {
  elementaire: 'Élémentaire',
  college: 'Collège',
  lycee: 'Lycée',
};

export const INSTRUCTOR_TYPES: Record<string, string> = {
  enseignant: 'Enseignant',
  professeur: 'Professeur',
  etudiant: 'Étudiant',
  autre: 'Autre intervenant',
};

export const COURSE_STATUS: Record<string, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  archived: 'Archivé',
};

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrateur',
  instructor: 'Intervenant',
  student: 'Élève',
};

export function fullName(p?: { first_name: string; last_name: string } | null): string {
  return p ? `${p.first_name} ${p.last_name}` : '—';
}

export function initials(p?: { first_name: string; last_name: string } | null): string {
  return p ? `${p.first_name[0] ?? ''}${p.last_name[0] ?? ''}`.toUpperCase() : '?';
}

export function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('fr-FR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateTime(d: string | Date): string {
  return new Date(d).toLocaleString('fr-FR', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(d: string | Date): string {
  return new Date(d).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(d: string): string {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `il y a ${Math.floor(s / 86400)} j`;
  return formatDate(d);
}

/** Valeur pour <input type="datetime-local"> à partir d'une date ISO. */
export function toLocalInput(d: string | Date | null): string {
  if (!d) return '';
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

export function score(s: number, max: number): string {
  const n = (x: number) => (Number.isInteger(Number(x)) ? String(Number(x)) : Number(x).toFixed(2).replace(/\.?0+$/, ''));
  return `${n(s)}/${n(max)}`;
}

export function fileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export function isPast(d: string | null): boolean {
  return Boolean(d && new Date(d).getTime() < Date.now());
}
