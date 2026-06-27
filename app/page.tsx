import { Storefront } from "@/components/storefront";
import { listCategories, listProducts } from "@/lib/products";
import { getSiteSettingsSafe } from "@/lib/site-settings";

type HomePageProps = {
  searchParams?: {
    checkout?: string;
  };
};

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: HomePageProps) {
  const [categories, products, siteSettings] = await Promise.all([
    listCategories(),
    listProducts(),
    getSiteSettingsSafe(),
  ]);

  return (
    <Storefront
      categories={categories}
      products={products}
      site_settings={siteSettings}
      checkout_failed={searchParams?.checkout === "failed"}
    />
  );
}
