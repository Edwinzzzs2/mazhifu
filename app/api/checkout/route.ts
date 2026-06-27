import { NextResponse } from "next/server";
import { createMapayPayment, buildMapaySubmitUrl } from "@/lib/mapay";
import { createOrder, updateOrderTradeNo } from "@/lib/orders";
import { getProductById } from "@/lib/products";
import { getRequestOrigin } from "@/lib/request-utils";

const PAY_TYPES = new Set(["alipay", "wxpay"]);

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

    const payOptions = {
      order: created.order,
      pay_type: payType,
      request_origin: origin,
      access_token: accessToken,
    };

    let payUrl = "";
    let tradeNo: string | null = null;

    // 优先使用 MAPI 接口（后端调用，可获取 trade_no）
    try {
      const mapiResult = await createMapayPayment(payOptions);
      tradeNo = mapiResult.trade_no || null;
      payUrl = mapiResult.payurl || mapiResult.qrcode || mapiResult.urlscheme || "";

      // 把 trade_no 存入订单
      if (tradeNo) {
        await updateOrderTradeNo(created.order.out_trade_no, tradeNo);
      }
    } catch (mapiErr) {
      console.warn("[checkout] MAPI 调用失败，降级到 Submit 跳转", mapiErr);
    }

    // MAPI 没拿到 payUrl，降级用 Submit 拼 URL
    if (!payUrl) {
      try {
        payUrl = buildMapaySubmitUrl(payOptions);
      } catch {
        payUrl = `${origin}/pay/${encodeURIComponent(created.order.out_trade_no)}?token=${encodeURIComponent(accessToken)}`;
      }
    }

    return NextResponse.json({
      pay_url: payUrl,
      pay_type: payType,
      out_trade_no: created.order.out_trade_no,
      access_token: accessToken,
      trade_no: tradeNo,
    });
  } catch (error) {
    console.error("checkout failed", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "下单失败，请稍后重试" },
      { status: 500 },
    );
  }
}
