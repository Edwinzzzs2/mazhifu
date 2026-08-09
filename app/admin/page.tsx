import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  ClipboardList,
  ExternalLink,
  Package,
  Settings2,
  Store,
  Warehouse,
} from "lucide-react";
import { AdminCardInventory } from "@/components/admin-card-inventory";
import { AdminLogoutButton } from "@/components/admin-logout-button";
import { AdminOrderList } from "@/components/admin-order-list";
import { AdminProductManager } from "@/components/admin-product-manager";
import { AdminSiteSettings } from "@/components/admin-site-settings";
import {
  getCurrentAdminUser,
  getInstanceGeneralSettings,
  listAdminUsers,
  needsAdminSetup,
} from "@/lib/admin-auth";
import { listCategories, listProducts } from "@/lib/products";
import { getSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

const TABS = [
  {
    key: "products",
    label: "商品",
    title: "商品管理",
    description: "维护商品资料、售价与前台展示状态",
    icon: Package,
  },
  {
    key: "inventory",
    label: "库存",
    title: "库存管理",
    description: "导入并追踪卡密、账号、链接或整段发货内容",
    icon: Warehouse,
  },
  {
    key: "orders",
    label: "订单",
    title: "订单管理",
    description: "查询支付状态并核对订单发货结果",
    icon: ClipboardList,
  },
  {
    key: "settings",
    label: "设置",
    title: "系统设置",
    description: "管理站点资料、访问策略和后台账号",
    icon: Settings2,
  },
] as const;

type Tab = (typeof TABS)[number]["key"];

type AdminPageProps = {
  searchParams?: { tab?: string };
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const [currentUser, setupRequired] = await Promise.all([getCurrentAdminUser(), needsAdminSetup()]);
  if (setupRequired) {
    redirect("/admin/signup");
  }
  if (currentUser?.role !== "ADMIN") {
    redirect("/admin/login");
  }

  const tab: Tab =
    (searchParams?.tab as Tab | undefined) &&
    TABS.some((t) => t.key === searchParams?.tab)
      ? (searchParams!.tab as Tab)
      : "products";
  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0];
  const ActiveTabIcon = activeTab.icon;

  const siteSettings = await getSiteSettings();
  let tabContent: ReactNode;

  if (tab === "products") {
    const [categories, products] = await Promise.all([
      listCategories(true),
      listProducts(true),
    ]);
    tabContent = (
      <AdminProductManager initial_categories={categories} initial_products={products} />
    );
  } else if (tab === "inventory") {
    const products = await listProducts(true);
    tabContent = <AdminCardInventory products={products} />;
  } else if (tab === "orders") {
    const products = await listProducts(true);
    tabContent = <AdminOrderList products={products} />;
  } else {
    const [generalSettings, adminUsers] = await Promise.all([
      getInstanceGeneralSettings(),
      listAdminUsers(),
    ]);
    tabContent = (
      <AdminSiteSettings
        initial_settings={siteSettings}
        initial_general_settings={generalSettings}
        initial_users={adminUsers}
      />
    );
  }

  return (
    <div className="admin-shell page-shell flex">
      {/* ── Sidebar（桌面可见，手机和平板隐藏）── */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-56 lg:shrink-0 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white">
        {/* Logo */}
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200/80 px-4 font-bold">
          <span className="brand-mark h-9 w-9 shrink-0">
            {siteSettings.site_logo_url ? (
              <img src={siteSettings.site_logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Store className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm text-slate-950">{siteSettings.site_name}</span>
            <span className="block text-xs font-semibold text-slate-500">@{currentUser.username}</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="touch-scroll flex-1 space-y-1 overflow-y-auto p-3" aria-label="后台主导航">
          {TABS.map(({ key, title, icon: Icon }) => (
            <Link
              key={key}
              href={`/admin?tab=${key}`}
              aria-current={tab === key ? "page" : undefined}
              className={`relative flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
                tab === key
                  ? "bg-sky-50 text-sky-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              {tab === key ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-sky-600" /> : null}
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
              {title}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="space-y-1 border-t border-slate-200/80 p-3">
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-slate-500 hover:bg-sky-50 hover:text-sky-700"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            查看前台
          </Link>
          <AdminLogoutButton className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-slate-500 hover:bg-sky-50 hover:text-sky-700" />
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="min-w-0 flex-1 px-3 py-3 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-4 lg:px-5 lg:py-5 lg:pb-6 xl:px-6">
        <div className="mx-auto w-full max-w-[1720px]">
          {/* Page title */}
          <div className="mb-3 flex min-h-10 items-center justify-between gap-3 sm:mb-4">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-sky-100 bg-sky-50 text-sky-700 sm:h-9 sm:w-9">
                  <ActiveTabIcon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-bold text-slate-950 sm:text-xl">{activeTab.title}</h1>
                  <p className="mt-0.5 hidden truncate text-xs text-slate-500 sm:block">
                    {activeTab.description}
                  </p>
                </div>
              </div>
            </div>
            {/* 手机端顶部快捷入口 */}
            <div className="flex shrink-0 items-center gap-2 lg:hidden">
              <Link
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="在新窗口查看前台"
                title="查看前台"
                className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Link>
              <AdminLogoutButton
                icon_only
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
              />
            </div>
          </div>

          {/* Tab content */}
          {tabContent}
        </div>
      </main>

      {/* ── 手机底部 Tab 栏 ── */}
      <nav className="admin-bottom-nav lg:hidden" aria-label="后台移动导航">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/admin?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={tab === key ? "is-active" : ""}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
