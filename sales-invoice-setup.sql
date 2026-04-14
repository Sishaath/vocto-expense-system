CREATE TABLE IF NOT EXISTS sales_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number TEXT UNIQUE,
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('export', 'dta')),
  invoice_date DATE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_address TEXT,
  customer_gstin TEXT,
  customer_country TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC(14,2) DEFAULT 0,
  cgst NUMERIC(14,2) DEFAULT 0,
  sgst NUMERIC(14,2) DEFAULT 0,
  igst NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  amount_in_words TEXT,
  payment_terms TEXT,
  delivery_terms TEXT,
  notes TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','paid')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS export_inv_seq START 1;
CREATE SEQUENCE IF NOT EXISTS dta_inv_seq START 1;

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

CREATE OR REPLACE TRIGGER set_invoice_number
  BEFORE INSERT ON sales_invoices
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth access invoices" ON sales_invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
