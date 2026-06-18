import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ClipboardList,
  ExternalLink,
  LogOut,
  Package,
  Store,
  Warehouse,
} from "lucide-react";
import { AdminCardInventory } from "@/components/admin-card-inventory";
import { AdminOrderList } from "@/components/admin-order-list";
import { AdminProductManager } from "@/components/admin-product-manager";
import { Button } from "@/components/ui/button";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { listCategories, listProducts } from "@/lib/products";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "products", label: "商品管理", icon: Package },
  { key: "inventory", label: "库存管理", icon: Warehouse },
  { key: "orders", label: "订单管理", icon: ClipboardList },
] as const;

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

  const [categories, products] = await Promise.all([
    listCategories(true),
    listProducts(true),
  ]);

  return (
    <div className="flex min-h-screen bg-[#eef9ff] text-[#162238]">
      {/* ── Sidebar ── */}
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-sky-100 bg-white">
        {/* Logo */}
        <div className="flex h-16 items-center gap-2.5 border-b border-sky-100 px-4 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-sky-500 text-white">
            <Store className="h-4 w-4" />
          </span>
          <span>码付小铺后台</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 p-2">
          {TABS.map(({ key, label, icon: Icon }) => (
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
              {label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="space-y-1 border-t border-sky-100 p-2">
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
      <main className="min-w-0 flex-1 px-6 py-6">
        {/* Page title */}
        <div className="mb-6">
          {TABS.map(({ key, label, icon: Icon }) =>
            tab === key ? (
              <div key={key} className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-sky-500" />
                <h1 className="text-xl font-bold">{label}</h1>
              </div>
            ) : null,
          )}
        </div>

        {/* Tab content */}
        {tab === "products" && (
          <AdminProductManager initial_categories={categories} initial_products={products} />
        )}
        {tab === "inventory" && <AdminCardInventory products={products} />}
        {tab === "orders" && <AdminOrderList />}
      </main>
    </div>
  );
}
