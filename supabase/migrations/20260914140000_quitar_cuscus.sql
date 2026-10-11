-- Pedido del equipo: "Cuscús" sobra en el catálogo. Solo se borra si ningún
-- producto de ningún hogar lo referencia (verificado por SQL antes de aplicarlo).
delete from public.productos_catalogo
where nombre = 'Cuscús'
  and not exists (
    select 1 from public.productos p where p.catalogo_id = productos_catalogo.id
  );
