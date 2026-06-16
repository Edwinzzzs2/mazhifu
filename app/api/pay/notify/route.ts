import { NextResponse } from "next/server";
import { markOrderFromPayment } from "@/lib/orders";
import { parseMapayPayload, verifyMapayPayload } from "@/lib/mapay";

async function handleNotify(request: Request) {
  const payload = await parseMapayPayload(request);

  if (!verifyMapayPayload(payload)) {
    return new NextResponse("fail", { status: 400 });
  }

  const updated = await markOrderFromPayment(payload);
  return new NextResponse(updated ? "success" : "fail", {
    status: updated ? 200 : 400,
  });
}

export async function GET(request: Request) {
  return handleNotify(request);
}

export async function POST(request: Request) {
  return handleNotify(request);
}
