import { useCallback, useEffect, useRef, useState } from 'react';
import { must, supabase } from './supabase';
import type { SchoolClass, Subject } from './types';

/** Charge des données asynchrones avec états loading / error et rechargement manuel. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fnRef.current());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload, setData };
}

// Référentiels (classes, matières, programme) : chargés une fois puis mis en cache
let refCache: Promise<RefData> | null = null;

export interface RefData {
  classes: SchoolClass[];
  subjects: Subject[];
  classSubjects: { class_id: number; subject_id: number }[];
}

export function loadRefData(force = false): Promise<RefData> {
  if (!refCache || force) {
    refCache = (async () => {
      const [classes, subjects, classSubjects] = await Promise.all([
        supabase.from('classes').select('*').order('sort_order').then(must),
        supabase.from('subjects').select('*').order('name').then(must),
        supabase.from('class_subjects').select('class_id, subject_id').then(must),
      ]);
      return { classes, subjects, classSubjects } as RefData;
    })();
    refCache.catch(() => (refCache = null));
  }
  return refCache;
}

export function useRefData() {
  return useLoad(() => loadRefData(), []);
}
