import { NextResponse } from "next/server";
import { listOrdersByQueryAuth } from "@/lib/orders";
import { checkRateLimits, getClientRateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) {
    return NextResponse.json({ message: "参数错误" }, { status: 400 });
  }
  const email = String(payload.email ?? "").trim().toLowerCase();
  const queryPassword = String(payload.query_password ?? "");

  if (!email || email.length > 120 || !queryPassword || queryPassword.length > 64) {
    return NextResponse.json({ message: "参数错误" }, { status: 400 });
  }

  const rateLimit = await checkRateLimits([
    {
      scope: "orders-query:client",
      identifier: getClientRateLimitKey(request),
      limit: 20,
      windowSeconds: 600,
    },
    {
      scope: "orders-query:email",
      identifier: email,
      limit: 8,
      windowSeconds: 600,
    },
  ]);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: rateLimit.unavailable ? "安全服务暂不可用" : "查询过于频繁" },
      {
        status: rateLimit.unavailable ? 503 : 429,
        headers: { "Retry-After": String(rateLimit.retryAfter) },
      },
    );
  }

  const orders = await listOrdersByQueryAuth(email, queryPassword);

  return NextResponse.json({
    orders: orders.map((o) => ({
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
  }, { headers: { "Cache-Control": "no-store" } });
}
