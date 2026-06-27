"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
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
import type { AdminOrderDetail, AdminOrderListItem, AdminOrderListResult } from "@/lib/orders";

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

function OrderDetailPanel({ outTradeNo }: { outTradeNo: string }) {
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/orders/${encodeURIComponent(outTradeNo)}`)
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
            <button
              onClick={() => copyText(detail.out_trade_no, "no")}
              className="shrink-0 text-slate-400 hover:text-sky-600"
            >
              <Copy className="h-3 w-3" />
            </button>
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
                <button
                  onClick={() => copyText(secret, `secret-${i}`)}
                  className="shrink-0 text-slate-400 hover:text-sky-600"
                >
                  {copied === `secret-${i}` ? (
                    <span className="text-emerald-500">✓</span>
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
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
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(
    async (nextPage = page, nextStatus = status, nextQ = q) => {
      setLoading(true);
      try {
        const url = new URL("/api/admin/orders", window.location.origin);
        url.searchParams.set("page", String(nextPage));
        if (nextStatus) url.searchParams.set("status", nextStatus);
        if (nextQ) url.searchParams.set("q", nextQ);
        const resp = await fetch(url, { cache: "no-store" });
        const data = (await resp.json()) as AdminOrderListResult & { message?: string };
        if (!resp.ok) throw new Error(data.message ?? "加载失败");
        setOrders(data.orders ?? []);
        setTotal(data.total ?? 0);
        setPage(data.page ?? 1);
        setPageSize(data.page_size ?? 20);
      } catch {
        // silently fail, keep existing data
      } finally {
        setLoading(false);
      }
    },
    [page, status, q],
  );

  useEffect(() => {
    void load(1, status, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, q]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQ(inputQ);
    setPage(1);
  }

  function handleStatusChange(val: string) {
    setStatus(val);
    setPage(1);
    setExpandedId(null);
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function goPage(p: number) {
    const next = Math.max(1, Math.min(totalPages, p));
    setPage(next);
    void load(next, status, q);
  }

  async function handleVerify(e: React.MouseEvent, outTradeNo: string) {
    e.stopPropagation(); // 阻止展开行
    setVerifyingId(outTradeNo);
    try {
      const resp = await fetch(`/api/admin/orders/${encodeURIComponent(outTradeNo)}/verify`, {
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
      // 刷新表格
      void load(page, status, q);
    } catch (err) {
      toast.error("网络错误", { description: String(err) });
    } finally {
      setVerifyingId(null);
    }
  }

  return (
    <section className="admin-panel min-w-0">
      {/* 标题栏 */}
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold text-sky-600">
            <ClipboardList className="h-4 w-4" />
            订单记录
          </div>
          <h2 className="mt-1 truncate text-lg font-bold sm:text-xl">
            全部订单
            {total > 0 && (
              <span className="ml-2 text-base font-normal text-slate-400">共 {total} 笔</span>
            )}
          </h2>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => load(page, status, q)}
          disabled={loading}
          className="w-full sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/45 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        {/* 状态筛选 */}
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            { value: "", label: "全部" },
            { value: "pending", label: "待付款" },
            { value: "paid", label: "已付款" },
            { value: "expired", label: "已过期" },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => handleStatusChange(item.value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                status === item.value
                  ? "border-sky-600 bg-sky-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 搜索 */}
        <form onSubmit={handleSearch} className="flex gap-2 sm:shrink-0">
          <input
            className="admin-input h-9 w-full text-sm sm:w-56"
            placeholder="订单号 / 联系方式"
            value={inputQ}
            onChange={(e) => setInputQ(e.target.value)}
          />
          <Button type="submit" variant="outline" size="sm" className="shrink-0">
            <Search className="h-4 w-4" />
          </Button>
        </form>
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
                <div
                  className="cursor-pointer px-4 py-3 active:bg-sky-50/60"
                  onClick={() => toggleExpand(order.out_trade_no)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {expandedId === order.out_trade_no ? (
                          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        )}
                        <span className="truncate font-mono text-xs text-slate-400">{order.out_trade_no}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="line-clamp-1 text-sm font-semibold">{order.product_name}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="font-semibold text-sky-700">¥{order.money}</span>
                        <span>×{order.quantity}</span>
                        {order.contact && <span className="truncate max-w-[120px]">{order.contact}</span>}
                        <span>{formatDate(order.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusPill value={order.status} map={STATUS_LABELS} />
                      <StatusPill value={order.fulfillment_status} map={FULFILLMENT_LABELS} />
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-1 w-20 text-xs"
                        disabled={verifyingId === order.out_trade_no}
                        onClick={(e) => handleVerify(e, order.out_trade_no)}
                      >
                        <ShieldCheck className="h-3 w-3 shrink-0" />
                        {verifyingId === order.out_trade_no ? "核实中" : "核实"}
                      </Button>
                    </div>
                  </div>
                </div>
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
          <table className="w-full min-w-[860px] border-collapse bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3">订单号</th>
                <th className="px-4 py-3">商品</th>
                <th className="px-4 py-3">金额</th>
                <th className="px-4 py-3">数量</th>
                <th className="px-4 py-3">联系方式</th>
                <th className="px-4 py-3">支付状态</th>
                <th className="px-4 py-3">发货状态</th>
                <th className="px-4 py-3">下单时间</th>
                <th className="w-24 px-4 py-3">操作</th>
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
                      <td className="px-4 py-3 text-slate-400">
                        {expandedId === order.out_trade_no ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {order.out_trade_no}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3">{order.product_name}</td>
                      <td className="px-4 py-3 font-semibold text-sky-700">¥{order.money}</td>
                      <td className="px-4 py-3">{order.quantity}</td>
                      <td className="max-w-[120px] truncate px-4 py-3 text-slate-500 text-xs">
                        {order.contact || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill value={order.status} map={STATUS_LABELS} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill value={order.fulfillment_status} map={FULFILLMENT_LABELS} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
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
