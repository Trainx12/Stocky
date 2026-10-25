import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BadgeVencimiento } from '../components/BadgeVencimiento';
import { Button } from '../components/Button';
import { EsqueletoLista } from '../components/Esqueleto';
import { ScreenContainer } from '../components/ScreenContainer';
import { ProductoFormModal } from '../components/ProductoFormModal';
import { EscanearTicketModal } from '../components/EscanearTicketModal';
import { ComandoVozModal } from '../components/ComandoVozModal';
import {
  agruparProductos,
  ajustarCantidadProducto,
  categoriasEnUso,
  eliminarProducto,
  estadoStockDeGrupo,
  estadoVencimiento,
  etiquetaStock,
  etiquetaVencimiento,
  filtrarProductos,
  formatearFechaCorta,
  eliminarProductosAgotados,
  eliminarProductosVencidos,
  listarProductos,
  nombreConMarca,
  productosAgotadosLimpiables,
  productosProximosAVencer,
  productosVencidos,
  restaurarProductos,
  productosConVencimiento,
  stockMinimoDelGrupo,
} from '../services/productos';
import type { EstadoStock } from '../services/productos';
import type { Producto } from '../types/database';
import { avisar, avisarConAccion, confirmar } from '../lib/alert';
import { vibrarToque } from '../lib/vibrar';
import { supabase } from '../lib/supabase';
import { afectaBorrado, agruparLlamadas, nombreDeCanal } from '../lib/tiempoReal';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';
import type { AppStackParamList, FiltroAlerta } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'Productos'>;

/**
 * Listado + ABM de productos de UN hogar puntual (RF7). Búsqueda por
 * nombre y filtro por categoría son puramente client-side sobre la lista
 * ya cargada: a esta escala (docs/plan-de-testing.md habla de ~20-30
 * productos por hogar) no vale la pena ir a la base por cada letra
 * tipeada, y evita mostrar un loader en cada tecla.
 */
export function ProductosScreen({ route, navigation }: Props) {
  const styles = useEstilos(crearEstilos);
  const { hogarId, hogarNombre, abrirAgregar, abrirVoz, abrirTicket, enfocarBusqueda, filtroInicial } = route.params;

  const [productos, setProductos] = useState<Producto[]>([]);
  // Preferencia general "avisarme X días antes" (cada producto puede pisarla
  // con la suya): define cuándo un lote muestra el badge "Vence en N días".
  const { usuario } = useAuth();
  const diasAviso = usuario?.dias_aviso_vencimiento;
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  // null = "Todas" (sin filtrar por categoría).
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null);
  // Filtro de alertas (null = sin filtro): "Por vencer" deja todos los lotes
  // con fecha de vencimiento, en el orden en que vencen; "Stock bajo", solo los
  // productos por debajo de su mínimo. Se combina con búsqueda y categoría.
  const [filtroAlerta, setFiltroAlerta] = useState<FiltroAlerta | null>(filtroInicial ?? null);
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
  // `silencioso`: recarga sin el spinner ni avisos de error (cuando la pide
  // un cambio de otra persona por Realtime: la lista se actualiza sola, sin
  // parpadear ni interrumpir lo que el usuario está haciendo).
  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setLoading(true);
      try {
        setProductos(await listarProductos(hogarId));
      } catch (err) {
        if (silencioso) console.warn('[Stocky] No se pudo recargar la despensa:', err);
        else avisar('Error', err instanceof Error ? err.message : 'No se pudieron cargar los productos.');
      } finally {
        if (!silencioso) setLoading(false);
      }
    },
    [hogarId],
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Tiempo real: si otra persona del hogar agrega, cambia o borra un
  // producto, la lista se actualiza sola en este celular (antes había que
  // salir y volver a entrar). Necesita `productos` en la publicación de
  // Realtime (migración 20261016120000_realtime_productos_y_actividad.sql).
  // Los avisos seguidos (por ejemplo, un ticket de 10 productos) se agrupan
  // en una sola recarga. Los propios cambios también llegan: recargar de
  // nuevo es inofensivo y deja la lista igual a la base.
  const idsEnPantalla = useRef<string[]>([]);
  idsEnPantalla.current = productos.map((p) => p.id);
  useEffect(() => {
    const recarga = agruparLlamadas(() => cargar(true));
    const canal = supabase
      .channel(nombreDeCanal(`productos-${hogarId}`))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'productos', filter: `hogar_id=eq.${hogarId}` },
        () => recarga.disparar(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'productos', filter: `hogar_id=eq.${hogarId}` },
        () => recarga.disparar(),
      )
      // Los DELETE no se pueden filtrar por hogar (solo traen el id): se
      // recarga si el borrado estaba en esta lista.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'productos' }, (payload) => {
        if (afectaBorrado((payload.old as { id?: unknown }).id, idsEnPantalla.current)) recarga.disparar();
      })
      .subscribe();
    return () => {
      recarga.cancelar();
      supabase.removeChannel(canal);
    };
  }, [hogarId, cargar]);

  // Llegando desde la lupa, el buscador se enfoca RECIÉN cuando terminó la
  // animación de entrada de la pantalla. Enfocarlo durante la animación
  // (como hacía `autoFocus`) hacía que Safari en iPhone desplazara la página
  // para mostrar el teclado y dejara la pantalla gris (incidentes-sprint10.md #17).
  const buscadorRef = useRef<TextInput>(null);
  useEffect(() => {
    if (!enfocarBusqueda) return;
    const timer = setTimeout(() => buscadorRef.current?.focus(), 450);
    return () => clearTimeout(timer);
  }, [enfocarBusqueda]);

  // El acceso rápido "Agregar producto" de HomeScreen navega acá con
  // abrirAgregar: true para no obligar a un segundo toque sobre el FAB --
  // solo al montar (no en cada render) para no reabrir el modal si se lo
  // cierra sin guardar y la pantalla vuelve a renderizar por otro motivo.
  useEffect(() => {
    if (abrirAgregar) handleAgregar();
    else if (abrirVoz) setVozVisible(true);
    else if (abrirTicket) setTicketVisible(true);
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

  // Stock de cada producto calculado sobre el inventario COMPLETO (no sobre
  // lo filtrado): buscar "leche" o filtrar "Por vencer" no puede cambiar si a
  // la leche le falta stock. Clave = la misma de agruparProductos.
  const stockPorProducto = useMemo(() => {
    const mapa = new Map<string, { estado: EstadoStock; minimo: number }>();
    for (const grupo of agruparProductos(productos)) {
      const estado = estadoStockDeGrupo(grupo);
      if (estado) mapa.set(grupo.clave, { estado, minimo: stockMinimoDelGrupo(grupo) });
    }
    return mapa;
  }, [productos]);

  // Cuántos hay de cada alerta, para el texto de los chips.
  // El número del filtro "Por vencer" cuenta solo lo urgente (amarillo y
  // rojo del semáforo). Antes contaba todo lo que tenía fecha, aunque
  // venciera en un año, y parecía que había muchas cosas por vencer. La lista
  // del filtro sigue mostrando todo lo que tiene fecha, lo urgente primero.
  const cantidadPorVencer = useMemo(
    () => productosProximosAVencer(productos, undefined, diasAviso).length,
    [productos, diasAviso],
  );

  // Lo que se ve en la lista: las filas del mismo producto (distinta marca o
  // vencimiento) juntas bajo un solo nombre. Con "Por vencer", se agrupan
  // solo los lotes con fecha y en orden de fecha (agruparProductos respeta el
  // orden de entrada, así el producto que vence antes queda primero; los
  // lotes sin fecha de ese mismo producto no se muestran).
  const grupos = useMemo(() => {
    if (filtroAlerta === 'porVencer') return agruparProductos(productosConVencimiento(productosFiltrados));
    const todos = agruparProductos(productosFiltrados);
    return filtroAlerta === 'stockBajo' ? todos.filter((g) => stockPorProducto.has(g.clave)) : todos;
  }, [productosFiltrados, filtroAlerta, stockPorProducto]);

  // Después de borrar, un cartelito con "Deshacer" (unos segundos) que
  // vuelve a cargar exactamente lo que se borró.
  function ofrecerDeshacer(borrados: Producto[], mensaje: string) {
    if (borrados.length === 0) return;
    avisarConAccion('Listo', mensaje, {
      etiqueta: 'Deshacer',
      alTocar: async () => {
        try {
          await restaurarProductos(borrados);
          await cargar();
          avisar('Listo', borrados.length === 1 ? 'Se recuperó el producto.' : `Se recuperaron ${borrados.length} productos.`, 'exito');
        } catch (err) {
          avisar('Error', err instanceof Error ? err.message : 'No se pudo deshacer.');
        }
      },
    });
  }

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
      const borrados = await eliminarProductosAgotados(hogarId);
      await cargar();
      ofrecerDeshacer(borrados, borrados.length === 1 ? 'Se eliminó 1 producto agotado.' : `Se eliminaron ${borrados.length} productos agotados.`);
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudieron limpiar los agotados.');
    }
  }

  // Vencidos: con el filtro "Por vencer" se pueden borrar todos de una.
  const vencidos = useMemo(() => productosVencidos(productos), [productos]);
  const [borrandoVencidos, setBorrandoVencidos] = useState(false);

  async function handleEliminarVencidos() {
    const confirmado = await confirmar(
      'Eliminar vencidos',
      vencidos.length === 1
        ? '¿Eliminar del hogar 1 producto vencido? No se puede deshacer.'
        : `¿Eliminar del hogar los ${vencidos.length} productos vencidos? No se puede deshacer.`,
      'Eliminar',
    );
    if (!confirmado) return;

    setBorrandoVencidos(true);
    try {
      const borrados = await eliminarProductosVencidos(hogarId);
      await cargar();
      ofrecerDeshacer(borrados, borrados.length === 1 ? 'Se eliminó 1 producto vencido.' : `Se eliminaron ${borrados.length} productos vencidos.`);
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudieron eliminar los vencidos.');
    } finally {
      setBorrandoVencidos(false);
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
    vibrarToque();
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
      ofrecerDeshacer([producto], `Se eliminó "${nombreConMarca(producto)}".`);
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
    const etiqueta = etiquetaVencimiento(producto, undefined, diasAviso);
    const estado = estadoVencimiento(producto, undefined, diasAviso);
    if (!etiqueta || !estado) return null;
    return <BadgeVencimiento estado={estado} etiqueta={etiqueta} style={styles.vencimientoBadge} />;
  }

  // Alerta de stock mínimo: va en el encabezado del producto (no en cada
  // lote) porque se calcula sobre el total. Violeta con un changuito,
  // distinto del semáforo de vencimiento, para que no se confundan.
  function renderBadgeStock(clave: string) {
    const stock = stockPorProducto.get(clave);
    const etiqueta = stock ? etiquetaStock(stock.estado, stock.minimo) : null;
    if (!etiqueta) return null;
    return (
      <View style={styles.stockBadge}>
        <Ionicons name="cart-outline" size={12} color={colors.primaryDark} />
        <Text style={styles.stockBadgeTexto} numberOfLines={1}>
          {etiqueta}
        </Text>
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
          <Ionicons name="remove-circle-outline" size={26} color={producto.cantidad <= 0 ? colors.border : colors.danger} />
        </Pressable>
        <Pressable
          onPress={() => handleAjustarCantidad(producto, 1)}
          disabled={ajustandoIds.has(producto.id)}
          style={styles.stepperButton}
          accessibilityRole="button"
          accessibilityLabel={`Sumar 1 a ${descripcion}`}
        >
          <Ionicons name="add-circle-outline" size={26} color={colors.success} />
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
          <Ionicons name="pencil-outline" size={16} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          onPress={() => handleEliminar(producto)}
          style={styles.accionButton}
          accessibilityRole="button"
          accessibilityLabel={`Eliminar ${descripcion}`}
        >
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
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
        // Llegando desde la lupa, se enfoca después de la animación (ver buscadorRef).
        ref={buscadorRef}
        autoCapitalize="none"
      />

      {/* Filtros de alerta: tocar uno lo activa, tocarlo de nuevo lo saca.
          Cada uno con el color de su alerta (vencimiento = coral, stock =
          ámbar) para que no se confundan entre sí. */}
      <View style={styles.alertasRow}>
        <Pressable
          onPress={() => setFiltroAlerta((actual) => (actual === 'porVencer' ? null : 'porVencer'))}
          style={[styles.chip, filtroAlerta === 'porVencer' && styles.chipPorVencer]}
          accessibilityRole="button"
          accessibilityState={{ selected: filtroAlerta === 'porVencer' }}
        >
          <Text style={[styles.chipTexto, filtroAlerta === 'porVencer' && styles.chipTextoSeleccionado]}>
            Por vencer ({cantidadPorVencer})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setFiltroAlerta((actual) => (actual === 'stockBajo' ? null : 'stockBajo'))}
          style={[styles.chip, filtroAlerta === 'stockBajo' && styles.chipStockBajo]}
          accessibilityRole="button"
          accessibilityState={{ selected: filtroAlerta === 'stockBajo' }}
        >
          <Text style={[styles.chipTexto, filtroAlerta === 'stockBajo' && styles.chipTextoStockBajo]}>
            Stock bajo ({stockPorProducto.size})
          </Text>
        </Pressable>
      </View>

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

      {filtroAlerta === 'porVencer' && vencidos.length > 0 && (
        <Pressable
          onPress={handleEliminarVencidos}
          disabled={borrandoVencidos}
          style={styles.eliminarVencidosButton}
          accessibilityRole="button"
          accessibilityLabel={`Eliminar del hogar los ${vencidos.length} productos vencidos`}
        >
          {borrandoVencidos ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="trash-outline" size={16} color={colors.white} />
          )}
          <Text style={styles.eliminarVencidosTexto}>Eliminar vencidos ({vencidos.length})</Text>
        </Pressable>
      )}

      {agotados.length > 0 && (
        <Pressable onPress={handleLimpiarAgotados} style={styles.limpiarButton} accessibilityRole="button">
          <Ionicons name="trash-bin-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.limpiarTexto}>Limpiar agotados ({agotados.length})</Text>
        </Pressable>
      )}

      {loading ? (
        <View style={styles.loader}>
          <EsqueletoLista filas={5} conFoto />
        </View>
      ) : grupos.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="basket-outline" size={32} color={colors.textSecondary} />
          <Text style={styles.emptyText}>
            {productos.length === 0
              ? 'Todavía no hay productos en este hogar.'
              : filtroAlerta === 'porVencer'
                ? 'Ningún producto tiene fecha de vencimiento cargada.'
                : filtroAlerta === 'stockBajo'
                  ? 'Ningún producto está por debajo de su stock mínimo.'
                  : 'Ningún producto coincide con la búsqueda.'}
          </Text>
          {/* Hogar vacío: las tres formas de empezar, ahí mismo. */}
          {productos.length === 0 && (
            <View style={styles.vacioAcciones}>
              <Button label="Agregar producto" onPress={handleAgregar} />
              <View style={styles.vacioFila}>
                <Pressable onPress={() => setTicketVisible(true)} style={styles.vacioBoton} accessibilityRole="button">
                  <Ionicons name="receipt-outline" size={20} color={colors.primary} />
                  <Text style={styles.vacioBotonTexto}>Escanear ticket</Text>
                </Pressable>
                <Pressable onPress={() => setVozVisible(true)} style={styles.vacioBoton} accessibilityRole="button">
                  <Ionicons name="mic-outline" size={20} color={colors.primary} />
                  <Text style={styles.vacioBotonTexto}>Cargar por voz</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      ) : (
        <ScrollView style={styles.lista} showsVerticalScrollIndicator={false}>
          {/* Todos los productos con el mismo formato: arriba el producto con
              su total, abajo cada lote (marca y vencimiento). Con varios lotes
              queda un solo "Manzana" en vez de filas sueltas (ver
              agruparProductos en services/productos.ts). */}
          {grupos.map((grupo) => (
            <View key={grupo.clave} style={styles.grupo}>
              <View style={styles.grupoEncabezado}>
                <View style={styles.productoInfo}>
                  <Text style={styles.grupoNombre} numberOfLines={1}>
                    {grupo.nombre}
                  </Text>
                  {(grupo.categoria || grupo.lotes.length > 1) && (
                    <Text style={styles.grupoDetalle}>
                      {[grupo.categoria, grupo.lotes.length > 1 ? `${grupo.lotes.length} lotes` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  )}
                </View>
                <View style={styles.grupoDerecha}>
                  <Text style={styles.grupoTotal}>
                    {grupo.cantidadTotal} {grupo.unidad}
                  </Text>
                  {renderBadgeStock(grupo.clave)}
                </View>
              </View>
              {grupo.lotes.map((lote, indice) => (
                <View key={lote.id} style={[styles.loteRow, indice > 0 && styles.loteSeparado]}>
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
          ))}
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
  // Rojo, como el semáforo de "vencido".
  eliminarVencidosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
  eliminarVencidosTexto: {
    ...typography.caption,
    color: colors.white,
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
    marginTop: spacing.sm,
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
  vacioAcciones: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  vacioFila: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  vacioBoton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  vacioBotonTexto: {
    ...typography.caption,
    color: colors.primary,
  },
  lista: {
    flex: 1,
  },
  productoInfo: {
    flex: 1,
    gap: 2,
  },
  productoDetalle: {
    ...typography.caption,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  // Botones compactos: en un celular angosto tienen que entrar al lado del
  // texto del lote sin partirlo en varias líneas.
  stepperGrupo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperButton: {
    padding: 2,
  },
  // RF2/RF3: badge de vencimiento en colores de semáforo (BadgeVencimiento).
  vencimientoBadge: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  // Cada producto es una tarjeta con el borde violeta de la app: arriba una
  // franja violeta clara con el producto y su total, abajo sus lotes.
  grupo: {
    marginVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  grupoEncabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
  },
  grupoNombre: {
    ...typography.bodyMedium,
    color: colors.primaryDark,
  },
  grupoDetalle: {
    ...typography.caption,
    color: colors.primaryDark,
  },
  grupoDerecha: {
    alignItems: 'flex-end',
    gap: 2,
  },
  // Alerta de stock bajo: violeta claro con borde violeta y un changuito,
  // para no confundirla con el amarillo de "por vencer" del semáforo.
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  stockBadgeTexto: {
    ...typography.caption,
    color: colors.primaryDark,
    fontSize: 10,
    lineHeight: 14,
  },
  alertasRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chipPorVencer: {
    backgroundColor: colors.stockStatus.critical,
    borderColor: colors.stockStatus.critical,
  },
  // Stock bajo en violeta (con un changuito), separado del semáforo de
  // vencimientos: antes era ámbar y se confundía con "por vencer".
  chipStockBajo: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipTextoStockBajo: {
    color: colors.white,
  },
  grupoTotal: {
    ...typography.bodyMedium,
    color: colors.primaryDark,
  },
  loteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  loteSeparado: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  loteMarca: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  productoAcciones: {
    flexDirection: 'row',
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
