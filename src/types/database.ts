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
 * Tipado mínimo del esquema para pasarle a `createClient<Database>(...)`
 * de supabase-js y obtener autocompletado/chequeo de tipos en las queries.
 * Se amplía a medida que se agreguen tablas en próximos sprints.
 */
export interface Database {
  public: {
    Tables: {
      // Row = lo que devuelve un SELECT. Insert/Update = lo que acepta
      // .insert()/.update(): todos los campos opcionales salvo los que
      // se marcan con Pick(), que son obligatorios para crear la fila.
      hogares: {
        Row: Hogar;
        Insert: Partial<Hogar> & Pick<Hogar, 'nombre'>;
        Update: Partial<Hogar>;
      };
      usuarios: {
        Row: Usuario;
        Insert: Partial<Usuario> & Pick<Usuario, 'id' | 'email'>;
        Update: Partial<Usuario>;
      };
      productos: {
        Row: Producto;
        Insert: Partial<Producto> & Pick<Producto, 'hogar_id' | 'nombre'>;
        Update: Partial<Producto>;
      };
    };
  };
}
