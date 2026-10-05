import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './Button';
import { SEGUNDOS_MAXIMOS, useGrabadorDeVoz } from '../lib/grabacion';
import { listarCatalogoAprobado } from '../services/catalogo';
import { interpretarComandoDeVoz } from '../services/externalApis';
import type { AudioGrabado } from '../services/externalApis';
import { formatearFechaCorta, formatearFechaInput, nombreConMarca } from '../services/productos';
import {
  accionAplicable,
  aplicarAccionDeVoz,
  armarAccionesDeVoz,
  elegirProducto,
  fechaDeHoy,
  inventarioParaVoz,
} from '../services/voz';
import type { AccionVoz, TipoAccionVoz } from '../services/voz';
import type { Producto } from '../types/database';
import { colors, radius, spacing, typography } from '../theme';

interface ComandoVozModalProps {
  visible: boolean;
  onClose: () => void;
  /** Se llama cuando se aplicó al menos un cambio, con cuántos se aplicaron. */
  onSuccess: (cantidadAplicada: number) => void;
  hogarId: string;
  /** Inventario actual del hogar: a qué producto se refiere cada baja/modificación. */
  productos: Producto[];
}

type Paso = 'grabar' | 'procesando' | 'revisar' | 'vacio';

const EJEMPLOS = [
  'Agregá 2 leches La Serenísima que vencen el 15 de noviembre',
  'Compré un kilo de papas y una docena de huevos',
  'Usé 3 huevos',
  'La manteca vence el viernes',
  'Eliminá el yogur',
];

const ESTILO_TIPO: Record<TipoAccionVoz, { etiqueta: string; color: string; fondo: string }> = {
  alta: { etiqueta: 'Agregar', color: colors.success, fondo: colors.successLight },
  modificacion: { etiqueta: 'Modificar', color: colors.primary, fondo: colors.primaryLight },
  baja: { etiqueta: 'Eliminar', color: colors.danger, fondo: colors.dangerLight },
};

function formatearSegundos(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
}

// "Leche · Sancor — 2 l, vence 20/10/2026", para distinguir opciones parecidas.
function describirProducto(producto: Producto): string {
  const vence = producto.fecha_vencimiento ? `, vence ${formatearFechaCorta(producto.fecha_vencimiento)}` : '';
  return `${nombreConMarca(producto)} — ${producto.cantidad} ${producto.unidad}${vence}`;
}

/**
 * RF8 (Sprints 7/8) — ABM de productos por voz. Se toca el micrófono, se
 * dice qué agregar, sacar o cambiar (incluida la fecha de vencimiento), se
 * toca de nuevo para terminar y Gemini interpreta el pedido. Igual que el
 * ticket, nada se guarda directo: se muestran las acciones entendidas, el
 * usuario corrige o descarta y recién al confirmar se aplican, con las
 * mismas funciones que el ABM manual (services/voz.ts).
 */
export function ComandoVozModal({ visible, onClose, onSuccess, hogarId, productos }: ComandoVozModalProps) {
  const [paso, setPaso] = useState<Paso>('grabar');
  const [transcripcion, setTranscripcion] = useState('');
  const [acciones, setAcciones] = useState<AccionVoz[]>([]);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const procesarAudio = useCallback(
    async (audio: AudioGrabado) => {
      setPaso('procesando');
      try {
        const [comando, catalogo] = await Promise.all([
          interpretarComandoDeVoz(audio, inventarioParaVoz(productos), fechaDeHoy()),
          listarCatalogoAprobado(),
        ]);
        const armadas = armarAccionesDeVoz(comando, productos, catalogo);
        setTranscripcion(comando.transcripcion);
        setAcciones(armadas);
        setPaso(armadas.length === 0 ? 'vacio' : 'revisar');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No pudimos entender el audio.');
        setPaso('grabar');
      }
    },
    [productos],
  );

  const alFallar = useCallback((mensaje: string) => {
    setError(mensaje);
    setPaso('grabar');
  }, []);

  const { grabando, segundos, iniciar, detener, cancelar } = useGrabadorDeVoz(procesarAudio, alFallar);

  useEffect(() => {
    if (!visible) return;
    setPaso('grabar');
    setTranscripcion('');
    setAcciones([]);
    setAplicando(false);
    setError(null);
  }, [visible]);

  function handleCerrar() {
    cancelar();
    onClose();
  }

  function handleMicrofono() {
    setError(null);
    if (grabando) detener();
    else iniciar();
  }

  function handleCambiar(id: string, cambios: Partial<AccionVoz>) {
    setAcciones((actuales) => actuales.map((a) => (a.id === id ? { ...a, ...cambios } : a)));
  }

  function handleElegir(id: string, producto: Producto) {
    setAcciones((actuales) => actuales.map((a) => (a.id === id ? elegirProducto(a, producto) : a)));
  }

  function handleDescartar(id: string) {
    setAcciones((actuales) => actuales.filter((a) => a.id !== id));
  }

  function handleGrabarDeNuevo() {
    setError(null);
    setAcciones([]);
    setTranscripcion('');
    setPaso('grabar');
  }

  const aplicables = acciones.filter(accionAplicable);

  async function handleConfirmar() {
    setAplicando(true);
    setError(null);

    const fallidas: AccionVoz[] = [];
    let aplicadas = 0;
    let ultimoError: string | null = null;

    // De a una y en orden: "agregá leche y después sacá una" tiene que
    // aplicarse en el orden en que se dijo.
    for (const accion of aplicables) {
      try {
        await aplicarAccionDeVoz(hogarId, accion);
        aplicadas += 1;
      } catch (err) {
        fallidas.push(accion);
        ultimoError = err instanceof Error ? err.message : 'Error desconocido';
      }
    }

    setAplicando(false);

    if (fallidas.length === 0) {
      onSuccess(aplicadas);
      return;
    }

    // Quedan en pantalla solo las que fallaron, para corregir y reintentar
    // sin repetir las que ya se aplicaron.
    setAcciones(fallidas);
    setError(`No se pudieron aplicar ${fallidas.length} cambio(s): ${ultimoError}`);
    if (aplicadas > 0) onSuccess(aplicadas);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCerrar}>
      <Pressable style={styles.backdrop} onPress={grabando ? undefined : handleCerrar}>
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Cargar por voz</Text>

            {paso === 'grabar' && (
              <View style={styles.bloque}>
                <Text style={styles.texto}>
                  {grabando
                    ? 'Te escuchamos. Cuando termines, tocá el botón de nuevo.'
                    : 'Tocá el micrófono y decí qué querés agregar, sacar o cambiar, incluida la fecha de vencimiento.'}
                </Text>

                <View style={styles.centro}>
                  <Pressable
                    onPress={handleMicrofono}
                    style={[styles.microfono, grabando && styles.microfonoGrabando]}
                    accessibilityRole="button"
                    accessibilityLabel={grabando ? 'Terminar de grabar' : 'Empezar a grabar'}
                  >
                    <Ionicons name={grabando ? 'stop' : 'mic'} size={40} color={colors.white} />
                  </Pressable>
                  <Text style={[styles.contador, grabando && styles.contadorGrabando]}>
                    {grabando
                      ? `Grabando ${formatearSegundos(segundos)} / ${formatearSegundos(SEGUNDOS_MAXIMOS)}`
                      : 'Tocá para grabar'}
                  </Text>
                </View>

                {error && <Text style={styles.error}>{error}</Text>}

                {!grabando && (
                  <View style={styles.ejemplos}>
                    <Text style={styles.ejemplosTitulo}>Por ejemplo:</Text>
                    {EJEMPLOS.map((ejemplo) => (
                      <Text key={ejemplo} style={styles.ejemplo}>
                        “{ejemplo}”
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            {paso === 'procesando' && (
              <View style={styles.centro}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.texto}>Entendiendo lo que dijiste...</Text>
              </View>
            )}

            {paso === 'vacio' && (
              <View style={styles.bloque}>
                <Ionicons name="mic-off-outline" size={28} color={colors.textSecondary} style={styles.iconoCentro} />
                {transcripcion ? <Text style={styles.transcripcion}>Escuchamos: “{transcripcion}”</Text> : null}
                <Text style={styles.texto}>
                  No entendimos ningún producto para agregar, sacar o cambiar. Probá de nuevo hablando cerca del micrófono,
                  o cargalo a mano.
                </Text>
                <Button label="Grabar de nuevo" onPress={handleGrabarDeNuevo} />
                <Button label="Cargar a mano" variant="outline" onPress={handleCerrar} />
              </View>
            )}

            {paso === 'revisar' && (
              <View style={styles.bloque}>
                {transcripcion ? <Text style={styles.transcripcion}>Escuchamos: “{transcripcion}”</Text> : null}
                <Text style={styles.texto}>Revisá los cambios antes de aplicarlos. Podés corregirlos o descartarlos.</Text>

                {acciones.map((accion) => (
                  <TarjetaAccion
                    key={accion.id}
                    accion={accion}
                    deshabilitada={aplicando}
                    onCambiar={(cambios) => handleCambiar(accion.id, cambios)}
                    onElegir={(producto) => handleElegir(accion.id, producto)}
                    onDescartar={() => handleDescartar(accion.id)}
                  />
                ))}

                {error && <Text style={styles.error}>{error}</Text>}

                <Button
                  label={aplicables.length === 1 ? 'Aplicar 1 cambio' : `Aplicar ${aplicables.length} cambios`}
                  onPress={handleConfirmar}
                  loading={aplicando}
                  disabled={aplicables.length === 0}
                />
                <Button label="Grabar de nuevo" variant="outline" onPress={handleGrabarDeNuevo} disabled={aplicando} />
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface TarjetaAccionProps {
  accion: AccionVoz;
  deshabilitada: boolean;
  onCambiar: (cambios: Partial<AccionVoz>) => void;
  onElegir: (producto: Producto) => void;
  onDescartar: () => void;
}

// Una acción entendida, con sus campos corregibles según el tipo.
function TarjetaAccion({ accion, deshabilitada, onCambiar, onElegir, onDescartar }: TarjetaAccionProps) {
  const estilo = ESTILO_TIPO[accion.tipo];
  const titulo = accion.producto ? nombreConMarca(accion.producto) : accion.nombre;
  const sinProducto = accion.tipo !== 'alta' && !accion.producto;

  return (
    <View style={[styles.tarjeta, sinProducto && styles.tarjetaInactiva]}>
      <View style={styles.fila}>
        <View style={[styles.badge, { backgroundColor: estilo.fondo }]}>
          <Text style={[styles.badgeTexto, { color: estilo.color }]}>{estilo.etiqueta}</Text>
        </View>
        {accion.tipo === 'alta' && !accion.catalogo ? (
          <TextInput
            style={[styles.input, styles.flex]}
            value={accion.nombre}
            onChangeText={(nombre) => onCambiar({ nombre })}
            editable={!deshabilitada}
            placeholder="Nombre del producto"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Nombre del producto"
          />
        ) : (
          <Text style={[styles.nombre, styles.flex]} numberOfLines={2}>
            {titulo}
          </Text>
        )}
        <Pressable
          onPress={onDescartar}
          disabled={deshabilitada}
          accessibilityRole="button"
          accessibilityLabel={`Descartar ${titulo}`}
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
      </View>

      {accion.tipo === 'alta' && !accion.catalogo && <Text style={styles.detalle}>Sin catálogo · se guarda en "Otros"</Text>}

      {accion.aviso && <Text style={styles.aviso}>{accion.aviso}</Text>}

      {accion.opciones.length > 0 && (
        <View style={styles.opciones}>
          {accion.opciones.map((opcion) => (
            <Pressable
              key={opcion.id}
              onPress={() => onElegir(opcion)}
              disabled={deshabilitada}
              style={[styles.chip, accion.producto?.id === opcion.id && styles.chipSeleccionado]}
              accessibilityRole="button"
            >
              <Text style={[styles.chipTexto, accion.producto?.id === opcion.id && styles.chipTextoSeleccionado]}>
                {describirProducto(opcion)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {accion.tipo === 'baja' && accion.producto && (
        <Text style={styles.detalle}>
          Se elimina de la despensa ({accion.producto.cantidad} {accion.producto.unidad}).
        </Text>
      )}

      {accion.tipo !== 'baja' && !sinProducto && (
        <>
          <View style={styles.fila}>
            <Text style={styles.etiquetaCampo}>
              {accion.tipo === 'alta'
                ? 'Cantidad'
                : `Cantidad (tenías ${accion.producto?.cantidad} ${accion.producto?.unidad})`}
            </Text>
            <TextInput
              style={[styles.input, styles.inputCantidad]}
              keyboardType="decimal-pad"
              value={accion.cantidad}
              onChangeText={(cantidad) => onCambiar({ cantidad })}
              editable={!deshabilitada}
              accessibilityLabel={`Cantidad de ${titulo}`}
            />
            <Text style={styles.detalle}>{accion.unidad}</Text>
          </View>
          <View style={styles.fila}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={accion.marca}
              onChangeText={(marca) => onCambiar({ marca })}
              editable={!deshabilitada}
              maxLength={40}
              placeholder="Marca (opcional)"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={`Marca de ${titulo}`}
            />
            <TextInput
              style={[styles.input, styles.inputFecha]}
              value={accion.fecha}
              onChangeText={(texto) => onCambiar({ fecha: formatearFechaInput(texto) })}
              editable={!deshabilitada}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="Vence AAAA-MM-DD"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={`Fecha de vencimiento de ${titulo}`}
            />
          </View>
        </>
      )}
    </View>
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
  bloque: {
    gap: spacing.sm,
  },
  centro: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  iconoCentro: {
    alignSelf: 'center',
  },
  texto: {
    ...typography.body,
    color: colors.textSecondary,
  },
  microfono: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  microfonoGrabando: {
    backgroundColor: colors.danger,
  },
  contador: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  contadorGrabando: {
    color: colors.danger,
  },
  ejemplos: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  ejemplosTitulo: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  ejemplo: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  transcripcion: {
    ...typography.body,
    color: colors.textPrimary,
    fontStyle: 'italic',
  },
  tarjeta: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tarjetaInactiva: {
    opacity: 0.85,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeTexto: {
    ...typography.caption,
    fontSize: 11,
  },
  nombre: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  detalle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  aviso: {
    ...typography.caption,
    color: colors.secondaryDark,
  },
  etiquetaCampo: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  input: {
    ...typography.caption,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  inputCantidad: {
    minWidth: 64,
    textAlign: 'center',
  },
  inputFecha: {
    width: 130,
  },
  opciones: {
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
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
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});
