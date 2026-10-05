import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './Button';
import { categoriasDelCatalogo, filtrarCatalogo, listarCatalogoAprobado, sugerirProducto } from '../services/catalogo';
import type { ProductoCatalogo } from '../types/database';
import type { UnidadProducto } from '../types/database';
import { avisar } from '../lib/alert';
import { colors, radius, spacing, typography } from '../theme';

interface CatalogoSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  /** Se llama cuando el usuario toca un producto del catálogo para elegirlo. */
  onSeleccionar: (producto: ProductoCatalogo) => void;
}

// Mismas unidades que ProductoFormModal, para el formulario de sugerencia.
const UNIDADES: { valor: UnidadProducto; label: string }[] = [
  { valor: 'unidad', label: 'Unidad' },
  { valor: 'kg', label: 'kg' },
  { valor: 'g', label: 'g' },
  { valor: 'l', label: 'l' },
  { valor: 'ml', label: 'ml' },
  { valor: 'paquete', label: 'Paquete' },
];

/**
 * Selector del catálogo global de productos (ver services/catalogo.ts):
 * reemplaza el campo de texto libre "Nombre" de ProductoFormModal -- cargar
 * un producto en un hogar ahora es elegir uno de acá, no escribirlo. Si el
 * producto buscado no está, se puede sugerir (queda pendiente de que un
 * admin lo apruebe, ver AdminSugerenciasScreen) en vez de cargarlo directo.
 */
export function CatalogoSelectorModal({ visible, onClose, onSeleccionar }: CatalogoSelectorModalProps) {
  const [catalogo, setCatalogo] = useState<ProductoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null);

  // Formulario de "sugerir producto" (colapsado por default -- solo tiene
  // sentido mostrarlo cuando la búsqueda no encontró nada, ver más abajo).
  const [sugerirVisible, setSugerirVisible] = useState(false);
  const [nombreSugerido, setNombreSugerido] = useState('');
  const [categoriaSugerida, setCategoriaSugerida] = useState('');
  const [unidadSugerida, setUnidadSugerida] = useState<UnidadProducto>('unidad');
  const [sugiriendo, setSugiriendo] = useState(false);

  // Se recarga cada vez que se abre, para reflejar sugerencias aprobadas
  // desde la última vez (por ejemplo, si un admin aprobó una mientras el
  // modal estaba cerrado).
  useEffect(() => {
    if (!visible) return;
    setBusqueda('');
    setCategoriaSeleccionada(null);
    setSugerirVisible(false);
    (async () => {
      setLoading(true);
      try {
        setCatalogo(await listarCatalogoAprobado());
      } catch (err) {
        avisar('Error', err instanceof Error ? err.message : 'No se pudo cargar el catálogo de productos.');
      } finally {
        setLoading(false);
      }
    })();
  }, [visible]);

  const categorias = useMemo(() => categoriasDelCatalogo(catalogo), [catalogo]);
  const catalogoFiltrado = useMemo(
    () => filtrarCatalogo(catalogo, busqueda, categoriaSeleccionada),
    [catalogo, busqueda, categoriaSeleccionada],
  );

  function handleAbrirSugerir() {
    setNombreSugerido(busqueda.trim());
    setCategoriaSugerida('');
    setUnidadSugerida('unidad');
    setSugerirVisible(true);
  }

  async function handleSugerir() {
    setSugiriendo(true);
    try {
      await sugerirProducto({ nombre: nombreSugerido, categoria: categoriaSugerida, unidad: unidadSugerida });
      avisar(
        'Sugerencia enviada',
        `Le avisamos a los administradores. Vas a poder elegir "${nombreSugerido.trim()}" apenas lo aprueben.`,
      );
      setSugerirVisible(false);
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo enviar la sugerencia.');
    } finally {
      setSugiriendo(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Elegí un producto</Text>

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

          {sugerirVisible ? (
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.sugerirForm}>
              <Text style={styles.label}>Nombre del producto</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Leche de almendras"
                placeholderTextColor={colors.textSecondary}
                value={nombreSugerido}
                onChangeText={setNombreSugerido}
                autoCapitalize="sentences"
                editable={!sugiriendo}
              />

              <Text style={styles.label}>Categoría</Text>
              <View style={styles.chipsRow}>
                {[...categorias, 'Otros'].filter((c, i, arr) => arr.indexOf(c) === i).map((opcion) => (
                  <Pressable
                    key={opcion}
                    onPress={() => setCategoriaSugerida(opcion)}
                    style={[styles.chip, categoriaSugerida === opcion && styles.chipSeleccionado]}
                    accessibilityRole="button"
                    accessibilityLabel={`Categoría ${opcion}`}
                  >
                    <Text style={[styles.chipTexto, categoriaSugerida === opcion && styles.chipTextoSeleccionado]}>{opcion}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Unidad</Text>
              <View style={styles.chipsRow}>
                {UNIDADES.map((opcion) => (
                  <Pressable
                    key={opcion.valor}
                    onPress={() => setUnidadSugerida(opcion.valor)}
                    style={[styles.chip, unidadSugerida === opcion.valor && styles.chipSeleccionado]}
                    accessibilityRole="button"
                    accessibilityLabel={`Unidad ${opcion.label}`}
                  >
                    <Text style={[styles.chipTexto, unidadSugerida === opcion.valor && styles.chipTextoSeleccionado]}>
                      {opcion.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sugerenciaAyuda}>
                Un administrador tiene que aprobarlo antes de que puedas cargarlo en un hogar.
              </Text>

              <View style={styles.sugerirAcciones}>
                <Button
                  label="Cancelar"
                  variant="outline"
                  onPress={() => setSugerirVisible(false)}
                  disabled={sugiriendo}
                  style={styles.sugerirAccionButton}
                />
                <Button
                  label="Mandar sugerencia"
                  onPress={handleSugerir}
                  loading={sugiriendo}
                  disabled={!nombreSugerido.trim() || !categoriaSugerida.trim()}
                  style={styles.sugerirAccionButton}
                />
              </View>
            </ScrollView>
          ) : loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : catalogoFiltrado.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={32} color={colors.textSecondary} />
              <Text style={styles.emptyText}>
                {busqueda.trim() ? `No encontramos "${busqueda.trim()}" en el catálogo.` : 'Todavía no hay productos en esta categoría.'}
              </Text>
              <Button label="Sugerir este producto" variant="outline" onPress={handleAbrirSugerir} style={styles.sugerirButton} />
            </View>
          ) : (
            <ScrollView style={styles.lista} showsVerticalScrollIndicator={false}>
              <View style={styles.grilla}>
                {catalogoFiltrado.map((item) => (
                  <Pressable
                    key={item.id}
                    style={styles.item}
                    onPress={() => onSeleccionar(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Elegir ${item.nombre}`}
                  >
                    <View style={styles.itemFoto}>
                      {item.imagen_url ? (
                        <Image source={{ uri: item.imagen_url }} style={styles.itemImagen} resizeMode="cover" />
                      ) : (
                        <Ionicons name="basket-outline" size={28} color={colors.primary} />
                      )}
                    </View>
                    <Text style={styles.itemNombre} numberOfLines={2}>
                      {item.nombre}
                    </Text>
                    <Text style={styles.itemUnidad}>{item.unidad}</Text>
                  </Pressable>
                ))}
              </View>

              {/* También se puede sugerir aunque la búsqueda sí haya
                  encontrado algo (quizás el que busca es otro parecido). */}
              {busqueda.trim() !== '' && (
                <Button
                  label={`Sugerir "${busqueda.trim()}" como producto nuevo`}
                  variant="outline"
                  onPress={handleAbrirSugerir}
                  style={styles.sugerirButtonInline}
                />
              )}
            </ScrollView>
          )}
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
    maxHeight: '90%',
    minHeight: '60%',
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
  buscador: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  categoriasScroll: {
    flexGrow: 0,
    marginBottom: spacing.sm,
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
  lista: {
    flex: 1,
  },
  grilla: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  item: {
    width: '31%',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  itemFoto: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  itemImagen: {
    width: '100%',
    height: '100%',
  },
  itemNombre: {
    ...typography.caption,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  itemUnidad: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  sugerirButton: {
    marginTop: spacing.sm,
    alignSelf: 'stretch',
  },
  sugerirButtonInline: {
    marginTop: spacing.md,
  },
  sugerirForm: {
    flex: 1,
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
  sugerenciaAyuda: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  sugerirAcciones: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sugerirAccionButton: {
    flex: 1,
  },
});
