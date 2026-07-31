import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  InputValidationError,
  parseCategoryId,
  parseCategoryInput,
} from "@/lib/product-input";
import {
  deactivateCategory,
  getCategoryById,
  updateCategory,
} from "@/lib/products";

type CategoryRouteContext = {
  params: {
    category_id: string;
  };
};

async function adminAllowed(request: Request) {
  try {
    return await isAdminAuthenticated(request);
  } catch {
    return false;
  }
}

function databaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return String((error as { code?: unknown }).code ?? "");
}

async function readJsonObject(request: Request) {
  try {
    return await request.json() as unknown;
  } catch {
    throw new InputValidationError("请求内容必须是有效的 JSON");
  }
}

function categoryErrorResponse(error: unknown, fallback: string) {
  if (error instanceof InputValidationError) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }
  if (databaseErrorCode(error) === "23505") {
    return NextResponse.json({ message: "分类标识已存在" }, { status: 409 });
  }
  return NextResponse.json({ message: fallback }, { status: 500 });
}

export async function GET(request: Request, { params }: CategoryRouteContext) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const categoryId = parseCategoryId(params.category_id);
    const category = await getCategoryById(categoryId);
    if (!category) {
      return NextResponse.json({ message: "分类不存在" }, { status: 404 });
    }
    return NextResponse.json({ category });
  } catch (error) {
    return categoryErrorResponse(error, "读取分类失败");
  }
}

export async function PATCH(request: Request, { params }: CategoryRouteContext) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const categoryId = parseCategoryId(params.category_id);
    const input = parseCategoryInput(await readJsonObject(request));
    const result = await updateCategory(categoryId, input);
    if (!result) {
      return NextResponse.json({ message: "分类不存在" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return categoryErrorResponse(error, "更新分类失败");
  }
}

export async function DELETE(request: Request, { params }: CategoryRouteContext) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const categoryId = parseCategoryId(params.category_id);
    const result = await deactivateCategory(categoryId);
    if (!result) {
      return NextResponse.json({ message: "分类不存在" }, { status: 404 });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return categoryErrorResponse(error, "停用分类失败");
  }
}
