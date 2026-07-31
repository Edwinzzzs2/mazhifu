"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Archive,
  Boxes,
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
import { NativeSelect } from "@/components/ui/native-select";
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
  sort_order: string;
  badge: string;
  image_url: string;
  features: string;
  active: boolean;
};

type CategoryFormState = {
  name: string;
  slug: string;
  sort_order: string;
  active: boolean;
};

type ProductListSort = "display_order" | "newest" | "price_asc" | "price_desc" | "stock_desc" | "name";

const PRODUCT_LIST_SORT_OPTIONS: Array<{ label: string; value: ProductListSort }> = [
  { label: "展示顺序", value: "display_order" },
  { label: "创建时间从新到旧", value: "newest" },
  { label: "价格从低到高", value: "price_asc" },
  { label: "价格从高到低", value: "price_desc" },
  { label: "库存从多到少", value: "stock_desc" },
  { label: "名称 A 到 Z", value: "name" },
];

function toCategoryFormState(category?: CategoryRecord): CategoryFormState {
  return {
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    sort_order: String(category?.sort_order ?? 0),
    active: category?.active ?? true,
  };
}

function isCategoryFormValid(form: CategoryFormState) {
  const sortOrder = Number(form.sort_order);
  return form.name.trim().length > 0
    && form.name.trim().length <= 80
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())
    && Number.isInteger(sortOrder)
    && sortOrder >= -2_147_483_648
    && sortOrder <= 2_147_483_647;
}

function toFormState(product?: ProductRecord): ProductFormState {
  return {
    category_id: product?.category_id ?? "",
    name: product?.name ?? "",
    subtitle: product?.subtitle ?? "",
    description: product?.description ?? "",
    instructions: product?.instructions ?? "",
    price: product?.price ?? "0.10",
    stock: String(product?.stock ?? 0),
    sort_order: String(product?.sort_order ?? 0),
    badge: product?.badge ?? "",
    image_url: product?.image_url ?? "",
    features: product?.features?.join("\n") ?? "自动发货\n服务端验签\n库存扣减",
    active: product?.active ?? true,
  };
}

function compareIntegerStrings(left: string, right: string) {
  const normalizedLeft = left.replace(/^0+/, "") || "0";
  const normalizedRight = right.replace(/^0+/, "") || "0";
  return normalizedLeft.length - normalizedRight.length
    || normalizedLeft.localeCompare(normalizedRight);
}

function sortProductRecords(products: ProductRecord[], categories: CategoryRecord[]) {
  const categoryOrder = new Map(
    categories.map((category) => [category.id, category.sort_order]),
  );
  return [...products].sort((left, right) => {
    const leftCategoryOrder = left.category_id
      ? categoryOrder.get(left.category_id) ?? Number.MAX_SAFE_INTEGER
      : Number.MAX_SAFE_INTEGER;
    const rightCategoryOrder = right.category_id
      ? categoryOrder.get(right.category_id) ?? Number.MAX_SAFE_INTEGER
      : Number.MAX_SAFE_INTEGER;
    return leftCategoryOrder - rightCategoryOrder
      || (left.category_id && right.category_id
        ? compareIntegerStrings(left.category_id, right.category_id)
        : Number(Boolean(right.category_id)) - Number(Boolean(left.category_id)))
      || left.sort_order - right.sort_order
      || new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      || left.id.localeCompare(right.id);
  });
}

export function AdminProductManager({
  initial_categories,
  initial_products,
}: AdminProductManagerProps) {
  const [categories, setCategories] = useState(initial_categories);
  const [products, setProducts] = useState(initial_products);
  const [view, setView] = useState<"products" | "categories">("products");
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(
    initial_products[0] ?? null,
  );
  const [form, setForm] = useState<ProductFormState>(toFormState(initial_products[0]));
  const [saving, setSaving] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productListSort, setProductListSort] = useState<ProductListSort>("display_order");

  const activeProducts = useMemo(
    () => products.filter((product) => product.active).length,
    [products],
  );
  const visibleProducts = useMemo(() => {
    const normalizedQuery = productQuery.trim().toLowerCase();
    const filtered = normalizedQuery
      ? products.filter((product) =>
          [product.name, product.subtitle, product.badge, product.category_name]
            .filter((value): value is string => Boolean(value))
            .some((value) => value.toLowerCase().includes(normalizedQuery)),
        )
      : products;
    if (productListSort === "display_order") {
      return sortProductRecords(filtered, categories);
    }
    return [...filtered].sort((left, right) => {
      if (productListSort === "newest") {
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
          || left.id.localeCompare(right.id);
      }
      if (productListSort === "price_asc") {
        return Number(left.price) - Number(right.price) || left.id.localeCompare(right.id);
      }
      if (productListSort === "price_desc") {
        return Number(right.price) - Number(left.price) || left.id.localeCompare(right.id);
      }
      if (productListSort === "stock_desc") {
        return right.stock - left.stock || left.id.localeCompare(right.id);
      }
      return left.name.localeCompare(right.name, "zh-CN") || left.id.localeCompare(right.id);
    });
  }, [categories, productListSort, productQuery, products]);

  function updateField(field: keyof ProductFormState, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startCreate() {
    setView("products");
    setSelectedProduct(null);
    setForm(toFormState());
  }

  function selectProduct(product: ProductRecord) {
    setView("products");
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
      sort_order: Number(form.sort_order),
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

  function syncCategory(category: CategoryRecord) {
    setCategories((currentCategories) => {
      const exists = currentCategories.some((item) => item.id === category.id);
      return (exists
        ? currentCategories.map((item) => (item.id === category.id ? category : item))
        : [...currentCategories, category]
      ).sort(
        (left, right) => left.sort_order - right.sort_order || compareIntegerStrings(left.id, right.id),
      );
    });
    setProducts((currentProducts) =>
      currentProducts.map((product) => {
        if (product.category_id !== category.id) return product;
        return category.active
          ? { ...product, category_name: category.name }
          : { ...product, category_id: null, category_name: null };
      }),
    );
    setSelectedProduct((currentProduct) => {
      if (currentProduct?.category_id !== category.id) return currentProduct;
      return category.active
        ? { ...currentProduct, category_name: category.name }
        : { ...currentProduct, category_id: null, category_name: null };
    });
    if (!category.active) {
      setForm((currentForm) => currentForm.category_id === category.id
        ? { ...currentForm, category_id: "" }
        : currentForm);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="admin-panel overflow-hidden xl:sticky xl:top-5 xl:self-start">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
          <div>
            <div className="text-sm font-bold text-slate-900">
              {view === "products" ? "商品管理" : "分类管理"}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {view === "products" ? `共 ${products.length} 件商品` : `共 ${categories.length} 个分类`}
            </div>
          </div>
          <Badge variant="secondary">
            {view === "products"
              ? `上架 ${activeProducts}`
              : `启用 ${categories.filter((category) => category.active).length}`}
          </Badge>
        </div>
        <div className="space-y-3 border-b border-slate-100 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={view === "products" ? "default" : "outline"}
              onClick={() => setView("products")}
              className="shadow-none"
            >
              <LayoutGrid className="h-4 w-4" />
              商品管理
            </Button>
            <Button
              variant={view === "categories" ? "default" : "outline"}
              onClick={() => setView("categories")}
              className="shadow-none"
            >
              <Boxes className="h-4 w-4" />
              分类管理
            </Button>
          </div>
          {view === "products" ? (
            <>
              <Button type="button" variant="outline" onClick={startCreate} className="w-full shadow-none">
                <Plus className="h-4 w-4" />
                新增商品
              </Button>
              <label className="relative block">
                <span className="sr-only">搜索商品</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  className="h-9 pl-9"
                  placeholder="搜索商品"
                />
              </label>
              <NativeSelect
                value={productListSort}
                onChange={(event) => setProductListSort(event.target.value as ProductListSort)}
                aria-label="商品列表排序"
                className="h-9"
              >
                {PRODUCT_LIST_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </NativeSelect>
            </>
          ) : (
            <p className="rounded-md bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">
              分类内容已在右侧展开；停用分类前会提示受影响商品数量。
            </p>
          )}
        </div>

        {view === "products" ? (
          <div className="touch-scroll max-h-[42vh] space-y-1.5 overflow-y-auto p-2 sm:max-h-72 xl:max-h-[calc(100vh-330px)]">
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
                      <div className="mt-1 line-clamp-1 text-xs font-medium text-sky-700">
                        {product.category_name || "未分类"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        ¥{Number(product.price).toFixed(2)} · 库存 {product.stock} · 排序 {product.sort_order}
                      </div>
                    </div>
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${product.active ? "bg-emerald-500" : "bg-slate-300"}`}
                      title={product.active ? "已上架" : "已下架"}
                    >
                      <span className="sr-only">{product.active ? "已上架" : "已下架"}</span>
                    </span>
                  </div>
                </button>
              );
            })}
            {!visibleProducts.length ? (
              <div className="px-3 py-10 text-center text-sm text-slate-400">没有匹配的商品</div>
            ) : null}
          </div>
        ) : null}
      </aside>

      {view === "categories" ? (
        <CategoryManager categories={categories} products={products} onCategoryChange={syncCategory} />
      ) : (
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
                  <NativeSelect value={form.category_id} onChange={(event) => updateField("category_id", event.target.value)}>
                    <option value="">未分类</option>
                    {categories.filter((category) => category.active).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </NativeSelect>
                </AdminField>
                <AdminField label="价格">
                  <Input inputMode="decimal" value={form.price} onChange={(event) => updateField("price", event.target.value)} />
                </AdminField>
                <AdminField label="可用库存">
                  <Input className="bg-slate-50 text-slate-500" value={form.stock} readOnly />
                </AdminField>
                <AdminField label="展示顺序">
                  <Input
                    type="number"
                    step="1"
                    value={form.sort_order}
                    onChange={(event) => updateField("sort_order", event.target.value)}
                  />
                  <span className="-mt-1 text-xs font-normal text-slate-500">数字越小越靠前</span>
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
              <AdminField label="商品使用说明">
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
      )}
    </div>
  );
}

function CategoryManager({
  categories,
  products,
  onCategoryChange,
}: {
  categories: CategoryRecord[];
  products: ProductRecord[];
  onCategoryChange: (category: CategoryRecord) => void;
}) {
  const [createForm, setCreateForm] = useState<CategoryFormState>(toCategoryFormState());
  const [creating, setCreating] = useState(false);
  const canCreate = isCategoryFormValid(createForm);
  const productCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => {
      if (product.category_id) {
        counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1);
      }
    });
    return counts;
  }, [products]);

  function updateCreateField(
    field: keyof CategoryFormState,
    value: string | boolean,
  ) {
    setCreateForm((current) => ({ ...current, [field]: value }));
  }

  async function createCategory() {
    if (!canCreate) {
      toast.error("请填写分类名称、有效的英文标识和整数排序值");
      return;
    }
    setCreating(true);
    try {
      const response = await adminFetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          sort_order: Number(createForm.sort_order),
        }),
      });
      const data = (await response.json()) as {
        category?: CategoryRecord;
        message?: string;
      };
      if (!response.ok || !data.category) {
        throw new Error(data.message || "创建分类失败");
      }
      onCategoryChange(data.category);
      setCreateForm(toCategoryFormState());
      toast.success("分类已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建分类失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="admin-panel min-w-0">
      <div className="border-b border-slate-200 px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-sky-700">
          <Boxes className="h-4 w-4" />
          商品分组
        </div>
        <h2 className="mt-1 text-lg font-bold text-slate-950">分类管理</h2>
        <p className="mt-1 text-sm text-slate-500">
          前台按启用分类筛选；停用分类会将其商品归入“未分类”。
        </p>
      </div>

      <div className="grid gap-5 p-4 sm:p-5">
        <section className="rounded-md border border-sky-100 bg-sky-50/50 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">新建分类</h3>
              <p className="mt-0.5 text-xs text-slate-500">分类标识用于稳定识别，建议使用英文小写。</p>
            </div>
            <Button onClick={createCategory} disabled={creating || !canCreate} className="h-10 shrink-0 shadow-none">
              <Plus className="h-4 w-4" />
              {creating ? "创建中" : "创建分类"}
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_140px]">
            <AdminField label="分类名称 *">
              <Input
                value={createForm.name}
                onChange={(event) => updateCreateField("name", event.target.value)}
                placeholder="例如：会员服务"
                maxLength={80}
              />
            </AdminField>
            <AdminField label="分类标识（英文）*">
              <Input
                value={createForm.slug}
                onChange={(event) => updateCreateField("slug", event.target.value.toLowerCase())}
                placeholder="membership"
                maxLength={64}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              />
              <span className="-mt-1 text-xs font-normal text-slate-500">仅小写字母、数字和单个连字符</span>
            </AdminField>
            <AdminField label="展示顺序">
              <Input
                type="number"
                step="1"
                value={createForm.sort_order}
                onChange={(event) => updateCreateField("sort_order", event.target.value)}
              />
            </AdminField>
            <AdminField label="初始状态">
              <NativeSelect
                value={createForm.active ? "active" : "inactive"}
                onChange={(event) => updateCreateField("active", event.target.value === "active")}
              >
                <option value="active">启用</option>
                <option value="inactive">停用</option>
              </NativeSelect>
            </AdminField>
          </div>
        </section>

        <section className="grid gap-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">已有分类</h3>
              <p className="mt-0.5 text-xs text-slate-500">修改名称、标识或顺序后单独保存。</p>
            </div>
            <Badge variant="secondary">共 {categories.length} 个</Badge>
          </div>
          {categories.map((category) => (
            <CategoryEditor
              key={category.id}
              category={category}
              productCount={productCountByCategory.get(category.id) ?? 0}
              onCategoryChange={onCategoryChange}
            />
          ))}
          {!categories.length ? (
            <div className="rounded-md border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-500">
              暂无分类，请先新建一个分类。
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function CategoryEditor({
  category,
  productCount,
  onCategoryChange,
}: {
  category: CategoryRecord;
  productCount: number;
  onCategoryChange: (category: CategoryRecord) => void;
}) {
  const [form, setForm] = useState<CategoryFormState>(toCategoryFormState(category));
  const [saving, setSaving] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const formValid = isCategoryFormValid(form);

  function updateField(field: keyof CategoryFormState, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function mutateCategory(action: "save" | "activate" | "deactivate") {
    if (action !== "deactivate" && !formValid) {
      toast.error("请填写分类名称、有效的英文标识和整数排序值");
      return;
    }
    setSaving(true);
    try {
      const deactivating = action === "deactivate";
      const response = await adminFetch(
        "/api/admin/categories/" + encodeURIComponent(category.id),
        deactivating
          ? { method: "DELETE" }
          : {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...form,
                sort_order: Number(form.sort_order),
                active: action === "activate" ? true : form.active,
              }),
            },
      );
      const data = (await response.json()) as {
        category?: CategoryRecord;
        detached_product_count?: number;
        message?: string;
      };
      if (!response.ok || !data.category) {
        throw new Error(data.message || "更新分类失败");
      }

      setForm(toCategoryFormState(data.category));
      onCategoryChange(data.category);
      setConfirmingDeactivate(false);
      if (deactivating) {
        const detachedCount = data.detached_product_count ?? 0;
        toast.success(
          detachedCount > 0
            ? `分类已停用，${detachedCount} 件商品已转为未分类`
            : "分类已停用",
        );
      } else if (action === "activate") {
        toast.success("分类已启用");
      } else {
        toast.success("分类已保存");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新分类失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h4 className="truncate text-sm font-bold text-slate-900">{category.name}</h4>
          <Badge
            variant="outline"
            className={category.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}
          >
            {category.active ? "已启用" : "已停用"}
          </Badge>
          <span className="text-xs font-medium text-slate-400">{productCount} 件商品</span>
        </div>
        <div className="flex items-center gap-2">
          {category.active ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmingDeactivate(true)}
              disabled={saving}
              className="h-10 text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 sm:h-9"
            >
              <EyeOff className="h-4 w-4" />
              停用
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => mutateCategory("activate")}
              disabled={saving || !formValid}
              className="h-10 sm:h-9"
            >
              <Check className="h-4 w-4" />
              启用
            </Button>
          )}
          <Button size="sm" onClick={() => mutateCategory("save")} disabled={saving || !formValid} className="h-10 shadow-none sm:h-9">
            <Save className="h-4 w-4" />
            {saving ? "处理中" : "保存"}
          </Button>
        </div>
      </div>
      {confirmingDeactivate ? (
        <div className="mb-4 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p className="leading-6">
            停用后，{productCount} 件关联商品会立即转为未分类，原分类关系不会自动恢复。
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmingDeactivate(false)}
              disabled={saving}
              className="h-10 sm:h-9"
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => mutateCategory("deactivate")}
              disabled={saving}
              className="h-10 bg-amber-700 text-white shadow-none hover:bg-amber-800 sm:h-9"
            >
              确认停用
            </Button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px]">
        <AdminField label="分类名称 *">
          <Input maxLength={80} value={form.name} onChange={(event) => updateField("name", event.target.value)} />
        </AdminField>
        <AdminField label="分类标识（英文）*">
          <Input
            value={form.slug}
            onChange={(event) => updateField("slug", event.target.value.toLowerCase())}
            maxLength={64}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          />
          <span className="-mt-1 text-xs font-normal text-slate-500">仅小写字母、数字和单个连字符</span>
        </AdminField>
        <AdminField label="展示顺序">
          <Input
            type="number"
            step="1"
            value={form.sort_order}
            onChange={(event) => updateField("sort_order", event.target.value)}
          />
        </AdminField>
      </div>
    </article>
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
