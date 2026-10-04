import type { ProductoCatalogo, UnidadProducto } from '../types/database';
import type { ProductoReconocido, VencimientoReconocido } from './externalApis';

/**
 * Lógica pura de la pantalla de revisión del ticket (EscanearTicketModal),
 * sacada acá para testearla con Jest igual que productos.ts/catalogo.ts.
 */

export const UNIDADES_DISPONIBLES: UnidadProducto[] = ['unidad', 'kg', 'g', 'l', 'ml', 'paquete'];

// Una línea del ticket lista para revisar. Si coincide con el catálogo,
// nombre/categoría/unidad salen de ahí; si no (`catalogo` null), el usuario
// los completa a mano y se guarda sin catálogo (catalogo_id nulo).
export interface CandidatoTicket {
  id: string;
  nombreDetectado: string;
  nombre: string;
  marca: string;
  cantidad: string; // texto editable, se parsea al confirmar (igual que ProductoFormModal)
  categoria: string;
  unidad: UnidadProducto;
  catalogo: ProductoCatalogo | null;
}

// Minúsculas y sin tildes/espacios de más: "LECHE  Entera" ~ "leche entera".
export function normalizarNombre(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'con', 'y', 'x', 'sin', 'por']);
const UNIDADES_EN_TICKET = new Set(['kg', 'g', 'gr', 'grs', 'l', 'lt', 'lts', 'ml', 'cc', 'un', 'unid', 'u', 'paq']);

// Palabras sueltas (con su forma original, para poder mostrarlas luego).
function palabras(texto: string): { original: string; clave: string }[] {
  return texto
    .split(/[^\p{L}\p{N}]+/u)
    .filter((original) => original.length > 0)
    .map((original) => ({ original, clave: normalizarNombre(original) }));
}

// Plural simple: "galletitas" -> "galletita", "papas" -> "papa".
function singular(clave: string): string {
  return clave.length > 3 && clave.endsWith('s') ? clave.slice(0, -1) : clave;
}

// Distancia de edición, para tolerar un error de OCR de una letra
// ("LECNE" ~ "leche") o variantes como "limones"/"limon".
function distancia(a: string, b: string): number {
  const previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = previa[0];
    previa[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temporal = previa[j];
      previa[j] = Math.min(previa[j] + 1, previa[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = temporal;
    }
  }
  return previa[b.length];
}

// Dos palabras "son la misma": iguales (ignorando plural) o, si son largas,
// a una letra de distancia.
function mismaPalabra(a: string, b: string): boolean {
  const sa = singular(a);
  const sb = singular(b);
  if (sa === sb) return true;
  return Math.min(sa.length, sb.length) >= 5 && distancia(sa, sb) <= 1;
}

function contiene(conjunto: string[], palabra: string): boolean {
  return conjunto.some((otra) => mismaPalabra(otra, palabra));
}

function clavesSignificativas(texto: string): string[] {
  return palabras(texto)
    .map((p) => p.clave)
    .filter((clave) => clave.length >= 2 && !PALABRAS_VACIAS.has(clave));
}

const LARGO_MINIMO_COINCIDENCIA = 3;

// Busca en el catálogo el producto que mejor representa a una línea del
// ticket, tolerando plural, orden de palabras y errores de OCR de una letra:
//   1. Gana el producto cuyas palabras están TODAS en la línea ("LECHE EN
//      POLVO SANCOR" -> "Leche en polvo" antes que "Leche"; el más específico).
//   2. Si no hay ninguno, vale que lo escrito sea parte de un nombre del
//      catálogo ("PAN" -> "Pan Francés"), prefiriendo el nombre más corto.
// No intenta ser perfecto: el usuario revisa antes de guardar.
export function buscarEnCatalogo(nombreDetectado: string, catalogo: ProductoCatalogo[]): ProductoCatalogo | null {
  const detectado = clavesSignificativas(nombreDetectado);
  if (normalizarNombre(nombreDetectado).length < LARGO_MINIMO_COINCIDENCIA || detectado.length === 0) return null;

  let mejor: ProductoCatalogo | null = null;
  let mejorPuntaje = 0;

  for (const item of catalogo) {
    const claves = clavesSignificativas(item.nombre);
    if (claves.length === 0 || !claves.every((clave) => contiene(detectado, clave))) continue;

    const puntaje = claves.join('').length;
    if (puntaje > mejorPuntaje) {
      mejor = item;
      mejorPuntaje = puntaje;
    }
  }
  if (mejor) return mejor;

  let masCorto: ProductoCatalogo | null = null;
  let largoMasCorto = Infinity;
  for (const item of catalogo) {
    const claves = clavesSignificativas(item.nombre);
    const largo = claves.join('').length;
    if (detectado.every((clave) => contiene(claves, clave)) && largo < largoMasCorto) {
      masCorto = item;
      largoMasCorto = largo;
    }
  }
  return masCorto;
}

function capitalizarPalabra(palabra: string): string {
  return palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
}

// Marca sugerida a partir del texto del ticket: lo que sobra de la línea
// después de sacar el nombre del producto, las cantidades y las unidades
// ("FIDEOS LUCCHETTI 500G" + "Fideos" -> "Lucchetti"). Es una sugerencia, el
// usuario la edita en la revisión.
export function extraerMarca(nombreDetectado: string, nombreProducto: string): string {
  const clavesProducto = clavesSignificativas(nombreProducto);

  return palabras(nombreDetectado)
    .filter(({ clave }) => {
      if (clave.length < 2 || PALABRAS_VACIAS.has(clave) || UNIDADES_EN_TICKET.has(clave)) return false;
      if (/^\d/.test(clave)) return false; // cantidades: "500g", "1", "2x"
      return !contiene(clavesProducto, clave);
    })
    .map(({ original }) => capitalizarPalabra(original))
    .join(' ');
}

// Nombre de un producto que no está en el catálogo, limpio de cantidades y
// unidades ("TORTUGUITA NOVILLO 1KG" -> "Tortuguita Novillo").
function nombreSinCatalogo(nombreDetectado: string): string {
  return palabras(nombreDetectado)
    .filter(({ clave }) => !UNIDADES_EN_TICKET.has(clave) && !/^\d/.test(clave))
    .map(({ original }) => capitalizarPalabra(original))
    .join(' ');
}

// Convierte lo que devolvió ocr-ticket en candidatos para revisar. Cantidad
// por defecto 1 cuando el ticket no la trae. Los que no están en el catálogo
// arrancan en categoría "Otros" / unidad "unidad" para que se corrijan a mano.
export function armarCandidatos(reconocidos: ProductoReconocido[], catalogo: ProductoCatalogo[]): CandidatoTicket[] {
  return reconocidos.map((reconocido, indice) => {
    const encontrado = buscarEnCatalogo(reconocido.nombre, catalogo);
    return {
      id: `${indice}-${reconocido.nombre}`,
      nombreDetectado: reconocido.nombre,
      nombre: encontrado ? encontrado.nombre : nombreSinCatalogo(reconocido.nombre),
      marca: encontrado ? extraerMarca(reconocido.nombre, encontrado.nombre) : '',
      cantidad: String(reconocido.cantidad ?? 1),
      categoria: encontrado ? encontrado.categoria : 'Otros',
      unidad: encontrado ? encontrado.unidad : 'unidad',
      catalogo: encontrado,
    };
  });
}

// Una fecha de vencimiento devuelta por Gemini solo se vuelca al formulario
// si tiene forma AAAA-MM-DD (el modelo a veces responde otra cosa aunque se
// le pida JSON): ante cualquier duda, el usuario la carga a mano.
export function fechaDetectadaValida(fecha: string | null | undefined): fecha is string {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const d = new Date(anio, mes - 1, dia);
  return d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia;
}

// Por debajo de esta confianza se prefiere no autocompletar nada: una fecha
// de vencimiento equivocada es peor que pedirla a mano (criterio de
// aceptación del Sprint 5, docs/plan-de-testing.md).
const CONFIANZA_MINIMA = 0.5;

// Fecha lista para volcar al formulario, o null si no hay que usarla.
export function fechaUtilizable(resultado: VencimientoReconocido): string | null {
  if (!fechaDetectadaValida(resultado.fecha_vencimiento)) return null;
  if (resultado.confianza !== undefined && resultado.confianza < CONFIANZA_MINIMA) return null;
  return resultado.fecha_vencimiento;
}
