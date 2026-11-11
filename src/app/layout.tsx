import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_TC } from "next/font/google";
import { PrefsProvider, THEME_BOOT } from "@/components/ui-prefs";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const notoTC = Noto_Sans_TC({ variable: "--font-noto-tc", weight: ["400", "500", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GovFlow — the agent behind government forms",
  description: "Government runs itself. Humans stay in control. An administrative agent for Taipei's Youth AI Tool Subsidy (prototype, synthetic data).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${notoTC.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-full font-sans">
        <PrefsProvider>{children}</PrefsProvider>
      </body>
    </html>
  );
}
