import { createLogger } from "@/lib/logger";
import type { OrderRecord } from "@/lib/orders";
import { getRedisConfigSummary, isRedisConfigured } from "@/lib/redis";

const queueLogger = createLogger("queue");
const fallbackExpireLogger = createLogger("fallback:expire");

type ExpirableOrder = Pick<OrderRecord, "out_trade_no" | "expires_at">;

function getDelayMs(order: ExpirableOrder) {
  const expiresAtMs = new Date(order.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    return Number(process.env.ORDER_TTL_MINUTES ?? 15) * 60 * 1000;
  }

  return Math.max(0, expiresAtMs - Date.now());
}

function scheduleLocalFallback(order: ExpirableOrder, delayMs: number) {
  setTimeout(async () => {
    try {
      const { expireSingleOrder } = await import("@/lib/order-expiration");
      const expired = await expireSingleOrder(order.out_trade_no);
      fallbackExpireLogger.info("expire fallback completed", {
        out_trade_no: order.out_trade_no,
        expired,
      });
    } catch (error) {
      fallbackExpireLogger.error("expire fallback failed", {
        out_trade_no: order.out_trade_no,
        error,
      });
    }
  }, delayMs);
}

export async function scheduleOrderExpiration(order: ExpirableOrder) {
  const delayMs = getDelayMs(order);

  if (!isRedisConfigured()) {
    queueLogger.info("redis is not configured; using local setTimeout fallback", {
      out_trade_no: order.out_trade_no,
      delay_ms: delayMs,
    });
    scheduleLocalFallback(order, delayMs);
    return;
  }

  try {
    const { orderExpireQueue } = await import("@/lib/queue");
    await orderExpireQueue.add(
      "expire",
      { out_trade_no: order.out_trade_no },
      {
        delay: delayMs,
        jobId: `expire-${order.out_trade_no}`,
      },
    );
    queueLogger.info("expire job enqueued", {
      out_trade_no: order.out_trade_no,
      delay_ms: delayMs,
      redis: getRedisConfigSummary(),
    });
  } catch (error) {
    queueLogger.error("expire job enqueue failed; enabling local setTimeout fallback", {
      out_trade_no: order.out_trade_no,
      delay_ms: delayMs,
      redis: getRedisConfigSummary(),
      error,
    });
    scheduleLocalFallback(order, delayMs);
  }
}
