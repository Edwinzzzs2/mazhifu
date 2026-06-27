import { NextResponse } from "next/server";
import { parseMapayPayload, readMapayRequestSnapshot } from "@/lib/mapay";
import { getRequestOrigin } from "@/lib/request-utils";
import { createLogger } from "@/lib/logger";

const logger = createLogger("mapay:return");

export async function GET(request: Request) {
  const requestSnapshot = await readMapayRequestSnapshot(request);
  const payload = await parseMapayPayload(request);
  logger.info("callback received", {
    ...requestSnapshot,
    payload,
  });

  const outTradeNo = payload.out_trade_no;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const origin = getRequestOrigin();
  
  const redirectUrl = new URL(
    outTradeNo ? `/orders/${encodeURIComponent(outTradeNo)}` : "/",
    origin,
  );

  if (token) {
    redirectUrl.searchParams.set("token", token);
  }

  // 同步跳转可能被用户伪造，订单状态只由异步验签通知或服务端主动查询更新。
  logger.info("response", {
    status: 303,
    out_trade_no: outTradeNo || null,
    redirect_url: redirectUrl.toString(),
    payload,
  });

  return NextResponse.redirect(redirectUrl, { status: 303 });
}

export async function POST(request: Request) {
  return GET(request);
}
