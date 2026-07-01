import { NextResponse } from "next/server";
import {
  createAdminUser,
  isAdminAuthenticated,
  listAdminUsers,
  type AdminUserRole,
} from "@/lib/admin-auth";

async function adminAllowed() {
  try {
    return await isAdminAuthenticated();
  } catch {
    return false;
  }
}

function normalizeRole(value: unknown): AdminUserRole {
  return value === "ADMIN" ? "ADMIN" : "USER";
}

export async function GET() {
  if (!(await adminAllowed())) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const users = await listAdminUsers();
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  if (!(await adminAllowed())) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const user = await createAdminUser({
      username: String(payload.username ?? ""),
      password: String(payload.password ?? ""),
      display_name: String(payload.display_name ?? ""),
      role: normalizeRole(payload.role),
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建用户失败";
    return NextResponse.json({ message }, { status: 400 });
  }
}
