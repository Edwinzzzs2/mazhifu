import { NextResponse } from "next/server";
import {
  ADMIN_REFRESH_COOKIE_NAME,
  adminRefreshCookieOptions,
  getAdminRefreshTokenFromRequest,
  rotateAdminRefreshToken,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  try {
    const refreshToken = getAdminRefreshTokenFromRequest(request);
    if (!refreshToken) {
      return NextResponse.json({ message: "unauthorized" }, { status: 401 });
    }

    const rotated = await rotateAdminRefreshToken(refreshToken);
    if (!rotated || rotated.user.role !== "ADMIN") {
      const response = NextResponse.json({ message: "unauthorized" }, { status: 401 });
      response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, "", { ...adminRefreshCookieOptions, maxAge: 0 });
      return response;
    }

    const response = NextResponse.json({
      access_token: rotated.tokens.access_token,
      access_token_expires_at: rotated.tokens.access_token_expires_at,
    });
    response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, rotated.tokens.refresh_token, adminRefreshCookieOptions);
    return response;
  } catch {
    return NextResponse.json({ message: "refresh failed" }, { status: 401 });
  }
}
