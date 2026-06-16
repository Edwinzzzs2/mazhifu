import { CreditCard, PackageCheck, ShieldCheck, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { products } from "@/lib/products";

type HomePageProps = {
  searchParams?: {
    checkout?: string;
  };
};

export default function HomePage({ searchParams }: HomePageProps) {
  const checkoutMessage =
    searchParams?.checkout === "failed" ? "支付配置或数据库连接未就绪，请检查 env。" : "";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-5 md:px-8 md:py-8">
      {checkoutMessage ? (
        <div className="rounded-lg border border-destructive bg-card px-4 py-3 text-sm text-destructive">
          {checkoutMessage}
        </div>
      ) : null}

      <section className="shop-frame flex flex-col gap-5 rounded-lg p-4 md:flex-row md:items-end md:justify-between md:p-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">即时发卡</Badge>
            <Badge>码支付</Badge>
          </div>
          <div>
            <h1 className="font-display text-4xl leading-tight md:text-6xl">码支付卡密铺</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              预置商品已接入 PG 订单和 MD5 签名跳转支付，默认测试价 0.10 元。
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs md:min-w-80">
          <div className="rounded-md border bg-card p-3">
            <PackageCheck className="mx-auto mb-1 h-5 w-5 text-primary" />
            <span>预制商品</span>
          </div>
          <div className="rounded-md border bg-card p-3">
            <CreditCard className="mx-auto mb-1 h-5 w-5 text-accent" />
            <span>跳转支付</span>
          </div>
          <div className="rounded-md border bg-card p-3">
            <ShieldCheck className="mx-auto mb-1 h-5 w-5 text-primary" />
            <span>通知验签</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {products.map((product) => (
          <Card key={product.id} className="flex min-h-[360px] flex-col shadow-crisp">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription>{product.description}</CardDescription>
                </div>
                <Badge variant={product.badgeVariant}>{product.badge}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-5">
              <div className="rounded-md border bg-muted/45 p-4">
                <div className="text-sm text-muted-foreground">售价</div>
                <div className="mt-1 flex items-end gap-1">
                  <span className="font-display text-5xl leading-none">¥{product.money}</span>
                  <span className="pb-1 text-sm text-muted-foreground">/ 件</span>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {product.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="block">
              <Separator className="mb-4" />
              <form action="/api/checkout" method="post" className="flex gap-2">
                <input type="hidden" name="product_id" value={product.id} />
                <label className="sr-only" htmlFor={`pay-type-${product.id}`}>
                  支付方式
                </label>
                <select
                  id={`pay-type-${product.id}`}
                  name="pay_type"
                  defaultValue="alipay"
                  className="h-10 rounded-md border bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="alipay">支付宝</option>
                  <option value="wxpay">微信</option>
                </select>
                <Button type="submit" className="flex-1">
                  <ShoppingCart className="h-4 w-4" />
                  购买
                </Button>
              </form>
            </CardFooter>
          </Card>
        ))}
      </section>
    </main>
  );
}
