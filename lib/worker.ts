import { Worker } from "bullmq";
import { ORDER_EXPIRE_QUEUE_NAME } from "@/lib/queue-names";
import { getSharedRedisConnection } from "@/lib/redis";
import type { OrderExpirePayload } from "@/lib/queue";

let expireWorker: Worker | null = null;

export function startWorkers() {
  if (expireWorker) {
    return;
  }

  // --- 订单过期 Worker ---
  expireWorker = new Worker<OrderExpirePayload>(
    ORDER_EXPIRE_QUEUE_NAME,
    async (job) => {
      const { expireSingleOrder } = await import("@/lib/order-expiration");
      const { out_trade_no } = job.data;
      const expired = await expireSingleOrder(out_trade_no);
      console.log(`[worker:expire] ${out_trade_no} -> ${expired ? "已过期" : "跳过（已付款或已过期）"}`);
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

  // --- 优雅关闭 ---
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
