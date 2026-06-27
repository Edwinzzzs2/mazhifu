import IORedis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST || "192.168.31.80";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

let sharedConnection: IORedis | null = null;

/**
 * 获取共享 Redis 连接（单例）。
 * BullMQ 的 Queue 和 Worker 共用同一个连接即可，无需每次新建。
 */
export function getSharedRedisConnection(): IORedis {
  if (!sharedConnection) {
    sharedConnection = new IORedis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      maxRetriesPerRequest: null, // BullMQ 要求
    });
  }
  return sharedConnection;
}

/**
 * 创建独立 Redis 连接（仅在确实需要隔离时使用）。
 */
export function createRedisConnection() {
  return new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  });
}
