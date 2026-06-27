import { Queue } from "bullmq";
import { ORDER_EXPIRE_QUEUE_NAME } from "@/lib/queue-names";
import { getSharedRedisConnection } from "@/lib/redis";

// 订单过期队列：下单时投入延迟任务，到期后自动取消订单并释放预占卡密
export const orderExpireQueue = new Queue(ORDER_EXPIRE_QUEUE_NAME, {
  connection: getSharedRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5_000,
    },
    removeOnComplete: true,
    removeOnFail: 100,
  },
});

export type OrderExpirePayload = {
  out_trade_no: string;
};
