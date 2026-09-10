-- Catálogo de productos: a partir de ahora, cargar un producto en un hogar
-- ya NO es texto libre -- el usuario elige de una lista fija (con foto,
-- categoría y unidad ya cargadas), y si el producto que busca no está,
-- puede sugerirlo para que un admin lo apruebe. Objetivo: evitar nombres
-- duplicados/inconsistentes ("leche", "Leche", "LECHE") y darle a la app
-- una identidad visual por producto (RF pedida directamente por el equipo,
-- no numerada en el brief original).
--
-- Nota de alcance: el enforcement real de "solo productos del catálogo"
-- vive del lado del cliente (services/catalogo.ts + ProductoFormModal),
-- igual que la validación de nombre/categoría de productos.ts -- no hay
-- constraint de base que ate productos.nombre a un valor de esta tabla
-- (mismo criterio ya usado en todo el proyecto: no depender de un
-- constraint que todavía no existe). `productos.catalogo_id` sí queda
-- como referencia para trazabilidad y para poder mostrar la foto en
-- ProductosScreen más adelante.

create type public.estado_sugerencia as enum ('pendiente', 'aprobado');

create table public.productos_catalogo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null,
  unidad text not null default 'unidad',
  imagen_url text,
  estado public.estado_sugerencia not null default 'pendiente',
  -- Quién lo sugirió (null en los que se cargaron con la app, sugeridos
  -- por el equipo). No se borra en cascada si se borra el usuario: el
  -- catálogo es compartido por todos los hogares, no debería desaparecer
  -- un producto ya aprobado solo porque quien lo sugirió cerró la cuenta.
  sugerido_por uuid references public.usuarios (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.productos_catalogo is 'Catálogo global de productos que se pueden cargar en un hogar (no es por hogar). "pendiente" = sugerencia de un usuario, esperando que un admin la apruebe o la rechace (rechazar = borrar la fila).';

-- Nombres duplicados (sin distinguir mayúsculas/acentos triviales) rompen
-- el propósito del catálogo -- evita cargar "Leche" dos veces por accidente
-- al aprobar sugerencias.
create unique index productos_catalogo_nombre_unico_idx on public.productos_catalogo (lower(nombre));

create index productos_catalogo_estado_idx on public.productos_catalogo (estado);

alter table public.productos_catalogo enable row level security;

-- Cualquier usuario logueado ve el catálogo aprobado (lo necesita para
-- elegir un producto al cargarlo), sus PROPIAS sugerencias sin importar el
-- estado (para poder ver "todavía está pendiente" en su propia sugerencia),
-- y un admin ve todo (para la pantalla de aprobación).
create policy "productos_catalogo_select_aprobado_o_propio_o_admin"
  on public.productos_catalogo for select
  to authenticated
  using (estado = 'aprobado' or sugerido_por = auth.uid() or public.es_administrador());

-- Cualquier usuario logueado puede sugerir un producto nuevo, pero SIEMPRE
-- como 'pendiente' y a su propio nombre -- no puede auto-aprobarse ni
-- sugerir algo "a nombre de" otro usuario.
create policy "productos_catalogo_insert_propio_pendiente"
  on public.productos_catalogo for insert
  to authenticated
  with check (sugerido_por = auth.uid() and estado = 'pendiente');

-- Aprobar (estado -> 'aprobado') o editar el catálogo es solo de admin.
create policy "productos_catalogo_update_admin"
  on public.productos_catalogo for update
  to authenticated
  using (public.es_administrador())
  with check (public.es_administrador());

-- Rechazar una sugerencia es borrar la fila -- solo admin.
create policy "productos_catalogo_delete_admin"
  on public.productos_catalogo for delete
  to authenticated
  using (public.es_administrador());

-- Referencia (no obligatoria, ver nota de alcance arriba) del producto de
-- hogar hacia la fila del catálogo que lo originó. Nullable a propósito:
-- los productos que ya existían antes de este catálogo no tienen de dónde
-- sacar una referencia real.
alter table public.productos
  add column catalogo_id uuid references public.productos_catalogo (id);

-- ---------------------------------------------------------------------------
-- Semilla: productos de almacén más comunes en Argentina, ya aprobados
-- (sugerido_por null = cargados con la app, no por un usuario puntual).
-- Sin categoría "Carnes" a propósito (no contemplada en este sprint).
-- imagen_url queda en null -- se completa después con URLs reales.
-- ---------------------------------------------------------------------------
insert into public.productos_catalogo (nombre, categoria, unidad, estado) values
  -- Lácteos
  ('Leche', 'Lácteos', 'l', 'aprobado'),
  ('Yogur', 'Lácteos', 'unidad', 'aprobado'),
  ('Queso Cremoso', 'Lácteos', 'kg', 'aprobado'),
  ('Queso Rallado', 'Lácteos', 'g', 'aprobado'),
  ('Manteca', 'Lácteos', 'g', 'aprobado'),
  ('Dulce de Leche', 'Lácteos', 'g', 'aprobado'),
  ('Crema de Leche', 'Lácteos', 'ml', 'aprobado'),
  -- Verduras y frutas
  ('Papa', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Cebolla', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Tomate', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Zanahoria', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Lechuga', 'Verduras y frutas', 'unidad', 'aprobado'),
  ('Banana', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Manzana', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Naranja', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Limón', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Zapallo', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Ajo', 'Verduras y frutas', 'unidad', 'aprobado'),
  ('Palta', 'Verduras y frutas', 'unidad', 'aprobado'),
  -- Panadería
  ('Pan Francés', 'Panadería', 'kg', 'aprobado'),
  ('Pan Lactal', 'Panadería', 'paquete', 'aprobado'),
  ('Facturas', 'Panadería', 'unidad', 'aprobado'),
  ('Tostadas', 'Panadería', 'paquete', 'aprobado'),
  ('Galletitas de Agua', 'Panadería', 'paquete', 'aprobado'),
  -- Bebidas
  ('Agua Mineral', 'Bebidas', 'l', 'aprobado'),
  ('Gaseosa Cola', 'Bebidas', 'l', 'aprobado'),
  ('Jugo Exprimido', 'Bebidas', 'l', 'aprobado'),
  ('Vino', 'Bebidas', 'unidad', 'aprobado'),
  ('Cerveza', 'Bebidas', 'unidad', 'aprobado'),
  ('Yerba Mate', 'Bebidas', 'kg', 'aprobado'),
  ('Café', 'Bebidas', 'g', 'aprobado'),
  ('Té', 'Bebidas', 'paquete', 'aprobado'),
  -- Limpieza
  ('Detergente', 'Limpieza', 'ml', 'aprobado'),
  ('Lavandina', 'Limpieza', 'l', 'aprobado'),
  ('Jabón en Polvo', 'Limpieza', 'kg', 'aprobado'),
  ('Suavizante', 'Limpieza', 'ml', 'aprobado'),
  ('Esponja', 'Limpieza', 'unidad', 'aprobado'),
  ('Papel Higiénico', 'Limpieza', 'paquete', 'aprobado'),
  ('Rollo de Cocina', 'Limpieza', 'unidad', 'aprobado'),
  ('Bolsas de Residuo', 'Limpieza', 'paquete', 'aprobado'),
  -- Higiene
  ('Shampoo', 'Higiene', 'ml', 'aprobado'),
  ('Jabón de Tocador', 'Higiene', 'unidad', 'aprobado'),
  ('Pasta Dental', 'Higiene', 'unidad', 'aprobado'),
  ('Desodorante', 'Higiene', 'unidad', 'aprobado'),
  ('Toallitas Húmedas', 'Higiene', 'paquete', 'aprobado'),
  -- Snacks
  ('Papas Fritas', 'Snacks', 'paquete', 'aprobado'),
  ('Alfajor', 'Snacks', 'unidad', 'aprobado'),
  ('Chocolate', 'Snacks', 'unidad', 'aprobado'),
  ('Maní', 'Snacks', 'g', 'aprobado'),
  ('Galletitas Dulces', 'Snacks', 'paquete', 'aprobado'),
  ('Turrón', 'Snacks', 'unidad', 'aprobado'),
  -- Congelados
  ('Helado', 'Congelados', 'l', 'aprobado'),
  ('Papas Congeladas', 'Congelados', 'kg', 'aprobado'),
  ('Verduras Congeladas', 'Congelados', 'kg', 'aprobado'),
  ('Pizza Congelada', 'Congelados', 'unidad', 'aprobado'),
  -- Otros
  ('Arroz', 'Otros', 'kg', 'aprobado'),
  ('Fideos', 'Otros', 'paquete', 'aprobado'),
  ('Harina', 'Otros', 'kg', 'aprobado'),
  ('Azúcar', 'Otros', 'kg', 'aprobado'),
  ('Sal', 'Otros', 'kg', 'aprobado'),
  ('Aceite', 'Otros', 'l', 'aprobado'),
  ('Huevos', 'Otros', 'unidad', 'aprobado'),
  ('Polenta', 'Otros', 'kg', 'aprobado'),
  ('Lentejas', 'Otros', 'kg', 'aprobado'),
  ('Puré de Tomate', 'Otros', 'unidad', 'aprobado'),
  ('Mayonesa', 'Otros', 'g', 'aprobado'),
  ('Mostaza', 'Otros', 'g', 'aprobado'),
  ('Ketchup', 'Otros', 'g', 'aprobado'),
  ('Vinagre', 'Otros', 'l', 'aprobado');
