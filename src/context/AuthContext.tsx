import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Usuario } from '../types/database';

interface AuthContextValue {
  session: Session | null;
  usuario: Usuario | null;
  loading: boolean;
  refreshUsuario: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Fuente única de verdad de "quién está logueado y con qué rol" para el
 * resto de la app. RootNavigator decide qué stack mostrar mirando
 * `session`; cualquier pantalla que necesite el rol (RF0) lee `usuario.rol`
 * de acá en vez de volver a pedirlo a Supabase.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchUsuario(userId: string) {
    const { data, error } = await supabase.from('usuarios').select('*').eq('id', userId).single();

    if (error) {
      // No hay fila todavía (p. ej. el trigger de alta recién está corriendo)
      // o el usuario fue deshabilitado; se resuelve en próximos sprints.
      setUsuario(null);
      return;
    }
    setUsuario(data);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) fetchUsuario(data.session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        fetchUsuario(newSession.user.id);
      } else {
        setUsuario(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      usuario,
      loading,
      refreshUsuario: async () => {
        if (session?.user) await fetchUsuario(session.user.id);
      },
    }),
    [session, usuario, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de un <AuthProvider>');
  return ctx;
}
