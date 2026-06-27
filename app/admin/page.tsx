import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ClipboardList,
  ExternalLink,
  LogOut,
  Package,
  Settings2,
  Store,
  Warehouse,
} from "lucide-react";
import { AdminCardInventory } from "@/components/admin-card-inventory";
import { AdminOrderList } from "@/components/admin-order-list";
import { AdminProductManager } from "@/components/admin-product-manager";
import { AdminSiteSettings } from "@/components/admin-site-settings";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { listCategories, listProducts } from "@/lib/products";
import { getSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "products", label: "商品", icon: Package },
  { key: "inventory", label: "库存", icon: Warehouse },
  { key: "orders", label: "订单", icon: ClipboardList },
  { key: "settings", label: "设置", icon: Settings2 },
] as const;

const TAB_LABELS: Record<string, string> = {
  products: "商品管理",
  inventory: "库存管理",
  orders: "订单管理",
  settings: "系统设置",
};

type Tab = (typeof TABS)[number]["key"];

type AdminPageProps = {
  searchParams?: { tab?: string };
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  let authenticated = false;

  try {
    authenticated = isAdminAuthenticated();
  } catch {
    redirect("/admin/login?error=config");
  }

  if (!authenticated) {
    redirect("/admin/login");
  }

  const tab: Tab =
    (searchParams?.tab as Tab | undefined) &&
    TABS.some((t) => t.key === searchParams?.tab)
      ? (searchParams!.tab as Tab)
      : "products";

  const [categories, products, siteSettings] = await Promise.all([
    listCategories(true),
    listProducts(true),
    getSiteSettings(),
  ]);

  return (
    <div className="flex min-h-screen bg-slate-50 text-[#162238]">
      {/* ── Sidebar（PC 可见，手机隐藏）── */}
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-slate-200 md:bg-white">
        {/* Logo */}
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-4 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-sky-500 text-white">
            <Store className="h-4 w-4" />
          </span>
          <span className="truncate">{siteSettings.site_name}后台</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 p-2">
          {TABS.map(({ key, label: shortLabel, icon: Icon }) => (
            <Link
              key={key}
              href={`/admin?tab=${key}`}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === key
                  ? "bg-sky-500 text-white"
                  : "text-slate-600 hover:bg-sky-50 hover:text-sky-600"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {TAB_LABELS[key] ?? shortLabel}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="space-y-1 border-t border-slate-200 p-2">
          <Link
            href="/"
            target="_blank"
            className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          >
            <ExternalLink className="h-4 w-4" />
            查看前台
          </Link>
          <form action="/api/admin/logout" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </form>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="min-w-0 flex-1 px-3 py-4 pb-24 md:px-6 md:py-6 md:pb-6">
        <div className="mx-auto w-full max-w-[1480px]">
          {/* Page title */}
          <div className="mb-4 flex items-center justify-between gap-3 md:mb-5">
            <div className="min-w-0">
              {TABS.map(({ key, icon: Icon }) =>
                tab === key ? (
                  <div key={key} className="flex min-w-0 items-center gap-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white text-sky-500 shadow-sm ring-1 ring-slate-200">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-400">
                        {siteSettings.site_name} 管理中心
                      </div>
                      <h1 className="truncate text-lg font-bold md:text-xl">{TAB_LABELS[key]}</h1>
                    </div>
                  </div>
                ) : null,
              )}
            </div>
            {/* 手机端顶部快捷入口 */}
            <div className="flex items-center gap-2 md:hidden">
              <Link
                href="/"
                target="_blank"
                className="grid h-9 w-9 place-items-center rounded-md border border-sky-200 bg-white text-slate-500"
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
              <form action="/api/admin/logout" method="post">
                <button
                  type="submit"
                  className="grid h-9 w-9 place-items-center rounded-md border border-sky-200 bg-white text-slate-500"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>

          {/* Tab content */}
          {tab === "products" && (
            <AdminProductManager initial_categories={categories} initial_products={products} />
          )}
          {tab === "inventory" && <AdminCardInventory products={products} />}
          {tab === "orders" && <AdminOrderList />}
          {tab === "settings" && <AdminSiteSettings initial_settings={siteSettings} />}
        </div>
      </main>

      {/* ── 手机底部 Tab 栏 ── */}
      <nav className="admin-bottom-nav md:hidden">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/admin?tab=${key}`}
            className={tab === key ? "is-active" : ""}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
