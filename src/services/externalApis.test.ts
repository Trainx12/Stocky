/**
 * Tests de los wrappers a las Edge Functions (hoy son stubs, ver
 * supabase/functions/). Lo que se verifica acá no es la lógica de OCR/voz
 * en sí (no existe todavía), sino que cada wrapper llame a la función
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
  it('invoca voz-a-texto con el audio en el body', async () => {
    invoke.mockResolvedValue({ data: null, error: null });

    await interpretarComandoDeVoz('audio-en-base64');

    expect(invoke).toHaveBeenCalledWith('voz-a-texto', { body: { audio: 'audio-en-base64' } });
  });
});
