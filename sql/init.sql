CREATE TABLE IF NOT EXISTS orders (
  out_trade_no TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  money NUMERIC(10, 2) NOT NULL,
  pay_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  trade_no TEXT,
  raw_notify JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);
