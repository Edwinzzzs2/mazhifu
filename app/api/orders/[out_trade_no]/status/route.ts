import { NextResponse } from "next/server";
import { MAPAY_QUERY_TIMEOUT_MS, isAbortError, queryMapayOrder } from "@/lib/mapay";
import {
  getOrderViewByQueryAuth,
  getOrderViewInternal,
  getOrderViewWithAccess,
  markOrderFromQuery,
  recordOrderQuery,
  retryOrderFulfillment,
} from "@/lib/orders";

type StatusRouteContext = {
  params: {
    out_trade_no: string;
  };
};

function formatOrderResponse(order: NonNullable<Awaited<ReturnType<typeof getOrderViewInternal>>>) {
  return {
    out_trade_no: order.out_trade_no,
    product_name: order.product_name,
    money: Number(order.money).toFixed(2),
    quantity: order.quantity,
    pay_type: order.pay_type,
    status: order.status,
    fulfillment_status: order.fulfillment_status,
    trade_no: order.status === "paid" ? order.trade_no : null,
    delivery_content: order.delivery_content,
    created_at: order.created_at,
    expires_at: order.expires_at,
    paid_at: order.paid_at,
    fulfilled_at: order.fulfilled_at,
  };
}

export async function GET(request: Request, { params }: StatusRouteContext) {
  const url = new URL(request.url);
  const accessToken = url.searchParams.get("token") ?? "";
  const contactinfo = url.searchParams.get("contactinfo") ?? "";
  const queryPassword = url.searchParams.get("queryPassword") ?? "";

  let order = accessToken
    ? await getOrderViewWithAccess(params.out_trade_no, accessToken)
    : contactinfo && queryPassword
      ? await getOrderViewByQueryAuth(params.out_trade_no, contactinfo, queryPassword)
      : null;

  if (!order) {
    return NextResponse.json({ message: "order_not_found" }, { status: 404 });
  }

  // 非 pending 状态不需要回查码支付
  if (order.status !== "pending") {
    // 已支付但未发货时尝试发货
    if (order.status === "paid" && order.fulfillment_status !== "delivered") {
      try {
        await retryOrderFulfillment(order.out_trade_no);
        order = (await getOrderViewInternal(params.out_trade_no)) ?? order;
      } catch (error) {
        console.error("Order fulfillment retry failed", error);
      }
    }
    return NextResponse.json(formatOrderResponse(order));
  }

  // pending 状态 — 先检查冷却时间，避免频繁请求码支付
  const lastCheckedAt = order.query_checked_at ? new Date(order.query_checked_at).getTime() : 0;
  const canReconcile = Date.now() - lastCheckedAt >= 5_000;

  if (!canReconcile) {
    // 冷却期内直接返回当前状态，不调码支付
    return NextResponse.json(formatOrderResponse(order));
  }

  // 异步回查码支付，超时由 queryMapayOrder 控制，避免整个请求卡太久。
  try {
    const result = await queryMapayOrder(order.out_trade_no);

    await recordOrderQuery(order.out_trade_no, result);

    if (
      result.out_trade_no === order.out_trade_no &&
      String(result.pid) === String(process.env.MAPAY_PID) &&
      Number(result.status) === 1
    ) {
      await markOrderFromQuery(result);
      // 标记支付后立即尝试发货
      try {
        await retryOrderFulfillment(order.out_trade_no);
      } catch (err) {
        console.error("Fulfillment after reconciliation failed", err);
      }
    }

    order = (await getOrderViewInternal(params.out_trade_no)) ?? order;
  } catch (error) {
    // 码支付查询失败/超时 — 不影响返回，先返回数据库中的当前状态
    if (isAbortError(error)) {
      console.warn("Mapay reconciliation timed out; returning cached order status", {
        out_trade_no: order.out_trade_no,
        timeout_ms: MAPAY_QUERY_TIMEOUT_MS,
      });
    } else {
      console.error("Mapay reconciliation failed (returning cached status)", error);
    }
  }

  return NextResponse.json(formatOrderResponse(order));
}
