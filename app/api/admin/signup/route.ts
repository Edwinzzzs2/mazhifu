import { NextResponse } from "next/server";
import {
  ADMIN_REFRESH_COOKIE_NAME,
  adminRefreshCookieOptions,
  createAdminTokenPair,
  registerPublicUser,
} from "@/lib/admin-auth";
import { getRequestOrigin } from "@/lib/request-utils";

function wantsJson(request: Request) {
  return request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("content-type")?.includes("application/json");
}

async function readSignupInput(request: Request) {
  if (request.headers.get("content-type")?.includes("application/json")) {
    const payload = (await request.json()) as Record<string, unknown>;
    return {
      username: String(payload.username ?? ""),
      password: String(payload.password ?? ""),
      display_name: String(payload.display_name ?? ""),
    };
  }

  const formData = await request.formData();
  return {
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    display_name: String(formData.get("display_name") ?? ""),
  };
}

export async function POST(request: Request) {
  const origin = getRequestOrigin();
  const json = wantsJson(request);

  try {
    const user = await registerPublicUser(await readSignupInput(request));

    if (user.role !== "ADMIN") {
      if (json) {
        return NextResponse.json({ message: "该账号没有管理后台权限" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/admin/login?error=permission", origin), { status: 303 });
    }

    const tokens = await createAdminTokenPair(user);
    const response = json
      ? NextResponse.json({
          user,
          access_token: tokens.access_token,
          access_token_expires_at: tokens.access_token_expires_at,
        })
      : NextResponse.redirect(new URL("/admin", origin), { status: 303 });
    response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, tokens.refresh_token, adminRefreshCookieOptions);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (json) {
      return NextResponse.json({ message }, { status: 400 });
    }
    const reason = encodeURIComponent(message);
    return NextResponse.redirect(new URL(`/admin/signup?error=${reason}`, origin), { status: 303 });
  }
}
