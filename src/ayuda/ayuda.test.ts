/**
 * Tests de src/ayuda/contenido.ts: que cada tema de la ayuda esté completo,
 * que sus íconos existan en Ionicons (si no, se vería un cuadrado vacío) y
 * que el buscador encuentre por palabra sin importar tildes ni mayúsculas.
 */
import glyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json';
import { buscarEnAyuda, TEMAS_AYUDA } from './contenido';

describe('contenido de la ayuda', () => {
  it('cada tema tiene id único, título, resumen y al menos un paso', () => {
    const ids = TEMAS_AYUDA.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tema of TEMAS_AYUDA) {
      expect(tema.titulo).toBeTruthy();
      expect(tema.resumen).toBeTruthy();
      expect(tema.pasos.length).toBeGreaterThan(0);
      for (const paso of tema.pasos) expect(paso.trim()).toBeTruthy();
    }
  });

  it('todos los íconos existen en Ionicons', () => {
    for (const tema of TEMAS_AYUDA) {
      expect(Object.keys(glyphs)).toContain(tema.icono);
    }
  });

  it('explica el acceso rápido para escanear tickets y los botones de la fecha', () => {
    const todo = TEMAS_AYUDA.flatMap((t) => t.pasos).join(' ');
    expect(todo).toContain('"Escanear ticket"');
    expect(todo).toContain('"Calendario"');
    expect(todo).toContain('"Dictar"');
  });
});

describe('buscarEnAyuda', () => {
  it('sin búsqueda devuelve todos los temas', () => {
    expect(buscarEnAyuda(TEMAS_AYUDA, '  ')).toHaveLength(TEMAS_AYUDA.length);
  });

  it('encuentra por palabra, sin importar tildes ni mayúsculas', () => {
    expect(buscarEnAyuda(TEMAS_AYUDA, 'TICKET').map((t) => t.id)).toContain('ticket');
    expect(buscarEnAyuda(TEMAS_AYUDA, 'contrasena oscuro').length).toBe(0);
    expect(buscarEnAyuda(TEMAS_AYUDA, 'invitacion').map((t) => t.id)).toContain('miembros');
  });

  it('busca también en los pasos y consejos', () => {
    expect(buscarEnAyuda(TEMAS_AYUDA, 'sugerilo').map((t) => t.id)).toContain('agregar-a-mano');
  });
});
