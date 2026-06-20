import crypto from "crypto";
import type { PoolClient } from "pg";
import { getDeliverySecrets } from "@/lib/card-secrets";
import { getPool } from "@/lib/db";
import type { MapayPayload, MapayQueryResult } from "@/lib/mapay";
import type { ProductRecord } from "@/lib/products";
import { expireOrderIfNeeded } from "@/lib/order-expiration";
import { ensureStoreSchema } from "@/lib/store-schema";

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
};

export type CreatedOrder = {
  order: OrderRecord;
  access_token: string;
};

export type OrderView = OrderRecord & {
  delivery_content: string[];
};

function hashQueryPassword(password: string): string | null {
  if (!password) return null;
  return crypto.createHash("sha256").update(password).digest("hex");
}

function createOutTradeNo() {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `MZF${timestamp}${crypto.randomInt(100000, 999999)}`;
}

function hashAccessToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function tokenMatches(storedHash: string | null, token: string) {
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
          query_password_hash
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          NOW() + ($10 * INTERVAL '1 minute'),
          $11
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

    // 下单成功后，立即往队列投一个延迟过期任务（到期自动取消 + 释放卡密）
    try {
      const { orderExpireQueue } = await import("@/lib/queue");
      const delayMs = expiresMinutes * 60 * 1000;
      await orderExpireQueue.add(
        "expire",
        { out_trade_no: outTradeNo },
        {
          delay: delayMs,
          jobId: `expire:${outTradeNo}`, // 防止重复投递
        },
      );
    } catch (queueErr) {
      // 队列投递失败不影响下单，依靠懒过期兜底
      console.error("[queue] 投递过期任务失败，将依赖懒过期兜底", queueErr);
    }

    return { order: createdOrder, access_token: accessToken };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getOrderByOutTradeNo(outTradeNo: string) {
  await ensureStoreSchema();
  await expireOrderIfNeeded(outTradeNo);
  const result = await getPool().query<OrderRecord>(
    "SELECT * FROM orders WHERE out_trade_no = $1",
    [outTradeNo],
  );
  return result.rows[0] ?? null;
}

export async function getOrderWithAccess(outTradeNo: string, accessToken: string) {
  const order = await getOrderByOutTradeNo(outTradeNo);
  return order && tokenMatches(order.status_token_hash, accessToken) ? order : null;
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

export async function getOrderViewByEmail(outTradeNo: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!outTradeNo || !normalizedEmail) return null;

  const result = await getPool().query<OrderRecord>(
    "SELECT * FROM orders WHERE out_trade_no = $1",
    [outTradeNo],
  );
  const order = result.rows[0];
  if (!order) return null;

  // 用邮箱与下单时的 contact 做大小写不敏感匹配
  if (order.contact.trim().toLowerCase() !== normalizedEmail) return null;

  await expireOrderIfNeeded(outTradeNo);
  const refreshed = await getPool().query<OrderRecord>(
    "SELECT * FROM orders WHERE out_trade_no = $1",
    [outTradeNo],
  );
  const refreshedOrder = refreshed.rows[0] ?? order;

  const deliveryContent =
    refreshedOrder.status === "paid" ? await getDeliverySecrets(outTradeNo) : [];
  return {
    ...refreshedOrder,
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

  const inputHash = crypto.createHash("sha256").update(queryPassword).digest("hex");
  if (!order.query_password_hash || order.query_password_hash !== inputHash) return null;

  await expireOrderIfNeeded(outTradeNo);

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

  const inputHash = crypto.createHash("sha256").update(queryPassword).digest("hex");

  const result = await getPool().query<OrderRecord>(
    `SELECT * FROM orders
     WHERE LOWER(contact) = $1 AND query_password_hash = $2
     ORDER BY created_at DESC
     LIMIT 20`,
    [normalizedEmail, inputHash],
  );

  const views: OrderView[] = [];
  for (const order of result.rows) {
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
    } else if (source === "query") {
      await client.query(
        `
          UPDATE orders
          SET query_response = $2::jsonb, query_checked_at = NOW()
          WHERE out_trade_no = $1
        `,
        [outTradeNo, JSON.stringify(rawPayload)],
      );
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

export async function markOrderFromPayment(payload: MapayPayload) {
  if (
    payload.trade_status !== "TRADE_SUCCESS" ||
    !payload.out_trade_no ||
    !payload.money
  ) {
    return false;
  }

  return markOrderPaid(
    payload.out_trade_no,
    payload.money,
    payload.trade_no || null,
    payload,
    "notify",
  );
}

export async function markOrderFromQuery(result: MapayQueryResult) {
  if (
    Number(result.code) !== 1 ||
    Number(result.status) !== 1 ||
    !result.out_trade_no ||
    !result.money
  ) {
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
  await getPool().query(
    `
      UPDATE orders
      SET query_response = $2::jsonb, query_checked_at = NOW()
      WHERE out_trade_no = $1
    `,
    [outTradeNo, JSON.stringify(result)],
  );
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
  await expireOrderIfNeeded(outTradeNo);

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

