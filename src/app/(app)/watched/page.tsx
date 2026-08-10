import type { Metadata } from "next";

import { LibraryView } from "@/components/library-view";

export const metadata: Metadata = { title: "Watched" };

export default function WatchedPage() {
  return <LibraryView mode="watched" />;
}
