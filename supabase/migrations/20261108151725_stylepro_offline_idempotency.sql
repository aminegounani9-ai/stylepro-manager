create table if not exists private.idempotency_requests (
 store_id uuid not null references public.stores(id) on delete cascade,
 actor_id uuid not null references auth.users(id) on delete cascade,
 operation text not null,
 idempotency_key uuid not null,
 request_hash text not null,
 response jsonb,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 primary key(store_id,actor_id,operation,idempotency_key)
);
revoke all on table private.idempotency_requests from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.create_pos_sale_cart_idempotent(p_store_id uuid, p_items jsonb, p_customer_id uuid, p_idempotency_key uuid)
 RETURNS TABLE(sale_id uuid, sale_number bigint, total numeric, item_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_hash text;
  v_hash_check text;
  v_response jsonb;
  v_result record;
begin
  if v_actor is null then raise exception 'Authentification requise'; end if;
  if p_idempotency_key is null then raise exception 'Clé idempotence obligatoire'; end if;
  if not private.has_store_role(p_store_id, array['admin','manager','cashier']::text[]) then
    raise exception 'Accès refusé pour cette boutique';
  end if;
  v_hash := md5(jsonb_build_object('items',p_items,'customer_id',p_customer_id)::text);
  insert into private.idempotency_requests(store_id,actor_id,operation,idempotency_key,request_hash)
  values(p_store_id,v_actor,'pos_sale_cart',p_idempotency_key,v_hash)
  on conflict do nothing;
  select request_hash,response into v_hash_check,v_response
  from private.idempotency_requests
  where store_id=p_store_id and actor_id=v_actor and operation='pos_sale_cart' and idempotency_key=p_idempotency_key
  for update;
  if v_hash_check is distinct from md5(jsonb_build_object('items',p_items,'customer_id',p_customer_id)::text) then
    raise exception 'Cette clé idempotence est déjà utilisée avec un autre panier.';
  end if;
  if v_response is not null then
    return query select (v_response->>'sale_id')::uuid,(v_response->>'sale_number')::bigint,
      (v_response->>'total')::numeric,(v_response->>'item_count')::integer;
    return;
  end if;
  select * into v_result from public.create_pos_sale_cart(p_store_id,p_items,p_customer_id);
  v_response := jsonb_build_object('sale_id',v_result.sale_id,'sale_number',v_result.sale_number,'total',v_result.total,'item_count',v_result.item_count);
  update private.idempotency_requests set response=v_response,completed_at=now()
  where store_id=p_store_id and actor_id=v_actor and operation='pos_sale_cart' and idempotency_key=p_idempotency_key;
  return query select v_result.sale_id,v_result.sale_number,v_result.total,v_result.item_count;
end;
$function$

revoke all on function public.create_pos_sale_cart_idempotent(uuid,jsonb,uuid,uuid) from public,anon;
grant execute on function public.create_pos_sale_cart_idempotent(uuid,jsonb,uuid,uuid) to authenticated;
