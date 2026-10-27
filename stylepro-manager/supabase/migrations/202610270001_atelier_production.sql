-- StylePro Manager: Atelier production module
-- Additive migration: does not alter or delete existing POS, stock, or sales data.

CREATE TABLE IF NOT EXISTS public.atelier_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  phone text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id)
);

CREATE INDEX IF NOT EXISTS atelier_suppliers_store_name_idx
  ON public.atelier_suppliers (store_id, name);

CREATE TABLE IF NOT EXISTS public.atelier_productions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  production_number bigint GENERATED ALWAYS AS IDENTITY,
  production_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_id uuid,
  supplier_name_snapshot text NOT NULL,
  fabric_name text NOT NULL,
  fabric_number text,
  fabric_quantity_m numeric(12,3) NOT NULL CHECK (fabric_quantity_m > 0),
  fabric_price_per_m numeric(12,2) NOT NULL CHECK (fabric_price_per_m >= 0),
  model_name text NOT NULL,
  color text NOT NULL,
  total_quantity integer NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  total_production_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_production_price >= 0),
  fabric_total_cost numeric(14,2) GENERATED ALWAYS AS (round(fabric_quantity_m * fabric_price_per_m, 2)) STORED,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, production_number),
  CONSTRAINT atelier_productions_supplier_fk
    FOREIGN KEY (store_id, supplier_id)
    REFERENCES public.atelier_suppliers(store_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS atelier_productions_store_date_idx
  ON public.atelier_productions (store_id, production_date DESC);
CREATE INDEX IF NOT EXISTS atelier_productions_store_number_idx
  ON public.atelier_productions (store_id, production_number DESC);

CREATE TABLE IF NOT EXISTS public.atelier_production_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  production_id uuid NOT NULL,
  size_name text NOT NULL CHECK (length(trim(size_name)) > 0),
  unit_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total numeric(14,2) GENERATED ALWAYS AS (round(unit_price * quantity, 2)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (production_id, size_name),
  CONSTRAINT atelier_production_sizes_production_fk
    FOREIGN KEY (store_id, production_id)
    REFERENCES public.atelier_productions(store_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS atelier_production_sizes_store_production_idx
  ON public.atelier_production_sizes (store_id, production_id);

ALTER TABLE public.atelier_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atelier_productions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atelier_production_sizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atelier_suppliers_member_select ON public.atelier_suppliers;
CREATE POLICY atelier_suppliers_member_select ON public.atelier_suppliers
  FOR SELECT TO authenticated
  USING (private.is_store_member(store_id));

DROP POLICY IF EXISTS atelier_suppliers_manager_write ON public.atelier_suppliers;
CREATE POLICY atelier_suppliers_manager_write ON public.atelier_suppliers
  FOR ALL TO authenticated
  USING (private.has_store_role(store_id, ARRAY['admin','manager','stock_manager']))
  WITH CHECK (private.has_store_role(store_id, ARRAY['admin','manager','stock_manager']));

DROP POLICY IF EXISTS atelier_productions_member_select ON public.atelier_productions;
CREATE POLICY atelier_productions_member_select ON public.atelier_productions
  FOR SELECT TO authenticated
  USING (private.is_store_member(store_id));

DROP POLICY IF EXISTS atelier_productions_manager_write ON public.atelier_productions;
CREATE POLICY atelier_productions_manager_write ON public.atelier_productions
  FOR ALL TO authenticated
  USING (private.has_store_role(store_id, ARRAY['admin','manager','stock_manager']))
  WITH CHECK (private.has_store_role(store_id, ARRAY['admin','manager','stock_manager']));

DROP POLICY IF EXISTS atelier_production_sizes_member_select ON public.atelier_production_sizes;
CREATE POLICY atelier_production_sizes_member_select ON public.atelier_production_sizes
  FOR SELECT TO authenticated
  USING (private.is_store_member(store_id));

DROP POLICY IF EXISTS atelier_production_sizes_manager_write ON public.atelier_production_sizes;
CREATE POLICY atelier_production_sizes_manager_write ON public.atelier_production_sizes
  FOR ALL TO authenticated
  USING (private.has_store_role(store_id, ARRAY['admin','manager','stock_manager']))
  WITH CHECK (private.has_store_role(store_id, ARRAY['admin','manager','stock_manager']));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atelier_suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atelier_productions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atelier_production_sizes TO authenticated;

-- Production numbers are database-generated identity values; they are not supplied by the UI.
