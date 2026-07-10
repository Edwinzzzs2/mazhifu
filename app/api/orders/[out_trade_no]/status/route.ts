import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import {
  getOrderViewByQueryAuth,
  getOrderViewInternal,
  getOrderViewWithSession,
  retryOrderFulfillment,
} from "@/lib/orders";
import { getOrderSessionTokenFromRequest } from "@/lib/order-access";
import { checkRateLimits, getClientRateLimitKey } from "@/lib/rate-limit";

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
async function getStatusResponse(
  request: Request,
  params: StatusRouteContext["params"],
  queryAuth?: { email: string; password: string },
) {
  const clientKey = getClientRateLimitKey(request);
  const rules = [{
    scope: "order-status:client",
    identifier: clientKey,
    limit: queryAuth ? 30 : 120,
    windowSeconds: 60,
  }];
  if (queryAuth) {
    rules.push({
      scope: "order-status:query-auth",
      identifier: `${params.out_trade_no}:${queryAuth.email.toLowerCase()}`,
      limit: 8,
      windowSeconds: 600,
    });
  }
  const rateLimit = await checkRateLimits(rules);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: rateLimit.unavailable ? "security_service_unavailable" : "too_many_requests" },
      {
        status: rateLimit.unavailable ? 503 : 429,
        headers: { "Retry-After": String(rateLimit.retryAfter) },
      },
    );
  }

  const sessionToken = queryAuth
    ? ""
    : getOrderSessionTokenFromRequest(request);
  let order = queryAuth
    ? await getOrderViewByQueryAuth(params.out_trade_no, queryAuth.email, queryAuth.password)
    : await getOrderViewWithSession(params.out_trade_no, sessionToken);

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

  return NextResponse.json(formatOrderResponse(order), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request, { params }: StatusRouteContext) {
  return getStatusResponse(request, params);
}

export async function POST(request: Request, { params }: StatusRouteContext) {
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) {
    return NextResponse.json({ message: "invalid_query_auth" }, { status: 400 });
  }
  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.query_password ?? "");
  if (!email || email.length > 120 || !password || password.length > 64) {
    return NextResponse.json({ message: "invalid_query_auth" }, { status: 400 });
  }
  return getStatusResponse(request, params, { email, password });
}
