import { NextResponse } from "next/server";
import { markOrderFromPayment, markOrderFromQuery, retryOrderFulfillment } from "@/lib/orders";
import {
  MAPAY_QUERY_TIMEOUT_MS,
  isAbortError,
  parseMapayPayload,
  queryMapayOrder,
  readMapayRequestSnapshot,
  verifyMapayPayload,
} from "@/lib/mapay";
import { createLogger } from "@/lib/logger";

const logger = createLogger("mapay:notify");

function notifyResponse(
  body: "success" | "fail",
  status: number,
  context: Record<string, unknown>,
) {
  logger.info("response", {
    status,
    body,
    ...context,
  });
  return new NextResponse(body, { status });
}

/** 支付确认后直接同步发货；失败不阻塞回调响应，前端轮询会兜底重试 */
async function fulfillOrder(outTradeNo: string) {
  try {
    const delivered = await retryOrderFulfillment(outTradeNo);
    logger.info("fulfill result", { out_trade_no: outTradeNo, delivered });
  } catch (err) {
    // 发货失败不影响回调返回 success，前端 status 接口轮询时会重试
    logger.error("fulfill failed (will retry on next poll)", {
      out_trade_no: outTradeNo,
      error: err,
    });
  }
}

async function handleNotify(request: Request) {
  const requestSnapshot = await readMapayRequestSnapshot(request);
  const payload = await parseMapayPayload(request);

  logger.info("callback received", {
    ...requestSnapshot,
    payload,
  });

  // ① 验签：防止伪造通知
  if (!verifyMapayPayload(payload)) {
    logger.warn("signature rejected", {
      payload,
      out_trade_no: payload.out_trade_no,
      pid: payload.pid,
    });
    return notifyResponse("fail", 400, {
      reason: "signature_rejected",
      out_trade_no: payload.out_trade_no,
    });
  }

  // ② 主动回查码支付确认真实状态（double-check，防止签名密钥泄露后伪造成功通知）
  const outTradeNo = payload.out_trade_no;
  if (!outTradeNo) {
    logger.warn("missing out_trade_no", { payload });
    return notifyResponse("fail", 400, {
      reason: "missing_out_trade_no",
    });
  }

  try {
    const queryResult = await queryMapayOrder(outTradeNo);

    // 🔍 调试：打印主动回查返回的完整内容
    const confirmed =
      queryResult.out_trade_no === outTradeNo &&
      String(queryResult.pid) === String(process.env.MAPAY_PID) &&
      Number(queryResult.status) === 1;

    // 回查接口明确返回了结果（code=1 表示查询本身成功）
    const querySucceeded = Number(queryResult.code) === 1;

    logger.info("query confirmation result", {
      out_trade_no: outTradeNo,
      confirmed,
      querySucceeded,
      payload,
      queryResult,
    });

    if (!confirmed) {
      if (querySucceeded) {
        // 回查接口正常返回，但 status≠1（未支付）——不认账，但返回 success 停止重推
        // 可能是人工在码支付后台手动点了回调，订单实际未支付
        logger.warn("query returned unpaid; ignoring callback", {
          out_trade_no: outTradeNo,
          payload,
          queryResult,
          query_status: queryResult.status,
        });
        return notifyResponse("success", 200, {
          reason: "query_unpaid",
          out_trade_no: outTradeNo,
          query_result: queryResult,
        });
      }

      // ⚠️ 回查接口本身返回了错误（code≠1），状态不确定，fallback 信任 webhook
      logger.warn("query returned abnormal code; fallback to callback payload", {
        out_trade_no: outTradeNo,
        payload,
        queryResult,
        query_status: queryResult.status,
        query_code: queryResult.code,
        query_msg: queryResult.msg,
      });
      const updated = await markOrderFromPayment(payload);
      logger.info("fallback callback update result", {
        out_trade_no: outTradeNo,
        updated,
        payload,
      });
      if (updated) {
        await fulfillOrder(outTradeNo)
      }
      return notifyResponse("success", 200, {
        reason: "fallback_callback_update",
        out_trade_no: outTradeNo,
        updated,
      });
    }

    // ③ 回查确认 status=1：以主动查询结果为准更新订单状态
    const updated = await markOrderFromQuery(queryResult);
    logger.info("confirmed query update result", {
      out_trade_no: outTradeNo,
      updated,
      payload,
      queryResult,
    });
    // 即使 markOrderFromQuery 返回 false（金额不匹配等），
    // 也返回 success 避免码支付无限重推。问题留给人工核实处理。
    if (!updated) {
      logger.warn("mark failed but returning success to stop retries", {
        out_trade_no: outTradeNo,
      });
      return notifyResponse("success", 200, {
        reason: "mark_failed",
        out_trade_no: outTradeNo,
      });
    }
  } catch (err) {
    if (isAbortError(err)) {
      logger.warn("query timeout; fallback to callback payload", {
        out_trade_no: outTradeNo,
        timeout_ms: MAPAY_QUERY_TIMEOUT_MS,
        payload,
      });
    } else {
      logger.error("query failed; fallback to callback payload", {
        out_trade_no: outTradeNo,
        payload,
        error: err,
      });
    }
    // 回查超时/网络故障：结果不确定，退回信任 webhook
    const updated = await markOrderFromPayment(payload);
    logger.info("fallback callback update result", {
      out_trade_no: outTradeNo,
      updated,
      payload,
    });
    if (updated) {
      await fulfillOrder(outTradeNo)
    }
    // 无论是否更新成功都返回 success，避免无限重推
    return notifyResponse("success", 200, {
      reason: "fallback_callback_after_query_error",
      out_trade_no: outTradeNo,
      updated,
    });
  }

  // ④ 回查确认支付成功，同步发货
  await fulfillOrder(outTradeNo)

  return notifyResponse("success", 200, {
    reason: "confirmed_paid",
    out_trade_no: outTradeNo,
  });
}

export async function GET(request: Request) {
  return handleNotify(request);
}

export async function POST(request: Request) {
  return handleNotify(request);
}
