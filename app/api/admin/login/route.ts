import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  authenticateAdminUser,
  adminCookieOptions,
  createAdminSessionValue,
  getInstanceGeneralSettings,
  needsAdminSetup,
} from "@/lib/admin-auth";
import { getRequestOrigin } from "@/lib/request-utils";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");
    const origin = getRequestOrigin();

    if (await needsAdminSetup()) {
      return NextResponse.redirect(new URL("/admin/signup", origin), { status: 303 });
    }

    const user = await authenticateAdminUser(username, password);
    if (!user) {
      return NextResponse.redirect(new URL("/admin/login?error=1", origin), {
        status: 303,
      });
    }

    const generalSettings = await getInstanceGeneralSettings();
    if (generalSettings.disallow_password_auth && user.role === "USER") {
      return NextResponse.redirect(new URL("/admin/login?error=password_disallowed", origin), {
        status: 303,
      });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/admin/login?error=permission", origin), {
        status: 303,
      });
    }

    const response = NextResponse.redirect(new URL("/admin", origin), { status: 303 });
    response.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionValue(user), adminCookieOptions);
    return response;
  } catch {
    const origin = getRequestOrigin();
    return NextResponse.redirect(new URL("/admin/login?error=config", origin), {
      status: 303,
    });
  }
}
