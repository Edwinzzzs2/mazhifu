"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CircleX,
  Clock3,
  Copy,
  CreditCard,
  KeyRound,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrderStatusView } from "@/lib/order-status-view";

type OrderStatusPanelProps = {
  initial_order: OrderStatusView;
  compact?: boolean;
  payment_returned?: boolean;
};

type CopyTarget = "all" | number | null;

type RefreshOptions = {
  showFeedback?: boolean;
  retryFulfillment?: boolean;
  verifyPayment?: boolean;
};

export function OrderStatusPanel({
  initial_order,
  compact = false,
  payment_returned = false,
}: OrderStatusPanelProps) {
  const router = useRouter();
  const [order, setOrder] = useState(initial_order);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget>(null);
  const [locallyExpired, setLocallyExpired] = useState(false);
  const [confirmingSlow, setConfirmingSlow] = useState(false);
  const currentOrderNo = useRef(initial_order.out_trade_no);
  const activeRefresh = useRef<AbortController | null>(null);
  const copyOperation = useRef(0);
  const copyInFlight = useRef(false);
  const copyResetTimer = useRef<number | null>(null);

  useEffect(() => {
    if (currentOrderNo.current === initial_order.out_trade_no) return;

    currentOrderNo.current = initial_order.out_trade_no;
    activeRefresh.current?.abort();
    activeRefresh.current = null;
    copyOperation.current += 1;
    copyInFlight.current = false;
    if (copyResetTimer.current !== null) {
      window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = null;
    }
    setRefreshing(false);
    setCopiedTarget(null);
    setLocallyExpired(false);
    setConfirmingSlow(false);
    setOrder(initial_order);
  }, [initial_order]);

  useEffect(() => {
    if (order.status === "paid" || !order.expires_at) {
      setLocallyExpired(false);
      return;
    }

    const expiresAt = new Date(order.expires_at).getTime();
    const updateExpiredState = () => setLocallyExpired(expiresAt <= Date.now());
    updateExpiredState();

    const delay = Math.min(Math.max(expiresAt - Date.now() + 250, 250), 2_147_483_647);
    const timer = window.setTimeout(updateExpiredState, delay);
    return () => window.clearTimeout(timer);
  }, [order.expires_at, order.status]);

  useEffect(() => {
    return () => {
      const controller = activeRefresh.current;
      activeRefresh.current = null;
      controller?.abort();
      copyOperation.current += 1;
      copyInFlight.current = false;
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current);
      }
    };
  }, []);

  const refreshStatus = useCallback(async ({
    showFeedback = false,
    retryFulfillment = false,
    verifyPayment = false,
  }: RefreshOptions = {}) => {
    if (activeRefresh.current) return;

    const requestOrderNo = order.out_trade_no;
    const controller = new AbortController();
    activeRefresh.current = controller;
    setRefreshing(true);
    try {
      const action = verifyPayment
        ? "verify_payment"
        : retryFulfillment
          ? "retry_fulfillment"
          : null;
      const response = await fetch(
        `/api/orders/${encodeURIComponent(requestOrderNo)}/status`,
        action
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
              cache: "no-store",
              signal: controller.signal,
            }
          : { cache: "no-store", signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error("order_status_request_failed");
      }

      const nextOrder = (await response.json()) as OrderStatusView;
      if (controller.signal.aborted || currentOrderNo.current !== requestOrderNo) return;

      const stateChanged =
        nextOrder.status !== order.status ||
        nextOrder.fulfillment_status !== order.fulfillment_status;
      setOrder(nextOrder);

      if (stateChanged) {
        router.refresh();
      }
      if (showFeedback) {
        if (verifyPayment && nextOrder.status !== "paid") {
          toast.info("仍在确认支付结果", {
            description: "支付平台暂未返回成功结果，请勿重复付款。",
          });
        } else {
          toast.success(verifyPayment ? "支付已确认" : "订单状态已刷新");
        }
      }
    } catch {
      if (!controller.signal.aborted && showFeedback) {
        toast.error(verifyPayment ? "支付核实失败，请稍后再试" : "状态刷新失败，请稍后重试");
      }
    } finally {
      if (activeRefresh.current === controller) {
        activeRefresh.current = null;
        setRefreshing(false);
      }
    }
  }, [order.fulfillment_status, order.out_trade_no, order.status, router]);

  const paid = order.status === "paid";
  const serverClosed = order.status === "expired" || order.status === "cancelled";
  const expired =
    !paid && (serverClosed || locallyExpired);
  const delivered = paid && order.fulfillment_status === "delivered";
  const deliveryFailed = paid && order.fulfillment_status === "failed";
  const waitingDelivery = paid && order.fulfillment_status === "pending";
  const confirmingPayment = payment_returned
    && (order.status === "pending" || order.status === "expired");

  useEffect(() => {
    const activelyVerifyPayment = payment_returned
      && (order.status === "pending" || order.status === "expired");
    const shouldPoll = order.status === "pending" || waitingDelivery || activelyVerifyPayment;
    if (!shouldPoll) return;

    let verificationAttempts = 0;
    const poll = () => {
      const verifyPayment = activelyVerifyPayment && verificationAttempts < 6;
      if (verifyPayment) verificationAttempts += 1;
      void refreshStatus({ verifyPayment });
    };

    poll();
    const timer = window.setInterval(poll, activelyVerifyPayment ? 10_000 : 5_000);
    return () => window.clearInterval(timer);
  }, [order.status, payment_returned, refreshStatus, waitingDelivery]);

  useEffect(() => {
    if (!confirmingPayment) {
      setConfirmingSlow(false);
      return;
    }

    setConfirmingSlow(false);
    const timer = window.setTimeout(() => setConfirmingSlow(true), 60_000);
    return () => window.clearTimeout(timer);
  }, [confirmingPayment, order.out_trade_no]);

  const status = delivered
    ? {
        icon: PackageCheck,
        eyebrow: "订单已完成",
        title: "支付成功，卡密已发放",
        description: "发货内容已经生成，请复制并妥善保存。",
        cardClass: "border-emerald-200 bg-emerald-50/70",
        iconClass: "bg-emerald-600 text-white",
        eyebrowClass: "text-emerald-700",
      }
    : deliveryFailed
      ? {
          icon: AlertCircle,
          eyebrow: "等待补货",
          title: "付款已确认，卡密暂未生成",
          description: "当前可能库存不足，请稍后刷新订单状态。",
          cardClass: "border-amber-200 bg-amber-50/80",
          iconClass: "bg-amber-600 text-white",
          eyebrowClass: "text-amber-700",
        }
      : waitingDelivery
        ? {
            icon: Clock3,
            eyebrow: "正在自动发货",
            title: "付款已确认，正在准备卡密",
            description: "页面会自动更新，通常只需要几秒钟。",
            cardClass: "border-sky-200 bg-sky-50/80",
            iconClass: "bg-sky-600 text-white",
            eyebrowClass: "text-sky-700",
          }
        : confirmingPayment
          ? {
              icon: RefreshCw,
              eyebrow: "正在安全核实",
              title: "支付结果确认中",
              description: confirmingSlow
                ? "支付结果同步较慢，但不代表付款失败。请勿重复付款，可点击下方按钮重新核实。"
                : "支付平台已返回，正在同步支付结果。请勿重复付款，页面会自动更新。",
              cardClass: "border-sky-200 bg-sky-50/80",
              iconClass: "bg-sky-600 text-white",
              eyebrowClass: "text-sky-700",
            }
          : expired
          ? {
              icon: CircleX,
              eyebrow: "订单已关闭",
              title: "该订单已过期",
              description: "请返回商品页重新下单。",
              cardClass: "border-slate-200 bg-slate-100/80",
              iconClass: "bg-slate-600 text-white",
              eyebrowClass: "text-slate-600",
            }
          : {
              icon: Clock3,
              eyebrow: "等待支付",
              title: "订单已创建，等待付款",
              description: "完成支付后，页面会自动更新并展示发货内容。",
              cardClass: "border-sky-200 bg-sky-50/80",
              iconClass: "bg-sky-600 text-white",
              eyebrowClass: "text-sky-700",
            };

  const StatusIcon = status.icon;

  async function copyText(text: string, target: Exclude<CopyTarget, null>) {
    if (copyInFlight.current) return;

    const operation = copyOperation.current + 1;
    const sourceOrderNo = order.out_trade_no;
    copyOperation.current = operation;
    copyInFlight.current = true;
    try {
      await navigator.clipboard.writeText(text);
      if (copyOperation.current !== operation || currentOrderNo.current !== sourceOrderNo) return;

      setCopiedTarget(target);
      toast.success(target === "all" ? "全部发货内容已复制" : "该条发货内容已复制");

      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current);
      }
      copyResetTimer.current = window.setTimeout(() => {
        if (copyOperation.current === operation) {
          setCopiedTarget(null);
        }
      }, 1800);
    } catch {
      if (copyOperation.current === operation && currentOrderNo.current === sourceOrderNo) {
        toast.error("复制失败，请选中文本后手动复制");
      }
    } finally {
      if (copyOperation.current === operation) {
        copyInFlight.current = false;
      }
    }
  }

  const statusCard = (
    <Card
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`shadow-none ${status.cardClass}`}
    >
      <CardContent className={compact ? "p-4" : "p-5 sm:p-6"}>
        <div className="flex items-start gap-4">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-md shadow-sm ${status.iconClass}`}
          >
            <StatusIcon
              className={`h-5 w-5 ${confirmingPayment ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className={`text-xs font-semibold ${status.eyebrowClass}`}>{status.eyebrow}</p>
            <h2 className={`${compact ? "text-base" : "text-lg sm:text-xl"} mt-1 font-bold text-slate-950`}>
              {status.title}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">{status.description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (compact) {
    return (
      <div className="space-y-3">
        {statusCard}
        {delivered ? (
          <Button asChild className="h-11 w-full bg-emerald-700 shadow-none hover:bg-emerald-800">
            <Link href={`/orders/${encodeURIComponent(order.out_trade_no)}`}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              查看并复制发货内容
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshStatus({
              showFeedback: true,
              retryFulfillment: paid && !delivered,
              verifyPayment: !paid,
            })}
            disabled={refreshing}
            className="h-11 w-full shadow-none"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            {refreshing
              ? "正在刷新"
              : deliveryFailed
                ? "重试发货"
                : confirmingPayment
                  ? "立即核实支付结果"
                : expired
                  ? "重新核实支付结果"
                  : "我已支付，立即核实"}
          </Button>
        )}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          支付结果由服务端安全验证
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {statusCard}

      {paid ? (
        <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.07)]">
          <CardHeader className="gap-4 p-5 pb-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:p-6 sm:pb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-slate-700" aria-hidden="true" />
                <CardTitle className="text-lg font-bold tracking-normal text-slate-950">
                  {delivered ? "你的发货内容" : deliveryFailed ? "等待补货发货" : "正在准备发货内容"}
                </CardTitle>
              </div>
              <CardDescription className="mt-1.5 leading-6">
                {delivered
                  ? order.delivery_content.length > 1
                    ? `共 ${order.delivery_content.length} 份内容，请逐项保存`
                    : "卡密已经生成，请及时保存"
                  : deliveryFailed
                    ? "补货后刷新订单，系统会再次尝试发货"
                    : "系统正在分配库存，请稍候"}
              </CardDescription>
            </div>
            {delivered && order.delivery_content.length > 0 ? (
              <Button
                type="button"
                onClick={() => void copyText(order.delivery_content.join("\n"), "all")}
                className="h-11 w-full shrink-0 bg-emerald-700 shadow-none hover:bg-emerald-800 sm:h-10 sm:w-auto"
              >
                {copiedTarget === "all" ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copiedTarget === "all" ? "已复制" : order.delivery_content.length > 1 ? "复制全部" : "复制卡密"}
              </Button>
            ) : null}
          </CardHeader>

          <CardContent className="px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
            {delivered && order.delivery_content.length > 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 md:max-h-[min(32rem,60dvh)] md:overflow-y-auto md:overscroll-contain">
                {order.delivery_content.map((content, index) => (
                  <div
                    key={`${index}-${content.slice(0, 24)}`}
                    className="flex min-w-0 items-start gap-3 border-b border-slate-200 px-4 py-4 last:border-b-0"
                  >
                    {order.delivery_content.length > 1 ? (
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-slate-200 text-xs font-bold text-slate-600">
                        {index + 1}
                      </span>
                    ) : null}
                    <pre className="m-0 min-w-0 flex-1 select-text whitespace-pre-wrap break-words font-mono text-sm leading-6 text-slate-900 [overflow-wrap:anywhere] sm:text-[15px]">
                      {content}
                    </pre>
                    {order.delivery_content.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void copyText(content, index)}
                        className="h-11 w-11 shrink-0 text-slate-500 hover:bg-white hover:text-slate-900"
                        aria-label={`复制第 ${index + 1} 份发货内容`}
                      >
                        {copiedTarget === index ? (
                          <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : delivered ? (
              <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                发货记录暂未同步，请刷新订单状态后再试。
              </div>
            ) : waitingDelivery ? (
              <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4" aria-hidden="true">
                <Skeleton className="h-4 w-2/3 bg-slate-200" />
                <Skeleton className="h-4 w-5/6 bg-slate-200" />
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                已确认付款，当前没有可用库存。补货后刷新订单即可再次尝试发货。
              </div>
            )}

            <div className="mt-4 flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              请妥善保管发货内容，不要转发给他人。
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          {!paid && !expired && !confirmingPayment ? (
            <Button asChild className="h-11 bg-sky-700 shadow-none hover:bg-sky-800 sm:h-10">
              <Link href={`/pay/${encodeURIComponent(order.out_trade_no)}`}>
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                继续支付
              </Link>
            </Button>
          ) : null}
          {!delivered ? (
            <Button
              type="button"
              variant={paid || confirmingPayment ? "default" : "outline"}
              onClick={() => void refreshStatus({
                showFeedback: true,
                retryFulfillment: paid && !delivered,
                verifyPayment: !paid,
              })}
              disabled={refreshing}
              className={deliveryFailed
                ? "h-11 bg-amber-700 shadow-none hover:bg-amber-800 sm:h-10"
                : waitingDelivery || confirmingPayment
                  ? "h-11 bg-sky-700 shadow-none hover:bg-sky-800 sm:h-10"
                  : "h-11 shadow-none sm:h-10"}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              {refreshing
                ? "正在刷新"
                : deliveryFailed
                  ? "重试发货"
                  : confirmingPayment
                    ? "立即核实支付结果"
                  : expired
                    ? "重新核实支付结果"
                    : "我已支付，立即核实"}
            </Button>
          ) : delivered ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void refreshStatus({ showFeedback: true })}
              disabled={refreshing}
              className="justify-start px-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              {refreshing ? "正在刷新" : "刷新状态"}
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 sm:justify-end">
          <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          支付结果由服务端安全验证
        </div>
      </div>
    </div>
  );
}
