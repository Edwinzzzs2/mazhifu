import { NextResponse } from "next/server";
import {
  ADMIN_REFRESH_COOKIE_NAME,
  adminRefreshCookieOptions,
  getAdminRefreshTokenFromRequest,
  revokeAdminRefreshToken,
} from "@/lib/admin-auth";
import { getRequestOrigin } from "@/lib/request-utils";

function wantsJson(request: Request) {
  return request.headers.get("accept")?.includes("application/json");
}

export async function POST(request: Request) {
  const refreshToken = getAdminRefreshTokenFromRequest(request);
  if (refreshToken) {
    await revokeAdminRefreshToken(refreshToken);
  }

  const origin = getRequestOrigin();
  const response = wantsJson(request)
    ? NextResponse.json({ success: true })
    : NextResponse.redirect(new URL("/admin/login", origin), { status: 303 });
  response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, "", { ...adminRefreshCookieOptions, maxAge: 0 });
  return response;
}
