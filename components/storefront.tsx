"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Grid2X2,
  KeyRound,
  List,
  Mail,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SupportContact } from "@/components/support-contact";
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
type SortMode = "default" | "price_asc" | "price_desc" | "sales_desc" | "newest";

const UNCATEGORIZED_ID = "uncategorized";

/* ─── Main component ─────────────────────────────────────── */

export function Storefront({
  categories,
  products,
  site_settings,
  checkout_failed,
}: StorefrontProps) {
  const [categoryId, setCategoryId] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [sortMode, setSortMode] = useState<SortMode>("default");
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

  const defaultProductOrder = useMemo(
    () => new Map(products.map((product, index) => [product.id, index])),
    [products],
  );
  const availableCategories = useMemo(
    () => categories
      .map((category) => ({
        ...category,
        productCount: products.filter((product) => product.category_id === category.id).length,
      }))
      .filter((category) => category.productCount > 0),
    [categories, products],
  );
  const uncategorizedCount = useMemo(
    () => products.filter((product) => product.category_id === null).length,
    [products],
  );
  const currentCategoryName = categoryId === "all"
    ? "全部商品"
    : categoryId === UNCATEGORIZED_ID
      ? "未分类商品"
      : categories.find((category) => category.id === categoryId)?.name ?? "全部商品";
  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const result = products.filter((product) => {
      const categoryMatches = categoryId === "all"
        || (categoryId === UNCATEGORIZED_ID
          ? product.category_id === null
          : product.category_id === categoryId);
      if (!categoryMatches) return false;
      if (!normalizedSearch) return true;

      return [
        product.name,
        product.subtitle,
        product.description,
        product.badge,
        product.category_name ?? "",
      ].join(" ").toLowerCase().includes(normalizedSearch);
    });

    const fallback = (left: ProductRecord, right: ProductRecord) =>
      (defaultProductOrder.get(left.id) ?? 0) - (defaultProductOrder.get(right.id) ?? 0);
    return [...result].sort((left, right) => {
      if (sortMode === "default") return fallback(left, right);
      if (sortMode === "price_asc") {
        return Number(left.price) - Number(right.price) || fallback(left, right);
      }
      if (sortMode === "price_desc") {
        return Number(right.price) - Number(left.price) || fallback(left, right);
      }
      if (sortMode === "sales_desc") {
        return right.sold_count - left.sold_count || fallback(left, right);
      }
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
        || fallback(left, right);
    });
  }, [categoryId, defaultProductOrder, products, searchTerm, sortMode]);
  const noticeItems = useMemo(
    () => Array.from(new Set(site_settings.notice_items.map((notice) => notice.trim())))
      .filter((notice) => notice && notice !== site_settings.announcement),
    [site_settings.announcement, site_settings.notice_items],
  );
  const hasActiveFilters = categoryId !== "all"
    || searchTerm.trim().length > 0
    || sortMode !== "default";

  function clearFilters() {
    setCategoryId("all");
    setSearchTerm("");
    setSortMode("default");
  }

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
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-4 md:h-16 md:px-6">
          <a href="/" className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden font-bold sm:gap-2.5">
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
            <span className="min-w-0">
              <span className="block truncate text-base leading-5 sm:text-lg md:text-xl">
                {site_settings.site_name}
              </span>
              <span className="hidden max-w-sm truncate text-xs font-medium leading-5 text-slate-500 md:block">
                {site_settings.site_description}
              </span>
            </span>
          </a>
          <nav className="ml-2 flex shrink-0 items-center gap-0.5 sm:gap-1">
            <SupportContact
              contact_email={site_settings.contact_email}
              contact_text={site_settings.contact_text}
            />
            <Button asChild variant="ghost" size="sm" className="h-9 w-9 px-0 md:w-auto md:px-3">
              <a href="/orders/query" aria-label="查询订单">
                <Search className="h-4 w-4" />
                <span className="hidden md:inline">查订单</span>
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 px-2.5 shadow-none md:px-3">
              <a href="/admin">
                <span className="hidden md:inline">管理后台</span>
                <span className="md:hidden">后台</span>
              </a>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {checkout_failed || site_settings.announcement || noticeItems.length > 0 ? (
          <section className="border-b border-slate-200/80 bg-white/45">
            <div className="mx-auto max-w-7xl space-y-2.5 px-3 py-2.5 sm:px-4 sm:py-3 md:px-6 md:py-4">
              {checkout_failed ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  下单失败，请检查数据库、商品库存或支付配置。
                </div>
              ) : null}

              {site_settings.announcement ? (
                <div className="soft-banner px-4 py-2.5 text-sm font-semibold leading-6 text-slate-700">
                  {site_settings.announcement}
                </div>
              ) : null}

              {noticeItems.length > 0 ? (
                <div className="flex items-start gap-2.5 text-[13px] leading-5 text-slate-600 sm:gap-3 sm:text-sm sm:leading-6">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <div className="grid min-w-0 flex-1 gap-0.5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-4">
                    <span className="shrink-0 font-bold text-slate-800">购买须知</span>
                    <div className="grid min-w-0 gap-x-8 gap-y-0.5 sm:grid-cols-2 sm:gap-y-1">
                      {noticeItems.map((notice) => (
                        <span key={notice} className="min-w-0 [overflow-wrap:anywhere]">{notice}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-5 md:px-6 md:py-7">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2.5">
                  <h1 className="truncate text-xl font-black text-slate-950 sm:text-2xl">
                    {currentCategoryName}
                  </h1>
                  <span
                    className="shrink-0 text-sm font-medium tabular-nums text-slate-400"
                    aria-live="polite"
                  >
                    {filteredProducts.length} 件
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] leading-5 text-slate-500 md:hidden sm:mt-1 sm:text-sm sm:leading-6">
                  {site_settings.site_description}
                </p>
              </div>

              <div className="grid w-full grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:items-center lg:w-auto">
                <label className="relative col-span-full min-w-0 sm:w-56 sm:flex-none">
                  <span className="sr-only">搜索商品</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="搜索商品"
                    className="bg-white pl-9"
                  />
                </label>
                <div className="min-w-0 sm:hidden">
                  <NativeSelect
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                    aria-label="商品分类"
                  >
                    <option value="all">全部分类（{products.length}）</option>
                    {availableCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}（{category.productCount}）
                      </option>
                    ))}
                    {uncategorizedCount > 0 ? (
                      <option value={UNCATEGORIZED_ID}>未分类（{uncategorizedCount}）</option>
                    ) : null}
                  </NativeSelect>
                </div>
                <div className="min-w-0 sm:w-40 sm:shrink-0">
                  <NativeSelect
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as SortMode)}
                    aria-label="商品排序"
                  >
                    <option value="default">默认排序</option>
                    <option value="price_asc">价格从低到高</option>
                    <option value="price_desc">价格从高到低</option>
                    <option value="sales_desc">销量优先</option>
                    <option value="newest">创建时间从新到旧</option>
                  </NativeSelect>
                </div>
                <div
                  className="hidden shrink-0 rounded-md border border-slate-200 bg-white p-1 shadow-sm sm:inline-flex"
                  role="group"
                  aria-label="商品展示方式"
                >
                  <Button
                    type="button"
                    size="icon"
                    variant={viewMode === "card" ? "default" : "ghost"}
                    className={viewMode === "card"
                      ? "h-10 w-10 bg-sky-700 shadow-none hover:bg-sky-800 sm:h-8 sm:w-8"
                      : "h-10 w-10 shadow-none sm:h-8 sm:w-8"}
                    aria-label="卡片视图"
                    aria-pressed={viewMode === "card"}
                    title="卡片视图"
                    onClick={() => setViewMode("card")}
                  >
                    <Grid2X2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant={viewMode === "table" ? "default" : "ghost"}
                    className={viewMode === "table"
                      ? "h-10 w-10 bg-sky-700 shadow-none hover:bg-sky-800 sm:h-8 sm:w-8"
                      : "h-10 w-10 shadow-none sm:h-8 sm:w-8"}
                    aria-label="列表视图"
                    aria-pressed={viewMode === "table"}
                    title="列表视图"
                    onClick={() => setViewMode("table")}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="hidden min-w-0 items-center gap-3 border-t border-slate-200 pt-3 sm:flex">
              <span className="shrink-0 text-xs font-bold text-slate-500">分类</span>
              <div
                className="flex min-w-0 gap-2 overflow-x-auto pb-1"
                role="group"
                aria-label="商品分类"
              >
                <Button
                  type="button"
                  size="sm"
                  variant={categoryId === "all" ? "default" : "outline"}
                  className={categoryId === "all"
                    ? "shrink-0 bg-sky-700 shadow-none hover:bg-sky-800"
                    : "shrink-0 shadow-none"}
                  aria-pressed={categoryId === "all"}
                  onClick={() => setCategoryId("all")}
                >
                  全部
                  <span className="text-xs tabular-nums opacity-70">{products.length}</span>
                </Button>
                {availableCategories.map((category) => (
                  <Button
                    key={category.id}
                    type="button"
                    size="sm"
                    variant={categoryId === category.id ? "default" : "outline"}
                    className={categoryId === category.id
                      ? "shrink-0 bg-sky-700 shadow-none hover:bg-sky-800"
                      : "shrink-0 shadow-none"}
                    aria-pressed={categoryId === category.id}
                    onClick={() => setCategoryId(category.id)}
                  >
                    {category.name}
                    <span className="text-xs tabular-nums opacity-70">
                      {category.productCount}
                    </span>
                  </Button>
                ))}
                {uncategorizedCount > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={categoryId === UNCATEGORIZED_ID ? "default" : "outline"}
                    className={categoryId === UNCATEGORIZED_ID
                      ? "shrink-0 bg-sky-700 shadow-none hover:bg-sky-800"
                      : "shrink-0 shadow-none"}
                    aria-pressed={categoryId === UNCATEGORIZED_ID}
                    onClick={() => setCategoryId(UNCATEGORIZED_ID)}
                  >
                    未分类
                    <span className="text-xs tabular-nums opacity-70">{uncategorizedCount}</span>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-3 sm:mt-5">
            {filteredProducts.length ? (
              viewMode === "card" ? (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onOpen={() => openProduct(product)}
                    />
                  ))}
                </div>
              ) : (
                <ProductTable products={filteredProducts} onOpen={openProduct} />
              )
            ) : (
              <div className="grid min-h-56 place-items-center rounded-md border border-dashed border-slate-300 bg-white/55 px-4 py-12 text-center">
                <div>
                  <ShoppingBag className="mx-auto h-9 w-9 text-sky-400" />
                  <div className="mt-3 text-base font-bold text-slate-800">
                    {hasActiveFilters ? "暂无匹配商品" : "暂无可售商品"}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {hasActiveFilters ? "请调整分类、搜索词或排序条件" : "商品上架后会显示在这里"}
                  </div>
                  {hasActiveFilters ? (
                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                      清除筛选
                    </Button>
                  ) : null}
                </div>
              </div>
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
          <div className="product-drawer-panel fixed inset-x-0 bottom-[-1px] z-50 flex h-[min(92dvh,720px)] flex-col rounded-t-lg bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl lg:inset-y-0 lg:inset-x-auto lg:right-0 lg:h-[100dvh] lg:w-full lg:max-w-4xl lg:rounded-none lg:pb-0">
            {/* 手机拖拽把手 */}
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
            {/* Drawer header */}
            <div className="flex min-w-0 shrink-0 items-center justify-between border-b border-sky-100 px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-sky-600">商品详情</div>
                <h2 className="mt-0.5 line-clamp-1 text-sm font-bold sm:text-base">{selectedProduct.name}</h2>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="关闭商品详情"
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
                <div className="touch-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
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
                        minLength={8}
                        maxLength={64}
                        placeholder="自定义密码，用于查询订单状态"
                        value={queryPassword}
                        onChange={(e) => setQueryPassword(e.target.value)}
                        className="form-control pl-9"
                      />
                    </div>
                    <p className="mt-1 text-xs font-normal text-slate-400">
                      请记住此密码，支付后凭邮箱 + 查单密码查看发货内容
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
    <Card className="product-card">
      <button
        type="button"
        className="group grid min-h-32 w-full grid-cols-[88px_minmax(0,1fr)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:block sm:min-h-0"
        onClick={onOpen}
      >
        <div className={`relative min-h-32 overflow-hidden bg-sky-50 sm:min-h-0 ${product.image_url ? "sm:h-32" : "sm:h-20"}`}>
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 sm:group-hover:scale-[1.02]"
            />
          ) : (
            <div className="grid h-full place-items-center bg-sky-50">
              <ShoppingBag className="h-7 w-7 text-sky-400 sm:h-9 sm:w-9" strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="min-w-0 p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <h3 className="line-clamp-1 min-w-0 text-[15px] font-bold leading-5 text-slate-950 sm:line-clamp-2 sm:min-h-10">
              {product.name}
            </h3>
            {product.badge ? (
              <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
                {product.badge}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500 sm:mt-1 sm:line-clamp-1 sm:text-[13px]">
            {product.subtitle || product.description}
          </p>

          <div className="mt-3 flex items-end justify-between gap-2 sm:mt-4 sm:gap-3 sm:border-t sm:border-slate-100 sm:pt-3">
            <div className="leading-none text-sky-600">
              <span className="mr-0.5 text-xs">¥</span>
              <span className="text-lg font-bold tabular-nums sm:text-xl">
                {Number(product.price).toFixed(2)}
              </span>
            </div>
            <span
              className={`text-xs font-semibold tabular-nums ${
                product.stock > 0 ? "text-slate-500" : "text-rose-600"
              }`}
            >
              {product.stock > 0 ? `库存 ${product.stock}` : "暂时售罄"}
            </span>
          </div>
        </div>
      </button>
    </Card>
  );
}

function ProductTable({
  products,
  onOpen,
}: {
  products: ProductRecord[];
  onOpen: (product: ProductRecord) => void;
}) {
  return (
    <Card className="overflow-hidden bg-white shadow-[0_14px_38px_rgba(15,23,42,0.055)]">
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
                <button
                  type="button"
                  key={product.id}
                  onClick={() => onOpen(product)}
                  aria-label={`${product.name}，${product.stock > 0 ? "购买" : "查看详情"}`}
                  className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-white px-3 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:px-4 md:grid-cols-[minmax(0,1fr)_96px_80px_112px] md:py-3.5"
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
                      <h3 className="line-clamp-2 text-[15px] font-bold leading-5 text-slate-950 group-hover:text-sky-600">
                        {product.name}
                      </h3>
                      <p className="mt-1 line-clamp-1 text-[13px] text-slate-500">
                        {product.subtitle || product.description || "自动发货商品"}
                      </p>
                      <div className="mt-2 hidden flex-wrap gap-1.5 md:flex">
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

                  <div className="text-right md:text-center">
                    <span className="block text-base font-bold tabular-nums text-slate-950">
                      ¥{Number(product.price).toFixed(2)}
                    </span>
                    <span className={`mt-1 block text-xs font-semibold tabular-nums md:hidden ${
                      product.stock > 0 ? "text-slate-500" : "text-rose-600"
                    }`}>
                      {product.stock > 0 ? `库存 ${product.stock}` : "暂时售罄"}
                    </span>
                  </div>

                  <div className={`hidden text-center text-sm font-bold tabular-nums md:block ${
                    product.stock > 0 ? "text-slate-500" : "text-rose-600"
                  }`}>
                    {product.stock}
                  </div>

                  <span className={`ml-auto hidden h-10 w-24 items-center justify-center gap-2 rounded-md text-sm font-semibold md:inline-flex ${
                    product.stock > 0
                      ? "bg-sky-700 text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}>
                    <ShoppingBag className="h-4 w-4" />
                    {product.stock > 0 ? "购买" : "查看"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-white px-4 py-12 text-center text-sm text-slate-400">
              暂无匹配商品
            </div>
          )}
        </div>
      </div>
    </Card>
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
      const url = `/api/orders/${encodeURIComponent(info.out_trade_no)}/status`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: info.email,
          query_password: info.queryPassword,
        }),
        cache: "no-store",
      });
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
    a.download = `发货内容-${info.out_trade_no}.txt`;
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
                    ? "发货内容已生成，请及时保存"
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
                    发货内容
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
