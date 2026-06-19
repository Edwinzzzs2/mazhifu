import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  adminCookieOptions,
  createAdminSessionValue,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import { getRequestOrigin } from "@/lib/request-utils";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const password = String(formData.get("password") ?? "");
    const origin = getRequestOrigin();

    if (!verifyAdminPassword(password)) {
      return NextResponse.redirect(new URL("/admin/login?error=1", origin), {
        status: 303,
      });
    }

    const response = NextResponse.redirect(new URL("/admin", origin), { status: 303 });
    response.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionValue(), adminCookieOptions);
    return response;
  } catch {
    const origin = getRequestOrigin();
    return NextResponse.redirect(new URL("/admin/login?error=config", origin), {
      status: 303,
    });
  }
}
