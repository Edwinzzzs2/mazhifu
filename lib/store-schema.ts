import {
  encryptCardSecret,
  hashCardSecret,
} from "@/lib/card-secret-crypto";
import { getPool } from "@/lib/db";

declare global {
  // Reuse one schema initialization across concurrent requests and hot reloads.
  // eslint-disable-next-line no-var
  var mazhifuStoreSchemaPromise: Promise<void> | undefined;
}

async function initializeStoreSchema() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS categories (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      sold_count INTEGER NOT NULL DEFAULT 0 CHECK (sold_count >= 0),
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
      pay_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      trade_no TEXT,
      raw_notify JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_at TIMESTAMPTZ
    );

    ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10, 2);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact TEXT NOT NULL DEFAULT '';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_token_hash TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS query_checked_at TIMESTAMPTZ;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS query_response JSONB;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS query_password_hash TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS query_password_lookup TEXT;

    UPDATE orders SET unit_price = money WHERE unit_price IS NULL;
    UPDATE orders SET expires_at = created_at + INTERVAL '15 minutes' WHERE expires_at IS NULL;

    CREATE TABLE IF NOT EXISTS order_access_sessions (
      session_hash TEXT NOT NULL,
      order_no TEXT NOT NULL REFERENCES orders(out_trade_no) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_hash, order_no)
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
    CREATE INDEX IF NOT EXISTS orders_status_created_at_idx
      ON orders (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS orders_pending_expires_at_idx
      ON orders (expires_at)
      WHERE status = 'pending' AND paid_at IS NULL;
    CREATE INDEX IF NOT EXISTS orders_contact_query_lookup_idx
      ON orders (LOWER(contact), query_password_lookup, created_at DESC);
    CREATE INDEX IF NOT EXISTS order_access_sessions_order_idx
      ON order_access_sessions (order_no);
    CREATE INDEX IF NOT EXISTS order_access_sessions_expires_idx
      ON order_access_sessions (expires_at);
    CREATE INDEX IF NOT EXISTS products_category_active_idx
      ON products (category_id, active);
    CREATE UNIQUE INDEX IF NOT EXISTS card_secrets_product_hash_unique
      ON card_secrets (product_id, secret_hash);
    CREATE INDEX IF NOT EXISTS card_secrets_product_status_idx
      ON card_secrets (product_id, status, id);
    CREATE INDEX IF NOT EXISTS card_secrets_order_status_idx
      ON card_secrets (order_no, status);
    CREATE INDEX IF NOT EXISTS admin_refresh_tokens_user_idx
      ON admin_refresh_tokens (user_id, expires_at DESC);

    INSERT INTO settings (key, value)
    VALUES (
      'site',
      jsonb_build_object(
        'site_name', '码付小铺',
        'site_description', '安全、自动发货的码支付卡密小铺',
        'site_logo_url', '',
        'site_icon_url', '',
        'announcement', '',
        'contact_email', '',
        'contact_text', '遇到问题请保留订单号，并通过商家公布的联系方式处理。',
        'seo_title', '',
        'seo_keywords', '码支付,卡密,自动发货',
        'mapay_sitename', '',
        'notice_items', jsonb_build_array(
          '本站商品用于合法业务测试，请按商品说明购买。',
          '支付状态由服务端验签确认，页面跳转不代表到账。',
          '订单有效期内完成支付，超时后请重新下单。',
          '遇到问题请保留订单号，切勿泄露订单访问链接。'
        )
      )
    )
    ON CONFLICT (key) DO NOTHING;

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

    INSERT INTO categories (name, slug, sort_order)
    VALUES
      ('默认商品', 'default', 10),
      ('测试专区', 'testing', 20)
    ON CONFLICT (slug) DO NOTHING;

    INSERT INTO products (
      id, category_id, name, subtitle, description, instructions,
      price, stock, sold_count, badge, features
    )
    SELECT
      'test-card',
      id,
      '测试卡密',
      '0.10 元支付链路测试商品',
      '用于验证下单、码支付跳转、异步通知和订单状态查询。',
      '支付完成后订单页会展示自动发出的测试卡密。正式上架时请在后台导入真实库存。',
      0.10,
      1000,
      0,
      '默认',
      '["服务端验签", "订单金额校验", "安全状态令牌"]'::jsonb
    FROM categories
    WHERE slug = 'default'
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO products (
      id, category_id, name, subtitle, description, instructions,
      price, stock, sold_count, badge, features
    )
    SELECT
      'demo-vip',
      id,
      '体验会员卡',
      '即时发卡演示商品',
      '适合演示商品详情、支付方式选择和订单状态追踪。',
      '下单时请填写可联系到你的邮箱或手机号，支付完成后自动发出库存卡密。',
      0.10,
      500,
      12,
      '演示',
      '["支付宝与微信", "支付回调幂等", "后台主动补单"]'::jsonb
    FROM categories
    WHERE slug = 'testing'
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO products (
      id, category_id, name, subtitle, description, instructions,
      price, stock, sold_count, badge, features
    )
    SELECT
      'gift-code',
      id,
      '兑换码礼包',
      '预置低价数字商品',
      '用于展示卡网商品分组、库存和销量信息。',
      '本商品为测试数据。正式上架时请在管理后台替换商品说明并导入真实卡密。',
      0.10,
      300,
      8,
      '预置',
      '["PG 商品库存", "独立订单页面", "回调原文留档"]'::jsonb
    FROM categories
    WHERE slug = 'testing'
    ON CONFLICT (id) DO NOTHING;
  `);

  await seedDemoCardSecrets();
}

async function seedDemoCardSecrets() {
  const seeds = [
    ...Array.from({ length: 30 }, (_, index) => ({
      product_id: "test-card",
      secret: "TEST-CARD-" + String(index + 1).padStart(4, "0"),
    })),
    ...Array.from({ length: 12 }, (_, index) => ({
      product_id: "demo-vip",
      secret: "DEMO-VIP-" + String(index + 1).padStart(4, "0"),
    })),
    ...Array.from({ length: 12 }, (_, index) => ({
      product_id: "gift-code",
      secret: "GIFT-CODE-" + String(index + 1).padStart(4, "0"),
    })),
  ];

  // 先删除所有旧的 seed 数据，确保密钥轮换后用新密钥重新加密
  await getPool().query(
    `DELETE FROM card_secrets WHERE batch_no = 'seed' AND status = 'available'`,
  );

  await getPool().query(
    `
      INSERT INTO card_secrets (
        product_id, secret_ciphertext, secret_hash, status, batch_no, note
      )
      SELECT data.product_id, data.secret_ciphertext, data.secret_hash, 'available', 'seed', '系统演示卡密'
      FROM UNNEST($1::text[], $2::text[], $3::text[])
        AS data(product_id, secret_ciphertext, secret_hash)
      ON CONFLICT (product_id, secret_hash) DO NOTHING
    `,
    [
      seeds.map((seed) => seed.product_id),
      seeds.map((seed) => encryptCardSecret(seed.secret)),
      seeds.map((seed) => hashCardSecret(seed.secret)),
    ],
  );
}

export function ensureStoreSchema() {
  if (!globalThis.mazhifuStoreSchemaPromise) {
    globalThis.mazhifuStoreSchemaPromise = initializeStoreSchema().catch((error) => {
      globalThis.mazhifuStoreSchemaPromise = undefined;
      throw error;
    });
  }

  return globalThis.mazhifuStoreSchemaPromise;
}
