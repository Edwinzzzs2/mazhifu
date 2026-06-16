import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, CreditCard, ExternalLink, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { buildMapaySubmitUrl } from "@/lib/mapay";
import { getOrderByOutTradeNo } from "@/lib/orders";

type PayPageProps = {
  params: {
    out_trade_no: string;
  };
};

function getRequestOrigin() {
  const headerList = headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

export default async function PayPage({ params }: PayPageProps) {
  const order = await getOrderByOutTradeNo(params.out_trade_no);

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
    });
  } catch {
    configError = "支付配置未就绪，请检查 MAPAY_PID、MAPAY_KEY 和通道配置。";
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-8">
      <section className="grid w-full gap-4 md:grid-cols-[1.05fr_0.95fr]">
        <Card className="shadow-crisp">
          <CardHeader className="gap-3">
            <div className="flex items-center justify-between gap-3">
              <Badge variant="secondary">确认订单</Badge>
              <ReceiptText className="h-9 w-9 text-primary" />
            </div>
            <div>
              <CardTitle>{order.product_name}</CardTitle>
              <CardDescription>确认无误后再前往码支付收银台</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-md border bg-muted/45 p-4">
              <div className="text-sm text-muted-foreground">应付金额</div>
              <div className="mt-1 font-display text-6xl leading-none">
                ¥{Number(order.money).toFixed(2)}
              </div>
            </div>

            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">订单号</span>
                <span className="break-all text-right font-medium">{order.out_trade_no}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">支付方式</span>
                <span>{order.pay_type === "wxpay" ? "微信" : "支付宝"}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">创建时间</span>
                <span>{new Date(order.created_at).toLocaleString("zh-CN")}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-crisp">
          <CardHeader className="gap-3">
            <div className="flex items-center justify-between gap-3">
              <Badge>下一步</Badge>
              <BadgeCheck className="h-9 w-9 text-accent" />
            </div>
            <div>
              <CardTitle>跳转支付</CardTitle>
              <CardDescription>
                支付宝云端会带入金额和订单留言，完成后回到订单页查看状态。
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {configError ? (
              <div className="rounded-md border border-destructive bg-card px-4 py-3 text-sm text-destructive">
                {configError}
              </div>
            ) : (
              <Button asChild size="lg" className="w-full">
                <a href={paymentUrl}>
                  <CreditCard className="h-4 w-4" />
                  立即支付
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}

            <div className="grid gap-2">
              <Button asChild variant="outline" className="w-full">
                <Link href={`/orders/${order.out_trade_no}`}>查看订单状态</Link>
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link href="/">
                  <ArrowLeft className="h-4 w-4" />
                  返回商品
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
