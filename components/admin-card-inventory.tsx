"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  Layers3,
  PackageCheck,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CardSecretRecord, CardSecretStats } from "@/lib/card-secrets";
import type { ProductRecord } from "@/lib/products";

type AdminCardInventoryProps = {
  products: ProductRecord[];
};

type ImportMode = "line" | "block";

const emptyStats: CardSecretStats = {
  total: 0,
  available: 0,
  reserved: 0,
  used: 0,
};

const STATUS_OPTIONS = [
  { label: "全部", value: "" },
  { label: "可用", value: "available" },
  { label: "预占", value: "reserved" },
  { label: "已售", value: "used" },
];

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
    if (current === "\"") break;
    cell += current;
  }
  return cell.trim();
}

function parseDeliveryItems(text: string, mode: ImportMode, csvMode = false) {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (csvMode) {
    return source
      .split("\n")
      .map(parseCsvFirstCell)
      .filter(Boolean);
  }

  if (mode === "block") {
    return source
      .trim()
      .split(/\n\s*(?:---+|===+)\s*\n|\n{2,}/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isLongContent(value: string) {
  return value.includes("\n") || value.length > 80;
}

export function AdminCardInventory({ products }: AdminCardInventoryProps) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [cardSecrets, setCardSecrets] = useState<CardSecretRecord[]>([]);
  const [stats, setStats] = useState<CardSecretStats>(emptyStats);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [contentText, setContentText] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [note, setNote] = useState("");
  const [deduplicate, setDeduplicate] = useState(true);
  const [importMode, setImportMode] = useState<ImportMode>("line");
  const [copiedId, setCopiedId] = useState("");

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [productId, products],
  );

  const parsedItems = useMemo(
    () => parseDeliveryItems(contentText, importMode),
    [contentText, importMode],
  );

  const batches = useMemo(() => {
    const grouped = new Map<
      string,
      { available: number; label: string; reserved: number; total: number; used: number }
    >();

    cardSecrets.forEach((item) => {
      const key = item.batch_no || "__empty__";
      const current = grouped.get(key) ?? {
        available: 0,
        label: item.batch_no || "未分批",
        reserved: 0,
        total: 0,
        used: 0,
      };
      current.total += 1;
      current[item.status] += 1;
      grouped.set(key, current);
    });

    return Array.from(grouped.entries()).map(([value, item]) => ({ value, ...item }));
  }, [cardSecrets]);

  const visibleSecrets = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return cardSecrets.filter((item) => {
      if (batchFilter && (item.batch_no || "__empty__") !== batchFilter) return false;
      if (!keyword) return true;
      return [item.secret, item.batch_no, item.note, item.order_no, item.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [batchFilter, cardSecrets, query]);

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
      if (nextStatus) url.searchParams.set("status", nextStatus);

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
      toast.error("读取发货库存失败", {
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setLoading(false);
    }
  }, [productId, status]);

  useEffect(() => {
    void loadInventory(productId, status);
  }, [loadInventory, productId, status]);

  function handleProductChange(value: string) {
    setProductId(value);
    setBatchFilter("");
    setQuery("");
  }

  async function importContents() {
    if (!productId || parsedItems.length === 0) {
      toast.error("请选择商品并填写发货内容");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/card-secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          secrets: parsedItems,
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

      toast.success("导入完成", {
        description: `新增 ${data.imported_count ?? 0} 条，跳过 ${data.skipped_count ?? 0} 条`,
      });
      setContentText("");
      await loadInventory();
    } catch (error) {
      toast.error("导入发货内容失败", {
        description: error instanceof Error ? error.message : "请检查内容格式",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFileChange(file: File | null) {
    if (!file) return;

    const text = await file.text();
    const csvMode = file.name.toLowerCase().endsWith(".csv");
    const parsed = parseDeliveryItems(text, importMode, csvMode);
    setContentText(parsed.join(importMode === "block" ? "\n\n---\n\n" : "\n"));
    toast.info("文件已读取", {
      description: `${file.name}，解析出 ${parsed.length} 条发货内容`,
    });
  }

  async function deleteSecret(secretId: string) {
    const response = await fetch("/api/admin/card-secrets/" + encodeURIComponent(secretId), {
      method: "DELETE",
    });
    if (!response.ok) {
      toast.error("删除失败", { description: "只能删除未售出的可用库存" });
      return;
    }
    toast.success("发货内容已删除");
    await loadInventory();
  }

  async function copySecret(secret: CardSecretRecord) {
    await navigator.clipboard.writeText(secret.secret);
    setCopiedId(secret.id);
    window.setTimeout(() => setCopiedId(""), 1400);
    toast.success("已复制发货内容");
  }

  return (
    <section className="admin-panel min-w-0 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold text-sky-600">
            <PackageCheck className="h-4 w-4" />
            发货库存
          </div>
          <h2 className="mt-1 truncate text-lg font-bold sm:text-xl">
            {selectedProduct ? selectedProduct.name : "选择商品后导入发货内容"}
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

      <div className="border-b border-slate-200 bg-slate-50/45 px-4 py-4 sm:px-5">
        <div className="grid gap-3 xl:grid-cols-[minmax(240px,1.35fr)_repeat(4,minmax(120px,1fr))]">
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            目标商品
            <select
              className="admin-input h-10 bg-white"
              value={productId}
              onChange={(event) => handleProductChange(event.target.value)}
            >
              {products.length ? (
                products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))
              ) : (
                <option value="">暂无商品</option>
              )}
            </select>
          </label>
          <StatCard label="全部内容" value={stats.total} />
          <StatCard label="可售库存" value={stats.available} tone="success" />
          <StatCard label="订单预占" value={stats.reserved} tone="warning" />
          <StatCard label="已发货" value={stats.used} tone="muted" />
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card className="shadow-sm">
            <CardHeader className="space-y-1.5 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Upload className="h-4 w-4 text-sky-600" />
                导入发货内容
              </div>
              <p className="text-xs leading-5 text-slate-500">
                一条库存会发给一个订单数量；内容可以是卡密、账号、链接、教程或整段说明。
              </p>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0">
              <div className="grid grid-cols-2 gap-2">
                <ModeButton
                  active={importMode === "line"}
                  description="卡密、账号、兑换码"
                  label="一行一条"
                  onClick={() => setImportMode("line")}
                />
                <ModeButton
                  active={importMode === "block"}
                  description="空行或 --- 分隔"
                  label="整段内容"
                  onClick={() => setImportMode("block")}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  批次号
                  <Input
                    value={batchNo}
                    onChange={(event) => setBatchNo(event.target.value)}
                    placeholder="BATCH-001"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  备注
                  <Input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="来源/说明"
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                发货内容
                <Textarea
                  className="min-h-56 resize-y font-mono text-xs leading-5"
                  value={contentText}
                  onChange={(event) => setContentText(event.target.value)}
                  placeholder={
                    importMode === "line"
                      ? "一行一条发货内容\nABC-001\nABC-002"
                      : "第一份发货内容，可包含多行说明\n下载链接：https://...\n提取码：1234\n\n---\n\n第二份发货内容"
                  }
                />
              </label>

              <div className="flex items-start justify-between gap-3 rounded-md border border-sky-100 bg-sky-50 px-3 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">自动去重</div>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    当前解析 {parsedItems.length} 条，重复内容会自动跳过。
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={deduplicate}
                  onChange={(event) => setDeduplicate(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-white px-4 py-2 text-sm font-semibold transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700">
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
                  onClick={importContents}
                  disabled={submitting || !productId || parsedItems.length === 0}
                  className="bg-emerald-600 shadow-none hover:bg-emerald-700"
                >
                  <Upload className="h-4 w-4" />
                  {submitting ? "导入中" : "导入库存"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="p-4 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers3 className="h-4 w-4 text-sky-600" />
                批次速览
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              <BatchButton
                active={!batchFilter}
                available={stats.available}
                label="全部批次"
                total={stats.total}
                used={stats.used}
                onClick={() => setBatchFilter("")}
              />
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {batches.length ? (
                  batches.map((batch) => (
                    <BatchButton
                      key={batch.value}
                      active={batchFilter === batch.value}
                      available={batch.available}
                      label={batch.label}
                      total={batch.total}
                      used={batch.used}
                      onClick={() => setBatchFilter(batch.value)}
                    />
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">
                    暂无批次
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="admin-panel-muted p-3">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索内容 / 批次 / 订单号 / 备注"
                />
              </label>
              <select
                className="admin-input h-10 bg-white lg:w-36"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item.value || "all"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <div className="text-sm font-semibold text-slate-500 lg:w-28 lg:text-right">
                当前 {visibleSecrets.length} 条
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:hidden">
            {visibleSecrets.length ? (
              visibleSecrets.map((secret) => (
                <InventoryCard
                  key={secret.id}
                  copied={copiedId === secret.id}
                  secret={secret}
                  onCopy={() => copySecret(secret)}
                  onDelete={() => deleteSecret(secret.id)}
                />
              ))
            ) : (
              <EmptyInventory loading={loading} />
            )}
          </div>

          <div className="table-shell hidden lg:block">
            <div className="touch-scroll max-h-[600px] overflow-auto">
              <table className="w-full min-w-[920px] border-collapse bg-white text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="w-20 px-4 py-3">ID</th>
                    <th className="px-4 py-3">发货内容</th>
                    <th className="w-24 px-4 py-3">状态</th>
                    <th className="w-44 px-4 py-3">订单</th>
                    <th className="w-44 px-4 py-3">批次 / 备注</th>
                    <th className="w-28 px-4 py-3">入库时间</th>
                    <th className="w-40 px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleSecrets.length ? (
                    visibleSecrets.map((secret) => (
                      <tr key={secret.id} className="align-top hover:bg-sky-50/60">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{secret.id}</td>
                        <td className="px-4 py-3">
                          <div
                            className={
                              "max-w-xl break-words rounded-md border border-slate-100 bg-slate-50 px-3 py-2 font-mono text-xs leading-5 text-slate-700 " +
                              (isLongContent(secret.secret) ? "whitespace-pre-wrap" : "")
                            }
                          >
                            {secret.secret}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={secret.status} />
                        </td>
                        <td className="break-all px-4 py-3 font-mono text-xs text-slate-500">
                          {secret.order_no || "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          <div className="font-semibold text-slate-700">{secret.batch_no || "-"}</div>
                          {secret.note ? <div className="mt-1 line-clamp-2">{secret.note}</div> : null}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{formatDate(secret.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-20 text-xs"
                              onClick={() => copySecret(secret)}
                            >
                              <Copy className="h-3.5 w-3.5 shrink-0" />
                              {copiedId === secret.id ? "已复制" : "复制"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-20 text-xs"
                              disabled={secret.status !== "available"}
                              onClick={() => deleteSecret(secret.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 shrink-0" />
                              删除
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7}>
                        <EmptyInventory loading={loading} />
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

function ModeButton({
  active,
  description,
  label,
  onClick,
}: {
  active: boolean;
  description: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md border px-3 py-2 text-left transition " +
        (active
          ? "border-sky-300 bg-sky-50 text-sky-800 shadow-sm"
          : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50/70")
      }
    >
      <div className="flex items-center gap-2 text-sm font-bold">
        {active ? <CheckCircle2 className="h-4 w-4 text-sky-600" /> : null}
        {label}
      </div>
      <div className="mt-1 text-xs text-slate-500">{description}</div>
    </button>
  );
}

function StatCard({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "muted" | "success" | "warning";
  value: number;
}) {
  const tones = {
    default: "text-sky-600",
    muted: "text-slate-700",
    success: "text-emerald-600",
    warning: "text-amber-600",
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={"mt-1 text-2xl font-black " + tones[tone]}>{value}</div>
    </div>
  );
}

function BatchButton({
  active,
  available,
  label,
  total,
  used,
  onClick,
}: {
  active: boolean;
  available: number;
  label: string;
  total: number;
  used: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "w-full rounded-md border px-3 py-2 text-left transition " +
        (active
          ? "border-sky-300 bg-sky-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/70")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <span className="line-clamp-1 text-sm font-bold text-slate-800">{label}</span>
        <Badge variant="secondary">{total}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
          可用 {available}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-500">
          已售 {used}
        </span>
      </div>
    </button>
  );
}

function InventoryCard({
  copied,
  secret,
  onCopy,
  onDelete,
}: {
  copied: boolean;
  secret: CardSecretRecord;
  onCopy: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-slate-400">#{secret.id}</div>
          <div className="mt-2 break-words whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 font-mono text-xs leading-5 text-slate-800">
            {secret.secret}
          </div>
        </div>
        <StatusPill status={secret.status} />
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-500">
        <InfoRow label="订单" value={secret.order_no || "-"} />
        <InfoRow label="批次" value={secret.batch_no || "-"} />
        {secret.note ? <InfoRow label="备注" value={secret.note} /> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => { void onCopy(); }}>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="break-all text-right">{value}</span>
    </div>
  );
}

function EmptyInventory({ loading }: { loading: boolean }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
      <div>
        <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
        <div className="mt-3 text-sm font-semibold text-slate-600">
          {loading ? "正在读取库存" : "暂无发货内容"}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          {loading ? "请稍候" : "选择左侧商品并导入后会显示在这里"}
        </div>
      </div>
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
