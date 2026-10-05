import { parsearTicket } from '../../supabase/functions/_shared/ticket';

// Texto tal como lo devolvió el OCR para un ticket real de La Genovesa
// (encabezado fiscal, productos con código de barras, una anulación y pie).
const TICKET_GENOVESA = `LA GENOVESA SUPERHERCADOS S.A.
C.U.I.T.: 33549507689
Ing. Brutos: 902-090424-9
La Genovesa
Oncativo 1942 - Lanus
ORIENTACION AL CONSUMIDOR PROVINCIA
DE BUENOS AIRES 0800-222-9042
IVA RESPONSABLE INSCRIPTO
A CONSUMIDOR FINAL
P.V. 0140 - No.T. 00286571
Fecha: 17/02/16 Hora: 17:50:45
Caja : 007 Oper : 106
30182 0.696 X 49.90
MANZANA RED PREMIUN (10.50) 34.73
779008006774
FLAN CASERO LIGHT DO (21.00) 14.50
FLAN CASERO LIGHT DO (21.00) 14.50
779808568014
JUGO CITRIC NARANJAx (21.00) 28.00
779394013329 6.000 X 12.49
YOGUR SER C/CEREAL M (21.00) 74.94
779394013329
YOGUR SER C/CEREAL M (21.00) 12.49
YOGUR SER C/CEREAL M (21.00) 12.49
7794013
SUNCH TURRON ARCORx5 (21.00) 16.00
779698900774
BIMBO FIT SALVADO ST (21.00) 37.90
779808568014
JUGO CITRIC NARANJAx (21.00) 28.00
204008800000 2.176 X 38.95
POLLO ENTRER.L.CAMEL (21.00) 84.76
Anula producto.............
(21.00) 0.00
779394013329 -2.000 X 12.49
YOGUR SER C/CEREAL M (21.00) -24.98
Subtot. 333.33
Subtot. 333.33
Subtot. 333.33
TOTAL $ 333.33
Visa $ 333.33
CAMBIO $ 0.00
Articulos:14
Cajero:14 Nombre: Cavallino_Fanny
HHW4804322 V: 01.00`;

describe('parsearTicket', () => {
  it('descarta encabezado y pie y deja solo los productos', () => {
    const nombres = parsearTicket(TICKET_GENOVESA).map((p) => p.nombre);

    expect(nombres).toEqual([
      'MANZANA RED PREMIUN',
      'FLAN CASERO LIGHT DO',
      'JUGO CITRIC NARANJA',
      'YOGUR SER C/CEREAL M',
      'SUNCH TURRON ARCOR',
      'BIMBO FIT SALVADO ST',
      'POLLO ENTRER.L.CAMEL',
    ]);
  });

  it('usa la cantidad de "N X precio", suma repetidos y resta anulaciones', () => {
    const por = Object.fromEntries(parsearTicket(TICKET_GENOVESA).map((p) => [p.nombre, p.cantidad]));

    expect(por['MANZANA RED PREMIUN']).toBe(0.696);
    expect(por['FLAN CASERO LIGHT DO']).toBe(2);
    expect(por['JUGO CITRIC NARANJA']).toBe(2);
    expect(por['YOGUR SER C/CEREAL M']).toBe(6); // 6 + 1 + 1 - 2
    expect(por['POLLO ENTRER.L.CAMEL']).toBe(2.176);
  });

  it('no mete direcciones, CUIT, medios de pago ni datos del cajero como productos', () => {
    const nombres = parsearTicket(TICKET_GENOVESA).map((p) => p.nombre.toLowerCase());
    const basura = ['genovesa', 'cuit', 'brutos', 'oncativo', 'consumidor', 'anula', 'subtot', 'total', 'visa', 'cambio', 'cajero'];

    for (const palabra of basura) {
      expect(nombres.some((n) => n.includes(palabra))).toBe(false);
    }
  });

  it('un producto anulado por completo no aparece', () => {
    const texto = `Caja: 1
LECHE ENTERA (21.00) 10.00
LECHE ENTERA (21.00) -10.00
TOTAL 0.00`;

    expect(parsearTicket(texto)).toEqual([]);
  });

  it('sin marcadores de inicio/fin igual descarta líneas sin precio', () => {
    const texto = `Supermercado Los Pinos
ARROZ GALLO 1KG 45.90
Gracias por su compra`;

    expect(parsearTicket(texto).map((p) => p.nombre)).toEqual(['ARROZ GALLO 1KG']);
  });

  it('acepta el precio en la línea siguiente', () => {
    const texto = `Fecha: 01/01/26
FIDEOS TALLARIN
 25.50
TOTAL 25.50`;

    expect(parsearTicket(texto).map((p) => p.nombre)).toEqual(['FIDEOS TALLARIN']);
  });

  it('encuentra los productos aunque el OCR deje precios e IVA fuera de la línea del nombre', () => {
    const texto = TICKET_GENOVESA.split('\n')
      .map((linea) => linea.replace(/\s*\(\d+\.\d+\)\s*-?\d+\.\d{2}$/, ''))
      .join('\n');
    const por = Object.fromEntries(parsearTicket(texto).map((p) => [p.nombre, p.cantidad]));

    expect(Object.keys(por)).toEqual([
      'MANZANA RED PREMIUN',
      'FLAN CASERO LIGHT DO',
      'JUGO CITRIC NARANJA',
      'YOGUR SER C/CEREAL M',
      'SUNCH TURRON ARCOR',
      'BIMBO FIT SALVADO ST',
      'POLLO ENTRER.L.CAMEL',
    ]);
    expect(por['YOGUR SER C/CEREAL M']).toBe(6);
    expect(por['FLAN CASERO LIGHT DO']).toBe(2);
  });

  it('devuelve vacío para texto vacío', () => {
    expect(parsearTicket('')).toEqual([]);
  });
});

describe('parsearTicket: direcciones y rótulos de sección', () => {
  it('no toma como producto la dirección del local ni rótulos como "Bebidas"', () => {
    const texto = `Fecha: 03/10/26
MINES CESAR
AY. SAN JUAN 3145 3 C
Bebidas
GASEOSA COLA REGULAR COCA COLA LATA X 05
CERVEZA DUNKEL MECKLENBURGER X 500 DO
TOTAL 5000.00`;
    const nombres = parsearTicket(texto).map((p) => p.nombre);

    expect(nombres.some((n) => /san juan|bebidas/i.test(n))).toBe(false);
    expect(nombres).toContain('GASEOSA COLA REGULAR COCA COLA LATA X 05');
    expect(nombres.some((n) => /cerveza/i.test(n))).toBe(true);
  });
});

describe('parsearTicket: ticket de restaurante (CANT / DESCRIPCION / PRECIO)', () => {
  const TICKET_RESTO = `ESTIMADO CLIENTE:
Por favor, avise si necesita Factura A ó B
Hágamos saber si abona c/Tarjeta de Créd.
A continuación, verifique su consumo...
=========================================
CANT DESCRIPCION PRECIO
=========================================
1.0 MILANESA
1.0 PAPAS FRITAS
1.J CORONA
1.0 GASEOSA GR
1.0 ADICIONAL LIMON
1.0 TOSTADO
1.0 CAFE JARRITO
950.00
400.00
600.00
500.00
100.00
450.00
140.00
...........................................
El Importe Total es de (pesos)... 3140.00
N.D.M. 29
¡Muchas gracias por su visita!`;

  it('detecta los renglones aunque los precios vengan en columna aparte', () => {
    const nombres = parsearTicket(TICKET_RESTO).map((p) => p.nombre);

    expect(nombres).toEqual(['MILANESA', 'PAPAS FRITAS', 'CORONA', 'GASEOSA GR', 'ADICIONAL LIMON', 'TOSTADO', 'CAFE JARRITO']);
  });

  it('toma la columna CANT como cantidad y no deja el total como producto', () => {
    const productos = parsearTicket(TICKET_RESTO);

    expect(productos.every((p) => p.cantidad === 1)).toBe(true);
    expect(productos.some((p) => /importe|total|gracias/i.test(p.nombre))).toBe(false);
  });

  it('también con el precio en la misma línea', () => {
    const texto = TICKET_RESTO.split('\n')
      .filter((l) => !/^\d+\.00$/.test(l))
      .join('\n')
      .replace('1.0 MILANESA', '1.0 MILANESA 950.00');
    const nombres = parsearTicket(texto).map((p) => p.nombre);

    expect(nombres[0]).toBe('MILANESA');
  });
});

describe('parsearTicket: tiquete electrónico (Super Mora)', () => {
  const ENCABEZADO = `SUPER MORA Colón
COMERCIAL ALEMORA S.A.
CIUDAD COLON, MORA
FRENTE AL MERCADO MUNICIPAL
C.J. 3-101-103492 2249-2459
Visítenos en www.supermora.com
TIQUETE ELECTRONICO
CLIENTE: GENERAL
FECHA: 24/11/2024 HORA: 3:09:23 pm
DB MXL31604CT Tr. No:00627067
Tiquete Electrónico en CONTINGENCIA`;

  const PIE = `IVA Incluido
e=0%, m=1%, p=2%
r=4%, g=13%
Artic/Petr.: 0
Importe: 12,846.70
Redondeo: 0.00
Tarjeta: 12,846.70
Cambio: 0.00
Pago:TARJETA
Total Cupones: 0
Usted ahorró en esta compra la suma de:
776.18 colones
SUBTOTAL..............: 12,719.50
IMPTO. VALOR AGREG. 1%.: 127.20`;

  const ESPERADOS = ['CEBOLLA SECA SUELTA KLS', 'MAYONESA LIZANO D-P LIM', 'PAN BAGUETTE CON QUESO', 'SALSA LIZANO 700 ml PL', 'TOMATE GRANEL KILOGRAMO'];

  it('con las columnas en el mismo renglón, con precios pegados a una letra y pares unitario/total', () => {
    const texto = `${ENCABEZADO}
Cnt Descripción Unitario Total
0.775 CEBOLLA SECA SUELTA KLS 1090.00 844.75m
1.000 MAYONESA LIZANO D-P LIM 1577.00 1577.00m
Ahorro Espec MAYONESA LIZANO D-P LIMO -227.09
1.000 PAN BAGUETTE CON QUESO 745.00 745.00m
1.000 SALSA LIZANO 700 ml PL 2199.00 2199.00m
Ahorro Espec SALSA LIZANO 700 ml PLA -549.09
3.405 TOMATE GRANEL KILOGRAMO 2425.00 8257.13m
${PIE}`;
    const productos = parsearTicket(texto);

    expect(productos.map((p) => p.nombre)).toEqual(ESPERADOS);
    expect(productos.map((p) => p.cantidad)).toEqual([0.775, 1, 1, 1, 3.405]);
  });

  it('con las columnas separadas por el OCR ("Total" suelto en el encabezado no corta el cuerpo)', () => {
    const texto = `${ENCABEZADO}
Ont Descripción
Unitario
Total
0.775 CEBOLLA SECA SUELTA KLS
1.000 MAYONESA LIZANO D-P LIM
Ahorro Espec MAYONESA LIZANO D-P LIMO
1.000 PAN BAGUETTE CON QUESO
1.000 SALSA LIZANO 700 ml PL
Ahorro Espec SALSA LIZANO 700 ml PLA
3.405 TOMATE GRANEL KILOGRAMO
1090.00 844.75m
1577.00 1577.00m
-227.09
${PIE}`;
    const productos = parsearTicket(texto);

    expect(productos.map((p) => p.nombre)).toEqual(ESPERADOS);
    expect(productos[0].cantidad).toBe(0.775);
    expect(productos[4].cantidad).toBe(3.405);
  });

  it('no deja códigos de terminal ni encabezados de columna como productos', () => {
    const texto = `${ENCABEZADO}
Ont Descripción
Unitario
Total
1.000 PAN BAGUETTE CON QUESO 745.00 745.00m
${PIE}`;
    const nombres = parsearTicket(texto).map((p) => p.nombre);

    expect(nombres).toEqual(['PAN BAGUETTE CON QUESO']);
  });
});
