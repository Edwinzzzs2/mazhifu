import { NextResponse } from "next/server";
import {
  isAdminAuthenticated,
  updateAdminUser,
  type AdminUserRole,
  type AdminUserStatus,
} from "@/lib/admin-auth";

type UserRouteContext = {
  params: {
    user_id: string;
  };
};

async function adminAllowed(request: Request) {
  try {
    return await isAdminAuthenticated(request);
  } catch {
    return false;
  }
}

function normalizeRole(value: unknown): AdminUserRole | undefined {
  if (value === "ADMIN" || value === "USER") {
    return value;
  }
  return undefined;
}

function normalizeStatus(value: unknown): AdminUserStatus | undefined {
  if (value === "NORMAL" || value === "ARCHIVED") {
    return value;
  }
  return undefined;
}

export async function PATCH(request: Request, { params }: UserRouteContext) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const userId = Number(params.user_id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ message: "invalid user_id" }, { status: 400 });
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const user = await updateAdminUser(userId, {
      username: typeof payload.username === "string" ? payload.username : undefined,
      password: typeof payload.password === "string" && payload.password ? payload.password : undefined,
      display_name: typeof payload.display_name === "string" ? payload.display_name : undefined,
      role: normalizeRole(payload.role),
      row_status: normalizeStatus(payload.row_status),
    });
    if (!user) {
      return NextResponse.json({ message: "用户不存在" }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新用户失败";
    return NextResponse.json({ message }, { status: 400 });
  }
}
