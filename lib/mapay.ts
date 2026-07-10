import crypto from "crypto";
import { createLogger } from "@/lib/logger";
import { createOrderAccessGrant } from "@/lib/order-access";
import type { OrderRecord } from "@/lib/orders";

export type MapayPayload = Record<string, string>;

export type MapayQueryResult = {
  code: number | string;
  msg?: string;
  trade_no?: string;
  out_trade_no?: string;
  api_trade_no?: string;
  type?: string;
  pid?: number | string;
  money?: string;
  status?: number | string;
  param?: string;
  buyer?: string;
  [key: string]: unknown;
};

export const MAPAY_QUERY_TIMEOUT_MS = 8000;
const logger = createLogger("mapay");

export function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value || value.startsWith("replace_with_")) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function redactMapayQueryUrl(url: URL) {
  const safeUrl = new URL(url.toString());
  if (safeUrl.searchParams.has("key")) {
    safeUrl.searchParams.set("key", "[redacted]");
  }
  return safeUrl.toString();
}

export function createMapaySign(params: MapayPayload, key: string) {
  const sorted = Object.entries(params)
    .filter(([field, value]) => field !== "sign" && field !== "sign_type" && value !== "")
    .sort(([fieldA], [fieldB]) => (fieldA > fieldB ? 1 : -1));

  const signSource = sorted.map(([field, value]) => `${field}=${value}`).join("&");
  return crypto.createHash("md5").update(`${signSource}${key}`).digest("hex");
}

export type MapayCreateResult = {
  code: number | string;
  msg?: string;
  trade_no?: string;
  payurl?: string;
  qrcode?: string;
  urlscheme?: string;
  money?: string;
  [key: string]: unknown;
};

export type BuildMapaySubmitUrlOptions = {
  order: OrderRecord;
  pay_type: string;
  request_origin: string;
  site_name?: string;
  access_token?: string;
};

/**
 * MAPI 接口：后端发起支付请求，返回 trade_no + payurl/qrcode。
 * 成功后可以把 trade_no 存入订单（创建时就有平台流水号）。
 */
export async function createMapayPayment(options: BuildMapaySubmitUrlOptions): Promise<MapayCreateResult> {
  const { order, pay_type, request_origin, access_token } = options;
  const pid = getRequiredEnv("MAPAY_PID");
  const key = getRequiredEnv("MAPAY_KEY");
  const appUrl = request_origin;
  const notifyUrl = new URL("/api/pay/notify", appUrl).toString();
  const returnUrl = new URL("/pay/return", appUrl);
  returnUrl.searchParams.set(
    "state",
    access_token || createOrderAccessGrant(order.out_trade_no),
  );

  const params: MapayPayload = {
    pid,
    type: pay_type,
    out_trade_no: order.out_trade_no,
    notify_url: notifyUrl,
    return_url: returnUrl.toString(),
    name: order.product_name.slice(0, 127),
    money: Number(order.money).toFixed(2),
    param: order.product_id,
    channel_id: process.env.MAPAY_CHANNEL_ID || "",
    device: process.env.MAPAY_DEVICE || "pc",
  };

  const signedParams = {
    ...params,
    sign: createMapaySign(params, key),
    sign_type: "MD5",
  };

  const mapiUrl = process.env.MAPAY_MAPI_URL || "https://mzf.mapay.cc/xpay/epay/mapi.php";

  logger.info("mapi request", {
    out_trade_no: order.out_trade_no,
    url: mapiUrl,
    pay_type,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAPAY_QUERY_TIMEOUT_MS);
  const response = await fetch(mapiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(signedParams).toString(),
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  const responseText = await response.text();
  logger.info("mapi response", {
    out_trade_no: order.out_trade_no,
    status: response.status,
    body_length: responseText.length,
  });

  if (!response.ok) {
    throw new Error(`MAPI request failed with HTTP ${response.status}`);
  }

  let result: MapayCreateResult;
  try {
    result = JSON.parse(responseText) as MapayCreateResult;
  } catch (error) {
    logger.error("mapi parse failed", {
      out_trade_no: order.out_trade_no,
      body_length: responseText.length,
      error,
    });
    throw error;
  }

  logger.info("mapi parsed", {
    out_trade_no: order.out_trade_no,
    code: result.code,
    trade_no: result.trade_no ?? null,
  });

  if (Number(result.code) !== 1) {
    throw new Error(`MAPI error: ${result.msg || "unknown"}`);
  }

  return result;
}

export function buildMapaySubmitUrl({
  order,
  pay_type,
  request_origin,
  site_name,
  access_token,
}: BuildMapaySubmitUrlOptions) {
  const pid = getRequiredEnv("MAPAY_PID");
  const key = getRequiredEnv("MAPAY_KEY");
  const appUrl = request_origin;
  const notifyUrl = new URL("/api/pay/notify", appUrl).toString();
  const returnUrl = new URL("/pay/return", appUrl);
  returnUrl.searchParams.set(
    "state",
    access_token || createOrderAccessGrant(order.out_trade_no),
  );

  const params: MapayPayload = {
    pid,
    type: pay_type,
    out_trade_no: order.out_trade_no,
    notify_url: notifyUrl,
    return_url: returnUrl.toString(),
    name: order.product_name,
    money: Number(order.money).toFixed(2),
    sitename: process.env.MAPAY_SITENAME || site_name || "码付小铺",
    param: order.product_id,
    channel_id: process.env.MAPAY_CHANNEL_ID || "",
    device: process.env.MAPAY_DEVICE || "",
  };

  const signedParams = {
    ...params,
    sign: createMapaySign(params, key),
    sign_type: "MD5",
  };

  const paymentUrl = new URL(
    process.env.MAPAY_GATEWAY || "https://mzf.mapay.cc/xpay/epay/submit.php",
  );

  Object.entries(signedParams).forEach(([field, value]) => {
    paymentUrl.searchParams.set(field, value);
  });

  logger.info("submit generated", {
    out_trade_no: order.out_trade_no,
    pay_type,
    gateway: paymentUrl.origin + paymentUrl.pathname,
  });

  return paymentUrl.toString();
}

export async function queryMapayOrder(outTradeNo: string) {
  const pid = getRequiredEnv("MAPAY_PID");
  const key = getRequiredEnv("MAPAY_KEY");
  const queryUrl = new URL(
    process.env.MAPAY_API_URL || "https://mzf.mapay.cc/xpay/epay/api.php",
  );

  queryUrl.searchParams.set("act", "order");
  queryUrl.searchParams.set("pid", pid);
  queryUrl.searchParams.set("key", key);
  queryUrl.searchParams.set("out_trade_no", outTradeNo);

  logger.info("query request", {
    out_trade_no: outTradeNo,
    url: redactMapayQueryUrl(queryUrl),
    timeout_ms: MAPAY_QUERY_TIMEOUT_MS,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAPAY_QUERY_TIMEOUT_MS);
  const response = await fetch(queryUrl, {
    method: "GET",
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  const responseText = await response.text();

  logger.info("query response", {
    out_trade_no: outTradeNo,
    status: response.status,
    body_length: responseText.length,
  });

  if (!response.ok) {
    throw new Error(`Mapay query failed with HTTP ${response.status}`);
  }

  let result: MapayQueryResult;
  try {
    result = JSON.parse(responseText) as MapayQueryResult;
  } catch (error) {
    logger.error("query parse failed", {
      out_trade_no: outTradeNo,
      body_length: responseText.length,
      error,
    });
    throw error;
  }

  logger.info("query parsed", {
    out_trade_no: outTradeNo,
    code: result.code,
    status: result.status ?? null,
    trade_no: result.trade_no ?? null,
  });

  return result;
}

export async function parseMapayPayload(request: Request): Promise<MapayPayload> {
  if (request.method === "GET") {
    return Object.fromEntries(new URL(request.url).searchParams.entries());
  }

  const formData = await request.formData();
  const payload: MapayPayload = {};

  formData.forEach((value, field) => {
    payload[field] = String(value);
  });

  return payload;
}

export function verifyMapayPayload(payload: MapayPayload) {
  const pid = getRequiredEnv("MAPAY_PID");
  const key = getRequiredEnv("MAPAY_KEY");
  if (payload.pid !== pid || (payload.sign_type && payload.sign_type !== "MD5")) {
    return false;
  }

  const expectedSign = createMapaySign(payload, key);
  const actual = Buffer.from(payload.sign || "");
  const expected = Buffer.from(expectedSign);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
