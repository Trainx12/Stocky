import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { ProductoFormModal } from '../components/ProductoFormModal';
import { EscanearTicketModal } from '../components/EscanearTicketModal';
import { ComandoVozModal } from '../components/ComandoVozModal';
import {
  agruparProductos,
  ajustarCantidadProducto,
  categoriasEnUso,
  eliminarProducto,
  estadoVencimiento,
  etiquetaVencimiento,
  filtrarProductos,
  formatearFechaCorta,
  eliminarProductosAgotados,
  listarProductos,
  nombreConMarca,
  productosAgotadosLimpiables,
} from '../services/productos';
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
  const { hogarId, hogarNombre, abrirAgregar, abrirVoz } = route.params;

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  // null = "Todas" (sin filtrar por categoría).
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [productoEditando, setProductoEditando] = useState<Producto | null>(null);
  const [ticketVisible, setTicketVisible] = useState(false);
  // RF8: ABM por voz (ver ComandoVozModal).
  const [vozVisible, setVozVisible] = useState(false);
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
    else if (abrirVoz) setVozVisible(true);
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

  // Lo que se ve en la lista: las filas del mismo producto (distinta marca o
  // vencimiento) juntas bajo un solo nombre.
  const grupos = useMemo(() => agruparProductos(productosFiltrados), [productosFiltrados]);

  // Agotados sin stock mínimo: se pueden limpiar de una (los que tienen
  // mínimo se dejan, ese 0 es la señal de "hay que reponer").
  const agotados = useMemo(() => productosAgotadosLimpiables(productos), [productos]);

  async function handleLimpiarAgotados() {
    const confirmado = await confirmar(
      'Limpiar agotados',
      agotados.length === 1
        ? '¿Eliminar 1 producto agotado? Los que tienen stock mínimo no se tocan.'
        : `¿Eliminar ${agotados.length} productos agotados? Los que tienen stock mínimo no se tocan.`,
      'Eliminar',
    );
    if (!confirmado) return;

    try {
      await eliminarProductosAgotados(hogarId);
      await cargar();
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudieron limpiar los agotados.');
    }
  }

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
    const confirmado = await confirmar('Eliminar producto', `¿Seguro que querés eliminar "${nombreConMarca(producto)}"?`, 'Eliminar');
    if (!confirmado) return;

    try {
      await eliminarProducto(producto.id);
      await cargar();
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo eliminar el producto.');
    }
  }

  // "3 unidad · vence 07/10/2026": la fecha siempre a la vista, así dos lotes
  // del mismo producto se distinguen sin abrirlos.
  function detalleLote(producto: Producto): string {
    const vence = producto.fecha_vencimiento ? ` · vence ${formatearFechaCorta(producto.fecha_vencimiento)}` : '';
    return `${producto.cantidad} ${producto.unidad}${vence}`;
  }

  // RF2/RF3: badge de vencimiento (null = sin fecha, o alerta deshabilitada a
  // propósito -- ver estadoVencimiento).
  function renderBadgeVencimiento(producto: Producto) {
    const etiqueta = etiquetaVencimiento(producto);
    if (!etiqueta) return null;
    return (
      <View style={[styles.vencimientoBadge, estadoVencimiento(producto) === 'vencido' && styles.vencimientoBadgeVencido]}>
        <Text style={styles.vencimientoBadgeTexto}>{etiqueta}</Text>
      </View>
    );
  }

  // +/- rápido sin abrir el formulario completo (ver ajustarCantidadProducto
  // en services/productos.ts). El "-" se deshabilita en 0: no tiene sentido
  // restar más (el backend ya lo frena con greatest(...,0), esto solo evita
  // el toque de más).
  function renderStepper(producto: Producto) {
    const descripcion = nombreConMarca(producto);
    return (
      <View style={styles.stepperGrupo}>
        <Pressable
          onPress={() => handleAjustarCantidad(producto, -1)}
          disabled={ajustandoIds.has(producto.id) || producto.cantidad <= 0}
          style={styles.stepperButton}
          accessibilityRole="button"
          accessibilityLabel={`Restar 1 a ${descripcion}`}
        >
          <Ionicons name="remove-circle-outline" size={30} color={producto.cantidad <= 0 ? colors.border : colors.danger} />
        </Pressable>
        <Pressable
          onPress={() => handleAjustarCantidad(producto, 1)}
          disabled={ajustandoIds.has(producto.id)}
          style={styles.stepperButton}
          accessibilityRole="button"
          accessibilityLabel={`Sumar 1 a ${descripcion}`}
        >
          <Ionicons name="add-circle-outline" size={30} color={colors.success} />
        </Pressable>
      </View>
    );
  }

  function renderAcciones(producto: Producto) {
    const descripcion = nombreConMarca(producto);
    return (
      <View style={styles.productoAcciones}>
        <Pressable
          onPress={() => handleEditar(producto)}
          style={styles.accionButton}
          accessibilityRole="button"
          accessibilityLabel={`Editar ${descripcion}`}
        >
          <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          onPress={() => handleEliminar(producto)}
          style={styles.accionButton}
          accessibilityRole="button"
          accessibilityLabel={`Eliminar ${descripcion}`}
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </Pressable>
      </View>
    );
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
        <Pressable
          onPress={() => setVozVisible(true)}
          style={styles.escanearButton}
          accessibilityRole="button"
          accessibilityLabel="Cargar productos por voz"
        >
          <Ionicons name="mic-outline" size={22} color={colors.primary} />
        </Pressable>
        <Pressable
          onPress={() => setTicketVisible(true)}
          style={styles.escanearButton}
          accessibilityRole="button"
          accessibilityLabel="Escanear ticket de compra"
        >
          <Ionicons name="receipt-outline" size={22} color={colors.primary} />
        </Pressable>
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

      {agotados.length > 0 && (
        <Pressable onPress={handleLimpiarAgotados} style={styles.limpiarButton} accessibilityRole="button">
          <Ionicons name="trash-bin-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.limpiarTexto}>Limpiar agotados ({agotados.length})</Text>
        </Pressable>
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
          {grupos.map((grupo) =>
            grupo.lotes.length === 1 ? (
              <View key={grupo.clave} style={styles.productoRow}>
                <View style={styles.productoInfo}>
                  <Text style={styles.productoNombre} numberOfLines={1}>
                    {nombreConMarca(grupo.lotes[0])}
                  </Text>
                  <View style={styles.categoriaRow}>
                    {grupo.categoria ? <Text style={styles.productoCategoria}>{grupo.categoria}</Text> : <View />}
                    {renderStepper(grupo.lotes[0])}
                  </View>
                  <Text style={styles.productoDetalle}>{detalleLote(grupo.lotes[0])}</Text>
                  {renderBadgeVencimiento(grupo.lotes[0])}
                </View>
                {renderAcciones(grupo.lotes[0])}
              </View>
            ) : (
              // Mismo producto con distintas marcas o vencimientos: un solo
              // "Manzana" con el total, y adentro cada lote identificado por
              // marca y fecha (ver agruparProductos en services/productos.ts).
              <View key={grupo.clave} style={styles.grupo}>
                <View style={styles.grupoEncabezado}>
                  <View style={styles.productoInfo}>
                    <Text style={styles.productoNombre} numberOfLines={1}>
                      {grupo.nombre}
                    </Text>
                    <Text style={styles.productoCategoria}>
                      {[grupo.categoria, `${grupo.lotes.length} lotes`].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.grupoTotal}>
                    {grupo.cantidadTotal} {grupo.unidad}
                  </Text>
                </View>
                {grupo.lotes.map((lote) => (
                  <View key={lote.id} style={styles.loteRow}>
                    <View style={styles.productoInfo}>
                      <Text style={styles.loteMarca} numberOfLines={1}>
                        {lote.marca ?? 'Sin marca'}
                      </Text>
                      <Text style={styles.productoDetalle}>{detalleLote(lote)}</Text>
                      {renderBadgeVencimiento(lote)}
                    </View>
                    {renderStepper(lote)}
                    {renderAcciones(lote)}
                  </View>
                ))}
              </View>
            ),
          )}
        </ScrollView>
      )}

      {/* Voz arriba del "+": es la vía rápida para cargar varias cosas de una
          ("compré leche, huevos y pan") o cambiar vencimientos sin abrir el
          formulario. */}
      <Pressable
        style={[styles.fab, styles.fabVoz]}
        onPress={() => setVozVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Cargar productos por voz"
      >
        <Ionicons name="mic" size={24} color={colors.primary} />
      </Pressable>
      <Pressable style={styles.fab} onPress={handleAgregar} accessibilityRole="button" accessibilityLabel="Agregar producto">
        <Ionicons name="add" size={28} color={colors.white} />
      </Pressable>

      <ComandoVozModal
        visible={vozVisible}
        hogarId={hogarId}
        productos={productos}
        onClose={() => setVozVisible(false)}
        onSuccess={async (cantidad) => {
          setVozVisible(false);
          avisar('Listo', cantidad === 1 ? 'Se aplicó 1 cambio.' : `Se aplicaron ${cantidad} cambios.`);
          await cargar();
        }}
      />

      <EscanearTicketModal
        visible={ticketVisible}
        hogarId={hogarId}
        onClose={() => setTicketVisible(false)}
        onSuccess={async (cantidad) => {
          setTicketVisible(false);
          avisar('Productos agregados', cantidad === 1 ? 'Se agregó 1 producto del ticket.' : `Se agregaron ${cantidad} productos del ticket.`);
          await cargar();
        }}
      />

      <ProductoFormModal
        visible={formVisible}
        hogarId={hogarId}
        producto={productoEditando}
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
    flexGrow: 1,
  },
  limpiarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  limpiarTexto: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  escanearButton: {
    padding: spacing.xs,
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
  categoriaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productoCategoria: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  stepperGrupo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.lg,
  },
  stepperButton: {
    padding: spacing.xs,
  },
  // RF2/RF3: badge de "próximo a vencer"/"vencido". Usa colors.stockStatus
  // (ver src/theme/colors.ts) en vez de un color a mano, para no duplicar
  // los umbrales de color que ya definió el sistema de diseño.
  vencimientoBadge: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.stockStatus.critical,
  },
  vencimientoBadgeVencido: {
    backgroundColor: colors.stockStatus.expired,
  },
  vencimientoBadgeTexto: {
    ...typography.caption,
    color: colors.white,
    fontSize: 11,
  },
  // El producto que engloba a sus lotes va en un recuadro con borde suave,
  // para que se lea como una sola cosa separada del resto de la lista.
  grupo: {
    marginVertical: spacing.xs,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  grupoEncabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  grupoTotal: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  // Cada lote del grupo, con sangría y una barra a la izquierda para que se
  // lea como "parte de" el producto de arriba.
  loteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginLeft: spacing.sm,
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.primaryLight,
  },
  loteMarca: {
    ...typography.body,
    color: colors.textPrimary,
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
  fabVoz: {
    bottom: spacing.lg + 56 + spacing.md,
    width: 48,
    height: 48,
    borderRadius: 24,
    right: spacing.lg + 4,
    backgroundColor: colors.primaryLight,
  },
});
