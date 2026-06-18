import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type QueryOrderPageProps = {
  searchParams?: {
    order_link?: string;
    out_trade_no?: string;
    token?: string;
  };
};

function parseOrderLink(orderLink: string) {
  try {
    const url = new URL(orderLink, "http://localhost");
    const match = url.pathname.match(/\/(?:pay|orders)\/([^/]+)/);
    const token = url.searchParams.get("token");
    if (match?.[1] && token) {
      return {
        out_trade_no: match[1],
        token,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export default function QueryOrderPage({ searchParams }: QueryOrderPageProps) {
  const orderLink = searchParams?.order_link?.trim() ?? "";
  const outTradeNo = searchParams?.out_trade_no?.trim() ?? "";
  const token = searchParams?.token?.trim() ?? "";

  if (orderLink) {
    const parsed = parseOrderLink(orderLink);
    if (parsed) {
      redirect(
        "/orders/" +
          encodeURIComponent(parsed.out_trade_no) +
          "?token=" +
          encodeURIComponent(parsed.token),
      );
    }
  }

  if (outTradeNo && token) {
    redirect("/orders/" + encodeURIComponent(outTradeNo) + "?token=" + encodeURIComponent(token));
  }

  const hasQuery = Boolean(orderLink || outTradeNo || token);

  return (
    <main className="grid min-h-screen place-items-center bg-[#eef9ff] px-4 text-[#162238]">
      <section className="w-full max-w-xl rounded-lg border border-sky-100 bg-white p-6 shadow-[0_18px_45px_rgba(14,116,144,0.12)]">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-sky-600">
              <Search className="h-4 w-4" />
              订单查询
            </div>
            <h1 className="mt-2 text-2xl font-bold">粘贴订单访问链接</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              为了避免订单被撞库查询，状态页需要订单号和下单时生成的访问 token。
            </p>
          </div>
          <ShieldCheck className="h-10 w-10 shrink-0 text-emerald-500" />
        </div>

        <form method="get" className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold">
            订单链接
            <input
              className="admin-input"
              name="order_link"
              placeholder="粘贴 /pay/... 或 /orders/... 的完整链接"
            />
          </label>

          <div className="grid gap-3 rounded-md border border-sky-100 bg-sky-50 p-4">
            <div className="text-sm font-bold">也可以手动输入</div>
            <input className="admin-input" name="out_trade_no" placeholder="订单号" />
            <input className="admin-input" name="token" placeholder="访问 token" />
          </div>

          {hasQuery ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              没解析到有效订单链接，请确认链接里带有 token 参数。
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1 bg-sky-500 shadow-none hover:bg-sky-600">
              <Search className="h-4 w-4" />
              查询订单
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                返回商品
              </Link>
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
