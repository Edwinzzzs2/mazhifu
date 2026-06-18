import { redirect } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAdminAuthenticated } from "@/lib/admin-auth";

type AdminLoginPageProps = {
  searchParams?: {
    error?: string;
  };
};

export default function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  let configured = true;
  let authenticated = false;

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
    <main className="grid min-h-screen place-items-center bg-[#eef9ff] px-4 text-[#162238]">
      <section className="w-full max-w-md rounded-lg border border-sky-100 bg-white p-6 shadow-[0_18px_45px_rgba(14,116,144,0.12)]">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-sky-600">后台登录</div>
            <h1 className="mt-1 text-2xl font-bold">码付小铺管理台</h1>
          </div>
          <LockKeyhole className="h-10 w-10 text-sky-500" />
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
            <Button className="bg-sky-500 shadow-none hover:bg-sky-600">
              <ShieldCheck className="h-4 w-4" />
              登录
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
