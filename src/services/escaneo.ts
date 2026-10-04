import type { ProductoCatalogo } from '../types/database';
import type { ProductoReconocido, VencimientoReconocido } from './externalApis';

/**
 * Lógica pura de la pantalla de revisión del ticket (EscanearTicketModal),
 * sacada acá para testearla con Jest igual que productos.ts/catalogo.ts.
 */

// Una línea del ticket ya cruzada contra el catálogo. `catalogo` null = no
// se encontró un producto equivalente: no se puede guardar porque todo
// producto del hogar sale del catálogo (ver ProductoFormModal).
export interface CandidatoTicket {
  id: string;
  nombreDetectado: string;
  cantidad: string; // texto editable, se parsea al confirmar (igual que ProductoFormModal)
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

const LARGO_MINIMO_COINCIDENCIA = 3;

// Busca en el catálogo el producto que mejor representa a una línea del
// ticket. Coincide si el nombre del catálogo está contenido en lo detectado
// ("LECHE LA SERENISIMA 1L" -> "Leche") o al revés; si hay varias gana el
// nombre de catálogo más largo (el más específico: "Leche en polvo" antes
// que "Leche"). No intenta ser perfecto: el usuario revisa antes de guardar.
export function buscarEnCatalogo(nombreDetectado: string, catalogo: ProductoCatalogo[]): ProductoCatalogo | null {
  const detectado = normalizarNombre(nombreDetectado);
  if (detectado.length < LARGO_MINIMO_COINCIDENCIA) return null;

  let mejor: ProductoCatalogo | null = null;
  let mejorLargo = 0;

  for (const item of catalogo) {
    const nombreCatalogo = normalizarNombre(item.nombre);
    if (nombreCatalogo.length < LARGO_MINIMO_COINCIDENCIA) continue;

    const coincide = detectado.includes(nombreCatalogo) || nombreCatalogo.includes(detectado);
    if (coincide && nombreCatalogo.length > mejorLargo) {
      mejor = item;
      mejorLargo = nombreCatalogo.length;
    }
  }

  return mejor;
}

// Convierte lo que devolvió ocr-ticket en candidatos para revisar. Cantidad
// por defecto 1 cuando el ticket no la trae.
export function armarCandidatos(reconocidos: ProductoReconocido[], catalogo: ProductoCatalogo[]): CandidatoTicket[] {
  return reconocidos.map((reconocido, indice) => ({
    id: `${indice}-${reconocido.nombre}`,
    nombreDetectado: reconocido.nombre,
    cantidad: String(reconocido.cantidad ?? 1),
    catalogo: buscarEnCatalogo(reconocido.nombre, catalogo),
  }));
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
