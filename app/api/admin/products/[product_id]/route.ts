import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { parseProductInput } from "@/lib/product-input";
import { deactivateProduct, updateProduct } from "@/lib/products";

type ProductRouteContext = {
  params: {
    product_id: string;
  };
};

async function adminAllowed(request: Request) {
  try {
    return await isAdminAuthenticated(request);
  } catch {
    return false;
  }
}

export async function PATCH(request: Request, { params }: ProductRouteContext) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const input = parseProductInput((await request.json()) as Record<string, unknown>);
    const product = await updateProduct(params.product_id, input);
    if (!product) {
      return NextResponse.json({ message: "商品不存在" }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新商品失败";
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: ProductRouteContext) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const deleted = await deactivateProduct(params.product_id);
  return NextResponse.json({ success: deleted }, { status: deleted ? 200 : 404 });
}
