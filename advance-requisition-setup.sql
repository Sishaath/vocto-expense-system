CREATE TABLE IF NOT EXISTS advance_requisitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  req_number TEXT UNIQUE,
  purpose TEXT NOT NULL,
  advance_amount NUMERIC(12,2) NOT NULL,
  actual_amount NUMERIC(12,2),
  balance_to_return NUMERIC(12,2) GENERATED ALWAYS AS (
    CASE WHEN actual_amount IS NOT NULL AND actual_amount < advance_amount
    THEN advance_amount - actual_amount ELSE 0 END
  ) STORED,
  additional_amount NUMERIC(12,2) GENERATED ALWAYS AS (
    CASE WHEN actual_amount IS NOT NULL AND actual_amount > advance_amount
    THEN actual_amount - advance_amount ELSE 0 END
  ) STORED,
  description TEXT,
  submitted_by TEXT NOT NULL,
  vendor_payee TEXT,
  expected_date DATE,
  actual_proof_url TEXT,
  actual_proof_name TEXT,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCOUNTS_APPROVED','ADVANCE_GIVEN','SETTLED','REJECTED')),
  rejection_reason TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  settled_by TEXT,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS req_seq START 1;

CREATE OR REPLACE FUNCTION generate_req_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.req_number IS NULL THEN
    NEW.req_number := 'VT-ADV-' || TO_CHAR(NOW(),'YYYY') || '-' || LPAD(nextval('req_seq')::TEXT,4,'0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_req_number
  BEFORE INSERT ON advance_requisitions
  FOR EACH ROW EXECUTE FUNCTION generate_req_number();

ALTER TABLE advance_requisitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advance req access" ON advance_requisitions
  FOR ALL TO authenticated
  USING (
    submitted_by = auth.uid()::text
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'accounts', 'md')
  )
  WITH CHECK (
    submitted_by = auth.uid()::text
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'accounts', 'md')
  );
