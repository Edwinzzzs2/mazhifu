"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { adminFetch } from "@/lib/admin-client-auth";
import type {
  AdminOrderDetail,
  AdminOrderListItem,
  AdminOrderListResult,
  AdminOrderSort,
} from "@/lib/orders";

const SORT_OPTIONS: Array<{ value: AdminOrderSort; label: string }> = [
  { value: "created_desc", label: "下单时间：最新优先" },
  { value: "created_asc", label: "下单时间：最早优先" },
  { value: "money_desc", label: "订单金额：从高到低" },
  { value: "money_asc", label: "订单金额：从低到高" },
  { value: "status_asc", label: "订单状态：待处理优先" },
];

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "待付款", className: "border-amber-200 bg-amber-50 text-amber-700" },
  paid: { label: "已付款", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  expired: { label: "已过期", className: "border-slate-200 bg-slate-100 text-slate-500" },
  cancelled: { label: "已取消", className: "border-slate-200 bg-slate-100 text-slate-500" },
};

const FULFILLMENT_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "未发货", className: "border-amber-200 bg-amber-50 text-amber-700" },
  delivered: { label: "已发货", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  failed: { label: "发货失败", className: "border-red-200 bg-red-50 text-red-700" },
};

function StatusPill({ value, map }: { value: string; map: typeof STATUS_LABELS }) {
  const config = map[value] ?? { label: value, className: "border-slate-200 bg-slate-100 text-slate-500" };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SortIcon({ direction }: { direction: "asc" | "desc" | "none" }) {
  if (direction === "asc") return <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />;
  if (direction === "desc") return <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />;
  return <ArrowUpDown className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />;
}

function OrderDetailPanel({ outTradeNo }: { outTradeNo: string }) {
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    setLoading(true);
    adminFetch(`/api/admin/orders/${encodeURIComponent(outTradeNo)}`)
      .then((r) => r.json())
      .then((data: AdminOrderDetail) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [outTradeNo]);

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1400);
  }

  if (loading) {
    return <div className="px-4 py-4 text-sm text-slate-400 sm:px-6">正在加载订单详情…</div>;
  }
  if (!detail) {
    return <div className="px-4 py-4 text-sm text-red-500 sm:px-6">加载失败</div>;
  }

  return (
    <div className="grid gap-5 border-t border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-6 sm:py-5 md:grid-cols-2">
      {/* 左：订单信息 */}
      <div className="space-y-3 text-sm">
        <div className="font-semibold text-slate-700">订单信息</div>
        <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <dt className="text-slate-400">订单号</dt>
          <dd className="flex items-center gap-1.5 font-mono break-all">
            {detail.out_trade_no}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => copyText(detail.out_trade_no, "no")}
              className="h-6 w-6 shrink-0 text-slate-400"
              title="复制订单号"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </dd>

          <dt className="text-slate-400">平台流水号</dt>
          <dd className="font-mono break-all">{detail.trade_no ?? "-"}</dd>

          <dt className="text-slate-400">联系方式</dt>
          <dd className="break-all">{detail.contact || "-"}</dd>

          <dt className="text-slate-400">支付方式</dt>
          <dd>{detail.pay_type}</dd>

          <dt className="text-slate-400">下单时间</dt>
          <dd>{formatDate(detail.created_at)}</dd>

          <dt className="text-slate-400">付款时间</dt>
          <dd>{formatDate(detail.paid_at)}</dd>

          <dt className="text-slate-400">发货时间</dt>
          <dd>{formatDate(detail.fulfilled_at)}</dd>
        </dl>
      </div>

      {/* 右：已发内容 */}
      <div className="space-y-3 text-sm">
        <div className="font-semibold text-slate-700">
          已发内容
          {detail.delivery_secrets.length > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-400">
              共 {detail.delivery_secrets.length} 张
            </span>
          )}
        </div>
        {detail.delivery_secrets.length === 0 ? (
          <div className="text-xs text-slate-400">
            {detail.fulfillment_status === "delivered" ? "发货内容为空" : "未发货"}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {detail.delivery_secrets.map((secret, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs"
              >
                <span className="break-all">{secret}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => copyText(secret, `secret-${i}`)}
                  className="h-6 w-6 shrink-0 text-slate-400"
                  title="复制发货内容"
                >
                  {copied === `secret-${i}` ? (
                    <span className="text-emerald-500">✓</span>
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function AdminOrderList() {
  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [inputQ, setInputQ] = useState("");
  const [sort, setSort] = useState<AdminOrderSort>("created_desc");
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const currentQueryRef = useRef({ page, status, q, sort });
  currentQueryRef.current = { page, status, q, sort };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(
    async (
      nextPage: number,
      nextStatus: string,
      nextQ: string,
      nextSort: AdminOrderSort,
    ) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const url = new URL("/api/admin/orders", window.location.origin);
        url.searchParams.set("page", String(nextPage));
        url.searchParams.set("sort", nextSort);
        if (nextStatus) url.searchParams.set("status", nextStatus);
        if (nextQ) url.searchParams.set("q", nextQ);
        const resp = await adminFetch(url, { cache: "no-store" });
        const data = (await resp.json()) as AdminOrderListResult & { message?: string };
        if (!resp.ok) throw new Error(data.message ?? "加载失败");
        if (requestId !== requestIdRef.current) return;
        setOrders(data.orders ?? []);
        setTotal(data.total ?? 0);
        setPage(data.page ?? 1);
        setPageSize(data.page_size ?? 20);
        setSort(data.sort ?? nextSort);
      } catch {
        if (requestId !== requestIdRef.current) return;
        toast.error("订单加载失败，请稍后重试");
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(1, status, q, sort);
  }, [load, q, sort, status]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const nextQ = inputQ.trim();
    if (nextQ === q) {
      void load(1, status, nextQ, sort);
    } else {
      setQ(nextQ);
    }
    setPage(1);
    setExpandedId(null);
  }

  function handleStatusChange(val: string) {
    setStatus(val);
    setPage(1);
    setExpandedId(null);
  }

  function handleSortChange(nextSort: AdminOrderSort) {
    setSort(nextSort);
    setPage(1);
    setExpandedId(null);
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function goPage(p: number) {
    const next = Math.max(1, Math.min(totalPages, p));
    setPage(next);
    void load(next, status, q, sort);
  }

  async function handleVerify(e: React.MouseEvent, outTradeNo: string) {
    e.stopPropagation(); // 阻止展开行
    setVerifyingId(outTradeNo);
    try {
      const resp = await adminFetch(`/api/admin/orders/${encodeURIComponent(outTradeNo)}/verify`, {
        method: "POST",
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast.error("核实失败", { description: data.message || "未知错误" });
        return;
      }
      const actionLabels: Record<string, string> = {
        marked_paid: "已确认支付成功",
        marked_expired: "确认未支付，已标记过期",
        no_change: "查询完成，状态未变",
      };
      const actionLabel = actionLabels[data.action];
      const toastOptions = actionLabel ? undefined : { description: data.action };
      if (data.action === "no_change") {
        toast.info(actionLabel || "操作完成", toastOptions);
      } else {
        toast.success(actionLabel || "操作完成", toastOptions);
      }
      // 核实期间筛选条件可能已经变化，始终刷新用户当前正在看的列表。
      const current = currentQueryRef.current;
      void load(current.page, current.status, current.q, current.sort);
    } catch (err) {
      toast.error("网络错误", { description: String(err) });
    } finally {
      setVerifyingId(null);
    }
  }

  return (
    <section className="admin-panel min-w-0">
      {/* 标题栏 */}
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-700">
            <ClipboardList className="h-4 w-4" />
            订单记录
          </div>
          <h2 className="mt-1 truncate text-lg font-bold text-slate-950">
            全部订单
            {total > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-400">共 {total} 笔</span>
            )}
          </h2>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => load(page, status, q, sort)}
          disabled={loading}
          className="w-full sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className="space-y-3 border-b border-slate-200 bg-slate-50/60 px-4 py-3 sm:px-5">
        {/* 状态筛选 */}
        <div
          className="inline-flex w-fit max-w-full gap-1 overflow-x-auto rounded-md border border-slate-200 bg-white p-1 text-sm"
          role="group"
          aria-label="按支付状态筛选"
        >
          {[
            { value: "", label: "全部" },
            { value: "pending", label: "待付款" },
            { value: "paid", label: "已付款" },
            { value: "expired", label: "已过期" },
            { value: "cancelled", label: "已取消" },
          ].map((item) => (
            <button
              type="button"
              key={item.value}
              onClick={() => handleStatusChange(item.value)}
              aria-pressed={status === item.value}
              className={`whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-semibold transition-colors ${
                status === item.value
                  ? "bg-sky-600 text-white"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(260px,1fr)_220px]">
          {/* 搜索 */}
          <form onSubmit={handleSearch} className="flex min-w-0 gap-2">
            <Input
              className="h-10 min-w-0 flex-1 text-sm"
              placeholder="搜索订单号或联系方式"
              aria-label="搜索订单号或联系方式"
              value={inputQ}
              onChange={(e) => setInputQ(e.target.value)}
            />
            <Button type="submit" variant="outline" className="shrink-0" aria-label="搜索订单">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">搜索</span>
            </Button>
          </form>

          <NativeSelect
            value={sort}
            onChange={(event) => handleSortChange(event.target.value as AdminOrderSort)}
            aria-label="订单排序方式"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {/* 订单列表 */}
      <div className="overflow-hidden">
        {/* 手机卡片视图 */}
        <div className="divide-y divide-slate-100 md:hidden">
          {orders.length === 0 ? (
            <div className="px-4 py-10 text-center text-slate-400">
              {loading ? "正在加载…" : "暂无订单"}
            </div>
          ) : (
            orders.map((order) => (
              <Fragment key={order.out_trade_no}>
                <article className="px-4 py-3">
                  <button
                    type="button"
                    className="w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                    onClick={() => toggleExpand(order.out_trade_no)}
                    aria-expanded={expandedId === order.out_trade_no}
                    aria-label={`${expandedId === order.out_trade_no ? "收起" : "展开"}订单 ${order.out_trade_no}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {expandedId === order.out_trade_no ? (
                            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          )}
                          <span className="truncate font-mono text-xs text-slate-400">
                            {order.out_trade_no}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="line-clamp-1 text-sm font-semibold">
                            {order.product_name}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          <span className="font-semibold tabular-nums text-sky-700">
                            ¥{order.money}
                          </span>
                          <span>×{order.quantity}</span>
                          {order.contact && (
                            <span className="max-w-[160px] truncate">{order.contact}</span>
                          )}
                        </div>
                        <div className="mt-1 text-xs tabular-nums text-slate-400">
                          {formatDate(order.created_at)}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                        <StatusPill value={order.status} map={STATUS_LABELS} />
                        <StatusPill value={order.fulfillment_status} map={FULFILLMENT_LABELS} />
                      </div>
                    </div>
                  </button>
                  <div className="mt-2 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-w-20 text-xs"
                      disabled={verifyingId === order.out_trade_no}
                      onClick={(e) => handleVerify(e, order.out_trade_no)}
                    >
                      <ShieldCheck className="h-3 w-3 shrink-0" />
                      {verifyingId === order.out_trade_no ? "核实中" : "核实支付"}
                    </Button>
                  </div>
                </article>
                {expandedId === order.out_trade_no && (
                  <div>
                    <OrderDetailPanel outTradeNo={order.out_trade_no} />
                  </div>
                )}
              </Fragment>
            ))
          )}
        </div>

        {/* PC 表格视图 */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1120px] table-fixed border-collapse bg-white text-sm">
            <colgroup>
              <col className="w-12" />
              <col className="w-[218px]" />
              <col />
              <col className="w-[92px]" />
              <col className="w-16" />
              <col className="w-[150px]" />
              <col className="w-[104px]" />
              <col className="w-[104px]" />
              <col className="w-[142px]" />
              <col className="w-[108px]" />
            </colgroup>
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3" />
                <th className="px-4 py-3">订单号</th>
                <th className="px-4 py-3">商品</th>
                <th
                  className="px-4 py-3"
                  aria-sort={
                    sort === "money_asc"
                      ? "ascending"
                      : sort === "money_desc"
                        ? "descending"
                        : "none"
                  }
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-sm font-semibold hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    onClick={() =>
                      handleSortChange(sort === "money_desc" ? "money_asc" : "money_desc")
                    }
                    aria-label={`按金额${sort === "money_desc" ? "从低到高" : "从高到低"}排序`}
                  >
                    金额
                    <SortIcon
                      direction={
                        sort === "money_asc" ? "asc" : sort === "money_desc" ? "desc" : "none"
                      }
                    />
                  </button>
                </th>
                <th className="px-4 py-3">数量</th>
                <th className="px-4 py-3">联系方式</th>
                <th className="px-4 py-3" aria-sort={sort === "status_asc" ? "other" : "none"}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-sm font-semibold hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    onClick={() => handleSortChange("status_asc")}
                    aria-label="按状态排序，待处理订单优先"
                  >
                    支付状态
                    <SortIcon direction={sort === "status_asc" ? "asc" : "none"} />
                  </button>
                </th>
                <th className="px-4 py-3">发货状态</th>
                <th
                  className="px-4 py-3"
                  aria-sort={
                    sort === "created_asc"
                      ? "ascending"
                      : sort === "created_desc"
                        ? "descending"
                        : "none"
                  }
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-sm font-semibold hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    onClick={() =>
                      handleSortChange(sort === "created_desc" ? "created_asc" : "created_desc")
                    }
                    aria-label={`按下单时间${sort === "created_desc" ? "从早到晚" : "从晚到早"}排序`}
                  >
                    下单时间
                    <SortIcon
                      direction={sort === "created_asc" ? "asc" : sort === "created_desc" ? "desc" : "none"}
                    />
                  </button>
                </th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                    {loading ? "正在加载…" : "暂无订单"}
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <Fragment key={order.out_trade_no}>
                    <tr
                      className="cursor-pointer hover:bg-sky-50/60"
                      onClick={() => toggleExpand(order.out_trade_no)}
                    >
                      <td className="px-2 py-3 text-slate-400">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleExpand(order.out_trade_no);
                          }}
                          aria-expanded={expandedId === order.out_trade_no}
                          aria-label={`${expandedId === order.out_trade_no ? "收起" : "展开"}订单详情`}
                        >
                          {expandedId === order.out_trade_no ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                      <td className="min-w-0 px-4 py-3 font-mono text-xs text-slate-500">
                        <div className="truncate" title={order.out_trade_no}>{order.out_trade_no}</div>
                      </td>
                      <td className="min-w-0 px-4 py-3">
                        <div className="truncate" title={order.product_name}>{order.product_name}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-sky-700">¥{order.money}</td>
                      <td className="px-4 py-3">{order.quantity}</td>
                      <td className="min-w-0 px-4 py-3 text-xs text-slate-500">
                        <div className="truncate" title={order.contact || undefined}>{order.contact || "-"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill value={order.status} map={STATUS_LABELS} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill value={order.fulfillment_status} map={FULFILLMENT_LABELS} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-slate-500">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-20 text-xs"
                          disabled={verifyingId === order.out_trade_no}
                          onClick={(e) => handleVerify(e, order.out_trade_no)}
                        >
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                          {verifyingId === order.out_trade_no ? "核实中…" : "核实"}
                        </Button>
                      </td>
                    </tr>
                    {expandedId === order.out_trade_no && (
                      <tr>
                        <td colSpan={10} className="p-0">
                          <OrderDetailPanel outTradeNo={order.out_trade_no} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/45 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span className="text-slate-400 text-xs">
            第 {page} / {totalPages} 页，共 {total} 笔
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
