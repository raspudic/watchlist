import type { Metadata, Viewport } from "next";
import Script from "next/script";

import { PwaRegistration } from "@/components/pwa-registration";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "watchlist",
    template: "%s · watchlist",
  },
  description: "A quiet place for what you want to watch and what you loved.",
  applicationName: "watchlist",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "watchlist",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#111214" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="theme-preference" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
