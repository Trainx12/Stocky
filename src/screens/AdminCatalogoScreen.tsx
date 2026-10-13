import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { Button } from '../components/Button';
import {
  agregarAlCatalogo,
  cambiarFotoCatalogo,
  editarCatalogo,
  quitarFotoCatalogo,
  LARGO_MAXIMO_NOMBRE_CATALOGO,
  listarCatalogoParaAdmin,
  sacarDelCatalogo,
} from '../services/admin';
import type { DatosCatalogo } from '../services/admin';
import { categoriasDelCatalogo, filtrarCatalogo } from '../services/catalogo';
import { UNIDADES_DISPONIBLES } from '../services/escaneo';
import { esFotoSubidaAStocky, imagenDeCatalogo } from '../lib/catalogoImagenes';
import { obtenerFotoBase64 } from '../lib/fotos';
import type { OrigenFoto } from '../lib/fotos';
import type { ProductoCatalogo } from '../types/database';
import { avisar, confirmar } from '../lib/alert';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';
import type { AppStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'AdminCatalogo'>;

// Formulario abierto: null = cerrado; producto null = agregar uno nuevo.
type Edicion = { producto: ProductoCatalogo | null } | null;

/**
 * Admin: el catálogo global (los productos aprobados que todos eligen al
 * cargar). Buscar, filtrar por categoría, agregar, corregir nombre /
 * categoría / unidad y sacar productos (services/admin.ts). Cada cambio
 * queda en el registro de acciones de los admins.
 */
export function AdminCatalogoScreen({ navigation }: Props) {
  const styles = useEstilos(crearEstilos);
  const [catalogo, setCatalogo] = useState<ProductoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<Edicion>(null);

  const cargar = useCallback(async () => {
    try {
      setCatalogo(await listarCatalogoParaAdmin());
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo cargar el catálogo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const categorias = useMemo(() => categoriasDelCatalogo(catalogo), [catalogo]);
  const visibles = useMemo(() => filtrarCatalogo(catalogo, busqueda, categoria), [catalogo, busqueda, categoria]);

  async function handleSacar(producto: ProductoCatalogo) {
    const confirmado = await confirmar(
      'Sacar del catálogo',
      `"${producto.nombre}" deja de aparecer para cargar. Las despensas que ya lo tienen lo conservan.`,
      'Sacar',
    );
    if (!confirmado) return;
    try {
      await sacarDelCatalogo(producto.id);
      setCatalogo((actual) => actual.filter((p) => p.id !== producto.id));
      avisar('Listo', `"${producto.nombre}" salió del catálogo.`, 'exito');
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo sacar del catálogo.');
    }
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Catálogo</Text>
        <Pressable
          onPress={() => setEdicion({ producto: null })}
          style={styles.agregar}
          accessibilityRole="button"
          accessibilityLabel="Agregar producto al catálogo"
        >
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.agregarTexto}>Agregar</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.buscador}
        placeholder={`Buscar entre ${catalogo.length} productos...`}
        placeholderTextColor={colors.textSecondary}
        value={busqueda}
        onChangeText={setBusqueda}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filaChips} contentContainerStyle={styles.chips}>
        {[null, ...categorias].map((c) => (
          <Pressable
            key={c ?? 'todas'}
            onPress={() => setCategoria(c)}
            style={[styles.chip, categoria === c && styles.chipActivo]}
            accessibilityRole="button"
            accessibilityState={{ selected: categoria === c }}
          >
            <Text style={[styles.chipTexto, categoria === c && styles.chipTextoActivo]}>{c ?? 'Todas'}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        // FlatList: solo dibuja (y pide la foto de) lo que está a la vista
        // (ver CatalogoSelectorModal e incidentes-sprint10.md #26).
        <FlatList
          style={styles.lista}
          contentContainerStyle={styles.listaContenido}
          data={visibles}
          keyExtractor={(p) => p.id}
          initialNumToRender={15}
          maxToRenderPerBatch={12}
          windowSize={5}
          ListEmptyComponent={<Text style={styles.vacio}>Ningún producto coincide.</Text>}
          renderItem={({ item: p }) => (
              <View style={styles.fila}>
                <Miniatura producto={p} />
                <Pressable
                  onPress={() => setEdicion({ producto: p })}
                  style={styles.filaTextos}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar ${p.nombre}`}
                >
                  <Text style={styles.filaNombre} numberOfLines={1}>
                    {p.nombre}
                  </Text>
                  <Text style={styles.filaDetalle}>
                    {p.categoria} · {p.unidad}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setEdicion({ producto: p })} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Editar ${p.nombre}`}>
                  <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                </Pressable>
                <Pressable onPress={() => handleSacar(p)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Sacar ${p.nombre} del catálogo`}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
          )}
        />
      )}

      <FormularioCatalogo
        edicion={edicion}
        categorias={categorias}
        onClose={() => setEdicion(null)}
        onGuardado={() => {
          setEdicion(null);
          cargar();
        }}
      />
    </ScreenContainer>
  );
}

// Foto chica del producto en la lista (la misma que ven los usuarios al cargar).
function Miniatura({ producto }: { producto: ProductoCatalogo }) {
  const styles = useEstilos(crearEstilos);
  const imagen = imagenDeCatalogo(producto);
  return (
    <View style={[styles.miniatura, !imagen && styles.miniaturaVacia]}>
      {imagen ? (
        <Image source={imagen} style={styles.foto} resizeMode="contain" />
      ) : (
        <Ionicons name="basket-outline" size={18} color={colors.textSecondary} />
      )}
    </View>
  );
}

// Formulario para agregar o corregir un producto del catálogo.
function FormularioCatalogo({
  edicion,
  categorias,
  onClose,
  onGuardado,
}: {
  edicion: Edicion;
  categorias: string[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const styles = useEstilos(crearEstilos);
  const producto = edicion?.producto ?? null;
  const [datos, setDatos] = useState<DatosCatalogo>({ nombre: '', categoria: '', unidad: 'unidad' });
  const [guardando, setGuardando] = useState(false);
  // Foto: `fotoNueva` = elegida y todavía sin guardar (base64); `quitarFoto`
  // = se tocó "Quitar foto". Se aplican al tocar "Guardar".
  const [fotoNueva, setFotoNueva] = useState<string | null>(null);
  const [quitarFoto, setQuitarFoto] = useState(false);
  const [cargandoFoto, setCargandoFoto] = useState(false);

  useEffect(() => {
    if (!edicion) return;
    setFotoNueva(null);
    setQuitarFoto(false);
    setDatos(
      producto
        ? { nombre: producto.nombre, categoria: producto.categoria, unidad: producto.unidad as DatosCatalogo['unidad'] }
        : { nombre: '', categoria: categorias[0] ?? 'Otros', unidad: 'unidad' },
    );
  }, [edicion, producto, categorias]);

  async function handleElegirFoto(origen: OrigenFoto) {
    setCargandoFoto(true);
    try {
      // 600 px de ancho alcanza para mostrarla (igual que las sugerencias).
      const foto = await obtenerFotoBase64(origen, 600);
      if (foto) {
        setFotoNueva(foto);
        setQuitarFoto(false);
      }
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo cargar la foto.');
    } finally {
      setCargandoFoto(false);
    }
  }

  async function handleGuardar() {
    setGuardando(true);
    try {
      if (producto) await editarCatalogo(producto.id, datos);
      const destino = producto ?? (await agregarAlCatalogo(datos));
      if (fotoNueva) await cambiarFotoCatalogo(destino, fotoNueva);
      else if (quitarFoto && producto) await quitarFotoCatalogo(producto);
      avisar('Listo', producto ? 'Producto corregido.' : 'Producto agregado al catálogo.', 'exito');
      onGuardado();
    } catch (err) {
      avisar('No se pudo guardar', err instanceof Error ? err.message : 'Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal visible={edicion !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          {/* Deslizable: con la foto, el formulario no entra en pantallas bajas. */}
          <ScrollView contentContainerStyle={styles.sheetContenido} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitulo}>{producto ? 'Corregir producto' : 'Agregar al catálogo'}</Text>

          <Text style={styles.etiqueta}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={datos.nombre}
            onChangeText={(nombre) => setDatos((d) => ({ ...d, nombre }))}
            maxLength={LARGO_MAXIMO_NOMBRE_CATALOGO}
            placeholder="Ej: Dulce de leche"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={styles.etiqueta}>Categoría</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filaChips} contentContainerStyle={styles.chips}>
            {categorias.map((c) => (
              <Pressable
                key={c}
                onPress={() => setDatos((d) => ({ ...d, categoria: c }))}
                style={[styles.chip, datos.categoria === c && styles.chipActivo]}
              >
                <Text style={[styles.chipTexto, datos.categoria === c && styles.chipTextoActivo]}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput
            style={styles.input}
            value={datos.categoria}
            onChangeText={(categoria) => setDatos((d) => ({ ...d, categoria }))}
            placeholder="O escribí una categoría nueva"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={styles.etiqueta}>Unidad</Text>
          <View style={styles.unidades}>
            {UNIDADES_DISPONIBLES.map((u) => (
              <Pressable
                key={u}
                onPress={() => setDatos((d) => ({ ...d, unidad: u }))}
                style={[styles.chip, datos.unidad === u && styles.chipActivo]}
              >
                <Text style={[styles.chipTexto, datos.unidad === u && styles.chipTextoActivo]}>{u}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.etiqueta}>Foto</Text>
          <View style={styles.fotoFila}>
            <View style={styles.fotoMarco}>
              {fotoNueva ? (
                <Image source={{ uri: `data:image/jpeg;base64,${fotoNueva}` }} style={styles.foto} resizeMode="contain" />
              ) : !quitarFoto && producto && imagenDeCatalogo(producto) ? (
                <Image source={imagenDeCatalogo(producto)!} style={styles.foto} resizeMode="contain" />
              ) : (
                <Ionicons name="image-outline" size={32} color={colors.textSecondary} />
              )}
            </View>
            <View style={styles.fotoAcciones}>
              {cargandoFoto ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Pressable onPress={() => handleElegirFoto('galeria')} style={styles.fotoBoton} accessibilityRole="button">
                    <Ionicons name="images-outline" size={16} color={colors.primary} />
                    <Text style={styles.fotoBotonTexto}>Elegir de la galería</Text>
                  </Pressable>
                  <Pressable onPress={() => handleElegirFoto('camara')} style={styles.fotoBoton} accessibilityRole="button">
                    <Ionicons name="camera-outline" size={16} color={colors.primary} />
                    <Text style={styles.fotoBotonTexto}>Sacar foto</Text>
                  </Pressable>
                  {/* Solo se puede quitar una foto subida (las guardadas en
                      la app vienen con la versión). */}
                  {(fotoNueva || (producto && esFotoSubidaAStocky(producto.imagen_url) && !quitarFoto)) && (
                    <Pressable
                      onPress={() => {
                        setFotoNueva(null);
                        setQuitarFoto(true);
                      }}
                      style={styles.fotoBoton}
                      accessibilityRole="button"
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      <Text style={[styles.fotoBotonTexto, styles.textoPeligro]}>Quitar foto</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          </View>

          {producto && (
            <Text style={styles.nota}>
              Corregir el catálogo cambia lo que se ve al cargar productos nuevos; los que ya están en las despensas
              quedan como se cargaron.
            </Text>
          )}

          <Button label={producto ? 'Guardar cambios' : 'Agregar'} onPress={handleGuardar} loading={guardando} />
          <Button label="Cancelar" variant="outline" onPress={onClose} disabled={guardando} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
      flex: 1,
    },
    agregar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    agregarTexto: {
      ...typography.caption,
      color: colors.white,
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
    // Sin esto, en la web la fila horizontal de chips se estira a todo el
    // alto libre (los chips se veían como columnas gigantes).
    filaChips: {
      flexGrow: 0,
      flexShrink: 0,
    },
    chips: {
      gap: spacing.xs,
      alignItems: 'center',
    },
    miniatura: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.white,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    miniaturaVacia: {
      backgroundColor: colors.background,
    },
    fotoFila: {
      flexDirection: 'row',
      gap: spacing.md,
      alignItems: 'center',
    },
    fotoMarco: {
      width: 96,
      height: 96,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.white,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    foto: {
      width: '100%',
      height: '100%',
    },
    fotoAcciones: {
      flex: 1,
      gap: spacing.xs,
    },
    fotoBoton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: 4,
    },
    fotoBotonTexto: {
      ...typography.caption,
      color: colors.primary,
    },
    textoPeligro: {
      color: colors.danger,
    },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActivo: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipTexto: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    chipTextoActivo: {
      color: colors.white,
    },
    loader: {
      marginTop: spacing.xl,
    },
    lista: {
      flex: 1,
    },
    listaContenido: {
      gap: spacing.xs,
      paddingBottom: spacing.xl,
    },
    vacio: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filaTextos: {
      flex: 1,
    },
    filaNombre: {
      ...typography.bodyMedium,
      color: colors.textPrimary,
    },
    filaDetalle: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      maxHeight: '92%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
    },
    sheetContenido: {
      padding: spacing.lg,
      gap: spacing.sm,
    },
    sheetTitulo: {
      ...typography.h3,
      color: colors.textPrimary,
    },
    etiqueta: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    input: {
      ...typography.body,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.background,
    },
    unidades: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    nota: {
      ...typography.caption,
      color: colors.textSecondary,
    },
  });
