import { supabase } from '../lib/supabase';
import type { ProductoCatalogo, UnidadProducto } from '../types/database';

/**
 * Catálogo GLOBAL de productos (no es por hogar, ver migración
 * 20260909212018_catalogo_productos.sql): cargar un producto en un hogar ya
 * no es texto libre -- se elige una fila 'aprobado' de acá. Si el producto
 * buscado no está, se puede sugerir (queda 'pendiente' hasta que un admin
 * lo apruebe o lo rechace, ver AdminSugerenciasScreen).
 */

// Datos que completa el usuario al sugerir un producto nuevo.
export interface DatosSugerencia {
  nombre: string;
  categoria: string;
  unidad: UnidadProducto;
  // Foto opcional del producto (JPEG en base64, ver lib/fotos.ts).
  fotoBase64?: string | null;
}

// Bucket público donde se guardan las fotos de las sugerencias (ver migración
// 20260916120000_fotos_sugerencias.sql): cada usuario sube a su carpeta.
const BUCKET_SUGERENCIAS = 'catalogo-sugerencias';

// 'AAAA...' (base64) -> bytes, para subir a Storage sin pasar por Blob (que
// en React Native no se arma bien a partir de datos binarios).
function base64ABytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

// Ruta dentro del bucket a partir de la URL pública de una foto de
// sugerencia, o null si la URL no es de ese bucket (por ejemplo, una foto del
// catálogo original) -- así nunca se intenta borrar algo que no es nuestro.
export function rutaDeFotoSugerencia(url: string | null | undefined): string | null {
  const marca = `/storage/v1/object/public/${BUCKET_SUGERENCIAS}/`;
  const posicion = url?.indexOf(marca) ?? -1;
  if (!url || posicion < 0) return null;
  return decodeURIComponent(url.slice(posicion + marca.length).split('?')[0]);
}

// Sube la foto a la carpeta del usuario y devuelve su URL pública.
async function subirFotoSugerencia(userId: string, fotoBase64: string): Promise<string> {
  const ruta = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET_SUGERENCIAS)
    .upload(ruta, base64ABytes(fotoBase64), { contentType: 'image/jpeg' });
  if (error) throw new Error(`No se pudo subir la foto: ${error.message}`);
  return supabase.storage.from(BUCKET_SUGERENCIAS).getPublicUrl(ruta).data.publicUrl;
}

// Recorta y valida antes de pegarle a Supabase -- mismo criterio que
// validar() en services/productos.ts.
function validarSugerencia(datos: DatosSugerencia): { nombre: string; categoria: string } {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new Error('El nombre del producto no puede estar vacío');

  const categoria = datos.categoria.trim();
  if (!categoria) throw new Error('Elegí una categoría para el producto');

  return { nombre, categoria };
}

// Catálogo aprobado, para el selector de ProductoFormModal. Se trae
// completo (hoy son ~70 filas, ver plan-de-testing.md sobre las escalas
// esperadas de este proyecto) y se filtra/agrupa del lado del cliente,
// mismo criterio que listarProductos + filtrarProductos.
export async function listarCatalogoAprobado(): Promise<ProductoCatalogo[]> {
  const { data, error } = await supabase
    .from('productos_catalogo')
    .select('*')
    .eq('estado', 'aprobado')
    .order('categoria', { ascending: true })
    .order('nombre', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// Sugiere un producto nuevo para el catálogo. Queda 'pendiente' siempre
// (la policy "productos_catalogo_insert_propio_pendiente" ya lo fuerza del
// lado del servidor, esto es solo para que el insert sea explícito) hasta
// que un admin lo apruebe o lo rechace.
export async function sugerirProducto(datos: DatosSugerencia): Promise<ProductoCatalogo> {
  const { nombre, categoria } = validarSugerencia(datos);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const userId = userData.user?.id;
  if (!userId) throw new Error('No se pudo identificar al usuario logueado');

  // La foto va primero: la sugerencia guarda su URL. Si después falla el
  // alta, se borra la foto para no dejarla huérfana en el bucket.
  const imagenUrl = datos.fotoBase64 ? await subirFotoSugerencia(userId, datos.fotoBase64) : null;

  const { data, error } = await supabase
    .from('productos_catalogo')
    .insert({
      nombre,
      categoria,
      unidad: datos.unidad,
      estado: 'pendiente',
      sugerido_por: userId,
      ...(imagenUrl ? { imagen_url: imagenUrl } : {}),
    })
    .select()
    .single();

  if (error) {
    const ruta = rutaDeFotoSugerencia(imagenUrl);
    if (ruta) await supabase.storage.from(BUCKET_SUGERENCIAS).remove([ruta]);
    throw error;
  }
  return data;
}

// Lista las sugerencias pendientes (para la pantalla de admin). No hace
// falta filtrar por admin acá: la policy de SELECT ya solo deja ver las
// filas 'pendiente' de OTROS usuarios a una cuenta admin (un usuario común
// solo vería, vía esa misma policy, sus propias sugerencias pendientes,
// nunca las de otro).
export async function listarSugerenciasPendientes(): Promise<ProductoCatalogo[]> {
  const { data, error } = await supabase
    .from('productos_catalogo')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// Aprueba o rechaza una sugerencia puntual. Solo puede hacerlo un admin
// (lo valida la policy de UPDATE/DELETE del lado del servidor, no acá).
// Aprobar pasa la fila a 'aprobado' (ya aparece en el selector de todos);
// rechazar borra la fila directamente -- quien la sugirió puede volver a
// mandarla más adelante si quiere. Al rechazar también se borra su foto (al
// aprobar se queda: pasa a ser la foto del producto en el catálogo).
export async function responderSugerencia(id: string, aprobar: boolean, imagenUrl?: string | null): Promise<void> {
  if (aprobar) {
    const { error } = await supabase.from('productos_catalogo').update({ estado: 'aprobado' }).eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('productos_catalogo').delete().eq('id', id);
    if (error) throw error;
    const ruta = rutaDeFotoSugerencia(imagenUrl);
    // Si no se puede borrar la foto, la sugerencia igual quedó rechazada:
    // una foto suelta en el bucket no rompe nada.
    if (ruta) await supabase.storage.from(BUCKET_SUGERENCIAS).remove([ruta]);
  }
}

/**
 * Lógica pura del selector de catálogo (ProductoFormModal), sacada acá
 * para poder testearla con Jest, mismo patrón que productos.ts.
 */

// Categorías presentes en el catálogo, sin duplicados y ordenadas
// alfabéticamente -- para los chips de filtro del selector.
export function categoriasDelCatalogo(catalogo: ProductoCatalogo[]): string[] {
  const vistas = new Set(catalogo.map((p) => p.categoria));
  return Array.from(vistas).sort((a, b) => a.localeCompare(b));
}

// Filtra el catálogo por texto libre (nombre) y opcionalmente por
// categoría exacta -- mismo criterio que filtrarProductos en productos.ts.
export function filtrarCatalogo(catalogo: ProductoCatalogo[], busqueda: string, categoria: string | null): ProductoCatalogo[] {
  const busquedaNormalizada = busqueda.trim().toLowerCase();
  return catalogo.filter((p) => {
    const coincideBusqueda = !busquedaNormalizada || p.nombre.toLowerCase().includes(busquedaNormalizada);
    const coincideCategoria = !categoria || p.categoria === categoria;
    return coincideBusqueda && coincideCategoria;
  });
}
