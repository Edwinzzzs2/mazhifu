import { NextResponse } from "next/server";
import { createOrder } from "@/lib/orders";
import { findProductById } from "@/lib/products";

const PAY_TYPES = new Set(["alipay", "wxpay"]);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const productId = String(formData.get("product_id") ?? "");
    const payType = String(formData.get("pay_type") ?? "alipay");
    const product = findProductById(productId);

    if (!product || !PAY_TYPES.has(payType)) {
      return NextResponse.redirect(new URL("/", request.url), { status: 303 });
    }

    const order = await createOrder(product, payType);
    const checkoutUrl = new URL(`/pay/${encodeURIComponent(order.out_trade_no)}`, request.url);

    return NextResponse.redirect(checkoutUrl, { status: 303 });
  } catch (error) {
    console.error("checkout failed", error);
    return NextResponse.redirect(new URL("/?checkout=failed", request.url), { status: 303 });
  }
}
