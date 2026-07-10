import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, Home, ReceiptText } from "lucide-react";
import { OrderStatusPanel } from "@/components/order-status-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOrderViewWithAccess } from "@/lib/orders";
import { getOrderAccessToken } from "@/lib/order-access";

export const dynamic = "force-dynamic";

type OrderPageProps = {
  params: {
    out_trade_no: string;
  };
};

export default async function OrderPage({ params }: OrderPageProps) {
  const accessToken = getOrderAccessToken(params.out_trade_no);
  const order = await getOrderViewWithAccess(params.out_trade_no, accessToken);

  if (!order) {
    notFound();
  }

  const paid = order.status === "paid";
  const payHref = "/pay/" + encodeURIComponent(order.out_trade_no);

  return (
    <main className="page-shell px-3 py-5 sm:px-4 sm:py-8">
      <section className="admin-panel mx-auto w-full max-w-4xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <Badge className={paid ? "bg-emerald-500" : "bg-sky-500"}>
              {paid ? "支付成功" : "订单追踪"}
            </Badge>
            <h1 className="mt-3 line-clamp-2 text-xl font-bold sm:text-2xl">{order.product_name}</h1>
            <p className="mt-1 break-all text-sm text-slate-500">{order.out_trade_no}</p>
          </div>
          {paid ? (
            <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-500" />
          ) : (
            <Clock3 className="h-10 w-10 shrink-0 text-sky-500" />
          )}
        </div>

        <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
          <div className="space-y-5">
            <div className="admin-panel-muted p-5">
              <div className="text-sm text-slate-500">实付金额</div>
              <div className="mt-2 text-4xl font-bold text-sky-500 sm:text-5xl">
                ¥{Number(order.money).toFixed(2)}
              </div>
            </div>

            <dl className="grid gap-3 rounded-md border border-slate-200 bg-white p-5 text-sm shadow-sm">
              <OrderLine label="商品名称" value={order.product_name} />
              <OrderLine label="购买数量" value={order.quantity + " 件"} />
              <OrderLine label="支付方式" value={order.pay_type === "wxpay" ? "微信支付" : "支付宝"} />
              <OrderLine label="创建时间" value={new Date(order.created_at).toLocaleString("zh-CN")} />
              <OrderLine label="过期时间" value={new Date(order.expires_at).toLocaleString("zh-CN")} />
              {order.trade_no ? <OrderLine label="平台流水" value={order.trade_no} /> : null}
            </dl>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1 bg-sky-600 shadow-none hover:bg-sky-700">
                <Link href="/">
                  <Home className="h-4 w-4" />
                  返回商品
                </Link>
              </Button>
              {!paid ? (
                <Button asChild variant="outline" className="flex-1">
                  <Link href={payHref}>
                    <ArrowLeft className="h-4 w-4" />
                    返回支付页
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          <aside className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold">
              <ReceiptText className="h-4 w-4 text-sky-500" />
              订单状态
            </div>
            <OrderStatusPanel initial_order={order} />
          </aside>
        </div>
      </section>
    </main>
  );
}

function OrderLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-sky-100 pb-3 last:border-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-all text-right font-semibold">{value}</dd>
    </div>
  );
}
