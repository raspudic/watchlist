import type { Metadata } from "next";

import { LibraryView } from "@/components/library-view";

export const metadata: Metadata = { title: "Watchlist" };

export default function WatchlistPage() {
  return <LibraryView mode="watchlist" />;
}
