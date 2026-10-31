import { supabase } from './supabase';

export type Bucket = 'course-materials' | 'submissions' | 'corrections' | 'avatars' | 'library';

export const MAX_SIZE: Record<Bucket, number> = {
  'course-materials': 50 * 1024 * 1024,
  submissions: 20 * 1024 * 1024,
  corrections: 20 * 1024 * 1024,
  avatars: 2 * 1024 * 1024,
  library: 50 * 1024 * 1024,
};

function safeName(name: string): string {
  const clean = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
  return `${Date.now()}_${clean}`.slice(0, 120);
}

/** Envoie un fichier sous `folder/` (le 1er segment du dossier porte l'autorisation côté Storage). */
export async function uploadFile(bucket: Bucket, folder: string, file: File): Promise<string> {
  if (file.size > MAX_SIZE[bucket]) {
    throw new Error(`Fichier trop volumineux (max ${Math.round(MAX_SIZE[bucket] / 1024 / 1024)} Mo).`);
  }
  const path = `${folder}/${safeName(file.name)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(`Échec de l'envoi : ${error.message}`);
  return path;
}

/** Ouvre un fichier privé via une URL signée valable 60 secondes. */
export async function openFile(bucket: Bucket, path: string): Promise<void> {
  const win = window.open('', '_blank');
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data) {
    win?.close();
    throw new Error("Impossible d'ouvrir le fichier.");
  }
  if (win) win.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}

export async function removeFile(bucket: Bucket, path: string): Promise<void> {
  await supabase.storage.from(bucket).remove([path]);
}

export function fileLabel(path: string): string {
  return path.split('/').pop()?.replace(/^\d+_/, '') ?? path;
}

export function guessKind(file: File): 'pdf' | 'document' | 'image' | 'video' {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
}
