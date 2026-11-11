import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_TC } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const notoTC = Noto_Sans_TC({ variable: "--font-noto-tc", weight: ["400", "500", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GovFlow — 政府行政 agent",
  description: "Government runs itself. Humans stay in control. 臺北市青年 AI 工具補助審查 agent（展示原型，合成資料）",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW" className={`${geistSans.variable} ${geistMono.variable} ${notoTC.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
