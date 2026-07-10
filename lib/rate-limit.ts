import crypto from "crypto";
import IORedis from "ioredis";
import { createLogger } from "@/lib/logger";
import { isRedisConfigured } from "@/lib/redis";

type RateLimitRule = {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfter: number;
  unavailable?: boolean;
};

type MemoryEntry = {
  count: number;
  expiresAt: number;
};

declare global {
  // 开发热更新时复用计数，避免每次重新加载模块都清空限流窗口。
  // eslint-disable-next-line no-var
  var mazhifuRateLimitMemory: Map<string, MemoryEntry> | undefined;
}

const logger = createLogger("rate-limit");
const memoryStore = globalThis.mazhifuRateLimitMemory ?? new Map<string, MemoryEntry>();
globalThis.mazhifuRateLimitMemory = memoryStore;

let redisConnection: IORedis | null = null;

const RATE_LIMIT_SCRIPT = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return { current, redis.call('TTL', KEYS[1]) }
`;

function hashIdentifier(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildKey(rule: RateLimitRule) {
  return `mazhifu:rate:${rule.scope}:${hashIdentifier(rule.identifier)}`;
}

function getRateLimitRedis() {
  if (!redisConnection) {
    redisConnection = new IORedis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 1000,
      commandTimeout: 1500,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 100, 1000),
    });
    // 命令失败会由调用方记录；吞掉连接级事件，避免 ioredis 额外输出未脱敏日志。
    redisConnection.on("error", () => undefined);
  }
  return redisConnection;
}

function checkMemory(rule: RateLimitRule): RateLimitResult {
  const key = buildKey(rule);
  const now = Date.now();
  const current = memoryStore.get(key);
  const entry = !current || current.expiresAt <= now
    ? { count: 0, expiresAt: now + rule.windowSeconds * 1000 }
    : current;

  entry.count += 1;
  memoryStore.set(key, entry);
  if (memoryStore.size > 1000) {
    memoryStore.forEach((value, entryKey) => {
      if (value.expiresAt <= now) memoryStore.delete(entryKey);
    });
  }
  const retryAfter = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
  return { allowed: entry.count <= rule.limit, retryAfter };
}

async function checkRedis(rule: RateLimitRule): Promise<RateLimitResult> {
  const result = await getRateLimitRedis().eval(
    RATE_LIMIT_SCRIPT,
    1,
    buildKey(rule),
    rule.windowSeconds,
  ) as [number, number];
  const count = Number(result[0]);
  const ttl = Number(result[1]);
  return {
    allowed: count <= rule.limit,
    retryAfter: Math.max(1, ttl > 0 ? ttl : rule.windowSeconds),
  };
}

async function checkRule(rule: RateLimitRule): Promise<RateLimitResult> {
  if (!isRedisConfigured()) {
    if (process.env.NODE_ENV === "production") {
      logger.error("redis is required for production rate limiting", { scope: rule.scope });
      return { allowed: false, retryAfter: 5, unavailable: true };
    }
    return checkMemory(rule);
  }

  try {
    return await checkRedis(rule);
  } catch (error) {
    logger.error("redis rate limit failed", { scope: rule.scope, error });
    if (process.env.NODE_ENV === "production") {
      return { allowed: false, retryAfter: 5, unavailable: true };
    }
    return checkMemory(rule);
  }
}

export async function checkRateLimits(rules: RateLimitRule[]): Promise<RateLimitResult> {
  const results = await Promise.all(rules.map(checkRule));
  const unavailable = results.find((result) => result.unavailable);
  if (unavailable) return unavailable;

  const rejected = results.find((result) => !result.allowed);
  return rejected ?? { allowed: true, retryAfter: 0 };
}

/**
 * 仅在反向代理明确覆盖来源头时信任客户端 IP；否则使用低敏浏览器指纹，
 * 并由各接口叠加账号、邮箱或订单维度的限流。
 */
export function getClientRateLimitKey(request: Request) {
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const trustedIp = request.headers.get("cf-connecting-ip")?.trim()
      || forwarded
      || request.headers.get("x-real-ip")?.trim();
    if (trustedIp) return `ip:${trustedIp.slice(0, 80)}`;
  }

  const fingerprint = [
    request.headers.get("user-agent") ?? "",
    request.headers.get("accept-language") ?? "",
    request.headers.get("accept") ?? "",
  ].join("|");
  return `client:${hashIdentifier(fingerprint).slice(0, 24)}`;
}
