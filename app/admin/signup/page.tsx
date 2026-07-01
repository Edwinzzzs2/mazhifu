import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { AdminSignupForm } from "@/components/admin-signup-form";
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
          <AdminSignupForm initial_error={searchParams?.error} setup_required={setupRequired} />
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
