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

/* ─── Types ──────────────────────────────────────────────── */

type StorefrontProps = {
  categories: CategoryRecord[];
  products: ProductRecord[];
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

/* ─── Main component ─────────────────────────────────────── */

export function Storefront({ categories, products, checkout_failed }: StorefrontProps) {
  const [categoryId, setCategoryId] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [tracking, setTracking] = useState<TrackingInfo | null>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [queryPassword, setQueryPassword] = useState("");
  const [payType, setPayType] = useState("alipay");
  const [quantity, setQuantity] = useState(1);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const filteredProducts =
    categoryId === "all"
      ? products
      : products.filter((p) => p.category_id === categoryId);

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
    <div className="min-h-screen bg-[#eef9ff] text-[#162238]">
      {/* ── Header ── */}
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
        {/* ── Notice ── */}
        <section className="border-b border-sky-100 bg-[#e7f6ff]">
          <div className="mx-auto max-w-7xl px-4 py-7 md:px-6">
            <div className="mb-4 flex items-center gap-2 font-bold">
              <ShieldCheck className="h-5 w-5 text-sky-500" />
              购买须知
            </div>
            {checkout_failed && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                下单失败，请检查数据库、商品库存或支付配置。
              </div>
            )}
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

        {/* ── Products ── */}
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
                    {product.badge && (
                      <span className="absolute left-3 top-3 rounded bg-rose-500 px-2 py-1 text-xs font-bold text-white">
                        {product.badge}
                      </span>
                    )}
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

      {/* ── Product Drawer ── */}
      {selectedProduct && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm"
            onClick={closeDrawer}
          />
          {/* Drawer panel */}
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-4xl flex-col bg-white shadow-2xl">
            {/* Drawer header */}
            <div className="flex shrink-0 items-center justify-between border-b border-sky-100 px-5 py-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-sky-500">商品详情</div>
                <h2 className="mt-0.5 text-lg font-bold line-clamp-1">{selectedProduct.name}</h2>
              </div>
              <button
                onClick={closeDrawer}
                className="grid h-9 w-9 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left: product info */}
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
                className="flex flex-1 flex-col overflow-y-auto"
              >
                <div className="flex-1 space-y-4 p-5">
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
                          <span className="text-sm">{label === "支付宝" ? "🔵" : "🟢"}</span>
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
                <div className="shrink-0 border-t border-sky-100 bg-white p-5">
                  {/* Quantity + total */}
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div className="flex h-10 items-center overflow-hidden rounded-md border border-sky-200">
                      <button
                        type="button"
                        className="grid h-full w-10 place-items-center hover:bg-sky-50"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="grid h-full w-10 place-items-center border-x border-sky-200 text-sm font-semibold">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        className="grid h-full w-10 place-items-center hover:bg-sky-50"
                        onClick={() =>
                          setQuantity((q) => Math.max(1, Math.min(10, selectedProduct.stock, q + 1)))
                        }
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">合计</div>
                      <div className="text-2xl font-bold text-sky-500">
                        ¥{(Number(selectedProduct.price) * quantity).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={selectedProduct.stock < 1 || checkingOut}
                    className="w-full bg-emerald-500 shadow-none hover:bg-emerald-600"
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-sky-100 bg-white shadow-2xl">
        {/* Modal header */}
        <div className="flex items-start justify-between border-b border-sky-100 px-5 py-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-sky-600">
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
                    <span>{info.pay_type === "wxpay" ? "🟢" : "🔵"}</span>
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
