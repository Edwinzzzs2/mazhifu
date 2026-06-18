import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  adminCookieOptions,
  createAdminSessionValue,
  verifyAdminPassword,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const password = String(formData.get("password") ?? "");
    if (!verifyAdminPassword(password)) {
      return NextResponse.redirect(new URL("/admin/login?error=1", request.url), {
        status: 303,
      });
    }

    const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
    response.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionValue(), adminCookieOptions);
    return response;
  } catch {
    return NextResponse.redirect(new URL("/admin/login?error=config", request.url), {
      status: 303,
    });
  }
}
