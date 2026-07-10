import crypto from "crypto";
import { cookies } from "next/headers";

const ORDER_ACCESS_COOKIE_PREFIX = "mazhifu_order_";
const ORDER_ACCESS_COOKIE_SECONDS = 60 * 60 * 24 * 30;
const ORDER_ACCESS_GRANT_VERSION = "v1";
const OUT_TRADE_NO_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const orderAccessCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ORDER_ACCESS_COOKIE_SECONDS,
};

export function getOrderAccessCookieName(outTradeNo: string) {
  if (!OUT_TRADE_NO_PATTERN.test(outTradeNo)) {
    throw new Error("invalid out_trade_no for order access cookie");
  }
  return `${ORDER_ACCESS_COOKIE_PREFIX}${outTradeNo}`;
}

function getOrderAccessSecret() {
  const secret = (
    process.env.ORDER_ACCESS_SECRET
    || process.env.ADMIN_SESSION_SECRET
    || ""
  ).trim();
  const invalid = !secret || secret.startsWith("replace_with_") || secret.length < 32;

  if (invalid && process.env.NODE_ENV === "production") {
    throw new Error("ORDER_ACCESS_SECRET or ADMIN_SESSION_SECRET must be at least 32 characters");
  }

  return invalid ? "mazhifu-development-order-access-secret" : secret;
}

function signOrderAccessGrant(outTradeNo: string, expiresAt: number) {
  return crypto
    .createHmac("sha256", getOrderAccessSecret())
    .update(`${ORDER_ACCESS_GRANT_VERSION}.${outTradeNo}.${expiresAt}`)
    .digest("base64url");
}

export function createOrderAccessGrant(outTradeNo: string) {
  if (!OUT_TRADE_NO_PATTERN.test(outTradeNo)) {
    throw new Error("invalid out_trade_no for order access grant");
  }

  const expiresAt = Math.floor(Date.now() / 1000) + ORDER_ACCESS_COOKIE_SECONDS;
  const signature = signOrderAccessGrant(outTradeNo, expiresAt);
  return `${ORDER_ACCESS_GRANT_VERSION}.${expiresAt}.${signature}`;
}

export function verifyOrderAccessGrant(outTradeNo: string, grant: string) {
  if (!OUT_TRADE_NO_PATTERN.test(outTradeNo) || !grant) return false;

  const [version, expiresAtText, signature, ...extra] = grant.split(".");
  const expiresAt = Number(expiresAtText);
  if (
    version !== ORDER_ACCESS_GRANT_VERSION
    || extra.length > 0
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= Math.floor(Date.now() / 1000)
    || !signature
  ) {
    return false;
  }

  const expected = Buffer.from(signOrderAccessGrant(outTradeNo, expiresAt));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function readCookie(cookieHeader: string, name: string) {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? "";
}

export function getOrderAccessTokenFromRequest(request: Request, outTradeNo: string) {
  if (!OUT_TRADE_NO_PATTERN.test(outTradeNo)) return "";
  return readCookie(
    request.headers.get("cookie") ?? "",
    getOrderAccessCookieName(outTradeNo),
  );
}

export function getOrderAccessToken(outTradeNo: string) {
  if (!OUT_TRADE_NO_PATTERN.test(outTradeNo)) return "";
  return cookies().get(getOrderAccessCookieName(outTradeNo))?.value ?? "";
}
