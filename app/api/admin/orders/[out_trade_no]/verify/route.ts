import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getPool } from "@/lib/db";
import { ensureStoreSchema } from "@/lib/store-schema";
import { queryMapayOrder, isAbortError } from "@/lib/mapay";
import { markOrderFromQuery, recordOrderQuery } from "@/lib/orders";
import { retryOrderFulfillment } from "@/lib/orders";
import { expireSingleOrder } from "@/lib/order-expiration";
import { createLogger } from "@/lib/logger";
import type { OrderRecord } from "@/lib/orders";

const logger = createLogger("admin:verify");

async function adminAllowed() {
  try {
    return await isAdminAuthenticated();
  } catch {
    return false;
  }
}

/**
 * POST /api/admin/orders/[out_trade_no]/verify
 * 手动核实：调用码支付 API 查询订单真实支付状态，并根据结果更新本地订单。
 */
export async function POST(
  _request: Request,
  { params }: { params: { out_trade_no: string } },
) {
  if (!(await adminAllowed())) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const { out_trade_no } = params;
  await ensureStoreSchema();

  // 1. 查询本地订单
  const orderResult = await getPool().query<OrderRecord>(
    "SELECT * FROM orders WHERE out_trade_no = $1",
    [out_trade_no],
  );
  const order = orderResult.rows[0];
  if (!order) {
    return NextResponse.json({ message: "订单不存在" }, { status: 404 });
  }

  // 2. 调用码支付 API 查询
  let queryResult;
  try {
    queryResult = await queryMapayOrder(out_trade_no);
  } catch (err) {
    const message = isAbortError(err) ? "码支付查询超时" : "码支付查询失败";
    logger.error(message, { error: err });
    return NextResponse.json({ message, error: String(err) }, { status: 502 });
  }

  // 3. 保存查询响应，并在本地订单还没有平台流水号时补绑定。
  const tradeNo = queryResult.trade_no || null;
  await recordOrderQuery(out_trade_no, queryResult);
  logger.info("mapay query result recorded", {
    out_trade_no,
    trade_no: tradeNo,
    query_result: queryResult,
  });

  // 4. 判断支付状态
  const isPaid = Number(queryResult.code) === 1 && Number(queryResult.status) === 1;
  const ttlMinutes = Number(process.env.ORDER_TTL_MINUTES ?? 15);
  const orderAgeMs = Date.now() - new Date(order.created_at).getTime();
  const isExpired = orderAgeMs > ttlMinutes * 60 * 1000;

  let action: string;
  let newStatus: string = order.status;

  if (isPaid) {
    // 查询到已支付 → 标记支付并尝试发货
    if (order.status !== "paid") {
      await markOrderFromQuery(queryResult);
    }
    // 补发货
    try {
      await retryOrderFulfillment(out_trade_no);
    } catch (err) {
      logger.error("fulfill failed", { error: err });
    }
    action = "marked_paid";
    newStatus = "paid";
  } else if (isExpired && order.status === "pending") {
    // 超过 TTL 且未支付 → 标记过期
    await expireSingleOrder(out_trade_no);
    action = "marked_expired";
    newStatus = "expired";
  } else {
    // 在有效期内且未支付 → 保持不变
    action = "no_change";
  }

  // 5. 查询更新后的订单返回
  const updatedResult = await getPool().query<OrderRecord>(
    "SELECT * FROM orders WHERE out_trade_no = $1",
    [out_trade_no],
  );

  const responsePayload = {
    action,
    new_status: newStatus,
    trade_no: tradeNo,
    query_result: queryResult,
    order: updatedResult.rows[0],
  };

  logger.info("response", responsePayload);

  return NextResponse.json(responsePayload);
}
