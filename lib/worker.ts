import { Worker } from "bullmq";
import { ORDER_EXPIRE_QUEUE_NAME } from "@/lib/queue-names";
import { createLogger } from "@/lib/logger";
import { getSharedRedisConnection } from "@/lib/redis";
import type { OrderExpirePayload } from "@/lib/queue";

let expireWorker: Worker | null = null;
const workerLogger = createLogger("worker");
const expireLogger = createLogger("worker:expire");

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
      expireLogger.info(expired ? "order expired" : "order skipped", {
        out_trade_no,
        result: expired ? "expired" : "skipped",
      });
    },
    {
      connection: getSharedRedisConnection(),
      concurrency: 3,
    },
  );

  expireWorker.on("failed", (job, err) => {
    expireLogger.error("job failed", {
      error: err,
      out_trade_no: job?.data.out_trade_no,
    });
  });

  workerLogger.info("BullMQ worker started", { queue: ORDER_EXPIRE_QUEUE_NAME });

  // --- 优雅关闭 ---
  const shutdown = async (signal: string) => {
    workerLogger.info("shutdown signal received", { signal });
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
