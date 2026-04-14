CREATE TABLE IF NOT EXISTS recurring_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  month DATE NOT NULL,
  reference TEXT,
  notes TEXT,
  added_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth access recurring" ON recurring_expenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
