-- ============================================================
-- Phase 2: Billing, CRM & ERP schema extensions
-- Additive only — no existing table is dropped or renamed.
-- Rollback: supabase/rollbacks/20260724000001_billing_crm_erp_down.sql
-- ============================================================

-- ------------------------------------------------------------
-- 0. Role helper — single source of truth for RLS policies.
--    Reads user_roles (the table the app already uses) by JWT email.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_roles
  WHERE email = auth.jwt()->>'email' AND COALESCE(active, TRUE)
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.app_role() TO authenticated;

-- Generic updated_at maintainer
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

-- ------------------------------------------------------------
-- 1. Gap-free document numbering (GST requires consecutive
--    serials per series per financial year).
--    Row-locked counter table — unlike sequences, never skips.
--    FY label follows Indian financial year (Apr–Mar): '2026-27'.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doc_series (
  doc_type TEXT NOT NULL,
  fy_label TEXT NOT NULL,
  last_num INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, fy_label)
);
ALTER TABLE doc_series ENABLE ROW LEVEL SECURITY;
-- No policies: only SECURITY DEFINER functions touch this table.

CREATE OR REPLACE FUNCTION public.current_fy_label()
RETURNS TEXT LANGUAGE SQL STABLE AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM NOW()) >= 4
    THEN EXTRACT(YEAR FROM NOW())::TEXT || '-' || TO_CHAR((EXTRACT(YEAR FROM NOW()) + 1) % 100, 'FM00')
    ELSE (EXTRACT(YEAR FROM NOW()) - 1)::TEXT || '-' || TO_CHAR(EXTRACT(YEAR FROM NOW()) % 100, 'FM00')
  END
$$;

CREATE OR REPLACE FUNCTION public.next_doc_number(p_doc_type TEXT, p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy TEXT := current_fy_label();
  v_num INTEGER;
BEGIN
  INSERT INTO doc_series (doc_type, fy_label, last_num)
  VALUES (p_doc_type, v_fy, 1)
  ON CONFLICT (doc_type, fy_label)
  DO UPDATE SET last_num = doc_series.last_num + 1
  RETURNING last_num INTO v_num;
  RETURN p_prefix || v_fy || '-' || LPAD(v_num::TEXT, 4, '0');
END $$;
GRANT EXECUTE ON FUNCTION public.next_doc_number(TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 2. Customers
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  gstin TEXT,
  pan TEXT,
  email TEXT,
  phone TEXT,
  contact_person TEXT,
  billing_address TEXT,
  shipping_address TEXT,
  city TEXT,
  state TEXT,
  state_code TEXT,           -- 2-digit GST state code; drives CGST/SGST vs IGST
  country TEXT DEFAULT 'India',
  customer_type TEXT DEFAULT 'domestic' CHECK (customer_type IN ('domestic','export','sez')),
  payment_terms TEXT,
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_name_gstin_uq
  ON customers (LOWER(name), COALESCE(gstin, ''));
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 3. Items / product catalog
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  description TEXT,
  item_type TEXT DEFAULT 'goods' CHECK (item_type IN ('goods','service')),
  hsn_sac_code TEXT,
  unit TEXT DEFAULT 'Nos',
  unit_price NUMERIC(14,2) DEFAULT 0,
  gst_rate NUMERIC(5,2) DEFAULT 18,
  track_inventory BOOLEAN DEFAULT TRUE,
  stock_qty NUMERIC(14,3) DEFAULT 0,
  reorder_level NUMERIC(14,3) DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER items_updated_at BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 4. Extend sales_invoices (generalize; existing rows untouched)
-- ------------------------------------------------------------
ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id),
  ADD COLUMN IF NOT EXISTS customer_state TEXT,
  ADD COLUMN IF NOT EXISTS customer_state_code TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS discount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14,2) DEFAULT 0;

-- Widen invoice_type to include plain domestic invoices
ALTER TABLE sales_invoices DROP CONSTRAINT IF EXISTS sales_invoices_invoice_type_check;
ALTER TABLE sales_invoices ADD CONSTRAINT sales_invoices_invoice_type_check
  CHECK (invoice_type IN ('export','dta','domestic'));

-- Widen status lifecycle
ALTER TABLE sales_invoices DROP CONSTRAINT IF EXISTS sales_invoices_status_check;
ALTER TABLE sales_invoices ADD CONSTRAINT sales_invoices_status_check
  CHECK (status IN ('draft','sent','partially_paid','paid','overdue','cancelled'));

-- Numbering: assign only when an invoice leaves draft (GST numbers
-- must not be burned on drafts), via the gap-free series above.
-- Replaces the old sequence-based on-insert trigger.
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL AND NEW.status IS DISTINCT FROM 'draft' THEN
    NEW.invoice_number := CASE NEW.invoice_type
      WHEN 'export' THEN next_doc_number('invoice_export', 'VT-EXP-INV-')
      WHEN 'dta'    THEN next_doc_number('invoice_dta',    'VT-DTA-INV-')
      ELSE               next_doc_number('invoice_domestic','VT-INV-')
    END;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS set_invoice_number ON sales_invoices;
CREATE TRIGGER set_invoice_number
  BEFORE INSERT OR UPDATE ON sales_invoices
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- ------------------------------------------------------------
-- 5. Invoice line items (structured; JSONB `items` kept for
--    legacy rows and print rendering during transition)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id),
  description TEXT NOT NULL,
  hsn_sac_code TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'Nos',
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(5,2) DEFAULT 0,
  gst_rate NUMERIC(5,2) DEFAULT 0,
  taxable_value NUMERIC(14,2) DEFAULT 0,
  cgst NUMERIC(14,2) DEFAULT 0,
  sgst NUMERIC(14,2) DEFAULT 0,
  igst NUMERIC(14,2) DEFAULT 0,
  line_total NUMERIC(14,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx ON invoice_line_items (invoice_id);

-- ------------------------------------------------------------
-- 6. Estimates / quotes (convertible to invoices)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estimates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_number TEXT UNIQUE,
  customer_id UUID REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_address TEXT,
  customer_gstin TEXT,
  customer_state_code TEXT,
  estimate_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC(14,2) DEFAULT 0,
  discount NUMERIC(14,2) DEFAULT 0,
  cgst NUMERIC(14,2) DEFAULT 0,
  sgst NUMERIC(14,2) DEFAULT 0,
  igst NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','declined','expired','converted')),
  converted_invoice_id UUID REFERENCES sales_invoices(id),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER estimates_updated_at BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Estimates are not GST documents; number on insert is fine.
CREATE OR REPLACE FUNCTION generate_estimate_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estimate_number IS NULL THEN
    NEW.estimate_number := next_doc_number('estimate', 'VT-EST-');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER set_estimate_number BEFORE INSERT ON estimates
  FOR EACH ROW EXECUTE FUNCTION generate_estimate_number();

-- ------------------------------------------------------------
-- 7. Credit notes (GST document — numbered when issued)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_note_number TEXT UNIQUE,
  invoice_id UUID NOT NULL REFERENCES sales_invoices(id),
  customer_id UUID REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  credit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC(14,2) DEFAULT 0,
  cgst NUMERIC(14,2) DEFAULT 0,
  sgst NUMERIC(14,2) DEFAULT 0,
  igst NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','issued','applied','cancelled')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER credit_notes_updated_at BEFORE UPDATE ON credit_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION generate_credit_note_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.credit_note_number IS NULL AND NEW.status IS DISTINCT FROM 'draft' THEN
    NEW.credit_note_number := next_doc_number('credit_note', 'VT-CN-');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER set_credit_note_number BEFORE INSERT OR UPDATE ON credit_notes
  FOR EACH ROW EXECUTE FUNCTION generate_credit_note_number();

-- ------------------------------------------------------------
-- 8. Payments (linked to invoices; keeps invoice status in sync)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_number TEXT UNIQUE,
  invoice_id UUID NOT NULL REFERENCES sales_invoices(id),
  customer_id UUID REFERENCES customers(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method TEXT DEFAULT 'bank_transfer' CHECK (method IN ('bank_transfer','upi','cheque','cash','card','other')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_no TEXT,
  notes TEXT,
  recorded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments (invoice_id);

CREATE OR REPLACE FUNCTION generate_payment_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_number IS NULL THEN
    NEW.payment_number := next_doc_number('payment', 'VT-RCT-');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER set_payment_number BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION generate_payment_number();

-- Recompute invoice amount_paid + status whenever payments change
CREATE OR REPLACE FUNCTION sync_invoice_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_paid NUMERIC(14,2);
  v_total NUMERIC(14,2);
  v_status TEXT;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE invoice_id = v_invoice_id;
  SELECT total, status INTO v_total, v_status FROM sales_invoices WHERE id = v_invoice_id;
  UPDATE sales_invoices SET
    amount_paid = v_paid,
    status = CASE
      WHEN v_status IN ('draft','cancelled') THEN v_status
      WHEN v_paid >= v_total AND v_total > 0 THEN 'paid'
      WHEN v_paid > 0 THEN 'partially_paid'
      ELSE 'sent'
    END,
    updated_at = NOW()
  WHERE id = v_invoice_id;
  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER payments_sync_invoice
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION sync_invoice_payment_status();

-- ------------------------------------------------------------
-- 9. Recurring invoice templates (mirrors recurring_templates)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recurring_invoice_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  invoice_type TEXT DEFAULT 'domestic' CHECK (invoice_type IN ('export','dta','domestic')),
  items JSONB NOT NULL DEFAULT '[]',
  payment_terms TEXT,
  due_in_days INTEGER DEFAULT 30,
  notes TEXT,
  frequency TEXT DEFAULT 'monthly' CHECK (frequency IN ('monthly','quarterly','yearly')),
  next_run_date DATE NOT NULL,
  last_generated_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER recurring_invoice_templates_updated_at BEFORE UPDATE ON recurring_invoice_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 10. CRM: leads and contacts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  source TEXT,
  stage TEXT DEFAULT 'new' CHECK (stage IN ('new','contacted','qualified','proposal','won','lost')),
  value_estimate NUMERIC(14,2),
  customer_id UUID REFERENCES customers(id),  -- set when converted
  owner_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER crm_leads_updated_at BEFORE UPDATE ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  designation TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER crm_contacts_updated_at BEFORE UPDATE ON crm_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 11. Basic ERP: production orders + inventory ledger
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT UNIQUE,
  item_id UUID NOT NULL REFERENCES items(id),
  quantity_planned NUMERIC(14,3) NOT NULL CHECK (quantity_planned > 0),
  quantity_produced NUMERIC(14,3) DEFAULT 0,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled')),
  start_date DATE,
  completed_date DATE,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER production_orders_updated_at BEFORE UPDATE ON production_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION generate_production_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := next_doc_number('production_order', 'VT-PRD-');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER set_production_order_number BEFORE INSERT ON production_orders
  FOR EACH ROW EXECUTE FUNCTION generate_production_order_number();

-- Inventory ledger: immutable rows (no UPDATE/DELETE policies).
-- Corrections are made with a new 'adjustment' row.
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES items(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in','out','adjustment')),
  quantity NUMERIC(14,3) NOT NULL,  -- positive; sign derived from type ('adjustment' may be negative)
  reference_type TEXT,              -- 'invoice' | 'production_order' | 'manual' | ...
  reference_id TEXT,
  notes TEXT,
  moved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inventory_movements_item_idx ON inventory_movements (item_id, created_at DESC);

CREATE OR REPLACE FUNCTION apply_inventory_movement()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE items SET
    stock_qty = stock_qty + CASE NEW.movement_type
      WHEN 'in' THEN ABS(NEW.quantity)
      WHEN 'out' THEN -ABS(NEW.quantity)
      ELSE NEW.quantity
    END,
    updated_at = NOW()
  WHERE id = NEW.item_id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER inventory_movements_apply
  AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION apply_inventory_movement();

-- ------------------------------------------------------------
-- 12. RLS for the whole module
--     accounts + admin: full access. md: read-only. employee: none.
-- ------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','items','invoice_line_items','estimates','credit_notes',
    'payments','recurring_invoice_templates','crm_leads','crm_contacts',
    'production_orders','inventory_movements'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "billing_full_access" ON %I', t);
    EXECUTE format($p$
      CREATE POLICY "billing_full_access" ON %I
        FOR ALL TO authenticated
        USING (app_role() IN ('accounts','admin'))
        WITH CHECK (app_role() IN ('accounts','admin'))
    $p$, t);
    EXECUTE format('DROP POLICY IF EXISTS "billing_md_read" ON %I', t);
    EXECUTE format($p$
      CREATE POLICY "billing_md_read" ON %I
        FOR SELECT TO authenticated
        USING (app_role() = 'md')
    $p$, t);
  END LOOP;
END $$;

-- Inventory ledger immutability: remove write-back paths
DROP POLICY IF EXISTS "billing_full_access" ON inventory_movements;
CREATE POLICY "inventory_insert" ON inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (app_role() IN ('accounts','admin'));
CREATE POLICY "inventory_read" ON inventory_movements
  FOR SELECT TO authenticated
  USING (app_role() IN ('accounts','admin','md'));

-- Tighten the previously wide-open sales_invoices policy:
-- was USING(true) for every authenticated user.
DROP POLICY IF EXISTS "Auth access invoices" ON sales_invoices;
DROP POLICY IF EXISTS "billing_full_access" ON sales_invoices;
CREATE POLICY "billing_full_access" ON sales_invoices
  FOR ALL TO authenticated
  USING (app_role() IN ('accounts','admin'))
  WITH CHECK (app_role() IN ('accounts','admin'));
DROP POLICY IF EXISTS "billing_md_read" ON sales_invoices;
CREATE POLICY "billing_md_read" ON sales_invoices
  FOR SELECT TO authenticated
  USING (app_role() = 'md');
