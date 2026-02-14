import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Okon Agent",
  description: "AI Agent with tool calling and approval flow",
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
