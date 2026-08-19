"use client";

import { RegionSelect } from "@/components/region-select";
import { useToast } from "@/components/ui/toast";

export function RegionCard() {
  const toast = useToast();

  return (
    <section className="settings-card">
      <h2>Where to watch</h2>
      <p>The country used to check which services are streaming a title.</p>
      <RegionSelect onSaved={() => toast.add({ title: "Country updated." })} />
    </section>
  );
}
