import creditosCatalogo from '../../assets/catalogo/creditos.json';

/**
 * Créditos de las fotos del catálogo para la sección final de los Términos
 * y Condiciones. La fuente de verdad es assets/catalogo/creditos.json (la
 * misma que genera CREDITOS.md con scripts/generar-imagenes-catalogo.mjs):
 * no se copia a mano, se importa, así una foto nueva aparece sola.
 *
 * Las licencias CC BY / CC BY-SA exigen nombrar al autor, la licencia y
 * enlazar a la obra: por eso cada foto se lista con esos tres datos.
 */

export interface CreditoFoto {
  producto: string;
  fuente: string;
  autor: string;
  licencia: string;
  url: string;
}

type CreditosJson = Record<string, { archivo: string; fuente: string; autor: string; licencia: string; url: string }>;

// Convierte el JSON (producto -> datos) en una lista ordenada por producto.
export function listarCreditos(json: CreditosJson = creditosCatalogo as CreditosJson): CreditoFoto[] {
  return Object.entries(json)
    .map(([producto, c]) => ({ producto, fuente: c.fuente, autor: c.autor, licencia: c.licencia, url: c.url }))
    .sort((a, b) => a.producto.localeCompare(b.producto, 'es'));
}

// Cuántas fotos hay de cada fuente ("Wikimedia Commons: 140"), para el
// resumen que va arriba de la lista completa.
export function resumenPorFuente(creditos: CreditoFoto[]): { fuente: string; cantidad: number }[] {
  const conteo = new Map<string, number>();
  for (const c of creditos) conteo.set(c.fuente, (conteo.get(c.fuente) ?? 0) + 1);
  return Array.from(conteo, ([fuente, cantidad]) => ({ fuente, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
}

// Una línea de crédito legible: "Acelga — Grendelkhan, CC BY-SA 4.0 (Wikimedia Commons)".
export function textoCredito(c: CreditoFoto): string {
  return `${c.producto} — ${c.autor}, ${c.licencia} (${c.fuente})`;
}
