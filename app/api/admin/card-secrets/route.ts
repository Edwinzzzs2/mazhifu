import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  getCardSecretStats,
  importCardSecrets,
  listCardSecrets,
} from "@/lib/card-secrets";
import type {
  CardSecretSortKey,
  CardSecretStatus,
  SortDirection,
} from "@/lib/card-secrets";

const CARD_STATUSES = new Set<CardSecretStatus>(["available", "reserved", "used"]);
const SORT_KEYS = new Set<CardSecretSortKey>(["created_at", "id", "status", "batch_no"]);

async function adminAllowed(request: Request) {
  try {
    return await isAdminAuthenticated(request);
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

async function listResponse(payload: Record<string, unknown>) {
  const productId = String(payload.product_id ?? "").trim();
  const status = String(payload.status ?? "");
  const query = String(payload.q ?? "");
  const batch = payload.batch === undefined ? undefined : String(payload.batch);
  const unbatched = payload.unbatched === true || payload.unbatched === "1";
  const page = Number(payload.page ?? 1);
  const requestedSort = String(payload.sort ?? "created_at");
  const requestedDirection = String(payload.direction ?? "desc");

  if (!productId) {
    return NextResponse.json({ message: "product_id_required" }, { status: 400 });
  }
  if (status && !CARD_STATUSES.has(status as CardSecretStatus)) {
    return NextResponse.json({ message: "invalid_status" }, { status: 400 });
  }
  if (!SORT_KEYS.has(requestedSort as CardSecretSortKey)) {
    return NextResponse.json({ message: "invalid_sort" }, { status: 400 });
  }
  if (requestedDirection !== "asc" && requestedDirection !== "desc") {
    return NextResponse.json({ message: "invalid_direction" }, { status: 400 });
  }
  if (unbatched && batch !== undefined) {
    return NextResponse.json({ message: "invalid_batch_filter" }, { status: 400 });
  }

  try {
    const [cardSecrets, stats] = await Promise.all([
      listCardSecrets({
        product_id: productId,
        status,
        query,
        batch,
        unbatched,
        page,
        sort_key: requestedSort as CardSecretSortKey,
        sort_direction: requestedDirection as SortDirection,
      }),
      getCardSecretStats(productId),
    ]);

    return NextResponse.json({
      ...cardSecrets,
      stats,
      sort: requestedSort,
      direction: requestedDirection,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取库存失败";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  return listResponse({
    product_id: url.searchParams.get("product_id") ?? "",
    status: url.searchParams.get("status") ?? "",
    q: url.searchParams.get("q") ?? "",
    ...(url.searchParams.has("batch") ? { batch: url.searchParams.get("batch") ?? "" } : {}),
    unbatched: url.searchParams.get("unbatched") === "1",
    page: url.searchParams.get("page") ?? 1,
    sort: url.searchParams.get("sort") ?? "created_at",
    direction: url.searchParams.get("direction") ?? "desc",
  });
}

export async function POST(request: Request) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ message: "invalid_payload" }, { status: 400 });
    }
    const payload = parsed as Record<string, unknown>;
    if (payload.action === "list") {
      return listResponse(payload);
    }
    if (payload.action !== undefined && payload.action !== "import") {
      return NextResponse.json({ message: "invalid_action" }, { status: 400 });
    }
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
