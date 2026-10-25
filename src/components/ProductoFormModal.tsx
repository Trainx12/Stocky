import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './Button';
import { CalendarioPicker } from './CalendarioPicker';
import { CatalogoSelectorModal } from './CatalogoSelectorModal';
import { imagenDeCatalogo } from '../lib/catalogoImagenes';
import { EvitarTeclado, useRellenoInferior } from './HojaConTeclado';
import { avisar } from '../lib/alert';
import { obtenerFotoBase64 } from '../lib/fotos';
import { useGrabadorDeVoz } from '../lib/grabacion';
import { fechaUtilizable } from '../services/escaneo';
import { reconocerFechaPorVoz, reconocerVencimientoDeFoto } from '../services/externalApis';
import type { AudioGrabado } from '../services/externalApis';
import { fechaDeHoy } from '../services/voz';
import {
  avisoProductoVencido,
  crearProducto,
  DIAS_AVISO_POR_DEFECTO,
  editarProducto,
  fechaDesdeInput,
  fechaParaMostrar,
  parsearDiasAviso,
  parsearNumero,
} from '../services/productos';
import { useAuth } from '../context/AuthContext';
import type { Producto, ProductoCatalogo } from '../types/database';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';

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
  const styles = useEstilos(crearEstilos);
  const editando = producto != null;
  const rellenoInferior = useRellenoInferior();

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
  // Marca opcional en texto libre ("Lucchetti"): distingue dos paquetes del
  // mismo producto con vencimientos distintos.
  const [marca, setMarca] = useState('');
  const [cantidad, setCantidad] = useState('0');
  const [stockMinimo, setStockMinimo] = useState('0');
  // RF2/RF3: fecha de vencimiento ('AAAA-MM-DD' completa; mientras se tipea,
  // el texto a medias en DD/MM/AAAA, ver fechaDesdeInput;
  // vacío = sin fecha) y si avisar cuando esté próximo a vencer. Default
  // `true` para el toggle, igual que el default de la columna en la base.
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [alertaVencimientoHabilitada, setAlertaVencimientoHabilitada] = useState(true);
  // Días de aviso propios de este producto, como texto ('' = usar la
  // preferencia general del usuario, que se muestra como placeholder).
  const [diasAviso, setDiasAviso] = useState('');
  const { usuario } = useAuth();
  const diasAvisoGeneral = usuario?.dias_aviso_vencimiento ?? DIAS_AVISO_POR_DEFECTO;
  // Si el CalendarioPicker está desplegado debajo del campo de fecha (ver
  // botón de calendario).
  const [calendarioVisible, setCalendarioVisible] = useState(false);
  // Leyendo la fecha de una foto del envase (Gemini, ver vencimiento-foto).
  const [leyendoFecha, setLeyendoFecha] = useState(false);
  // Entendiendo una fecha dictada por voz (Gemini, ver voz-a-texto).
  const [escuchandoFecha, setEscuchandoFecha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Precarga los datos del producto cada vez que se abre el modal en modo
  // "editar"; en modo "crear" arranca siempre de los valores por default.
  useEffect(() => {
    if (!visible) return;
    if (producto) {
      setMarca(producto.marca ?? '');
      setCantidad(String(producto.cantidad));
      setStockMinimo(String(producto.stock_minimo));
      setFechaVencimiento(producto.fecha_vencimiento ?? '');
      setAlertaVencimientoHabilitada(producto.alerta_vencimiento_habilitada);
      setDiasAviso(producto.dias_aviso_vencimiento ? String(producto.dias_aviso_vencimiento) : '');
    } else {
      setCatalogoSeleccionado(null);
      setMarca('');
      // Arranca en 1: si nadie la cambiaba, el producto se cargaba "agotado".
      setCantidad('1');
      setStockMinimo('0');
      setFechaVencimiento('');
      setAlertaVencimientoHabilitada(true);
      setDiasAviso('');
    }
    setCalendarioVisible(false);
    setSelectorVisible(false);
    setError(null);
  }, [visible, producto]);

  function handleClose() {
    grabadorFecha.cancelar();
    setError(null);
    onClose();
  }

  // Cantidad y stock mínimo seleccionan su número al tocarlos
  // (selectTextOnFocus): lo que se escribe lo reemplaza en vez de quedar
  // pegado ("15" al tocar 5 sobre un "1"). Al perder el foco, si quedó vacío
  // (lo borró todo y no escribió nada) se restaura a "0" -- mismo valor que
  // ya asumía parsearNumero() para texto vacío, pero mostrado explícito.
  function handleBlurNumerico(valor: string, setValor: (v: string) => void) {
    if (valor.trim() === '') setValor('0');
  }

  // Elegir un día en el CalendarioPicker vuelca la fecha al campo de texto
  // y cierra el calendario -- mismo resultado final que tipearla a mano.
  function handleSeleccionarFecha(fecha: string) {
    setFechaVencimiento(fecha);
    setCalendarioVisible(false);
  }

  // Foto del envase -> fecha sugerida por Gemini. Solo se vuelca al campo (que
  // sigue siendo editable y hay que guardar a mano), nunca se guarda sola;
  // si el modelo no está seguro, se avisa y se carga a mano. En web no hay
  // cámara confiable, se abre el selector de archivos.
  async function handleFotoVencimiento() {
    setError(null);
    setLeyendoFecha(true);
    try {
      const imagen = await obtenerFotoBase64(Platform.OS === 'web' ? 'galeria' : 'camara');
      if (!imagen) return;

      const fecha = fechaUtilizable(await reconocerVencimientoDeFoto(imagen));
      if (fecha) {
        setFechaVencimiento(fecha);
        setCalendarioVisible(false);
      } else {
        avisar('No pudimos leer la fecha', 'Probá con otra foto bien enfocada de la zona donde está impresa, o ingresala a mano.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer la fecha de la foto.');
    } finally {
      setLeyendoFecha(false);
    }
  }

  // Sprint 8 — fecha dictada por voz: mismo criterio que la foto, solo se
  // vuelca al campo si es una fecha válida y el modelo está seguro.
  const procesarFechaDictada = useCallback(async (audio: AudioGrabado) => {
    setEscuchandoFecha(true);
    try {
      const resultado = await reconocerFechaPorVoz(audio, fechaDeHoy());
      const fecha = fechaUtilizable(resultado);
      if (fecha) {
        setFechaVencimiento(fecha);
        setCalendarioVisible(false);
      } else {
        avisar(
          'No entendimos la fecha',
          resultado.transcripcion
            ? `Escuchamos: "${resultado.transcripcion}". Probá decirla de nuevo (por ejemplo "15 de noviembre") o ingresala a mano.`
            : 'Probá decirla de nuevo (por ejemplo "15 de noviembre") o ingresala a mano.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entender la fecha dictada.');
    } finally {
      setEscuchandoFecha(false);
    }
  }, []);

  const alFallarGrabacion = useCallback((mensaje: string) => setError(mensaje), []);
  const grabadorFecha = useGrabadorDeVoz(procesarFechaDictada, alFallarGrabacion);

  function handleVozFecha() {
    setError(null);
    if (grabadorFecha.grabando) grabadorFecha.detener();
    else grabadorFecha.iniciar();
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
            marca,
            diasAvisoVencimiento: parsearDiasAviso(diasAviso),
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
            marca,
            diasAvisoVencimiento: parsearDiasAviso(diasAviso),
          };
      const resultado = editando ? await editarProducto(producto!.id, datos, producto!.fecha_vencimiento) : await crearProducto(hogarId, datos);
      onSuccess(resultado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  // Aviso de salud apenas se escribe una fecha que ya pasó (al guardar
  // igual lo frena crearProducto/editarProducto).
  const avisoVencido = avisoProductoVencido(fechaVencimiento, producto?.fecha_vencimiento ?? null);
  const puedeSubmitear = (editando || catalogoSeleccionado !== null) && !avisoVencido;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <EvitarTeclado>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={[styles.sheet, { paddingBottom: rellenoInferior }]}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.scrollContenido} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{editando ? 'Editar producto' : 'Agregar producto'}</Text>

            <Text style={styles.label}>Producto</Text>
            {editando ? (
              // Solo lectura: el producto ya eligió su identidad al
              // crearse, editar acá cambiaría de qué es el producto sin
              // pasar por el catálogo -- justo lo que este cambio evita.
              <View style={styles.productoElegido}>
                <FotoProducto nombre={producto!.nombre} />
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
                <FotoProducto nombre={catalogoSeleccionado?.nombre} imagenUrl={catalogoSeleccionado?.imagen_url} />
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

            <Text style={styles.label}>Marca (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Lucchetti"
              placeholderTextColor={colors.textSecondary}
              value={marca}
              onChangeText={setMarca}
              maxLength={40}
              editable={!loading}
            />

            <View style={styles.fila}>
              <View style={styles.mitad}>
                <Text style={styles.label}>Cantidad</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  // Al tocarlo se selecciona el número: lo que se escribe lo reemplaza
                  // (antes, con un "1", tocar 5 dejaba "15").
                  selectTextOnFocus
                  value={cantidad}
                  onChangeText={setCantidad}
                  onBlur={() => handleBlurNumerico(cantidad, setCantidad)}
                  editable={!loading}
                />
              </View>
              <View style={styles.mitad}>
                <Text style={styles.label}>Stock mínimo</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  // Al tocarlo se selecciona el número: lo que se escribe lo reemplaza
                  // (antes, con un "1", tocar 5 dejaba "15").
                  selectTextOnFocus
                  value={stockMinimo}
                  onChangeText={setStockMinimo}
                  onBlur={() => handleBlurNumerico(stockMinimo, setStockMinimo)}
                  editable={!loading}
                />
              </View>
            </View>

            <Text style={styles.label}>Fecha de vencimiento (opcional)</Text>
            {/* El campo ocupa todo el ancho y las tres formas de cargar la
                fecha van abajo, con texto: en un celular angosto el campo de
                texto del navegador tiene un ancho mínimo propio y empujaba los
                botones fuera de la pantalla (incidentes-sprint10.md #14). */}
            <TextInput
              style={styles.input}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={colors.textSecondary}
              value={fechaParaMostrar(fechaVencimiento)}
              // Formatea a medida que se tipea: el usuario solo escribe
              // dígitos, las barras (DD/MM/AAAA) se ponen solas.
              onChangeText={(texto) => setFechaVencimiento(fechaDesdeInput(texto))}
              keyboardType="number-pad"
              maxLength={10}
              editable={!loading}
            />
            {avisoVencido && (
              <View style={styles.avisoVencido}>
                <Ionicons name="warning" size={18} color={colors.danger} />
                <Text style={styles.avisoVencidoTexto}>{avisoVencido}</Text>
              </View>
            )}
            <View style={styles.filaFecha}>
              <Pressable
                onPress={() => setCalendarioVisible((visible) => !visible)}
                style={[styles.botonFecha, calendarioVisible && styles.botonFechaActivo]}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Elegir fecha de vencimiento con el calendario"
              >
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                <Text style={styles.botonFechaTexto}>Calendario</Text>
              </Pressable>
              <Pressable
                onPress={handleFotoVencimiento}
                style={styles.botonFecha}
                disabled={loading || leyendoFecha}
                accessibilityRole="button"
                accessibilityLabel="Leer la fecha de vencimiento desde una foto del envase"
              >
                {leyendoFecha ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons name="camera-outline" size={20} color={colors.primary} />
                )}
                <Text style={styles.botonFechaTexto}>Foto</Text>
              </Pressable>
              <Pressable
                onPress={handleVozFecha}
                style={[styles.botonFecha, grabadorFecha.grabando && styles.botonFechaGrabando]}
                disabled={loading || escuchandoFecha}
                accessibilityRole="button"
                accessibilityLabel={grabadorFecha.grabando ? 'Terminar de dictar la fecha' : 'Dictar la fecha de vencimiento por voz'}
              >
                {escuchandoFecha ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons
                    name={grabadorFecha.grabando ? 'stop-circle' : 'mic-outline'}
                    size={20}
                    color={grabadorFecha.grabando ? colors.danger : colors.primary}
                  />
                )}
                <Text style={styles.botonFechaTexto}>{grabadorFecha.grabando ? 'Listo' : 'Dictar'}</Text>
              </Pressable>
            </View>
            {grabadorFecha.grabando && (
              <Text style={styles.grabandoTexto}>
                Decí la fecha (por ejemplo "15 de noviembre") y tocá de nuevo para terminar · {grabadorFecha.segundos} s
              </Text>
            )}

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

            {/* Opcional: pisa la preferencia general (campanita) solo para
                este producto. Vacío = usar la general. */}
            {alertaVencimientoHabilitada && (
              <View style={styles.diasAvisoRow}>
                <Text style={[styles.label, styles.diasAvisoLabel]}>Días de anticipación (opcional)</Text>
                <TextInput
                  style={[styles.input, styles.diasAvisoInput]}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  placeholder={String(diasAvisoGeneral)}
                  placeholderTextColor={colors.textSecondary}
                  value={diasAviso}
                  onChangeText={(texto) => setDiasAviso(texto.replace(/\D/g, '').slice(0, 2))}
                  maxLength={2}
                  editable={!loading}
                  accessibilityLabel="Con cuántos días de anticipación avisar que vence este producto"
                />
              </View>
            )}
            {alertaVencimientoHabilitada && (
              <Text style={styles.diasAvisoAyuda}>
                {diasAviso
                  ? `Te avisamos ${diasAviso === '1' ? '1 día' : `${diasAviso} días`} antes de que venza este producto.`
                  : `Vacío: usa tu preferencia general (${diasAvisoGeneral === 1 ? '1 día' : `${diasAvisoGeneral} días`} antes), que se cambia desde la campanita.`}
              </Text>
            )}

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
      </EvitarTeclado>

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

// Foto del producto elegido (la misma del catálogo): confirma de un vistazo
// que se eligió bien. Sin foto (o sin elegir todavía), la canasta.
function FotoProducto({ nombre, imagenUrl = null }: { nombre?: string; imagenUrl?: string | null }) {
  const styles = useEstilos(crearEstilos);
  const imagen = nombre ? imagenDeCatalogo({ nombre, imagen_url: imagenUrl }) : null;
  return (
    <View style={[styles.productoElegidoFoto, !!imagen && styles.productoElegidoFotoConImagen]}>
      {imagen ? (
        <Image source={imagen} style={styles.productoElegidoImagen} resizeMode="contain" />
      ) : (
        <Ionicons name="basket-outline" size={22} color={colors.primary} />
      )}
    </View>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
  diasAvisoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  diasAvisoLabel: {
    flex: 1,
  },
  diasAvisoInput: {
    width: 64,
    textAlign: 'center',
  },
  diasAvisoAyuda: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  grabandoTexto: {
    ...typography.caption,
    color: colors.danger,
  },
  avisoVencido: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerLight,
  },
  avisoVencidoTexto: {
    ...typography.caption,
    color: colors.danger,
    flex: 1,
  },
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
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productoElegidoFotoConImagen: {
    backgroundColor: colors.white,
  },
  productoElegidoImagen: {
    width: '100%',
    height: '100%',
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
  // Las tres formas de cargar la fecha, debajo del campo y repartidas a lo
  // ancho (cada una ocupa un tercio, entran en cualquier celular).
  filaFecha: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
  },
  botonFecha: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  botonFechaActivo: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  botonFechaGrabando: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerLight,
  },
  botonFechaTexto: {
    ...typography.caption,
    color: colors.primary,
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
  scrollContenido: {
    paddingBottom: spacing.xl,
  },
  submitButton: {
    marginTop: spacing.xs,
  },
});
