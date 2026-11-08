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
end; $function$

revoke all on function public.transfer_stock_idempotent(uuid,uuid,uuid,uuid,integer,text,uuid) from public,anon;
grant execute on function public.transfer_stock_idempotent(uuid,uuid,uuid,uuid,integer,text,uuid) to authenticated;
