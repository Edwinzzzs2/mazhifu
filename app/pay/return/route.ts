import { NextResponse } from "next/server";
import { parseMapayPayload, verifyMapayPayload } from "@/lib/mapay";
import { getRequestOrigin } from "@/lib/request-utils";
import { createLogger } from "@/lib/logger";
import {
  createOrderSessionToken,
  getLegacyOrderCookieNames,
  getOrderSessionCookieName,
  getOrderSessionTokenFromRequest,
  orderSessionCookieOptions,
} from "@/lib/order-access";
import { grantOrderSessionAccess, getOrderWithReturnToken } from "@/lib/orders";

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
  const returnToken = callbackSignatureValid ? payload.param ?? "" : "";
  const accessibleOrder = outTradeNo && returnToken
    ? await getOrderWithReturnToken(outTradeNo, returnToken)
    : null;
  const sessionToken = getOrderSessionTokenFromRequest(request) || createOrderSessionToken();
  const validState = Boolean(
    accessibleOrder
    && outTradeNo
    && await grantOrderSessionAccess(outTradeNo, sessionToken)
  );
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
      getOrderSessionCookieName(),
      sessionToken,
      orderSessionCookieOptions,
    );
  }
  for (const cookieName of new Set(getLegacyOrderCookieNames(request))) {
    response.cookies.set(cookieName, "", { ...orderSessionCookieOptions, maxAge: 0 });
  }
  return response;
}

export async function POST(request: Request) {
  return GET(request);
}
