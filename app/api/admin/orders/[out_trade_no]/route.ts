import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getOrderDetailForAdmin } from "@/lib/orders";

async function adminAllowed(request: Request) {
  try {
    return await isAdminAuthenticated(request);
  } catch {
    return false;
  }
}

export async function GET(
  request: Request,
  { params }: { params: { out_trade_no: string } },
) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const detail = await getOrderDetailForAdmin(params.out_trade_no);
    if (!detail) {
      return NextResponse.json({ message: "订单不存在" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : "查询订单失败";
    return NextResponse.json({ message }, { status: 500 });
  }
}
