import { headers } from "next/headers";

/**
 * 获取当前请求的外部访问 Origin (Protocol + Host)。
 * 优先读取并校验 APP_URL 环境变量，其次读取反向代理的 x-forwarded-host/proto 头，最后退回到 Host 头。
 */
export function getRequestOrigin() {
  const headerList = headers();

  // 优先使用 APP_URL 环境变量（如果是有效的公网域名，跳过 localhost/127.0.0.1）
  const appUrl = process.env.APP_URL ?? "";
  if (appUrl && !appUrl.includes("localhost") && !appUrl.includes("127.0.0.1")) {
    return appUrl.replace(/\/+$/, "");
  }

  // 否则从请求头中自动检测
  const host =
    headerList.get("x-forwarded-host") ??
    headerList.get("host") ??
    "localhost:3000";
  const protocol =
    headerList.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  
  return `${protocol}://${host}`;
}
