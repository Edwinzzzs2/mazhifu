import crypto from "crypto";
import type { OrderRecord } from "@/lib/orders";

export type MapayPayload = Record<string, string>;

type BuildMapaySubmitUrlOptions = {
  order: OrderRecord;
  pay_type: string;
  request_origin: string;
};

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
}: BuildMapaySubmitUrlOptions) {
  const pid = getRequiredEnv("MAPAY_PID");
  const key = getRequiredEnv("MAPAY_KEY");
  const appUrl = getAppUrl(request_origin);
  const notifyUrl = new URL("/api/pay/notify", appUrl).toString();
  const returnUrl = new URL("/pay/return", appUrl).toString();

  const params: MapayPayload = {
    pid,
    type: pay_type,
    out_trade_no: order.out_trade_no,
    notify_url: notifyUrl,
    return_url: returnUrl,
    name: order.product_name,
    money: Number(order.money).toFixed(2),
    sitename: process.env.MAPAY_SITENAME || "码支付卡密铺",
    param: order.product_id,
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
  return payload.sign === expectedSign;
}
