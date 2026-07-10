import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, Home, ReceiptText } from "lucide-react";
import { OrderStatusPanel } from "@/components/order-status-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOrderViewWithSession } from "@/lib/orders";
import { getOrderSessionToken } from "@/lib/order-access";

export const dynamic = "force-dynamic";

type OrderPageProps = {
  params: {
    out_trade_no: string;
  };
};

export default async function OrderPage({ params }: OrderPageProps) {
  const sessionToken = getOrderSessionToken();
  const order = await getOrderViewWithSession(params.out_trade_no, sessionToken);

  if (!order) {
    redirect(`/orders/query?order=${encodeURIComponent(params.out_trade_no)}`);
  }

  const paid = order.status === "paid";
  const payHref = "/pay/" + encodeURIComponent(order.out_trade_no);

  return (
    <main className="page-shell px-3 py-5 sm:px-4 sm:py-8">
      <section className="admin-panel mx-auto w-full max-w-6xl overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-5 sm:px-6">
          <Badge className={paid ? "bg-emerald-600" : "bg-sky-600"}>
            {paid ? "支付成功" : "订单追踪"}
          </Badge>
          <h1 className="mt-2.5 line-clamp-2 text-xl font-bold text-slate-950 sm:text-2xl">
            {order.product_name}
          </h1>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">{order.out_trade_no}</p>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(400px,0.85fr)]">
          <div className="min-w-0 p-4 sm:p-6">
            <div className="grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 sm:grid-cols-3">
              <SummaryMetric label="实付金额" value={`¥${Number(order.money).toFixed(2)}`} accent />
              <SummaryMetric label="购买数量" value={`${order.quantity} 件`} />
              <SummaryMetric
                label="支付方式"
                value={order.pay_type === "wxpay" ? "微信支付" : "支付宝"}
              />
            </div>

            <div className="mt-6 border-b border-slate-200 pb-2">
              <h2 className="text-sm font-bold text-slate-900">订单信息</h2>
              <p className="mt-0.5 text-xs text-slate-500">订单编号、支付流水与时间记录</p>
            </div>
            <dl className="grid text-sm">
              <OrderLine label="订单编号" value={order.out_trade_no} mono />
              {order.trade_no ? <OrderLine label="平台流水" value={order.trade_no} mono /> : null}
              <OrderLine label="创建时间" value={new Date(order.created_at).toLocaleString("zh-CN")} />
              {paid && order.paid_at ? (
                <OrderLine label="付款时间" value={new Date(order.paid_at).toLocaleString("zh-CN")} />
              ) : (
                <OrderLine label="过期时间" value={new Date(order.expires_at).toLocaleString("zh-CN")} />
              )}
            </dl>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {!paid ? (
                <Button asChild className="flex-1 shadow-none">
                  <Link href={payHref}>
                    <CreditCard className="h-4 w-4" />
                    继续支付
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline" className="flex-1">
                <Link href="/">
                  <Home className="h-4 w-4" />
                  返回商品
                </Link>
              </Button>
            </div>
          </div>

          <aside className="min-w-0 border-t border-slate-200 bg-slate-50/60 p-4 sm:p-6 lg:border-l lg:border-t-0">
            <div className="mb-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-700">
                <ReceiptText className="h-4 w-4" />
                状态与发货
              </div>
              <h2 className="mt-1 text-lg font-bold text-slate-950">订单处理进度</h2>
            </div>
            <OrderStatusPanel initial_order={order} />
          </aside>
        </div>
      </section>
    </main>
  );
}

function SummaryMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-white px-4 py-3.5">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold ${accent ? "text-sky-600" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function OrderLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 py-3 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-start sm:gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`break-all font-semibold text-slate-800 sm:text-right ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
