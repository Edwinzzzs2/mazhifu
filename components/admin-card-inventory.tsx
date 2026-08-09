"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { adminFetch } from "@/lib/admin-client-auth";
import type {
  CardSecretBatchStats,
  CardSecretRecord,
  CardSecretSortKey,
  CardSecretStats,
  SortDirection,
} from "@/lib/card-secrets";
import type { ProductRecord } from "@/lib/products";

type AdminCardInventoryProps = {
  products: ProductRecord[];
};

type ImportMode = "line" | "block";
type InventorySortPreset = `${CardSecretSortKey}:${SortDirection}`;
type InventoryViewState = {
  productId: string;
  status: string;
  query: string;
  batchFilter: string | null;
  page: number;
  sortKey: CardSecretSortKey;
  sortDirection: SortDirection;
};

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

const SORT_OPTIONS: Array<{ label: string; value: InventorySortPreset }> = [
  { label: "入库时间：新到旧", value: "created_at:desc" },
  { label: "入库时间：旧到新", value: "created_at:asc" },
  { label: "ID：大到小", value: "id:desc" },
  { label: "ID：小到大", value: "id:asc" },
  { label: "状态：可用优先", value: "status:asc" },
  { label: "状态：已售优先", value: "status:desc" },
  { label: "批次名称：A 到 Z", value: "batch_no:asc" },
  { label: "批次名称：Z 到 A", value: "batch_no:desc" },
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
  const [queryInput, setQueryInput] = useState("");
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [sortKey, setSortKey] = useState<CardSecretSortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [cardSecrets, setCardSecrets] = useState<CardSecretRecord[]>([]);
  const [batches, setBatches] = useState<CardSecretBatchStats[]>([]);
  const [stats, setStats] = useState<CardSecretStats>(emptyStats);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [pendingDelete, setPendingDelete] = useState<CardSecretRecord | null>(null);
  const [contentText, setContentText] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [note, setNote] = useState("");
  const [deduplicate, setDeduplicate] = useState(true);
  const [importMode, setImportMode] = useState<ImportMode>("line");
  const [copiedId, setCopiedId] = useState("");
  const requestIdRef = useRef(0);
  const currentViewRef = useRef<InventoryViewState>({
    productId,
    status,
    query,
    batchFilter,
    page,
    sortKey,
    sortDirection,
  });
  currentViewRef.current = {
    productId,
    status,
    query,
    batchFilter,
    page,
    sortKey,
    sortDirection,
  };

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [productId, products],
  );

  const parsedItems = useMemo(
    () => parseDeliveryItems(contentText, importMode),
    [contentText, importMode],
  );

  useEffect(() => {
    if (batchFilter !== null && !batches.some((batch) => batch.value === batchFilter)) {
      setBatchFilter(null);
    }
  }, [batchFilter, batches]);

  const batchScopeStats = useMemo(
    () => batches.reduce<CardSecretStats>((current, batch) => ({
      total: current.total + batch.total,
      available: current.available + batch.available,
      reserved: current.reserved + batch.reserved,
      used: current.used + batch.used,
    }), { ...emptyStats }),
    [batches],
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadInventory = useCallback(async (view: InventoryViewState) => {
    const requestId = ++requestIdRef.current;
    if (!view.productId) {
      setCardSecrets([]);
      setBatches([]);
      setStats(emptyStats);
      setTotal(0);
      setLoadError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");
    setCardSecrets([]);
    setPendingDelete(null);
    try {
      const response = await adminFetch("/api/admin/card-secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "list",
          product_id: view.productId,
          status: view.status,
          q: view.query,
          ...(view.batchFilter !== null && view.batchFilter !== ""
            ? { batch: view.batchFilter }
            : {}),
          unbatched: view.batchFilter === "",
          page: view.page,
          sort: view.sortKey,
          direction: view.sortDirection,
        }),
      });
      const data = (await response.json()) as {
        card_secrets?: CardSecretRecord[];
        batches?: CardSecretBatchStats[];
        stats?: CardSecretStats;
        total?: number;
        page?: number;
        page_size?: number;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message || "读取库存失败");
      }

      const currentView = currentViewRef.current;
      const viewIsCurrent = requestId === requestIdRef.current
        && view.productId === currentView.productId
        && view.status === currentView.status
        && view.query === currentView.query
        && view.batchFilter === currentView.batchFilter
        && view.page === currentView.page
        && view.sortKey === currentView.sortKey
        && view.sortDirection === currentView.sortDirection;
      if (!viewIsCurrent) return;
      const nextTotal = data.total ?? 0;
      const nextPageSize = data.page_size ?? 50;
      const lastPage = Math.max(1, Math.ceil(nextTotal / nextPageSize));
      if (view.page > lastPage) {
        setTotal(nextTotal);
        setPageSize(nextPageSize);
        setPage(lastPage);
        return;
      }
      setCardSecrets(data.card_secrets ?? []);
      setBatches(data.batches ?? []);
      setStats(data.stats ?? emptyStats);
      setTotal(nextTotal);
      setPage(data.page ?? view.page);
      setPageSize(nextPageSize);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      const message = error instanceof Error ? error.message : "请稍后重试";
      setLoadError(message);
      toast.error("读取发货库存失败", {
        description: message,
      });
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  function prepareViewChange(next: Partial<InventoryViewState>) {
    const current = currentViewRef.current;
    const nextView = { ...current, ...next };
    const changed = current.productId !== nextView.productId
      || current.status !== nextView.status
      || current.query !== nextView.query
      || current.batchFilter !== nextView.batchFilter
      || current.page !== nextView.page
      || current.sortKey !== nextView.sortKey
      || current.sortDirection !== nextView.sortDirection;

    setPendingDelete(null);
    if (!changed) {
      void loadInventory(nextView);
      return;
    }

    requestIdRef.current += 1;
    currentViewRef.current = nextView;
    setCardSecrets([]);
    setLoading(Boolean(nextView.productId));
  }

  useEffect(() => {
    void loadInventory({
      productId,
      status,
      query,
      batchFilter,
      page,
      sortKey,
      sortDirection,
    });
  }, [batchFilter, loadInventory, page, productId, query, sortDirection, sortKey, status]);

  function handleProductChange(value: string) {
    prepareViewChange({
      productId: value,
      query: "",
      batchFilter: null,
      page: 1,
    });
    setProductId(value);
    setBatchFilter(null);
    setQuery("");
    setQueryInput("");
    setPage(1);
    setCardSecrets([]);
    setBatches([]);
    setStats(emptyStats);
    setTotal(0);
  }

  function clearInventoryFilters() {
    prepareViewChange({ status: "", query: "", batchFilter: null, page: 1 });
    setStatus("");
    setQuery("");
    setQueryInput("");
    setBatchFilter(null);
    setPage(1);
  }

  function updateSort(nextKey: CardSecretSortKey) {
    if (nextKey === sortKey) {
      const nextDirection = sortDirection === "asc" ? "desc" : "asc";
      prepareViewChange({ sortDirection: nextDirection, page: 1 });
      setSortDirection(nextDirection);
      setPage(1);
      return;
    }
    const nextDirection = nextKey === "batch_no" || nextKey === "status" ? "asc" : "desc";
    prepareViewChange({ sortKey: nextKey, sortDirection: nextDirection, page: 1 });
    setSortKey(nextKey);
    setSortDirection(nextDirection);
    setPage(1);
  }

  function applySortPreset(value: string) {
    const [nextKey, nextDirection] = value.split(":") as [CardSecretSortKey, SortDirection];
    prepareViewChange({ sortKey: nextKey, sortDirection: nextDirection, page: 1 });
    setSortKey(nextKey);
    setSortDirection(nextDirection);
    setPage(1);
  }

  async function importContents() {
    if (!productId || parsedItems.length === 0) {
      toast.error("请选择商品并填写发货内容");
      return;
    }

    const submittedProductId = productId;
    setSubmitting(true);
    try {
      const response = await adminFetch("/api/admin/card-secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import",
          product_id: submittedProductId,
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
      await loadInventory(currentViewRef.current);
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

  async function deleteSecret(secret: CardSecretRecord) {
    if (secret.product_id !== currentViewRef.current.productId) {
      setPendingDelete(null);
      toast.error("当前商品已切换，请刷新后重试");
      return;
    }

    setPendingDelete(null);
    setDeletingId(secret.id);
    try {
      const response = await adminFetch("/api/admin/card-secrets/" + encodeURIComponent(secret.id), {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message || "只能删除未售出的可用库存");
      }
      toast.success("发货内容已删除");
      await loadInventory(currentViewRef.current);
    } catch (error) {
      toast.error("删除失败", {
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setDeletingId("");
    }
  }

  async function copySecret(secret: CardSecretRecord) {
    await navigator.clipboard.writeText(secret.secret);
    setCopiedId(secret.id);
    window.setTimeout(() => setCopiedId(""), 1400);
    toast.success("已复制发货内容");
  }

  return (
    <section className="admin-panel min-w-0 overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50/60 px-4 py-4 sm:px-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <PackageCheck className="h-4 w-4 text-sky-600" />
              库存概览
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {selectedProduct ? selectedProduct.name : "选择商品后导入发货内容"}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { void loadInventory(currentViewRef.current); }}
            disabled={loading}
            className="h-10 shrink-0 sm:h-9"
          >
            <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
            <span className="hidden sm:inline">刷新</span>
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 min-[360px]:grid-cols-2 xl:grid-cols-[minmax(240px,1.4fr)_repeat(4,minmax(110px,1fr))]">
          <label className="col-span-full grid gap-2 bg-white px-4 py-3 text-xs font-semibold text-slate-500 xl:col-span-1">
            目标商品
            <NativeSelect
              className="h-9 py-1.5 font-semibold text-slate-800"
              value={productId}
              onChange={(event) => handleProductChange(event.target.value)}
              disabled={submitting || Boolean(deletingId)}
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
            </NativeSelect>
          </label>
          <StatCard label="全部内容" value={stats.total} />
          <StatCard label="可售库存" value={stats.available} tone="success" />
          <StatCard label="订单预占" value={stats.reserved} tone="warning" />
          <StatCard label="已发货" value={stats.used} tone="muted" />
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 min-[1800px]:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4 min-[1800px]:sticky min-[1800px]:top-5 min-[1800px]:self-start">
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
                  className="shadow-none"
                >
                  <Upload className="h-4 w-4" />
                  {submitting ? "导入中" : "导入库存"}
                </Button>
              </div>
            </CardContent>
          </Card>

        </aside>

        <div className="min-w-0 space-y-4">
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Layers3 className="h-4 w-4 text-sky-600" />
                批次筛选
              </div>
              <span className="text-xs text-slate-400">按最近入库排序</span>
            </div>
            <div className="touch-scroll flex gap-2 overflow-x-auto pb-1" role="group" aria-label="库存批次筛选">
              <BatchButton
                active={batchFilter === null}
                available={batchScopeStats.available}
                label="全部批次"
                total={batchScopeStats.total}
                used={batchScopeStats.used}
                onClick={() => {
                  prepareViewChange({ batchFilter: null, page: 1 });
                  setBatchFilter(null);
                  setPage(1);
                }}
              />
              {batches.map((batch) => (
                <BatchButton
                  key={batch.value === "" ? "batch:unbatched" : `batch:value:${batch.value}`}
                  active={batchFilter === batch.value}
                  available={batch.available}
                  label={batch.label}
                  latestAt={batch.latest_at}
                  total={batch.total}
                  used={batch.used}
                  onClick={() => {
                    prepareViewChange({ batchFilter: batch.value, page: 1 });
                    setBatchFilter(batch.value);
                    setPage(1);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_140px_190px_auto] xl:items-center">
              <form
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:col-span-2 xl:col-span-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  const nextQuery = queryInput.trim();
                  prepareViewChange({ query: nextQuery, page: 1 });
                  setQuery(nextQuery);
                  setPage(1);
                }}
              >
                <label className="relative block">
                  <span className="sr-only">搜索库存内容</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Textarea
                    className="h-10 min-h-10 resize-none overflow-y-auto py-2 pl-9 leading-5"
                    value={queryInput}
                    onChange={(event) => setQueryInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter"
                        && !event.shiftKey
                        && !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    maxLength={4000}
                    placeholder="精确发货内容 / 批次 / 订单号 / 备注"
                    disabled={submitting || Boolean(deletingId)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={loading || submitting || Boolean(deletingId)}
                  aria-label="搜索库存"
                >
                  搜索
                </Button>
              </form>
              <NativeSelect
                value={status}
                onChange={(event) => {
                  const nextStatus = event.target.value;
                  prepareViewChange({ status: nextStatus, page: 1 });
                  setStatus(nextStatus);
                  setPage(1);
                }}
                aria-label="库存状态"
                disabled={submitting || Boolean(deletingId)}
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item.value || "all"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                value={`${sortKey}:${sortDirection}`}
                onChange={(event) => applySortPreset(event.target.value)}
                aria-label="库存排序"
                disabled={submitting || Boolean(deletingId)}
              >
                {SORT_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </NativeSelect>
              <div className="whitespace-nowrap text-sm font-semibold text-slate-500 sm:col-span-2 xl:col-span-1 xl:text-right">
                当前 {cardSecrets.length} 条 / 共 {total} 条
              </div>
            </div>
          </div>

          {loadError ? (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="text-sm font-bold text-red-800">库存读取失败</div>
                <p className="mt-1 break-words text-xs leading-5 text-red-700">{loadError}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 border-red-200 bg-white text-red-700 hover:bg-red-100 hover:text-red-800"
                onClick={() => { void loadInventory(currentViewRef.current); }}
              >
                <RefreshCw className="h-4 w-4" />
                重试
              </Button>
            </div>
          ) : null}

          {pendingDelete ? (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="text-sm font-bold text-amber-950">
                  确认删除库存 #{pendingDelete.id}？
                </div>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  仅可删除未售出的可用库存，删除后无法恢复
                  {pendingDelete.batch_no ? ` · 批次 ${pendingDelete.batch_no}` : " · 未分批"}。
                </p>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading || Boolean(deletingId)}
                  onClick={() => setPendingDelete(null)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={loading || Boolean(deletingId)}
                  className="bg-amber-700 shadow-none hover:bg-amber-800"
                  onClick={() => { void deleteSecret(pendingDelete); }}
                >
                  {deletingId ? "删除中" : "确认删除"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 2xl:hidden">
            {cardSecrets.length ? (
              cardSecrets.map((secret) => (
                <InventoryCard
                  key={secret.id}
                  copied={copiedId === secret.id}
                  disabled={loading || Boolean(deletingId)}
                  secret={secret}
                  onCopy={() => copySecret(secret)}
                  onDelete={() => setPendingDelete(secret)}
                />
              ))
            ) : loadError ? null : (
              <EmptyInventory
                filtered={Boolean(status || query || batchFilter !== null)}
                loading={loading}
                onClearFilters={clearInventoryFilters}
              />
            )}
          </div>

          <div className="table-shell hidden 2xl:block">
            <div className="touch-scroll max-h-[600px] overflow-auto">
              <table className="w-full min-w-[1120px] table-fixed border-collapse bg-white text-sm">
                <colgroup>
                  <col className="w-[72px]" />
                  <col />
                  <col className="w-[92px]" />
                  <col className="w-[190px]" />
                  <col className="w-[160px]" />
                  <col className="w-[126px]" />
                  <col className="w-[176px]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <SortableTableHead
                      active={sortKey === "id"}
                      direction={sortDirection}
                      label="ID"
                      onClick={() => updateSort("id")}
                    />
                    <th scope="col" className="px-4 py-3">发货内容</th>
                    <SortableTableHead
                      active={sortKey === "status"}
                      direction={sortDirection}
                      label="状态"
                      onClick={() => updateSort("status")}
                    />
                    <th scope="col" className="px-4 py-3">订单</th>
                    <SortableTableHead
                      active={sortKey === "batch_no"}
                      direction={sortDirection}
                      label="批次 / 备注"
                      onClick={() => updateSort("batch_no")}
                    />
                    <SortableTableHead
                      active={sortKey === "created_at"}
                      direction={sortDirection}
                      label="入库时间"
                      onClick={() => updateSort("created_at")}
                    />
                    <th scope="col" className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cardSecrets.length ? (
                    cardSecrets.map((secret) => (
                      <tr key={secret.id} className="align-middle hover:bg-sky-50/60">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{secret.id}</td>
                        <td className="min-w-0 px-4 py-3">
                          <div
                            className={
                              "max-h-16 w-full overflow-hidden break-all rounded-md border border-slate-100 bg-slate-50 px-3 py-2 font-mono text-xs leading-5 text-slate-700 " +
                              (isLongContent(secret.secret) ? "whitespace-pre-wrap" : "")
                            }
                            title={secret.secret}
                          >
                            {secret.secret}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={secret.status} />
                        </td>
                        <td className="min-w-0 px-4 py-3 font-mono text-xs text-slate-500">
                          <div className="truncate" title={secret.order_no || undefined}>
                            {secret.order_no || "-"}
                          </div>
                        </td>
                        <td className="min-w-0 px-4 py-3 text-xs text-slate-500">
                          <div className="truncate font-semibold text-slate-700" title={secret.batch_no || undefined}>{secret.batch_no || "-"}</div>
                          {secret.note ? <div className="mt-1 line-clamp-1" title={secret.note}>{secret.note}</div> : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{formatDate(secret.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-20 text-xs"
                              disabled={loading || Boolean(deletingId)}
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
                              disabled={
                                secret.status !== "available" ||
                                loading ||
                                Boolean(deletingId)
                              }
                              onClick={() => setPendingDelete(secret)}
                            >
                              <Trash2 className="h-3.5 w-3.5 shrink-0" />
                              删除
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : loadError ? null : (
                    <tr>
                      <td colSpan={7}>
                        <EmptyInventory
                          filtered={Boolean(status || query || batchFilter !== null)}
                          loading={loading}
                          onClearFilters={clearInventoryFilters}
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {total > 0 ? (
            <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                第 <span className="font-semibold text-slate-800">{page}</span> / {totalPages} 页，共 {total} 条
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading || page <= 1}
                  onClick={() => {
                    const nextPage = Math.max(1, page - 1);
                    prepareViewChange({ page: nextPage });
                    setPage(nextPage);
                  }}
                >
                  上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading || page >= totalPages}
                  onClick={() => {
                    const nextPage = Math.min(totalPages, page + 1);
                    prepareViewChange({ page: nextPage });
                    setPage(nextPage);
                  }}
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
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
    <div className="bg-white px-4 py-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={"mt-1 text-xl font-bold " + tones[tone]}>{value}</div>
    </div>
  );
}

function SortableTableHead({
  active,
  direction,
  label,
  onClick,
}: {
  active: boolean;
  direction: SortDirection;
  label: string;
  onClick: () => void;
}) {
  const SortIcon = active
    ? direction === "asc" ? ArrowUp : ArrowDown
    : ArrowUpDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className="px-2 py-1"
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 font-bold text-slate-600 transition hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        {label}
        <SortIcon className={`h-3.5 w-3.5 ${active ? "text-sky-600" : "text-slate-400"}`} />
      </button>
    </th>
  );
}

function BatchButton({
  active,
  available,
  label,
  latestAt,
  total,
  used,
  onClick,
}: {
  active: boolean;
  available: number;
  label: string;
  latestAt?: string;
  total: number;
  used: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "min-w-40 flex-none rounded-md border px-3 py-2 text-left transition " +
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
      {latestAt ? (
        <div className="mt-1.5 text-[11px] text-slate-400">最近 {formatDate(latestAt)}</div>
      ) : null}
    </button>
  );
}

function InventoryCard({
  copied,
  disabled,
  secret,
  onCopy,
  onDelete,
}: {
  copied: boolean;
  disabled: boolean;
  secret: CardSecretRecord;
  onCopy: () => Promise<void>;
  onDelete: () => void;
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
        <InfoRow label="入库" value={formatDate(secret.created_at)} />
        {secret.note ? <InfoRow label="备注" value={secret.note} /> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => { void onCopy(); }}
        >
          <Copy className="h-4 w-4" />
          {copied ? "已复制" : "复制"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || secret.status !== "available"}
          onClick={onDelete}
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

function EmptyInventory({
  filtered,
  loading,
  onClearFilters,
}: {
  filtered: boolean;
  loading: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
      <div>
        <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
        <div className="mt-3 text-sm font-semibold text-slate-600">
          {loading ? "正在读取库存" : filtered ? "没有匹配的库存" : "暂无发货内容"}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          {loading
            ? "请稍候"
            : filtered
              ? "请调整批次、状态或搜索条件"
              : "导入发货内容后会显示在这里"}
        </div>
        {!loading && filtered ? (
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onClearFilters}>
            清空筛选
          </Button>
        ) : null}
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
