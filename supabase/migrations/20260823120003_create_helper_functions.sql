-- Funciones auxiliares para las policies de RLS. Se definen en su propia
-- migración porque dependen de que "usuarios" ya exista, y a su vez las
-- policies de hogares/productos dependen de que estas funciones existan.
-- Marcadas `stable` (no `security definer`): corren con los permisos de
-- quien hace la consulta, así que siguen respetando la RLS de `usuarios`
-- al resolver el hogar_id del usuario actual. `search_path` fijo por
-- recomendación del linter de seguridad de Supabase (evita que hereden
-- uno mutable del rol que las invoca).

create or replace function public.hogar_id_actual()
returns uuid
language sql
stable
set search_path = public
as $$
  select hogar_id from public.usuarios where id = auth.uid();
$$;

create or replace function public.es_administrador()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios where id = auth.uid() and rol = 'administrador'
  );
$$;
