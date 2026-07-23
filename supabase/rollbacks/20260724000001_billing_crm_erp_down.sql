-- ============================================================
-- Rollback for 20260724000001_billing_crm_erp.sql
-- Restores sales_invoices to its pre-migration shape and drops
-- every object the migration created. Run manually only.
-- WARNING: dropping the new tables discards any data entered
-- into them after the migration was applied.
-- ============================================================

-- Restore original permissive sales_invoices policy
DROP POLICY IF EXISTS "billing_full_access" ON sales_invoices;
DROP POLICY IF EXISTS "billing_md_read" ON sales_invoices;
CREATE POLICY "Auth access invoices" ON sales_invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Restore original sequence-based numbering trigger
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    IF NEW.invoice_type = 'export' THEN
      NEW.invoice_number := 'VT-EXP-INV-' || TO_CHAR(NOW(),'YYYY') || '-' || LPAD(nextval('export_inv_seq')::TEXT,4,'0');
    ELSE
      NEW.invoice_number := 'VT-DTA-INV-' || TO_CHAR(NOW(),'YYYY') || '-' || LPAD(nextval('dta_inv_seq')::TEXT,4,'0');
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_invoice_number ON sales_invoices;
CREATE TRIGGER set_invoice_number
  BEFORE INSERT ON sales_invoices
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- Restore original constraints
ALTER TABLE sales_invoices DROP CONSTRAINT IF EXISTS sales_invoices_status_check;
ALTER TABLE sales_invoices ADD CONSTRAINT sales_invoices_status_check
  CHECK (status IN ('draft','sent','paid'));
ALTER TABLE sales_invoices DROP CONSTRAINT IF EXISTS sales_invoices_invoice_type_check;
ALTER TABLE sales_invoices ADD CONSTRAINT sales_invoices_invoice_type_check
  CHECK (invoice_type IN ('export','dta'));

-- Remove added columns
ALTER TABLE sales_invoices
  DROP COLUMN IF EXISTS customer_id,
  DROP COLUMN IF EXISTS customer_state,
  DROP COLUMN IF EXISTS customer_state_code,
  DROP COLUMN IF EXISTS place_of_supply,
  DROP COLUMN IF EXISTS due_date,
  DROP COLUMN IF EXISTS discount,
  DROP COLUMN IF EXISTS amount_paid;

-- Drop new tables (dependency order)
DROP TABLE IF EXISTS inventory_movements;
DROP TABLE IF EXISTS production_orders;
DROP TABLE IF EXISTS crm_contacts;
DROP TABLE IF EXISTS crm_leads;
DROP TABLE IF EXISTS recurring_invoice_templates;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS credit_notes;
DROP TABLE IF EXISTS estimates;
DROP TABLE IF EXISTS invoice_line_items;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS doc_series;

-- Drop helper functions
DROP FUNCTION IF EXISTS apply_inventory_movement();
DROP FUNCTION IF EXISTS generate_production_order_number();
DROP FUNCTION IF EXISTS sync_invoice_payment_status();
DROP FUNCTION IF EXISTS generate_payment_number();
DROP FUNCTION IF EXISTS generate_credit_note_number();
DROP FUNCTION IF EXISTS generate_estimate_number();
DROP FUNCTION IF EXISTS next_doc_number(TEXT, TEXT);
DROP FUNCTION IF EXISTS current_fy_label();
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS app_role();
