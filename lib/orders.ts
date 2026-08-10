import crypto from "crypto";
import type { PoolClient } from "pg";
import { getDeliverySecrets } from "@/lib/card-secrets";
import { getPool } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import type { MapayQueryResult } from "@/lib/mapay";
import {
  hashOrderSessionToken,
  isOrderSessionToken,
  ORDER_SESSION_TTL_SECONDS,
} from "@/lib/order-access";
import { verifyOrderReturnGrant } from "@/lib/order-return-access";
import type { ProductRecord } from "@/lib/products";
import { ensureStoreSchema } from "@/lib/store-schema";

const paymentLogger = createLogger("orders:payment");
const queryLogger = createLogger("orders:query");

export type OrderStatus = "pending" | "paid" | "expired" | "cancelled";
export type FulfillmentStatus = "pending" | "delivered" | "failed";

export type OrderRecord = {
  out_trade_no: string;
  product_id: string;
  product_name: string;
  money: string;
  unit_price: string;
  quantity: number;
  contact: string;
  pay_type: string;
  status: OrderStatus;
  fulfillment_status: FulfillmentStatus;
  status_token_hash: string | null;
  trade_no: string | null;
  raw_notify: unknown | null;
  query_response: unknown | null;
  query_checked_at: string | null;
  created_at: string;
  expires_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  query_password_hash: string | null;
  query_password_lookup: string | null;
};

export type CreatedOrder = {
  order: OrderRecord;
  return_token: string;
};

export type OrderView = OrderRecord & {
  delivery_content: string[];
};

function getQueryPasswordPepper() {
  const pepper = process.env.ORDER_QUERY_PASSWORD_PEPPER ?? "";
  const invalid = !pepper || pepper.startsWith("replace_with_") || pepper.length < 32;
  if (invalid && process.env.NODE_ENV === "production") {
    throw new Error("ORDER_QUERY_PASSWORD_PEPPER must be at least 32 characters");
  }
  return invalid ? "mazhifu-development-query-password-pepper" : pepper;
}

function createQueryPasswordLookup(password: string, pepper: string) {
  return crypto
    .createHmac("sha256", pepper)
    .update(password)
    .digest("hex");
}

function getQueryPasswordLookup(password: string) {
  return createQueryPasswordLookup(password, getQueryPasswordPepper());
}

function getPreviousQueryPasswordLookups(password: string) {
  return (process.env.ORDER_QUERY_PASSWORD_PREVIOUS_PEPPERS ?? "")
    .split(",")
    .map((pepper) => pepper.trim())
    .filter((pepper) => pepper.length >= 32)
    .map((pepper) => createQueryPasswordLookup(password, pepper));
}

const ORDER_QUERY_GRANT_TTL_SECONDS = 10 * 60;
const LEGACY_ORDER_SCAN_CURSOR_TTL_SECONDS = 60 * 60;

type OrderQueryGrantPayload = {
  version: 1;
  email: string;
  lookup: string;
  expires_at: number;
};

type LegacyOrderScanCursorPayload = {
  version: 1;
  email: string;
  created_at: string;
  out_trade_no: string;
  expires_at: number;
};

function signOrderQueryGrant(encodedPayload: string) {
  return crypto
    .createHmac("sha256", getQueryPasswordPepper())
    .update(`order-query-grant:${encodedPayload}`)
    .digest("base64url");
}

export function createOrderQueryGrant(email: string, queryPassword: string) {
  const payload: OrderQueryGrantPayload = {
    version: 1,
    email: email.trim().toLowerCase(),
    lookup: getQueryPasswordLookup(queryPassword),
    expires_at: Math.floor(Date.now() / 1000) + ORDER_QUERY_GRANT_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signOrderQueryGrant(encodedPayload)}`;
}

function verifyOrderQueryGrant(token: string): OrderQueryGrantPayload | null {
  const [encodedPayload, signature, ...extra] = token.split(".");
  if (!encodedPayload || !signature || extra.length > 0 || token.length > 1024) return null;
  if (!safeEqualText(signature, signOrderQueryGrant(encodedPayload))) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<OrderQueryGrantPayload>;
    if (
      payload.version !== 1
      || typeof payload.email !== "string"
      || !payload.email
      || payload.email.length > 120
      || typeof payload.lookup !== "string"
      || !/^[a-f0-9]{64}$/i.test(payload.lookup)
      || typeof payload.expires_at !== "number"
      || payload.expires_at < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload as OrderQueryGrantPayload;
  } catch {
    return null;
  }
}

function createLegacyOrderScanCursor(
  email: string,
  order: Pick<OrderRecord, "created_at" | "out_trade_no">,
) {
  const payload: LegacyOrderScanCursorPayload = {
    version: 1,
    email,
    created_at: order.created_at,
    out_trade_no: order.out_trade_no,
    expires_at: Math.floor(Date.now() / 1000) + LEGACY_ORDER_SCAN_CURSOR_TTL_SECONDS,
  };
  const key = crypto
    .createHash("sha256")
    .update(`legacy-order-scan:${getQueryPasswordPepper()}`)
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("legacy-order-scan:v1"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

function verifyLegacyOrderScanCursor(token: string, email: string) {
  if (!token || token.length > 1024) return null;

  try {
    const packed = Buffer.from(token, "base64url");
    if (packed.length <= 28) return null;
    const key = crypto
      .createHash("sha256")
      .update(`legacy-order-scan:${getQueryPasswordPepper()}`)
      .digest();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      packed.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from("legacy-order-scan:v1"));
    decipher.setAuthTag(packed.subarray(12, 28));
    const plaintext = Buffer.concat([
      decipher.update(packed.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(plaintext) as Partial<LegacyOrderScanCursorPayload>;
    if (
      payload.version !== 1
      || payload.email !== email
      || typeof payload.created_at !== "string"
      || !payload.created_at
      || typeof payload.out_trade_no !== "string"
      || !payload.out_trade_no
      || typeof payload.expires_at !== "number"
      || payload.expires_at < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload as LegacyOrderScanCursorPayload;
  } catch {
    return null;
  }
}

function hashQueryPassword(password: string): string | null {
  if (!password) return null;
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

function safeEqualText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isLegacyQueryPasswordHash(value: string | null) {
  return Boolean(value && /^[a-f0-9]{64}$/i.test(value));
}

function deriveQueryPassword(password: string, salt: string) {
  return new Promise<string>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey.toString("base64url"));
    });
  });
}

async function verifyQueryPasswordAsync(password: string, storedHash: string | null) {
  if (!password || !storedHash) return false;
  if (isLegacyQueryPasswordHash(storedHash)) {
    const legacyHash = crypto.createHash("sha256").update(password).digest("hex");
    return safeEqualText(legacyHash, storedHash);
  }

  const [version, salt, expectedHash] = storedHash.split("$");
  if (version !== "scrypt" || !salt || !expectedHash) return false;
  const actualHash = await deriveQueryPassword(password, salt);
  return safeEqualText(actualHash, expectedHash);
}

async function hashQueryPasswordAsync(password: string): Promise<string | null> {
  if (!password) return null;
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = await deriveQueryPassword(password, salt);
  return `scrypt$${salt}$${hash}`;
}

async function upgradeLegacyQueryPassword(order: OrderRecord, password: string) {
  if (!isLegacyQueryPasswordHash(order.query_password_hash)) return;

  // 仅在旧哈希仍未变化时升级，避免并发查询覆盖其他请求已经写入的新值。
  await getPool().query(
    `UPDATE orders
     SET query_password_hash = $2, query_password_lookup = $3
     WHERE out_trade_no = $1 AND query_password_hash = $4`,
    [
      order.out_trade_no,
      await hashQueryPasswordAsync(password),
      getQueryPasswordLookup(password),
      order.query_password_hash,
    ],
  );
}

function createOutTradeNo() {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `MZF${timestamp}${crypto.randomInt(100000, 999999)}`;
}

function hashAccessToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function returnTokenMatches(outTradeNo: string, storedHash: string | null, token: string) {
  if (verifyOrderReturnGrant(outTradeNo, token)) {
    return true;
  }

  if (!storedHash || !token) {
    return false;
  }

  const actual = Buffer.from(hashAccessToken(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function createOrder(
  product: ProductRecord,
  payType: string,
  quantity: number,
  contact: string,
  queryPassword: string,
  sessionToken: string,
): Promise<CreatedOrder> {
  await ensureStoreSchema();

  if (queryPassword.length < 8 || queryPassword.length > 64) {
    throw new Error("query password must be 8-64 characters");
  }
  if (!isOrderSessionToken(sessionToken)) {
    throw new Error("invalid order session token");
  }

  const safeQuantity = Math.max(1, Math.min(10, Math.trunc(quantity)));
  if (!product.active || product.stock < safeQuantity) {
    throw new Error("product is unavailable");
  }

  const returnToken = crypto.randomBytes(24).toString("base64url");
  const sessionHash = hashOrderSessionToken(sessionToken);
  const outTradeNo = createOutTradeNo();
  const money = (Number(product.price) * safeQuantity).toFixed(2);
  const configuredExpires = Number(process.env.ORDER_TTL_MINUTES ?? 15);
  const expiresMinutes = Number.isFinite(configuredExpires)
    ? Math.max(5, configuredExpires)
    : 15;
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    // 下单阶段先预占卡密，避免多个未支付订单同时占用同一份可发库存。
    const lockedSecrets = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM card_secrets
        WHERE product_id = $1 AND status = 'available'
        ORDER BY id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $2
      `,
      [product.id, safeQuantity],
    );
    if (lockedSecrets.rows.length < safeQuantity) {
      throw new Error("card secret stock is unavailable");
    }

    const result = await client.query<OrderRecord>(
      `
        INSERT INTO orders (
          out_trade_no, product_id, product_name, money, unit_price,
          quantity, contact, pay_type, status_token_hash, expires_at,
          query_password_hash, query_password_lookup
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          NOW() + ($10 * INTERVAL '1 minute'),
          $11, $12
        )
        RETURNING *
      `,
      [
        outTradeNo,
        product.id,
        product.name,
        money,
        product.price,
        safeQuantity,
        contact.slice(0, 120),
        payType,
        hashAccessToken(returnToken),
        expiresMinutes,
        hashQueryPassword(queryPassword),
        getQueryPasswordLookup(queryPassword),
      ],
    );

    await client.query(
      `UPDATE order_access_sessions
       SET expires_at = NOW() + ($2 * INTERVAL '1 second'), updated_at = NOW()
       WHERE session_hash = $1`,
      [sessionHash, ORDER_SESSION_TTL_SECONDS],
    );
    await client.query(
      `INSERT INTO order_access_sessions (session_hash, order_no, expires_at)
       VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 second'))
       ON CONFLICT (session_hash, order_no) DO UPDATE
       SET expires_at = EXCLUDED.expires_at, updated_at = NOW()`,
      [sessionHash, outTradeNo, ORDER_SESSION_TTL_SECONDS],
    );

    const secretIds = lockedSecrets.rows.map((row) => row.id);
    const reserved = await client.query(
      `
        UPDATE card_secrets
        SET status = 'reserved',
            order_no = $1,
            reserved_at = NOW(),
            updated_at = NOW()
        WHERE id = ANY($2::bigint[]) AND status = 'available'
      `,
      [outTradeNo, secretIds],
    );
    if (reserved.rowCount !== secretIds.length) {
      throw new Error("card secret reservation failed");
    }

    await client.query("COMMIT");

    const createdOrder = result.rows[0];

    return { order: createdOrder, return_token: returnToken };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 更新订单的平台流水号（MAPI 创建支付时返回）。
 * 使用 COALESCE 确保不覆盖已有的 trade_no。
 */
export async function updateOrderTradeNo(outTradeNo: string, tradeNo: string) {
  await getPool().query(
    `UPDATE orders SET trade_no = COALESCE(trade_no, $2) WHERE out_trade_no = $1`,
    [outTradeNo, tradeNo],
  );
}

export async function getOrderByOutTradeNo(outTradeNo: string) {
  await ensureStoreSchema();
  const result = await getPool().query<OrderRecord>(
    "SELECT * FROM orders WHERE out_trade_no = $1",
    [outTradeNo],
  );
  return result.rows[0] ?? null;
}

export async function getOrderWithReturnToken(outTradeNo: string, returnToken: string) {
  const order = await getOrderByOutTradeNo(outTradeNo);
  return order && returnTokenMatches(outTradeNo, order.status_token_hash, returnToken)
    ? order
    : null;
}

export async function grantOrderSessionAccess(outTradeNo: string, sessionToken: string) {
  if (!isOrderSessionToken(sessionToken)) return false;

  await ensureStoreSchema();
  const sessionHash = hashOrderSessionToken(sessionToken);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE order_access_sessions
       SET expires_at = NOW() + ($2 * INTERVAL '1 second'), updated_at = NOW()
       WHERE session_hash = $1`,
      [sessionHash, ORDER_SESSION_TTL_SECONDS],
    );
    const result = await client.query<{ order_no: string }>(
      `INSERT INTO order_access_sessions (session_hash, order_no, expires_at)
       SELECT $1, out_trade_no, NOW() + ($3 * INTERVAL '1 second')
       FROM orders
       WHERE out_trade_no = $2
       ON CONFLICT (session_hash, order_no) DO UPDATE
       SET expires_at = EXCLUDED.expires_at, updated_at = NOW()
       RETURNING order_no`,
      [sessionHash, outTradeNo, ORDER_SESSION_TTL_SECONDS],
    );
    await client.query("COMMIT");
    return result.rowCount === 1;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getOrderWithSession(outTradeNo: string, sessionToken: string) {
  if (!isOrderSessionToken(sessionToken)) return null;

  await ensureStoreSchema();
  const result = await getPool().query<OrderRecord>(
    `SELECT orders.*
     FROM orders
     INNER JOIN order_access_sessions AS access
       ON access.order_no = orders.out_trade_no
     WHERE orders.out_trade_no = $1
       AND access.session_hash = $2
       AND access.expires_at > NOW()
     LIMIT 1`,
    [outTradeNo, hashOrderSessionToken(sessionToken)],
  );
  return result.rows[0] ?? null;
}

export async function getOrderViewWithSession(outTradeNo: string, sessionToken: string) {
  const order = await getOrderWithSession(outTradeNo, sessionToken);
  if (!order) {
    return null;
  }

  const deliveryContent = order.status === "paid" ? await getDeliverySecrets(outTradeNo) : [];
  return {
    ...order,
    delivery_content: deliveryContent,
  } satisfies OrderView;
}

export async function getOrderViewByQueryAuth(
  outTradeNo: string,
  email: string,
  queryPassword: string,
): Promise<OrderView | null> {
  await ensureStoreSchema();

  const normalizedEmail = email.trim().toLowerCase();
  if (!outTradeNo || !normalizedEmail || !queryPassword) return null;

  const result = await getPool().query<OrderRecord>(
    "SELECT * FROM orders WHERE out_trade_no = $1",
    [outTradeNo],
  );
  const order = result.rows[0];
  if (!order) return null;

  if (order.contact.trim().toLowerCase() !== normalizedEmail) return null;

  if (!(await verifyQueryPasswordAsync(queryPassword, order.query_password_hash))) return null;
  await upgradeLegacyQueryPassword(order, queryPassword);

  const refreshed = await getPool().query<OrderRecord>(
    "SELECT * FROM orders WHERE out_trade_no = $1",
    [outTradeNo],
  );
  const refreshedOrder = refreshed.rows[0] ?? order;
  const deliveryContent =
    refreshedOrder.status === "paid" ? await getDeliverySecrets(outTradeNo) : [];
  return { ...refreshedOrder, delivery_content: deliveryContent } satisfies OrderView;
}

export async function getOrderViewInternal(outTradeNo: string): Promise<OrderView | null> {
  const result = await getPool().query<OrderRecord>(
    "SELECT * FROM orders WHERE out_trade_no = $1",
    [outTradeNo],
  );
  const order = result.rows[0];
  if (!order) return null;
  const deliveryContent =
    order.status === "paid" ? await getDeliverySecrets(outTradeNo) : [];
  return { ...order, delivery_content: deliveryContent } satisfies OrderView;
}

export type OrderQueryListResult = {
  orders: OrderView[];
  total: number;
  page: number;
  page_size: number;
  legacy_scan_pending: boolean;
  legacy_scan_cursor: string | null;
};

const ORDER_QUERY_PAGE_SIZE = 20;

async function loadOrdersByQueryLookup(
  normalizedEmail: string,
  lookup: string,
  page: number,
) {
  const requestedPage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const countResult = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM orders
     WHERE LOWER(contact) = $1 AND query_password_lookup = $2`,
    [normalizedEmail, lookup],
  );
  const total = Number(countResult.rows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / ORDER_QUERY_PAGE_SIZE));
  const normalizedPage = Math.min(requestedPage, totalPages);
  const offset = (normalizedPage - 1) * ORDER_QUERY_PAGE_SIZE;
  const result = await getPool().query<OrderRecord>(
    `SELECT * FROM orders
     WHERE LOWER(contact) = $1 AND query_password_lookup = $2
     ORDER BY created_at DESC, out_trade_no DESC
     LIMIT $3 OFFSET $4`,
    [normalizedEmail, lookup, ORDER_QUERY_PAGE_SIZE, offset],
  );
  return { rows: result.rows, total, page: normalizedPage };
}

async function attachOrderDeliveryContent(orders: OrderRecord[]) {
  return Promise.all(orders.map(async (order) => {
    const deliveryContent =
      order.status === "paid" ? await getDeliverySecrets(order.out_trade_no) : [];
    return { ...order, delivery_content: deliveryContent } satisfies OrderView;
  }));
}

export async function listOrdersByQueryGrant(
  token: string,
  page = 1,
): Promise<OrderQueryListResult | null> {
  await ensureStoreSchema();

  const grant = verifyOrderQueryGrant(token);
  if (!grant) return null;

  const indexed = await loadOrdersByQueryLookup(grant.email, grant.lookup, page);
  return {
    orders: await attachOrderDeliveryContent(indexed.rows),
    total: indexed.total,
    page: indexed.page,
    page_size: ORDER_QUERY_PAGE_SIZE,
    legacy_scan_pending: false,
    legacy_scan_cursor: null,
  };
}

export async function listOrdersByQueryAuth(
  email: string,
  queryPassword: string,
  page = 1,
  legacyScanCursor = "",
): Promise<OrderQueryListResult> {
  await ensureStoreSchema();

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !queryPassword) {
    return {
      orders: [],
      total: 0,
      page: 1,
      page_size: ORDER_QUERY_PAGE_SIZE,
      legacy_scan_pending: false,
      legacy_scan_cursor: null,
    };
  }

  const lookup = getQueryPasswordLookup(queryPassword);
  const legacyHash = crypto.createHash("sha256").update(queryPassword).digest("hex");
  const previousLookups = getPreviousQueryPasswordLookups(queryPassword);

  if (previousLookups.length > 0) {
    await getPool().query(
      `UPDATE orders
       SET query_password_lookup = $3
       WHERE LOWER(contact) = $1
         AND query_password_lookup = ANY($2::text[])
         AND query_password_lookup IS DISTINCT FROM $3`,
      [normalizedEmail, previousLookups, lookup],
    );
  }

  // 旧 SHA-256 记录可以直接按摘要命中，无需逐条慢哈希校验；先补齐 lookup，
  // 让后续分页和短期查询授权都走同一条索引路径。
  await getPool().query(
    `UPDATE orders
     SET query_password_lookup = $3
     WHERE LOWER(contact) = $1
       AND query_password_hash = $2
       AND query_password_lookup IS DISTINCT FROM $3`,
    [normalizedEmail, legacyHash, lookup],
  );

  // 兼容早期缺少 lookup 的 scrypt 记录。每次首次认证最多迁移 100 条，
  // 并显式返回是否仍有候选，避免把不完整的历史结果伪装成最终全集。
  const verifiedLegacyCursor = legacyScanCursor
    ? verifyLegacyOrderScanCursor(legacyScanCursor, normalizedEmail)
    : null;
  const legacyResult = await getPool().query<OrderRecord>(
    `SELECT * FROM orders
     WHERE LOWER(contact) = $1
       AND query_password_lookup IS NULL
       AND query_password_hash IS NOT NULL
       ${verifiedLegacyCursor
         ? "AND (created_at, out_trade_no) < ($2::timestamptz, $3)"
         : ""}
     ORDER BY created_at DESC, out_trade_no DESC
     LIMIT 101`,
    verifiedLegacyCursor
      ? [normalizedEmail, verifiedLegacyCursor.created_at, verifiedLegacyCursor.out_trade_no]
      : [normalizedEmail],
  );
  const legacyScanPending = legacyResult.rows.length > 100;
  const legacyScanCursorValue = legacyScanPending
    ? createLegacyOrderScanCursor(normalizedEmail, legacyResult.rows[99])
    : null;

  for (const order of legacyResult.rows.slice(0, 100)) {
    if (!(await verifyQueryPasswordAsync(queryPassword, order.query_password_hash))) continue;
    await getPool().query(
      `UPDATE orders
       SET query_password_lookup = $2
       WHERE out_trade_no = $1 AND query_password_lookup IS NULL`,
      [order.out_trade_no, lookup],
    );
  }

  const indexed = await loadOrdersByQueryLookup(normalizedEmail, lookup, page);

  const authenticatedOrders: OrderRecord[] = [];
  for (const order of indexed.rows) {
    if (!(await verifyQueryPasswordAsync(queryPassword, order.query_password_hash))) continue;
    await upgradeLegacyQueryPassword(order, queryPassword);
    authenticatedOrders.push(order);
  }

  return {
    orders: await attachOrderDeliveryContent(authenticatedOrders),
    total: indexed.total,
    page: indexed.page,
    page_size: ORDER_QUERY_PAGE_SIZE,
    legacy_scan_pending: legacyScanPending,
    legacy_scan_cursor: legacyScanCursorValue,
  };
}

async function assignCardSecretsForOrder(client: PoolClient, order: OrderRecord) {
  if (order.fulfillment_status === "delivered") {
    return true;
  }

  // 支付确认后优先使用本订单预占的卡密；晚到付款则尝试从现有可用库存补发。
  const reserved = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM card_secrets
      WHERE order_no = $1 AND status = 'reserved'
      ORDER BY id ASC
      FOR UPDATE
    `,
    [order.out_trade_no],
  );
  const secretIds = reserved.rows.map((row) => row.id);
  const need = order.quantity - secretIds.length;

  if (need > 0) {
    const available = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM card_secrets
        WHERE product_id = $1 AND status = 'available'
        ORDER BY id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $2
      `,
      [order.product_id, need],
    );
    secretIds.push(...available.rows.map((row) => row.id));
  }

  if (secretIds.length < order.quantity) {
    return false;
  }

  const used = await client.query(
    `
      UPDATE card_secrets
      SET status = 'used',
          order_no = $1,
          reserved_at = NULL,
          used_at = NOW(),
          updated_at = NOW()
      WHERE id = ANY($2::bigint[])
        AND status IN ('available', 'reserved')
        AND (order_no IS NULL OR order_no = $1)
    `,
    [order.out_trade_no, secretIds],
  );

  if (used.rowCount !== secretIds.length) {
    throw new Error("card secret assignment failed");
  }

  await client.query(
    `
      UPDATE orders
      SET fulfillment_status = 'delivered',
          fulfilled_at = COALESCE(fulfilled_at, NOW())
      WHERE out_trade_no = $1
    `,
    [order.out_trade_no],
  );

  return true;
}

export async function retryOrderFulfillment(outTradeNo: string) {
  await ensureStoreSchema();
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const orderResult = await client.query<OrderRecord>(
      "SELECT * FROM orders WHERE out_trade_no = $1 FOR UPDATE",
      [outTradeNo],
    );
    const order = orderResult.rows[0];
    if (!order || order.status !== "paid" || order.fulfillment_status === "delivered") {
      await client.query("ROLLBACK");
      return false;
    }

    const delivered = await assignCardSecretsForOrder(client, order);
    await client.query(
      `
        UPDATE orders
        SET fulfillment_status = $2,
            fulfilled_at = CASE WHEN $2 = 'delivered' THEN COALESCE(fulfilled_at, NOW()) ELSE fulfilled_at END
        WHERE out_trade_no = $1
      `,
      [outTradeNo, delivered ? "delivered" : "failed"],
    );

    await client.query("COMMIT");
    return delivered;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function markOrderPaid(
  outTradeNo: string,
  paidMoney: string,
  tradeNo: string | null,
  rawPayload: unknown,
  source: "notify" | "query",
) {
  await ensureStoreSchema();
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const orderResult = await client.query<OrderRecord>(
      "SELECT * FROM orders WHERE out_trade_no = $1 FOR UPDATE",
      [outTradeNo],
    );
    const order = orderResult.rows[0];

    // 订单号和金额必须同时匹配，避免拿真实小额回调去撞大额订单。
    if (!order || Number(order.money).toFixed(2) !== Number(paidMoney).toFixed(2)) {
      paymentLogger.warn("rejected payment update", {
        out_trade_no: outTradeNo,
        source,
        paid_money: paidMoney,
        trade_no: tradeNo,
        order_found: Boolean(order),
        expected_money: order?.money,
      });
      await client.query("ROLLBACK");
      return false;
    }

    if (tradeNo) {
      // 平台流水号只能绑定一个本地订单，重复回调只能幂等更新同一单。
      const duplicate = await client.query<{ out_trade_no: string }>(
        "SELECT out_trade_no FROM orders WHERE trade_no = $1 AND out_trade_no <> $2 LIMIT 1",
        [tradeNo, outTradeNo],
      );
      if (duplicate.rowCount) {
        paymentLogger.warn("rejected duplicate trade_no", {
          out_trade_no: outTradeNo,
          source,
          trade_no: tradeNo,
          duplicate_out_trade_no: duplicate.rows[0]?.out_trade_no,
        });
        await client.query("ROLLBACK");
        return false;
      }
    }

    if (order.status !== "paid") {
      // 首次确认支付时才把预占卡密转为已使用，后续 notify/query 重放只会幂等更新。
      const delivered = await assignCardSecretsForOrder(client, order);
      await client.query(
        `
          UPDATE orders
          SET status = 'paid',
              trade_no = COALESCE(trade_no, $2),
              raw_notify = CASE WHEN $4 = 'notify' THEN $3::jsonb ELSE raw_notify END,
              query_response = CASE WHEN $4 = 'query' THEN $3::jsonb ELSE query_response END,
              query_checked_at = CASE WHEN $4 = 'query' THEN NOW() ELSE query_checked_at END,
              paid_at = COALESCE(paid_at, NOW()),
              fulfillment_status = $5,
              fulfilled_at = CASE WHEN $5 = 'delivered' THEN COALESCE(fulfilled_at, NOW()) ELSE fulfilled_at END
          WHERE out_trade_no = $1
        `,
        [outTradeNo, tradeNo, JSON.stringify(rawPayload), source, delivered ? "delivered" : "failed"],
      );
      await client.query(
        `
          UPDATE products
          SET sold_count = sold_count + $2,
              updated_at = NOW()
          WHERE id = $1
        `,
        [order.product_id, order.quantity],
      );
      paymentLogger.info("marked order paid", {
        out_trade_no: outTradeNo,
        source,
        trade_no: tradeNo,
        product_id: order.product_id,
        quantity: order.quantity,
        delivered,
        fulfillment_status: delivered ? "delivered" : "failed",
      });
    } else if (source === "query") {
      await client.query(
        `
          UPDATE orders
          SET query_response = $2::jsonb, query_checked_at = NOW()
          WHERE out_trade_no = $1
        `,
        [outTradeNo, JSON.stringify(rawPayload)],
      );
      paymentLogger.info("refreshed paid order query payload", {
        out_trade_no: outTradeNo,
        source,
        trade_no: tradeNo,
        existing_status: order.status,
        fulfillment_status: order.fulfillment_status,
      });
    } else {
      paymentLogger.info("duplicate paid callback accepted", {
        out_trade_no: outTradeNo,
        source,
        trade_no: tradeNo,
        existing_status: order.status,
        fulfillment_status: order.fulfillment_status,
      });
    }

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markOrderFromQuery(result: MapayQueryResult, expectedOutTradeNo: string) {
  if (
    Number(result.code) !== 1 ||
    Number(result.status) !== 1 ||
    result.out_trade_no !== expectedOutTradeNo ||
    String(result.pid) !== String(process.env.MAPAY_PID) ||
    !result.money
  ) {
    paymentLogger.warn("ignored query result", {
      reason: "invalid query status or missing fields",
      out_trade_no: result.out_trade_no ?? null,
      code: result.code,
      status: result.status ?? null,
      expected_out_trade_no: expectedOutTradeNo,
      pid_matches: String(result.pid) === String(process.env.MAPAY_PID),
    });
    return false;
  }

  return markOrderPaid(
    result.out_trade_no,
    result.money,
    result.trade_no || null,
    result,
    "query",
  );
}

export async function recordOrderQuery(outTradeNo: string, result: MapayQueryResult) {
  await ensureStoreSchema();
  const tradeNo = result.trade_no || null;
  const updateResult = await getPool().query(
    `
      UPDATE orders
      SET query_response = $2::jsonb,
          query_checked_at = NOW(),
          trade_no = CASE
            WHEN trade_no IS NULL
              AND $3::text IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM orders AS duplicate
                WHERE duplicate.trade_no = $3::text
                  AND duplicate.out_trade_no <> $1
              )
            THEN $3::text
            ELSE trade_no
          END
      WHERE out_trade_no = $1
    `,
    [outTradeNo, JSON.stringify(result), tradeNo],
  );

  queryLogger.info("recorded mapay query response", {
    out_trade_no: outTradeNo,
    trade_no: tradeNo,
    row_count: updateResult.rowCount,
    code: result.code,
    status: result.status ?? null,
  });
}

export type AdminOrderListItem = Pick<
  OrderRecord,
  | "out_trade_no"
  | "product_name"
  | "money"
  | "quantity"
  | "contact"
  | "status"
  | "fulfillment_status"
  | "created_at"
>;

export type AdminOrderSort =
  | "created_desc"
  | "created_asc"
  | "money_desc"
  | "money_asc"
  | "status_asc";

export type AdminOrderListResult = {
  orders: AdminOrderListItem[];
  total: number;
  page: number;
  page_size: number;
  sort: AdminOrderSort;
};

const ADMIN_ORDER_SORT_SQL: Record<AdminOrderSort, string> = {
  created_desc: "created_at DESC, out_trade_no DESC",
  created_asc: "created_at ASC, out_trade_no ASC",
  money_desc: "money DESC, created_at DESC, out_trade_no DESC",
  money_asc: "money ASC, created_at DESC, out_trade_no DESC",
  status_asc: `
    CASE
      WHEN status = 'pending' THEN 0
      WHEN status = 'paid' AND fulfillment_status = 'failed' THEN 1
      WHEN status = 'paid' AND fulfillment_status = 'pending' THEN 2
      WHEN status = 'paid' THEN 3
      WHEN status = 'expired' THEN 4
      WHEN status = 'cancelled' THEN 5
      ELSE 6
    END ASC,
    created_at DESC,
    out_trade_no DESC
  `,
};

function normalizeAdminOrderSort(sort: string): AdminOrderSort {
  return Object.prototype.hasOwnProperty.call(ADMIN_ORDER_SORT_SQL, sort)
    ? (sort as AdminOrderSort)
    : "created_desc";
}

export async function listOrdersForAdmin(
  page = 1,
  status = "",
  q = "",
  sort = "created_desc",
  productId = "",
  fulfillmentStatus = "",
): Promise<AdminOrderListResult> {
  await ensureStoreSchema();

  const pageSize = 20;
  const normalizedPage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const offset = (normalizedPage - 1) * pageSize;
  const keyword = q.trim().slice(0, 120);
  const normalizedProductId = productId.trim().slice(0, 120);
  const normalizedFulfillmentStatus = fulfillmentStatus.trim();
  const normalizedSort = normalizeAdminOrderSort(sort);
  const orderBy = ADMIN_ORDER_SORT_SQL[normalizedSort];

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }

  if (normalizedProductId) {
    conditions.push(`product_id = $${idx++}`);
    params.push(normalizedProductId);
  }

  if (normalizedFulfillmentStatus) {
    conditions.push(`fulfillment_status = $${idx++}`);
    params.push(normalizedFulfillmentStatus);
  }

  if (keyword) {
    conditions.push(`(
      out_trade_no ILIKE $${idx}
      OR COALESCE(trade_no, '') ILIKE $${idx}
      OR contact ILIKE $${idx}
      OR product_name ILIKE $${idx}
    )`);
    params.push(`%${keyword}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countResult, rowsResult] = await Promise.all([
    getPool().query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM orders ${where}`,
      params,
    ),
    getPool().query<AdminOrderListItem>(
      `SELECT
        out_trade_no,
        product_name,
        money,
        quantity,
        contact,
        status,
        fulfillment_status,
        created_at
       FROM orders
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset],
    ),
  ]);

  return {
    orders: rowsResult.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
    page: normalizedPage,
    page_size: pageSize,
    sort: normalizedSort,
  };
}

export type AdminOrderDetail = Pick<
  OrderRecord,
  | "out_trade_no"
  | "contact"
  | "pay_type"
  | "status"
  | "fulfillment_status"
  | "trade_no"
  | "created_at"
  | "paid_at"
  | "fulfilled_at"
> & {
  delivery_secrets: string[];
};

type AdminOrderDetailRow = Omit<AdminOrderDetail, "delivery_secrets">;

export async function getOrderDetailForAdmin(outTradeNo: string): Promise<AdminOrderDetail | null> {
  await ensureStoreSchema();

  const result = await getPool().query<AdminOrderDetailRow>(
    `SELECT
      out_trade_no,
      contact,
      pay_type,
      status,
      fulfillment_status,
      trade_no,
      created_at,
      paid_at,
      fulfilled_at
     FROM orders
     WHERE out_trade_no = $1`,
    [outTradeNo],
  );

  const order = result.rows[0];
  if (!order) return null;

  const delivery_secrets =
    order.fulfillment_status === "delivered" ? await getDeliverySecrets(outTradeNo) : [];

  return { ...order, delivery_secrets };
}

