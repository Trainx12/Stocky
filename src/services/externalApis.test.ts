/**
 * Tests de los wrappers a las Edge Functions (ver supabase/functions/). Lo
 * que se verifica acá no es la lógica de OCR/voz en sí (vive en el
 * servidor), sino que cada wrapper llame a la función
 * correcta con el body correcto, y que un error de la Edge Function se
 * propague en vez de tragarse en silencio.
 */
jest.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import { supabase } from '../lib/supabase';
import {
  interpretarComandoDeVoz,
  reconocerFechaPorVoz,
  reconocerProductosDeTicket,
  reconocerVencimientoDeFoto,
} from './externalApis';

const invoke = supabase.functions.invoke as jest.Mock;

beforeEach(() => {
  invoke.mockReset();
});

describe('reconocerProductosDeTicket', () => {
  it('invoca ocr-ticket con la imagen en el body y devuelve los candidatos', async () => {
    invoke.mockResolvedValue({ data: [{ nombre: 'Leche' }], error: null });

    const productos = await reconocerProductosDeTicket('imagen-en-base64');

    expect(invoke).toHaveBeenCalledWith('ocr-ticket', { body: { imagen: 'imagen-en-base64' } });
    expect(productos).toEqual([{ nombre: 'Leche' }]);
  });

  it('propaga el error si la Edge Function falla', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('ocr caído') });

    await expect(reconocerProductosDeTicket('x')).rejects.toThrow('ocr caído');
  });
});

describe('reconocerVencimientoDeFoto', () => {
  it('invoca vencimiento-foto con la imagen en el body', async () => {
    invoke.mockResolvedValue({ data: { fecha_vencimiento: null }, error: null });

    await reconocerVencimientoDeFoto('imagen-envase');

    expect(invoke).toHaveBeenCalledWith('vencimiento-foto', { body: { imagen: 'imagen-envase' } });
  });
});

describe('interpretarComandoDeVoz', () => {
  const audio = { base64: 'audio-en-base64', mimeType: 'audio/webm' };

  it('invoca voz-a-texto con el audio, el inventario y la fecha de hoy', async () => {
    invoke.mockResolvedValue({ data: { transcripcion: 'agregá leche', acciones: [] }, error: null });

    const productos = [{ id: 'p1', nombre: 'Leche', marca: null, cantidad: 1, unidad: 'l', fecha_vencimiento: null }];
    const resultado = await interpretarComandoDeVoz(audio, productos, '2026-10-05');

    expect(invoke).toHaveBeenCalledWith('voz-a-texto', {
      body: { audio: 'audio-en-base64', mimeType: 'audio/webm', modo: 'comando', productos, hoy: '2026-10-05' },
    });
    expect(resultado).toEqual({ transcripcion: 'agregá leche', acciones: [] });
  });

  it('devuelve una lista vacía si la función no trae acciones', async () => {
    invoke.mockResolvedValue({ data: null, error: null });

    await expect(interpretarComandoDeVoz(audio, [], '2026-10-05')).resolves.toEqual({ transcripcion: '', acciones: [] });
  });
});

describe('reconocerFechaPorVoz', () => {
  it('invoca voz-a-texto en modo fecha', async () => {
    invoke.mockResolvedValue({ data: { transcripcion: 'quince de noviembre', fecha_vencimiento: '2026-11-15', confianza: 0.9 }, error: null });

    const resultado = await reconocerFechaPorVoz({ base64: 'a', mimeType: 'audio/aac' }, '2026-10-05');

    expect(invoke).toHaveBeenCalledWith('voz-a-texto', {
      body: { audio: 'a', mimeType: 'audio/aac', modo: 'fecha', hoy: '2026-10-05' },
    });
    expect(resultado.fecha_vencimiento).toBe('2026-11-15');
  });
});

describe('mensaje de error de las Edge Functions', () => {
  it('muestra el mensaje del body de la función en vez del genérico non-2xx', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: { json: async () => ({ error: 'No pudimos leer la fecha en este momento. Ingresala a mano.' }) },
    });
    invoke.mockResolvedValue({ data: null, error });

    await expect(reconocerVencimientoDeFoto('x')).rejects.toThrow('No pudimos leer la fecha en este momento');
  });

  it('si el body no se puede leer, propaga el error original', async () => {
    const error = Object.assign(new Error('non-2xx'), { context: { json: async () => { throw new Error('no json'); } } });
    invoke.mockResolvedValue({ data: null, error });

    await expect(reconocerProductosDeTicket('x')).rejects.toThrow('non-2xx');
  });
});
