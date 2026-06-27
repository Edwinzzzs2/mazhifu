import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import {
  getOrderViewByQueryAuth,
  getOrderViewInternal,
  getOrderViewWithAccess,
  retryOrderFulfillment,
} from "@/lib/orders";

const logger = createLogger("orders:status");

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

/**
 * 订单状态查询接口 — 纯读取 DB 状态。
 *
 * 状态变更由以下两个机制驱动：
 * 1. 码支付回调 /api/pay/notify（主路径）
 * 2. Redis worker 定时对账（兜底）
 *
 * 本接口不主动调用码支付 API，避免不必要的外部请求。
 */
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

  // 已支付但未发货时尝试发货
  if (order.status === "paid" && order.fulfillment_status !== "delivered") {
    try {
      await retryOrderFulfillment(order.out_trade_no);
      order = (await getOrderViewInternal(params.out_trade_no)) ?? order;
    } catch (error) {
      logger.error("fulfillment retry failed", {
        error,
        out_trade_no: order.out_trade_no,
      });
    }
  }

  return NextResponse.json(formatOrderResponse(order));
}
