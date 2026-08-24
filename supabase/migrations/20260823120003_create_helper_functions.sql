-- Funciones auxiliares para las policies de RLS. Se definen en su propia
-- migración porque dependen de que "usuarios" ya exista, y a su vez las
-- policies de hogares/productos dependen de que estas funciones existan.
--
-- SECURITY DEFINER (no security invoker): estas funciones se usan DENTRO
-- de las policies de RLS de la propia tabla `usuarios` que consultan. Sin
-- security definer, la subquery interna vuelve a evaluar esa misma policy
-- (que vuelve a llamar a la función), y Postgres no garantiza cortar por
-- short-circuit en el OR de una policy: el resultado es recursión
-- infinita ("stack depth limit exceeded"), que apareció recién al probar
-- con un usuario `administrador` real. Con security definer, la subquery
-- interna corre con los privilegios del dueño de la función (bypassea RLS
-- en ese paso puntual), cortando el ciclo. No es un riesgo de seguridad:
-- ambas funciones solo devuelven datos sobre el usuario que las invoca
-- (auth.uid()), nunca datos de otro usuario. `search_path` fijo por
-- recomendación del linter de seguridad de Supabase.

create or replace function public.hogar_id_actual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select hogar_id from public.usuarios where id = auth.uid();
$$;

create or replace function public.es_administrador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios where id = auth.uid() and rol = 'administrador'
  );
$$;
