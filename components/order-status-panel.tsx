"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, Copy, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  compact?: boolean;
};

export function OrderStatusPanel({
  initial_order,
  compact = false,
}: OrderStatusPanelProps) {
  const [order, setOrder] = useState(initial_order);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(order.out_trade_no)}/status`,
        { cache: "no-store" },
      );
      if (response.ok) {
        setOrder((await response.json()) as OrderStatus);
      }
    } finally {
      setRefreshing(false);
    }
  }, [order.out_trade_no]);

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
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div
        aria-live="polite"
        className={`rounded-md border p-4 ${
          paid
            ? "border-emerald-200 bg-emerald-50"
            : expired
              ? "border-slate-200 bg-slate-100"
              : "border-sky-100 bg-sky-50"
        }`}
      >
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white ${paid ? "text-emerald-600" : expired ? "text-slate-500" : "text-sky-600"}`}>
            {paid ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
          </span>
          <div className="min-w-0 pt-0.5">
            <div className="text-base font-bold text-slate-950">{statusLabel}</div>
            <div className="mt-1 text-sm leading-6 text-slate-600">
              {delivered
                ? "发货内容已生成，请及时保存"
                : waitingDelivery
                  ? "已确认到账，库存不足时请联系商家补发"
                  : expired
                    ? "请返回商品页重新下单"
                    : "支付完成后页面会自动更新状态"}
            </div>
          </div>
        </div>
      </div>

      {paid && !compact ? (
        <section className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/70 p-3 sm:p-4">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-emerald-900">发货内容</h3>
              {order.delivery_content.length > 1 ? (
                <p className="mt-0.5 text-xs text-emerald-700/80">
                  共 {order.delivery_content.length} 份，请逐项保存
                </p>
              ) : null}
            </div>
            {order.delivery_content.length ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyDelivery}
                className="h-8 shrink-0 border-emerald-200 bg-white px-2.5 text-xs text-emerald-700 shadow-none hover:bg-emerald-50 hover:text-emerald-800"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "已复制" : "复制"}
              </Button>
            ) : null}
          </div>
          {order.delivery_content.length ? (
            <div className="max-h-[min(28rem,50vh)] min-w-0 space-y-2 overflow-y-auto overscroll-contain rounded-md border border-emerald-100 bg-white p-2 shadow-sm">
              {order.delivery_content.map((content, index) => (
                <div
                  key={`${index}-${content.slice(0, 24)}`}
                  className="min-w-0 rounded border border-slate-100 bg-slate-50/70 px-3 py-3"
                >
                  {order.delivery_content.length > 1 ? (
                    <div className="mb-2 text-[11px] font-semibold text-emerald-700">
                      第 {index + 1} 份
                    </div>
                  ) : null}
                  <pre className="m-0 select-text whitespace-pre-wrap break-words font-mono text-sm leading-6 text-slate-800 [overflow-wrap:anywhere]">
                    {content}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-emerald-100 bg-white px-3 py-3 text-sm leading-6 text-slate-500">
              已确认付款，等待库存补发。补货后刷新订单会再次尝试发货。
            </div>
          )}
        </section>
      ) : null}

      <Button
        type="button"
        variant="outline"
        onClick={refreshStatus}
        disabled={refreshing}
        className="w-full shadow-none"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        立即刷新状态
      </Button>

      <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        支付密钥仅保存在服务端
      </div>
    </div>
  );
}
