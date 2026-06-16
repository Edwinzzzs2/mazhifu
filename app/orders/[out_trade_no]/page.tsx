import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock3, Copy, Home } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOrderByOutTradeNo } from "@/lib/orders";

type OrderPageProps = {
  params: {
    out_trade_no: string;
  };
};

export default async function OrderPage({ params }: OrderPageProps) {
  const order = await getOrderByOutTradeNo(params.out_trade_no);

  if (!order) {
    notFound();
  }

  const isPaid = order.status === "paid";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8">
      <Card className="w-full shadow-crisp">
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-3">
            <Badge variant={isPaid ? "default" : "secondary"}>
              {isPaid ? "支付成功" : "等待支付"}
            </Badge>
            {isPaid ? (
              <CheckCircle2 className="h-9 w-9 text-primary" />
            ) : (
              <Clock3 className="h-9 w-9 text-accent" />
            )}
          </div>
          <div>
            <CardTitle>{order.product_name}</CardTitle>
            <CardDescription>订单号 {order.out_trade_no}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 rounded-md border bg-muted/45 p-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-muted-foreground">金额</div>
              <div className="font-display text-3xl">¥{Number(order.money).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">支付方式</div>
              <div className="text-lg">{order.pay_type === "wxpay" ? "微信" : "支付宝"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">平台订单号</div>
              <div className="break-all">{order.trade_no || "-"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">创建时间</div>
              <div>{new Date(order.created_at).toLocaleString("zh-CN")}</div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="flex-1">
              <Link href="/">
                <Home className="h-4 w-4" />
                返回商品
              </Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href={`/orders/${order.out_trade_no}`}>
                <Copy className="h-4 w-4" />
                刷新订单
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
