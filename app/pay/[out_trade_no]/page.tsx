import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CreditCard,
  ExternalLink,
  ReceiptText,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { OrderStatusPanel } from "@/components/order-status-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildMapaySubmitUrl } from "@/lib/mapay";
import { getOrderViewWithAccess } from "@/lib/orders";

export const dynamic = "force-dynamic";

type PayPageProps = {
  params: {
    out_trade_no: string;
  };
  searchParams?: {
    token?: string;
  };
};

function getRequestOrigin() {
  const headerList = headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return protocol + "://" + host;
}

export default async function PayPage({ params, searchParams }: PayPageProps) {
  const accessToken = searchParams?.token ?? "";
  const order = await getOrderViewWithAccess(params.out_trade_no, accessToken);

  if (!order) {
    notFound();
  }

  let paymentUrl = "";
  let configError = "";

  try {
    paymentUrl = buildMapaySubmitUrl({
      order,
      pay_type: order.pay_type,
      request_origin: getRequestOrigin(),
      access_token: accessToken,
    });
  } catch {
    configError = "支付配置未就绪，请检查 MAPAY_PID、MAPAY_KEY 和通道配置。";
  }

  const statusHref =
    "/orders/" +
    encodeURIComponent(order.out_trade_no) +
    "?token=" +
    encodeURIComponent(accessToken);

  return (
    <main className="min-h-screen bg-[#eef9ff] px-4 py-8 text-[#162238]">
      <section className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="rounded-lg border border-sky-100 bg-white p-6 shadow-[0_18px_45px_rgba(14,116,144,0.10)]">
          <div className="mb-6 flex items-center justify-between gap-3">
            <Badge className="bg-sky-500">订单详情</Badge>
            <ReceiptText className="h-9 w-9 text-sky-500" />
          </div>

          <div className="rounded-md bg-sky-50 p-5">
            <div className="text-sm text-slate-500">支付金额</div>
            <div className="mt-2 text-6xl font-bold tracking-normal text-rose-500">
              ¥{Number(order.money).toFixed(2)}
            </div>
          </div>

          <dl className="mt-6 grid gap-4 text-sm">
            <OrderField label="商品名称" value={order.product_name} />
            <OrderField label="订单编号" value={order.out_trade_no} />
            <OrderField label="购买数量" value={order.quantity + " 件"} />
            <OrderField label="支付方式" value={order.pay_type === "wxpay" ? "微信支付" : "支付宝"} />
            <OrderField label="创建时间" value={new Date(order.created_at).toLocaleString("zh-CN")} />
          </dl>

          <div className="mt-6 rounded-md border border-sky-100 bg-sky-50/70 p-4 text-sm leading-7 text-slate-600">
            <div className="mb-1 flex items-center gap-2 font-bold text-slate-800">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              安全提示
            </div>
            支付完成后以本站后端验签和主动查询为准，单纯返回页面不会改变订单状态。
          </div>
        </aside>

        <section className="rounded-lg border border-sky-100 bg-white p-6 shadow-[0_18px_45px_rgba(14,116,144,0.10)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                下一步
              </Badge>
              <h1 className="mt-3 text-2xl font-bold">前往码支付收银台</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                点击按钮后会进入码支付页面。完成付款后回到本站，这里会自动轮询本站后端接口确认到账。
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                返回商品
              </Link>
            </Button>
          </div>

          <div className="mt-7 grid gap-5 xl:grid-cols-[1fr_360px]">
            <div className="rounded-md border border-sky-100 bg-sky-50 p-6 text-center">
              <CreditCard className="mx-auto h-16 w-16 text-sky-500" strokeWidth={1.4} />
              <h2 className="mt-4 text-xl font-bold">准备支付</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                订单有效期内完成付款即可自动发货；如果外部页面没有自动返回，可回到这个页面刷新状态。
              </p>

              <div className="mx-auto mt-6 max-w-sm">
                {configError ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {configError}
                  </div>
                ) : (
                  <Button asChild size="lg" className="w-full bg-sky-500 shadow-none hover:bg-sky-600">
                    <a href={paymentUrl}>
                      <CreditCard className="h-4 w-4" />
                      立即支付
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                <Button asChild variant="ghost" className="mt-2 w-full">
                  <Link href={statusHref}>只查看订单状态</Link>
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-sky-100 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                <Timer className="h-4 w-4 text-sky-500" />
                状态追踪
              </div>
              <OrderStatusPanel initial_order={order} access_token={accessToken} compact />
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function OrderField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-sky-100 pb-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 break-all font-semibold">{value}</dd>
    </div>
  );
}
