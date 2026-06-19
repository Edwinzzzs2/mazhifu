import type { Metadata } from "next";
import { getSiteSettingsSafe } from "@/lib/site-settings";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
