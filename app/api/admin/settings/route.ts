import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getSiteSettings, updateSiteSettings } from "@/lib/site-settings";

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

  const settings = await getSiteSettings();
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const settings = await updateSiteSettings((await request.json()) as Record<string, unknown>);
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存站点设置失败";
    return NextResponse.json({ message }, { status: 400 });
  }
}
