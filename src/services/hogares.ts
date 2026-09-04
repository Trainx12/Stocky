import { supabase } from '../lib/supabase';
import type { Hogar, RolHogar } from '../types/database';

// Un Hogar tal como lo ve el usuario logueado, con el rol que tiene EN ESE
// hogar (puede ser "dueno" en uno e "invitado" en otro). Ver migración
// 20260827140000_hogares_jerarquia.sql.
export interface HogarConRol extends Hogar {
  miRol: RolHogar;
  // Si YO (el usuario logueado) puedo editar el nombre de ESTE hogar: soy
  // dueño, o soy invitado con el permiso habilitado (ver migración
  // 20260828120000_permisos_editar_hogar.sql).
  puedoEditar: boolean;
  // Cuántas solicitudes de ingreso están esperando respuesta en ESTE hogar.
  // Siempre 0 si miRol no es "dueno": solo el dueño resuelve solicitudes
  // (ver HogarMiembrosModal), así que a un invitado ni se le consulta.
  solicitudesPendientes: number;
}

// Un miembro YA ACEPTADO de un hogar (estado 'aprobado'), para la pantalla
// "Miembros del hogar" (ver listarMiembrosDeHogar). nombre puede ser null
// (todavía no lo completó). No incluye a quienes tienen una solicitud
// pendiente -- eso es SolicitudPendiente, más abajo.
export interface MiembroHogar {
  usuarioId: string;
  rol: RolHogar;
  // Si este invitado puede editar el nombre del hogar. Siempre false para
  // el dueño en los datos crudos (no se usa: el dueño ya puede editar
  // siempre, sin importar este campo).
  puedeEditar: boolean;
  nombre: string | null;
  email: string;
}

// Alguien que se sumó a un hogar por código pero todavía espera que el
// dueño lo acepte o lo rechace (ver migración
// 20260903120000_solicitudes_hogar.sql). Para la sección "Solicitudes
// pendientes" de "Miembros del hogar".
export interface SolicitudPendiente {
  usuarioId: string;
  nombre: string | null;
  email: string;
}

// Una solicitud que YO mandé (uniéndome por código) y que todavía no
// respondió el dueño del hogar destino. Para mostrarle al invitado "tu
// solicitud a X está pendiente" mientras espera.
export interface MiSolicitudPendiente {
  hogarId: string;
  nombreHogar: string;
}

/**
 * RF6 — un usuario puede pertenecer a más de un hogar: crear uno propio y
 * además unirse a otros ya existentes (por código de invitación).
 *
 * Las tres operaciones que modifican membresía (crear/unirse/salir) se
 * resuelven con una función de Postgres (RPC), no con .insert()/.update()
 * sueltos desde acá: cada una toca más de una tabla a la vez (hogares +
 * hogar_miembros, o usuarios + hogar_miembros) y necesita ser atómica.
 * Ver supabase/migrations/20260826130000_hogares_multi_membresia.sql.
 */

// Crea un hogar nuevo y suma al usuario logueado como su primer miembro.
export async function crearHogar(nombre: string): Promise<Hogar> {
  const { data, error } = await supabase.rpc('crear_hogar', { p_nombre: nombre });
  if (error) throw error;
  return data;
}

// Manda una solicitud para unirse a un hogar existente, a partir del código
// corto de invitación (no del uuid). Ya NO suma como miembro directo (ver
// migración 20260903120000_solicitudes_hogar.sql): queda en estado
// 'pendiente' hasta que el dueño la acepte o la rechace (responderSolicitud).
// El hogar devuelto es el destino de la solicitud, no un hogar del que el
// usuario ya sea miembro.
export async function unirseAHogar(codigo: string): Promise<Hogar> {
  const { data, error } = await supabase.rpc('unirse_a_hogar', { p_codigo: codigo });
  if (error) throw error;
  return data;
}

// Da de baja al usuario logueado de un hogar puntual (no borra el hogar
// en sí, solo su membresía). Si era su hogar activo, el backend reasigna
// solo cuál pasa a serlo (ver salir_de_hogar en la migración).
export async function salirDeHogar(hogarId: string): Promise<void> {
  const { error } = await supabase.rpc('salir_de_hogar', { p_hogar_id: hogarId });
  if (error) throw error;
}

// Cambia el nombre de un hogar existente. A diferencia de crear/unirse/salir,
// esto es un update de una sola tabla y una sola fila: no necesita una RPC
// para ser atómico, alcanza con el .update() directo — la policy
// "hogares_update_dueno_o_permitido_o_admin" (ver migración
// 20260828120000_permisos_editar_hogar.sql) ya exige ser dueño, o invitado
// con el permiso habilitado, o admin. Si un invitado sin permiso intenta
// editar igual, Postgres rechaza el update y el error llega acá como
// excepción (mensaje genérico de RLS, no uno lindo — no hay forma de
// distinguirlo de "el hogar no existe" del lado del cliente).
export async function editarHogar(hogarId: string, nombre: string): Promise<Hogar> {
  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) throw new Error('El nombre del hogar no puede estar vacío');

  const { data, error } = await supabase
    .from('hogares')
    .update({ nombre: nombreLimpio })
    .eq('id', hogarId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Lista todos los hogares a los que pertenece el usuario logueado (no
// solo el "activo"), con el rol que tiene en cada uno.
export async function listarMisHogares(): Promise<HogarConRol[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const userId = userData.user?.id;
  if (!userId) return [];

  // OJO: no alcanza con dejar que la RLS "filtre sola". La policy de
  // hogar_miembros también deja ver todo a un admin (es_administrador()),
  // así que sin este .eq() explícito, una cuenta admin vería acá los
  // hogares de CUALQUIER usuario mezclados con los propios — encontrado
  // en QA (ver PR #1): la pantalla dice "Tus hogares activos", tiene que
  // filtrar por el usuario actual sin importar qué tan permisiva sea la
  // RLS para ese rol.
  const { data, error } = await supabase
    .from('hogar_miembros')
    .select('rol, puede_editar, estado, hogares(*)')
    .eq('usuario_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  // El select anidado devuelve cada fila como { rol, puede_editar, estado,
  // hogares: {...} }; se aplana acá para que el resto de la app trabaje con
  // HogarConRol[] directo. Se descartan las filas 'pendiente' (solicitud
  // todavía no aceptada por el dueño, ver migración
  // 20260903120000_solicitudes_hogar.sql): no son un hogar del que el
  // usuario ya sea miembro, así que no pertenecen a "Tus hogares activos".
  const hogares: HogarConRol[] = (data ?? [])
    .filter((fila): fila is typeof fila & { hogares: Hogar } => fila.hogares !== null && fila.estado === 'aprobado')
    .map((fila) => ({
      ...fila.hogares,
      miRol: fila.rol,
      puedoEditar: fila.rol === 'dueno' || fila.puede_editar,
      solicitudesPendientes: 0,
    }));

  // Solo tiene sentido contar solicitudes en los hogares donde YO soy
  // dueño (un invitado no las resuelve, ver HogarMiembrosModal) -- se pide
  // en una segunda consulta aparte para no traer de más en el select de
  // arriba, que ya viene anidado con hogares(*).
  const hogaresPropios = hogares.filter((hogar) => hogar.miRol === 'dueno').map((hogar) => hogar.id);
  if (hogaresPropios.length > 0) {
    const { data: pendientes, error: pendientesError } = await supabase
      .from('hogar_miembros')
      .select('hogar_id')
      .eq('estado', 'pendiente')
      .in('hogar_id', hogaresPropios);

    if (pendientesError) throw pendientesError;

    const conteos = new Map<string, number>();
    for (const fila of pendientes ?? []) {
      conteos.set(fila.hogar_id, (conteos.get(fila.hogar_id) ?? 0) + 1);
    }
    for (const hogar of hogares) {
      hogar.solicitudesPendientes = conteos.get(hogar.id) ?? 0;
    }
  }

  return hogares;
}

// Trae las filas crudas de hogar_miembros de un hogar puntual (con
// nombre/email del usuario), sin filtrar por estado -- lo usan tanto
// listarMiembrosDeHogar (estado 'aprobado') como listarSolicitudesPendientes
// (estado 'pendiente'), para no duplicar la misma consulta dos veces.
async function obtenerFilasDeHogar(hogarId: string) {
  const { data, error } = await supabase
    .from('hogar_miembros')
    .select('usuario_id, rol, puede_editar, estado, usuarios(nombre, email)')
    .eq('hogar_id', hogarId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).filter(
    (fila): fila is typeof fila & { usuarios: { nombre: string | null; email: string } } => fila.usuarios !== null,
  );
}

// Lista los miembros YA ACEPTADOS de un hogar puntual (nombre/email + rol +
// permiso de edición), para la pantalla "Miembros del hogar" donde el dueño
// puede expulsar invitados y habilitarles (o no) la edición del nombre.
export async function listarMiembrosDeHogar(hogarId: string): Promise<MiembroHogar[]> {
  const filas = await obtenerFilasDeHogar(hogarId);

  return filas
    .filter((fila) => fila.estado === 'aprobado')
    .map((fila) => ({
      usuarioId: fila.usuario_id,
      rol: fila.rol,
      puedeEditar: fila.puede_editar,
      nombre: fila.usuarios.nombre,
      email: fila.usuarios.email,
    }));
}

// Lista a quienes se sumaron a un hogar por código pero todavía esperan
// que el dueño los acepte o los rechace (ver migración
// 20260903120000_solicitudes_hogar.sql). Misma consulta que
// listarMiembrosDeHogar, filtrando el estado contrario.
export async function listarSolicitudesPendientes(hogarId: string): Promise<SolicitudPendiente[]> {
  const filas = await obtenerFilasDeHogar(hogarId);

  return filas
    .filter((fila) => fila.estado === 'pendiente')
    .map((fila) => ({
      usuarioId: fila.usuario_id,
      nombre: fila.usuarios.nombre,
      email: fila.usuarios.email,
    }));
}

// Acepta o rechaza una solicitud pendiente de un invitado puntual. Solo
// puede llamarla el dueño del hogar (lo valida la RPC del lado de
// Postgres). Aceptar suma al usuario como miembro de verdad (estado
// 'aprobado'); rechazar borra la solicitud, sin dejar rastro -- el usuario
// puede volver a intentar unirse más adelante.
export async function responderSolicitud(hogarId: string, usuarioId: string, aprobar: boolean): Promise<void> {
  const { error } = await supabase.rpc('responder_solicitud', {
    p_hogar_id: hogarId,
    p_usuario_id: usuarioId,
    p_aprobar: aprobar,
  });
  if (error) throw error;
}

// Lista las solicitudes que YO mandé (uniéndome por código) y que todavía
// no respondió el dueño del hogar destino. Va por RPC (SECURITY DEFINER) y
// no por un select directo: mientras la solicitud esté pendiente,
// es_miembro_de() da false para mí en ese hogar, así que la policy de
// SELECT de "hogares" no me dejaría ver su nombre por mi cuenta todavía.
export async function listarMisSolicitudesPendientes(): Promise<MiSolicitudPendiente[]> {
  const { data, error } = await supabase.rpc('listar_mis_solicitudes_pendientes');
  if (error) throw error;

  return (data ?? []).map((fila) => ({ hogarId: fila.hogar_id, nombreHogar: fila.nombre }));
}

// Expulsa a OTRO usuario de un hogar (a diferencia de salirDeHogar, que es
// uno mismo yéndose). Solo puede llamarla el dueño del hogar, y nunca
// contra sí mismo ni contra el propio dueño — ambas cosas las valida la
// RPC del lado de Postgres (expulsar_miembro), no acá.
export async function expulsarMiembro(hogarId: string, usuarioId: string): Promise<void> {
  const { error } = await supabase.rpc('expulsar_miembro', { p_hogar_id: hogarId, p_usuario_id: usuarioId });
  if (error) throw error;
}

// Habilita/deshabilita que un invitado puntual pueda editar el nombre del
// hogar. Solo puede llamarla el dueño (lo valida la RPC del lado de
// Postgres, no acá); llamarla sobre la fila del propio dueño no hace nada
// (la RPC filtra `rol <> 'dueno'`).
export async function permitirEditarHogar(hogarId: string, usuarioId: string, permitir: boolean): Promise<void> {
  const { error } = await supabase.rpc('permitir_editar_hogar', {
    p_hogar_id: hogarId,
    p_usuario_id: usuarioId,
    p_permitir: permitir,
  });
  if (error) throw error;
}
