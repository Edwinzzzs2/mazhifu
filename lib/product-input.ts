import type { ProductInput } from "@/lib/products";

type ProductPayload = Record<string, unknown>;

function text(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function parseProductInput(payload: ProductPayload): ProductInput {
  const name = text(payload.name, 120);
  const price = Number(payload.price);
  const stock = Number(payload.stock);
  const rawFeatures = Array.isArray(payload.features)
    ? payload.features
    : text(payload.features, 500).split(/\r?\n|,/);
  const features = rawFeatures.map((item) => text(item, 80)).filter(Boolean).slice(0, 8);

  if (!name || !Number.isFinite(price) || price < 0.01 || !Number.isInteger(stock) || stock < 0) {
    throw new Error("商品名称、价格或库存格式不正确");
  }

  const categoryId = text(payload.category_id, 30);
  return {
    category_id: categoryId || null,
    name,
    subtitle: text(payload.subtitle, 160),
    description: text(payload.description, 1000),
    instructions: text(payload.instructions, 5000),
    price: price.toFixed(2),
    stock,
    badge: text(payload.badge, 24),
    image_url: text(payload.image_url, 1000),
    features,
    active: payload.active !== false,
  };
}
