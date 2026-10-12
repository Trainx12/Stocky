/**
 * "Gana el último pedido": cuando la misma consulta se dispara varias veces
 * seguidas y las respuestas pueden llegar desordenadas, solo se usa la del
 * pedido más nuevo.
 *
 * Caso real (incidentes-sprint10.md #18): al iniciar sesión, AuthContext
 * pide el perfil varias veces seguidas (sesión inicial, login, renovación del
 * token). Si una respuesta VIEJA llegaba después de una nueva, pisaba datos
 * actualizados: por ejemplo, volvía a decir "no aceptó los términos" justo
 * después de aceptarlos, y la pantalla de términos quedaba trabada.
 *
 *   const pedidos = crearUltimoPedido();
 *   const turno = pedidos.nuevo();
 *   const datos = await consultar();
 *   if (!pedidos.esVigente(turno)) return; // llegó otro pedido después
 */
export interface UltimoPedido {
  nuevo: () => number;
  esVigente: (turno: number) => boolean;
}

export function crearUltimoPedido(): UltimoPedido {
  let ultimo = 0;
  return {
    nuevo: () => ++ultimo,
    esVigente: (turno) => turno === ultimo,
  };
}
