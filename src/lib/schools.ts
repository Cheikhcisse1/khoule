import { must, supabase } from './supabase';
import { useLoad } from './hooks';
import type { SchoolStaff } from './types';

// Espaces école : libellés et chargement des établissements dont l'utilisateur est responsable.
// La sécurité est assurée par la RLS (fonctions staff_covers / is_school_director côté base).

export const SCHOOL_KINDS: Record<string, string> = {
  elementaire: 'École élémentaire',
  college: 'Collège',
  lycee: 'Lycée',
  universite: 'Université',
  ecole_superieure: 'École supérieure',
  autre: 'Autre établissement',
};

export const STAFF_TITLES: Record<string, string> = {
  directeur: 'Directeur / directrice',
  proviseur: 'Proviseur',
  principal: 'Principal',
  doyen: 'Doyen',
  chef_departement: 'Chef de département',
  responsable_filiere: 'Responsable de filière',
  autre: 'Responsable',
};

export const SCHOOL_STATUS: Record<string, string> = {
  pending: 'À valider',
  approved: 'Validé',
  rejected: 'Refusé',
};

let cache: { uid: string; p: Promise<SchoolStaff[]> } | null = null;

/** Établissements où l'utilisateur est responsable (directeur, proviseur, filière…). */
export function loadMySchools(uid: string, force = false): Promise<SchoolStaff[]> {
  if (!cache || cache.uid !== uid || force) {
    const p = (async () => must(await supabase.from('school_staff')
      .select('school_id, user_id, title, scope, class_ids, school:schools(*)')
      .eq('user_id', uid)) as unknown as SchoolStaff[])();
    p.catch(() => { cache = null; });
    cache = { uid, p };
  }
  return cache.p;
}

export function useMySchools(uid: string | undefined) {
  return useLoad(async () => (uid ? loadMySchools(uid) : []), [uid]);
}

/** Le responsable couvre-t-il cette classe de cette école ? (affichage seulement ; la base vérifie aussi) */
export const covers = (st: SchoolStaff | undefined, classId: number | null | undefined) =>
  !!st && (st.scope === 'school' || (classId != null && st.class_ids.includes(classId)));
