"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Archive,
  Check,
  Edit3,
  EyeOff,
  Image as ImageIcon,
  LayoutGrid,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminFetch } from "@/lib/admin-client-auth";
import type { CategoryRecord, ProductRecord } from "@/lib/products";

type AdminProductManagerProps = {
  initial_categories: CategoryRecord[];
  initial_products: ProductRecord[];
};

type ProductFormState = {
  category_id: string;
  name: string;
  subtitle: string;
  description: string;
  instructions: string;
  price: string;
  stock: string;
  badge: string;
  image_url: string;
  features: string;
  active: boolean;
};

function toFormState(product?: ProductRecord): ProductFormState {
  return {
    category_id: product?.category_id ?? "",
    name: product?.name ?? "",
    subtitle: product?.subtitle ?? "",
    description: product?.description ?? "",
    instructions: product?.instructions ?? "",
    price: product?.price ?? "0.10",
    stock: String(product?.stock ?? 0),
    badge: product?.badge ?? "",
    image_url: product?.image_url ?? "",
    features: product?.features?.join("\n") ?? "自动发货\n服务端验签\n库存扣减",
    active: product?.active ?? true,
  };
}

export function AdminProductManager({
  initial_categories,
  initial_products,
}: AdminProductManagerProps) {
  const [products, setProducts] = useState(initial_products);
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(
    initial_products[0] ?? null,
  );
  const [form, setForm] = useState<ProductFormState>(toFormState(initial_products[0]));
  const [saving, setSaving] = useState(false);
  const [productQuery, setProductQuery] = useState("");

  const activeProducts = useMemo(
    () => products.filter((product) => product.active).length,
    [products],
  );
  const visibleProducts = useMemo(() => {
    const normalizedQuery = productQuery.trim().toLowerCase();
    if (!normalizedQuery) return products;
    return products.filter((product) =>
      [product.name, product.subtitle, product.badge]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [productQuery, products]);

  function updateField(field: keyof ProductFormState, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startCreate() {
    setSelectedProduct(null);
    setForm(toFormState());
  }

  function selectProduct(product: ProductRecord) {
    setSelectedProduct(product);
    setForm(toFormState(product));
  }

  function upsertProduct(product: ProductRecord) {
    setProducts((current) => {
      const exists = current.some((item) => item.id === product.id);
      return exists
        ? current.map((item) => (item.id === product.id ? product : item))
        : [product, ...current];
    });
  }

  // 管理接口只接收下划线字段，避免前后端字段名出现两套兼容逻辑。
  function buildPayload() {
    return {
      category_id: form.category_id || null,
      name: form.name,
      subtitle: form.subtitle,
      description: form.description,
      instructions: form.instructions,
      price: form.price,
      stock: Number(form.stock),
      badge: form.badge,
      image_url: form.image_url,
      features: form.features,
      active: form.active,
    };
  }

  async function saveProduct() {
    setSaving(true);

    try {
      const response = await adminFetch(
        selectedProduct
          ? "/api/admin/products/" + encodeURIComponent(selectedProduct.id)
          : "/api/admin/products",
        {
          method: selectedProduct ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildPayload()),
        },
      );
      const data = (await response.json()) as {
        product?: ProductRecord;
        message?: string;
      };

      if (!response.ok || !data.product) {
        throw new Error(data.message || "保存失败");
      }

      upsertProduct(data.product);
      setSelectedProduct(data.product);
      setForm(toFormState(data.product));
      toast.success("商品已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateSelectedProduct() {
    if (!selectedProduct) {
      return;
    }

    setSaving(true);
    try {
      const response = await adminFetch(
        "/api/admin/products/" + encodeURIComponent(selectedProduct.id),
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error("下架失败");
      }
      const updated = { ...selectedProduct, active: false };
      upsertProduct(updated);
      setSelectedProduct(updated);
      setForm(toFormState(updated));
      toast.success("商品已下架");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "下架失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="admin-panel overflow-hidden xl:sticky xl:top-5 xl:self-start">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
          <div>
            <div className="text-sm font-bold text-slate-900">商品列表</div>
            <div className="mt-0.5 text-xs text-slate-500">共 {products.length} 件商品</div>
          </div>
          <Badge variant="secondary">上架 {activeProducts}</Badge>
        </div>
        <div className="space-y-3 border-b border-slate-100 p-3">
          <Button onClick={startCreate} className="w-full shadow-none">
            <Plus className="h-4 w-4" />
            新增商品
          </Button>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              className="h-9 pl-9"
              placeholder="搜索商品"
            />
          </label>
        </div>

        <div className="touch-scroll max-h-[42vh] space-y-1.5 overflow-y-auto p-2 sm:max-h-72 xl:max-h-[calc(100vh-260px)]">
          {visibleProducts.map((product) => {
            const active = selectedProduct?.id === product.id;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => selectProduct(product)}
                className={
                  "w-full rounded-md border px-3 py-2.5 text-left transition " +
                  (active
                    ? "border-sky-200 bg-sky-50 ring-1 ring-inset ring-sky-100"
                    : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50")
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="line-clamp-1 text-sm font-bold">{product.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      ¥{Number(product.price).toFixed(2)} · 库存 {product.stock}
                    </div>
                  </div>
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${product.active ? "bg-emerald-500" : "bg-slate-300"}`} />
                </div>
              </button>
            );
          })}
          {!visibleProducts.length ? (
            <div className="px-3 py-10 text-center text-sm text-slate-400">没有匹配的商品</div>
          ) : null}
        </div>
      </aside>

      <section className="admin-panel min-w-0">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-700">
              <Edit3 className="h-4 w-4" />
              {selectedProduct ? "编辑商品" : "新增商品"}
            </div>
            <h2 className="mt-1 truncate text-lg font-bold text-slate-950">{form.name || "未命名商品"}</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            {selectedProduct ? (
              <Button variant="outline" onClick={deactivateSelectedProduct} disabled={saving} className="text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700">
                <Trash2 className="h-4 w-4" />
                下架
              </Button>
            ) : null}
            <Button onClick={saveProduct} disabled={saving} className="shadow-none">
              <Save className="h-4 w-4" />
              {saving ? "保存中" : "保存"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 p-4 sm:p-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid min-w-0 gap-6">
            <section className="grid gap-4">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-900">基本信息</h3>
                <p className="mt-0.5 text-xs text-slate-500">用于商品列表、价格展示和分类筛选</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <AdminField label="商品名称">
                  <Input value={form.name} onChange={(event) => updateField("name", event.target.value)} />
                </AdminField>
                <AdminField label="分类">
                  <select className="admin-input h-10" value={form.category_id} onChange={(event) => updateField("category_id", event.target.value)}>
                    <option value="">默认分类</option>
                    {initial_categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </AdminField>
                <AdminField label="价格">
                  <Input inputMode="decimal" value={form.price} onChange={(event) => updateField("price", event.target.value)} />
                </AdminField>
                <AdminField label="可用库存">
                  <Input className="bg-slate-50 text-slate-500" value={form.stock} readOnly />
                </AdminField>
                <AdminField label="副标题">
                  <Input value={form.subtitle} onChange={(event) => updateField("subtitle", event.target.value)} />
                </AdminField>
                <AdminField label="标签">
                  <Input value={form.badge} onChange={(event) => updateField("badge", event.target.value)} />
                </AdminField>
              </div>
            </section>

            <section className="grid gap-4">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-900">内容与展示</h3>
                <p className="mt-0.5 text-xs text-slate-500">补充商品说明、封面和前台卖点</p>
              </div>
              <AdminField label="封面图 URL">
                <Input value={form.image_url} onChange={(event) => updateField("image_url", event.target.value)} />
              </AdminField>
              <AdminField label="商品描述">
                <Textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} />
              </AdminField>
              <AdminField label="使用说明 / 发货内容">
                <Textarea className="min-h-36" value={form.instructions} onChange={(event) => updateField("instructions", event.target.value)} />
              </AdminField>
              <AdminField label="卖点特性（每行一个）">
                <Textarea value={form.features} onChange={(event) => updateField("features", event.target.value)} />
              </AdminField>
            </section>

            <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              <span>
                <span className="block">上架展示</span>
                <span className="mt-0.5 block text-xs font-normal text-slate-500">关闭后不在前台展示，历史订单不受影响</span>
              </span>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => updateField("active", event.target.checked)}
                className="h-4 w-4 shrink-0 accent-sky-600"
              />
            </label>
          </div>

          <aside className="space-y-4 2xl:sticky 2xl:top-5 2xl:self-start">
            <div className="admin-panel-muted p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                <LayoutGrid className="h-4 w-4 text-sky-500" />
                前台预览
              </div>
              <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                <div className="aspect-[16/9] bg-sky-50">
                  {form.image_url ? (
                    <img src={form.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-sky-400">
                      <ImageIcon className="h-14 w-14" strokeWidth={1.4} />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="font-bold">{form.name || "商品名称"}</div>
                  <div className="mt-1 text-sm text-slate-500">{form.subtitle || "商品副标题"}</div>
                  <div className="mt-3 text-2xl font-bold text-sky-500">¥{Number(form.price || 0).toFixed(2)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
              <div className="mb-2 flex items-center gap-2 font-bold text-slate-800">
                <Archive className="h-4 w-4 text-sky-500" />
                上架规则
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                前台只展示上架商品
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                库存来自可用发货内容数量
              </div>
              <div className="flex items-center gap-2">
                <EyeOff className="h-4 w-4 text-slate-400" />
                下架后旧订单不受影响
              </div>
            </div>

          </aside>
        </div>
      </section>
    </div>
  );
}

function AdminField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      {children}
    </label>
  );
}
