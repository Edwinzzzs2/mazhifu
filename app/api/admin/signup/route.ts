import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  adminCookieOptions,
  createAdminSessionValue,
  registerPublicUser,
} from "@/lib/admin-auth";
import { getRequestOrigin } from "@/lib/request-utils";

export async function POST(request: Request) {
  const origin = getRequestOrigin();

  try {
    const formData = await request.formData();
    const user = await registerPublicUser({
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      display_name: String(formData.get("display_name") ?? ""),
    });

    if (user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/admin/login?error=permission", origin), { status: 303 });
    }

    const response = NextResponse.redirect(new URL("/admin", origin), { status: 303 });
    response.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionValue(user), adminCookieOptions);
    return response;
  } catch (error) {
    const reason = error instanceof Error ? encodeURIComponent(error.message) : "unknown";
    return NextResponse.redirect(new URL(`/admin/signup?error=${reason}`, origin), { status: 303 });
  }
}
