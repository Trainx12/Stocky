import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { avisar } from '../lib/alert';
import type { TipoAviso } from '../lib/alert';
import {
  configurarNotificaciones,
  desregistrarPush,
  escucharToquesDeNotificacion,
  pedirPermiso,
  programarAvisosLocales,
  registrarPush,
} from '../lib/notificacionesPush';
import { registrarTareaAntesDeCerrarSesion } from '../services/auth';
import { listarMisHogares } from '../services/hogares';
import { aparienciaNotificacion, contarNoLeidas, listarProductosConFecha } from '../services/notificaciones';
import type { FamiliaNotificacion } from '../services/notificaciones';
import { irANotificaciones } from '../navigation/navegacion';
import type { Notificacion } from '../types/database';
import { useAuth } from './AuthContext';

interface NotificacionesContextValue {
  // Cuántas sin leer (numerito de la campanita).
  noLeidas: number;
  refrescarNoLeidas: () => Promise<void>;
  // true si este celular quedó registrado para push remoto.
  pushActivo: boolean;
  // Pide el permiso y vuelve a intentar registrar el celular (botón
  // "Activar notificaciones" de la campanita). true si quedó con permiso.
  activarEnTelefono: () => Promise<boolean>;
  // Avisa a quien quiera enterarse de que llegó una notificación nueva (la
  // pantalla de la campanita la usa para recargar la lista).
  suscribirseANuevas: (alLlegar: (n: Notificacion) => void) => () => void;
}

const NotificacionesContext = createContext<NotificacionesContextValue | undefined>(undefined);

// Cómo se ve el cartelito de una notificación que llega con la app abierta:
// mismo color que en la campanita (vencimientos/avisos en coral, buenas
// noticias en verde, el resto en violeta).
const TIPO_DE_AVISO: Record<FamiliaNotificacion, TipoAviso> = {
  vencimiento: 'error',
  aviso: 'error',
  exito: 'exito',
  stock: 'info',
  hogar: 'info',
};

/**
 * Todo lo que tiene que estar vivo mientras haya sesión para que las
 * notificaciones funcionen (ver docs/arquitectura-del-codigo.md):
 *   - el contador de no leídas;
 *   - Realtime sobre `notificaciones`: cada fila nueva suma al contador y
 *     muestra un cartelito (con la app abierta, el sistema no muestra el
 *     push, ver lib/notificacionesPush.ts);
 *   - registrar este celular para push al loguearse, y desregistrarlo
 *     antes de cerrar sesión;
 *   - plan B: si el push remoto no está disponible, programar en el
 *     celular los avisos de vencimiento (al entrar y cada vez que la app
 *     vuelve a primer plano);
 *   - tocar una notificación del sistema abre la campanita.
 */
export function NotificacionesProvider({ children }: { children: React.ReactNode }) {
  const { session, usuario } = useAuth();
  const userId = session?.user?.id;
  const habilitado = usuario?.habilitado === true;
  const diasPorDefecto = usuario?.dias_aviso_vencimiento;

  const [noLeidas, setNoLeidas] = useState(0);
  const [pushActivo, setPushActivo] = useState(false);
  const tokenPush = useRef<string | null>(null);
  const oyentes = useRef(new Set<(n: Notificacion) => void>());

  const refrescarNoLeidas = useCallback(async () => {
    if (!userId) return;
    try {
      setNoLeidas(await contarNoLeidas());
    } catch (err) {
      console.warn('[Stocky] No se pudieron contar las notificaciones:', err);
    }
  }, [userId]);

  // Plan B (solo si no hay push remoto): reprograma los avisos locales de
  // vencimiento con los productos de todos mis hogares.
  const reprogramarAvisosLocales = useCallback(async () => {
    if (!userId || tokenPush.current || diasPorDefecto === undefined) return;
    try {
      const hogarIds = (await listarMisHogares()).map((h) => h.id);
      await programarAvisosLocales(await listarProductosConFecha(hogarIds), diasPorDefecto);
    } catch (err) {
      console.warn('[Stocky] No se pudieron programar los avisos de vencimiento:', err);
    }
  }, [userId, diasPorDefecto]);

  // Una sola vez: handler y canal de Android.
  useEffect(() => {
    configurarNotificaciones().catch((err) => console.warn('[Stocky] No se pudieron configurar las notificaciones:', err));
    return escucharToquesDeNotificacion(irANotificaciones);
  }, []);

  // Al loguearse (o rehabilitarse): contador, registro del celular y avisos locales.
  useEffect(() => {
    if (!userId || !habilitado) {
      setNoLeidas(0);
      return;
    }
    let cancelado = false;
    refrescarNoLeidas();
    registrarPush().then((token) => {
      if (cancelado) return;
      tokenPush.current = token;
      setPushActivo(token !== null);
      reprogramarAvisosLocales();
    });
    return () => {
      cancelado = true;
    };
  }, [userId, habilitado, refrescarNoLeidas, reprogramarAvisosLocales]);

  // Antes de cerrar sesión: este celular deja de recibir los push de esta cuenta.
  useEffect(
    () =>
      registrarTareaAntesDeCerrarSesion(async () => {
        await desregistrarPush(tokenPush.current);
        tokenPush.current = null;
        setPushActivo(false);
      }),
    [],
  );

  // Al volver a primer plano: el contador pudo cambiar con la app en
  // segundo plano, y los productos también (reprograma el plan B).
  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        refrescarNoLeidas();
        reprogramarAvisosLocales();
      }
    });
    return () => suscripcion.remove();
  }, [refrescarNoLeidas, reprogramarAvisosLocales]);

  // Realtime: cada notificación nueva para mí.
  useEffect(() => {
    if (!userId || !habilitado) return;
    const canal = supabase
      .channel(`notificaciones-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${userId}` },
        (payload) => {
          const nueva = payload.new as Notificacion;
          setNoLeidas((n) => n + 1);
          const { icono, familia } = aparienciaNotificacion(nueva.tipo);
          // Con el ícono propio de la notificación (no el genérico del tipo).
          avisar(nueva.titulo, nueva.mensaje, TIPO_DE_AVISO[familia], icono);
          oyentes.current.forEach((oyente) => oyente(nueva));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [userId, habilitado]);

  const activarEnTelefono = useCallback(async () => {
    const concedido = await pedirPermiso();
    if (!concedido) return false;
    const token = await registrarPush();
    tokenPush.current = token;
    setPushActivo(token !== null);
    await reprogramarAvisosLocales();
    return true;
  }, [reprogramarAvisosLocales]);

  const suscribirseANuevas = useCallback((alLlegar: (n: Notificacion) => void) => {
    oyentes.current.add(alLlegar);
    return () => {
      oyentes.current.delete(alLlegar);
    };
  }, []);

  const value = useMemo<NotificacionesContextValue>(
    () => ({ noLeidas, refrescarNoLeidas, pushActivo, activarEnTelefono, suscribirseANuevas }),
    [noLeidas, refrescarNoLeidas, pushActivo, activarEnTelefono, suscribirseANuevas],
  );

  return <NotificacionesContext.Provider value={value}>{children}</NotificacionesContext.Provider>;
}

export function useNotificaciones() {
  const ctx = useContext(NotificacionesContext);
  if (!ctx) throw new Error('useNotificaciones debe usarse dentro de un <NotificacionesProvider>');
  return ctx;
}
