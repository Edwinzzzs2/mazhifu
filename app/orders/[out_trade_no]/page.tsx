import Link from "next/link";
import { redirect } from "next/navigation";
import { Home, ReceiptText } from "lucide-react";
import { OrderStatusPanel } from "@/components/order-status-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getOrderSessionToken } from "@/lib/order-access";
import { toOrderStatusView } from "@/lib/order-status-view";
import { getOrderViewWithSession } from "@/lib/orders";

export const dynamic = "force-dynamic";

type OrderPageProps = {
  params: {
    out_trade_no: string;
  };
  searchParams?: {
    payment?: string;
  };
};

export default async function OrderPage({ params, searchParams }: OrderPageProps) {
  const sessionToken = getOrderSessionToken();
  const order = await getOrderViewWithSession(params.out_trade_no, sessionToken);

  if (!order) {
    redirect(`/orders/query?order=${encodeURIComponent(params.out_trade_no)}`);
  }

  const orderView = toOrderStatusView(order);
  const paymentName = orderView.pay_type === "wxpay" ? "微信支付" : "支付宝";

  return (
    <main className="page-shell px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="border-b border-slate-200 pb-6 sm:pb-7">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
            <ReceiptText className="h-4 w-4" aria-hidden="true" />
            订单详情
          </div>
          <h1 className="mt-2.5 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {orderView.product_name}
          </h1>
          <p className="mt-2 flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:items-center sm:gap-2">
            <span>订单编号</span>
            <span className="break-all font-mono text-slate-600">{orderView.out_trade_no}</span>
          </p>
        </header>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
          <section className="min-w-0" aria-label="订单状态与发货内容">
            <OrderStatusPanel
              initial_order={orderView}
              payment_returned={searchParams?.payment === "confirming"}
            />
          </section>

          <aside className="min-w-0">
            <Card className="border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.06)] lg:sticky lg:top-6">
              <CardHeader className="p-5 pb-4">
                <h2 className="text-base font-bold text-slate-950">订单摘要</h2>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-0">
                <dl className="space-y-4 text-sm">
                  <SummaryRow label="实付金额" value={`¥${orderView.money}`} strong />
                  <SummaryRow label="购买数量" value={`${orderView.quantity} 件`} />
                  <SummaryRow label="支付方式" value={paymentName} />
                </dl>

                <Separator className="my-5 bg-slate-200" />

                <h3 className="text-sm font-bold text-slate-900">订单与支付</h3>
                <dl className="mt-4 space-y-4">
                  {orderView.trade_no ? <DetailItem label="平台流水" value={orderView.trade_no} mono /> : null}
                  <DetailItem label="创建时间" value={formatDate(orderView.created_at)} />
                  {orderView.status === "paid" && orderView.paid_at ? (
                    <DetailItem label="付款时间" value={formatDate(orderView.paid_at)} />
                  ) : (
                    <DetailItem label="过期时间" value={formatDate(orderView.expires_at)} />
                  )}
                  {orderView.fulfilled_at ? (
                    <DetailItem label="发货时间" value={formatDate(orderView.fulfilled_at)} />
                  ) : null}
                </dl>

                <Button
                  asChild
                  variant="outline"
                  className="mt-6 h-11 w-full shadow-none hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 sm:h-10"
                >
                  <Link href="/">
                    <Home className="h-4 w-4" aria-hidden="true" />
                    返回商品
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className={strong ? "tabular-nums text-lg font-bold text-slate-950" : "font-semibold text-slate-800"}>
        {value}
      </dd>
    </div>
  );
}

function DetailItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 break-all text-sm font-semibold leading-5 tabular-nums text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}
