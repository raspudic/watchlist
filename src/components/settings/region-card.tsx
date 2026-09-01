"use client";

import { RegionPicker } from "@/components/region-select";
import { useToast } from "@/components/ui/toast";

export function RegionCard() {
  const toast = useToast();

  return (
    <section className="settings-card">
      <h2>Your countries</h2>
      <p>
        Up to three. The first is home, and every title says which of them it streams in.
        Removing a country also drops the services only it carried.
      </p>
      <RegionPicker onSaved={() => toast.add({ title: "Countries updated." })} />
    </section>
  );
}
