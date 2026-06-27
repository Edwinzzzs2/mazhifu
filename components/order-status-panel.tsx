"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, Copy, RefreshCw, ShieldCheck } from "lucide-react";

type OrderStatus = {
  out_trade_no: string;
  product_name: string;
  money: string;
  quantity: number;
  pay_type: string;
  status: "pending" | "paid" | "expired" | "cancelled";
  fulfillment_status: "pending" | "delivered" | "failed";
  trade_no: string | null;
  delivery_content: string[];
  created_at: string;
  expires_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
};

type OrderStatusPanelProps = {
  initial_order: OrderStatus;
  access_token: string;
  compact?: boolean;
};

export function OrderStatusPanel({
  initial_order,
  access_token,
  compact = false,
}: OrderStatusPanelProps) {
  const [order, setOrder] = useState(initial_order);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(order.out_trade_no)}/status?token=${encodeURIComponent(
          access_token,
        )}`,
        { cache: "no-store" },
      );
      if (response.ok) {
        setOrder((await response.json()) as OrderStatus);
      }
    } finally {
      setRefreshing(false);
    }
  }, [access_token, order.out_trade_no]);

  useEffect(() => {
    const shouldPoll =
      order.status === "pending" ||
      (order.status === "paid" && order.fulfillment_status !== "delivered");
    if (!shouldPoll) {
      return;
    }
    // 立刻触发一次，之后每 5 秒轮询
    void refreshStatus();
    const timer = window.setInterval(refreshStatus, 5000);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.status, order.fulfillment_status]);

  const paid = order.status === "paid";
  // 服务端状态 + 前端本地时间双重判断
  const serverExpired = order.status === "expired";
  const localExpired = !paid && order.expires_at ? new Date(order.expires_at).getTime() <= Date.now() : false;
  const expired = serverExpired || localExpired;
  const delivered = paid && order.fulfillment_status === "delivered";
  const waitingDelivery = paid && order.fulfillment_status !== "delivered";
  const statusLabel = delivered
    ? "支付成功，已发货"
    : waitingDelivery
      ? "支付成功，未发货"
      : expired
        ? "订单已过期"
        : "等待支付中";

  async function copyDelivery() {
    await navigator.clipboard.writeText(order.delivery_content.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      <div
        className={`rounded-md border p-5 text-center shadow-sm ${
          paid
            ? "border-emerald-200 bg-emerald-50"
            : expired
              ? "border-slate-200 bg-slate-100"
              : "border-sky-100 bg-sky-50"
        }`}
      >
        {paid ? (
          <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-500" />
        ) : (
          <Clock3 className="mx-auto h-11 w-11 text-sky-500" />
        )}
        <div className="mt-3 text-lg font-bold">{statusLabel}</div>
        <div className="mt-1 text-sm text-slate-500">
          {delivered
            ? "发货内容已生成，请及时保存"
            : waitingDelivery
              ? "已确认到账，库存不足时请联系商家补发"
            : expired
              ? "请返回商品页重新下单"
              : "页面会自动向本站后端查询，完成后自动更新"}
        </div>
      </div>

      {!compact ? (
        <dl className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <OrderLine label="商品名称" value={order.product_name} />
          <OrderLine label="实付金额" value={`¥${order.money}`} accent />
          <OrderLine label="订单编号" value={order.out_trade_no} />
          {paid && order.trade_no ? <OrderLine label="平台流水" value={order.trade_no} /> : null}
        </dl>
      ) : null}

      {paid && !compact ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-bold text-emerald-800">发货内容</div>
            {order.delivery_content.length ? (
              <button
                type="button"
                onClick={copyDelivery}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "已复制" : "复制"}
              </button>
            ) : null}
          </div>
          {order.delivery_content.length ? (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 font-mono text-sm leading-6 text-slate-800">
              {order.delivery_content.join("\n")}
            </pre>
          ) : (
            <div className="rounded-md bg-white px-3 py-3 text-sm text-slate-500">
              已确认付款，等待库存补发。补货后刷新订单会再次尝试发货。
            </div>
          )}
        </div>
      ) : null}

      <button
        type="button"
        onClick={refreshStatus}
        disabled={refreshing}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        立即刷新状态
      </button>

      <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        支付密钥仅保存在服务端
      </div>
    </div>
  );
}

function OrderLine({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`break-all text-right font-semibold ${accent ? "text-sky-500" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
