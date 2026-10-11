import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { cambiarHabilitado, cambiarRol, filtrarUsuarios, listarUsuarios } from '../services/usuarios';
import type { FiltroUsuarios, UsuarioAdmin } from '../services/usuarios';
import { avisar, confirmar } from '../lib/alert';
import { colors, radius, spacing, typography } from '../theme';
import type { AppStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'AdminUsuarios'>;

const FILTROS: { valor: FiltroUsuarios; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'administradores', etiqueta: 'Administradores' },
  { valor: 'deshabilitados', etiqueta: 'Deshabilitados' },
];

/**
 * ABM de usuarios para administradores (RF9 parcial): lista todas las
 * cuentas de la plataforma, con búsqueda y filtro, y permite habilitar/
 * deshabilitar cada una y cambiarle el rol. Mismo gateo que
 * AdminSugerenciasScreen: HomeScreen solo muestra el acceso a admins, y la
 * barrera real está en las RPCs (un usuario común que fuerce la navegación
 * recibe un error al cargar). Sobre la propia cuenta no se ofrece ninguna
 * acción: las RPCs tampoco dejan deshabilitarse ni quitarse el rol a uno
 * mismo.
 */
export function AdminUsuariosScreen({ navigation }: Props) {
  const { usuario } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroUsuarios>('todos');
  // ids con un cambio en vuelo, para deshabilitar sus controles y no
  // disparar dos veces el mismo cambio con un doble toque.
  const [cambiandoIds, setCambiandoIds] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      setUsuarios(await listarUsuarios());
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(() => filtrarUsuarios(usuarios, busqueda, filtro), [usuarios, busqueda, filtro]);

  // Aplica un cambio sobre un usuario: marca el id como "en vuelo", llama a
  // la RPC y reemplaza la fila local con lo que quedó guardado. Si falla, la
  // fila queda como estaba (no hay actualización optimista que revertir).
  async function aplicarCambio(objetivo: UsuarioAdmin, accion: () => Promise<{ rol: UsuarioAdmin['rol']; habilitado: boolean }>) {
    setCambiandoIds((actuales) => new Set(actuales).add(objetivo.id));
    try {
      const guardado = await accion();
      setUsuarios((actuales) =>
        actuales.map((u) => (u.id === objetivo.id ? { ...u, rol: guardado.rol, habilitado: guardado.habilitado } : u)),
      );
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo guardar el cambio.');
    } finally {
      setCambiandoIds((actuales) => {
        const siguientes = new Set(actuales);
        siguientes.delete(objetivo.id);
        return siguientes;
      });
    }
  }

  // Deshabilitar corta el acceso en el momento, por eso se confirma antes;
  // volver a habilitar no tiene riesgo y va directo.
  async function handleHabilitado(objetivo: UsuarioAdmin, habilitar: boolean) {
    if (!habilitar) {
      const confirmado = await confirmar(
        'Deshabilitar usuario',
        `¿Deshabilitar a ${objetivo.nombre ?? objetivo.email}? No va a poder usar la app hasta que lo vuelvas a habilitar. No se borra ninguno de sus datos.`,
        'Deshabilitar',
      );
      if (!confirmado) return;
    }
    await aplicarCambio(objetivo, () => cambiarHabilitado(objetivo.id, habilitar));
  }

  async function handleRol(objetivo: UsuarioAdmin) {
    const nuevoRol = objetivo.rol === 'administrador' ? 'usuario' : 'administrador';
    const confirmado = await confirmar(
      nuevoRol === 'administrador' ? 'Hacer administrador' : 'Quitar administrador',
      nuevoRol === 'administrador'
        ? `${objetivo.nombre ?? objetivo.email} va a poder ver y modificar los datos de todos los usuarios y hogares.`
        : `${objetivo.nombre ?? objetivo.email} va a pasar a ser un usuario común.`,
      'Confirmar',
    );
    if (!confirmado) return;
    await aplicarCambio(objetivo, () => cambiarRol(objetivo.id, nuevoRol));
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Usuarios</Text>
      </View>

      <TextInput
        style={styles.buscador}
        placeholder="Buscar por nombre o email..."
        placeholderTextColor={colors.textSecondary}
        value={busqueda}
        onChangeText={setBusqueda}
        autoCapitalize="none"
      />

      <View style={styles.filtrosRow}>
        {FILTROS.map(({ valor, etiqueta }) => (
          <Pressable key={valor} onPress={() => setFiltro(valor)} style={[styles.chip, filtro === valor && styles.chipSeleccionado]}>
            <Text style={[styles.chipTexto, filtro === valor && styles.chipTextoSeleccionado]}>{etiqueta}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : visibles.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={32} color={colors.textSecondary} />
          <Text style={styles.emptyText}>
            {usuarios.length === 0 ? 'No se pudieron cargar los usuarios.' : 'Ningún usuario coincide con la búsqueda.'}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.lista} showsVerticalScrollIndicator={false}>
          {visibles.map((u) => {
            const soyYo = u.id === usuario?.id;
            const cambiando = cambiandoIds.has(u.id);
            return (
              <View key={u.id} style={[styles.fila, !u.habilitado && styles.filaDeshabilitada]}>
                <View style={styles.filaTextos}>
                  <Text style={styles.filaNombre} numberOfLines={1}>
                    {u.nombre ?? 'Sin nombre'}
                    {soyYo ? ' (vos)' : ''}
                  </Text>
                  <Text style={styles.filaDetalle} numberOfLines={1}>
                    {u.email}
                  </Text>
                  <View style={styles.etiquetasRow}>
                    {u.rol === 'administrador' && (
                      <View style={[styles.etiqueta, styles.etiquetaAdmin]}>
                        <Text style={styles.etiquetaAdminTexto}>Admin</Text>
                      </View>
                    )}
                    {!u.habilitado && (
                      <View style={[styles.etiqueta, styles.etiquetaDeshabilitado]}>
                        <Text style={styles.etiquetaDeshabilitadoTexto}>Deshabilitado</Text>
                      </View>
                    )}
                    <Text style={styles.filaDetalle}>
                      {u.cantidadHogares === 1 ? '1 hogar' : `${u.cantidadHogares} hogares`}
                    </Text>
                  </View>
                </View>

                {/* Sin acciones sobre la propia cuenta (ver comentario de la pantalla). */}
                {!soyYo && (
                  <View style={styles.filaAcciones}>
                    <Pressable
                      onPress={() => handleRol(u)}
                      disabled={cambiando}
                      style={styles.accionButton}
                      accessibilityRole="button"
                      accessibilityLabel={
                        u.rol === 'administrador' ? `Quitar administrador a ${u.email}` : `Hacer administrador a ${u.email}`
                      }
                    >
                      <Ionicons
                        name={u.rol === 'administrador' ? 'shield' : 'shield-outline'}
                        size={22}
                        color={colors.primary}
                      />
                    </Pressable>
                    <Switch
                      value={u.habilitado}
                      onValueChange={(valor) => handleHabilitado(u, valor)}
                      disabled={cambiando}
                      trackColor={{ true: colors.success, false: colors.border }}
                      accessibilityLabel={u.habilitado ? `Deshabilitar a ${u.email}` : `Habilitar a ${u.email}`}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
  buscador: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  filtrosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipSeleccionado: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipTexto: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipTextoSeleccionado: {
    color: colors.white,
  },
  loader: {
    marginTop: spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  lista: {
    flex: 1,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // Una cuenta deshabilitada se ve "apagada" para distinguirla de un vistazo.
  filaDeshabilitada: {
    opacity: 0.6,
  },
  filaTextos: {
    flex: 1,
    gap: 2,
  },
  filaNombre: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  filaDetalle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  etiquetasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  etiqueta: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  etiquetaAdmin: {
    backgroundColor: colors.primaryLight,
  },
  etiquetaAdminTexto: {
    ...typography.caption,
    fontSize: 10,
    lineHeight: 14,
    color: colors.primaryDark,
  },
  etiquetaDeshabilitado: {
    backgroundColor: colors.dangerLight,
  },
  etiquetaDeshabilitadoTexto: {
    ...typography.caption,
    fontSize: 10,
    lineHeight: 14,
    color: colors.danger,
  },
  filaAcciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accionButton: {
    padding: spacing.xs,
  },
});
