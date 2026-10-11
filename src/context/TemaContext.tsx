import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { aplicarEsquema } from '../theme/colors';
import type { EsquemaColor } from '../theme/colors';

/**
 * Modo oscuro (Sprint 10). El usuario elige en Cuenta → Apariencia:
 *   - 'claro' (por defecto, pedido del equipo) / 'oscuro': fijo;
 *   - 'sistema': sigue al celular (si el teléfono está en oscuro, la app también).
 * La elección se guarda en el celular (AsyncStorage): es una preferencia del
 * dispositivo, no de la cuenta (con varias cuentas en el mismo celular, el
 * modo no cambia al pasar de una a otra).
 *
 * Al cambiar el esquema, `aplicarEsquema` actualiza los valores de `colors`
 * y todo componente que use `useEstilos` (src/theme/useEstilos.ts) vuelve a
 * armar sus estilos.
 */

export type ModoTema = 'sistema' | 'claro' | 'oscuro';

const CLAVE_MODO = 'stocky.modoTema';

// Qué esquema corresponde mostrar según la elección y el modo del celular
// (lógica pura, testeada aparte).
export function resolverEsquema(modo: ModoTema, delSistema: string | null | undefined): EsquemaColor {
  if (modo === 'claro' || modo === 'oscuro') return modo;
  return delSistema === 'dark' ? 'oscuro' : 'claro';
}

// Modo con el que arranca la app si el usuario nunca eligió otro: claro,
// aunque el celular esté en oscuro (pedido del equipo).
export const MODO_POR_DEFECTO: ModoTema = 'claro';

// Lo guardado en el celular -> modo válido (cualquier otra cosa, el default).
export function modoGuardadoValido(valor: string | null): ModoTema {
  return valor === 'claro' || valor === 'oscuro' || valor === 'sistema' ? valor : MODO_POR_DEFECTO;
}

interface TemaContextValue {
  modo: ModoTema;
  esquema: EsquemaColor;
  cambiarModo: (modo: ModoTema) => void;
}

const TemaContext = createContext<TemaContextValue | undefined>(undefined);

export function TemaProvider({ children }: { children: React.ReactNode }) {
  const delSistema = useColorScheme();
  const [modo, setModo] = useState<ModoTema>(MODO_POR_DEFECTO);

  // Recupera la elección guardada al abrir la app.
  useEffect(() => {
    AsyncStorage.getItem(CLAVE_MODO)
      .then((guardado) => setModo(modoGuardadoValido(guardado)))
      .catch(() => {});
  }, []);

  const esquema = resolverEsquema(modo, delSistema);

  // Se aplica DURANTE el render (no en un efecto), antes de que los hijos
  // armen sus estilos: así nunca hay un cuadro con la mitad de la pantalla
  // en un modo y la otra mitad en el otro. Es idempotente.
  useMemo(() => aplicarEsquema(esquema), [esquema]);

  const value = useMemo<TemaContextValue>(
    () => ({
      modo,
      esquema,
      cambiarModo: (nuevo) => {
        setModo(nuevo);
        AsyncStorage.setItem(CLAVE_MODO, nuevo).catch(() => {});
      },
    }),
    [modo, esquema],
  );

  return <TemaContext.Provider value={value}>{children}</TemaContext.Provider>;
}

export function useTema() {
  const ctx = useContext(TemaContext);
  if (!ctx) throw new Error('useTema debe usarse dentro de un <TemaProvider>');
  return ctx;
}
