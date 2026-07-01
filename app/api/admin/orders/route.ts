import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { listOrdersForAdmin } from "@/lib/orders";

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

  try {
    const result = await listOrdersForAdmin(page, status, q);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "查询订单失败";
    return NextResponse.json({ message }, { status: 500 });
  }
}
