import { NextResponse } from "next/server";
import { markOrderFromPayment, markOrderFromQuery } from "@/lib/orders";
import {
  MAPAY_QUERY_TIMEOUT_MS,
  isAbortError,
  parseMapayPayload,
  queryMapayOrder,
  readMapayRequestSnapshot,
  verifyMapayPayload,
} from "@/lib/mapay";

/** 支付确认后，将发货任务投入 BullMQ 队列异步处理 */
async function enqueueFulfill(outTradeNo: string) {
  try {
    const { orderFulfillQueue } = await import("@/lib/queue");
    await orderFulfillQueue.add(
      "fulfill",
      { out_trade_no: outTradeNo },
      { jobId: `fulfill:${outTradeNo}` }, // 防止重复投递
    );
    console.log("[mapay:notify] fulfill job enqueued", {
      out_trade_no: outTradeNo,
      job_id: `fulfill:${outTradeNo}`,
    });
  } catch (err) {
    console.error("[mapay:notify] fulfill job enqueue failed; trying sync fallback", {
      out_trade_no: outTradeNo,
      error: err,
    });
    // 队列不可用时同步发货兜底
    const { retryOrderFulfillment } = await import("@/lib/orders");
    try {
      const delivered = await retryOrderFulfillment(outTradeNo);
      console.log("[mapay:notify] sync fulfill fallback result", {
        out_trade_no: outTradeNo,
        delivered,
      });
    } catch (fulfillErr) {
      console.error("[mapay:notify] sync fulfill fallback failed", {
        out_trade_no: outTradeNo,
        error: fulfillErr,
      });
    }
  }
}

async function handleNotify(request: Request) {
  const requestSnapshot = await readMapayRequestSnapshot(request);
  const payload = await parseMapayPayload(request);

  console.log("[mapay:notify] callback received", {
    ...requestSnapshot,
    payload,
  });

  // ① 验签：防止伪造通知
  if (!verifyMapayPayload(payload)) {
    console.warn("[mapay:notify] signature rejected", {
      payload,
      out_trade_no: payload.out_trade_no,
      pid: payload.pid,
    });
    return new NextResponse("fail", { status: 400 });
  }

  // ② 主动回查码支付确认真实状态（double-check，防止签名密钥泄露后伪造成功通知）
  const outTradeNo = payload.out_trade_no;
  if (!outTradeNo) {
    console.warn("[mapay:notify] missing out_trade_no", { payload });
    return new NextResponse("fail", { status: 400 });
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

    console.log("[mapay:notify] query confirmation result", {
      out_trade_no: outTradeNo,
      confirmed,
      querySucceeded,
      payload,
      queryResult,
    });

    if (!confirmed) {
      if (querySucceeded) {
        // ❌ 回查接口正常返回，但 status=0（明确未支付）——拒绝，不能认账
        console.warn("[mapay:notify] query returned unpaid; callback rejected", {
          out_trade_no: outTradeNo,
          payload,
          queryResult,
          query_status: queryResult.status,
        });
        return new NextResponse("fail", { status: 400 });
      }

      // ⚠️ 回查接口本身返回了错误（code≠1），状态不确定，fallback 信任 webhook
      console.warn("[mapay:notify] query returned abnormal code; fallback to callback payload", {
        out_trade_no: outTradeNo,
        payload,
        queryResult,
        query_status: queryResult.status,
        query_code: queryResult.code,
        query_msg: queryResult.msg,
      });
      const updated = await markOrderFromPayment(payload);
      console.log("[mapay:notify] fallback callback update result", {
        out_trade_no: outTradeNo,
        updated,
        payload,
      });
      if (updated) {
        await enqueueFulfill(outTradeNo);
      }
      return new NextResponse(updated ? "success" : "fail", { status: updated ? 200 : 400 });
    }

    // ③ 回查确认 status=1：以主动查询结果为准更新订单状态
    const updated = await markOrderFromQuery(queryResult);
    console.log("[mapay:notify] confirmed query update result", {
      out_trade_no: outTradeNo,
      updated,
      payload,
      queryResult,
    });
    if (!updated) {
      return new NextResponse("fail", { status: 400 });
    }
  } catch (err) {
    if (isAbortError(err)) {
      console.warn("[mapay:notify] query timeout; fallback to callback payload", {
        out_trade_no: outTradeNo,
        timeout_ms: MAPAY_QUERY_TIMEOUT_MS,
        payload,
      });
    } else {
      console.error("[mapay:notify] query failed; fallback to callback payload", {
        out_trade_no: outTradeNo,
        payload,
        error: err,
      });
    }
    // 回查超时/网络故障：结果不确定，退回信任 webhook
    const updated = await markOrderFromPayment(payload);
    console.log("[mapay:notify] fallback callback update result", {
      out_trade_no: outTradeNo,
      updated,
      payload,
    });
    if (updated) {
      await enqueueFulfill(outTradeNo);
    }
    return new NextResponse(updated ? "success" : "fail", { status: updated ? 200 : 400 });
  }

  // ④ 回查确认支付成功，异步入队发货
  await enqueueFulfill(outTradeNo);

  return new NextResponse("success", { status: 200 });
}

export async function GET(request: Request) {
  return handleNotify(request);
}

export async function POST(request: Request) {
  return handleNotify(request);
}
