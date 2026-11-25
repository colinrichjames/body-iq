import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Pwa } from "@/components/pwa";

export const metadata: Metadata = {
  title: "Body IQ",
  description: "Training, nutrition and recovery in one Body IQ score.",
  appleWebApp: { capable: true, title: "Body IQ", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Pwa />
        {children}
      </body>
    </html>
  );
}
