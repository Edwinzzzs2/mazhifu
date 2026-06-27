import { getPool } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { ensureStoreSchema } from "@/lib/store-schema";

export type SiteSettings = {
  site_name: string;
  site_description: string;
  site_logo_url: string;
  site_icon_url: string;
  announcement: string;
  contact_email: string;
  contact_text: string;
  seo_title: string;
  seo_keywords: string;
  mapay_sitename: string;
  notice_items: string[];
};

const SITE_SETTINGS_KEY = "site";
const MAX_NOTICE_ITEMS = 8;
const logger = createLogger("site-settings");

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  site_name: "码付小铺",
  site_description: "安全、自动发货的码支付卡密小铺",
  site_logo_url: "",
  site_icon_url: "",
  announcement: "",
  contact_email: "",
  contact_text: "遇到问题请保留订单号，并通过商家公布的联系方式处理。",
  seo_title: "",
  seo_keywords: "码支付,卡密,自动发货",
  mapay_sitename: "",
  notice_items: [
    "本站商品用于合法业务测试，请按商品说明购买。",
    "支付状态由服务端验签确认，页面跳转不代表到账。",
    "订单有效期内完成支付，超时后请重新下单。",
    "遇到问题请保留订单号，切勿泄露订单访问链接。",
  ],
};

function pickText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function pickOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function pickAssetUrl(value: unknown) {
  const url = pickOptionalText(value, 500);
  if (!url) {
    return "";
  }

  if (url.startsWith("/") || url.startsWith("https://") || url.startsWith("http://")) {
    return url;
  }

  return "";
}

function pickNoticeItems(value: unknown) {
  if (!Array.isArray(value)) {
    return DEFAULT_SITE_SETTINGS.notice_items;
  }

  const items = value
    .map((item) => (typeof item === "string" ? item.trim().slice(0, 160) : ""))
    .filter(Boolean)
    .slice(0, MAX_NOTICE_ITEMS);

  return items.length ? items : DEFAULT_SITE_SETTINGS.notice_items;
}

export function normalizeSiteSettings(value: unknown): SiteSettings {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    site_name: pickText(data.site_name, DEFAULT_SITE_SETTINGS.site_name, 80),
    site_description: pickText(
      data.site_description,
      DEFAULT_SITE_SETTINGS.site_description,
      220,
    ),
    site_logo_url: pickAssetUrl(data.site_logo_url),
    site_icon_url: pickAssetUrl(data.site_icon_url),
    announcement: pickOptionalText(data.announcement, 300),
    contact_email: pickOptionalText(data.contact_email, 120),
    contact_text: pickText(data.contact_text, DEFAULT_SITE_SETTINGS.contact_text, 300),
    seo_title: pickOptionalText(data.seo_title, 100),
    seo_keywords: pickOptionalText(data.seo_keywords, 180),
    mapay_sitename: pickOptionalText(data.mapay_sitename, 80),
    notice_items: pickNoticeItems(data.notice_items),
  };
}

export async function getSiteSettings() {
  await ensureStoreSchema();
  const result = await getPool().query<{ value: unknown }>(
    "SELECT value FROM settings WHERE key = $1",
    [SITE_SETTINGS_KEY],
  );

  return normalizeSiteSettings(result.rows[0]?.value);
}

export async function getSiteSettingsSafe() {
  try {
    return await getSiteSettings();
  } catch (error) {
    logger.error("fallback to default settings", { error });
    return DEFAULT_SITE_SETTINGS;
  }
}

export async function updateSiteSettings(value: unknown) {
  const settings = normalizeSiteSettings(value);

  await ensureStoreSchema();
  await getPool().query(
    `
      INSERT INTO settings (key, value, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [SITE_SETTINGS_KEY, JSON.stringify(settings)],
  );

  return settings;
}
