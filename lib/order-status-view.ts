import type { FulfillmentStatus, OrderStatus, OrderView } from "@/lib/orders";

export type OrderStatusView = {
  out_trade_no: string;
  product_name: string;
  money: string;
  quantity: number;
  pay_type: string;
  status: OrderStatus;
  fulfillment_status: FulfillmentStatus;
  trade_no: string | null;
  delivery_content: string[];
  created_at: string;
  expires_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
};

export function toOrderStatusView(order: OrderView): OrderStatusView {
  return {
    out_trade_no: order.out_trade_no,
    product_name: order.product_name,
    money: Number(order.money).toFixed(2),
    quantity: order.quantity,
    pay_type: order.pay_type,
    status: order.status,
    fulfillment_status: order.fulfillment_status,
    trade_no: order.status === "paid" ? order.trade_no : null,
    delivery_content: order.delivery_content,
    created_at: new Date(order.created_at).toISOString(),
    expires_at: new Date(order.expires_at).toISOString(),
    paid_at: order.paid_at ? new Date(order.paid_at).toISOString() : null,
    fulfilled_at: order.fulfilled_at ? new Date(order.fulfilled_at).toISOString() : null,
  };
}
