import crypto from "crypto";
import { cookies } from "next/headers";
import { getPool } from "@/lib/db";
import { ensureStoreSchema } from "@/lib/store-schema";

export const ADMIN_COOKIE_NAME = "mazhifu_admin";

const SESSION_SECONDS = 60 * 60 * 12;
const USERNAME_MATCHER = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,34}[a-zA-Z0-9])?$/;

export type AdminUserRole = "ADMIN" | "USER";
export type AdminUserStatus = "NORMAL" | "ARCHIVED";

export type AdminUser = {
  id: number;
  username: string;
  display_name: string;
  role: AdminUserRole;
  row_status: AdminUserStatus;
  created_at: string;
  updated_at: string;
};

export type InstanceGeneralSettings = {
  disallow_user_registration: boolean;
  disallow_password_auth: boolean;
  disallow_change_username: boolean;
};

export const DEFAULT_INSTANCE_GENERAL_SETTINGS: InstanceGeneralSettings = {
  disallow_user_registration: false,
  disallow_password_auth: false,
  disallow_change_username: false,
};

export const adminCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_SECONDS,
};

function getSessionSecret() {
  const secret =
    process.env.ADMIN_SESSION_SECRET ||
    process.env.CARD_SECRET_ENCRYPTION_KEY ||
    process.env.MAPAY_KEY;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SESSION_SECRET is required in production");
  }

  return secret || "mazhifu-development-session-secret";
}

function signSessionPayload(payload: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isNumericUsername(username: string) {
  return username !== "" && [...username].every((char) => char >= "0" && char <= "9");
}

export function normalizeUsername(username: string) {
  return username.trim();
}

export function validateWritableUsername(username: string) {
  const normalized = normalizeUsername(username);
  if (!normalized || isNumericUsername(normalized) || !USERNAME_MATCHER.test(normalized)) {
    throw new Error("用户名需为 1-36 位字母、数字或连字符，不能以连字符开头/结尾，且不能是纯数字");
  }
  return normalized;
}

export function validatePassword(password: string) {
  if (!password) {
    throw new Error("密码不能为空");
  }
}

function hashPassword(password: string) {
  validatePassword(password);
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, passwordHash: string) {
  const [version, salt, expectedHash] = passwordHash.split("$");
  if (version !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto.scryptSync(password, salt, 64).toString("base64url");
  return safeEqual(actualHash, expectedHash);
}

function toDateText(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === "string" ? value : "";
}

function normalizeUser(row: AdminUser): AdminUser {
  return {
    id: Number(row.id),
    username: row.username,
    display_name: row.display_name || row.username,
    role: row.role,
    row_status: row.row_status,
    created_at: toDateText(row.created_at),
    updated_at: toDateText(row.updated_at),
  };
}

function normalizeGeneralSettings(value: unknown): InstanceGeneralSettings {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    disallow_user_registration: Boolean(data.disallow_user_registration),
    disallow_password_auth: Boolean(data.disallow_password_auth),
    disallow_change_username: Boolean(data.disallow_change_username),
  };
}

export async function getInstanceGeneralSettings() {
  await ensureStoreSchema();
  const result = await getPool().query<{ value: unknown }>(
    "SELECT value FROM settings WHERE key = $1",
    ["instance_general"],
  );
  return normalizeGeneralSettings(result.rows[0]?.value);
}

export async function updateInstanceGeneralSettings(value: unknown) {
  const settings = normalizeGeneralSettings(value);

  await ensureStoreSchema();
  await getPool().query(
    `
      INSERT INTO settings (key, value, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    ["instance_general", JSON.stringify(settings)],
  );

  return settings;
}

export async function getAdminUserCount() {
  await ensureStoreSchema();
  const result = await getPool().query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_users");
  return Number(result.rows[0]?.count ?? 0);
}

export async function needsAdminSetup() {
  return (await getAdminUserCount()) === 0;
}

export async function listAdminUsers() {
  await ensureStoreSchema();
  const result = await getPool().query<AdminUser>(
    `
      SELECT id, username, display_name, role, row_status, created_at, updated_at
      FROM admin_users
      ORDER BY id ASC
    `,
  );
  return result.rows.map(normalizeUser);
}

export async function getAdminUserById(id: number) {
  await ensureStoreSchema();
  const result = await getPool().query<AdminUser>(
    `
      SELECT id, username, display_name, role, row_status, created_at, updated_at
      FROM admin_users
      WHERE id = $1
    `,
    [id],
  );
  return result.rows[0] ? normalizeUser(result.rows[0]) : null;
}

async function getAdminUserWithPassword(username: string) {
  await ensureStoreSchema();
  const result = await getPool().query<AdminUser & { password_hash: string }>(
    `
      SELECT id, username, display_name, role, row_status, password_hash, created_at, updated_at
      FROM admin_users
      WHERE username = $1
    `,
    [validateWritableUsername(username)],
  );
  return result.rows[0] ?? null;
}

async function insertAdminUser(input: {
  username: string;
  password: string;
  role: AdminUserRole;
  display_name?: string;
}) {
  const username = validateWritableUsername(input.username);
  const displayName = (input.display_name || username).trim().slice(0, 80);
  const passwordHash = hashPassword(input.password);

  const result = await getPool().query<AdminUser>(
    `
      INSERT INTO admin_users (username, display_name, role, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, display_name, role, row_status, created_at, updated_at
    `,
    [username, displayName, input.role, passwordHash],
  );
  return normalizeUser(result.rows[0]);
}

export async function createFirstAdminUser(input: {
  username: string;
  password: string;
  display_name?: string;
}) {
  await ensureStoreSchema();

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // 首个管理员必须串行创建，避免并发注册时产生多个初始管理员。
    await client.query("LOCK TABLE admin_users IN EXCLUSIVE MODE");
    const countResult = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_users");
    if (Number(countResult.rows[0]?.count ?? 0) > 0) {
      await client.query("ROLLBACK");
      return { user: null, created: false };
    }

    const username = validateWritableUsername(input.username);
    const displayName = (input.display_name || username).trim().slice(0, 80);
    const passwordHash = hashPassword(input.password);
    const userResult = await client.query<AdminUser>(
      `
        INSERT INTO admin_users (username, display_name, role, password_hash)
        VALUES ($1, $2, 'ADMIN', $3)
        RETURNING id, username, display_name, role, row_status, created_at, updated_at
      `,
      [username, displayName, passwordHash],
    );
    await client.query("COMMIT");
    return { user: normalizeUser(userResult.rows[0]), created: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createAdminUser(input: {
  username: string;
  password: string;
  role?: AdminUserRole;
  display_name?: string;
}) {
  await ensureStoreSchema();
  return insertAdminUser({
    ...input,
    role: input.role === "ADMIN" ? "ADMIN" : "USER",
  });
}

export async function registerPublicUser(input: {
  username: string;
  password: string;
  display_name?: string;
}) {
  const { user: firstUser, created } = await createFirstAdminUser(input);
  if (created && firstUser) {
    return firstUser;
  }

  const settings = await getInstanceGeneralSettings();
  if (settings.disallow_user_registration) {
    throw new Error("user registration is not allowed");
  }
  if (settings.disallow_password_auth) {
    throw new Error("password signup is not allowed");
  }

  return createAdminUser({ ...input, role: "USER" });
}

export async function updateAdminUser(
  userId: number,
  input: {
    username?: string;
    password?: string;
    role?: AdminUserRole;
    row_status?: AdminUserStatus;
    display_name?: string;
  },
) {
  await ensureStoreSchema();

  const existingUser = await getAdminUserById(userId);
  if (!existingUser) {
    return null;
  }
  // 防止最后一个正常管理员被降级或停用，避免后台彻底失去入口。
  const wouldRemoveActiveAdmin =
    existingUser.role === "ADMIN" &&
    existingUser.row_status === "NORMAL" &&
    (input.role === "USER" || input.row_status === "ARCHIVED");
  if (wouldRemoveActiveAdmin) {
    const activeAdminResult = await getPool().query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM admin_users WHERE role = 'ADMIN' AND row_status = 'NORMAL'",
    );
    if (Number(activeAdminResult.rows[0]?.count ?? 0) <= 1) {
      throw new Error("至少需要保留一个正常管理员账号");
    }
  }

  const settings = await getInstanceGeneralSettings();
  const set: string[] = ["updated_at = NOW()"];
  const args: unknown[] = [];

  if (input.username !== undefined) {
    if (settings.disallow_change_username) {
      throw new Error("permission denied: disallow change username");
    }
    args.push(validateWritableUsername(input.username));
    set.push(`username = $${args.length}`);
  }
  if (input.password) {
    args.push(hashPassword(input.password));
    set.push(`password_hash = $${args.length}`);
  }
  if (input.role === "ADMIN" || input.role === "USER") {
    args.push(input.role);
    set.push(`role = $${args.length}`);
  }
  if (input.row_status === "NORMAL" || input.row_status === "ARCHIVED") {
    args.push(input.row_status);
    set.push(`row_status = $${args.length}`);
  }
  if (input.display_name !== undefined) {
    args.push((input.display_name || "").trim().slice(0, 80));
    set.push(`display_name = $${args.length}`);
  }

  args.push(userId);
  const result = await getPool().query<AdminUser>(
    `
      UPDATE admin_users
      SET ${set.join(", ")}
      WHERE id = $${args.length}
      RETURNING id, username, display_name, role, row_status, created_at, updated_at
    `,
    args,
  );

  return result.rows[0] ? normalizeUser(result.rows[0]) : null;
}

export async function authenticateAdminUser(username: string, password: string) {
  let user: (AdminUser & { password_hash: string }) | null = null;
  try {
    user = await getAdminUserWithPassword(username);
  } catch {
    return null;
  }
  if (!user || user.row_status === "ARCHIVED" || !verifyPassword(password, user.password_hash)) {
    return null;
  }
  return normalizeUser(user);
}

export function createAdminSessionValue(user: Pick<AdminUser, "id" | "username" | "role">) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = `${user.id}.${user.username}.${user.role}.${timestamp}`;
  return `${payload}.${signSessionPayload(payload)}`;
}

async function getUserFromSessionValue(value?: string) {
  if (!value) {
    return null;
  }

  const [idText, username, role, timestamp, signature] = value.split(".");
  if (!idText || !username || !role || !timestamp || !signature || !/^\d+$/.test(idText) || !/^\d+$/.test(timestamp)) {
    return null;
  }

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  const payload = `${idText}.${username}.${role}.${timestamp}`;
  if (age < 0 || age > SESSION_SECONDS || !safeEqual(signature, signSessionPayload(payload))) {
    return null;
  }

  const user = await getAdminUserById(Number(idText));
  if (!user || user.username !== username || user.role !== role || user.row_status === "ARCHIVED") {
    return null;
  }
  return user;
}

export async function getCurrentAdminUser() {
  return getUserFromSessionValue(cookies().get(ADMIN_COOKIE_NAME)?.value);
}

export async function isAdminAuthenticated() {
  const user = await getCurrentAdminUser();
  return user?.role === "ADMIN";
}
