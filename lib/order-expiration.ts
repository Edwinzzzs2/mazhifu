import { getPool } from "@/lib/db";
import { ensureStoreSchema } from "@/lib/store-schema";

/**
 * 过期单个订单（BullMQ worker 调用）。
 * 仅当订单仍为 pending 且已超过 expires_at 时生效，同时释放预占卡密。
 */
export async function expireSingleOrder(outTradeNo: string): Promise<boolean> {
  await ensureStoreSchema();
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
