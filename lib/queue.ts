import { Queue } from "bullmq";
import { ORDER_EXPIRE_QUEUE_NAME } from "@/lib/queue-names";
import { getSharedRedisConnection } from "@/lib/redis";

// ─── 订单过期队列 ──────────────────────────────────────────────
// 下单时投入一个延迟任务，到期后自动取消订单并释放预占卡密
export const orderExpireQueue = new Queue(ORDER_EXPIRE_QUEUE_NAME, {
  connection: getSharedRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5_000, // 5s → 10s → 20s
    },
    removeOnComplete: true,
    removeOnFail: 100,
  },
});

export type OrderExpirePayload = {
  out_trade_no: string;
};
import { Queue } from "bullmq";
import { ORDER_EXPIRE_QUEUE_NAME } from "@/lib/queue-names";
import { getSharedRedisConnection } from "@/lib/redis";

// ─── 订单过期队列 ──────────────────────────────────────────────
// 下单时投入一个延迟任务，到期后自动取消订单并释放预占卡密
export const orderExpireQueue = new Queue(ORDER_EXPIRE_QUEUE_NAME, {
  connection: getSharedRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5_000, // 5s → 10s → 20s
    },
    removeOnComplete: true,
    removeOnFail: 100,
  },
});

export type OrderExpirePayload = {
  out_trade_no: string;
};
import { Queue } from "bullmq";
import {
  ORDER_EXPIRE_QUEUE_NAME,
  ORDER_FULFILL_QUEUE_NAME,
} from "@/lib/queue-names";
import { createRedisConnection } from "@/lib/redis";

// ─── 订单过期队列 ──────────────────────────────────────────────
// 下单时投入一个延迟任务，到期后自动取消订单并释放预占卡密
export const orderExpireQueue = new Queue(ORDER_EXPIRE_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100, // 保留最近 100 条失败记录
  },
});

// ─── 订单发货队列 ──────────────────────────────────────────────
// 支付成功后投入发货任务，异步处理，不阻塞 webhook 响应
export const orderFulfillQueue = new Queue(ORDER_FULFILL_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,           // 发货失败最多重试 3 次
    backoff: {
      type: "exponential",
      delay: 10_000,       // 第一次重试等 10s，之后翻倍
    },
    removeOnComplete: true,
    removeOnFail: 100,
  },
});

export type OrderExpirePayload = {
  out_trade_no: string;
};

export type OrderFulfillPayload = {
  out_trade_no: string;
};
