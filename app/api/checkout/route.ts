import { NextResponse } from "next/server";
import { buildMapaySubmitUrl } from "@/lib/mapay";
import { createOrder } from "@/lib/orders";
import { scheduleOrderExpiration } from "@/lib/order-expiration-scheduler";
import { getProductById } from "@/lib/products";
import { getRequestOrigin } from "@/lib/request-utils";
import { createLogger } from "@/lib/logger";
import { getOrderAccessCookieName, orderAccessCookieOptions } from "@/lib/order-access";
import { checkRateLimits, getClientRateLimitKey } from "@/lib/rate-limit";

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
    const normalizedContact = contact.trim().toLowerCase();
    const rateLimit = await checkRateLimits([
      {
        scope: "checkout:client",
        identifier: getClientRateLimitKey(request),
        limit: 20,
        windowSeconds: 600,
      },
      {
        scope: "checkout:contact-product",
        identifier: `${normalizedContact}:${productId}`,
        limit: 5,
        windowSeconds: 600,
      },
    ]);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { message: rateLimit.unavailable ? "安全服务暂不可用，请稍后重试" : "操作过于频繁，请稍后重试" },
        {
          status: rateLimit.unavailable ? 503 : 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        },
      );
    }

    const product = await getProductById(productId);

    if (
      !product ||
      !PAY_TYPES.has(payType) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedContact)
    ) {
      return NextResponse.json({ message: "参数错误" }, { status: 400 });
    }

    const created = await createOrder(product, payType, quantity, normalizedContact, queryPassword);
    await scheduleOrderExpiration(created.order);

    const origin = getRequestOrigin();

    const payOptions = {
      order: created.order,
      pay_type: payType,
      request_origin: origin,
      access_token: created.access_token,
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
      payUrl = `${origin}/pay/${encodeURIComponent(created.order.out_trade_no)}`;
    }

    const responsePayload = {
      pay_url: payUrl,
      pay_type: payType,
      out_trade_no: created.order.out_trade_no,
      trade_no: null,
    };

    logger.info("response", {
      out_trade_no: created.order.out_trade_no,
      pay_type: payType,
    });

    const response = NextResponse.json(responsePayload);
    response.cookies.set(
      getOrderAccessCookieName(created.order.out_trade_no),
      created.access_token,
      orderAccessCookieOptions,
    );
    return response;
  } catch (error) {
    logger.error("failed", { error });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "下单失败，请稍后重试" },
      { status: 500 },
    );
  }
}
