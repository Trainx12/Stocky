import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from './Button';
import { crearProducto, editarProducto, parsearNumero } from '../services/productos';
import type { Producto } from '../types/database';
import type { UnidadProducto } from '../types/database';
import { colors, radius, spacing, typography } from '../theme';

interface ProductoFormModalProps {
  visible: boolean;
  onClose: () => void;
  /** Se llama cuando crear/editar terminó bien. */
  onSuccess: (producto: Producto) => void;
  hogarId: string;
  /** Si viene seteado, el modal edita ESTE producto en vez de crear uno nuevo. */
  producto?: Producto | null;
  /** Categorías ya usadas en este hogar (ver ProductosScreen), para sumarlas como chip ademas de las predefinidas de abajo. */
  categoriasExistentes?: string[];
}

// Mismas unidades que UnidadProducto (src/types/database.ts): lista chica y
// fija a propósito, para que el selector sea un puñado de chips en vez de
// un picker nativo (no hay ninguna librería de Picker instalada todavía).
// Las abreviaturas métricas van en minúscula (kg, g, l, ml), como se
// escriben normalmente -- solo "Unidad" y "Paquete" son palabras, no
// abreviaturas, y van con mayúscula inicial.
const UNIDADES: { valor: UnidadProducto; label: string }[] = [
  { valor: 'unidad', label: 'Unidad' },
  { valor: 'kg', label: 'kg' },
  { valor: 'g', label: 'g' },
  { valor: 'l', label: 'l' },
  { valor: 'ml', label: 'ml' },
  { valor: 'paquete', label: 'Paquete' },
];

// Categorías comunes de despensa, para no obligar a escribir desde cero
// cada vez. Se combinan con las que ya estén en uso en el hogar (prop
// `categoriasExistentes`) -- entre las dos cubren la mayoría de los casos
// sin tipear, y el chip "Personalizada" cubre el resto.
const CATEGORIAS_SUGERIDAS = [
  'Lácteos',
  'Verduras y frutas',
  'Carnes',
  'Panadería',
  'Bebidas',
  'Limpieza',
  'Higiene',
  'Snacks',
  'Congelados',
  'Otros',
];

const OPCION_PERSONALIZADA = '__personalizada__';

/**
 * Un solo modal para "Agregar producto" y "Editar producto" (mismo patrón
 * que HogarFormModal): el modo se infiere de si `producto` viene seteado o
 * no, así se evita duplicar el manejo de loading/error/validación en dos
 * componentes casi idénticos.
 */
export function ProductoFormModal({ visible, onClose, onSuccess, hogarId, producto, categoriasExistentes = [] }: ProductoFormModalProps) {
  const editando = producto != null;

  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  // Si está tipeando una categoría nueva (chip "+ Personalizada" tocado):
  // en ese modo el input de texto queda visible y manda sobre los chips.
  const [categoriaPersonalizada, setCategoriaPersonalizada] = useState(false);
  const [unidad, setUnidad] = useState<UnidadProducto>('unidad');
  // Cantidad/stock mínimo se editan como texto libre (el teclado numérico
  // de RN no impide pegar texto no numérico) y se parsean recién al
  // submitear -- así el usuario puede borrar el campo entero sin que
  // Number('') explote la UI a mitad de tipeo.
  const [cantidad, setCantidad] = useState('0');
  const [stockMinimo, setStockMinimo] = useState('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chips a mostrar: las sugeridas + las que ya estén en uso en el hogar
  // (por si alguien ya cargó una categoría personalizada antes), sin
  // duplicados y en orden alfabético salvo las sugeridas, que van primero
  // para que sean lo primero que se ve.
  const opcionesCategoria = useMemo(() => {
    const extras = categoriasExistentes.filter((c) => !CATEGORIAS_SUGERIDAS.includes(c)).sort((a, b) => a.localeCompare(b));
    return [...CATEGORIAS_SUGERIDAS, ...extras];
  }, [categoriasExistentes]);

  // Precarga los datos del producto cada vez que se abre el modal en modo
  // "editar"; en modo "crear" arranca siempre de los valores por default.
  useEffect(() => {
    if (!visible) return;
    if (producto) {
      setNombre(producto.nombre);
      setCategoria(producto.categoria ?? '');
      // Si la categoría del producto no está entre los chips disponibles,
      // arranca directo en modo "personalizada" para no esconderla.
      setCategoriaPersonalizada(!!producto.categoria && !opcionesCategoria.includes(producto.categoria));
      setUnidad(producto.unidad);
      setCantidad(String(producto.cantidad));
      setStockMinimo(String(producto.stock_minimo));
    } else {
      setNombre('');
      setCategoria('');
      setCategoriaPersonalizada(false);
      setUnidad('unidad');
      setCantidad('0');
      setStockMinimo('0');
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, producto]);

  function handleSeleccionarCategoria(valor: string) {
    if (valor === OPCION_PERSONALIZADA) {
      setCategoriaPersonalizada(true);
      setCategoria('');
      return;
    }
    setCategoriaPersonalizada(false);
    setCategoria(valor);
  }

  function handleClose() {
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const datos = {
        nombre,
        categoria,
        unidad,
        cantidad: parsearNumero(cantidad),
        stockMinimo: parsearNumero(stockMinimo),
      };
      const resultado = editando ? await editarProducto(producto!.id, datos) : await crearProducto(hogarId, datos);
      onSuccess(resultado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{editando ? 'Editar producto' : 'Agregar producto'}</Text>

            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Leche"
              placeholderTextColor={colors.textSecondary}
              value={nombre}
              onChangeText={setNombre}
              autoCapitalize="sentences"
              editable={!loading}
            />

            <Text style={styles.label}>Categoría</Text>
            <View style={styles.chipsRow}>
              {opcionesCategoria.map((opcion) => (
                <Pressable
                  key={opcion}
                  onPress={() => handleSeleccionarCategoria(opcion)}
                  style={[styles.chip, !categoriaPersonalizada && categoria === opcion && styles.chipSeleccionado]}
                  accessibilityRole="button"
                  accessibilityLabel={`Categoría ${opcion}`}
                >
                  <Text style={[styles.chipTexto, !categoriaPersonalizada && categoria === opcion && styles.chipTextoSeleccionado]}>
                    {opcion}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => handleSeleccionarCategoria(OPCION_PERSONALIZADA)}
                style={[styles.chip, categoriaPersonalizada && styles.chipSeleccionado]}
                accessibilityRole="button"
                accessibilityLabel="Categoría personalizada"
              >
                <Text style={[styles.chipTexto, categoriaPersonalizada && styles.chipTextoSeleccionado]}>
                  + Personalizada
                </Text>
              </Pressable>
            </View>

            {categoriaPersonalizada && (
              <TextInput
                style={styles.input}
                placeholder="Escribí la categoría"
                placeholderTextColor={colors.textSecondary}
                value={categoria}
                onChangeText={setCategoria}
                autoCapitalize="sentences"
                editable={!loading}
                autoFocus
              />
            )}

            <Text style={styles.label}>Unidad</Text>
            <View style={styles.chipsRow}>
              {UNIDADES.map((opcion) => (
                <Pressable
                  key={opcion.valor}
                  onPress={() => setUnidad(opcion.valor)}
                  style={[styles.chip, unidad === opcion.valor && styles.chipSeleccionado]}
                  accessibilityRole="button"
                  accessibilityLabel={`Unidad ${opcion.label}`}
                >
                  <Text style={[styles.chipTexto, unidad === opcion.valor && styles.chipTextoSeleccionado]}>
                    {opcion.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.fila}>
              <View style={styles.mitad}>
                <Text style={styles.label}>Cantidad</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={cantidad}
                  onChangeText={setCantidad}
                  editable={!loading}
                />
              </View>
              <View style={styles.mitad}>
                <Text style={styles.label}>Stock mínimo</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={stockMinimo}
                  onChangeText={setStockMinimo}
                  editable={!loading}
                />
              </View>
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <Button
              label={editando ? 'Guardar cambios' : 'Agregar producto'}
              onPress={handleSubmit}
              loading={loading}
              disabled={!nombre.trim() || !categoria.trim()}
              style={styles.submitButton}
            />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(27, 27, 31, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
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
  fila: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  mitad: {
    flex: 1,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  submitButton: {
    marginTop: spacing.xs,
  },
});
