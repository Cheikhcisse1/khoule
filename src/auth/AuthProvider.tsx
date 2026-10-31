import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Instructor, Profile, Student } from '../lib/types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  student: Student | null;
  instructor: Instructor | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [instructor, setInstructor] = useState<Instructor | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setStudent(null);
      setInstructor(null);
      return;
    }
    const uid = s.user.id;
    const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile(p as Profile | null);
    if (p?.role === 'student') {
      const { data } = await supabase.from('students').select('*').eq('profile_id', uid).maybeSingle();
      setStudent(data as Student | null);
      setInstructor(null);
    } else if (p?.role === 'instructor') {
      const { data } = await supabase.from('instructors').select('*').eq('profile_id', uid).maybeSingle();
      setInstructor(data as Instructor | null);
      setStudent(null);
    } else {
      setStudent(null);
      setInstructor(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // différé pour ne pas bloquer le callback d'auth (recommandation supabase-js)
        setTimeout(() => {
          void loadProfile(s).finally(() => setLoading(false));
        }, 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refresh = useCallback(() => loadProfile(session), [loadProfile, session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    await loadProfile(null);
  }, [loadProfile]);

  return (
    <AuthContext.Provider value={{ session, profile, student, instructor, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}

/** Accueil de chaque profil. */
export function homeFor(profile: Profile | null): string {
  if (!profile) return '/connexion';
  if (profile.status === 'suspended') return '/compte-suspendu';
  if (profile.role === 'admin') return '/admin';
  if (profile.role === 'instructor') return profile.status === 'active' ? '/intervenant' : '/candidature';
  return '/eleve';
}
