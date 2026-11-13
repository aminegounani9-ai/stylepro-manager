-- Fix ambiguous sale_id references in the paid POS sale wrapper.
-- The RETURNS TABLE output column sale_id conflicts with the payments.sale_id
-- conflict target in PL/pgSQL. Keep inserts idempotent and qualify payment reads.

CREATE OR REPLACE FUNCTION public.create_pos_sale_paid_idempotent(
  p_store_id uuid,
  p_items jsonb,
  p_customer_id uuid,
  p_idempotency_key uuid,
  p_cash_session_id uuid,
  p_payment_method text,
  p_cash_amount numeric DEFAULT 0,
  p_card_amount numeric DEFAULT 0
)
RETURNS TABLE(sale_id uuid, sale_number bigint, total numeric, item_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_sale record;
  v_cash numeric(14,2) := coalesce(p_cash_amount,0);
  v_card numeric(14,2) := coalesce(p_card_amount,0);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cash_register_sessions cr
    WHERE cr.id = p_cash_session_id
      AND cr.store_id = p_store_id
      AND cr.cashier_id = auth.uid()
      AND cr.status = 'open'
  ) THEN
    RAISE EXCEPTION 'Ouvrez votre caisse avant de valider une vente.';
  END IF;

  IF p_payment_method NOT IN ('cash','card','mixed') THEN
    RAISE EXCEPTION 'Mode de paiement invalide';
  END IF;

  SELECT * INTO v_sale
  FROM public.create_pos_sale_cart_idempotent(
    p_store_id,p_items,p_customer_id,p_idempotency_key
  );

  IF p_payment_method = 'cash' THEN
    v_cash := v_sale.total;
    v_card := 0;
  ELSIF p_payment_method = 'card' THEN
    v_cash := 0;
    v_card := v_sale.total;
  END IF;

  IF v_cash < 0 OR v_card < 0 OR round(v_cash + v_card,2) <> round(v_sale.total,2) THEN
    RAISE EXCEPTION 'Les montants espèces/carte doivent correspondre exactement au total de la vente.';
  END IF;

  IF v_cash > 0 THEN
    INSERT INTO public.payments(store_id,sale_id,amount,method,status)
    VALUES(p_store_id,v_sale.sale_id,v_cash,'cash','received')
    ON CONFLICT DO NOTHING;

    IF EXISTS (
      SELECT 1 FROM public.payments AS payment_row
      WHERE payment_row.store_id = p_store_id
        AND payment_row.sale_id = v_sale.sale_id
        AND payment_row.method = 'cash'
        AND payment_row.amount <> v_cash
    ) THEN
      RAISE EXCEPTION 'Le paiement espèces enregistré ne correspond pas à cette vente.';
    END IF;
  END IF;

  IF v_card > 0 THEN
    INSERT INTO public.payments(store_id,sale_id,amount,method,status)
    VALUES(p_store_id,v_sale.sale_id,v_card,'card','received')
    ON CONFLICT DO NOTHING;

    IF EXISTS (
      SELECT 1 FROM public.payments AS payment_row
      WHERE payment_row.store_id = p_store_id
        AND payment_row.sale_id = v_sale.sale_id
        AND payment_row.method = 'card'
        AND payment_row.amount <> v_card
    ) THEN
      RAISE EXCEPTION 'Le paiement carte enregistré ne correspond pas à cette vente.';
    END IF;
  END IF;

  RETURN QUERY SELECT v_sale.sale_id,v_sale.sale_number,v_sale.total,v_sale.item_count;
END
$function$;

REVOKE ALL ON FUNCTION public.create_pos_sale_paid_idempotent(uuid,jsonb,uuid,uuid,uuid,text,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pos_sale_paid_idempotent(uuid,jsonb,uuid,uuid,uuid,text,numeric,numeric) TO authenticated;
