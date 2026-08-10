"use client";

import { useId, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  KeyRound,
  Mail,
  RefreshCw,
  Search,
  SearchX,
  ShieldCheck,
  RotateCcw,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type OrderSummary = {
  out_trade_no: string;
  product_name: string;
  money: string;
  quantity: number;
  status: string;
  fulfillment_status: string;
  delivery_content: string[];
  created_at: string;
  paid_at: string | null;
};

type QueryCredentials = {
  email: string;
  queryPassword: string;
  queryGrant?: string;
};

type QueryResponse = {
  orders?: OrderSummary[];
  total?: number;
  page?: number;
  page_size?: number;
  query_grant?: string;
  legacy_scan_pending?: boolean;
  legacy_scan_cursor?: string | null;
  message?: string;
};

type OrderStatusMeta = {
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badgeClassName: string;
  iconClassName: string;
};

function getOrderStatus(order: OrderSummary): OrderStatusMeta {
  if (order.status === "paid" && order.fulfillment_status === "delivered") {
    return {
      label: "已发货",
      title: "支付成功，发货完成",
      description: "发货内容已经生成，请及时复制或导出保存。",
      icon: CheckCircle2,
      badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
      iconClassName: "bg-emerald-100 text-emerald-700",
    };
  }

  if (order.status === "cancelled") {
    return {
      label: "已取消",
      title: "订单已经取消",
      description: "该订单已关闭，没有可用的发货内容。",
      icon: XCircle,
      badgeClassName: "border-slate-200 bg-slate-100 text-slate-600",
      iconClassName: "bg-slate-200 text-slate-600",
    };
  }

  if (order.status === "expired") {
    return {
      label: "已过期",
      title: "订单已经过期",
      description: "该订单已超过支付时间，没有可用的发货内容。",
      icon: Clock3,
      badgeClassName: "border-slate-200 bg-slate-100 text-slate-600",
      iconClassName: "bg-slate-200 text-slate-600",
    };
  }

  if (order.status === "paid" && order.fulfillment_status === "failed") {
    return {
      label: "发货失败",
      title: "支付成功，暂待补货",
      description: "当前库存暂时不足，补货后可重新尝试发货。",
      icon: AlertCircle,
      badgeClassName: "border-red-200 bg-red-50 text-red-700",
      iconClassName: "bg-red-100 text-red-700",
    };
  }

  if (order.status === "paid" && order.fulfillment_status === "pending") {
    return {
      label: "待发货",
      title: "支付成功，自动发货中",
      description: "系统正在分配库存，请稍后刷新订单状态。",
      icon: Clock3,
      badgeClassName: "border-sky-200 bg-sky-50 text-sky-700",
      iconClassName: "bg-sky-100 text-sky-700",
    };
  }

  if (order.status === "pending") {
    return {
      label: "待支付",
      title: "订单等待支付",
      description: "支付完成后，系统会自动生成发货内容。",
      icon: Clock3,
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
      iconClassName: "bg-amber-100 text-amber-700",
    };
  }

  return {
    label: "待确认",
    title: "订单状态待确认",
    description: "请稍后刷新订单状态。",
    icon: XCircle,
    badgeClassName: "border-slate-200 bg-slate-100 text-slate-600",
    iconClassName: "bg-slate-200 text-slate-600",
  };
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function OrderResult({
  order,
  queryCredentials,
  onOrderUpdate,
}: {
  order: OrderSummary;
  queryCredentials: QueryCredentials;
  onOrderUpdate: (order: OrderSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const delivered = order.status === "paid" && order.fulfillment_status === "delivered";
  const closed = order.status === "expired" || order.status === "cancelled";
  const deliveryText = order.delivery_content.join("\n");
  const status = getOrderStatus(order);
  const StatusIcon = status.icon;
  const detailId = useId();

  async function copyDeliveryContent() {
    if (!deliveryText) return;

    try {
      await navigator.clipboard.writeText(deliveryText);
      toast.success("发货内容已复制");
    } catch {
      toast.error("复制失败，请选中文本后手动复制");
    }
  }

  function exportDeliveryContent() {
    if (!deliveryText) return;

    const blob = new Blob([deliveryText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `发货内容-${order.out_trade_no}.txt`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    toast.success("发货内容已导出");
  }

  async function refreshOrder() {
    if (closed || refreshing) return;

    setRefreshing(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.out_trade_no)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: queryCredentials.email,
          query_password: queryCredentials.queryPassword,
        }),
        cache: "no-store",
      });
      const data = (await response.json()) as Partial<OrderSummary> & { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "order_refresh_failed");
      }

      const nextOrder = {
        ...order,
        status: data.status ?? order.status,
        fulfillment_status: data.fulfillment_status ?? order.fulfillment_status,
        delivery_content: data.delivery_content ?? order.delivery_content,
        paid_at: data.paid_at ?? order.paid_at,
      };
      onOrderUpdate(nextOrder);
      toast.success(nextOrder.fulfillment_status === "delivered" ? "发货已完成" : "订单状态已刷新");
    } catch {
      toast.error("刷新失败，请稍后重试");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <article className="border-b border-slate-200 last:border-b-0">
      <div className="group relative cursor-pointer px-3 py-4 transition hover:bg-slate-50/80 sm:px-5 sm:py-5">
        <button
          type="button"
          className="absolute inset-0 rounded-none text-left outline-none ring-inset focus-visible:ring-2 focus-visible:ring-sky-500 active:bg-slate-100/70"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sr-only">
            {open ? `收起 ${order.product_name} 订单详情` : `展开 ${order.product_name} 订单详情`}
          </span>
        </button>

        <div className="pointer-events-none relative flex items-start gap-3 sm:gap-4">
          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md ${status.iconClassName}`}>
            <StatusIcon className="h-4 w-4" aria-hidden="true" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`rounded-md px-2 py-0.5 ${status.badgeClassName}`}>
                {status.label}
              </Badge>
              <span className="font-mono text-[11px] text-slate-500 sm:text-xs">
                #{order.out_trade_no.slice(-8).toUpperCase()}
              </span>
            </div>

            <div className="mt-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-base font-bold leading-6 text-slate-950 sm:text-lg">
                  {order.product_name}
                </h3>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">{status.title}</p>
              </div>
              {open ? (
                <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              ) : (
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" aria-hidden="true" />
              )}
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 min-[430px]:grid-cols-3">
              <ResultMetric label="订单金额" value={`¥${order.money}`} strong />
              <ResultMetric label="购买数量" value={`${order.quantity} 件`} />
              <ResultMetric
                label="下单时间"
                value={formatDate(order.created_at)}
                className="col-span-2 min-[430px]:col-span-1"
              />
            </dl>
          </div>
        </div>
      </div>

      {open ? (
        <div id={detailId} className="border-t border-slate-200 bg-slate-50/70 px-3 py-4 sm:px-5 sm:py-5">
          <div className="grid gap-5 md:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] md:gap-6">
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-slate-900">订单信息</h4>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-1">
                <DetailItem label="完整订单号" value={order.out_trade_no} mono className="col-span-2 md:col-span-1" />
                <DetailItem label="下单时间" value={formatDate(order.created_at)} />
                {order.paid_at ? <DetailItem label="付款时间" value={formatDate(order.paid_at)} /> : null}
              </dl>
            </div>

            <div className="min-w-0 md:border-l md:border-slate-200 md:pl-6">
              <div className="flex flex-col gap-3 min-[430px]:flex-row min-[430px]:items-start min-[430px]:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <KeyRound className="h-4 w-4 text-sky-700" aria-hidden="true" />
                    发货内容
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{status.description}</p>
                </div>

                {delivered && order.delivery_content.length > 0 ? (
                  <div className="grid shrink-0 grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void copyDeliveryContent()}
                      className="bg-white shadow-none"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      复制全部
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={exportDeliveryContent}
                      className="bg-white shadow-none"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      导出 TXT
                    </Button>
                  </div>
                ) : !closed ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={refreshing}
                    onClick={() => { void refreshOrder(); }}
                    className="w-full shrink-0 bg-white shadow-none min-[430px]:w-auto"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 motion-reduce:animate-none ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
                    {refreshing
                      ? "正在刷新"
                      : order.status === "paid" && order.fulfillment_status === "failed"
                        ? "重试发货"
                        : "刷新状态"}
                  </Button>
                ) : null}
              </div>

              {delivered && order.delivery_content.length > 0 ? (
                <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
                  {order.delivery_content.map((content, index) => (
                    <div
                      key={`${index}-${content.slice(0, 24)}`}
                      className="flex min-w-0 items-start gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 sm:px-4"
                    >
                      {order.delivery_content.length > 1 ? (
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-sky-50 text-xs font-bold text-sky-700">
                          {index + 1}
                        </span>
                      ) : null}
                      <pre className="m-0 min-w-0 flex-1 select-text whitespace-pre-wrap break-words font-mono text-sm leading-6 text-slate-800 [overflow-wrap:anywhere]">
                        {content}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-600 sm:px-4">
                  <Clock3 className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span>{status.description}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ResultMetric({
  label,
  value,
  strong = false,
  className = "",
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] text-slate-400">{label}</dt>
      <dd className={strong
        ? "mt-0.5 tabular-nums text-base font-bold text-sky-700"
        : "mt-0.5 truncate text-xs font-semibold tabular-nums text-slate-700"}
      >
        {value}
      </dd>
    </div>
  );
}

function DetailItem({
  label,
  value,
  mono = false,
  className = "",
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 break-all text-sm font-semibold leading-5 tabular-nums text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function ResultsLoading() {
  return (
    <section aria-label="正在查询订单" aria-live="polite" className="admin-panel overflow-hidden">
      <div className="border-b border-slate-200 px-3 py-3 sm:px-5">
        <Skeleton className="h-4 w-24 bg-slate-200" />
      </div>
      {[0, 1].map((item) => (
        <div key={item} className="flex gap-3 border-b border-slate-200 px-3 py-4 last:border-b-0 sm:px-5 sm:py-5">
          <Skeleton className="h-9 w-9 shrink-0 bg-slate-200" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-28 bg-slate-200" />
            <Skeleton className="mt-3 h-5 w-2/3 bg-slate-200" />
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Skeleton className="h-8 bg-slate-200" />
              <Skeleton className="h-8 bg-slate-200" />
              <Skeleton className="h-8 bg-slate-200" />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

export default function QueryOrderPage() {
  const [email, setEmail] = useState("");
  const [queryPassword, setQueryPassword] = useState("");
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [queryCredentials, setQueryCredentials] = useState<QueryCredentials | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [legacyScanPending, setLegacyScanPending] = useState(false);
  const [legacyScanCursor, setLegacyScanCursor] = useState("");
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [queried, setQueried] = useState(false);

  async function queryOrders(
    credentials: QueryCredentials,
    targetPage: number,
    preserveCurrentResults = false,
    scanCursor = "",
  ) {
    setLoading(true);
    setError("");
    if (!preserveCurrentResults) setOrders(null);
    setQueried(true);
    setFailedPage(null);

    try {
      const response = await fetch("/api/orders/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials.queryGrant && !scanCursor
          ? { query_grant: credentials.queryGrant, page: targetPage }
          : {
              email: credentials.email,
              query_password: credentials.queryPassword,
              page: targetPage,
              ...(scanCursor ? { legacy_scan_cursor: scanCursor } : {}),
            }),
        cache: "no-store",
      });
      const data = (await response.json()) as QueryResponse;

      if (!response.ok) {
        if (response.status === 401 && credentials.queryGrant) {
          setQueryCredentials({
            email: credentials.email,
            queryPassword: credentials.queryPassword,
          });
        }
        setError(data.message ?? "查询失败，请稍后重试");
        setFailedPage(targetPage);
        return;
      }

      const nextOrders = data.orders ?? [];
      const nextPageSize = data.page_size && data.page_size > 0 ? data.page_size : 20;

      setOrders(nextOrders);
      setTotal(typeof data.total === "number" ? data.total : nextOrders.length);
      setPage(typeof data.page === "number" ? data.page : targetPage);
      setPageSize(nextPageSize);
      if (data.query_grant) {
        setQueryCredentials({ ...credentials, queryGrant: data.query_grant });
      }
      if (!credentials.queryGrant || scanCursor) {
        setLegacyScanPending(Boolean(data.legacy_scan_pending));
        setLegacyScanCursor(data.legacy_scan_cursor ?? "");
      }
    } catch {
      setError("网络错误，请稍后重试");
      setFailedPage(targetPage);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !queryPassword) return;

    const credentials = {
      email: email.trim(),
      queryPassword,
    };

    setQueryCredentials(credentials);
    setPage(1);
    setTotal(0);
    setLegacyScanPending(false);
    setLegacyScanCursor("");
    await queryOrders(credentials, 1);
  }

  async function changePage(targetPage: number) {
    if (!queryCredentials || targetPage < 1) return;
    await queryOrders(queryCredentials, targetPage, true);
  }

  async function continueLegacyScan() {
    if (!queryCredentials || !legacyScanCursor) return;
    await queryOrders(queryCredentials, page, true, legacyScanCursor);
  }

  function updateOrder(nextOrder: OrderSummary) {
    setOrders((currentOrders) => currentOrders?.map((order) => (
      order.out_trade_no === nextOrder.out_trade_no ? nextOrder : order
    )) ?? null);
  }

  function clearQuery() {
    setEmail("");
    setQueryPassword("");
    setOrders(null);
    setQueryCredentials(null);
    setPage(1);
    setPageSize(20);
    setTotal(0);
    setLegacyScanPending(false);
    setLegacyScanCursor("");
    setFailedPage(null);
    setError("");
    setQueried(false);
  }

  const totalPages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));

  return (
    <main className="px-3 py-5 sm:px-4 sm:py-8 lg:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="border-b border-slate-200 pb-5 sm:pb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">查询订单</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                使用下单邮箱和查单密码，查看订单状态与发货内容。
              </p>
            </div>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-sky-200 bg-sky-50 text-sky-700">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>
        </header>

        <section className="admin-panel mt-5 p-4 sm:mt-6 sm:p-5" aria-label="订单查询表单">
          <form onSubmit={(event) => { void handleSubmit(event); }} aria-busy={loading}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                下单邮箱
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <Input
                    className="h-11 pl-9 md:h-10"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    required
                    placeholder="请输入下单时填写的邮箱"
                    value={email}
                    disabled={loading}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "query-order-error" : undefined}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (error) {
                        setError("");
                        setFailedPage(null);
                        setQueried(false);
                      }
                    }}
                  />
                </div>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                查单密码
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <Input
                    className="h-11 pl-9 md:h-10"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={8}
                    placeholder="请输入下单时设置的查单密码"
                    value={queryPassword}
                    disabled={loading}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "query-order-error" : undefined}
                    onChange={(event) => {
                      setQueryPassword(event.target.value);
                      if (error) {
                        setError("");
                        setFailedPage(null);
                        setQueried(false);
                      }
                    }}
                  />
                </div>
              </label>
            </div>

            {error && orders === null ? (
              <div id="query-order-error" role="alert" className="mt-4 flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm leading-5 text-red-700 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between">
                <div className="flex min-w-0 items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
                {queryCredentials && failedPage ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { void changePage(failedPage); }}
                    className="w-full shrink-0 border-red-200 bg-white text-red-700 shadow-none hover:border-red-300 hover:bg-red-100 hover:text-red-800 min-[430px]:w-auto"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    重试第 {failedPage} 页
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 grid gap-2 min-[360px]:grid-cols-[minmax(0,1fr)_auto] min-[360px]:items-center md:grid-cols-[160px_minmax(0,1fr)]">
              <Button type="submit" disabled={loading} className="h-11 w-full shadow-none md:h-10">
                <Search className="h-4 w-4" aria-hidden="true" />
                {loading ? "正在查询" : "查询订单"}
              </Button>
              <p className="flex items-center justify-center gap-1.5 px-2 text-xs leading-5 text-slate-500 min-[360px]:justify-end md:justify-start">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden="true" />
                查询信息仅用于核验订单
              </p>
            </div>
          </form>
        </section>

        <div className="mt-5 sm:mt-6" aria-live="polite">
          {loading ? <ResultsLoading /> : null}

          {!loading && queried && orders !== null && queryCredentials ? (
            <section aria-labelledby="query-results-title">
              <div className="mb-3 flex items-end justify-between gap-3 px-0.5">
                <div>
                  <h2 id="query-results-title" className="text-base font-bold text-slate-950 sm:text-lg">查询结果</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {orders.length > 0 ? `共 ${total} 笔订单，第 ${page} / ${totalPages} 页` : "没有找到匹配的订单"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {orders.length > 0 ? <span className="hidden text-xs text-slate-400 sm:inline">点击订单查看详情</span> : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearQuery}
                    className="-mr-2 text-slate-500 shadow-none"
                  >
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    清除结果
                  </Button>
                </div>
              </div>

              {legacyScanPending ? (
                <div role="status" className="mb-3 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                  <div className="flex min-w-0 items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>检测到较多早期订单，当前结果可能未包含全部历史记录。可继续向后核对，或联系售后协助处理。</span>
                  </div>
                  {legacyScanCursor ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { void continueLegacyScan(); }}
                      className="w-full shrink-0 border-amber-200 bg-white text-amber-800 shadow-none hover:bg-amber-100 hover:text-amber-900 sm:w-auto"
                    >
                      <Search className="h-3.5 w-3.5" aria-hidden="true" />
                      继续查找早期订单
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {orders.length > 0 ? (
                <div className="admin-panel overflow-hidden">
                  {orders.map((order) => (
                    <OrderResult
                      key={order.out_trade_no}
                      order={order}
                      queryCredentials={queryCredentials}
                      onOrderUpdate={updateOrder}
                    />
                  ))}
                </div>
              ) : (
                <div className="admin-panel px-4 py-10 text-center sm:py-12">
                  <span className="mx-auto grid h-11 w-11 place-items-center rounded-md bg-slate-100 text-slate-400">
                    <SearchX className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 text-sm font-bold text-slate-800">未找到订单</h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
                    请核对下单邮箱和查单密码。若仍无法查询，请联系售后协助处理。
                  </p>
                </div>
              )}

              {error && failedPage ? (
                <div role="alert" className="mt-3 flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between">
                  <div className="flex min-w-0 items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{error}，当前仍显示第 {page} 页。</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { void changePage(failedPage); }}
                    className="w-full shrink-0 border-red-200 bg-white text-red-700 shadow-none hover:border-red-300 hover:bg-red-100 hover:text-red-800 min-[430px]:w-auto"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    重试第 {failedPage} 页
                  </Button>
                </div>
              ) : null}

              {orders.length > 0 && totalPages > 1 ? (
                <nav aria-label="订单结果分页" className="mt-3 flex items-center justify-between gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => { void changePage(page - 1); }}
                    className="flex-1 bg-white shadow-none sm:flex-none"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    上一页
                  </Button>
                  <span className="shrink-0 px-1 text-xs tabular-nums text-slate-500">
                    {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => { void changePage(page + 1); }}
                    className="flex-1 bg-white shadow-none sm:flex-none"
                  >
                    下一页
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </nav>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
