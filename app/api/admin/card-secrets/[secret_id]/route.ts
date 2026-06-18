import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { deleteCardSecret } from "@/lib/card-secrets";

type CardSecretRouteContext = {
  params: {
    secret_id: string;
  };
};

function adminAllowed() {
  try {
    return isAdminAuthenticated();
  } catch {
    return false;
  }
}

export async function DELETE(_request: Request, { params }: CardSecretRouteContext) {
  if (!adminAllowed()) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const deleted = await deleteCardSecret(params.secret_id);
  return NextResponse.json({ success: deleted }, { status: deleted ? 200 : 409 });
}
