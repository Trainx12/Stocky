-- Dos pedidos relacionados de QA/producto:
--   1. Botones de +/- en ProductosScreen para sumar o restar de a una
--      unidad sin abrir el formulario completo de editar.
--   2. "Actividad reciente" mostraba 'Se actualizó "Mandarina"' al bajar la
--      cantidad de 5 a 2 -- no daba ninguna pista de cuánto cambió. Ahora
--      `cantidad` en actividad_hogar pasa a ser un DELTA con signo (antes
--      era siempre positivo/absoluto): +N al crear o sumar cantidad, -N al
--      eliminar o restar cantidad. El cliente arma el badge a partir del
--      signo, sin necesidad de ramificar por `tipo`.

-- ---------------------------------------------------------------------------
-- ajustar_cantidad_producto(): +1/-1 rápido desde la lista, sin pasar por
-- el modal de editar. A diferencia del resto de las RPCs de este proyecto,
-- esta NO es SECURITY DEFINER: no hace falta bypasear la RLS, la policy
-- "productos_update_propio_hogar_o_admin" (mismo criterio que
-- editarProducto()) ya alcanza para validar que el producto pertenezca al
-- hogar activo del usuario (o que sea admin). Se hace vía RPC en vez de un
-- `.update()` directo desde el cliente porque "sumar 1 a lo que ya hay" no
-- se puede expresar como una asignación fija sin leer el valor actual
-- primero -- y leer-y-despues-escribir desde el cliente es una carrera si
-- dos personas tocan +/- casi al mismo tiempo. `greatest(..., 0)` evita que
-- un -1 mal sincronizado dejando la cantidad en negativo.
-- ---------------------------------------------------------------------------
create or replace function public.ajustar_cantidad_producto(p_producto_id uuid, p_delta int)
returns public.productos
language plpgsql
set search_path = public
as $$
declare
  v_producto public.productos;
begin
  update public.productos
  set cantidad = greatest(cantidad + p_delta, 0)
  where id = p_producto_id
  returning * into v_producto;

  if v_producto.id is null then
    raise exception 'No se encontró el producto (o no pertenece a tu hogar activo)';
  end if;

  return v_producto;
end;
$$;

revoke execute on function public.ajustar_cantidad_producto(uuid, int) from public;
grant execute on function public.ajustar_cantidad_producto(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- registrar_actividad_producto(): `cantidad` pasa a ser un delta con signo
-- en los tres casos, en vez de un valor siempre positivo/absoluto:
--   - alta: +NEW.cantidad (cuánto entró de una)
--   - baja: -OLD.cantidad (cuánto se sacó de una, ahora negativo)
--   - edición: NEW.cantidad - OLD.cantidad (0 si no cambió la cantidad --
--     ahí el cliente sigue mostrando `descripcion` a secas, ver
--     HomeScreen.tsx `actividadVisual()`).
-- Este cambio de signo es a propósito INCOMPATIBLE con filas ya insertadas
-- por la versión anterior del trigger (esas quedan con el signo viejo) --
-- aceptable: es solo texto histórico de una tabla de actividad, no un saldo
-- que haya que recalcular.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_actividad_producto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.actividad_hogar (hogar_id, usuario_id, tipo, descripcion, producto_nombre, cantidad)
    values (NEW.hogar_id, auth.uid(), 'producto_creado', 'Se agregó "' || NEW.nombre || '"', NEW.nombre, NEW.cantidad);
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into public.actividad_hogar (hogar_id, usuario_id, tipo, descripcion, producto_nombre, cantidad)
    values (NEW.hogar_id, auth.uid(), 'producto_editado', 'Se actualizó "' || NEW.nombre || '"', NEW.nombre, NEW.cantidad - OLD.cantidad);
    return NEW;
  else
    insert into public.actividad_hogar (hogar_id, usuario_id, tipo, descripcion, producto_nombre, cantidad)
    values (OLD.hogar_id, auth.uid(), 'producto_eliminado', 'Se eliminó "' || OLD.nombre || '"', OLD.nombre, -OLD.cantidad);
    return OLD;
  end if;
end;
$$;
