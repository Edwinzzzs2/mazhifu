import { NextResponse } from "next/server";
import { parseMapayPayload } from "@/lib/mapay";
import { getRequestOrigin } from "@/lib/request-utils";
import { createLogger } from "@/lib/logger";
import {
  getOrderAccessCookieName,
  orderAccessCookieOptions,
} from "@/lib/order-access";
import { getOrderWithAccess } from "@/lib/orders";

const logger = createLogger("mapay:return");

export async function GET(request: Request) {
  const payload = await parseMapayPayload(request);
  logger.info("callback received", {
    method: request.method,
    out_trade_no: payload.out_trade_no ?? null,
    trade_no: payload.trade_no ?? null,
  });

  const outTradeNo = payload.out_trade_no;
  const state = new URL(request.url).searchParams.get("state") ?? "";
  const validState = Boolean(outTradeNo && await getOrderWithAccess(outTradeNo, state));
  const origin = getRequestOrigin();
  
  const redirectUrl = new URL(
    outTradeNo ? `/orders/${encodeURIComponent(outTradeNo)}` : "/",
    origin,
  );

  // 同步跳转可能被用户伪造，订单状态只由异步验签通知或服务端主动查询更新。
  logger.info("response", {
    status: 303,
    out_trade_no: outTradeNo || null,
    access_restored: validState,
    redirect_url: redirectUrl.toString(),
  });

  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  if (outTradeNo && validState) {
    response.cookies.set(
      getOrderAccessCookieName(outTradeNo),
      state,
      orderAccessCookieOptions,
    );
  }
  return response;
}

export async function POST(request: Request) {
  return GET(request);
}
