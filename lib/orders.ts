import crypto from "crypto";
import type { PoolClient } from "pg";
import { getDeliverySecrets } from "@/lib/card-secrets";
import { getPool } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import type { MapayQueryResult } from "@/lib/mapay";
import { verifyOrderAccessGrant } from "@/lib/order-access";
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
  access_token: string;
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

function getQueryPasswordLookup(password: string) {
  return crypto
    .createHmac("sha256", getQueryPasswordPepper())
    .update(password)
    .digest("hex");
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

function verifyQueryPassword(password: string, storedHash: string | null) {
  if (!password || !storedHash) return false;
  if (isLegacyQueryPasswordHash(storedHash)) {
    const legacyHash = crypto.createHash("sha256").update(password).digest("hex");
    return safeEqualText(legacyHash, storedHash);
  }

  const [version, salt, expectedHash] = storedHash.split("$");
  if (version !== "scrypt" || !salt || !expectedHash) return false;
  const actualHash = crypto.scryptSync(password, salt, 64).toString("base64url");
  return safeEqualText(actualHash, expectedHash);
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
      hashQueryPassword(password),
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

function tokenMatches(outTradeNo: string, storedHash: string | null, token: string) {
  if (verifyOrderAccessGrant(outTradeNo, token)) {
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
  queryPassword = "",
): Promise<CreatedOrder> {
  await ensureStoreSchema();

  if (queryPassword.length < 8 || queryPassword.length > 64) {
    throw new Error("query password must be 8-64 characters");
  }

  const safeQuantity = Math.max(1, Math.min(10, Math.trunc(quantity)));
  if (!product.active || product.stock < safeQuantity) {
    throw new Error("product is unavailable");
  }

  const accessToken = crypto.randomBytes(24).toString("base64url");
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
        hashAccessToken(accessToken),
        expiresMinutes,
        hashQueryPassword(queryPassword),
        getQueryPasswordLookup(queryPassword),
      ],
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

    return { order: createdOrder, access_token: accessToken };
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

export async function getOrderWithAccess(outTradeNo: string, accessToken: string) {
  const order = await getOrderByOutTradeNo(outTradeNo);
  return order && tokenMatches(outTradeNo, order.status_token_hash, accessToken) ? order : null;
}

export async function getOrderViewWithAccess(outTradeNo: string, accessToken: string) {
  const order = await getOrderWithAccess(outTradeNo, accessToken);
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
  const normalizedEmail = email.trim().toLowerCase();
  if (!outTradeNo || !normalizedEmail || !queryPassword) return null;

  const result = await getPool().query<OrderRecord>(
    "SELECT * FROM orders WHERE out_trade_no = $1",
    [outTradeNo],
  );
  const order = result.rows[0];
  if (!order) return null;

  if (order.contact.trim().toLowerCase() !== normalizedEmail) return null;

  if (!verifyQueryPassword(queryPassword, order.query_password_hash)) return null;
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

export async function listOrdersByQueryAuth(
  email: string,
  queryPassword: string,
): Promise<OrderView[]> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !queryPassword) return [];

  const lookup = getQueryPasswordLookup(queryPassword);
  const legacyHash = crypto.createHash("sha256").update(queryPassword).digest("hex");

  let result = await getPool().query<OrderRecord>(
    `SELECT * FROM orders
     WHERE LOWER(contact) = $1
       AND (query_password_lookup = $2 OR query_password_hash = $3)
     ORDER BY created_at DESC
     LIMIT 20`,
    [normalizedEmail, lookup, legacyHash],
  );

  // Pepper 轮换或旧数据缺少 lookup 时，用邮箱缩小范围后再校验慢哈希，并在成功后修复索引。
  if (result.rows.length === 0) {
    result = await getPool().query<OrderRecord>(
      `SELECT * FROM orders
       WHERE LOWER(contact) = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [normalizedEmail],
    );
  }

  const views: OrderView[] = [];
  for (const order of result.rows) {
    if (!verifyQueryPassword(queryPassword, order.query_password_hash)) continue;
    await upgradeLegacyQueryPassword(order, queryPassword);
    if (order.query_password_lookup !== lookup) {
      await getPool().query(
        "UPDATE orders SET query_password_lookup = $2 WHERE out_trade_no = $1",
        [order.out_trade_no, lookup],
      );
    }
    const deliveryContent =
      order.status === "paid" ? await getDeliverySecrets(order.out_trade_no) : [];
    views.push({ ...order, delivery_content: deliveryContent } satisfies OrderView);
  }
  return views;
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

export type AdminOrderListItem = OrderRecord;

export type AdminOrderListResult = {
  orders: AdminOrderListItem[];
  total: number;
  page: number;
  page_size: number;
};

export async function listOrdersForAdmin(
  page = 1,
  status = "",
  q = "",
): Promise<AdminOrderListResult> {
  await ensureStoreSchema();

  const pageSize = 20;
  const offset = (Math.max(1, page) - 1) * pageSize;
  const keyword = q.trim().slice(0, 120);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }

  if (keyword) {
    conditions.push(`(out_trade_no ILIKE $${idx} OR contact ILIKE $${idx})`);
    params.push(`%${keyword}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countResult, rowsResult] = await Promise.all([
    getPool().query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM orders ${where}`,
      params,
    ),
    getPool().query<OrderRecord>(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset],
    ),
  ]);

  return {
    orders: rowsResult.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
    page: Math.max(1, page),
    page_size: pageSize,
  };
}

export type AdminOrderDetail = OrderRecord & {
  delivery_secrets: string[];
};

export async function getOrderDetailForAdmin(outTradeNo: string): Promise<AdminOrderDetail | null> {
  await ensureStoreSchema();

  const result = await getPool().query<OrderRecord>(
    "SELECT * FROM orders WHERE out_trade_no = $1",
    [outTradeNo],
  );

  const order = result.rows[0];
  if (!order) return null;

  const delivery_secrets =
    order.fulfillment_status === "delivered" ? await getDeliverySecrets(outTradeNo) : [];

  return { ...order, delivery_secrets };
}

