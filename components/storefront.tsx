"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Check,
  ChevronRight,
  CreditCard,
  Grid2X2,
  Minus,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CategoryRecord, ProductRecord } from "@/lib/products";

type StorefrontProps = {
  categories: CategoryRecord[];
  products: ProductRecord[];
  checkout_failed: boolean;
};

export function Storefront({ categories, products, checkout_failed }: StorefrontProps) {
  const [categoryId, setCategoryId] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [payType, setPayType] = useState("alipay");

  const filteredProducts = useMemo(
    () =>
      categoryId === "all"
        ? products
        : products.filter((product) => product.category_id === categoryId),
    [categoryId, products],
  );

  function openProduct(product: ProductRecord) {
    setSelectedProduct(product);
    setQuantity(1);
    setPayType("alipay");
  }

  return (
    <div className="min-h-screen bg-[#eef9ff] text-[#162238]">
      <header className="sticky top-0 z-30 border-b border-sky-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
          <a href="/" className="flex items-center gap-2 font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-sky-500 text-white">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <span className="text-xl">码付小铺</span>
          </a>
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost">
              <a href="/orders/query">
                <Search className="h-4 w-4" />
                查订单
              </a>
            </Button>
            <Button asChild className="shadow-none">
              <a href="/admin">管理后台</a>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="border-b border-sky-100 bg-[#e7f6ff]">
          <div className="mx-auto max-w-7xl px-4 py-7 md:px-6">
            <div className="mb-4 flex items-center gap-2 font-bold">
              <ShieldCheck className="h-5 w-5 text-sky-500" />
              购买须知
            </div>
            {checkout_failed ? (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                下单失败，请检查数据库、商品库存或支付配置。
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {[
                "本站商品用于合法业务测试，请按商品说明购买。",
                "支付状态由服务端验签确认，页面跳转不代表到账。",
                "订单有效期内完成支付，超时后请重新下单。",
                "遇到问题请保留订单号，切勿泄露订单访问链接。",
              ].map((notice, index) => (
                <div
                  key={notice}
                  className="flex min-h-20 gap-3 rounded-md border border-sky-100 bg-white p-4 text-sm leading-6"
                >
                  <span className="font-bold text-sky-500">0{index + 1}</span>
                  <span>{notice}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-7 md:px-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold">
              <PackageCheck className="h-5 w-5 text-sky-500" />
              商品分组
            </div>
            <div className="flex items-center gap-2 rounded-md border border-sky-100 bg-white px-3 py-2 text-sm">
              <Grid2X2 className="h-4 w-4 text-sky-500" />
              {filteredProducts.length} 件商品
            </div>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[220px_1fr]">
            <aside className="rounded-md border border-sky-100 bg-white p-2 lg:sticky lg:top-24">
              <button
                className={`category-button ${categoryId === "all" ? "is-active" : ""}`}
                onClick={() => setCategoryId("all")}
              >
                <Box className="h-4 w-4" />
                全部商品
                <span>{products.length}</span>
              </button>
              {categories.map((category) => {
                const count = products.filter(
                  (product) => product.category_id === category.id,
                ).length;
                return (
                  <button
                    key={category.id}
                    className={`category-button ${
                      categoryId === category.id ? "is-active" : ""
                    }`}
                    onClick={() => setCategoryId(category.id)}
                  >
                    <Box className="h-4 w-4" />
                    {category.name}
                    <span>{count}</span>
                  </button>
                );
              })}
            </aside>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  className="product-card group text-left"
                  onClick={() => openProduct(product)}
                >
                  <div className="relative aspect-[16/9] overflow-hidden bg-sky-50">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="grid h-full place-items-center bg-[linear-gradient(135deg,#effaff,#dff4ff)]">
                        <ShoppingBag className="h-16 w-16 text-sky-400" strokeWidth={1.4} />
                      </div>
                    )}
                    {product.badge ? (
                      <span className="absolute left-3 top-3 rounded bg-rose-500 px-2 py-1 text-xs font-bold text-white">
                        {product.badge}
                      </span>
                    ) : null}
                  </div>
                  <div className="p-4">
                    <h2 className="line-clamp-2 min-h-12 font-bold leading-6">{product.name}</h2>
                    <p className="mt-1 line-clamp-1 text-sm text-slate-500">
                      {product.subtitle || product.description}
                    </p>
                    <div className="mt-4 flex items-end justify-between border-t border-dashed border-sky-100 pt-3">
                      <div>
                        <span className="text-sm text-sky-500">¥</span>
                        <span className="text-2xl font-bold text-sky-500">
                          {Number(product.price).toFixed(2)}
                        </span>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1" />
                    </div>
                    <div className="mt-3 grid grid-cols-2 overflow-hidden rounded border border-slate-100 bg-slate-50 text-center text-xs text-slate-500">
                      <span className="py-2">库存 {product.stock}</span>
                      <span className="border-l border-slate-100 py-2">已售 {product.sold_count}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>

      {selectedProduct ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-3 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-sky-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-sky-100 px-5 py-4">
              <div>
                <div className="text-xs font-bold uppercase text-sky-500">商品详情</div>
                <h2 className="mt-1 text-xl font-bold">{selectedProduct.name}</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="关闭商品详情"
                onClick={() => setSelectedProduct(null)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="grid lg:grid-cols-[380px_1fr]">
              <form action="/api/checkout" method="post" className="space-y-5 p-5">
                <input type="hidden" name="product_id" value={selectedProduct.id} />
                <input type="hidden" name="pay_type" value={payType} />
                <input type="hidden" name="quantity" value={quantity} />

                <div className="aspect-[16/9] overflow-hidden rounded-md bg-sky-50">
                  {selectedProduct.image_url ? (
                    <img
                      src={selectedProduct.image_url}
                      alt={selectedProduct.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center">
                      <ShoppingBag className="h-20 w-20 text-sky-400" strokeWidth={1.3} />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Metric label="已售" value={String(selectedProduct.sold_count)} />
                  <Metric label="现货" value={String(selectedProduct.stock)} accent />
                  <Metric label="单价" value={`¥${Number(selectedProduct.price).toFixed(2)}`} />
                </div>

                <label className="block text-sm font-semibold">
                  联系方式
                  <input
                    name="contact"
                    maxLength={120}
                    placeholder="手机号或邮箱（选填）"
                    className="form-control mt-2"
                  />
                </label>

                <div>
                  <div className="mb-2 text-sm font-semibold">支付方式</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["alipay", "支付宝"],
                      ["wxpay", "微信支付"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`payment-choice ${payType === value ? "is-active" : ""}`}
                        onClick={() => setPayType(value)}
                      >
                        <CreditCard className="h-4 w-4" />
                        {label}
                        {payType === value ? <Check className="ml-auto h-4 w-4" /> : null}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-sky-100 pt-4">
                  <div className="flex h-11 items-center overflow-hidden rounded-md border border-sky-200">
                    <button
                      type="button"
                      className="grid h-full w-11 place-items-center hover:bg-sky-50"
                      onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="grid h-full w-12 place-items-center border-x border-sky-200">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      className="grid h-full w-11 place-items-center hover:bg-sky-50"
                      onClick={() =>
                        setQuantity((current) =>
                          Math.max(1, Math.min(10, selectedProduct.stock, current + 1)),
                        )
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">合计</div>
                    <div className="text-2xl font-bold text-sky-500">
                      ¥{(Number(selectedProduct.price) * quantity).toFixed(2)}
                    </div>
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={selectedProduct.stock < 1}
                    className="flex-1 bg-emerald-500 shadow-none hover:bg-emerald-600"
                  >
                    立即下单
                  </Button>
                </div>
              </form>

              <div className="border-t border-sky-100 bg-slate-50/60 p-5 lg:border-l lg:border-t-0">
                <div className="mb-4 flex items-center gap-2 font-bold">
                  <ShieldCheck className="h-5 w-5 text-sky-500" />
                  使用指南
                </div>
                <div className="min-h-52 whitespace-pre-wrap rounded-md border border-sky-100 bg-white p-5 text-sm leading-7 text-slate-600">
                  {selectedProduct.instructions || selectedProduct.description}
                </div>
                {selectedProduct.features.length ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {selectedProduct.features.map((feature) => (
                      <div
                        key={feature}
                        className="flex items-center gap-2 rounded-md border border-sky-100 bg-white px-3 py-3 text-sm"
                      >
                        <Check className="h-4 w-4 text-emerald-500" />
                        {feature}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-sky-100 bg-sky-50/60 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 font-bold ${accent ? "text-emerald-500" : ""}`}>{value}</div>
    </div>
  );
}
