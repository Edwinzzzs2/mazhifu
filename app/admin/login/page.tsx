import { redirect } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getSiteSettingsSafe } from "@/lib/site-settings";

type AdminLoginPageProps = {
  searchParams?: {
    error?: string;
  };
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  let configured = true;
  let authenticated = false;
  const siteSettings = await getSiteSettingsSafe();

  try {
    authenticated = isAdminAuthenticated();
  } catch {
    configured = false;
  }

  if (authenticated) {
    redirect("/admin");
  }

  const error = searchParams?.error;

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
              输入管理密码后进入商品、库存和订单工作台。
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

        {!configured ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            请先在环境变量中配置 ADMIN_PASSWORD。
          </div>
        ) : (
          <form action="/api/admin/login" method="post" className="grid gap-4">
            <label className="grid gap-2 text-sm font-semibold">
              管理密码
              <input
                className="admin-input"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="请输入管理密码"
              />
            </label>
            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error === "config" ? "后台密码未配置" : "密码不正确"}
              </div>
            ) : null}
            <Button className="bg-sky-600 shadow-none hover:bg-sky-700">
              <ShieldCheck className="h-4 w-4" />
              登录
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
