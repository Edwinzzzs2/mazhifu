import { NextResponse } from "next/server";
import { listOrdersByQueryAuth } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email") ?? "";
  const queryPassword = url.searchParams.get("query_password") ?? "";

  if (!email.trim() || !queryPassword.trim()) {
    return NextResponse.json({ message: "参数错误" }, { status: 400 });
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
  });
}
