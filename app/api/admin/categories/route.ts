import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  InputValidationError,
  parseCategoryInput,
} from "@/lib/product-input";
import { createCategory, listCategories } from "@/lib/products";

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

export async function GET(request: Request) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const categories = await listCategories(true);
    return NextResponse.json({ categories });
  } catch (error) {
    return categoryErrorResponse(error, "读取分类失败");
  }
}

export async function POST(request: Request) {
  if (!(await adminAllowed(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const input = parseCategoryInput(await readJsonObject(request));
    const category = await createCategory(input);
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return categoryErrorResponse(error, "创建分类失败");
  }
}
