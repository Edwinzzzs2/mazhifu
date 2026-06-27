import { Storefront } from "@/components/storefront";
import { cookies } from "next/headers";
import { listCategories, listProducts } from "@/lib/products";

type HomePageProps = {
  searchParams?: {
    checkout?: string;
  };
};

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: HomePageProps) {
  const [categories, products] = await Promise.all([
    listCategories(),
    listProducts(),
  ]);

  return (
    <Storefront
      categories={categories}
      products={products}
      checkout_failed={searchParams?.checkout === "failed"}
    />
  );
}
