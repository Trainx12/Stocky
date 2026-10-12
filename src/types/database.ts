/**
 * Tipos espejo del esquema SQL en supabase/migrations. Usuario y
 * Administrador son un solo tipo con un campo `rol`, no dos entidades,
 * siguiendo el modelo de datos acordado con el equipo (ver RF0, RF9).
 */
export type RolUsuario = 'usuario' | 'administrador';

// Espejo de la tabla public.hogares.
export interface Hogar {
  id: string;
  nombre: string;
  // Código corto para que otro usuario se una a este hogar (RPC unirse_a_hogar).
  codigo_invitacion: string;
  created_at: string;
}

/**
 * Jerarquía dentro de un hogar (ver migración
 * 20260827140000_hogares_jerarquia.sql): quien lo creó es "dueno", quien
 * se suma después por código de invitación es "invitado". El dueño no
 * puede ser expulsado por nadie (ver RPC expulsar_miembro) — solo puede
 * dejar el hogar voluntariamente (salir_de_hogar).
 */
export type RolHogar = 'dueno' | 'invitado';

/**
 * Estado de una fila de hogar_miembros (ver migración
 * 20260903120000_solicitudes_hogar.sql): 'pendiente' es un invitado que se
 * sumó por código pero todavía no fue aceptado por el dueño -- mientras
 * esté en ese estado NO es miembro de verdad (no ve productos/nombre del
 * hogar, ver es_miembro_de()). El dueño siempre es 'aprobado' directo,
 * nunca pasa por 'pendiente'.
 */
export type EstadoSolicitud = 'pendiente' | 'aprobado';

/**
 * Quién inició una fila 'pendiente' de hogar_miembros (ver migración
 * 20260908120000_invitar_por_email.sql): 'solicitud' es alguien pidiendo
 * unirse por código (responde el DUEÑO); 'invitacion' es el dueño
 * invitando a alguien por mail (responde la PERSONA invitada). Default
 * 'solicitud' para no romper el flujo de código ya existente.
 */
export type OrigenMembresia = 'solicitud' | 'invitacion';

/**
 * Espejo de la tabla public.hogar_miembros: relación N a N entre
 * usuarios y hogares (un usuario puede pertenecer a más de un hogar).
 * `usuarios.hogar_id` sigue existiendo aparte como "hogar activo" (el que
 * se muestra en Home), no reemplaza a esta tabla.
 */
export interface HogarMiembro {
  hogar_id: string;
  usuario_id: string;
  rol: RolHogar;
  // Si este invitado puede editar el nombre del hogar (ver migración
  // 20260828120000_permisos_editar_hogar.sql). Default false: el dueño
  // tiene que habilitarlo explícitamente. No aplica al dueño, que siempre
  // puede editar sin importar este valor.
  puede_editar: boolean;
  estado: EstadoSolicitud;
  origen: OrigenMembresia;
  created_at: string;
}

// Espejo de la tabla public.usuarios.
export interface Usuario {
  id: string; // Igual a auth.users.id (1 a 1 con la cuenta de Supabase Auth)
  hogar_id: string | null; // Un usuario pertenece a un único hogar (o ninguno todavía)
  nombre: string | null;
  email: string;
  rol: RolUsuario;
  habilitado: boolean; // Usado por RF9 (admin habilita/deshabilita usuarios)
  // Con cuántos días de anticipación avisar que vence un producto (1-60,
  // default 7). Un producto puede tener su propio valor que pisa este (ver
  // Producto.dias_aviso_vencimiento y la migración 20261012120000_notificaciones.sql).
  dias_aviso_vencimiento: number;
  // Qué versión de los Términos y Condiciones aceptó y cuándo (null = nunca).
  // Ver src/legal/terminos.ts y la migración 20261013120000_terminos_aceptados.sql.
  terminos_version: string | null;
  terminos_aceptados_at: string | null;
  created_at: string;
}

/**
 * Unidad de medida abierta a texto libre en la base (ver migración de
 * productos), pero acotada a nivel de tipos para que los selectores de la
 * UI tengan opciones consistentes. Ampliar esta lista no requiere migración.
 */
export type UnidadProducto = 'unidad' | 'kg' | 'g' | 'l' | 'ml' | 'paquete';

// Espejo de la tabla public.productos.
export interface Producto {
  id: string;
  hogar_id: string; // Un producto siempre pertenece a un hogar (Hogar compone Producto)
  nombre: string;
  categoria: string | null;
  unidad: UnidadProducto;
  cantidad: number;
  stock_minimo: number;
  fecha_vencimiento: string | null; // ISO date (YYYY-MM-DD), null si no aplica (RF3)
  alerta_vencimiento_habilitada: boolean;
  // De qué fila del catálogo salió (ver migración 20260909212018_catalogo_productos.sql).
  // Nullable: los productos cargados antes de que existiera el catálogo no
  // tienen ninguna referencia real a la que apuntar.
  catalogo_id: string | null;
  // Texto libre opcional ("Lucchetti"): distingue dos paquetes del mismo
  // producto del catálogo con vencimientos distintos.
  marca: string | null;
  // Días de anticipación del aviso de vencimiento SOLO para este producto
  // (1-60). Null = usar la preferencia general del usuario.
  dias_aviso_vencimiento: number | null;
  created_at: string;
  updated_at: string;
}

// Qué pasó, para elegir ícono/color y a dónde lleva tocar la notificación.
// Mismos valores que el check de la columna notificaciones.tipo.
export type TipoNotificacion =
  | 'solicitud_recibida'
  | 'solicitud_aceptada'
  | 'solicitud_rechazada'
  | 'invitacion_recibida'
  | 'invitacion_aceptada'
  | 'expulsado'
  | 'ahora_sos_dueno'
  | 'por_vencer'
  | 'vencido'
  | 'stock_bajo'
  | 'sin_stock'
  | 'sugerencia_nueva'
  | 'sugerencia_aprobada'
  | 'sugerencia_rechazada';

// Espejo de la tabla public.notificaciones (campanita). Las filas las crean
// triggers y un job diario en Postgres, nunca la app.
export interface Notificacion {
  id: string;
  usuario_id: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  hogar_id: string | null;
  producto_id: string | null;
  clave: string | null;
  leida: boolean;
  created_at: string;
}

/**
 * Estado de una fila de productos_catalogo (ver migración
 * 20260909212018_catalogo_productos.sql): 'pendiente' es una sugerencia de
 * un usuario esperando que un admin la apruebe o la rechace (rechazar =
 * borrar la fila, no queda en ningún estado "rechazado"). 'aprobado' ya
 * aparece como opción al cargar un producto en cualquier hogar.
 */
export type EstadoSugerencia = 'pendiente' | 'aprobado';

// Espejo de la tabla public.productos_catalogo: catálogo GLOBAL (no es por
// hogar) de productos que se pueden cargar. Cargar un producto en un hogar
// ya no es texto libre -- se elige una fila 'aprobado' de acá.
export interface ProductoCatalogo {
  id: string;
  nombre: string;
  categoria: string;
  unidad: UnidadProducto;
  imagen_url: string | null;
  estado: EstadoSugerencia;
  sugerido_por: string | null; // null = cargado con la app, no por un usuario puntual
  created_at: string;
}

/**
 * Truco de tipos: supabase-js chequea `Row`/`Returns` contra
 * `Record<string, unknown>` para saber si el schema es válido, y una
 * `interface` con nombre (a diferencia de un tipo "objeto literal") no
 * pasa ese chequeo estructural aunque tenga exactamente las mismas
 * propiedades — es una particularidad conocida de TypeScript. Envolver
 * acá con un mapped type "aplana" la interface a un objeto literal
 * equivalente y arregla el problema sin duplicar cada campo a mano.
 */
type AsRecord<T> = { [K in keyof T]: T[K] };

/**
 * Tipado mínimo del esquema para pasarle a `createClient<Database>(...)`
 * de supabase-js y obtener autocompletado/chequeo de tipos en las queries.
 * Se amplía a medida que se agreguen tablas en próximos sprints.
 *
 * `Views` y `Relationships` están vacíos/declarados a mano (no generados
 * con la CLI de Supabase): supabase-js 2.112 exige esa forma exacta para
 * poder tipar tanto `.rpc(...)` como los selects anidados del estilo
 * `.select('hogares(*)')` que usa src/services/hogares.ts.
 */
// Un ítem de la lista de compras de un hogar (services/listaCompras.ts).
export interface ItemListaCompras {
  id: string;
  hogar_id: string;
  nombre: string;
  categoria: string;
  unidad: UnidadProducto;
  cantidad: number;
  catalogo_id: string | null;
  comprado: boolean;
  creado_por: string | null;
  created_at: string;
}

// Comentario de un usuario ("Contanos qué mejorar", services/comentarios.ts).
export type TipoComentario = 'idea' | 'problema' | 'otro';
export interface Comentario {
  id: string;
  usuario_id: string | null;
  tipo: TipoComentario;
  mensaje: string;
  plataforma: string | null;
  version_app: string | null;
  created_at: string;
}

// Lo que devuelve admin_listar_comentarios (con quién lo mandó).
export interface ComentarioConAutor extends Omit<Comentario, 'usuario_id'> {
  usuario_nombre: string | null;
  usuario_email: string | null;
}

// Resumen del mes de un hogar (RPC resumen_del_mes).
export interface ResumenDelMes {
  cargados: number;
  usados: number;
  vencidos: number;
  por_vencer_semana: number;
}

export interface Database {
  public: {
    Tables: {
      // Row = lo que devuelve un SELECT. Insert/Update = lo que acepta
      // .insert()/.update(): todos los campos opcionales salvo los que
      // se marcan con Pick(), que son obligatorios para crear la fila.
      hogares: {
        Row: AsRecord<Hogar>;
        Insert: Partial<Hogar> & Pick<Hogar, 'nombre'>;
        Update: Partial<Hogar>;
        Relationships: [];
      };
      hogar_miembros: {
        Row: AsRecord<HogarMiembro>;
        Insert: Partial<HogarMiembro> & Pick<HogarMiembro, 'hogar_id' | 'usuario_id'>;
        Update: Partial<HogarMiembro>;
        // Declara los FKs a `hogares` y `usuarios` a mano, para que
        // `.select('hogares(*)')` y `.select('usuarios(nombre, email)')`
        // (este último usado por listarMiembrosDeHogar) tipen bien.
        Relationships: [
          {
            foreignKeyName: 'hogar_miembros_hogar_id_fkey';
            columns: ['hogar_id'];
            isOneToOne: false;
            referencedRelation: 'hogares';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'hogar_miembros_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'usuarios';
            referencedColumns: ['id'];
          },
        ];
      };
      usuarios: {
        Row: AsRecord<Usuario>;
        Insert: Partial<Usuario> & Pick<Usuario, 'id' | 'email'>;
        Update: Partial<Usuario>;
        Relationships: [];
      };
      productos: {
        Row: AsRecord<Producto>;
        Insert: Partial<Producto> & Pick<Producto, 'hogar_id' | 'nombre'>;
        Update: Partial<Producto>;
        Relationships: [
          {
            foreignKeyName: 'productos_catalogo_id_fkey';
            columns: ['catalogo_id'];
            isOneToOne: false;
            referencedRelation: 'productos_catalogo';
            referencedColumns: ['id'];
          },
        ];
      };
      notificaciones: {
        Row: AsRecord<Notificacion>;
        Insert: never;
        Update: Pick<Notificacion, 'leida'>;
        Relationships: [];
      };
      lista_compras: {
        Row: AsRecord<ItemListaCompras>;
        Insert: Partial<ItemListaCompras> & Pick<ItemListaCompras, 'hogar_id' | 'nombre'>;
        Update: Partial<Pick<ItemListaCompras, 'nombre' | 'categoria' | 'unidad' | 'cantidad' | 'catalogo_id' | 'comprado'>>;
        Relationships: [];
      };
      comentarios: {
        Row: AsRecord<Comentario>;
        Insert: Partial<Comentario> & Pick<Comentario, 'mensaje'>;
        Update: never;
        Relationships: [];
      };
      productos_catalogo: {
        Row: AsRecord<ProductoCatalogo>;
        Insert: Partial<ProductoCatalogo> & Pick<ProductoCatalogo, 'nombre' | 'categoria'>;
        Update: Partial<ProductoCatalogo>;
        Relationships: [];
      };
    };
    Views: {};
    // RPCs de src/services/hogares.ts (definidas en
    // supabase/migrations/20260826130000_hogares_multi_membresia.sql).
    // Tipadas acá para que supabase.rpc(...) chequee nombre/args/retorno.
    Functions: {
      crear_hogar: {
        Args: { p_nombre: string };
        Returns: AsRecord<Hogar>;
      };
      unirse_a_hogar: {
        Args: { p_codigo: string };
        Returns: AsRecord<Hogar>;
      };
      salir_de_hogar: {
        Args: { p_hogar_id: string };
        Returns: void;
      };
      expulsar_miembro: {
        Args: { p_hogar_id: string; p_usuario_id: string };
        Returns: void;
      };
      ceder_dueno: {
        Args: { p_hogar_id: string; p_nuevo_dueno_id: string };
        Returns: void;
      };
      permitir_editar_hogar: {
        Args: { p_hogar_id: string; p_usuario_id: string; p_permitir: boolean };
        Returns: void;
      };
      responder_solicitud: {
        Args: { p_hogar_id: string; p_usuario_id: string; p_aprobar: boolean };
        Returns: void;
      };
      listar_mis_solicitudes_pendientes: {
        Args: Record<string, never>;
        Returns: AsRecord<{ hogar_id: string; nombre: string; created_at: string }>[];
      };
      // RPCs de invitar por mail (ver migración
      // 20260908120000_invitar_por_email.sql).
      invitar_a_hogar: {
        Args: { p_hogar_id: string; p_email: string };
        Returns: void;
      };
      responder_invitacion: {
        Args: { p_hogar_id: string; p_aprobar: boolean };
        Returns: void;
      };
      listar_mis_invitaciones_pendientes: {
        Args: Record<string, never>;
        Returns: AsRecord<{ hogar_id: string; nombre: string; created_at: string }>[];
      };
      listar_actividad_reciente: {
        Args: { p_hogar_id: string; p_limite?: number };
        Returns: AsRecord<{
          id: string;
          tipo: string;
          descripcion: string;
          usuario_nombre: string | null;
          usuario_email: string | null;
          created_at: string;
          // Ver migración 20260909010000_actividad_cantidad_visual.sql.
          producto_nombre: string | null;
          cantidad: number | null;
        }>[];
      };
      // Ver migración 20260909020000_ajuste_rapido_y_delta_actividad.sql.
      ajustar_cantidad_producto: {
        Args: { p_producto_id: string; p_delta: number };
        Returns: AsRecord<Producto>;
      };
      // ABM de usuarios para administradores (ver migración
      // 20261011120000_abm_usuarios_y_habilitado.sql y services/usuarios.ts).
      admin_listar_usuarios: {
        Args: Record<string, never>;
        Returns: AsRecord<{
          id: string;
          email: string;
          nombre: string | null;
          rol: RolUsuario;
          habilitado: boolean;
          created_at: string;
          cantidad_hogares: number;
        }>[];
      };
      admin_set_usuario_habilitado: {
        Args: { p_usuario_id: string; p_habilitado: boolean };
        Returns: AsRecord<Usuario>;
      };
      admin_set_rol_usuario: {
        Args: { p_usuario_id: string; p_rol: RolUsuario };
        Returns: AsRecord<Usuario>;
      };
      // Push al teléfono (ver migración 20261012120000_notificaciones.sql).
      registrar_push_token: {
        Args: { p_token: string; p_plataforma: string };
        Returns: void;
      };
      eliminar_push_token: {
        Args: { p_token: string };
        Returns: void;
      };
      // Constancia de aceptación de los términos (ver services/terminos.ts).
      aceptar_terminos: {
        Args: { p_version: string };
        Returns: void;
      };
      // Mejoras de experiencia (migración 20261017120000_...).
      admin_listar_comentarios: {
        Args: { p_limite?: number };
        Returns: AsRecord<ComentarioConAutor>[];
      };
      resumen_del_mes: {
        Args: { p_hogar_id: string; p_desde: string };
        Returns: ResumenDelMes;
      };
      eliminar_mi_cuenta: {
        Args: Record<string, never>;
        Returns: void;
      };
    };
  };
}
