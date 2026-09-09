import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { ProductoFormModal } from '../components/ProductoFormModal';
import { ajustarCantidadProducto, categoriasEnUso, eliminarProducto, filtrarProductos, listarProductos } from '../services/productos';
import type { Producto } from '../types/database';
import { avisar, confirmar } from '../lib/alert';
import { colors, radius, spacing, typography } from '../theme';
import type { AppStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'Productos'>;

/**
 * Listado + ABM de productos de UN hogar puntual (RF7). Búsqueda por
 * nombre y filtro por categoría son puramente client-side sobre la lista
 * ya cargada: a esta escala (docs/plan-de-testing.md habla de ~20-30
 * productos por hogar) no vale la pena ir a la base por cada letra
 * tipeada, y evita mostrar un loader en cada tecla.
 */
export function ProductosScreen({ route, navigation }: Props) {
  const { hogarId, hogarNombre, abrirAgregar } = route.params;

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  // null = "Todas" (sin filtrar por categoría).
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [productoEditando, setProductoEditando] = useState<Producto | null>(null);
  // Ids con un ajuste de +/- en vuelo (ver handleAjustarCantidad), para
  // deshabilitar sus botones mientras se resuelve y no disparar dos veces
  // el mismo delta con un doble toque.
  const [ajustandoIds, setAjustandoIds] = useState<Set<string>>(new Set());

  // Trae el inventario completo del hogar; se vuelve a llamar después de
  // crear/editar/eliminar un producto, en vez de actualizar el array a
  // mano, para que la pantalla siempre refleje lo que realmente quedó
  // guardado en la base (por ejemplo, si dos personas del mismo hogar
  // editan al mismo tiempo).
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      setProductos(await listarProductos(hogarId));
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudieron cargar los productos.');
    } finally {
      setLoading(false);
    }
  }, [hogarId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El acceso rápido "Agregar producto" de HomeScreen navega acá con
  // abrirAgregar: true para no obligar a un segundo toque sobre el FAB --
  // solo al montar (no en cada render) para no reabrir el modal si se lo
  // cierra sin guardar y la pantalla vuelve a renderizar por otro motivo.
  useEffect(() => {
    if (abrirAgregar) handleAgregar();
  }, []);

  // Categorías realmente en uso en ESTE hogar (no una lista fija): se
  // recalculan a partir de los productos cargados, así que un chip solo
  // aparece si hay al menos un producto con esa categoría. Lógica extraída
  // a productos.ts (categoriasEnUso) para poder testearla con Jest.
  const categorias = useMemo(() => categoriasEnUso(productos), [productos]);

  // Búsqueda + filtro por categoría, también extraídos a productos.ts
  // (filtrarProductos) por el mismo motivo.
  const productosFiltrados = useMemo(
    () => filtrarProductos(productos, busqueda, categoriaSeleccionada),
    [productos, busqueda, categoriaSeleccionada],
  );

  function handleAgregar() {
    setProductoEditando(null);
    setFormVisible(true);
  }

  function handleEditar(producto: Producto) {
    setProductoEditando(producto);
    setFormVisible(true);
  }

  async function handleFormSuccess() {
    setFormVisible(false);
    setProductoEditando(null);
    await cargar();
  }

  // +/- rápido de a una unidad, sin abrir el formulario de editar.
  // Actualiza el estado local al toque (optimista) y revierte si la RPC
  // falla, mismo patrón que el switch de "puede editar" en
  // HogarMiembrosModal -- se siente inmediato sin esperar el roundtrip.
  async function handleAjustarCantidad(producto: Producto, delta: number) {
    if (ajustandoIds.has(producto.id)) return;
    setAjustandoIds((actuales) => new Set(actuales).add(producto.id));

    const cantidadAnterior = producto.cantidad;
    setProductos((actuales) =>
      actuales.map((p) => (p.id === producto.id ? { ...p, cantidad: Math.max(p.cantidad + delta, 0) } : p)),
    );

    try {
      const actualizado = await ajustarCantidadProducto(producto.id, delta);
      setProductos((actuales) => actuales.map((p) => (p.id === producto.id ? actualizado : p)));
    } catch (err) {
      setProductos((actuales) => actuales.map((p) => (p.id === producto.id ? { ...p, cantidad: cantidadAnterior } : p)));
      avisar('Error', err instanceof Error ? err.message : 'No se pudo actualizar la cantidad.');
    } finally {
      setAjustandoIds((actuales) => {
        const siguientes = new Set(actuales);
        siguientes.delete(producto.id);
        return siguientes;
      });
    }
  }

  // Eliminar es destructivo, no se dispara sin confirmar antes (mismo
  // criterio que salir de un hogar / expulsar un miembro): usa
  // confirmar()/avisar() de src/lib/alert.ts en vez de Alert.alert directo,
  // que en react-native-web es un no-op (ver docs/incidentes-sprint3.md).
  async function handleEliminar(producto: Producto) {
    const confirmado = await confirmar('Eliminar producto', `¿Seguro que querés eliminar "${producto.nombre}"?`, 'Eliminar');
    if (!confirmado) return;

    try {
      await eliminarProducto(producto.id);
      await cargar();
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo eliminar el producto.');
    }
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {hogarNombre}
        </Text>
      </View>

      <TextInput
        style={styles.buscador}
        placeholder="Buscar producto..."
        placeholderTextColor={colors.textSecondary}
        value={busqueda}
        onChangeText={setBusqueda}
        autoCapitalize="none"
      />

      {categorias.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriasScroll} contentContainerStyle={styles.categoriasRow}>
          <Pressable
            onPress={() => setCategoriaSeleccionada(null)}
            style={[styles.chip, categoriaSeleccionada === null && styles.chipSeleccionado]}
          >
            <Text style={[styles.chipTexto, categoriaSeleccionada === null && styles.chipTextoSeleccionado]}>Todas</Text>
          </Pressable>
          {categorias.map((categoria) => (
            <Pressable
              key={categoria}
              onPress={() => setCategoriaSeleccionada(categoria)}
              style={[styles.chip, categoriaSeleccionada === categoria && styles.chipSeleccionado]}
            >
              <Text style={[styles.chipTexto, categoriaSeleccionada === categoria && styles.chipTextoSeleccionado]}>
                {categoria}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : productosFiltrados.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="basket-outline" size={32} color={colors.textSecondary} />
          <Text style={styles.emptyText}>
            {productos.length === 0 ? 'Todavía no hay productos en este hogar.' : 'Ningún producto coincide con la búsqueda.'}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.lista} showsVerticalScrollIndicator={false}>
          {productosFiltrados.map((producto) => (
            <View key={producto.id} style={styles.productoRow}>
              <View style={styles.productoInfo}>
                <Text style={styles.productoNombre} numberOfLines={1}>
                  {producto.nombre}
                </Text>
                <View style={styles.cantidadRow}>
                  <Text style={styles.productoDetalle}>
                    {producto.cantidad} {producto.unidad}
                    {producto.categoria ? ` · ${producto.categoria}` : ''}
                  </Text>
                  {/* +/- rápido sin abrir el formulario completo (ver
                      ajustarCantidadProducto en services/productos.ts),
                      los dos juntos a la derecha. El "-" se deshabilita en
                      0: no tiene sentido restar más (el backend ya lo frena
                      con greatest(...,0), esto solo evita el toque de más). */}
                  <View style={styles.stepperGrupo}>
                    <Pressable
                      onPress={() => handleAjustarCantidad(producto, -1)}
                      disabled={ajustandoIds.has(producto.id) || producto.cantidad <= 0}
                      style={styles.stepperButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Restar 1 a ${producto.nombre}`}
                    >
                      <Ionicons
                        name="remove-circle-outline"
                        size={30}
                        color={producto.cantidad <= 0 ? colors.border : colors.danger}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => handleAjustarCantidad(producto, 1)}
                      disabled={ajustandoIds.has(producto.id)}
                      style={styles.stepperButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Sumar 1 a ${producto.nombre}`}
                    >
                      <Ionicons name="add-circle-outline" size={30} color={colors.success} />
                    </Pressable>
                  </View>
                </View>
              </View>
              <View style={styles.productoAcciones}>
                <Pressable
                  onPress={() => handleEditar(producto)}
                  style={styles.accionButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar ${producto.nombre}`}
                >
                  <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                </Pressable>
                <Pressable
                  onPress={() => handleEliminar(producto)}
                  style={styles.accionButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Eliminar ${producto.nombre}`}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Pressable style={styles.fab} onPress={handleAgregar} accessibilityRole="button" accessibilityLabel="Agregar producto">
        <Ionicons name="add" size={28} color={colors.white} />
      </Pressable>

      <ProductoFormModal
        visible={formVisible}
        hogarId={hogarId}
        producto={productoEditando}
        categoriasExistentes={categorias}
        onClose={() => {
          setFormVisible(false);
          setProductoEditando(null);
        }}
        onSuccess={handleFormSuccess}
      />
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
  categoriasScroll: {
    flexGrow: 0,
  },
  categoriasRow: {
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
  productoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  productoInfo: {
    flexShrink: 1,
    gap: 2,
  },
  productoNombre: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  productoDetalle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cantidadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  stepperGrupo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperButton: {
    padding: spacing.xs,
  },
  productoAcciones: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  accionButton: {
    padding: spacing.xs,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
});
