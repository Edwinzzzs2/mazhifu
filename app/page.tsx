import { Storefront } from "@/components/storefront";
import { cookies } from "next/headers";
import { expirePendingOrders } from "@/lib/orders";
import { listCategories, listProducts } from "@/lib/products";

const HOME_EXPIRE_CHECK_COOKIE = "mazhifu_home_expire_checked";

type HomePageProps = {
  searchParams?: {
    checkout?: string;
  };
};

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: HomePageProps) {
  if (!cookies().get(HOME_EXPIRE_CHECK_COOKIE)?.value) {
    await expirePendingOrders(100);
  }

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
