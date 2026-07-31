import crypto from "crypto";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import { ensureStoreSchema } from "@/lib/store-schema";

export type CategoryRecord = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  active: boolean;
};

export type CategoryInput = {
  name: string;
  slug: string;
  sort_order: number;
  active: boolean;
};

export type CategoryMutationResult = {
  category: CategoryRecord;
  detached_product_count: number;
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
  sort_order: number;
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
  /** null means an older client omitted the field; updates preserve the current value. */
  sort_order: number | null;
  badge: string;
  image_url: string;
  features: string[];
  active: boolean;
};

const PRODUCT_SELECT = `
  SELECT
    p.id,
    CASE WHEN c.active = TRUE THEN p.category_id::text ELSE NULL END AS category_id,
    p.name,
    p.subtitle,
    p.description,
    p.instructions,
    p.price,
    COALESCE(card_stock.available_count, 0)::integer AS stock,
    p.sold_count,
    p.sort_order,
    p.badge,
    p.image_url,
    p.features,
    p.active,
    p.created_at,
    p.updated_at,
    CASE WHEN c.active = TRUE THEN c.name ELSE NULL END AS category_name
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

export async function getCategoryById(categoryId: string) {
  await ensureStoreSchema();
  const result = await getPool().query<CategoryRecord>(
    `
      SELECT id::text, name, slug, sort_order, active
      FROM categories
      WHERE id = $1
      LIMIT 1
    `,
    [categoryId],
  );
  return result.rows[0] ?? null;
}

export async function createCategory(input: CategoryInput) {
  await ensureStoreSchema();
  const result = await getPool().query<CategoryRecord>(
    `
      INSERT INTO categories (name, slug, sort_order, active)
      VALUES ($1, $2, $3, $4)
      RETURNING id::text, name, slug, sort_order, active
    `,
    [input.name, input.slug, input.sort_order, input.active],
  );
  return result.rows[0];
}

export async function updateCategory(
  categoryId: string,
  input: CategoryInput,
): Promise<CategoryMutationResult | null> {
  await ensureStoreSchema();
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await client.query<CategoryRecord>(
      `
        UPDATE categories
        SET name = $2,
            slug = $3,
            sort_order = $4,
            active = $5,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id::text, name, slug, sort_order, active
      `,
      [categoryId, input.name, input.slug, input.sort_order, input.active],
    );
    const category = result.rows[0];
    if (!category) {
      await client.query("ROLLBACK");
      return null;
    }

    let detachedProductCount = 0;
    if (!input.active) {
      const detached = await client.query(
        `
          UPDATE products
          SET category_id = NULL, updated_at = NOW()
          WHERE category_id = $1
        `,
        [categoryId],
      );
      detachedProductCount = detached.rowCount ?? 0;
    }

    await client.query("COMMIT");
    return {
      category,
      detached_product_count: detachedProductCount,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deactivateCategory(
  categoryId: string,
): Promise<CategoryMutationResult | null> {
  await ensureStoreSchema();
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await client.query<CategoryRecord>(
      `
        UPDATE categories
        SET active = FALSE, updated_at = NOW()
        WHERE id = $1
        RETURNING id::text, name, slug, sort_order, active
      `,
      [categoryId],
    );
    const category = result.rows[0];
    if (!category) {
      await client.query("ROLLBACK");
      return null;
    }

    const detached = await client.query(
      `
        UPDATE products
        SET category_id = NULL, updated_at = NOW()
        WHERE category_id = $1
      `,
      [categoryId],
    );
    await client.query("COMMIT");
    return {
      category,
      detached_product_count: detached.rowCount ?? 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listProducts(includeInactive = false) {
  await ensureStoreSchema();
  const result = await getPool().query<ProductRecord>(
    `
      ${PRODUCT_SELECT}
      WHERE p.active = TRUE OR $1 = TRUE
      ORDER BY
        CASE WHEN c.active = TRUE THEN c.sort_order END ASC NULLS LAST,
        CASE WHEN c.active = TRUE THEN c.id END ASC NULLS LAST,
        p.sort_order ASC,
        p.created_at ASC,
        p.id ASC
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

async function assertActiveCategory(client: PoolClient, categoryId: string | null) {
  if (!categoryId) return;
  const category = await client.query(
    `
      SELECT id
      FROM categories
      WHERE id = $1 AND active = TRUE
      FOR SHARE
    `,
    [categoryId],
  );
  if (!category.rowCount) {
    throw new Error("所选分类不存在或已停用");
  }
}

export async function createProduct(input: ProductInput) {
  await ensureStoreSchema();
  const productId = createProductId();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await assertActiveCategory(client, input.category_id);
    await client.query(
      `
        INSERT INTO products (
          id, category_id, name, subtitle, description, instructions,
          price, stock, sort_order, badge, image_url, features, active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
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
        input.sort_order ?? 0,
        input.badge,
        input.image_url,
        JSON.stringify(input.features),
        input.active,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return getProductById(productId, true);
}

export async function updateProduct(productId: string, input: ProductInput) {
  await ensureStoreSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await assertActiveCategory(client, input.category_id);
    const result = await client.query(
      `
        UPDATE products
        SET category_id = $2,
            name = $3,
            subtitle = $4,
            description = $5,
            instructions = $6,
            price = $7,
            stock = $8,
            sort_order = COALESCE($9, sort_order),
            badge = $10,
            image_url = $11,
            features = $12::jsonb,
            active = $13,
            updated_at = NOW()
        WHERE id = $1
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
        input.sort_order,
        input.badge,
        input.image_url,
        JSON.stringify(input.features),
        input.active,
      ],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
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
