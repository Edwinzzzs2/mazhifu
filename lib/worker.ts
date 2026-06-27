import { Worker } from "bullmq";
import { ORDER_EXPIRE_QUEUE_NAME } from "@/lib/queue-names";
import { getSharedRedisConnection } from "@/lib/redis";
import type { OrderExpirePayload } from "@/lib/queue";

let expireWorker: Worker | null = null;

export function startWorkers() {
  if (expireWorker) {
    return;
  }

  // ─── 订单过期 Worker ──────────────────────────────────────────
  expireWorker = new Worker<OrderExpirePayload>(
    ORDER_EXPIRE_QUEUE_NAME,
    async (job) => {
      const { expireSingleOrder } = await import("@/lib/order-expiration");
      const { out_trade_no } = job.data;
      const expired = await expireSingleOrder(out_trade_no);
      console.log(`[worker:expire] ${out_trade_no} → ${expired ? "已过期" : "跳过（已付款或已过期）"}`);
    },
    {
      connection: getSharedRedisConnection(),
      concurrency: 3,
    },
  );

  expireWorker.on("failed", (job, err) => {
    console.error(`[worker:expire] 任务失败 ${job?.data.out_trade_no}`, err);
  });

  console.log(`[worker] BullMQ worker 已启动：${ORDER_EXPIRE_QUEUE_NAME}`);

  // ─── 优雅关闭 ─────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`[worker] 收到 ${signal}，正在关闭 worker...`);
    await stopWorkers();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export async function stopWorkers() {
  await expireWorker?.close();
  expireWorker = null;
}
import { Worker } from "bullmq";
import { ORDER_EXPIRE_QUEUE_NAME } from "@/lib/queue-names";
import { getSharedRedisConnection } from "@/lib/redis";
import type { OrderExpirePayload } from "@/lib/queue";

let expireWorker: Worker | null = null;

export function startWorkers() {
  if (expireWorker) {
    return;
  }

  // ─── 订单过期 Worker ──────────────────────────────────────────
  expireWorker = new Worker<OrderExpirePayload>(
    ORDER_EXPIRE_QUEUE_NAME,
    async (job) => {
      const { expireSingleOrder } = await import("@/lib/order-expiration");
      const { out_trade_no } = job.data;
      const expired = await expireSingleOrder(out_trade_no);
      console.log(`[worker:expire] ${out_trade_no} → ${expired ? "已过期" : "跳过（已付款或已过期）"}`);
    },
    {
      connection: getSharedRedisConnection(),
      concurrency: 3,
    },
  );

  expireWorker.on("failed", (job, err) => {
    console.error(`[worker:expire] 任务失败 ${job?.data.out_trade_no}`, err);
  });

  console.log(`[worker] BullMQ worker 已启动：${ORDER_EXPIRE_QUEUE_NAME}`);

  // ─── 优雅关闭 ─────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`[worker] 收到 ${signal}，正在关闭 worker...`);
    await stopWorkers();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export async function stopWorkers() {
  await expireWorker?.close();
  expireWorker = null;
}
import { Worker } from "bullmq";
import {
  ORDER_EXPIRE_QUEUE_NAME,
  ORDER_FULFILL_QUEUE_NAME,
} from "@/lib/queue-names";
import { createRedisConnection } from "@/lib/redis";
import type { OrderExpirePayload, OrderFulfillPayload } from "@/lib/queue";

let expireWorker: Worker | null = null;
let fulfillWorker: Worker | null = null;

export function startWorkers() {
  if (expireWorker || fulfillWorker) {
    // 已经启动过，避免重复注册
    return;
  }

  // ─── Worker 1：订单过期 ───────────────────────────────────────
  expireWorker = new Worker<OrderExpirePayload>(
    ORDER_EXPIRE_QUEUE_NAME,
    async (job) => {
      const { expireSingleOrder } = await import("@/lib/order-expiration");
      const { out_trade_no } = job.data;
      const expired = await expireSingleOrder(out_trade_no);
      console.log(`[worker:expire] ${out_trade_no} → ${expired ? "已过期" : "跳过（已付款或已过期）"}`);
    },
    {
      connection: createRedisConnection(),
      concurrency: 5,
    },
  );

  expireWorker.on("failed", (job, err) => {
    console.error(`[worker:expire] 任务失败 ${job?.data.out_trade_no}`, err);
  });

  // ─── Worker 2：订单发货 ───────────────────────────────────────
  fulfillWorker = new Worker<OrderFulfillPayload>(
    ORDER_FULFILL_QUEUE_NAME,
    async (job) => {
      const { retryOrderFulfillment } = await import("@/lib/orders");
      const { out_trade_no } = job.data;
      const delivered = await retryOrderFulfillment(out_trade_no);
      console.log(`[worker:fulfill] ${out_trade_no} → ${delivered ? "发货成功" : "发货失败（库存不足或已发）"}`);
    },
    {
      connection: createRedisConnection(),
      concurrency: 3,
    },
  );

  fulfillWorker.on("failed", (job, err) => {
    console.error(`[worker:fulfill] 任务失败 ${job?.data.out_trade_no}`, err);
  });

  console.log(`[worker] BullMQ workers 已启动：${ORDER_EXPIRE_QUEUE_NAME} / ${ORDER_FULFILL_QUEUE_NAME}`);
}

export async function stopWorkers() {
  await Promise.all([
    expireWorker?.close(),
    fulfillWorker?.close(),
  ]);
  expireWorker = null;
  fulfillWorker = null;
}
