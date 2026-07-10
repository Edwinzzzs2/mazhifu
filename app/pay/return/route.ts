import { NextResponse } from "next/server";
import { parseMapayPayload, verifyMapayPayload } from "@/lib/mapay";
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
  const callbackSignatureValid = verifyMapayPayload(payload);
  const accessState = callbackSignatureValid ? payload.param ?? "" : "";
  const accessibleOrder = outTradeNo && accessState
    ? await getOrderWithAccess(outTradeNo, accessState)
    : null;
  const validState = Boolean(accessibleOrder);
  const origin = getRequestOrigin();
  
  const redirectUrl = new URL(
    outTradeNo ? `/orders/${encodeURIComponent(outTradeNo)}` : "/",
    origin,
  );

  // 同步跳转可能被用户伪造，订单状态只由异步验签通知或服务端主动查询更新。
  logger.info("response", {
    status: 303,
    out_trade_no: outTradeNo || null,
    callback_signature_valid: callbackSignatureValid,
    access_source: accessibleOrder ? "param" : null,
    access_restored: validState,
    redirect_url: redirectUrl.toString(),
  });

  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  if (outTradeNo && validState) {
    response.cookies.set(
      getOrderAccessCookieName(outTradeNo),
      accessState,
      orderAccessCookieOptions,
    );
  }
  return response;
}

export async function POST(request: Request) {
  return GET(request);
}
