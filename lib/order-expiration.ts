import { getPool } from "@/lib/db";
import { ensureStoreSchema } from "@/lib/store-schema";
import { isAbortError, queryMapayOrder } from "@/lib/mapay";
import { markOrderFromQuery, recordOrderQuery, retryOrderFulfillment } from "@/lib/orders";
import { createLogger } from "@/lib/logger";

const logger = createLogger("expire:reconcile");

async function reconcileMapayBeforeExpire(outTradeNo: string) {
  try {
    logger.info("query mapay before expiring", {
      out_trade_no: outTradeNo,
    });

    const queryResult = await queryMapayOrder(outTradeNo);
    const markedPaid = await markOrderFromQuery(queryResult, outTradeNo);

    logger.info("mapay query handled", {
      out_trade_no: outTradeNo,
      marked_paid: markedPaid,
      trade_no: queryResult.trade_no || null,
      status: queryResult.status ?? null,
      code: queryResult.code ?? null,
    });

    if (markedPaid) {
      await retryOrderFulfillment(outTradeNo);
      logger.info("paid order refreshed fulfillment", {
        out_trade_no: outTradeNo,
        trade_no: queryResult.trade_no || null,
      });
      return "paid" as const;
    }

    await recordOrderQuery(outTradeNo, queryResult);
    logger.info("query response recorded", {
      out_trade_no: outTradeNo,
      trade_no: queryResult.trade_no || null,
    });
    return "checked" as const;
  } catch (error) {
    if (isAbortError(error)) {
      logger.warn("mapay query timeout", { out_trade_no: outTradeNo });
    } else {
      logger.error("mapay query failed", {
        out_trade_no: outTradeNo,
        error,
      });
    }
    throw error;
  }
}

/**
 * 过期单个订单（BullMQ worker 调用）。
 * 仅当订单仍为 pending 且已超过 expires_at 时生效，同时释放预占卡密。
 */
export async function expireSingleOrder(outTradeNo: string): Promise<boolean> {
  await ensureStoreSchema();

  const dueResult = await getPool().query<{ out_trade_no: string }>(
    `
      SELECT out_trade_no
      FROM orders
      WHERE out_trade_no = $1
        AND status = 'pending'
        AND paid_at IS NULL
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
      LIMIT 1
    `,
    [outTradeNo],
  );

  if (!dueResult.rowCount) {
    return false;
  }

  const reconcileResult = await reconcileMapayBeforeExpire(outTradeNo);
  if (reconcileResult === "paid") {
    return false;
  }

  const result = await getPool().query<{ expired_count: string }>(
    `
      WITH due AS (
        SELECT out_trade_no
        FROM orders
        WHERE out_trade_no = $1
          AND status = 'pending'
          AND paid_at IS NULL
          AND expires_at IS NOT NULL
          AND expires_at <= NOW()
        FOR UPDATE SKIP LOCKED
      ),
      expired AS (
        UPDATE orders
        SET status = 'expired'
        FROM due
        WHERE orders.out_trade_no = due.out_trade_no
          AND orders.status = 'pending'
          AND orders.paid_at IS NULL
        RETURNING orders.out_trade_no
      ),
      released AS (
        UPDATE card_secrets
        SET status = 'available',
            order_no = NULL,
            reserved_at = NULL,
            updated_at = NOW()
        FROM expired
        WHERE card_secrets.order_no = expired.out_trade_no
          AND card_secrets.status = 'reserved'
        RETURNING card_secrets.id
      )
      SELECT COUNT(*)::text AS expired_count FROM expired
    `,
    [outTradeNo],
  );

  return Number(result.rows[0]?.expired_count ?? 0) > 0;
}
