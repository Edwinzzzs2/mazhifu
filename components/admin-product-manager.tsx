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
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [message, setMessage] = useState("");

  const activeProducts = useMemo(
    () => products.filter((product) => product.active).length,
    [products],
  );

  function updateField(field: keyof ProductFormState, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startCreate() {
    setSelectedProduct(null);
    setForm(toFormState());
    setMessage("");
  }

  function selectProduct(product: ProductRecord) {
    setSelectedProduct(product);
    setForm(toFormState(product));
    setMessage("");
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
    setMessage("");

    try {
      const response = await fetch(
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
      setMessage("商品已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateSelectedProduct() {
    if (!selectedProduct) {
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(
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
      setMessage("商品已下架");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "下架失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="admin-panel p-4 xl:sticky xl:top-6 xl:self-start">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">商品库</div>
            <div className="mt-1 text-2xl font-bold">{products.length} 件</div>
          </div>
          <div className="rounded-md bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-600">
            上架 {activeProducts}
          </div>
        </div>
        <Button onClick={startCreate} className="mb-4 w-full bg-sky-500 shadow-none hover:bg-sky-600">
          <Plus className="h-4 w-4" />
          新增商品
        </Button>

        <div className="touch-scroll max-h-[42vh] space-y-2 overflow-y-auto pr-1 sm:max-h-72 xl:max-h-[calc(100vh-280px)]">
          {products.map((product) => {
            const active = selectedProduct?.id === product.id;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => selectProduct(product)}
                className={
                  "w-full rounded-md border p-3 text-left transition " +
                  (active
                    ? "border-sky-400 bg-sky-50"
                    : "border-slate-100 bg-white hover:border-sky-200")
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="line-clamp-2 font-bold">{product.name}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      ¥{Number(product.price).toFixed(2)} · 库存 {product.stock}
                    </div>
                  </div>
                  {product.active ? (
                    <span className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-600">
                      上架
                    </span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">
                      下架
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="admin-panel min-w-0">
        <div className="flex flex-col gap-4 border-b border-sky-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-sky-600">
              <Edit3 className="h-4 w-4" />
              {selectedProduct ? "编辑商品" : "新增商品"}
            </div>
            <h2 className="mt-1 truncate text-lg font-bold sm:text-xl">{form.name || "未命名商品"}</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            {selectedProduct ? (
              <Button variant="outline" onClick={deactivateSelectedProduct} disabled={saving}>
                <Trash2 className="h-4 w-4" />
                下架
              </Button>
            ) : null}
            <Button onClick={saveProduct} disabled={saving} className="bg-emerald-500 shadow-none hover:bg-emerald-600">
              <Save className="h-4 w-4" />
              {saving ? "保存中" : "保存"}
            </Button>
          </div>
        </div>

        <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <AdminField label="商品名称">
                <input className="admin-input" value={form.name} onChange={(event) => updateField("name", event.target.value)} />
              </AdminField>
              <AdminField label="分类">
                <select className="admin-input" value={form.category_id} onChange={(event) => updateField("category_id", event.target.value)}>
                  <option value="">默认分类</option>
                  {initial_categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="价格">
                <input className="admin-input" value={form.price} onChange={(event) => updateField("price", event.target.value)} />
              </AdminField>
              <AdminField label="可用卡密">
                <input className="admin-input bg-slate-50 text-slate-500" value={form.stock} readOnly />
              </AdminField>
              <AdminField label="副标题">
                <input className="admin-input" value={form.subtitle} onChange={(event) => updateField("subtitle", event.target.value)} />
              </AdminField>
              <AdminField label="标签">
                <input className="admin-input" value={form.badge} onChange={(event) => updateField("badge", event.target.value)} />
              </AdminField>
            </div>

            <AdminField label="封面图 URL">
              <input className="admin-input" value={form.image_url} onChange={(event) => updateField("image_url", event.target.value)} />
            </AdminField>

            <AdminField label="商品描述">
              <textarea className="admin-input min-h-24 resize-y" value={form.description} onChange={(event) => updateField("description", event.target.value)} />
            </AdminField>

            <AdminField label="使用说明 / 发货内容">
              <textarea className="admin-input min-h-40 resize-y" value={form.instructions} onChange={(event) => updateField("instructions", event.target.value)} />
            </AdminField>

            <AdminField label="卖点特性（每行一个）">
              <textarea className="admin-input min-h-24 resize-y" value={form.features} onChange={(event) => updateField("features", event.target.value)} />
            </AdminField>

            <label className="flex items-center gap-3 rounded-md border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => updateField("active", event.target.checked)}
                className="h-4 w-4"
              />
              上架展示
            </label>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-md border border-sky-100 bg-sky-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                <LayoutGrid className="h-4 w-4 text-sky-500" />
                前台预览
              </div>
              <div className="overflow-hidden rounded-md border border-sky-100 bg-white">
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

            <div className="rounded-md border border-sky-100 bg-white p-4 text-sm leading-7 text-slate-600">
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
                库存来自可用卡密数量
              </div>
              <div className="flex items-center gap-2">
                <EyeOff className="h-4 w-4 text-slate-400" />
                下架后旧订单不受影响
              </div>
            </div>

            {message ? (
              <div className="rounded-md border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700">
                {message}
              </div>
            ) : null}
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
