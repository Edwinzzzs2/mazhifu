/**
 * Next.js Instrumentation Hook
 * 在 Node.js 服务启动时执行一次，用于启动 BullMQ workers。
 * 文档：https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // 只在 Node.js 运行时启动（不在 Edge Runtime）
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWorkers } = await import("@/lib/worker");
    startWorkers();
  }
}
