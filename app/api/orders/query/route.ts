import { NextResponse } from "next/server";
import {
  createOrderQueryGrant,
  listOrdersByQueryAuth,
  listOrdersByQueryGrant,
} from "@/lib/orders";
import { checkRateLimits, getClientRateLimitKey } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
const logger = createLogger("orders:query-api");

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) {
    return NextResponse.json({ message: "参数错误" }, { status: 400 });
  }
  const email = String(payload.email ?? "").trim().toLowerCase();
  const queryPassword = String(payload.query_password ?? "");
  const queryGrant = String(payload.query_grant ?? "");
  const requestedPage = Number(payload.page ?? 1);
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.min(10_000, Math.trunc(requestedPage)))
    : 1;

  if (!queryGrant && (
    !email
    || email.length > 120
    || queryPassword.length < 8
    || queryPassword.length > 64
  )) {
    return NextResponse.json({ message: "参数错误" }, { status: 400 });
  }

  const clientKey = getClientRateLimitKey(request);
  const rateLimit = await checkRateLimits(queryGrant
    ? [
        {
          scope: "orders-query:grant-client",
          identifier: clientKey,
          limit: 60,
          windowSeconds: 600,
        },
        {
          scope: "orders-query:grant",
          identifier: queryGrant,
          limit: 60,
          windowSeconds: 600,
        },
      ]
    : [
        {
          scope: "orders-query:client",
          identifier: clientKey,
          limit: 30,
          windowSeconds: 600,
        },
        {
          scope: "orders-query:email-attempt",
          identifier: email,
          limit: 12,
          windowSeconds: 600,
        },
      ]);
  if (!rateLimit.allowed) {
    logger.warn("client rate limited", { retry_after: rateLimit.retryAfter });
    return NextResponse.json(
      { message: rateLimit.unavailable ? "安全服务暂不可用" : "查询过于频繁" },
      {
        status: rateLimit.unavailable ? 503 : 429,
        headers: { "Retry-After": String(rateLimit.retryAfter) },
      },
    );
  }

  const result = queryGrant
    ? await listOrdersByQueryGrant(queryGrant, page)
    : await listOrdersByQueryAuth(email, queryPassword, page);

  if (!result) {
    return NextResponse.json(
      { message: "查询凭据已过期，请重新输入查单密码" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (!queryGrant && result.total === 0) {
    const failedAttemptLimit = await checkRateLimits([{
      scope: "orders-query:email-failed",
      identifier: email,
      limit: 8,
      windowSeconds: 600,
    }]);
    if (!failedAttemptLimit.allowed) {
      logger.warn("failed query rate limited", { retry_after: failedAttemptLimit.retryAfter });
      return NextResponse.json(
        { message: failedAttemptLimit.unavailable ? "安全服务暂不可用" : "查询失败次数过多，请稍后再试" },
        {
          status: failedAttemptLimit.unavailable ? 503 : 429,
          headers: { "Retry-After": String(failedAttemptLimit.retryAfter) },
        },
      );
    }
  }

  logger.info("completed", {
    order_count: result.orders.length,
    page: result.page,
    total: result.total,
  });

  return NextResponse.json({
    orders: result.orders.map((o) => ({
      out_trade_no: o.out_trade_no,
      product_name: o.product_name,
      money: Number(o.money).toFixed(2),
      quantity: o.quantity,
      status: o.status,
      fulfillment_status: o.fulfillment_status,
      delivery_content: o.delivery_content,
      created_at: o.created_at,
      paid_at: o.paid_at,
    })),
    total: result.total,
    page: result.page,
    page_size: result.page_size,
    query_grant: result.total > 0
      ? queryGrant || createOrderQueryGrant(email, queryPassword)
      : undefined,
    legacy_scan_pending: result.legacy_scan_pending,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
