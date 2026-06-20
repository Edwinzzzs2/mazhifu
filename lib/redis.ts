import IORedis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST || "192.168.31.80";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// BullMQ 要求 maxRetriesPerRequest: null
export function createRedisConnection() {
  return new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  });
}
