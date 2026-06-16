import crypto from "crypto";
import { getPool } from "@/lib/db";
import type { MapayPayload } from "@/lib/mapay";
import type { Product } from "@/lib/products";

export type OrderRecord = {
  out_trade_no: string;
  product_id: string;
  product_name: string;
  money: string;
  pay_type: string;
  status: "pending" | "paid";
  trade_no: string | null;
  raw_notify: unknown | null;
  created_at: string;
  paid_at: string | null;
};

let tableReady = false;

async function ensureOrdersTable() {
  if (tableReady) {
    return;
  }

  // 首次运行自动建表，方便本地直接启动；正式环境可以把这段 SQL 拆成迁移脚本。
  await getPool().query(`
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
  `);

  tableReady = true;
}

function createOutTradeNo() {
  const timestamp = new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);
  const suffix = crypto.randomInt(100000, 999999);
  return `MZF${timestamp}${suffix}`;
}

export async function createOrder(product: Product, payType: string): Promise<OrderRecord> {
  await ensureOrdersTable();

  const outTradeNo = createOutTradeNo();
  const result = await getPool().query<OrderRecord>(
    `
      INSERT INTO orders (out_trade_no, product_id, product_name, money, pay_type)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [outTradeNo, product.id, product.name, product.money, payType],
  );

  return result.rows[0];
}

export async function getOrderByOutTradeNo(outTradeNo: string) {
  await ensureOrdersTable();

  const result = await getPool().query<OrderRecord>(
    "SELECT * FROM orders WHERE out_trade_no = $1",
    [outTradeNo],
  );

  return result.rows[0] ?? null;
}

export async function markOrderFromPayment(payload: MapayPayload) {
  if (payload.trade_status !== "TRADE_SUCCESS" || !payload.out_trade_no) {
    return false;
  }

  await ensureOrdersTable();

  const order = await getOrderByOutTradeNo(payload.out_trade_no);
  if (!order) {
    return false;
  }

  const orderMoney = Number(order.money).toFixed(2);
  const paidMoney = Number(payload.money).toFixed(2);
  if (orderMoney !== paidMoney) {
    return false;
  }

  await getPool().query(
    `
      UPDATE orders
      SET status = 'paid',
          trade_no = $2,
          raw_notify = $3,
          paid_at = COALESCE(paid_at, NOW())
      WHERE out_trade_no = $1
    `,
    [payload.out_trade_no, payload.trade_no ?? null, payload],
  );

  return true;
}
