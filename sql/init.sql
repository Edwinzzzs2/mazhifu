CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  category_id BIGINT REFERENCES categories(id),
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  price NUMERIC(10, 2) NOT NULL DEFAULT 0.10,
  stock INTEGER NOT NULL DEFAULT 0,
  sold_count INTEGER NOT NULL DEFAULT 0,
  badge TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  out_trade_no TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  money NUMERIC(10, 2) NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.10,
  quantity INTEGER NOT NULL DEFAULT 1,
  contact TEXT NOT NULL DEFAULT '',
  pay_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  fulfillment_status TEXT NOT NULL DEFAULT 'pending',
  status_token_hash TEXT,
  trade_no TEXT,
  raw_notify JSONB,
  query_response JSONB,
  query_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes',
  paid_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS card_secrets (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  secret_ciphertext TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  order_no TEXT REFERENCES orders(out_trade_no) ON DELETE SET NULL,
  batch_no TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  reserved_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT card_secrets_status_check CHECK (status IN ('available', 'reserved', 'used'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN', 'USER')),
  row_status TEXT NOT NULL DEFAULT 'NORMAL' CHECK (row_status IN ('NORMAL', 'ARCHIVED')),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_refresh_tokens (
  token_id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS orders_trade_no_unique
  ON orders (trade_no)
  WHERE trade_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS orders_expires_idx ON orders(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS card_secrets_product_hash_unique
  ON card_secrets(product_id, secret_hash);
CREATE INDEX IF NOT EXISTS card_secrets_product_status_idx
  ON card_secrets(product_id, status, id);
CREATE INDEX IF NOT EXISTS card_secrets_order_status_idx
  ON card_secrets(order_no, status);
CREATE INDEX IF NOT EXISTS admin_refresh_tokens_user_idx
  ON admin_refresh_tokens(user_id, expires_at DESC);

INSERT INTO settings (key, value)
VALUES (
  'instance_general',
  jsonb_build_object(
    'disallow_user_registration', false,
    'disallow_password_auth', false,
    'disallow_change_username', false
  )
)
ON CONFLICT (key) DO NOTHING;
