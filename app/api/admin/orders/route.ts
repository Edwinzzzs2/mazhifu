import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { listOrdersForAdmin } from "@/lib/orders";

const VALID_FULFILLMENT_STATUSES = new Set(["", "pending", "delivered", "failed"]);

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

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const status = url.searchParams.get("status") ?? "";
  const q = url.searchParams.get("q") ?? "";
  const sort = url.searchParams.get("sort") ?? "created_desc";
  const productId = url.searchParams.get("product_id") ?? "";
  const fulfillmentStatus = url.searchParams.get("fulfillment_status") ?? "";

  if (!VALID_FULFILLMENT_STATUSES.has(fulfillmentStatus)) {
    return NextResponse.json({ message: "invalid fulfillment status" }, { status: 400 });
  }

  try {
    const result = await listOrdersForAdmin(
      page,
      status,
      q,
      sort,
      productId,
      fulfillmentStatus,
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "查询订单失败";
    return NextResponse.json({ message }, { status: 500 });
  }
}
