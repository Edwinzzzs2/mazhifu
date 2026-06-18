import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { buildMapaySubmitUrl } from "@/lib/mapay";
import { createOrder } from "@/lib/orders";
import { getProductById } from "@/lib/products";

const PAY_TYPES = new Set(["alipay", "wxpay"]);

function getRequestOrigin() {
  const headerList = headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return protocol + "://" + host;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const productId = String(formData.get("product_id") ?? "");
    const payType = String(formData.get("pay_type") ?? "alipay");
    const quantity = Number(formData.get("quantity") ?? 1);
    const contact = String(formData.get("contact") ?? "");
    const queryPassword = String(formData.get("query_password") ?? "");
    const product = await getProductById(productId);

    if (
      !product ||
      !PAY_TYPES.has(payType) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10
    ) {
      return NextResponse.json({ message: "参数错误" }, { status: 400 });
    }

    const created = await createOrder(product, payType, quantity, contact, queryPassword);
    const accessToken = created.access_token;
    const origin = getRequestOrigin();

    let payUrl = "";
    try {
      payUrl = buildMapaySubmitUrl({
        order: created.order,
        pay_type: payType,
        request_origin: origin,
        access_token: accessToken,
      });
    } catch {
      payUrl = `${origin}/pay/${encodeURIComponent(created.order.out_trade_no)}?token=${encodeURIComponent(accessToken)}`;
    }

    return NextResponse.json({
      pay_url: payUrl,
      pay_type: payType,
      out_trade_no: created.order.out_trade_no,
      access_token: accessToken,
    });
  } catch (error) {
    console.error("checkout failed", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "下单失败，请稍后重试" },
      { status: 500 },
    );
  }
}
