import crypto from "crypto";

const ORDER_RETURN_GRANT_VERSION = "v1";
const ORDER_RETURN_GRANT_SECONDS = 60 * 60;
const OUT_TRADE_NO_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function getOrderReturnSecret() {
  const secret = (
    process.env.ORDER_ACCESS_SECRET
    || process.env.ADMIN_SESSION_SECRET
    || ""
  ).trim();
  const invalid = !secret || secret.startsWith("replace_with_") || secret.length < 32;

  if (invalid && process.env.NODE_ENV === "production") {
    throw new Error("ORDER_ACCESS_SECRET or ADMIN_SESSION_SECRET must be at least 32 characters");
  }

  return invalid ? "mazhifu-development-order-return-secret" : secret;
}

function signOrderReturnGrant(outTradeNo: string, expiresAt: number) {
  return crypto
    .createHmac("sha256", getOrderReturnSecret())
    .update(`${ORDER_RETURN_GRANT_VERSION}.${outTradeNo}.${expiresAt}`)
    .digest("base64url");
}

export function createOrderReturnGrant(outTradeNo: string) {
  if (!OUT_TRADE_NO_PATTERN.test(outTradeNo)) {
    throw new Error("invalid out_trade_no for order return grant");
  }

  const expiresAt = Math.floor(Date.now() / 1000) + ORDER_RETURN_GRANT_SECONDS;
  return [
    ORDER_RETURN_GRANT_VERSION,
    expiresAt,
    signOrderReturnGrant(outTradeNo, expiresAt),
  ].join(".");
}

export function verifyOrderReturnGrant(outTradeNo: string, grant: string) {
  if (!OUT_TRADE_NO_PATTERN.test(outTradeNo) || !grant) return false;

  const [version, expiresAtText, signature, ...extra] = grant.split(".");
  const expiresAt = Number(expiresAtText);
  if (
    version !== ORDER_RETURN_GRANT_VERSION
    || extra.length > 0
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= Math.floor(Date.now() / 1000)
    || !signature
  ) {
    return false;
  }

  const expected = Buffer.from(signOrderReturnGrant(outTradeNo, expiresAt));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
