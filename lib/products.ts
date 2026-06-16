export type Product = {
  id: string;
  name: string;
  description: string;
  money: string;
  badge: string;
  badgeVariant: "default" | "secondary" | "outline";
  features: string[];
};

export const products: Product[] = [
  {
    id: "test-card",
    name: "测试卡密",
    description: "默认 0.10 元商品，用于完整跑通支付链路。",
    money: "0.10",
    badge: "默认",
    badgeVariant: "default",
    features: ["PG 写入订单", "支付成功回调更新", "保留码支付原始通知"],
  },
  {
    id: "demo-vip",
    name: "体验会员卡",
    description: "适合演示卡网商品陈列和跳转支付。",
    money: "0.10",
    badge: "演示",
    badgeVariant: "secondary",
    features: ["支付宝或微信", "订单号自动生成", "金额回调校验"],
  },
  {
    id: "gift-code",
    name: "兑换码礼包",
    description: "预置低价商品，后续可替换成真实库存。",
    money: "0.10",
    badge: "预置",
    badgeVariant: "outline",
    features: ["shadcn 风格组件", "MD5 签名", "异步通知返回 success"],
  },
];

export function findProductById(productId: string) {
  return products.find((product) => product.id === productId);
}
