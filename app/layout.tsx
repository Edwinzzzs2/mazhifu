import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { getSiteSettingsSafe } from "@/lib/site-settings";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettingsSafe();
  const title = settings.seo_title || settings.site_name;

  return {
    title,
    description: settings.site_description,
    keywords: settings.seo_keywords
      ? settings.seo_keywords.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
      : undefined,
    icons: {
      icon: settings.site_icon_url || "/icon.svg",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
