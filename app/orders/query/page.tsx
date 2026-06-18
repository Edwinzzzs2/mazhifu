"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";

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
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        已完成
      </span>
    );
  }
  if (status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
        <Clock3 className="h-3 w-3" />
        等待发货
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
        <Clock3 className="h-3 w-3" />
        等待支付
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
      <XCircle className="h-3 w-3" />
      已过期
    </span>
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
    a.download = `卡密-${order.out_trade_no}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <tr
        className="cursor-pointer border-b border-sky-50 hover:bg-sky-50/60"
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
        <td className="max-w-[180px] truncate px-4 py-3 text-sm font-medium">
          {order.product_name}
        </td>
        <td className="px-4 py-3 text-center text-sm">{order.quantity}</td>
        <td className="px-4 py-3 text-sm font-bold text-sky-600">¥{order.money}</td>
        <td className="px-4 py-3">
          <StatusBadge status={order.status} fulfillment={order.fulfillment_status} />
        </td>
        <td className="px-4 py-3 text-xs text-slate-400">
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
        <tr className="border-b border-sky-100 bg-sky-50/40">
          <td colSpan={6} className="px-6 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
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
                    卡密信息
                  </div>
                  <div className="space-y-1 rounded-lg border border-emerald-100 bg-white p-3">
                    {order.delivery_content.map((s, i) => (
                      <div key={i} className="font-mono text-sm break-all text-slate-700">
                        {s}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); copyAll(); }}
                      className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copied ? "已复制" : "复制全部"}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); exportTxt(); }}
                      className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      导出 TXT
                    </button>
                  </div>
                </div>
              ) : delivered ? (
                <div className="text-sm text-slate-400">暂无卡密记录</div>
              ) : order.status === "paid" ? (
                <div className="text-sm text-slate-400">已支付，等待发货中…</div>
              ) : (
                <div className="text-sm text-slate-400">
                  {order.status === "pending" ? "等待支付" : "订单已过期，无卡密"}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function InfoItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-sky-100 pb-1.5 last:border-0">
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
    if (!email.trim() || !queryPassword.trim()) return;
    setLoading(true);
    setError("");
    setQueried(true);

    try {
      const url = `/api/orders/query?email=${encodeURIComponent(email.trim())}&query_password=${encodeURIComponent(queryPassword.trim())}`;
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) {
        setOrders([]);
        return;
      }
      const data = (await resp.json()) as { orders: OrderSummary[] };
      setOrders(data.orders ?? []);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eef9ff] px-4 py-10 text-[#162238]">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        {/* Query form */}
        <section className="rounded-xl border border-sky-100 bg-white p-6 shadow-[0_18px_45px_rgba(14,116,144,0.12)]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-sky-600">
                <Search className="h-4 w-4" />
                查询订单
              </div>
              <h1 className="mt-1.5 text-2xl font-bold">我的订单</h1>
              <p className="mt-1.5 text-sm text-slate-500">
                输入下单时填写的联系方式和查单密码，查看所有订单记录。
              </p>
            </div>
            <ShieldCheck className="h-10 w-10 shrink-0 text-emerald-500" />
          </div>

          <form onSubmit={(e) => { void handleSubmit(e); }} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold">
                联系方式 / 邮箱
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="admin-input pl-9"
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
                  <input
                    className="admin-input pl-9"
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
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-sky-500 shadow-none hover:bg-sky-600"
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
          <section className="overflow-hidden rounded-xl border border-sky-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-sky-100 px-5 py-3">
              <div className="text-sm font-semibold">
                {orders.length > 0
                  ? `共找到 ${orders.length} 笔订单`
                  : "未找到匹配的订单"}
              </div>
              {orders.length > 0 && (
                <div className="text-xs text-slate-400">点击行展开详情 / 卡密</div>
              )}
            </div>

            {orders.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                邮箱或查单密码不正确，请核对后重试
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sky-100 bg-sky-50 text-xs text-slate-500">
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
            )}
          </section>
        )}
      </div>
    </main>
  );
}
