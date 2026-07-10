"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  KeyRound,
  Mail,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ─── Types ─────────────────────────────────────────── */

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

/* ─── Status helpers ─────────────────────────────────── */

function StatusBadge({ status, fulfillment }: { status: string; fulfillment: string }) {
  if (status === "paid" && fulfillment === "delivered") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 py-1 text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        已完成
      </Badge>
    );
  }
  if (status === "paid") {
    return (
      <Badge variant="outline" className="gap-1 border-sky-200 bg-sky-50 py-1 text-sky-700">
        <Clock3 className="h-3 w-3" />
        未发货
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 py-1 text-amber-700">
        <Clock3 className="h-3 w-3" />
        等待支付
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-slate-200 bg-slate-100 py-1 text-slate-500">
      <XCircle className="h-3 w-3" />
      已过期
    </Badge>
  );
}

/* ─── Order row (expandable) ─────────────────────────── */

function OrderRow({ order }: { order: OrderSummary }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const delivered = order.status === "paid" && order.fulfillment_status === "delivered";
  const secretText = order.delivery_content.join("\n");

  function copyAll() {
    if (!secretText) return;
    void navigator.clipboard.writeText(secretText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function exportTxt() {
    const blob = new Blob([secretText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `发货内容-${order.out_trade_no}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <tr
        className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            )}
            <span className="font-mono text-xs text-sky-600">
              #{order.out_trade_no.slice(-8).toUpperCase()}
            </span>
          </div>
        </td>
        <td className="min-w-0 px-4 py-3 text-sm font-medium">
          <div className="truncate" title={order.product_name}>{order.product_name}</div>
        </td>
        <td className="px-4 py-3 text-center text-sm">{order.quantity}</td>
        <td className="px-4 py-3 text-sm font-bold text-sky-600">¥{order.money}</td>
        <td className="px-4 py-3">
          <StatusBadge status={order.status} fulfillment={order.fulfillment_status} />
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
          {new Date(order.created_at).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </td>
      </tr>

      {/* Expanded detail row */}
      {open && (
        <tr className="border-b border-slate-100 bg-slate-50/70">
          <td colSpan={6} className="px-6 py-4">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              {/* Order info */}
              <dl className="grid gap-1.5 text-sm">
                <InfoItem label="完整订单号" value={order.out_trade_no} mono />
                <InfoItem label="下单时间" value={new Date(order.created_at).toLocaleString("zh-CN")} />
                {order.paid_at && (
                  <InfoItem label="付款时间" value={new Date(order.paid_at).toLocaleString("zh-CN")} />
                )}
              </dl>

              {/* Card secrets */}
              {delivered && order.delivery_content.length > 0 ? (
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                    <KeyRound className="h-3.5 w-3.5" />
                    发货内容
                  </div>
                  <div className="space-y-2 rounded-md border border-emerald-100 bg-white p-3">
                    {order.delivery_content.map((s, i) => (
                      <div key={i} className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">
                        {s}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); copyAll(); }}
                      className="border-emerald-200 bg-white text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copied ? "已复制" : "复制全部"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); exportTxt(); }}
                      className="border-emerald-200 bg-white text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                    >
                      <Download className="h-3.5 w-3.5" />
                      导出 TXT
                    </Button>
                  </div>
                </div>
              ) : delivered ? (
                <div className="text-sm text-slate-400">暂无发货内容</div>
              ) : order.status === "paid" ? (
                <div className="text-sm text-slate-400">已支付，未发货</div>
              ) : (
                <div className="text-sm text-slate-400">
                  {order.status === "pending" ? "等待支付" : "订单已过期，无发货内容"}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function OrderCard({ order }: { order: OrderSummary }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const delivered = order.status === "paid" && order.fulfillment_status === "delivered";
  const secretText = order.delivery_content.join("\n");

  function copyAll() {
    if (!secretText) return;
    void navigator.clipboard.writeText(secretText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function exportTxt() {
    const blob = new Blob([secretText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `发货内容-${order.out_trade_no}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <article className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        className="w-full px-4 py-3 text-left active:bg-slate-50"
        onClick={() => setOpen((value) => !value)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {open ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              )}
              <span className="font-mono text-xs text-sky-600">
                #{order.out_trade_no.slice(-8).toUpperCase()}
              </span>
            </div>
            <div className="mt-1 line-clamp-1 text-sm font-semibold">
              {order.product_name}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-bold text-sky-600">¥{order.money}</span>
              <span>×{order.quantity}</span>
              <span>
                {new Date(order.created_at).toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
          <StatusBadge status={order.status} fulfillment={order.fulfillment_status} />
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4">
          <dl className="grid gap-1.5 text-sm">
            <InfoItem label="完整订单号" value={order.out_trade_no} mono />
            <InfoItem label="下单时间" value={new Date(order.created_at).toLocaleString("zh-CN")} />
            {order.paid_at && (
              <InfoItem label="付款时间" value={new Date(order.paid_at).toLocaleString("zh-CN")} />
            )}
          </dl>

          {delivered && order.delivery_content.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <KeyRound className="h-3.5 w-3.5" />
                发货内容
              </div>
              <div className="space-y-2 rounded-md border border-emerald-100 bg-white p-3">
                {order.delivery_content.map((secret, index) => (
                  <div key={index} className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">
                    {secret}
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyAll}
                  className="border-emerald-200 bg-white text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "已复制" : "复制全部"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={exportTxt}
                  className="border-emerald-200 bg-white text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                >
                  <Download className="h-3.5 w-3.5" />
                  导出 TXT
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">
              {delivered
                ? "暂无发货内容"
                : order.status === "paid"
                  ? "已支付，未发货"
                  : order.status === "pending"
                    ? "等待支付"
                    : "订单已过期，无发货内容"}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function InfoItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-1.5 last:border-0">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className={`break-all text-right ${mono ? "font-mono text-xs text-slate-600" : "font-medium"}`}>
        {value}
      </dd>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────── */

export default function QueryOrderPage() {
  const [email, setEmail] = useState("");
  const [queryPassword, setQueryPassword] = useState("");
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [queried, setQueried] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !queryPassword) return;
    setLoading(true);
    setError("");
    setQueried(true);

    try {
      const resp = await fetch("/api/orders/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          query_password: queryPassword,
        }),
        cache: "no-store",
      });
      const data = (await resp.json()) as { orders?: OrderSummary[]; message?: string };
      if (!resp.ok) {
        setError(data.message ?? "查询失败，请稍后重试");
        setOrders([]);
        return;
      }
      setOrders(data.orders ?? []);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell px-3 py-5 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        {/* Query form */}
        <section className="admin-panel overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-700">
                <Search className="h-4 w-4" />
                查询订单
              </div>
              <h1 className="mt-1 text-xl font-bold text-slate-950">我的订单</h1>
              <p className="mt-1 text-sm text-slate-500">
                输入下单时填写的联系方式和查单密码，查看所有订单记录。
              </p>
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-emerald-100 bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
          </div>

          <form onSubmit={(e) => { void handleSubmit(e); }} className="grid gap-3 p-4 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold">
                联系方式 / 邮箱
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="pl-9"
                    type="email"
                    required
                    placeholder="下单时填写的邮箱"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                查单密码
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="pl-9"
                    type="password"
                    required
                    placeholder="下单时设置的查单密码"
                    value={queryPassword}
                    onChange={(e) => setQueryPassword(e.target.value)}
                  />
                </div>
              </label>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 shadow-none"
              >
                <Search className="h-4 w-4" />
                {loading ? "查询中…" : "查询订单"}
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href="/">
                  <ArrowLeft className="h-4 w-4" />
                  返回商品
                </Link>
              </Button>
            </div>
          </form>
        </section>

        {/* Results table */}
        {queried && !loading && orders !== null && (
          <section className="admin-panel overflow-hidden">
            <div className="flex flex-col gap-1 border-b border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="text-sm font-semibold">
                {orders.length > 0
                  ? `共找到 ${orders.length} 笔订单`
                  : "未找到匹配的订单"}
              </div>
              {orders.length > 0 && (
                <div className="text-xs text-slate-400">点击订单展开详情 / 发货内容</div>
              )}
            </div>

            {orders.length === 0 ? (
              <div className="px-4 py-14 text-center">
                <Search className="mx-auto h-7 w-7 text-slate-300" />
                <div className="mt-3 text-sm font-semibold text-slate-600">未找到订单</div>
                <p className="mt-1 text-xs text-slate-400">请核对联系方式和查单密码后重试</p>
              </div>
            ) : (
              <>
                <div className="md:hidden">
                  {orders.map((order) => (
                    <OrderCard key={order.out_trade_no} order={order} />
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[820px] table-fixed text-sm">
                    <colgroup>
                      <col className="w-[184px]" />
                      <col />
                      <col className="w-20" />
                      <col className="w-[104px]" />
                      <col className="w-[116px]" />
                      <col className="w-[132px]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                        <th className="px-4 py-2.5 text-left font-semibold">订单号</th>
                        <th className="px-4 py-2.5 text-left font-semibold">商品名称</th>
                        <th className="px-4 py-2.5 text-center font-semibold">数量</th>
                        <th className="px-4 py-2.5 text-left font-semibold">金额</th>
                        <th className="px-4 py-2.5 text-left font-semibold">状态</th>
                        <th className="px-4 py-2.5 text-left font-semibold">下单时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <OrderRow key={order.out_trade_no} order={order} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
