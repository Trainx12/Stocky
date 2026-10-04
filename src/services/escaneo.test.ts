jest.mock('../lib/supabase', () => ({ supabase: {} }));

import type { ProductoCatalogo } from '../types/database';
import { armarCandidatos, buscarEnCatalogo, fechaDetectadaValida, fechaUtilizable, normalizarNombre } from './escaneo';

function item(nombre: string, extra: Partial<ProductoCatalogo> = {}): ProductoCatalogo {
  return {
    id: nombre,
    nombre,
    categoria: 'Almacén',
    unidad: 'unidad',
    imagen_url: null,
    estado: 'aprobado',
    sugerido_por: null,
    created_at: '2026-01-01',
    ...extra,
  };
}

const catalogo = [item('Leche'), item('Leche en polvo'), item('Arroz'), item('Pan Francés')];

describe('normalizarNombre', () => {
  it('pasa a minúsculas, saca tildes y espacios de más', () => {
    expect(normalizarNombre('  PAN   Francés ')).toBe('pan frances');
  });
});

describe('buscarEnCatalogo', () => {
  it('encuentra el producto cuando el catálogo está contenido en lo detectado', () => {
    expect(buscarEnCatalogo('ARROZ GALLO 1KG', catalogo)?.nombre).toBe('Arroz');
  });

  it('prefiere el nombre de catálogo más específico', () => {
    expect(buscarEnCatalogo('LECHE EN POLVO SANCOR', catalogo)?.nombre).toBe('Leche en polvo');
  });

  it('ignora tildes y mayúsculas', () => {
    expect(buscarEnCatalogo('PAN FRANCES', catalogo)?.nombre).toBe('Pan Francés');
  });

  it('devuelve null si no hay coincidencia', () => {
    expect(buscarEnCatalogo('SHAMPOO 400ML', catalogo)).toBeNull();
  });

  it('devuelve null para textos demasiado cortos', () => {
    expect(buscarEnCatalogo('ab', catalogo)).toBeNull();
  });
});

describe('armarCandidatos', () => {
  it('cruza cada línea con el catálogo y usa cantidad 1 por defecto', () => {
    const candidatos = armarCandidatos(
      [{ nombre: 'ARROZ GALLO 1KG', cantidad: 2 }, { nombre: 'Yerba Taragui' }],
      catalogo,
    );

    expect(candidatos).toHaveLength(2);
    expect(candidatos[0]).toMatchObject({ nombreDetectado: 'ARROZ GALLO 1KG', cantidad: '2' });
    expect(candidatos[0].catalogo?.nombre).toBe('Arroz');
    expect(candidatos[1]).toMatchObject({ cantidad: '1', catalogo: null });
  });

  it('devuelve lista vacía si no se detectó nada', () => {
    expect(armarCandidatos([], catalogo)).toEqual([]);
  });
});

describe('fechaDetectadaValida', () => {
  it('acepta una fecha real AAAA-MM-DD', () => {
    expect(fechaDetectadaValida('2026-12-31')).toBe(true);
  });

  it('rechaza null, formato incorrecto y fechas imposibles', () => {
    expect(fechaDetectadaValida(null)).toBe(false);
    expect(fechaDetectadaValida('31/12/2026')).toBe(false);
    expect(fechaDetectadaValida('2026-02-31')).toBe(false);
  });
});

describe('fechaUtilizable', () => {
  it('devuelve la fecha si es válida y la confianza alcanza (o no viene)', () => {
    expect(fechaUtilizable({ fecha_vencimiento: '2026-12-31', confianza: 0.9 })).toBe('2026-12-31');
    expect(fechaUtilizable({ fecha_vencimiento: '2026-12-31' })).toBe('2026-12-31');
  });

  it('devuelve null con confianza baja, fecha nula o inválida', () => {
    expect(fechaUtilizable({ fecha_vencimiento: '2026-12-31', confianza: 0.2 })).toBeNull();
    expect(fechaUtilizable({ fecha_vencimiento: null, confianza: 0.9 })).toBeNull();
    expect(fechaUtilizable({ fecha_vencimiento: 'mañana' })).toBeNull();
  });
});
