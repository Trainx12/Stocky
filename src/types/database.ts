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
  created_at: string;
  updated_at: string;
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
    };
  };
}
