import { NextResponse } from "next/server";
import {
  getInstanceGeneralSettings,
  isAdminAuthenticated,
  updateInstanceGeneralSettings,
} from "@/lib/admin-auth";

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

  const settings = await getInstanceGeneralSettings();
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const settings = await updateInstanceGeneralSettings((await request.json()) as Record<string, unknown>);
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存访问设置失败";
    return NextResponse.json({ message }, { status: 400 });
  }
}
