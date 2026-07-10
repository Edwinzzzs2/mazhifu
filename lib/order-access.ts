import crypto from "crypto";
import { cookies } from "next/headers";

const ORDER_SESSION_COOKIE_NAME = "mazhifu_session";
const LEGACY_ORDER_COOKIE_PREFIX = "mazhifu_order_";
const ORDER_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const ORDER_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export const orderSessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ORDER_SESSION_TTL_SECONDS,
};

export function createOrderSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function isOrderSessionToken(value: string) {
  return ORDER_SESSION_TOKEN_PATTERN.test(value);
}

export function hashOrderSessionToken(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readCookie(cookieHeader: string, name: string) {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? "";
}

export function getOrderSessionTokenFromRequest(request: Request) {
  const token = readCookie(request.headers.get("cookie") ?? "", ORDER_SESSION_COOKIE_NAME);
  return isOrderSessionToken(token) ? token : "";
}

export function getOrCreateOrderSessionToken(request: Request) {
  return getOrderSessionTokenFromRequest(request) || createOrderSessionToken();
}

export function getOrderSessionToken() {
  const token = cookies().get(ORDER_SESSION_COOKIE_NAME)?.value ?? "";
  return isOrderSessionToken(token) ? token : "";
}

export function getLegacyOrderCookieNames(request: Request) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((item) => item.trim().split("=", 1)[0] ?? "")
    .filter((name) => name.startsWith(LEGACY_ORDER_COOKIE_PREFIX));
}

export function getOrderSessionCookieName() {
  return ORDER_SESSION_COOKIE_NAME;
}
