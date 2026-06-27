"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Grid2X2,
  KeyRound,
  List,
  Mail,
  Minus,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CategoryRecord, ProductRecord } from "@/lib/products";
import type { SiteSettings } from "@/lib/site-settings";

/* ─── Types ──────────────────────────────────────────────── */

type StorefrontProps = {
  categories: CategoryRecord[];
  products: ProductRecord[];
  site_settings: SiteSettings;
  checkout_failed: boolean;
};

type TrackingInfo = {
  out_trade_no: string;
  pay_url: string;
  pay_type: string;
  email: string;
  queryPassword: string;
};

type RemoteOrderStatus = {
  out_trade_no: string;
  product_name: string;
  money: string;
  quantity: number;
  pay_type: string;
  status: "pending" | "paid" | "expired" | "cancelled";
  fulfillment_status: "pending" | "delivered" | "failed";
  delivery_content: string[];
  created_at: string;
  expires_at: string | null;
  paid_at: string | null;
};

type ViewMode = "card" | "table";

/* ─── Main component ─────────────────────────────────────── */

export function Storefront({
  categories,
  products,
  site_settings,
  checkout_failed,
}: StorefrontProps) {
  const [categoryId, setCategoryId] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [tracking, setTracking] = useState<TrackingInfo | null>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [queryPassword, setQueryPassword] = useState("");
  const [payType, setPayType] = useState("alipay");
  const [quantity, setQuantity] = useState(1);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const categoryProducts =
    categoryId === "all"
      ? products
      : products.filter((p) => p.category_id === categoryId);
  const currentCategoryName =
    categoryId === "all"
      ? "全部商品"
      : categories.find((category) => category.id === categoryId)?.name ?? "商品目录";
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredProducts = normalizedSearch
    ? categoryProducts.filter((product) => {
        const searchText = [
          product.name,
          product.subtitle,
          product.description,
          product.badge,
        ].join(" ").toLowerCase();
        return searchText.includes(normalizedSearch);
      })
    : categoryProducts;
  const noticeItems = site_settings.notice_items;

  function openProduct(product: ProductRecord) {
    setSelectedProduct(product);
    setQuantity(1);
    setPayType("alipay");
    setEmail("");
    setQueryPassword("");
    setCheckoutError("");
  }

  function closeDrawer() {
    setSelectedProduct(null);
    setCheckoutError("");
  }

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct) return;
    setCheckingOut(true);
    setCheckoutError("");

    const formData = new FormData();
    formData.append("product_id", selectedProduct.id);
    formData.append("pay_type", payType);
    formData.append("quantity", String(quantity));
    formData.append("contact", email.trim());
    formData.append("query_password", queryPassword);

    try {
      const resp = await fetch("/api/checkout", { method: "POST", body: formData });
      const data = (await resp.json()) as {
        pay_url?: string;
        pay_type?: string;
        out_trade_no?: string;
        access_token?: string;
        message?: string;
      };

      if (!resp.ok || !data.out_trade_no || !data.pay_url) {
        setCheckoutError(data.message ?? "下单失败，请稍后重试");
        return;
      }

      // 新标签打开支付页
      window.open(data.pay_url, "_blank", "noopener");

      // 显示状态追踪弹窗
      setTracking({
        out_trade_no: data.out_trade_no,
        pay_url: data.pay_url,
        pay_type: data.pay_type ?? payType,
        email: email.trim(),
        queryPassword,
      });
      closeDrawer();
    } catch {
      setCheckoutError("网络错误，请检查连接后重试");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div className="page-shell">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:h-16 md:px-6">
          <a href="/" className="flex min-w-0 items-center gap-2.5 font-bold">
            <span className="brand-mark h-8 w-8 md:h-9 md:w-9">
              {site_settings.site_logo_url ? (
                <img
                  src={site_settings.site_logo_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <ShoppingBag className="h-4 w-4 md:h-5 md:w-5" />
              )}
            </span>
            <span className="truncate text-lg md:text-xl">{site_settings.site_name}</span>
          </a>
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <a href="/orders/query">
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">查订单</span>
              </a>
            </Button>
            <Button asChild size="sm" className="shadow-none">
              <a href="/admin">
                <span className="hidden sm:inline">管理后台</span>
                <span className="sm:hidden">后台</span>
              </a>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="border-b border-slate-200/80">
          <div className="mx-auto max-w-7xl px-4 py-7 md:px-6 md:py-10">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-black leading-tight tracking-normal text-slate-950 sm:text-4xl lg:text-5xl">
                {site_settings.site_name}
              </h1>
              <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
                {site_settings.site_description}
              </p>
              {site_settings.announcement ? (
                <div className="soft-banner mt-5 px-4 py-3 text-sm font-semibold leading-6 text-slate-700">
                  {site_settings.announcement}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* ── Notice ── */}
        <section className="border-b border-slate-200/80 bg-white/50">
          <div className="mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-6">
            {checkout_failed && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                下单失败，请检查数据库、商品库存或支付配置。
              </div>
            )}
            <div className="mb-3 flex items-center gap-2 font-bold">
              <ShieldCheck className="h-5 w-5 text-sky-500" />
              购买须知
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {noticeItems.map((notice, index) => (
                <div
                  key={notice}
                  className="flex min-h-20 gap-3 rounded-md border border-slate-200 bg-white/95 p-4 text-sm leading-6 shadow-sm"
                >
                  <span className="font-bold text-sky-600">0{index + 1}</span>
                  <span>{notice}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Products ── */}
        <section className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold text-sky-600">
                <PackageCheck className="h-4 w-4" />
                商品目录
              </div>
              <h2 className="mt-1 truncate text-2xl font-black text-slate-950">
                {currentCategoryName}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="grid grid-cols-2 overflow-hidden rounded-md border border-slate-200 bg-white p-1 text-sm font-semibold shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("card");
                    setSearchTerm("");
                  }}
                  className={`inline-flex h-8 items-center justify-center gap-1.5 rounded px-3 transition-colors ${
                    viewMode === "card"
                      ? "bg-sky-600 text-white"
                      : "text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                  }`}
                >
                  <Grid2X2 className="h-4 w-4" />
                  卡片
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`inline-flex h-8 items-center justify-center gap-1.5 rounded px-3 transition-colors ${
                    viewMode === "table"
                      ? "bg-sky-600 text-white"
                      : "text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                  }`}
                >
                  <List className="h-4 w-4" />
                  表格
                </button>
              </div>
            </div>
          </div>

          {/* 手机端：横向滚动分类条；PC端：左侧竖排 */}
          <div className="flex flex-col gap-4 lg:grid lg:items-start lg:gap-5 lg:grid-cols-[220px_1fr]">
            {/* 手机：横向滚动；lg+：竖排侧边栏 */}
            <aside className="lg:sticky lg:top-24">
              {/* 手机横向滚动 */}
              <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
                <button
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                    categoryId === "all"
                      ? "border-sky-600 bg-sky-600 text-white"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                  onClick={() => setCategoryId("all")}
                >
                  全部
                  <span className={`rounded-full px-1.5 text-xs ${
                    categoryId === "all" ? "bg-white/25" : "bg-slate-100"
                  }`}>{products.length}</span>
                </button>
                {categories.map((category) => {
                  const count = products.filter((p) => p.category_id === category.id).length;
                  return (
                    <button
                      key={category.id}
                      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                        categoryId === category.id
                          ? "border-sky-600 bg-sky-600 text-white"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                      onClick={() => setCategoryId(category.id)}
                    >
                      {category.name}
                      <span className={`rounded-full px-1.5 text-xs ${
                        categoryId === category.id ? "bg-white/25" : "bg-slate-100"
                      }`}>{count}</span>
                    </button>
                  );
                })}
              </div>
              {/* PC 竖排 */}
              <div className="admin-panel hidden p-2 lg:block">
                <button
                  className={`category-button ${categoryId === "all" ? "is-active" : ""}`}
                  onClick={() => setCategoryId("all")}
                >
                  <Box className="h-4 w-4" />
                  全部商品
                  <span>{products.length}</span>
                </button>
                {categories.map((category) => {
                  const count = products.filter((p) => p.category_id === category.id).length;
                  return (
                    <button
                      key={category.id}
                      className={`category-button ${categoryId === category.id ? "is-active" : ""}`}
                      onClick={() => setCategoryId(category.id)}
                    >
                      <Box className="h-4 w-4" />
                      {category.name}
                      <span>{count}</span>
                    </button>
                  );
                })}
              </div>
            </aside>

            {viewMode === "card" ? (
              filteredProducts.length ? (
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onOpen={() => openProduct(product)}
                    />
                  ))}
                </div>
              ) : (
                <div className="admin-panel grid min-h-64 place-items-center px-4 py-12 text-center">
                  <div>
                    <ShoppingBag className="mx-auto h-10 w-10 text-sky-400" />
                    <div className="mt-3 text-base font-bold text-slate-800">暂无匹配商品</div>
                    <div className="mt-1 text-sm text-slate-500">请切换分类或清空搜索关键词</div>
                  </div>
                </div>
              )
            ) : (
              <ProductTable
                categoryName={currentCategoryName}
                products={filteredProducts}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onOpen={openProduct}
              />
            )}
          </div>
        </section>
      </main>

      {/* ── Product Drawer ── */}
      {selectedProduct && (
        <>
          {/* Backdrop */}
          <div
            className="product-drawer-backdrop fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-sm"
            onClick={closeDrawer}
          />
          {/* Drawer panel:
               手机端：从底部弹出，圆角，最高 92vh
               PC端：从右侧滑入，最宽 4xl */}
          <div className="product-drawer-panel fixed inset-x-0 bottom-[-1px] z-50 flex h-[min(92dvh,720px)] flex-col rounded-t-lg bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:inset-y-0 sm:inset-x-auto sm:right-0 sm:h-[100dvh] sm:w-full sm:max-w-4xl sm:rounded-none sm:pb-0">
            {/* 手机拖拽把手 */}
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
            {/* Drawer header */}
            <div className="flex shrink-0 items-center justify-between border-b border-sky-100 px-4 py-3 sm:px-5 sm:py-4">
              <div>
                <div className="text-xs font-semibold text-sky-600">商品详情</div>
                <h2 className="mt-0.5 line-clamp-1 text-sm font-bold sm:text-base">{selectedProduct.name}</h2>
              </div>
              <button
                onClick={closeDrawer}
                className="grid h-9 w-9 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {/* Left: product info（仅 lg+ 可见） */}
              <div className="hidden w-[55%] flex-col gap-5 overflow-y-auto border-r border-sky-100 bg-slate-50/50 p-6 lg:flex">
                <div className="overflow-hidden rounded-lg bg-sky-50">
                  {selectedProduct.image_url ? (
                    <img
                      src={selectedProduct.image_url}
                      alt={selectedProduct.name}
                      className="aspect-[16/9] w-full object-cover"
                    />
                  ) : (
                    <div className="grid aspect-[16/9] place-items-center">
                      <ShoppingBag className="h-20 w-20 text-sky-400" strokeWidth={1.3} />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Metric label="已售" value={String(selectedProduct.sold_count)} />
                  <Metric label="现货" value={String(selectedProduct.stock)} accent />
                  <Metric label="单价" value={`¥${Number(selectedProduct.price).toFixed(2)}`} />
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <ShieldCheck className="h-4 w-4 text-sky-500" />
                    使用指南
                  </div>
                  <div className="whitespace-pre-wrap rounded-lg border border-sky-100 bg-white p-4 text-sm leading-7 text-slate-600">
                    {selectedProduct.instructions || selectedProduct.description}
                  </div>
                </div>

                {selectedProduct.features.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedProduct.features.map((feature) => (
                      <div
                        key={feature}
                        className="flex items-center gap-2 rounded-md border border-sky-100 bg-white px-3 py-2.5 text-sm"
                      >
                        <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                        {feature}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: order form */}
              <form
                onSubmit={(e) => { void handleCheckout(e); }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
                  {/* 手机端简要商品信息 */}
                  <div className="flex items-center gap-3 rounded-lg border border-sky-100 bg-sky-50 p-3 lg:hidden">
                    {selectedProduct.image_url ? (
                      <img
                        src={selectedProduct.image_url}
                        alt={selectedProduct.name}
                        className="h-14 w-14 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-sky-100">
                        <ShoppingBag className="h-6 w-6 text-sky-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="line-clamp-1 text-sm font-bold">{selectedProduct.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        库存 {selectedProduct.stock} 件 · ¥{Number(selectedProduct.price).toFixed(2)}/件
                      </div>
                    </div>
                  </div>

                  {/* Email */}
                  <label className="block text-sm font-semibold">
                    联系方式 / 邮箱
                    <span className="ml-1 text-red-500">*</span>
                    <div className="relative mt-1.5">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        required
                        maxLength={120}
                        placeholder="支付成功后用于查询订单"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="form-control pl-9"
                      />
                    </div>
                  </label>

                  {/* Query password */}
                  <label className="block text-sm font-semibold">
                    查单密码
                    <span className="ml-1 text-red-500">*</span>
                    <div className="relative mt-1.5">
                      <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        required
                        minLength={4}
                        maxLength={64}
                        placeholder="自定义密码，用于查询订单状态"
                        value={queryPassword}
                        onChange={(e) => setQueryPassword(e.target.value)}
                        className="form-control pl-9"
                      />
                    </div>
                    <p className="mt-1 text-xs font-normal text-slate-400">
                      请记住此密码，支付后凭邮箱 + 查单密码查看卡密
                    </p>
                  </label>

                  {/* Payment method */}
                  <div>
                    <div className="mb-2 text-sm font-semibold">支付方式</div>
                    <div className="grid grid-cols-2 gap-2">
                      {([["alipay", "支付宝"], ["wxpay", "微信支付"]] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={`payment-choice ${payType === value ? "is-active" : ""}`}
                          onClick={() => setPayType(value)}
                        >
                          <span
                            className={`grid h-6 w-6 place-items-center rounded-md text-xs font-bold ${
                              value === "wxpay"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-sky-50 text-sky-700"
                            }`}
                          >
                            {label.slice(0, 1)}
                          </span>
                          {label}
                          {payType === value && <Check className="ml-auto h-4 w-4" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Error */}
                  {checkoutError && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                      {checkoutError}
                    </div>
                  )}
                </div>

                {/* Sticky footer */}
                <div className="shrink-0 border-t border-sky-100 bg-white p-4 sm:p-5">
                  {/* Quantity + total */}
                  <div className="mb-3 flex items-center justify-between gap-4 sm:mb-4">
                    <div className="flex h-11 items-center overflow-hidden rounded-md border border-sky-200">
                      <button
                        type="button"
                        className="grid h-full w-11 place-items-center hover:bg-sky-50 active:bg-sky-100"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="grid h-full w-11 place-items-center border-x border-sky-200 text-sm font-semibold">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        className="grid h-full w-11 place-items-center hover:bg-sky-50 active:bg-sky-100"
                        onClick={() =>
                          setQuantity((q) => Math.max(1, Math.min(10, selectedProduct.stock, q + 1)))
                        }
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">合计</div>
                      <div className="text-xl font-bold text-sky-500 sm:text-2xl">
                        ¥{(Number(selectedProduct.price) * quantity).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={selectedProduct.stock < 1 || checkingOut}
                    className="h-11 w-full bg-emerald-500 text-sm shadow-none hover:bg-emerald-600"
                  >
                    {checkingOut ? "正在下单…" : "立即下单"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* ── Order Tracking Modal ── */}
      {tracking && (
        <OrderTrackingModal
          info={tracking}
          onClose={() => setTracking(null)}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  onOpen,
}: {
  product: ProductRecord;
  onOpen: () => void;
}) {
  return (
    <button
      className="product-card group text-left"
      onClick={onOpen}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-sky-50 sm:aspect-[16/9]">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full place-items-center bg-[linear-gradient(135deg,#effaff,#dff4ff)]">
            <ShoppingBag className="h-10 w-10 text-sky-400 sm:h-12 sm:w-12" strokeWidth={1.4} />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="line-clamp-2 min-h-9 text-[13px] font-bold leading-[18px] text-slate-950 sm:min-h-10 sm:text-[15px] sm:leading-5">
            {product.name}
          </h2>
          {product.badge ? (
            <span className="shrink-0 rounded-md bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-600">
              {product.badge}
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-slate-500 sm:text-[13px]">
          {product.subtitle || product.description}
        </p>
        <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-2.5">
          <div>
            <span className="text-xs text-sky-500">¥</span>
            <span className="text-xl font-bold text-sky-500">
              {Number(product.price).toFixed(2)}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1" />
        </div>
        <div className="mt-2 rounded border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[12px] font-semibold text-slate-500">
          库存 {product.stock}
        </div>
      </div>
    </button>
  );
}

function ProductTable({
  categoryName,
  products,
  searchTerm,
  onSearchChange,
  onOpen,
}: {
  categoryName: string;
  products: ProductRecord[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onOpen: (product: ProductRecord) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_14px_38px_rgba(15,23,42,0.055)]">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-semibold text-slate-500">商品列表</div>
          <h2 className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl">
            {categoryName}
          </h2>
        </div>
        <label className="relative w-full lg:max-w-sm">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-10 w-full rounded-full border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索商品关键词"
          />
        </label>
      </div>

      <div className="p-3 sm:p-4">
        <div className="hidden rounded-t-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500 md:grid md:grid-cols-[minmax(0,1fr)_96px_80px_112px]">
          <div>商品</div>
          <div className="text-center">价格</div>
          <div className="text-center">库存</div>
          <div className="text-right">操作</div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 md:rounded-t-none md:border-t-0">
          {products.length ? (
            <div className="divide-y divide-slate-100">
              {products.map((product) => (
                <article
                  key={product.id}
                  className="grid gap-3 bg-white px-3 py-3.5 transition hover:bg-slate-50 sm:px-4 md:grid-cols-[minmax(0,1fr)_96px_80px_112px] md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-sky-50 text-sky-500 ring-1 ring-sky-100">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <ShoppingBag className="h-6 w-6" strokeWidth={1.6} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpen(product)}
                        className="line-clamp-2 text-left text-[15px] font-bold leading-5 text-slate-950 hover:text-sky-600"
                      >
                        {product.name}
                      </button>
                      <p className="mt-1 line-clamp-1 text-[13px] text-slate-500">
                        {product.subtitle || product.description || "自动发货商品"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {product.stock > 0 ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            自动发货
                          </span>
                        ) : null}
                        {product.badge ? (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                            {product.badge}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 md:block md:bg-transparent md:px-0 md:py-0 md:text-center">
                    <span className="text-xs font-semibold text-slate-400 md:hidden">价格</span>
                    <span className="text-base font-bold text-slate-950">¥{Number(product.price).toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500 md:block md:bg-transparent md:px-0 md:py-0 md:text-center">
                    <span className="text-xs font-semibold text-slate-400 md:hidden">库存</span>
                    <span>{product.stock}</span>
                  </div>

                  <Button
                    type="button"
                    onClick={() => onOpen(product)}
                    disabled={product.stock < 1}
                    className="h-10 w-full bg-sky-600 text-sm text-white shadow-none hover:bg-sky-700 active:bg-sky-800 disabled:bg-slate-200 disabled:text-slate-400 md:ml-auto md:w-24"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    购买
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <div className="bg-white px-4 py-12 text-center text-sm text-slate-400">
              暂无匹配商品
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Order Tracking Modal ───────────────────────────────── */

function OrderTrackingModal({
  info,
  onClose,
}: {
  info: TrackingInfo;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<RemoteOrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const stopRef = useRef(false);
  const fetchingRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    if (fetchingRef.current) return;  // 上一个还没返回，跳过
    fetchingRef.current = true;
    try {
      const url = `/api/orders/${encodeURIComponent(info.out_trade_no)}/status?contactinfo=${encodeURIComponent(info.email)}&queryPassword=${encodeURIComponent(info.queryPassword)}`;
      const resp = await fetch(url, { cache: "no-store" });
      if (resp.ok) {
        const data = (await resp.json()) as RemoteOrderStatus;
        setOrder(data);
        // 终态：停止后续轮询
        if (
          (data.status === "paid" && data.fulfillment_status === "delivered") ||
          data.status === "expired" ||
          data.status === "cancelled"
        ) {
          stopRef.current = true;
        }
      }
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [info]);

  useEffect(() => {
    stopRef.current = false;
    // 立即查一次
    void fetchStatus();
    // 之后每 5 秒查一次
    const timer = window.setInterval(() => {
      if (!stopRef.current) {
        void fetchStatus();
      }
    }, 5000);
    return () => {
      stopRef.current = true;
      window.clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.out_trade_no]);

  const paid = order?.status === "paid";
  // 服务端状态 + 前端本地时间双重判断过期
  const serverExpired = order?.status === "expired" || order?.status === "cancelled";
  const localExpired = !paid && order?.expires_at ? new Date(order.expires_at).getTime() <= Date.now() : false;
  const expired = serverExpired || localExpired;
  const delivered = paid && order?.fulfillment_status === "delivered";

  async function copyAll() {
    if (!order?.delivery_content.length) return;
    await navigator.clipboard.writeText(order.delivery_content.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function exportTxt() {
    if (!order?.delivery_content.length) return;
    const blob = new Blob([order.delivery_content.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `卡密-${info.out_trade_no}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg overflow-y-auto rounded-t-lg border border-sky-100 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-lg" style={{maxHeight: '90dvh'}}>
        {/* Modal header */}
        <div className="flex items-start justify-between border-b border-sky-100 px-5 py-4">
          <div>
            <div className="text-xs font-semibold text-sky-600">
              订单状态追踪
            </div>
            <div className="mt-0.5 font-mono text-xs text-slate-400">{info.out_trade_no}</div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal body */}
        <div className="p-5">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400">正在查询订单状态…</div>
          ) : !order ? (
            <div className="py-8 text-center text-sm text-red-500">
              查询失败，请确认邮箱和查单密码是否正确
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status icon */}
              <div
                className={`flex flex-col items-center rounded-xl py-6 ${
                  paid
                    ? "bg-emerald-50"
                    : expired
                      ? "bg-amber-50"
                      : "bg-sky-50"
                }`}
              >
                {paid ? (
                  <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                ) : expired ? (
                  <XCircle className="h-12 w-12 text-amber-500" />
                ) : (
                  <Clock3 className="h-12 w-12 animate-pulse text-sky-400" />
                )}
                <div className="mt-3 text-lg font-bold">
                  {delivered
                    ? "支付成功，已发货"
                    : paid
                      ? "支付成功，未发货"
                      : expired
                        ? "订单已过期"
                        : "等待支付中…"}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {delivered
                    ? "卡密已生成，请及时保存"
                    : paid
                      ? "已到账，库存不足时请联系补发"
                      : expired
                        ? "该订单已超时关闭，请返回重新下单"
                        : "我们正在等待您的支付确认"}
                </div>
              </div>

              {/* Order info */}
              <dl className="grid gap-2 rounded-lg border border-sky-100 p-4 text-sm">
                <InfoRow label="购买商品" value={order.product_name} />
                <InfoRow label="实付金额" value={`¥${order.money}`} accent />
                <InfoRow
                  label="下单时间"
                  value={new Date(order.created_at).toLocaleString("zh-CN")}
                />
              </dl>

              {/* Pay button (when pending, not expired) */}
              {!paid && !expired && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() =>
                      window.open(info.pay_url, "_blank", "noopener")
                    }
                    className={`flex w-full items-center justify-center gap-2 rounded-lg border py-3.5 text-sm font-semibold transition-colors ${
                      info.pay_type === "wxpay"
                        ? "border-emerald-400 bg-emerald-500 text-white hover:bg-emerald-600"
                        : "border-sky-400 bg-sky-500 text-white hover:bg-sky-600"
                    }`}
                  >
                    <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-xs">
                      {info.pay_type === "wxpay" ? "微信" : "支付宝"}
                    </span>
                    {info.pay_type === "wxpay" ? "微信支付" : "支付宝支付"}
                    <span className="ml-1 rounded-full bg-white/25 px-2 py-0.5 text-xs">
                      点击打开付款
                    </span>
                  </button>
                  <p className="text-center text-xs text-slate-400">
                    需要切换支付方式？请关闭此弹窗重新下单
                  </p>
                </div>
              )}


              {/* Card secrets (when delivered) */}
              {delivered && order.delivery_content.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <KeyRound className="h-4 w-4" />
                    卡密信息
                    <span className="ml-auto text-xs font-normal text-emerald-600">
                      格式 账号----密码
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {order.delivery_content.map((secret, i) => (
                      <div
                        key={i}
                        className="rounded-md bg-white px-3 py-2.5 font-mono text-sm break-all text-slate-800"
                      >
                        {secret}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { void copyAll(); }}
                      className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      <Copy className="h-4 w-4" />
                      {copied ? "已复制" : "复制全部"}
                    </button>
                    <button
                      type="button"
                      onClick={exportTxt}
                      className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      <Download className="h-4 w-4" />
                      导出 TXT
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────── */

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-sky-100 bg-sky-50/60 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 font-bold ${accent ? "text-emerald-500" : ""}`}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-sky-100 pb-2 last:border-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`break-all text-right font-semibold ${accent ? "text-sky-600" : ""}`}>{value}</dd>
    </div>
  );
}
