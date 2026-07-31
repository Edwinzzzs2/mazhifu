import { getPool } from "@/lib/db";
import {
  decryptCardSecret,
  encryptCardSecret,
  hashCardSecret,
} from "@/lib/card-secret-crypto";
import { ensureStoreSchema } from "@/lib/store-schema";

export type CardSecretStatus = "available" | "reserved" | "used";
export type CardSecretSortKey = "created_at" | "id" | "status" | "batch_no";
export type SortDirection = "asc" | "desc";

export type CardSecretRecord = {
  id: string;
  product_id: string;
  secret: string;
  status: CardSecretStatus;
  order_no: string | null;
  batch_no: string;
  note: string;
  reserved_at: string | null;
  used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CardSecretStats = {
  total: number;
  available: number;
  reserved: number;
  used: number;
};

export type CardSecretBatchStats = CardSecretStats & {
  value: string;
  label: string;
  latest_at: string;
};

export type CardSecretListResult = {
  card_secrets: CardSecretRecord[];
  batches: CardSecretBatchStats[];
  total: number;
  page: number;
  page_size: number;
};

export type ListCardSecretsInput = {
  product_id: string;
  status?: string;
  query?: string;
  batch?: string;
  unbatched?: boolean;
  page?: number;
  sort_key?: CardSecretSortKey;
  sort_direction?: SortDirection;
};

type CardSecretRow = Omit<CardSecretRecord, "secret"> & {
  secret_ciphertext: string;
};

export type ImportCardSecretsInput = {
  product_id: string;
  secrets: string[];
  batch_no?: string;
  note?: string;
  deduplicate?: boolean;
};

function normalizeSecrets(secrets: string[], deduplicate = true) {
  const normalized = secrets
    .map((secret) => secret.trim())
    .filter(Boolean)
    .map((secret) => secret.slice(0, 4000));

  if (!deduplicate) {
    return normalized.slice(0, 5000);
  }

  return Array.from(new Set(normalized)).slice(0, 5000);
}

function decryptRow(row: CardSecretRow): CardSecretRecord {
  return {
    id: row.id,
    product_id: row.product_id,
    secret: decryptCardSecret(row.secret_ciphertext),
    status: row.status,
    order_no: row.order_no,
    batch_no: row.batch_no,
    note: row.note,
    reserved_at: row.reserved_at,
    used_at: row.used_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function importCardSecrets(input: ImportCardSecretsInput) {
  await ensureStoreSchema();

  const productId = input.product_id.trim();
  const normalized = normalizeSecrets(input.secrets, input.deduplicate !== false);
  if (!productId || normalized.length === 0) {
    throw new Error("发货内容不能为空");
  }

  const product = await getPool().query<{ id: string }>(
    "SELECT id FROM products WHERE id = $1 LIMIT 1",
    [productId],
  );
  if (!product.rowCount) {
    throw new Error("商品不存在");
  }

  const ciphers = normalized.map((secret) => encryptCardSecret(secret));
  const hashes = normalized.map((secret) => hashCardSecret(secret));
  const batchNo = String(input.batch_no ?? "").trim().slice(0, 80);
  const note = String(input.note ?? "").trim().slice(0, 200);

  const result = await getPool().query<{ id: string }>(
    `
      INSERT INTO card_secrets (
        product_id, secret_ciphertext, secret_hash, status, batch_no, note
      )
      SELECT $1, data.secret_ciphertext, data.secret_hash, 'available', $4, $5
      FROM UNNEST($2::text[], $3::text[]) AS data(secret_ciphertext, secret_hash)
      ON CONFLICT (product_id, secret_hash) DO NOTHING
      RETURNING id::text
    `,
    [productId, ciphers, hashes, batchNo, note],
  );

  return {
    imported_count: result.rowCount ?? 0,
    skipped_count: normalized.length - (result.rowCount ?? 0),
    total_input_count: input.secrets.length,
  };
}

export async function getCardSecretStats(productId: string): Promise<CardSecretStats> {
  await ensureStoreSchema();

  const result = await getPool().query<{ status: CardSecretStatus; total: string }>(
    `
      SELECT status, COUNT(*)::text AS total
      FROM card_secrets
      WHERE product_id = $1
      GROUP BY status
    `,
    [productId],
  );

  const stats: CardSecretStats = {
    total: 0,
    available: 0,
    reserved: 0,
    used: 0,
  };

  result.rows.forEach((row) => {
    const count = Number(row.total);
    stats.total += count;
    if (row.status === "available" || row.status === "reserved" || row.status === "used") {
      stats[row.status] = count;
    }
  });

  return stats;
}

export async function listCardSecrets(input: ListCardSecretsInput): Promise<CardSecretListResult> {
  await ensureStoreSchema();

  const productId = input.product_id.trim();
  const status = input.status ?? "";
  const keyword = (input.query ?? "").trim().slice(0, 4000);
  const metadataKeyword = keyword.slice(0, 120);
  const batch = input.batch;
  const unbatched = input.unbatched === true;
  const sortKey = input.sort_key ?? "created_at";
  const sortDirection = input.sort_direction ?? "desc";
  const pageSize = 50;
  const page = Number.isFinite(input.page)
    ? Math.min(1_000_000, Math.max(1, Math.trunc(input.page ?? 1)))
    : 1;
  const offset = (page - 1) * pageSize;
  const orderExpressions: Record<CardSecretSortKey, string> = {
    created_at: "created_at",
    id: "id",
    status: "CASE status WHEN 'available' THEN 1 WHEN 'reserved' THEN 2 ELSE 3 END",
    batch_no: "LOWER(NULLIF(batch_no, ''))",
  };
  const direction = sortDirection === "asc" ? "ASC" : "DESC";
  const nulls = sortKey === "batch_no" ? " NULLS LAST" : "";
  const orderBy = `${orderExpressions[sortKey]} ${direction}${nulls}, id ${direction}`;

  const baseConditions = ["product_id = $1"];
  const baseParams: unknown[] = [productId];
  if (status) {
    baseParams.push(status);
    baseConditions.push(`status = $${baseParams.length}`);
  }
  if (keyword) {
    baseParams.push(`%${metadataKeyword}%`);
    const likeIndex = baseParams.length;
    baseParams.push(hashCardSecret(keyword));
    const hashIndex = baseParams.length;
    baseConditions.push(`(
      id::text ILIKE $${likeIndex}
      OR batch_no ILIKE $${likeIndex}
      OR note ILIKE $${likeIndex}
      OR COALESCE(order_no, '') ILIKE $${likeIndex}
      OR secret_hash = $${hashIndex}
    )`);
  }

  const listConditions = [...baseConditions];
  const listParams = [...baseParams];
  if (unbatched) {
    listConditions.push("batch_no = ''");
  } else if (batch !== undefined) {
    listParams.push(batch);
    listConditions.push(`batch_no = $${listParams.length}`);
  }

  const baseWhere = `WHERE ${baseConditions.join(" AND ")}`;
  const listWhere = `WHERE ${listConditions.join(" AND ")}`;
  const limitIndex = listParams.length + 1;

  const [rowsResult, countResult, batchesResult] = await Promise.all([
    getPool().query<CardSecretRow>(
      `
        SELECT
          id::text,
          product_id,
          secret_ciphertext,
          status,
          order_no,
          batch_no,
          note,
          reserved_at,
          used_at,
          created_at,
          updated_at
        FROM card_secrets
        ${listWhere}
        ORDER BY ${orderBy}
        LIMIT $${limitIndex} OFFSET $${limitIndex + 1}
      `,
      [...listParams, pageSize, offset],
    ),
    getPool().query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM card_secrets ${listWhere}`,
      listParams,
    ),
    getPool().query<{
      value: string;
      label: string;
      latest_at: string;
      total: string;
      available: string;
      reserved: string;
      used: string;
    }>(
      `
        SELECT
          batch_no AS value,
          COALESCE(NULLIF(batch_no, ''), '未分批') AS label,
          MAX(created_at) AS latest_at,
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE status = 'available')::text AS available,
          COUNT(*) FILTER (WHERE status = 'reserved')::text AS reserved,
          COUNT(*) FILTER (WHERE status = 'used')::text AS used
        FROM card_secrets
        ${baseWhere}
        GROUP BY batch_no
        ORDER BY MAX(created_at) DESC, LOWER(batch_no) ASC
      `,
      baseParams,
    ),
  ]);

  return {
    card_secrets: rowsResult.rows.map(decryptRow),
    batches: batchesResult.rows.map((row) => ({
      value: row.value,
      label: row.label,
      latest_at: row.latest_at,
      total: Number(row.total),
      available: Number(row.available),
      reserved: Number(row.reserved),
      used: Number(row.used),
    })),
    total: Number(countResult.rows[0]?.total ?? 0),
    page,
    page_size: pageSize,
  };
}

export async function deleteCardSecret(secretId: string) {
  await ensureStoreSchema();

  const result = await getPool().query(
    "DELETE FROM card_secrets WHERE id = $1 AND status = 'available'",
    [secretId],
  );

  return result.rowCount === 1;
}

export async function getDeliverySecrets(outTradeNo: string) {
  await ensureStoreSchema();

  const result = await getPool().query<{ secret_ciphertext: string }>(
    `
      SELECT secret_ciphertext
      FROM card_secrets
      WHERE order_no = $1 AND status = 'used'
      ORDER BY id ASC
    `,
    [outTradeNo],
  );

  return result.rows.map((row) => decryptCardSecret(row.secret_ciphertext));
}
