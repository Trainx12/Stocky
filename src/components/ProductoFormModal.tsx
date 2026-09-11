import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './Button';
import { CalendarioPicker } from './CalendarioPicker';
import { CatalogoSelectorModal } from './CatalogoSelectorModal';
import { crearProducto, editarProducto, formatearFechaInput, parsearNumero } from '../services/productos';
import type { Producto, ProductoCatalogo } from '../types/database';
import { colors, radius, spacing, typography } from '../theme';

interface ProductoFormModalProps {
  visible: boolean;
  onClose: () => void;
  /** Se llama cuando crear/editar terminó bien. */
  onSuccess: (producto: Producto) => void;
  hogarId: string;
  /** Si viene seteado, el modal edita ESTE producto en vez de crear uno nuevo. */
  producto?: Producto | null;
}

/**
 * Un solo modal para "Agregar producto" y "Editar producto" (mismo patrón
 * que HogarFormModal): el modo se infiere de si `producto` viene seteado o
 * no, así se evita duplicar el manejo de loading/error/validación en dos
 * componentes casi idénticos.
 *
 * Nombre/categoría/unidad ya NO se tipean a mano -- salen de elegir un
 * producto del catálogo global (ver CatalogoSelectorModal y
 * services/catalogo.ts): evita duplicados/inconsistencias ("leche" vs.
 * "Leche") y le da a cada producto una foto/ícono reconocible. En modo
 * "editar" esos tres campos quedan de solo lectura (el producto ya eligió
 * su identidad al crearse) -- lo único editable ahí es cantidad, stock
 * mínimo.
 */
export function ProductoFormModal({ visible, onClose, onSuccess, hogarId, producto }: ProductoFormModalProps) {
  const editando = producto != null;

  // En modo "crear": el producto del catálogo elegido (null = todavía no
  // eligió ninguno, el submit queda deshabilitado). En modo "editar" no se
  // usa -- ahí nombre/categoria/unidad salen directo de `producto`, de
  // solo lectura.
  const [catalogoSeleccionado, setCatalogoSeleccionado] = useState<ProductoCatalogo | null>(null);
  const [selectorVisible, setSelectorVisible] = useState(false);
  // Cantidad/stock mínimo se editan como texto libre (el teclado numérico
  // de RN no impide pegar texto no numérico) y se parsean recién al
  // submitear -- así el usuario puede borrar el campo entero sin que
  // Number('') explote la UI a mitad de tipeo.
  const [cantidad, setCantidad] = useState('0');
  const [stockMinimo, setStockMinimo] = useState('0');
  // RF2/RF3: fecha de vencimiento cargada a mano (texto libre 'AAAA-MM-DD',
  // vacío = sin fecha) y si avisar cuando esté próximo a vencer. Default
  // `true` para el toggle, igual que el default de la columna en la base.
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [alertaVencimientoHabilitada, setAlertaVencimientoHabilitada] = useState(true);
  // Si el CalendarioPicker está desplegado debajo del campo de fecha (ver
  // botón de calendario).
  const [calendarioVisible, setCalendarioVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Precarga los datos del producto cada vez que se abre el modal en modo
  // "editar"; en modo "crear" arranca siempre de los valores por default.
  useEffect(() => {
    if (!visible) return;
    if (producto) {
      setCantidad(String(producto.cantidad));
      setStockMinimo(String(producto.stock_minimo));
      setFechaVencimiento(producto.fecha_vencimiento ?? '');
      setAlertaVencimientoHabilitada(producto.alerta_vencimiento_habilitada);
    } else {
      setCatalogoSeleccionado(null);
      setCantidad('0');
      setStockMinimo('0');
      setFechaVencimiento('');
      setAlertaVencimientoHabilitada(true);
    }
    setCalendarioVisible(false);
    setSelectorVisible(false);
    setError(null);
  }, [visible, producto]);

  function handleClose() {
    setError(null);
    onClose();
  }

  // Cantidad/stock mínimo arrancan en "0" (ver useEffect de arriba). Sin
  // esto, tocar el campo y escribir un número lo deja pegado adelante del
  // cero ("05" en vez de "5") porque el input no estaba vacío al empezar a
  // tipear. Al perder el foco, si quedó vacío (lo borró todo y no escribió
  // nada) se restaura a "0" -- mismo valor que ya asumía parsearNumero()
  // para texto vacío, pero mostrado explícito en vez de un input en blanco.
  function handleFocusNumerico(valor: string, setValor: (v: string) => void) {
    if (valor === '0') setValor('');
  }

  function handleBlurNumerico(valor: string, setValor: (v: string) => void) {
    if (valor.trim() === '') setValor('0');
  }

  // Elegir un día en el CalendarioPicker vuelca la fecha al campo de texto
  // y cierra el calendario -- mismo resultado final que tipearla a mano.
  function handleSeleccionarFecha(fecha: string) {
    setFechaVencimiento(fecha);
    setCalendarioVisible(false);
  }

  async function handleSubmit() {
    // Solo puede pasar en modo "crear" sin haber elegido nada todavía --
    // el botón ya queda disabled, esto es una guarda extra por las dudas.
    if (!editando && !catalogoSeleccionado) return;

    setLoading(true);
    setError(null);
    try {
      const datos = editando
        ? {
            nombre: producto!.nombre,
            categoria: producto!.categoria ?? '',
            unidad: producto!.unidad,
            cantidad: parsearNumero(cantidad),
            stockMinimo: parsearNumero(stockMinimo),
            fechaVencimiento: fechaVencimiento || null,
            alertaVencimientoHabilitada,
            catalogoId: producto!.catalogo_id,
          }
        : {
            nombre: catalogoSeleccionado!.nombre,
            categoria: catalogoSeleccionado!.categoria,
            unidad: catalogoSeleccionado!.unidad,
            cantidad: parsearNumero(cantidad),
            stockMinimo: parsearNumero(stockMinimo),
            fechaVencimiento: fechaVencimiento || null,
            alertaVencimientoHabilitada,
            catalogoId: catalogoSeleccionado!.id,
          };
      const resultado = editando ? await editarProducto(producto!.id, datos) : await crearProducto(hogarId, datos);
      onSuccess(resultado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  const puedeSubmitear = editando || catalogoSeleccionado !== null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{editando ? 'Editar producto' : 'Agregar producto'}</Text>

            <Text style={styles.label}>Producto</Text>
            {editando ? (
              // Solo lectura: el producto ya eligió su identidad al
              // crearse, editar acá cambiaría de qué es el producto sin
              // pasar por el catálogo -- justo lo que este cambio evita.
              <View style={styles.productoElegido}>
                <View style={styles.productoElegidoFoto}>
                  <Ionicons name="basket-outline" size={22} color={colors.primary} />
                </View>
                <View style={styles.productoElegidoTextos}>
                  <Text style={styles.productoElegidoNombre}>{producto!.nombre}</Text>
                  <Text style={styles.productoElegidoDetalle}>
                    {producto!.categoria ? `${producto!.categoria} · ` : ''}
                    {producto!.unidad}
                  </Text>
                </View>
              </View>
            ) : (
              <Pressable
                style={styles.productoElegido}
                onPress={() => setSelectorVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={catalogoSeleccionado ? `Cambiar producto, elegido ${catalogoSeleccionado.nombre}` : 'Elegir un producto'}
              >
                <View style={styles.productoElegidoFoto}>
                  <Ionicons name="basket-outline" size={22} color={colors.primary} />
                </View>
                {catalogoSeleccionado ? (
                  <View style={styles.productoElegidoTextos}>
                    <Text style={styles.productoElegidoNombre}>{catalogoSeleccionado.nombre}</Text>
                    <Text style={styles.productoElegidoDetalle}>
                      {catalogoSeleccionado.categoria} · {catalogoSeleccionado.unidad}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.productoElegidoPlaceholder}>Tocá para elegir un producto del catálogo</Text>
                )}
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </Pressable>
            )}

            <View style={styles.fila}>
              <View style={styles.mitad}>
                <Text style={styles.label}>Cantidad</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={cantidad}
                  onChangeText={setCantidad}
                  onFocus={() => handleFocusNumerico(cantidad, setCantidad)}
                  onBlur={() => handleBlurNumerico(cantidad, setCantidad)}
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
                  onFocus={() => handleFocusNumerico(stockMinimo, setStockMinimo)}
                  onBlur={() => handleBlurNumerico(stockMinimo, setStockMinimo)}
                  editable={!loading}
                />
              </View>
            </View>

            <Text style={styles.label}>Fecha de vencimiento (opcional)</Text>
            <View style={styles.filaFecha}>
              <TextInput
                style={[styles.input, styles.inputFecha]}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={colors.textSecondary}
                value={fechaVencimiento}
                // Formatea a medida que se tipea: el usuario solo escribe
                // dígitos, los guiones (AAAA-MM-DD) se insertan solos.
                onChangeText={(texto) => setFechaVencimiento(formatearFechaInput(texto))}
                keyboardType="number-pad"
                maxLength={10}
                editable={!loading}
              />
              <Pressable
                onPress={() => setCalendarioVisible((visible) => !visible)}
                style={styles.calendarioButton}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Elegir fecha de vencimiento con el calendario"
              >
                <Ionicons name="calendar-outline" size={22} color={colors.primary} />
              </Pressable>
            </View>

            {calendarioVisible && (
              <CalendarioPicker valor={fechaVencimiento || null} onSeleccionar={handleSeleccionarFecha} />
            )}

            <View style={styles.switchRow}>
              <Text style={styles.label}>Avisarme cuando esté por vencer</Text>
              <Switch
                value={alertaVencimientoHabilitada}
                onValueChange={setAlertaVencimientoHabilitada}
                disabled={loading}
                accessibilityLabel="Avisarme cuando esté por vencer"
              />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <Button
              label={editando ? 'Guardar cambios' : 'Agregar producto'}
              onPress={handleSubmit}
              loading={loading}
              disabled={!puedeSubmitear}
              style={styles.submitButton}
            />
          </ScrollView>
        </Pressable>
      </Pressable>

      <CatalogoSelectorModal
        visible={selectorVisible}
        onClose={() => setSelectorVisible(false)}
        onSeleccionar={(item) => {
          setCatalogoSeleccionado(item);
          setSelectorVisible(false);
        }}
      />
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
  productoElegido: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  productoElegidoFoto: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productoElegidoTextos: {
    flex: 1,
    gap: 2,
  },
  productoElegidoNombre: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  productoElegidoDetalle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  productoElegidoPlaceholder: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  fila: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  filaFecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inputFecha: {
    flex: 1,
  },
  calendarioButton: {
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
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
