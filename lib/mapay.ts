import crypto from "crypto";
import type { OrderRecord } from "@/lib/orders";

export type MapayPayload = Record<string, string>;

type BuildMapaySubmitUrlOptions = {
  order: OrderRecord;
  pay_type: string;
  request_origin: string;
  access_token: string;
  site_name?: string;
};

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

export const MAPAY_QUERY_TIMEOUT_MS = 3000;

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

function getAppUrl(requestOrigin: string) {
  return process.env.APP_URL || requestOrigin;
}

export function createMapaySign(params: MapayPayload, key: string) {
  const sorted = Object.entries(params)
    .filter(([field, value]) => field !== "sign" && field !== "sign_type" && value !== "")
    .sort(([fieldA], [fieldB]) => (fieldA > fieldB ? 1 : -1));

  const signSource = sorted.map(([field, value]) => `${field}=${value}`).join("&");
  return crypto.createHash("md5").update(`${signSource}${key}`).digest("hex");
}

export function buildMapaySubmitUrl({
  order,
  pay_type,
  request_origin,
  access_token,
  site_name,
}: BuildMapaySubmitUrlOptions) {
  const pid = getRequiredEnv("MAPAY_PID");
  const key = getRequiredEnv("MAPAY_KEY");
  const appUrl = getAppUrl(request_origin);
  const notifyUrl = new URL("/api/pay/notify", appUrl).toString();
  const returnUrl = new URL("/pay/return", appUrl);
  returnUrl.searchParams.set("token", access_token);

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAPAY_QUERY_TIMEOUT_MS);
  const response = await fetch(queryUrl, {
    method: "GET",
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) {
    throw new Error(`Mapay query failed with HTTP ${response.status}`);
  }

  return (await response.json()) as MapayQueryResult;
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
