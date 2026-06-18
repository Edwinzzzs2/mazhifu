import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, Store } from "lucide-react";
import { AdminCardInventory } from "@/components/admin-card-inventory";
import { AdminProductManager } from "@/components/admin-product-manager";
import { Button } from "@/components/ui/button";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { listCategories, listProducts } from "@/lib/products";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let authenticated = false;

  try {
    authenticated = isAdminAuthenticated();
  } catch {
    redirect("/admin/login?error=config");
  }

  if (!authenticated) {
    redirect("/admin/login");
  }

  const [categories, products] = await Promise.all([
    listCategories(true),
    listProducts(true),
  ]);

  return (
    <main className="min-h-screen bg-[#eef9ff] text-[#162238]">
      <header className="sticky top-0 z-20 border-b border-sky-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-sky-500 text-white">
              <Store className="h-5 w-5" />
            </span>
            码付小铺后台
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/">查看前台</Link>
            </Button>
            <form action="/api/admin/logout" method="post">
              <Button variant="ghost">
                <LogOut className="h-4 w-4" />
                退出
              </Button>
            </form>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-5">
          <div className="text-sm font-bold text-sky-600">商品上架</div>
          <h1 className="mt-1 text-2xl font-bold">预制商品与库存管理</h1>
          <p className="mt-2 text-sm text-slate-500">
            这里管理前台展示内容；支付确认、订单查询和密钥都仍在服务端。
          </p>
        </div>
        <AdminProductManager initial_categories={categories} initial_products={products} />
        <AdminCardInventory products={products} />
      </section>
    </main>
  );
}
