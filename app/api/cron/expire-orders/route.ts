import { NextResponse } from "next/server";
import { expirePendingOrders } from "@/lib/order-expiration";

export const dynamic = "force-dynamic";

function cronAllowed(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!cronAllowed(request)) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const expired_count = await expirePendingOrders(1000);
  return NextResponse.json({ expired_count });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
