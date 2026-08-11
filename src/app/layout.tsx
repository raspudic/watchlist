import type { Metadata, Viewport } from "next";
import Script from "next/script";

import { PwaRegistration } from "@/components/pwa-registration";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Watchlist",
    template: "%s | Watchlist",
  },
  description: "A quiet place for what you want to watch and what you loved.",
  applicationName: "Watchlist",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Watchlist",
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
          {`try{var theme=localStorage.getItem("watchlist-theme");if(theme!=="light"&&theme!=="dark"&&theme!=="system")theme="system";document.documentElement.dataset.theme=theme}catch{}`}
        </Script>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
