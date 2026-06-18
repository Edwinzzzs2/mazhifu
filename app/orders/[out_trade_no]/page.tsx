import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, Home, ReceiptText } from "lucide-react";
import { OrderStatusPanel } from "@/components/order-status-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOrderViewWithAccess } from "@/lib/orders";

export const dynamic = "force-dynamic";

type OrderPageProps = {
  params: {
    out_trade_no: string;
  };
  searchParams?: {
    token?: string;
  };
};

export default async function OrderPage({ params, searchParams }: OrderPageProps) {
  const accessToken = searchParams?.token ?? "";
  const order = await getOrderViewWithAccess(params.out_trade_no, accessToken);

  if (!order) {
    notFound();
  }

  const paid = order.status === "paid";
  const payHref =
    "/pay/" +
    encodeURIComponent(order.out_trade_no) +
    "?token=" +
    encodeURIComponent(accessToken);

  return (
    <main className="min-h-screen bg-[#eef9ff] px-4 py-8 text-[#162238]">
      <section className="mx-auto w-full max-w-4xl overflow-hidden rounded-lg border border-sky-100 bg-white shadow-[0_18px_45px_rgba(14,116,144,0.12)]">
        <div className="flex items-center justify-between gap-4 border-b border-sky-100 px-6 py-5">
          <div>
            <Badge className={paid ? "bg-emerald-500" : "bg-sky-500"}>
              {paid ? "支付成功" : "订单追踪"}
            </Badge>
            <h1 className="mt-3 text-2xl font-bold">{order.product_name}</h1>
            <p className="mt-1 break-all text-sm text-slate-500">{order.out_trade_no}</p>
          </div>
          {paid ? (
            <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-500" />
          ) : (
            <Clock3 className="h-10 w-10 shrink-0 text-sky-500" />
          )}
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <div className="rounded-md bg-sky-50 p-5">
              <div className="text-sm text-slate-500">实付金额</div>
              <div className="mt-2 text-5xl font-bold text-sky-500">
                ¥{Number(order.money).toFixed(2)}
              </div>
            </div>

            <dl className="grid gap-3 rounded-md border border-sky-100 p-5 text-sm">
              <OrderLine label="商品名称" value={order.product_name} />
              <OrderLine label="购买数量" value={order.quantity + " 件"} />
              <OrderLine label="支付方式" value={order.pay_type === "wxpay" ? "微信支付" : "支付宝"} />
              <OrderLine label="创建时间" value={new Date(order.created_at).toLocaleString("zh-CN")} />
              <OrderLine label="过期时间" value={new Date(order.expires_at).toLocaleString("zh-CN")} />
              {order.trade_no ? <OrderLine label="平台流水" value={order.trade_no} /> : null}
            </dl>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1 bg-sky-500 shadow-none hover:bg-sky-600">
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

          <aside className="rounded-md border border-sky-100 bg-white p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold">
              <ReceiptText className="h-4 w-4 text-sky-500" />
              订单状态
            </div>
            <OrderStatusPanel initial_order={order} access_token={accessToken} />
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
