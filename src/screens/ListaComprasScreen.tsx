import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import {
  agregarItems,
  ajustarCantidadItem,
  cambiarCantidadItem,
  eliminarItems,
  faltantesParaLista,
  guardarComprasEnDespensa,
  itemDesdeTexto,
  LARGO_MAXIMO_ITEM,
  listarLista,
  marcarComprado,
  ordenarLista,
  textoCantidadItem,
  validarItem,
} from '../services/listaCompras';
import { listarCatalogoAprobado } from '../services/catalogo';
import { listarProductosConStockBajo } from '../services/productos';
import type { AlertaStock } from '../services/productos';
import type { ItemListaCompras, ProductoCatalogo } from '../types/database';
import { supabase } from '../lib/supabase';
import { afectaBorrado, agruparLlamadas } from '../lib/tiempoReal';
import { avisar } from '../lib/alert';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';
import type { AppStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'ListaCompras'>;

/**
 * Lista de compras del hogar (services/listaCompras.ts): la misma para todos
 * los miembros, en tiempo real. Arriba se ofrece pasar lo que está en "Stock
 * bajo"; cada ítem se tilda al comprarlo, y "Guardé las compras" carga lo
 * tildado en la despensa y lo saca de la lista.
 */
export function ListaComprasScreen({ navigation, route }: Props) {
  const { hogarId, hogarNombre } = route.params;
  const styles = useEstilos(crearEstilos);
  const { usuario } = useAuth();
  const [items, setItems] = useState<ItemListaCompras[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertas, setAlertas] = useState<AlertaStock[]>([]);
  const [catalogo, setCatalogo] = useState<ProductoCatalogo[]>([]);
  const [texto, setTexto] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // `silencioso`: sin spinner (recarga pedida por un cambio de otra persona).
  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setLoading(true);
      try {
        const [lista, stock] = await Promise.all([listarLista(hogarId), listarProductosConStockBajo([hogarId])]);
        setItems(lista);
        setAlertas(stock);
      } catch (err) {
        if (!silencioso) avisar('Error', err instanceof Error ? err.message : 'No se pudo cargar la lista.');
      } finally {
        if (!silencioso) setLoading(false);
      }
    },
    [hogarId],
  );

  useEffect(() => {
    cargar();
    // El catálogo completa categoría y unidad de lo que se escribe a mano.
    listarCatalogoAprobado()
      .then(setCatalogo)
      .catch((err) => console.warn('[Stocky] No se pudo cargar el catálogo:', err));
  }, [cargar]);

  // Tiempo real: si otro miembro agrega o tilda algo, se ve al toque. Los
  // borrados no se pueden filtrar por hogar (Realtime solo manda el id), así
  // que se recarga solo si el ítem borrado estaba en esta lista.
  const idsRef = useRef<string[]>([]);
  idsRef.current = items.map((i) => i.id);
  useEffect(() => {
    const recarga = agruparLlamadas(() => cargar(true));
    const filtro = `hogar_id=eq.${hogarId}`;
    const canal = supabase
      .channel(`lista-compras-${hogarId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lista_compras', filter: filtro }, () => recarga.disparar())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lista_compras', filter: filtro }, () => recarga.disparar())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lista_compras' }, (payload) => {
        if (afectaBorrado((payload.old as { id?: string })?.id, idsRef.current)) recarga.disparar();
      })
      .subscribe();
    return () => {
      recarga.cancelar();
      supabase.removeChannel(canal);
    };
  }, [hogarId, cargar]);

  const ordenados = useMemo(() => ordenarLista(items), [items]);
  const faltantes = useMemo(() => faltantesParaLista(alertas, items), [alertas, items]);
  const comprados = items.filter((i) => i.comprado);

  async function handleAgregarTexto() {
    if (!usuario || agregando) return;
    const item = itemDesdeTexto(texto, catalogo);
    const problema = validarItem(item);
    if (problema) {
      avisar('Falta algo', problema, 'info');
      return;
    }
    setAgregando(true);
    try {
      await agregarItems(hogarId, [item], usuario.id);
      setTexto('');
      await cargar(true);
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo agregar.');
    } finally {
      setAgregando(false);
    }
  }

  async function handleAgregarFaltantes() {
    if (!usuario) return;
    try {
      await agregarItems(hogarId, faltantes, usuario.id);
      await cargar(true);
      avisar('Listo', `Agregamos ${faltantes.length === 1 ? '1 producto' : `${faltantes.length} productos`} a la lista.`, 'exito');
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudieron agregar.');
    }
  }

  // Cambios optimistas: se ven al instante y, si fallan, se vuelve atrás.
  async function handleTildar(item: ItemListaCompras) {
    setItems((actuales) => actuales.map((i) => (i.id === item.id ? { ...i, comprado: !item.comprado } : i)));
    try {
      await marcarComprado(item.id, !item.comprado);
    } catch (err) {
      setItems((actuales) => actuales.map((i) => (i.id === item.id ? item : i)));
      avisar('Error', err instanceof Error ? err.message : 'No se pudo actualizar.');
    }
  }

  async function handleCantidad(item: ItemListaCompras, delta: number) {
    const nueva = ajustarCantidadItem(item.cantidad, delta);
    if (nueva === item.cantidad) return;
    setItems((actuales) => actuales.map((i) => (i.id === item.id ? { ...i, cantidad: nueva } : i)));
    try {
      await cambiarCantidadItem(item.id, nueva);
    } catch (err) {
      setItems((actuales) => actuales.map((i) => (i.id === item.id ? item : i)));
      avisar('Error', err instanceof Error ? err.message : 'No se pudo actualizar.');
    }
  }

  async function handleBorrar(item: ItemListaCompras) {
    setItems((actuales) => actuales.filter((i) => i.id !== item.id));
    try {
      await eliminarItems([item.id]);
    } catch (err) {
      await cargar(true);
      avisar('Error', err instanceof Error ? err.message : 'No se pudo borrar.');
    }
  }

  async function handleGuardarCompras() {
    setGuardando(true);
    try {
      const { guardados, fallidos } = await guardarComprasEnDespensa(hogarId, items);
      await cargar(true);
      if (fallidos > 0) {
        avisar('Algunas no se guardaron', `Se cargaron ${guardados} y fallaron ${fallidos}: quedaron tildadas para reintentar.`);
      } else {
        avisar('¡Compras guardadas!', `${guardados === 1 ? 'Se cargó 1 producto' : `Se cargaron ${guardados} productos`} en la despensa. Si querés, agregales la fecha de vencimiento.`, 'exito');
      }
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudieron guardar las compras.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerTextos}>
          <Text style={styles.title}>Lista de compras</Text>
          <Text style={styles.subtitulo} numberOfLines={1}>
            {hogarNombre} · la ven todos los del hogar
          </Text>
        </View>
      </View>

      {/* Agregar a mano */}
      <View style={styles.agregarFila}>
        <TextInput
          style={styles.input}
          value={texto}
          onChangeText={setTexto}
          placeholder="¿Qué hay que comprar? (ej: leche)"
          placeholderTextColor={colors.textSecondary}
          maxLength={LARGO_MAXIMO_ITEM}
          returnKeyType="done"
          onSubmitEditing={handleAgregarTexto}
          accessibilityLabel="Producto a agregar a la lista"
        />
        <Pressable
          onPress={handleAgregarTexto}
          disabled={agregando || !texto.trim()}
          style={[styles.botonAgregar, (!texto.trim() || agregando) && styles.botonDeshabilitado]}
          accessibilityRole="button"
          accessibilityLabel="Agregar a la lista"
        >
          {agregando ? <ActivityIndicator color={colors.white} /> : <Ionicons name="add" size={24} color={colors.white} />}
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <ScrollView style={styles.lista} contentContainerStyle={styles.listaContenido} keyboardShouldPersistTaps="handled">
          {/* Lo que está en "Stock bajo" y todavía no está en la lista. */}
          {faltantes.length > 0 && (
            <View style={styles.sugerencia}>
              <Ionicons name="alert-circle" size={20} color={colors.textPrimary} />
              <View style={styles.sugerenciaTextos}>
                <Text style={styles.sugerenciaTitulo}>
                  {faltantes.length === 1 ? 'Te falta 1 producto' : `Te faltan ${faltantes.length} productos`}
                </Text>
                <Text style={styles.sugerenciaDetalle} numberOfLines={2}>
                  {faltantes.map((f) => f.nombre).join(', ')}
                </Text>
              </View>
              <Pressable onPress={handleAgregarFaltantes} style={styles.sugerenciaBoton} accessibilityRole="button">
                <Text style={styles.sugerenciaBotonTexto}>Agregar</Text>
              </Pressable>
            </View>
          )}

          {ordenados.length === 0 ? (
            <View style={styles.vacio}>
              <Ionicons name="cart-outline" size={40} color={colors.textSecondary} />
              <Text style={styles.vacioTexto}>La lista está vacía.</Text>
              <Text style={styles.vacioDetalle}>
                Escribí arriba lo que hay que comprar. Cuando a un producto le baje el stock, te lo sugerimos acá.
              </Text>
            </View>
          ) : (
            ordenados.map((item) => (
              <View key={item.id} style={[styles.item, item.comprado && styles.itemComprado]}>
                <Pressable
                  onPress={() => handleTildar(item)}
                  style={styles.itemTildar}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.comprado }}
                  accessibilityLabel={item.nombre}
                >
                  <Ionicons
                    name={item.comprado ? 'checkbox' : 'square-outline'}
                    size={26}
                    color={item.comprado ? colors.success : colors.textSecondary}
                  />
                  <View style={styles.itemTextos}>
                    <Text style={[styles.itemNombre, item.comprado && styles.itemNombreComprado]} numberOfLines={1}>
                      {item.nombre}
                    </Text>
                    <Text style={styles.itemDetalle}>{textoCantidadItem(item)}</Text>
                  </View>
                </Pressable>
                {!item.comprado && (
                  <View style={styles.itemCantidad}>
                    <Pressable
                      onPress={() => handleCantidad(item, -1)}
                      disabled={item.cantidad <= 1}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Uno menos de ${item.nombre}`}
                    >
                      <Ionicons name="remove-circle-outline" size={24} color={item.cantidad <= 1 ? colors.border : colors.primary} />
                    </Pressable>
                    <Pressable onPress={() => handleCantidad(item, 1)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Uno más de ${item.nombre}`}>
                      <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
                    </Pressable>
                  </View>
                )}
                <Pressable onPress={() => handleBorrar(item)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Sacar ${item.nombre} de la lista`}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {comprados.length > 0 && (
        <View style={styles.pie}>
          <Button
            label={comprados.length === 1 ? 'Guardé la compra (1)' : `Guardé las compras (${comprados.length})`}
            onPress={handleGuardarCompras}
            loading={guardando}
          />
          <Text style={styles.pieTexto}>Lo tildado se carga en la despensa y sale de la lista.</Text>
        </View>
      )}
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
    headerTextos: {
      flex: 1,
    },
    title: {
      ...typography.h2,
      color: colors.textPrimary,
    },
    subtitulo: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    agregarFila: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    input: {
      ...typography.body,
      flex: 1,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface,
    },
    botonAgregar: {
      width: 48,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    botonDeshabilitado: {
      opacity: 0.5,
    },
    loader: {
      marginTop: spacing.xl,
    },
    lista: {
      flex: 1,
    },
    listaContenido: {
      gap: spacing.sm,
      paddingBottom: spacing.xl,
    },
    sugerencia: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.warningLight,
      borderWidth: 1,
      borderColor: colors.stockStatus.low,
    },
    sugerenciaTextos: {
      flex: 1,
      gap: 2,
    },
    sugerenciaTitulo: {
      ...typography.bodyMedium,
      color: colors.textPrimary,
    },
    sugerenciaDetalle: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    sugerenciaBoton: {
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    sugerenciaBotonTexto: {
      ...typography.caption,
      color: colors.white,
    },
    vacio: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.md,
    },
    vacioTexto: {
      ...typography.bodyMedium,
      color: colors.textPrimary,
    },
    vacioDetalle: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    itemComprado: {
      opacity: 0.6,
    },
    itemTildar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    itemTextos: {
      flex: 1,
    },
    itemNombre: {
      ...typography.bodyMedium,
      color: colors.textPrimary,
    },
    itemNombreComprado: {
      textDecorationLine: 'line-through',
    },
    itemDetalle: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    itemCantidad: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    pie: {
      gap: spacing.xs,
    },
    pieTexto: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
