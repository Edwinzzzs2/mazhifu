import { headers } from "next/headers";

function getConfiguredOrigin() {
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) return "";

  const parsed = new URL(appUrl);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("APP_URL must be a plain http(s) origin");
  }
  return parsed.origin;
}

function getForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() ?? "";
}

/** 获取生成支付回调和重定向所需的可信外部 Origin。 */
export function getRequestOrigin() {
  const configuredOrigin = getConfiguredOrigin();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  // 生产环境禁止从请求头拼接支付地址，避免 Host Header 注入。
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL is required in production");
  }

  const headerList = headers();
  const trustProxy = process.env.TRUST_PROXY === "true";
  const host = getForwardedValue(
    trustProxy ? headerList.get("x-forwarded-host") : headerList.get("host"),
  ) || "localhost:3000";
  const forwardedProtocol = trustProxy
    ? getForwardedValue(headerList.get("x-forwarded-proto"))
    : "";
  const protocol = ["http", "https"].includes(forwardedProtocol)
    ? forwardedProtocol
    : /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)
      ? "http"
      : "https";
  const origin = new URL(`${protocol}://${host}`);
  const allowedHosts = (process.env.ALLOWED_HOSTS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(origin.hostname);

  if (!isLocal && !allowedHosts.includes(origin.host.toLowerCase())) {
    throw new Error("request host is not allowed");
  }
  return origin.origin;
}
