jest.mock('../lib/supabase', () => ({ supabase: {} }));

import type { ProductoCatalogo } from '../types/database';
import {
  armarCandidatos,
  buscarEnCatalogo,
  extraerMarca,
  fechaDetectadaValida,
  fechaUtilizable,
  normalizarNombre,
} from './escaneo';

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

const catalogo = [
  item('Leche'),
  item('Leche en polvo'),
  item('Arroz'),
  item('Pan Francés'),
  item('Galletitas de Agua'),
  item('Limón'),
  item('Fideos', { categoria: 'Otros', unidad: 'paquete' }),
];

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

  it('tolera plural, orden de palabras y palabras vacías', () => {
    expect(buscarEnCatalogo('GALLETITA AGUA 300G', catalogo)?.nombre).toBe('Galletitas de Agua');
    expect(buscarEnCatalogo('AGUA GALLETITAS', catalogo)?.nombre).toBe('Galletitas de Agua');
    expect(buscarEnCatalogo('LIMONES', catalogo)?.nombre).toBe('Limón');
  });

  it('tolera un error de OCR de una letra', () => {
    expect(buscarEnCatalogo('LECNE ENTERA', catalogo)?.nombre).toBe('Leche');
  });

  it('si lo escrito es parte de un nombre del catálogo, elige el más corto', () => {
    expect(buscarEnCatalogo('PAN', catalogo)?.nombre).toBe('Pan Francés');
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

  it('solo lo que está en el catálogo arranca incluido; lo demás hay que agregarlo a propósito', () => {
    const [conCatalogo, sinCatalogo] = armarCandidatos([{ nombre: 'ARROZ 1KG' }, { nombre: 'LA GENOVESA' }], catalogo);

    expect(conCatalogo.incluir).toBe(true);
    expect(sinCatalogo.incluir).toBe(false);
  });

  it('para un producto del catálogo toma nombre/categoría/unidad de ahí y sugiere la marca', () => {
    const [fideos] = armarCandidatos([{ nombre: 'FIDEOS LUCCHETTI 500G' }], catalogo);

    expect(fideos).toMatchObject({ nombre: 'Fideos', marca: 'Lucchetti', categoria: 'Otros', unidad: 'paquete' });
  });

  it('para uno fuera del catálogo arma un nombre limpio y deja categoría Otros / unidad para corregir', () => {
    const [carne] = armarCandidatos([{ nombre: 'TORTUGUITA NOVILLO 1KG' }], catalogo);

    expect(carne).toMatchObject({ nombre: 'Tortuguita Novillo', marca: '', categoria: 'Otros', unidad: 'unidad', catalogo: null });
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

describe('extraerMarca', () => {
  it('saca el nombre del producto, cantidades y unidades', () => {
    expect(extraerMarca('ARROZ GALLO 1KG', 'Arroz')).toBe('Gallo');
    expect(extraerMarca('2 x LECHE LA SERENISIMA 1L', 'Leche')).toBe('Serenisima');
  });

  it('devuelve vacío si no sobra nada', () => {
    expect(extraerMarca('ARROZ 1KG', 'Arroz')).toBe('');
  });
});

describe('buscarEnCatalogo con alimentos agregados desde tickets reales', () => {
  const ampliado = [
    ...catalogo,
    item('Aceite'),
    item('Aceite de Oliva'),
    item('Pimiento'),
    item('Pimienta Negra'),
    item('Pasta para Sopa'),
    item('Flan'),
    item('Choclo'),
    item('Choclo en Lata'),
    item('Té'),
    item('Té Verde'),
  ];

  it('elige el nombre más específico entre uno general y uno con aclaración', () => {
    expect(buscarEnCatalogo('BRAVO ACEITE OLIVA', ampliado)?.nombre).toBe('Aceite de Oliva');
    expect(buscarEnCatalogo('ACEITE VEGETAL COMES', ampliado)?.nombre).toBe('Aceite');
    expect(buscarEnCatalogo('CHOCLO EN LATA 300G', ampliado)?.nombre).toBe('Choclo en Lata');
    expect(buscarEnCatalogo('TE VERDE 20 SAQUITOS', ampliado)?.nombre).toBe('Té Verde');
  });

  it('no confunde pimiento (verdura) con pimienta (especia)', () => {
    expect(buscarEnCatalogo('PIMIENTO ROJO', ampliado)?.nombre).toBe('Pimiento');
    expect(buscarEnCatalogo('PIMIENTA NEGRA MOLIDA 50G', ampliado)?.nombre).toBe('Pimienta Negra');
  });

  it('reconoce los productos que antes quedaban sin catálogo', () => {
    expect(buscarEnCatalogo('PASTAS PARA SOPA SPA', ampliado)?.nombre).toBe('Pasta para Sopa');
    expect(buscarEnCatalogo('FLAN CASERO LIGHT DO', ampliado)?.nombre).toBe('Flan');
  });
});
