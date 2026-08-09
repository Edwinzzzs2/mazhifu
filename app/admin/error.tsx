"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="admin-shell page-shell grid min-h-[100dvh] place-items-center px-4 py-8">
      <section className="admin-panel w-full max-w-lg p-6 text-center sm:p-8">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-md border border-red-200 bg-red-50 text-red-700">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-slate-950">后台页面读取失败</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
          可能是网络或数据服务暂时不可用。重试不会修改现有数据。
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button type="button" onClick={reset} className="shadow-none">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            重新加载
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin">返回后台首页</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
