import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  getCardSecretStats,
  importCardSecrets,
  listCardSecrets,
} from "@/lib/card-secrets";

function adminAllowed() {
  try {
    return isAdminAuthenticated();
  } catch {
    return false;
  }
}

function normalizeSecrets(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  if (!adminAllowed()) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id") ?? "";
  const status = url.searchParams.get("status") ?? "";

  if (!productId) {
    return NextResponse.json({ message: "product_id_required" }, { status: 400 });
  }

  try {
    const [cardSecrets, stats] = await Promise.all([
      listCardSecrets(productId, status),
      getCardSecretStats(productId),
    ]);

    return NextResponse.json({
      card_secrets: cardSecrets,
      stats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取库存失败";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!adminAllowed()) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const result = await importCardSecrets({
      product_id: String(payload.product_id ?? ""),
      secrets: normalizeSecrets(payload.secrets),
      batch_no: String(payload.batch_no ?? ""),
      note: String(payload.note ?? ""),
      deduplicate: payload.deduplicate !== false,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入发货内容失败";
    return NextResponse.json({ message }, { status: 400 });
  }
}
