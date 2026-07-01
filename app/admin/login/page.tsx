import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { AdminLoginForm } from "@/components/admin-login-form";
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
      ? "后台认证配置异常"
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

        <AdminLoginForm initial_error={error ? errorText : undefined} />
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
