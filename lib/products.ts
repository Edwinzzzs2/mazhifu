import crypto from "crypto";
import { getPool } from "@/lib/db";
import { ensureStoreSchema } from "@/lib/store-schema";

export type CategoryRecord = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  active: boolean;
};

export type ProductRecord = {
  id: string;
  category_id: string | null;
  category_name: string | null;
  name: string;
  subtitle: string;
  description: string;
  instructions: string;
  price: string;
  stock: number;
  sold_count: number;
  badge: string;
  image_url: string;
  features: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductInput = {
  category_id: string | null;
  name: string;
  subtitle: string;
  description: string;
  instructions: string;
  price: string;
  stock: number;
  badge: string;
  image_url: string;
  features: string[];
  active: boolean;
};

const PRODUCT_SELECT = `
  SELECT
    p.*,
    COALESCE(card_stock.available_count, 0)::integer AS stock,
    c.name AS category_name
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS available_count
    FROM card_secrets cs
    WHERE cs.product_id = p.id AND cs.status = 'available'
  ) card_stock ON TRUE
`;

export async function listCategories(includeInactive = false) {
  await ensureStoreSchema();
  const result = await getPool().query<CategoryRecord>(
    `
      SELECT id::text, name, slug, sort_order, active
      FROM categories
      WHERE active = TRUE OR $1 = TRUE
      ORDER BY sort_order ASC, id ASC
    `,
    [includeInactive],
  );
  return result.rows;
}

export async function listProducts(includeInactive = false) {
  await ensureStoreSchema();
  const result = await getPool().query<ProductRecord>(
    `
      ${PRODUCT_SELECT}
      WHERE p.active = TRUE OR $1 = TRUE
      ORDER BY c.sort_order ASC NULLS LAST, p.created_at ASC
    `,
    [includeInactive],
  );
  return result.rows;
}

export async function getProductById(productId: string, includeInactive = false) {
  await ensureStoreSchema();
  const result = await getPool().query<ProductRecord>(
    `
      ${PRODUCT_SELECT}
      WHERE p.id = $1 AND (p.active = TRUE OR $2 = TRUE)
      LIMIT 1
    `,
    [productId, includeInactive],
  );
  return result.rows[0] ?? null;
}

function createProductId() {
  return `prd_${crypto.randomBytes(8).toString("hex")}`;
}

export async function createProduct(input: ProductInput) {
  await ensureStoreSchema();
  const productId = createProductId();
  await getPool().query(
    `
      INSERT INTO products (
        id, category_id, name, subtitle, description, instructions,
        price, stock, badge, image_url, features, active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
      RETURNING *
    `,
    [
      productId,
      input.category_id,
      input.name,
      input.subtitle,
      input.description,
      input.instructions,
      input.price,
      input.stock,
      input.badge,
      input.image_url,
      JSON.stringify(input.features),
      input.active,
    ],
  );
  return getProductById(productId, true);
}

export async function updateProduct(productId: string, input: ProductInput) {
  await ensureStoreSchema();
  const result = await getPool().query(
    `
      UPDATE products
      SET category_id = $2,
          name = $3,
          subtitle = $4,
          description = $5,
          instructions = $6,
          price = $7,
          stock = $8,
          badge = $9,
          image_url = $10,
          features = $11::jsonb,
          active = $12,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      productId,
      input.category_id,
      input.name,
      input.subtitle,
      input.description,
      input.instructions,
      input.price,
      input.stock,
      input.badge,
      input.image_url,
      JSON.stringify(input.features),
      input.active,
    ],
  );
  if (!result.rowCount) {
    return null;
  }
  return getProductById(productId, true);
}

export async function deactivateProduct(productId: string) {
  await ensureStoreSchema();
  const result = await getPool().query(
    "UPDATE products SET active = FALSE, updated_at = NOW() WHERE id = $1",
    [productId],
  );
  return result.rowCount === 1;
}
