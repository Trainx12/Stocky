import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Usuario } from '../types/database';
import { recordarSesion } from '../services/cuentas';
import { crearUltimoPedido } from '../lib/ultimoPedido';

interface AuthContextValue {
  session: Session | null;
  usuario: Usuario | null;
  loading: boolean;
  /** true mientras se busca/refresca la fila de `usuario`, independiente del `loading` inicial de sesión. */
  usuarioLoading: boolean;
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
  const [usuarioLoading, setUsuarioLoading] = useState(false);
  // El perfil se pide varias veces seguidas al iniciar sesión; solo vale la
  // respuesta del último pedido (si no, una vieja que llega tarde pisa datos
  // nuevos: ver lib/ultimoPedido.ts e incidentes-sprint10.md #18).
  const pedidosDePerfil = useRef(crearUltimoPedido()).current;

  async function fetchUsuario(userId: string) {
    const turno = pedidosDePerfil.nuevo();
    setUsuarioLoading(true);
    const { data, error } = await supabase.from('usuarios').select('*').eq('id', userId).single();
    if (!pedidosDePerfil.esVigente(turno)) return; // llegó un pedido más nuevo

    if (error) {
      // No hay fila todavía (p. ej. el trigger de alta recién está corriendo).
      // Una cuenta deshabilitada NO cae acá: su propia fila se sigue
      // pudiendo leer (habilitado = false) y RootNavigator la manda a
      // "Cuenta deshabilitada".
      // Se loguea el motivo real: sin esto, un error de red o de RLS se
      // ve idéntico a "usuario recién creado" y es imposible de debuggear.
      console.warn('[Stocky] No se pudo cargar el perfil de usuario:', error.message);
      setUsuario(null);
      setUsuarioLoading(false);
      return;
    }
    setUsuario(data);
    setUsuarioLoading(false);
  }

  useEffect(() => {
    // Al arrancar la app: ¿ya había una sesión guardada en el dispositivo?
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) fetchUsuario(data.session.user.id);
      setLoading(false);
    });

    // Cada sesión activa (login, cambio de cuenta, renovación del token) se
    // guarda en la lista de cuentas del celular, así se puede volver a ella
    // desde Cuenta sin pasar de nuevo por Google (ver services/cuentas.ts).
    function guardarParaCambiarDeCuenta(sesion: Session | null) {
      if (sesion) recordarSesion(sesion).catch((err) => console.warn('[Stocky] No se pudo guardar la cuenta:', err));
    }

    // De ahí en más: cada vez que cambia la sesión (login, logout, refresh
    // de token), nos enteramos acá y actualizamos usuario/session solos.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      guardarParaCambiarDeCuenta(newSession);
      if (newSession?.user) {
        fetchUsuario(newSession.user.id);
      } else {
        setUsuario(null);
      }
    });

    // Limpieza: dejar de escuchar cuando el AuthProvider se desmonta.
    return () => listener.subscription.unsubscribe();
  }, []);

  // Si un admin me deshabilita (o me cambia el rol) con la app abierta, me
  // entero al instante: Realtime manda el UPDATE de mi propia fila de
  // `usuarios` (publicada en la migración 20261011120000_abm_usuarios_y_habilitado.sql)
  // y RootNavigator pasa a mostrar "Cuenta deshabilitada". El bloqueo real
  // de los datos no depende de esto (lo hace la base en el momento); esto es
  // para que la UI no quede mostrando pantallas que ya no pueden cargar nada.
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    const canal = supabase
      .channel(`usuario-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'usuarios', filter: `id=eq.${userId}` },
        (payload) => setUsuario(payload.new as Usuario),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [userId]);

  // Lo que le llega a cualquier pantalla que use useAuth().
  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      usuario,
      loading,
      usuarioLoading,
      refreshUsuario: async () => {
        if (session?.user) await fetchUsuario(session.user.id);
      },
    }),
    [session, usuario, loading, usuarioLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook para leer sesión/usuario/rol desde cualquier pantalla:
// const { usuario } = useAuth();
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de un <AuthProvider>');
  return ctx;
}
