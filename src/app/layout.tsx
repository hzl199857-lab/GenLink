import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist, Geist_Mono } from "next/font/google";
import { BaiduAnalytics } from "@/components/analytics/BaiduAnalytics";
import { UpdateAvailableToast } from "@/components/ui/UpdateAvailableToast";
import "./globals.css";
import "@/components/director-desk/styles/director-desk.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GenLink",
  description: "AI-native creative canvas for connected prompts and outputs.",
  icons: {
    icon: "/icon.png",
    shortcut: "/favicon.ico",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      translate="no"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="gl-canvas-bg min-h-full bg-gl-app text-gl-text-primary">
        {children}
        <UpdateAvailableToast />
        <BaiduAnalytics />
        <Analytics />
      </body>
    </html>
  );
}
