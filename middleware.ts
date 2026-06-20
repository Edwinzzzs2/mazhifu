import { NextRequest, NextResponse } from "next/server";

const HOME_EXPIRE_CHECK_COOKIE = "mazhifu_home_expire_checked";
const HOME_EXPIRE_CHECK_MAX_AGE = 60 * 60 * 24 * 7;

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (request.nextUrl.pathname === "/" && !request.cookies.get(HOME_EXPIRE_CHECK_COOKIE)?.value) {
    response.cookies.set(HOME_EXPIRE_CHECK_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: HOME_EXPIRE_CHECK_MAX_AGE,
    });
  }

  return response;
}

export const config = {
  matcher: "/",
};
