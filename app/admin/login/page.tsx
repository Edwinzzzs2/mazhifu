import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getCurrentAdminUser,
  getInstanceGeneralSettings,
  needsAdminSetup,
} from "@/lib/admin-auth";
import { getSiteSettingsSafe } from "@/lib/site-settings";

type AdminLoginPageProps = {
  searchParams?: {
    error?: string;
  };
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const siteSettings = await getSiteSettingsSafe();
  const [currentUser, setupRequired, generalSettings] = await Promise.all([
    getCurrentAdminUser(),
    needsAdminSetup(),
    getInstanceGeneralSettings(),
  ]);

  if (currentUser?.role === "ADMIN") {
    redirect("/admin");
  }
  if (setupRequired) {
    redirect("/admin/signup");
  }

  const error = searchParams?.error;
  const errorText =
    error === "config"
      ? "后台会话密钥未配置"
      : error === "password_disallowed"
        ? "当前站点已关闭普通用户密码登录"
        : error === "permission"
          ? "该账号没有管理后台权限"
          : "用户名或密码不正确";

  return (
    <main className="page-shell grid place-items-center px-3 py-6 sm:px-4">
      <section className="admin-panel w-full max-w-md p-5 sm:p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-bold text-sky-600">后台登录</div>
            <h1 className="mt-1 truncate text-2xl font-black text-slate-950">
              {siteSettings.site_name}管理台
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              输入用户名和密码后进入商品、库存和订单工作台。
            </p>
          </div>
          <span className="brand-mark h-11 w-11 shrink-0">
            {siteSettings.site_logo_url ? (
              <img src={siteSettings.site_logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <LockKeyhole className="h-5 w-5" />
            )}
          </span>
        </div>

        <form action="/api/admin/login" method="post" className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold">
            用户名
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="admin-input pl-9"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="请输入用户名"
                required
              />
            </div>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            密码
            <input
              className="admin-input"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="请输入密码"
              required
            />
          </label>
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorText}
            </div>
          ) : null}
          <Button className="bg-sky-600 shadow-none hover:bg-sky-700">
            <ShieldCheck className="h-4 w-4" />
            登录
          </Button>
        </form>
        {!generalSettings.disallow_user_registration && !generalSettings.disallow_password_auth ? (
          <p className="mt-4 text-sm text-slate-500">
            没有账号？
            <Link href="/admin/signup" className="ml-2 font-semibold text-sky-600 hover:underline">
              注册
            </Link>
          </p>
        ) : null}
      </section>
    </main>
  );
}
