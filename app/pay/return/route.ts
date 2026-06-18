import { NextResponse } from "next/server";
import { parseMapayPayload } from "@/lib/mapay";

export async function GET(request: Request) {
  const payload = await parseMapayPayload(request);
  const outTradeNo = payload.out_trade_no;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const redirectUrl = new URL(
    outTradeNo ? `/orders/${encodeURIComponent(outTradeNo)}` : "/",
    request.url,
  );

  if (token) {
    redirectUrl.searchParams.set("token", token);
  }

  // 同步跳转可能被用户伪造，订单状态只由异步验签通知或服务端主动查询更新。
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

export async function POST(request: Request) {
  return GET(request);
}
