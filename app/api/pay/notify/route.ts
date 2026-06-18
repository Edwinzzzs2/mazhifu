import { NextResponse } from "next/server";
import { markOrderFromPayment, markOrderFromQuery, retryOrderFulfillment } from "@/lib/orders";
import { parseMapayPayload, queryMapayOrder, verifyMapayPayload } from "@/lib/mapay";

async function handleNotify(request: Request) {
  const payload = await parseMapayPayload(request);

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

    // 确认码支付返回 status=1（已支付）且订单号吻合
    const confirmed =
      queryResult.out_trade_no === outTradeNo &&
      String(queryResult.pid) === String(process.env.MAPAY_PID) &&
      Number(queryResult.status) === 1;

    if (!confirmed) {
      console.warn("Mapay notify: double-check query not confirmed", {
        out_trade_no: outTradeNo,
        query_status: queryResult.status,
        query_code: queryResult.code,
      });
      // 回查未确认时，仍优先信任 webhook 通知（可能是查询接口延迟）
      const updated = await markOrderFromPayment(payload);
      if (updated) {
        // 尝试立即发货
        try {
          await retryOrderFulfillment(outTradeNo);
        } catch (err) {
          console.error("Fulfillment after notify (unconfirmed) failed", err);
        }
      }
      return new NextResponse(updated ? "success" : "fail", { status: updated ? 200 : 400 });
    }

    // ③ 回查确认：以主动查询结果为准更新订单状态
    await markOrderFromQuery(queryResult);
  } catch (err) {
    console.error("Mapay double-check query failed, falling back to notify payload", err);
    // 回查超时/失败：退回直接信任 webhook（不能因为回查失败就拒绝通知）
    const updated = await markOrderFromPayment(payload);
    if (updated) {
      try {
        await retryOrderFulfillment(outTradeNo);
      } catch (fulfillErr) {
        console.error("Fulfillment after notify (fallback) failed", fulfillErr);
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
