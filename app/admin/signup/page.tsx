import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getCurrentAdminUser,
  getInstanceGeneralSettings,
  needsAdminSetup,
} from "@/lib/admin-auth";
import { getSiteSettingsSafe } from "@/lib/site-settings";

type AdminSignupPageProps = {
  searchParams?: {
    error?: string;
  };
};

export const dynamic = "force-dynamic";

export default async function AdminSignupPage({ searchParams }: AdminSignupPageProps) {
  const siteSettings = await getSiteSettingsSafe();
  const [currentUser, setupRequired, generalSettings] = await Promise.all([
    getCurrentAdminUser(),
    needsAdminSetup(),
    getInstanceGeneralSettings(),
  ]);

  if (currentUser?.role === "ADMIN") {
    redirect("/admin");
  }

  const canSignup =
    setupRequired ||
    (!generalSettings.disallow_user_registration && !generalSettings.disallow_password_auth);
  const title = setupRequired ? "创建管理员账号" : "注册账号";
  const description = setupRequired
    ? "首次使用需要创建一个管理员账号，之后可进入后台管理商品、库存和订单。"
    : "注册由后台开关控制，普通注册账号默认不具备管理后台权限。";

  return (
    <main className="page-shell grid place-items-center px-3 py-6 sm:px-4">
      <section className="admin-panel w-full max-w-md p-5 sm:p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-bold text-sky-600">{setupRequired ? "首次设置" : "账号注册"}</div>
            <h1 className="mt-1 truncate text-2xl font-black text-slate-950">{title}</h1>
            <p className="mt-2 text-sm text-slate-500">{description}</p>
          </div>
          <span className="brand-mark h-11 w-11 shrink-0">
            {siteSettings.site_logo_url ? (
              <img src={siteSettings.site_logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <LockKeyhole className="h-5 w-5" />
            )}
          </span>
        </div>

        {canSignup ? (
          <form action="/api/admin/signup" method="post" className="grid gap-4">
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
                  placeholder="字母、数字或连字符"
                  required
                />
              </div>
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              昵称
              <input className="admin-input" name="display_name" type="text" maxLength={80} placeholder="可留空" />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              密码
              <input
                className="admin-input"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="请输入密码"
                required
              />
            </label>
            {searchParams?.error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {searchParams.error}
              </div>
            ) : null}
            <Button className="bg-sky-600 shadow-none hover:bg-sky-700">
              {setupRequired ? <ShieldCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {setupRequired ? "创建并进入后台" : "注册"}
            </Button>
          </form>
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            当前站点未开放账号注册。
          </div>
        )}

        {!setupRequired ? (
          <p className="mt-4 text-sm text-slate-500">
            已有账号？
            <Link href="/admin/login" className="ml-2 font-semibold text-sky-600 hover:underline">
              登录
            </Link>
          </p>
        ) : null}
      </section>
    </main>
  );
}
