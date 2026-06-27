"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  FileText,
  PackageCheck,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CardSecretRecord, CardSecretStats } from "@/lib/card-secrets";
import type { ProductRecord } from "@/lib/products";

type AdminCardInventoryProps = {
  products: ProductRecord[];
};

const emptyStats: CardSecretStats = {
  total: 0,
  available: 0,
  reserved: 0,
  used: 0,
};

// 只取 CSV 首列，兼容引号包裹、逗号和双引号转义的卡密内容。
function parseCsvFirstCell(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("\"")) {
    return trimmed.split(",")[0]?.trim() ?? "";
  }

  let cell = "";
  for (let index = 1; index < trimmed.length; index += 1) {
    const current = trimmed[index];
    const next = trimmed[index + 1];
    if (current === "\"" && next === "\"") {
      cell += "\"";
      index += 1;
      continue;
    }
    if (current === "\"") {
      break;
    }
    cell += current;
  }
  return cell.trim();
}

function parseSecretText(text: string, csvMode = false) {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => (csvMode ? parseCsvFirstCell(line) : line.trim()))
    .filter(Boolean);
}

export function AdminCardInventory({ products }: AdminCardInventoryProps) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [status, setStatus] = useState("");
  const [cardSecrets, setCardSecrets] = useState<CardSecretRecord[]>([]);
  const [stats, setStats] = useState<CardSecretStats>(emptyStats);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [secretsText, setSecretsText] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [note, setNote] = useState("");
  const [deduplicate, setDeduplicate] = useState(true);
  const [message, setMessage] = useState("");
  const [copiedId, setCopiedId] = useState("");

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [productId, products],
  );

  const loadInventory = useCallback(async (nextProductId = productId, nextStatus = status) => {
    if (!nextProductId) {
      setCardSecrets([]);
      setStats(emptyStats);
      return;
    }

    setLoading(true);
    try {
      const url = new URL("/api/admin/card-secrets", window.location.origin);
      url.searchParams.set("product_id", nextProductId);
      if (nextStatus) {
        url.searchParams.set("status", nextStatus);
      }
      const response = await fetch(url, { cache: "no-store" });
      const data = (await response.json()) as {
        card_secrets?: CardSecretRecord[];
        stats?: CardSecretStats;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(data.message || "读取库存失败");
      }
      setCardSecrets(data.card_secrets ?? []);
      setStats(data.stats ?? emptyStats);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取库存失败");
    } finally {
      setLoading(false);
    }
  }, [productId, status]);

  useEffect(() => {
    loadInventory(productId, status);
  }, [loadInventory, productId, status]);

  async function importSecrets() {
    const secrets = parseSecretText(secretsText);
    if (!productId || secrets.length === 0) {
      setMessage("请选择商品并填写卡密");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/card-secrets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_id: productId,
          secrets,
          batch_no: batchNo,
          note,
          deduplicate,
        }),
      });
      const data = (await response.json()) as {
        imported_count?: number;
        skipped_count?: number;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(data.message || "导入失败");
      }
      setSecretsText("");
      setMessage(
        "已导入 " + String(data.imported_count ?? 0) + " 条，跳过 " + String(data.skipped_count ?? 0) + " 条",
      );
      await loadInventory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFileChange(file: File | null) {
    if (!file) {
      return;
    }
    const text = await file.text();
    const parsed = parseSecretText(text, file.name.toLowerCase().endsWith(".csv"));
    setSecretsText(parsed.join("\n"));
    setMessage("已读取文件 " + file.name + "，共 " + String(parsed.length) + " 条");
  }

  async function deleteSecret(secretId: string) {
    setMessage("");
    const response = await fetch("/api/admin/card-secrets/" + encodeURIComponent(secretId), {
      method: "DELETE",
    });
    if (!response.ok) {
      setMessage("只能删除未售出的可用卡密");
      return;
    }
    setMessage("卡密已删除");
    await loadInventory();
  }

  async function copySecret(secret: CardSecretRecord) {
    await navigator.clipboard.writeText(secret.secret);
    setCopiedId(secret.id);
    window.setTimeout(() => setCopiedId(""), 1400);
  }

  return (
    <section className="admin-panel min-w-0">
      <div className="flex flex-col gap-4 border-b border-sky-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold text-sky-600">
            <PackageCheck className="h-4 w-4" />
            卡密库存
          </div>
          <h2 className="mt-1 truncate text-lg font-bold sm:text-xl">
            {selectedProduct ? selectedProduct.name : "选择商品后导入卡密"}
          </h2>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => loadInventory()}
          disabled={loading}
          className="w-full sm:w-auto"
        >
          <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
          刷新
        </Button>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <label className="grid gap-2 text-sm font-semibold">
            目标商品
            <select
              className="admin-input"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              批次号
              <input
                className="admin-input"
                value={batchNo}
                onChange={(event) => setBatchNo(event.target.value)}
                placeholder="BATCH-001"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              备注
              <input
                className="admin-input"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="来源/说明"
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-semibold">
            批量卡密
            <textarea
              className="admin-input min-h-44 resize-y font-mono text-sm"
              value={secretsText}
              onChange={(event) => setSecretsText(event.target.value)}
              placeholder={"一行一张卡密\nABC-001\nABC-002"}
            />
          </label>

          <label className="flex items-center gap-3 rounded-md border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={deduplicate}
              onChange={(event) => setDeduplicate(event.target.checked)}
              className="h-4 w-4"
            />
            自动去重
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-sky-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-sky-50">
              <FileText className="h-4 w-4" />
              读取文件
              <input
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                className="hidden"
                onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              />
            </label>
            <Button
              type="button"
              onClick={importSecrets}
              disabled={submitting || !productId}
              className="bg-emerald-500 shadow-none hover:bg-emerald-600"
            >
              <Upload className="h-4 w-4" />
              {submitting ? "导入中" : "导入库存"}
            </Button>
          </div>

          {message ? (
            <div className="rounded-md border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700">
              {message}
            </div>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="总数" value={stats.total} />
            <StatCard label="可用" value={stats.available} accent="text-emerald-600" />
            <StatCard label="预占" value={stats.reserved} accent="text-amber-600" />
            <StatCard label="已售" value={stats.used} accent="text-slate-700" />
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-sky-100 bg-sky-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold">库存明细</div>
            <select
              className="admin-input bg-white sm:max-w-44"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">全部状态</option>
              <option value="available">可用</option>
              <option value="reserved">预占</option>
              <option value="used">已售</option>
            </select>
          </div>

          <div className="grid gap-3 lg:hidden">
            {cardSecrets.length ? (
              cardSecrets.map((secret) => (
                <SecretCard
                  key={secret.id}
                  secret={secret}
                  copied={copiedId === secret.id}
                  onCopy={() => copySecret(secret)}
                  onDelete={() => deleteSecret(secret.id)}
                />
              ))
            ) : (
              <div className="rounded-md border border-sky-100 bg-white px-4 py-10 text-center text-sm text-slate-500">
                {loading ? "正在读取库存" : "暂无卡密"}
              </div>
            )}
          </div>

          <div className="hidden overflow-hidden rounded-md border border-sky-100 lg:block">
            <div className="touch-scroll max-h-[520px] overflow-auto">
              <table className="w-full min-w-[760px] border-collapse bg-white text-sm">
                <thead className="sticky top-0 bg-sky-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">卡密</th>
                    <th className="px-4 py-3">状态</th>
                    <th className="px-4 py-3">订单</th>
                    <th className="px-4 py-3">批次</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-50">
                  {cardSecrets.length ? (
                    cardSecrets.map((secret) => (
                      <tr key={secret.id} className="hover:bg-sky-50/60">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{secret.id}</td>
                        <td className="max-w-[280px] break-all px-4 py-3 font-mono text-xs">
                          {secret.secret}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={secret.status} />
                        </td>
                        <td className="break-all px-4 py-3 text-xs text-slate-500">
                          {secret.order_no || "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {secret.batch_no || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => copySecret(secret)}
                            >
                              <Copy className="h-4 w-4" />
                              {copiedId === secret.id ? "已复制" : "复制"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={secret.status !== "available"}
                              onClick={() => deleteSecret(secret.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                              删除
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                        {loading ? "正在读取库存" : "暂无卡密"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SecretCard({
  secret,
  copied,
  onCopy,
  onDelete,
}: {
  secret: CardSecretRecord;
  copied: boolean;
  onCopy: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  return (
    <article className="rounded-md border border-sky-100 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-all font-mono text-xs text-slate-400">{secret.id}</div>
          <div className="mt-2 break-all font-mono text-sm font-semibold text-slate-800">
            {secret.secret}
          </div>
        </div>
        <StatusPill status={secret.status} />
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-500">
        <div className="flex items-start justify-between gap-3">
          <span className="shrink-0">订单</span>
          <span className="break-all text-right">{secret.order_no || "-"}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="shrink-0">批次</span>
          <span className="break-all text-right">{secret.batch_no || "-"}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => { void onCopy(); }}
        >
          <Copy className="h-4 w-4" />
          {copied ? "已复制" : "复制"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={secret.status !== "available"}
          onClick={() => { void onDelete(); }}
        >
          <Trash2 className="h-4 w-4" />
          删除
        </Button>
      </div>
    </article>
  );
}

function StatCard({
  label,
  value,
  accent = "text-sky-600",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-md border border-sky-100 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={"mt-1 text-2xl font-bold " + accent}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: CardSecretRecord["status"] }) {
  const styles = {
    available: "border-emerald-200 bg-emerald-50 text-emerald-700",
    reserved: "border-amber-200 bg-amber-50 text-amber-700",
    used: "border-slate-200 bg-slate-100 text-slate-600",
  };
  const labels = {
    available: "可用",
    reserved: "预占",
    used: "已售",
  };

  return (
    <span className={"inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold " + styles[status]}>
      {labels[status]}
    </span>
  );
}
