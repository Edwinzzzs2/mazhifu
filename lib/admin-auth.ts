import crypto from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "mazhifu_admin";
const SESSION_SECONDS = 60 * 60 * 12;

function getAdminPassword() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD is required");
  }
  return password;
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || getAdminPassword();
}

function signTimestamp(timestamp: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(timestamp).digest("hex");
}

export function verifyAdminPassword(password: string) {
  const actual = Buffer.from(password);
  const expected = Buffer.from(getAdminPassword());
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function createAdminSessionValue() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return `${timestamp}.${signTimestamp(timestamp)}`;
}

export function verifyAdminSessionValue(value?: string) {
  if (!value) {
    return false;
  }

  const [timestamp, signature] = value.split(".");
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) {
    return false;
  }

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(signTimestamp(timestamp));
  return (
    age >= 0 &&
    age <= SESSION_SECONDS &&
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}

export function isAdminAuthenticated() {
  return verifyAdminSessionValue(cookies().get(ADMIN_COOKIE_NAME)?.value);
}

export const adminCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_SECONDS,
};
