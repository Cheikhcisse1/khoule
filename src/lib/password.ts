/**
 * Contrôle de la solidité d'un mot de passe avant l'envoi à Supabase.
 * La vérification « mot de passe piraté » utilise l'API Pwned Passwords (k-anonymat) :
 * seuls les 5 premiers caractères de l'empreinte SHA-1 quittent le navigateur, jamais le mot de passe.
 */

const COMMON = ['khoule', 'education', 'senegal', 'azerty', 'qwerty', 'password', 'motdepasse', '123456', 'abcdef'];

async function sha1Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Nombre de fois où ce mot de passe apparaît dans des fuites connues (0 = jamais vu, -1 = service injoignable). */
export async function pwnedCount(password: string): Promise<number> {
  try {
    const hash = await sha1Hex(password);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    if (!res.ok) return -1;
    const suffix = hash.slice(5);
    for (const line of (await res.text()).split('\n')) {
      const [s, count] = line.trim().split(':');
      if (s === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return -1;
  }
}

/** Renvoie un message d'erreur en français, ou null si le mot de passe est acceptable. */
export async function checkPassword(password: string, context: string[] = []): Promise<string | null> {
  if (password.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  const lower = password.toLowerCase();
  const personal = [...COMMON, ...context.map((c) => c.toLowerCase().trim()).filter((c) => c.length >= 3)];
  if (personal.some((w) => lower.includes(w))) return 'Évitez votre nom, votre e-mail ou des mots trop courants dans le mot de passe.';
  if (/^(.)\1+$/.test(password) || /^(0123|1234|2345|3456|4567|5678|6789)/.test(password)) return 'Mot de passe trop facile à deviner.';
  const count = await pwnedCount(password);
  if (count > 0) {
    return 'Ce mot de passe a déjà été piraté et publié sur Internet. Choisissez-en un autre.';
  }
  return null;
}
