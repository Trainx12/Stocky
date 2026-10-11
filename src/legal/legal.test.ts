/**
 * Tests de src/legal/: los créditos de las fotos (que salen de
 * assets/catalogo/creditos.json) y la consistencia del texto de los
 * Términos y Condiciones.
 */
import { listarCreditos, resumenPorFuente, textoCredito } from './creditos';
import { SECCIONES_TERMINOS, SERVICIOS_USADOS, SOFTWARE_USADO, VERSION_TERMINOS } from './terminos';

const jsonDePrueba = {
  Zapallo: { archivo: 'zapallo.jpg', fuente: 'Wikimedia Commons', autor: 'Ana', licencia: 'CC BY 4.0', url: 'https://x/z' },
  Acelga: { archivo: 'acelga.jpg', fuente: 'Wikimedia Commons', autor: 'Bea', licencia: 'CC BY-SA 4.0', url: 'https://x/a' },
  Leche: { archivo: 'leche.jpg', fuente: 'Open Food Facts', autor: 'Contribuyentes', licencia: 'CC BY-SA 3.0', url: 'https://x/l' },
};

describe('créditos de fotos', () => {
  it('listarCreditos ordena por producto y conserva autor, licencia y enlace', () => {
    const lista = listarCreditos(jsonDePrueba);
    expect(lista.map((c) => c.producto)).toEqual(['Acelga', 'Leche', 'Zapallo']);
    expect(lista[0]).toEqual({ producto: 'Acelga', fuente: 'Wikimedia Commons', autor: 'Bea', licencia: 'CC BY-SA 4.0', url: 'https://x/a' });
  });

  it('resumenPorFuente cuenta por fuente, la más usada primero', () => {
    expect(resumenPorFuente(listarCreditos(jsonDePrueba))).toEqual([
      { fuente: 'Wikimedia Commons', cantidad: 2 },
      { fuente: 'Open Food Facts', cantidad: 1 },
    ]);
  });

  it('textoCredito nombra producto, autor, licencia y fuente', () => {
    expect(textoCredito(listarCreditos(jsonDePrueba)[0])).toBe('Acelga — Bea, CC BY-SA 4.0 (Wikimedia Commons)');
  });

  // Atribución obligatoria (CC BY / CC BY-SA): cada foto del catálogo real
  // tiene que tener autor y licencia, y las de terceros, enlace a la obra.
  it('el creditos.json real tiene autor y licencia en todas, y enlace en las de terceros', () => {
    const reales = listarCreditos();
    expect(reales.length).toBeGreaterThan(200);
    for (const c of reales) {
      expect(c.autor).toBeTruthy();
      expect(c.licencia).toBeTruthy();
      if (c.fuente !== 'Aportada por el equipo') expect(c.url).toMatch(/^https:\/\//);
    }
  });
});

describe('texto de los términos', () => {
  it('la versión tiene el formato que acepta la RPC aceptar_terminos (AAAA-MM-DD)', () => {
    expect(VERSION_TERMINOS).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('todas las secciones tienen título y texto', () => {
    expect(SECCIONES_TERMINOS.length).toBeGreaterThan(5);
    for (const s of SECCIONES_TERMINOS) {
      expect(s.titulo).toBeTruthy();
      expect(s.parrafos.length).toBeGreaterThan(0);
    }
  });

  it('cubre lo pedido: uso de la información, aporte de los usuarios y sugerencias revisadas por admins', () => {
    const todo = SECCIONES_TERMINOS.flatMap((s) => s.parrafos).join(' ');
    expect(todo).toMatch(/Para mejorar Stocky/);
    expect(todo).toMatch(/licencia gratuita/);
    expect(todo).toMatch(/revisan los administradores/);
    expect(todo).toMatch(/Ley 25\.326/);
  });

  it('los créditos de servicios y software tienen enlace', () => {
    for (const r of [...SERVICIOS_USADOS, ...SOFTWARE_USADO]) expect(r.url).toMatch(/^https:\/\//);
  });
});
