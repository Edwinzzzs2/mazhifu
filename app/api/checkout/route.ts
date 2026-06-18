import { NextResponse } from "next/server";
import { createOrder } from "@/lib/orders";
import { getProductById } from "@/lib/products";

const PAY_TYPES = new Set(["alipay", "wxpay"]);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const productId = String(formData.get("product_id") ?? "");
    const payType = String(formData.get("pay_type") ?? "alipay");
    const quantity = Number(formData.get("quantity") ?? 1);
    const contact = String(formData.get("contact") ?? "");
    const product = await getProductById(productId);

    if (
      !product ||
      !PAY_TYPES.has(payType) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10
    ) {
      return NextResponse.redirect(new URL("/", request.url), { status: 303 });
    }

    const created = await createOrder(product, payType, quantity, contact);
    const checkoutUrl = new URL(
      `/pay/${encodeURIComponent(created.order.out_trade_no)}`,
      request.url,
    );
    checkoutUrl.searchParams.set("token", created.access_token);

    return NextResponse.redirect(checkoutUrl, { status: 303 });
  } catch (error) {
    console.error("checkout failed", error);
    return NextResponse.redirect(new URL("/?checkout=failed", request.url), { status: 303 });
  }
}
