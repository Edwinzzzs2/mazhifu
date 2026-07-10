import { cookies } from "next/headers";

const ORDER_ACCESS_COOKIE_PREFIX = "mazhifu_order_";
const ORDER_ACCESS_COOKIE_SECONDS = 60 * 60 * 24 * 30;
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
