import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import type { ReactNode } from "react";
import { SupportContact } from "@/components/support-contact";
import { Button } from "@/components/ui/button";
import { getSiteSettingsSafe } from "@/lib/site-settings";

export default async function OrderQueryLayout({ children }: { children: ReactNode }) {
  const siteSettings = await getSiteSettingsSafe();

  return (
    <div className="page-shell">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-3 sm:px-4 md:h-16">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 font-bold">
            <span className="brand-mark h-8 w-8 shrink-0 md:h-9 md:w-9">
              {siteSettings.site_logo_url ? (
                <img
                  src={siteSettings.site_logo_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <ShoppingBag className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base leading-5 sm:text-lg">
                {siteSettings.site_name}
              </span>
              <span className="hidden max-w-sm truncate text-xs font-medium leading-5 text-slate-500 md:block">
                {siteSettings.site_description}
              </span>
            </span>
          </Link>

          <nav className="flex shrink-0 items-center gap-1" aria-label="查单页导航">
            <SupportContact
              contact_email={siteSettings.contact_email}
              contact_text={siteSettings.contact_text}
            />
            <Button asChild variant="outline" size="sm" className="h-9 shadow-none">
              <Link href="/">返回商品</Link>
            </Button>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
