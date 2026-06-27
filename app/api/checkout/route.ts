import { NextResponse } from "next/server";
import { buildMapaySubmitUrl } from "@/lib/mapay";
import { createOrder } from "@/lib/orders";
import { getProductById } from "@/lib/products";
import { getRequestOrigin } from "@/lib/request-utils";
import { createLogger } from "@/lib/logger";

const PAY_TYPES = new Set(["alipay", "wxpay"]);
const logger = createLogger("checkout");

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

    // 前台用户支付走 Submit 网关页，避免直接打开 MAPI 返回的 qrcode/urlscheme/第三方渲染页。
    let payUrl: string;
    try {
      payUrl = buildMapaySubmitUrl(payOptions);
    } catch (error) {
      logger.warn("build mapay submit url failed; fallback to local pay page", {
        out_trade_no: created.order.out_trade_no,
        error,
      });
      payUrl = `${origin}/pay/${encodeURIComponent(created.order.out_trade_no)}?token=${encodeURIComponent(accessToken)}`;
    }

    const responsePayload = {
      pay_url: payUrl,
      pay_type: payType,
      out_trade_no: created.order.out_trade_no,
      access_token: accessToken,
      trade_no: null,
    };

    logger.info("response", responsePayload);

    return NextResponse.json(responsePayload);
  } catch (error) {
    logger.error("failed", { error });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "下单失败，请稍后重试" },
      { status: 500 },
    );
  }
}
