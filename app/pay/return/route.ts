import { NextResponse } from "next/server";
import { markOrderFromPayment } from "@/lib/orders";
import { parseMapayPayload, verifyMapayPayload } from "@/lib/mapay";

export async function GET(request: Request) {
  const payload = await parseMapayPayload(request);
  const outTradeNo = payload.out_trade_no;
  const redirectUrl = new URL(
    outTradeNo ? `/orders/${encodeURIComponent(outTradeNo)}` : "/",
    request.url,
  );

  if (outTradeNo && verifyMapayPayload(payload)) {
    await markOrderFromPayment(payload);
    redirectUrl.searchParams.set("checked", "1");
  }

  return NextResponse.redirect(redirectUrl, { status: 303 });
}

export async function POST(request: Request) {
  return GET(request);
}
