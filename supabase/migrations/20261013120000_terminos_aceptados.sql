-- Términos y Condiciones: registro de qué versión aceptó cada usuario y
-- cuándo (constancia de la aceptación). El texto vive en la app
-- (src/legal/terminos.ts); acá solo se guarda la versión aceptada.
--
-- Mientras `terminos_version` no coincida con la versión vigente de la app,
-- RootNavigator muestra los términos para aceptar antes de dejar entrar
-- (usuarios existentes incluidos, y cada vez que se publique una versión
-- nueva).

alter table public.usuarios
  add column if not exists terminos_version text,
  add column if not exists terminos_aceptados_at timestamptz;

-- Nadie edita esas columnas directo (el UPDATE de usuarios está limitado por
-- columna desde 20261011120000_abm_usuarios_y_habilitado.sql): se registran
-- con esta RPC, que fija la fecha del servidor (no la del celular).
create or replace function public.aceptar_terminos(p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitás una sesión activa' using errcode = '42501';
  end if;
  -- Formato de versión: fecha AAAA-MM-DD (VERSION_TERMINOS en la app).
  if p_version is null or p_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Versión de términos inválida';
  end if;

  update public.usuarios
  set terminos_version = p_version, terminos_aceptados_at = now()
  where id = auth.uid();
end;
$$;

revoke execute on function public.aceptar_terminos(text) from public, anon;
grant execute on function public.aceptar_terminos(text) to authenticated;
