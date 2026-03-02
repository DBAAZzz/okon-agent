import type { Metadata } from 'next';
import { Fraunces, Manrope } from 'next/font/google';
import { getAppBaseUrl } from '@/lib/server/env';
import './globals.css';

const appBaseUrl = getAppBaseUrl();

export const metadata: Metadata = {
  metadataBase: new URL(appBaseUrl),
  title: {
    default: 'Okon Agent',
    template: '%s | Okon Agent',
  },
  description: 'AI Agent with tool calling and approval flow',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Okon Agent',
    description: 'AI Agent with tool calling and approval flow',
    url: appBaseUrl,
    siteName: 'Okon Agent',
    locale: 'zh_CN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Okon Agent',
    description: 'AI Agent with tool calling and approval flow',
  },
};

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-fraunces',
  display: 'swap',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${manrope.variable} ${fraunces.variable}`}>{children}</body>
    </html>
  );
}
