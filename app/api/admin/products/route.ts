import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { expirePendingOrders } from "@/lib/orders";
import { parseProductInput } from "@/lib/product-input";
import { createProduct, listCategories, listProducts } from "@/lib/products";

function adminAllowed() {
  try {
    return isAdminAuthenticated();
  } catch {
    return false;
  }
}

export async function GET() {
  if (!adminAllowed()) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  await expirePendingOrders();

  const [products, categories] = await Promise.all([
    listProducts(true),
    listCategories(true),
  ]);
  return NextResponse.json({ products, categories });
}

export async function POST(request: Request) {
  if (!adminAllowed()) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const input = parseProductInput((await request.json()) as Record<string, unknown>);
    const product = await createProduct(input);
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建商品失败";
    return NextResponse.json({ message }, { status: 400 });
  }
}
