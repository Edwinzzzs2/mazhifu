import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { deleteCardSecret } from "@/lib/card-secrets";

type CardSecretRouteContext = {
  params: {
    secret_id: string;
  };
};

async function adminAllowed(request: Request) {
  try {
    return await isAdminAuthenticated(request);
  } catch {
    return false;
  }
}

export async function DELETE(request: Request, { params }: CardSecretRouteContext) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const deleted = await deleteCardSecret(params.secret_id);
  return NextResponse.json({ success: deleted }, { status: deleted ? 200 : 409 });
}
