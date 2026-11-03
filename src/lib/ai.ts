import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Appels à l'Edge Function `ai` (Groq gratuit côté serveur, la clé n'est jamais dans le navigateur).
export type AiMode = 'tutor' | 'instructor';

export interface AiChatReply { answer: string; thread: string; remaining: number }

export interface AiCorrection {
  note: number;
  appreciation: string;
  details?: { question: string; statut: string; points: string; commentaire: string }[];
  points_forts?: string[];
  a_retravailler?: string[];
  confiance?: string;
}

const MESSAGES: Record<string, string> = {
  login_required: 'Votre session a expiré : reconnectez-vous.',
  forbidden: 'L’assistant n’est pas disponible pour votre compte.',
  quota_reached: 'Vous avez utilisé toutes vos questions à l’assistant pour aujourd’hui. Revenez demain, ou posez la question à votre intervenant.',
  rate_limited: 'L’assistant est très demandé en ce moment. Réessayez dans une minute.',
  no_server_key: 'L’assistant n’est pas encore configuré (clé Groq manquante côté serveur).',
  message_too_long: 'Message trop long (2 000 caractères maximum).',
  no_readable_content: 'Cette copie ne contient ni texte ni photo lisible (les PDF ne sont pas encore lus par l’IA).',
  not_found: 'Copie introuvable.',
};

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai', { body });
  if (error) {
    let code = '';
    if (error instanceof FunctionsHttpError) code = (await error.context.json().catch(() => ({})))?.code ?? '';
    throw new Error(MESSAGES[code] ?? 'L’assistant est indisponible pour le moment. Réessayez plus tard.');
  }
  return data as T;
}

export const askAi = (mode: AiMode, message: string, ctx: { courseId?: string; assignmentId?: string } = {}) =>
  invoke<AiChatReply>({ mode, message, course_id: ctx.courseId, assignment_id: ctx.assignmentId });

export const preCorrect = (submissionId: string) =>
  invoke<{ result: AiCorrection; skipped_files: number; remaining: number }>({ mode: 'correct', submission_id: submissionId });

/** Met en forme la pré-correction en texte pour le champ « Commentaires ». */
export function correctionText(c: AiCorrection): string {
  const icon: Record<string, string> = { juste: '✅', partiel: '🟠', faux: '❌', absent: '⬜' };
  const parts = [c.appreciation?.trim()];
  if (c.details?.length) parts.push(c.details.map((d) => `${icon[d.statut] ?? '•'} ${d.question} (${d.points}) : ${d.commentaire}`).join('\n'));
  if (c.points_forts?.length) parts.push('Points forts : ' + c.points_forts.join(' ; '));
  if (c.a_retravailler?.length) parts.push('À retravailler : ' + c.a_retravailler.join(' ; '));
  return parts.filter(Boolean).join('\n\n');
}
