CREATE OR REPLACE FUNCTION public.confirm_delivery_idempotent(p_delivery_id uuid, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_store uuid; v_hash text; v_saved_hash text; v_response jsonb; v_result uuid;
begin
 if v_actor is null then raise exception 'Authentification requise'; end if;
 if p_idempotency_key is null then raise exception 'Clé idempotence obligatoire'; end if;
 select store_id into v_store from public.deliveries where id=p_delivery_id;
 if v_store is null then raise exception 'Livraison introuvable'; end if;
 if not private.has_store_role(v_store,array['admin','manager','stock_manager']::text[]) then raise exception 'Permission refusée'; end if;
 if not private.has_store_module_permission(v_store,'deliveries','edit') then
  raise exception 'Permission du module deliveries insuffisante';
 end if;
 v_hash:=md5(jsonb_build_object('delivery_id',p_delivery_id)::text);
 insert into private.idempotency_requests(store_id,actor_id,operation,idempotency_key,request_hash)
 values(v_store,v_actor,'confirm_delivery',p_idempotency_key,v_hash) on conflict do nothing;
 select request_hash,response into v_saved_hash,v_response from private.idempotency_requests
 where store_id=v_store and actor_id=v_actor and operation='confirm_delivery' and idempotency_key=p_idempotency_key for update;
 if v_saved_hash is distinct from v_hash then raise exception 'Cette clé idempotence est déjà utilisée pour une autre livraison.'; end if;
 if v_response is not null then return (v_response->>'delivery_id')::uuid; end if;
 v_result:=public.confirm_delivery(p_delivery_id);
 v_response:=jsonb_build_object('delivery_id',v_result);
 update private.idempotency_requests set response=v_response,completed_at=now()
 where store_id=v_store and actor_id=v_actor and operation='confirm_delivery' and idempotency_key=p_idempotency_key;
 return v_result;
end; $function$;

CREATE OR REPLACE FUNCTION public.create_pos_return_idempotent(p_store_id uuid, p_sale_id uuid, p_items jsonb, p_reason text, p_idempotency_key uuid)
 RETURNS TABLE(return_id uuid, refund_total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_hash text; v_saved_hash text; v_response jsonb; v_result record;
begin
 if v_actor is null then raise exception 'Authentification requise'; end if;
 if p_idempotency_key is null then raise exception 'Clé idempotence obligatoire'; end if;
 if not private.has_store_role(p_store_id,array['admin','manager','cashier']::text[]) then raise exception 'Autorisation insuffisante'; end if;
 if not private.has_store_module_permission(p_store_id,'returns','add') then
  raise exception 'Permission du module returns insuffisante';
 end if;
 v_hash:=md5(jsonb_build_object('sale_id',p_sale_id,'items',p_items,'reason',p_reason)::text);
 insert into private.idempotency_requests(store_id,actor_id,operation,idempotency_key,request_hash)
 values(p_store_id,v_actor,'pos_return',p_idempotency_key,v_hash) on conflict do nothing;
 select request_hash,response into v_saved_hash,v_response from private.idempotency_requests
 where store_id=p_store_id and actor_id=v_actor and operation='pos_return' and idempotency_key=p_idempotency_key for update;
 if v_saved_hash is distinct from v_hash then raise exception 'Cette clé idempotence est déjà utilisée avec un autre retour.'; end if;
 if v_response is not null then
  return query select (v_response->>'return_id')::uuid,(v_response->>'refund_total')::numeric; return;
 end if;
 select * into v_result from public.create_pos_return(p_store_id,p_sale_id,p_items,p_reason);
 v_response:=jsonb_build_object('return_id',v_result.return_id,'refund_total',v_result.refund_total);
 update private.idempotency_requests set response=v_response,completed_at=now()
 where store_id=p_store_id and actor_id=v_actor and operation='pos_return' and idempotency_key=p_idempotency_key;
 return query select v_result.return_id,v_result.refund_total;
end; $function$;

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
 if not private.has_store_module_permission(p_store_id,'sales','add') then
  raise exception 'Permission du module sales insuffisante';
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
$function$;

CREATE OR REPLACE FUNCTION public.transfer_stock_by_position_idempotent(p_store_id uuid, p_variant_id uuid, p_from_location_id uuid, p_to_location_id uuid, p_quantity integer, p_reason text, p_from_position_id uuid, p_to_position_id uuid, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_hash text; v_saved_hash text; v_response jsonb; v_result uuid;
begin
 if v_actor is null then raise exception 'Authentification requise'; end if;
 if p_idempotency_key is null then raise exception 'Clé idempotence obligatoire'; end if;
 if not private.has_store_role(p_store_id,array['admin','manager','stock_manager']::text[]) then raise exception 'Permission refusée'; end if;
 if not private.has_store_module_permission(p_store_id,'stock','add') then
  raise exception 'Permission du module stock insuffisante';
 end if;
 v_hash:=md5(jsonb_build_object('variant_id',p_variant_id,'from_location',p_from_location_id,'to_location',p_to_location_id,
  'quantity',p_quantity,'reason',p_reason,'from_position',p_from_position_id,'to_position',p_to_position_id)::text);
 insert into private.idempotency_requests(store_id,actor_id,operation,idempotency_key,request_hash)
 values(p_store_id,v_actor,'stock_transfer_position',p_idempotency_key,v_hash) on conflict do nothing;
 select request_hash,response into v_saved_hash,v_response from private.idempotency_requests
 where store_id=p_store_id and actor_id=v_actor and operation='stock_transfer_position' and idempotency_key=p_idempotency_key for update;
 if v_saved_hash is distinct from v_hash then raise exception 'Cette clé idempotence est déjà utilisée avec un autre transfert.'; end if;
 if v_response is not null then return (v_response->>'reference_id')::uuid; end if;
 v_result:=public.transfer_stock_by_position(p_store_id,p_variant_id,p_from_location_id,p_to_location_id,p_quantity,p_reason,p_from_position_id,p_to_position_id);
 v_response:=jsonb_build_object('reference_id',v_result);
 update private.idempotency_requests set response=v_response,completed_at=now()
 where store_id=p_store_id and actor_id=v_actor and operation='stock_transfer_position' and idempotency_key=p_idempotency_key;
 return v_result;
end; $function$;

CREATE OR REPLACE FUNCTION public.transfer_stock_idempotent(p_store_id uuid, p_variant_id uuid, p_from_location_id uuid, p_to_location_id uuid, p_quantity integer, p_reason text, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_hash text; v_saved_hash text; v_response jsonb; v_result uuid;
begin
 if v_actor is null then raise exception 'Utilisateur non authentifié.'; end if;
 if p_idempotency_key is null then raise exception 'Clé idempotence obligatoire'; end if;
 if not private.has_store_role(p_store_id,array['admin','manager','stock_manager']::text[]) then raise exception 'Permission refusée'; end if;
 if not private.has_store_module_permission(p_store_id,'stock','add') then
  raise exception 'Permission du module stock insuffisante';
 end if;
 v_hash:=md5(jsonb_build_object('variant_id',p_variant_id,'from_location',p_from_location_id,'to_location',p_to_location_id,'quantity',p_quantity,'reason',p_reason)::text);
 insert into private.idempotency_requests(store_id,actor_id,operation,idempotency_key,request_hash)
 values(p_store_id,v_actor,'stock_transfer',p_idempotency_key,v_hash) on conflict do nothing;
 select request_hash,response into v_saved_hash,v_response from private.idempotency_requests
 where store_id=p_store_id and actor_id=v_actor and operation='stock_transfer' and idempotency_key=p_idempotency_key for update;
 if v_saved_hash is distinct from v_hash then raise exception 'Cette clé idempotence est déjà utilisée pour un autre transfert.'; end if;
 if v_response is not null then return (v_response->>'reference_id')::uuid; end if;
 v_result:=public.transfer_stock(p_store_id,p_variant_id,p_from_location_id,p_to_location_id,p_quantity,p_reason);
 v_response:=jsonb_build_object('reference_id',v_result);
 update private.idempotency_requests set response=v_response,completed_at=now()
 where store_id=p_store_id and actor_id=v_actor and operation='stock_transfer' and idempotency_key=p_idempotency_key;
 return v_result;
end; $function$;
revoke all on function public.create_pos_sale_cart_idempotent(uuid,jsonb,uuid,uuid) from public,anon;
grant execute on function public.create_pos_sale_cart_idempotent(uuid,jsonb,uuid,uuid) to authenticated;
revoke all on function public.create_pos_return_idempotent(uuid,uuid,jsonb,text,uuid) from public,anon;
grant execute on function public.create_pos_return_idempotent(uuid,uuid,jsonb,text,uuid) to authenticated;
revoke all on function public.confirm_delivery_idempotent(uuid,uuid) from public,anon;
grant execute on function public.confirm_delivery_idempotent(uuid,uuid) to authenticated;
revoke all on function public.transfer_stock_idempotent(uuid,uuid,uuid,uuid,integer,text,uuid) from public,anon;
grant execute on function public.transfer_stock_idempotent(uuid,uuid,uuid,uuid,integer,text,uuid) to authenticated;
revoke all on function public.transfer_stock_by_position_idempotent(uuid,uuid,uuid,uuid,integer,text,uuid,uuid,uuid) from public,anon;
grant execute on function public.transfer_stock_by_position_idempotent(uuid,uuid,uuid,uuid,integer,text,uuid,uuid,uuid) to authenticated;
