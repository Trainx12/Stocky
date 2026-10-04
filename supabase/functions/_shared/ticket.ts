// Parser del texto crudo que devuelve el OCR de un ticket -> productos.
// Módulo puro (sin APIs de Deno ni imports) a propósito: así también lo
// testea Jest (src/services/ticketParser.test.ts).
//
// Un ticket tiene tres zonas: encabezado (razón social, CUIT, dirección,
// fecha/caja), cuerpo (los productos) y pie (subtotal, total, medio de pago,
// cajero). Solo el cuerpo interesa, y se lo aísla en tres pasos:
//   1. Zona: se descarta todo hasta la última línea de datos de la compra
//      (Caja/Oper/Fecha/Hora/P.V.) y todo desde el primer "Subtot."/"Total".
//   2. Líneas: dentro del cuerpo se ignoran las que son claramente otra cosa
//      (CUIT, "Anula producto", líneas con ":" o sin precio).
//   3. Cantidades: "6.000 X 12.49" antes de un producto es su cantidad, y las
//      repeticiones/anulaciones de un mismo producto se suman y restan.
// Nada de esto es perfecto (cada supermercado imprime distinto): la pantalla
// de revisión y que lo no reconocido arranque sin seleccionar son la red de
// seguridad.

export interface ProductoDetectado {
  nombre: string;
  cantidad?: number;
  unidad?: string;
}

const INICIO_DE_COMPRA = /^(caja|oper|fecha|hora|p\.?\s?v\.?\b|n[o°º]\.?\s?t\b|ticket|factura|comprobante|n[uú]mero)/i;
const FIN_DE_COMPRA = /^(sub\s*-?\s*tot|total|importe\s+total)/i;

const LINEAS_A_IGNORAR = [
  /c\.?\s?u\.?\s?i\.?\s?t/i,
  /ing(resos)?\.?\s*brutos/i,
  /\biva\b/i,
  /responsable|inscripto|monotribut|consumidor|orientaci[oó]n|defensa/i,
  /\b(s\.?\s?a\.?|s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?\s?s\.?)\s*$/i,
  /^anula/i,
  /(www\.|https?:|@)/i,
  /\btel[eé]?f?\.?\b/i,
  /^[\*\-=_.\s]+$/,
];

const UNIDADES_CONOCIDAS = ['kg', 'g', 'gr', 'l', 'lt', 'ml', 'un', 'unid', 'cc'];

function numero(texto: string): number {
  return parseFloat(texto.replace(',', '.'));
}

function clave(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Recorta encabezado y pie y devuelve solo las líneas del cuerpo.
function cuerpoDelTicket(lineas: string[]): string[] {
  // El marcador de inicio se busca solo en la primera parte: más adelante
  // una palabra como "fecha" ya no es encabezado.
  const limite = Math.ceil(lineas.length * 0.6);
  let inicio = 0;
  lineas.slice(0, limite).forEach((linea, indice) => {
    if (INICIO_DE_COMPRA.test(linea)) inicio = indice + 1;
  });

  const fin = lineas.findIndex((linea, indice) => indice >= inicio && FIN_DE_COMPRA.test(linea));
  return lineas.slice(inicio, fin === -1 ? lineas.length : fin);
}

export function parsearTicket(textoCrudo: string): ProductoDetectado[] {
  const lineas = textoCrudo
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean);
  const cuerpo = cuerpoDelTicket(lineas);

  const acumulado = new Map<string, ProductoDetectado>();
  let cantidadPendiente: number | undefined;

  for (let i = 0; i < cuerpo.length; i++) {
    const original = cuerpo[i];
    if (LINEAS_A_IGNORAR.some((patron) => patron.test(original))) continue;
    // Datos de la operación (Cajero:, Nombre:, Caja :) llevan ":"; un
    // producto casi nunca.
    if (original.includes(':')) continue;

    // Códigos de barras / de artículo largos: se sacan antes de leer nada.
    let resto = original.replace(/\b\d{6,}\b/g, ' ').trim();

    // "6.000 X 12.49" (cantidad x precio unitario): la cantidad del producto
    // que viene en esta línea o en la siguiente.
    let cantidad: number | undefined;
    const porPrecio = resto.match(/(-?\d+(?:[.,]\d+)?)\s*[xX]\s*\d+[.,]\d{2}\b/);
    if (porPrecio) {
      cantidad = numero(porPrecio[1]);
      resto = resto.replace(porPrecio[0], ' ');
    }

    // IVA entre paréntesis "(21.00)" y precio al final de la línea.
    const teniaIva = /\(\s*\d+(?:[.,]\d+)?\s*%?\s*\)/.test(resto);
    resto = resto.replace(/\(\s*\d+(?:[.,]\d+)?\s*%?\s*\)/g, ' ');
    const precioFinal = resto.match(/(-?)\s*\d+[.,]\d{2}\s*$/);
    if (precioFinal) resto = resto.replace(precioFinal[0], ' ');
    resto = resto.replace(/\s+/g, ' ').trim();

    // Sin letras = línea de solo cantidad/códigos: su cantidad es para el
    // próximo producto.
    if (!/[a-záéíóúñ]{3,}/i.test(resto)) {
      if (cantidad !== undefined) cantidadPendiente = cantidad;
      continue;
    }

    // Un nombre sin precio ni IVA en su línea solo vale si el precio viene
    // solo en la línea siguiente; si no, es texto suelto (dirección, nombre
    // del local, etc.).
    const precioEnLineaSiguiente = /^-?\d+[.,]\d{2}$/.test(cuerpo[i + 1] ?? '');
    if (!precioFinal && !teniaIva && !precioEnLineaSiguiente) continue;

    // OCR a veces pega una "x" minúscula al final de nombres en mayúscula
    // ("NARANJAx"), y "ARCORx5" es el tamaño del pack, no una cantidad.
    const nombre = resto.replace(/(?<=[A-Z])x\d*$/, '').trim();
    if (nombre.length < 3) continue;

    const anulacion = precioFinal ? precioFinal[1] === '-' : false;
    let cantidadLinea = cantidad ?? cantidadPendiente;
    if (cantidadLinea === undefined) cantidadLinea = anulacion ? -1 : 1;
    cantidadPendiente = undefined;

    const unidadEnNombre = nombre.match(new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*(${UNIDADES_CONOCIDAS.join('|')})\\b`, 'i'));

    const k = clave(nombre);
    const previo = acumulado.get(k);
    if (previo) {
      previo.cantidad = (previo.cantidad ?? 0) + cantidadLinea;
    } else {
      acumulado.set(k, { nombre, cantidad: cantidadLinea, unidad: unidadEnNombre?.[1].toLowerCase() });
    }
  }

  // Lo anulado por completo (suma <= 0) no se compró.
  return Array.from(acumulado.values()).filter((p) => (p.cantidad ?? 0) > 0);
}
