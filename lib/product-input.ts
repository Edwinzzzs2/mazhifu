import type { CategoryInput, ProductInput } from "@/lib/products";

const POSTGRES_INTEGER_MIN = -2_147_483_648;
const POSTGRES_INTEGER_MAX = 2_147_483_647;
const POSTGRES_BIGINT_MAX = "9223372036854775807";

const PRODUCT_FIELDS = new Set([
  "category_id",
  "name",
  "subtitle",
  "description",
  "instructions",
  "price",
  "stock",
  "sort_order",
  "badge",
  "image_url",
  "features",
  "active",
]);

const CATEGORY_FIELDS = new Set(["name", "slug", "sort_order", "active"]);

export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

function objectPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new InputValidationError("请求内容必须是 JSON 对象");
  }
  return payload as Record<string, unknown>;
}

function assertOnlyFields(payload: Record<string, unknown>, allowed: Set<string>) {
  const unexpected = Object.keys(payload).find((key) => !allowed.has(key));
  if (unexpected) {
    throw new InputValidationError(`不支持字段：${unexpected}`);
  }
}

function readText(
  value: unknown,
  label: string,
  maxLength: number,
  required = false,
) {
  if (value === undefined || value === null) {
    if (required) throw new InputValidationError(`${label}不能为空`);
    return "";
  }
  if (typeof value !== "string") {
    throw new InputValidationError(`${label}必须是字符串`);
  }

  const normalized = value.trim();
  if (required && !normalized) {
    throw new InputValidationError(`${label}不能为空`);
  }
  if (normalized.length > maxLength) {
    throw new InputValidationError(`${label}不能超过 ${maxLength} 个字符`);
  }
  if (normalized.includes("\u0000")) {
    throw new InputValidationError(`${label}包含非法字符`);
  }
  return normalized;
}

function readInteger(
  value: unknown,
  label: string,
  minimum = POSTGRES_INTEGER_MIN,
  maximum = POSTGRES_INTEGER_MAX,
) {
  const raw = typeof value === "string" ? value.trim() : value;
  if (
    (typeof raw !== "string" && typeof raw !== "number") ||
    raw === "" ||
    (typeof raw === "string" && !/^-?\d+$/.test(raw))
  ) {
    throw new InputValidationError(`${label}必须是整数`);
  }

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new InputValidationError(`${label}超出允许范围`);
  }
  return parsed;
}

function readPrice(value: unknown) {
  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string") {
    throw new InputValidationError("价格格式不正确");
  }

  const normalized = raw.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) {
    throw new InputValidationError("价格必须是最多两位小数的正数");
  }

  const price = Number(normalized);
  if (!Number.isFinite(price) || price < 0.01 || price > 99_999_999.99) {
    throw new InputValidationError("价格必须在 0.01 到 99999999.99 之间");
  }
  return price.toFixed(2);
}

function readBoolean(value: unknown, label: string, defaultValue?: boolean) {
  if (value === undefined && defaultValue !== undefined) return defaultValue;
  if (typeof value !== "boolean") {
    throw new InputValidationError(`${label}必须是布尔值`);
  }
  return value;
}

function normalizeCategoryId(value: unknown, allowEmpty: boolean) {
  if (allowEmpty && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string") {
    throw new InputValidationError("分类 ID 格式不正确");
  }

  const raw = value.trim();
  if (!/^\d+$/.test(raw)) {
    throw new InputValidationError("分类 ID 格式不正确");
  }
  const normalized = raw.replace(/^0+(?=\d)/, "");
  if (
    normalized === "0" ||
    normalized.length > POSTGRES_BIGINT_MAX.length ||
    (normalized.length === POSTGRES_BIGINT_MAX.length && normalized > POSTGRES_BIGINT_MAX)
  ) {
    throw new InputValidationError("分类 ID 超出允许范围");
  }
  return normalized;
}

function readFeatures(value: unknown) {
  if (value === undefined || value === null || value === "") return [];

  let source: unknown[];
  if (Array.isArray(value)) {
    source = value;
  } else if (typeof value === "string") {
    if (value.length > 500) {
      throw new InputValidationError("商品卖点内容不能超过 500 个字符");
    }
    source = value.split(/\r?\n|,/);
  } else {
    throw new InputValidationError("商品卖点必须是字符串或字符串数组");
  }

  if (source.some((item) => typeof item !== "string")) {
    throw new InputValidationError("商品卖点数组只能包含字符串");
  }
  const features = source
    .map((item) => (item as string).trim())
    .filter(Boolean);
  if (features.length > 8) {
    throw new InputValidationError("商品卖点最多填写 8 条");
  }
  if (features.some((item) => item.length > 80 || item.includes("\u0000"))) {
    throw new InputValidationError("每条商品卖点不能超过 80 个字符且不能包含非法字符");
  }
  return features;
}

export function parseProductInput(payload: unknown): ProductInput {
  const input = objectPayload(payload);
  assertOnlyFields(input, PRODUCT_FIELDS);

  const sortOrder =
    input.sort_order === undefined || input.sort_order === null
      ? null
      : readInteger(input.sort_order, "商品排序");

  return {
    category_id: normalizeCategoryId(input.category_id, true),
    name: readText(input.name, "商品名称", 120, true),
    subtitle: readText(input.subtitle, "副标题", 160),
    description: readText(input.description, "商品描述", 1000),
    instructions: readText(input.instructions, "使用说明", 5000),
    price: readPrice(input.price),
    stock: readInteger(input.stock, "库存", 0),
    sort_order: sortOrder,
    badge: readText(input.badge, "标签", 24),
    image_url: readText(input.image_url, "封面图 URL", 1000),
    features: readFeatures(input.features),
    active: readBoolean(input.active, "上架状态", true),
  };
}

export function parseCategoryInput(payload: unknown): CategoryInput {
  const input = objectPayload(payload);
  assertOnlyFields(input, CATEGORY_FIELDS);

  const slug = readText(input.slug, "分类标识", 64, true);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new InputValidationError("分类标识只能包含小写字母、数字和单个连字符");
  }

  return {
    name: readText(input.name, "分类名称", 80, true),
    slug,
    sort_order: readInteger(input.sort_order, "分类排序"),
    active: readBoolean(input.active, "分类状态"),
  };
}

export function parseCategoryId(value: unknown) {
  return normalizeCategoryId(value, false) as string;
}
