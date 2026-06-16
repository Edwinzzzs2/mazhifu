import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "码支付卡密铺",
  description: "Next.js + shadcn 风格组件的码支付卡密铺",
};

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
