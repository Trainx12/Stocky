import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { Button } from '../components/Button';
import { FECHA_TERMINOS, SECCIONES_TERMINOS, SERVICIOS_USADOS, SOFTWARE_USADO } from '../legal/terminos';
import type { RecursoUsado } from '../legal/terminos';
import { listarCreditos, resumenPorFuente, textoCredito } from '../legal/creditos';
import { avisar } from '../lib/alert';
import { guardarAceptacionLocal } from '../services/terminos';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';
import type { AppStackParamList, AuthStackParamList } from '../types/navigation';

/**
 * Términos y Condiciones (texto en src/legal/terminos.ts) + créditos al
 * final (servicios, software y las fotos del catálogo, desde
 * assets/catalogo/creditos.json). Tres modos:
 *   - 'previo': después del onboarding, antes del login. Hay que tildar
 *     "Leí y acepto" para seguir al Login.
 *   - 'aceptar': ya logueado pero sin haber aceptado la versión vigente
 *     (usuarios anteriores o versión nueva). Lo muestra RootNavigator en
 *     lugar de la app, hasta que se acepte.
 *   - 'ver': solo lectura, desde el enlace del Home.
 */
type Modo = 'previo' | 'aceptar' | 'ver';

interface TerminosVistaProps {
  modo: Modo;
  // Se llama al tocar "Aceptar y continuar" (modos previo/aceptar). Puede
  // ser async: mientras corre, el botón muestra el spinner.
  onAceptar?: () => Promise<void> | void;
  // Flecha para volver (modos previo/ver).
  onVolver?: () => void;
}

export function TerminosVista({ modo, onAceptar, onVolver }: TerminosVistaProps) {
  const styles = useEstilos(crearEstilos);
  const [tildado, setTildado] = useState(false);
  const [aceptando, setAceptando] = useState(false);
  // La lista de ~260 fotos va plegada: se despliega a pedido.
  const [fotosVisibles, setFotosVisibles] = useState(false);
  const creditos = useMemo(() => listarCreditos(), []);
  const resumen = useMemo(() => resumenPorFuente(creditos), [creditos]);
  const pideAceptar = modo !== 'ver';

  async function handleAceptar() {
    if (!onAceptar) return;
    setAceptando(true);
    try {
      await onAceptar();
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo registrar la aceptación. Probá de nuevo.');
    } finally {
      setAceptando(false);
    }
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        {onVolver && (
          <Pressable onPress={onVolver} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>
        )}
        <Text style={styles.title}>Términos y Condiciones</Text>
      </View>

      {modo === 'aceptar' && (
        <View style={styles.avisoActualizacion}>
          <Ionicons name="document-text-outline" size={18} color={colors.primaryDark} />
          <Text style={styles.avisoActualizacionTexto}>
            Actualizamos los términos. Para seguir usando Stocky, leelos y aceptalos.
          </Text>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContenido}>
        <Text style={styles.fecha}>Última actualización: {FECHA_TERMINOS}</Text>

        {SECCIONES_TERMINOS.map((seccion) => (
          <View key={seccion.titulo} style={styles.seccion}>
            <Text style={styles.seccionTitulo}>{seccion.titulo}</Text>
            {seccion.parrafos.map((parrafo, i) => (
              <Text key={i} style={styles.parrafo}>
                {parrafo}
              </Text>
            ))}
          </View>
        ))}

        {/* Al final: todo lo que usamos para hacer Stocky. */}
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>14. Créditos</Text>
          <Text style={styles.parrafo}>Stocky se construyó con estos servicios, software y contenidos de terceros.</Text>

          <Text style={styles.subtitulo}>Servicios</Text>
          {SERVICIOS_USADOS.map((r) => (
            <Recurso key={r.nombre} recurso={r} />
          ))}

          <Text style={styles.subtitulo}>Software de código abierto</Text>
          {SOFTWARE_USADO.map((r) => (
            <Recurso key={r.nombre} recurso={r} />
          ))}

          <Text style={styles.subtitulo}>Fotos del catálogo</Text>
          <Text style={styles.parrafo}>
            Las fotos de los productos del catálogo son de sus autores y se usan según sus licencias (Creative Commons,
            dominio público u otras indicadas en cada una). Algunas fueron recortadas o adaptadas a un formato cuadrado
            con fondo blanco. {resumen.map((r) => `${r.fuente}: ${r.cantidad}`).join(' · ')}.
          </Text>
          <Pressable
            onPress={() => setFotosVisibles((v) => !v)}
            style={styles.desplegar}
            accessibilityRole="button"
            accessibilityState={{ expanded: fotosVisibles }}
          >
            <Text style={styles.desplegarTexto}>
              {fotosVisibles ? 'Ocultar' : 'Ver'} los {creditos.length} créditos de fotos
            </Text>
            <Ionicons name={fotosVisibles ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
          </Pressable>
          {fotosVisibles &&
            creditos.map((c) => (
              <Pressable
                key={c.producto}
                onPress={c.url ? () => Linking.openURL(c.url) : undefined}
                disabled={!c.url}
                accessibilityRole={c.url ? 'link' : 'text'}
              >
                <Text style={[styles.credito, !!c.url && styles.creditoEnlace]}>{textoCredito(c)}</Text>
              </Pressable>
            ))}
        </View>
      </ScrollView>

      {pideAceptar && (
        <View style={styles.pie}>
          <Pressable
            onPress={() => setTildado((t) => !t)}
            style={styles.checkFila}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: tildado }}
          >
            <Ionicons name={tildado ? 'checkbox' : 'square-outline'} size={24} color={tildado ? colors.primary : colors.textSecondary} />
            <Text style={styles.checkTexto}>
              Leí y acepto los Términos y Condiciones, incluido el uso de la información y de lo que aporto a la app.
            </Text>
          </Pressable>
          <Button label="Aceptar y continuar" onPress={handleAceptar} disabled={!tildado} loading={aceptando} />
        </View>
      )}
    </ScreenContainer>
  );
}

// Un servicio o librería de "Créditos": nombre, detalle y enlace.
function Recurso({ recurso }: { recurso: RecursoUsado }) {
  const styles = useEstilos(crearEstilos);
  return (
    <Pressable onPress={() => Linking.openURL(recurso.url)} accessibilityRole="link" style={styles.recurso}>
      <Text style={styles.recursoNombre}>{recurso.nombre}</Text>
      <Text style={styles.recursoDetalle}>{recurso.detalle}</Text>
    </Pressable>
  );
}

// Antes del login (AuthStack): aceptar deja anotado en el celular y sigue al Login.
export function TerminosPrevioScreen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'Terminos'>) {
  return (
    <TerminosVista
      modo="previo"
      onVolver={() => navigation.goBack()}
      onAceptar={async () => {
        await guardarAceptacionLocal();
        navigation.navigate('Login');
      }}
    />
  );
}

// Solo lectura, ya logueado (AppStack, enlace desde Home).
export function TerminosVerScreen({ navigation }: NativeStackScreenProps<AppStackParamList, 'Terminos'>) {
  return <TerminosVista modo="ver" onVolver={() => navigation.goBack()} />;
}

const crearEstilos = () =>
  StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  avisoActualizacion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  avisoActualizacionTexto: {
    ...typography.caption,
    color: colors.primaryDark,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContenido: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  fecha: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  seccion: {
    gap: spacing.xs,
  },
  seccionTitulo: {
    ...typography.bodyMedium,
    color: colors.primaryDark,
  },
  subtitulo: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  parrafo: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  recurso: {
    paddingVertical: 2,
  },
  recursoNombre: {
    ...typography.caption,
    color: colors.primary,
  },
  recursoDetalle: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  desplegar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
  },
  desplegarTexto: {
    ...typography.caption,
    color: colors.primary,
  },
  credito: {
    ...typography.caption,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  creditoEnlace: {
    textDecorationLine: 'underline',
  },
  pie: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  checkFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkTexto: {
    ...typography.caption,
    color: colors.textPrimary,
    flex: 1,
  },
});
