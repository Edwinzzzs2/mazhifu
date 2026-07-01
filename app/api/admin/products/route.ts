import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { parseProductInput } from "@/lib/product-input";
import { createProduct, listCategories, listProducts } from "@/lib/products";

async function adminAllowed(request: Request) {
  try {
    return await isAdminAuthenticated(request);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const [products, categories] = await Promise.all([
    listProducts(true),
    listCategories(true),
  ]);
  return NextResponse.json({ products, categories });
}

export async function POST(request: Request) {
  if (!(await adminAllowed(request))) {
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
