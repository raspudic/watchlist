import type { Metadata } from "next";

import { TonightView } from "@/components/tonight-view";

export const metadata: Metadata = { title: "Tonight" };

export default function TonightPage() {
  return <TonightView />;
}
