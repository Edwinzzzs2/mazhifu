import { NextResponse } from "next/server";
import {
  ADMIN_REFRESH_COOKIE_NAME,
  adminRefreshCookieOptions,
  authenticateAdminUser,
  createAdminTokenPair,
  getInstanceGeneralSettings,
  needsAdminSetup,
} from "@/lib/admin-auth";
import { getRequestOrigin } from "@/lib/request-utils";

function wantsJson(request: Request) {
  return request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("content-type")?.includes("application/json");
}

async function readLoginInput(request: Request) {
  if (request.headers.get("content-type")?.includes("application/json")) {
    const payload = (await request.json()) as Record<string, unknown>;
    return {
      username: String(payload.username ?? ""),
      password: String(payload.password ?? ""),
    };
  }

  const formData = await request.formData();
  return {
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
}

export async function POST(request: Request) {
  const json = wantsJson(request);
  try {
    const { username, password } = await readLoginInput(request);
    const origin = getRequestOrigin();

    if (await needsAdminSetup()) {
      if (json) {
        return NextResponse.json({ message: "setup_required" }, { status: 409 });
      }
      return NextResponse.redirect(new URL("/admin/signup", origin), { status: 303 });
    }

    const user = await authenticateAdminUser(username, password);
    if (!user) {
      if (json) {
        return NextResponse.json({ message: "用户名或密码不正确" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/admin/login?error=1", origin), {
        status: 303,
      });
    }

    const generalSettings = await getInstanceGeneralSettings();
    if (generalSettings.disallow_password_auth && user.role === "USER") {
      if (json) {
        return NextResponse.json({ message: "当前站点已关闭普通用户密码登录" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/admin/login?error=password_disallowed", origin), {
        status: 303,
      });
    }
    if (user.role !== "ADMIN") {
      if (json) {
        return NextResponse.json({ message: "该账号没有管理后台权限" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/admin/login?error=permission", origin), {
        status: 303,
      });
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
  } catch {
    const origin = getRequestOrigin();
    if (json) {
      return NextResponse.json({ message: "后台认证配置异常" }, { status: 500 });
    }
    return NextResponse.redirect(new URL("/admin/login?error=config", origin), {
      status: 303,
    });
  }
}
