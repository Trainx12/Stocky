import { useMemo } from 'react';
import { useTema } from '../context/TemaContext';

/**
 * Estilos que se adaptan al modo claro/oscuro. Cada componente define sus
 * estilos como una FUNCIÓN (`const crearEstilos = () => StyleSheet.create({...})`)
 * en vez de un objeto armado al cargar el archivo, y los usa con:
 *
 *   const styles = useEstilos(crearEstilos);
 *
 * Al cambiar el esquema, el componente se vuelve a renderizar y la función
 * se vuelve a llamar con los valores nuevos de `colors`. Mientras el esquema
 * no cambie, se reutilizan los mismos estilos (useMemo).
 */
export function useEstilos<T>(crearEstilos: () => T): T {
  const { esquema } = useTema();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- se recalcula solo al cambiar el esquema
  return useMemo(crearEstilos, [esquema]);
}
