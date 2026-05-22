import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ActiveCompanyProvider } from "./components/ActiveCompanyProvider";
import { CrmAppChrome } from "./components/CrmAppChrome";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LINE Work AI · 客戶關係管理",
  description: "以 LINE 對話為核心的 AI 客戶追蹤與成交助手",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ActiveCompanyProvider>
          <CrmAppChrome>{children}</CrmAppChrome>
        </ActiveCompanyProvider>
      </body>
    </html>
  );
}
