import { NextResponse } from "next/server";
import { markOrderFromPayment, markOrderFromQuery, retryOrderFulfillment } from "@/lib/orders";
import {
  MAPAY_QUERY_TIMEOUT_MS,
  isAbortError,
  parseMapayPayload,
  queryMapayOrder,
  verifyMapayPayload,
} from "@/lib/mapay";

async function handleNotify(request: Request) {
  const payload = await parseMapayPayload(request);

  // 🔍 调试：打印 webhook 原始内容
  console.log("[notify] 收到 webhook 原始数据", {
    method: request.method,
    url: request.url,
    payload,
  });

  // ① 验签：防止伪造通知
  if (!verifyMapayPayload(payload)) {
    console.warn("Mapay notify signature rejected", {
      out_trade_no: payload.out_trade_no,
      pid: payload.pid,
    });
    return new NextResponse("fail", { status: 400 });
  }

  // ② 主动回查码支付确认真实状态（double-check，防止签名密钥泄露后伪造成功通知）
  const outTradeNo = payload.out_trade_no;
  if (!outTradeNo) {
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

    console.log("[notify] 主动回查码支付结果", {
      out_trade_no: outTradeNo,
      confirmed,
      querySucceeded,
      queryResult,
    });

    if (!confirmed) {
      if (querySucceeded) {
        // ❌ 回查接口正常返回，但 status=0（明确未支付）——拒绝，不能认账
        console.warn("[notify] 回查明确返回未支付(status=0)，拒绝此 webhook", {
          out_trade_no: outTradeNo,
          query_status: queryResult.status,
        });
        return new NextResponse("fail", { status: 400 });
      }

      // ⚠️ 回查接口本身返回了错误（code≠1），状态不确定，fallback 信任 webhook
      console.warn("[notify] 回查接口返回异常(code≠1)，fallback 信任 webhook", {
        out_trade_no: outTradeNo,
        query_status: queryResult.status,
        query_code: queryResult.code,
        query_msg: queryResult.msg,
      });
      const updated = await markOrderFromPayment(payload);
      if (updated) {
        try {
          await retryOrderFulfillment(outTradeNo);
        } catch (err) {
          console.error("Fulfillment after notify (query-error fallback) failed", err);
        }
      }
      return new NextResponse(updated ? "success" : "fail", { status: updated ? 200 : 400 });
    }

    // ③ 回查确认 status=1：以主动查询结果为准更新订单状态
    await markOrderFromQuery(queryResult);
  } catch (err) {
    if (isAbortError(err)) {
      console.warn("[notify] 主动回查超时，fallback 信任 webhook", {
        out_trade_no: outTradeNo,
        timeout_ms: MAPAY_QUERY_TIMEOUT_MS,
      });
    } else {
      console.error("[notify] 主动回查网络异常，fallback 信任 webhook", err);
    }
    // 回查超时/网络故障：结果不确定，退回信任 webhook（不能因为网络问题让用户付了钱不认账）
    const updated = await markOrderFromPayment(payload);
    if (updated) {
      try {
        await retryOrderFulfillment(outTradeNo);
      } catch (fulfillErr) {
        console.error("Fulfillment after notify (timeout fallback) failed", fulfillErr);
      }
    }
    return new NextResponse(updated ? "success" : "fail", { status: updated ? 200 : 400 });
  }

  // ④ 确认支付成功后立即触发发货
  try {
    await retryOrderFulfillment(outTradeNo);
  } catch (err) {
    console.error("Fulfillment after notify failed", err);
  }

  return new NextResponse("success", { status: 200 });
}

export async function GET(request: Request) {
  return handleNotify(request);
}

export async function POST(request: Request) {
  return handleNotify(request);
}
