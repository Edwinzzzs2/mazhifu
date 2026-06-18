import { NextResponse } from "next/server";
import { queryMapayOrder } from "@/lib/mapay";
import {
  getOrderViewWithAccess,
  markOrderFromQuery,
  recordOrderQuery,
  retryOrderFulfillment,
} from "@/lib/orders";

type StatusRouteContext = {
  params: {
    out_trade_no: string;
  };
};

export async function GET(request: Request, { params }: StatusRouteContext) {
  const url = new URL(request.url);
  const accessToken = url.searchParams.get("token") ?? "";
  let order = await getOrderViewWithAccess(params.out_trade_no, accessToken);

  if (!order) {
    return NextResponse.json({ message: "order_not_found" }, { status: 404 });
  }

  const lastCheckedAt = order.query_checked_at ? new Date(order.query_checked_at).getTime() : 0;
  const canReconcile = Date.now() - lastCheckedAt >= 15_000;

  if (order.status === "pending" && canReconcile) {
    try {
      // 浏览器只请求本站；Mapay 密钥和主动补单查询都留在服务端执行。
      const result = await queryMapayOrder(order.out_trade_no);
      await recordOrderQuery(order.out_trade_no, result);
      if (
        result.out_trade_no === order.out_trade_no &&
        String(result.pid) === String(process.env.MAPAY_PID) &&
        Number(result.status) === 1
      ) {
        await markOrderFromQuery(result);
      }
      order = (await getOrderViewWithAccess(params.out_trade_no, accessToken)) ?? order;
    } catch (error) {
      console.error("Mapay reconciliation failed", error);
    }
  }

  if (order.status === "paid" && order.fulfillment_status !== "delivered") {
    try {
      await retryOrderFulfillment(order.out_trade_no);
      order = (await getOrderViewWithAccess(params.out_trade_no, accessToken)) ?? order;
    } catch (error) {
      console.error("Order fulfillment retry failed", error);
    }
  }

  return NextResponse.json({
    out_trade_no: order.out_trade_no,
    product_name: order.product_name,
    money: Number(order.money).toFixed(2),
    quantity: order.quantity,
    pay_type: order.pay_type,
    status: order.status,
    fulfillment_status: order.fulfillment_status,
    trade_no: order.status === "paid" ? order.trade_no : null,
    delivery_content: order.delivery_content,
    created_at: order.created_at,
    expires_at: order.expires_at,
    paid_at: order.paid_at,
    fulfilled_at: order.fulfilled_at,
  });
}
