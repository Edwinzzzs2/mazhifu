import { NextResponse } from "next/server";
import { markOrderFromQuery, retryOrderFulfillment } from "@/lib/orders";
import {
  MAPAY_QUERY_TIMEOUT_MS,
  isAbortError,
  parseMapayPayload,
  queryMapayOrder,
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
  const payload = await parseMapayPayload(request);

  logger.info("callback received", {
    method: request.method,
    out_trade_no: payload.out_trade_no ?? null,
    trade_no: payload.trade_no ?? null,
    trade_status: payload.trade_status ?? null,
    pid: payload.pid ?? null,
  });

  // ① 验签：防止伪造通知
  if (!verifyMapayPayload(payload)) {
    logger.warn("signature rejected", {
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
    logger.warn("missing out_trade_no");
    return notifyResponse("fail", 400, {
      reason: "missing_out_trade_no",
    });
  }

  try {
    const queryResult = await queryMapayOrder(outTradeNo);

    const querySucceeded = Number(queryResult.code) === 1;
    const identityMatches =
      queryResult.out_trade_no === outTradeNo &&
      String(queryResult.pid) === String(process.env.MAPAY_PID);
    const confirmed = querySucceeded && identityMatches && Number(queryResult.status) === 1;

    logger.info("query confirmation result", {
      out_trade_no: outTradeNo,
      confirmed,
      querySucceeded,
      identity_matches: identityMatches,
      query_status: queryResult.status ?? null,
      query_code: queryResult.code,
      query_trade_no: queryResult.trade_no ?? null,
    });

    if (!confirmed) {
      if (querySucceeded && identityMatches) {
        // 回查接口正常返回，但 status≠1（未支付）——不认账，但返回 success 停止重推
        // 可能是人工在码支付后台手动点了回调，订单实际未支付
        logger.warn("query returned unpaid; ignoring callback", {
          out_trade_no: outTradeNo,
          query_status: queryResult.status,
        });
        return notifyResponse("success", 200, {
          reason: "query_unpaid",
          out_trade_no: outTradeNo,
        });
      }

      // 回查异常时绝不根据通知载荷记账，等待支付平台重试或定时对账。
      logger.warn("query result was unavailable or mismatched; payment not accepted", {
        out_trade_no: outTradeNo,
        query_status: queryResult.status,
        query_code: queryResult.code,
        identity_matches: identityMatches,
      });
      return notifyResponse("fail", querySucceeded ? 502 : 503, {
        reason: querySucceeded ? "query_mismatch" : "query_unavailable",
        out_trade_no: outTradeNo,
      });
    }

    // ③ 回查确认 status=1：以主动查询结果为准更新订单状态
    const updated = await markOrderFromQuery(queryResult, outTradeNo);
    logger.info("confirmed query update result", {
      out_trade_no: outTradeNo,
      updated,
      query_trade_no: queryResult.trade_no ?? null,
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
      logger.warn("query timeout; payment not accepted", {
        out_trade_no: outTradeNo,
        timeout_ms: MAPAY_QUERY_TIMEOUT_MS,
      });
    } else {
      logger.error("query failed; payment not accepted", {
        out_trade_no: outTradeNo,
        error: err,
      });
    }
    return notifyResponse("fail", 503, {
      reason: "query_failed",
      out_trade_no: outTradeNo,
    });
  }

  // ④ 回查确认支付成功，同步发货
  await fulfillOrder(outTradeNo);

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
