"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { useRegion } from "@/components/region-provider";
import { readApiJson } from "@/lib/api-response";
import { authClient } from "@/lib/auth-client";

export type WatchRegion = { code: string; name: string };

let regionsPromise: Promise<WatchRegion[]> | null = null;

/**
 * The country list comes from TMDB rather than a full ISO table: only the
 * countries JustWatch covers can ever return an answer.
 */
export function loadWatchRegions() {
  regionsPromise ??= (async () => {
    try {
      const data = await readApiJson<{ regions: WatchRegion[] }>(
        await fetch("/api/watch-regions", { cache: "no-store" }),
      );
      return data.regions;
    } catch (error) {
      regionsPromise = null;
      throw error;
    }
  })();

  return regionsPromise;
}

export function regionName(regions: WatchRegion[], code: string) {
  return regions.find((entry) => entry.code === code)?.name ?? code;
}

export function RegionSelect({
  description,
  label = "Country",
  onSaved,
  saveLabel = "Save",
}: {
  description?: string;
  label?: string;
  onSaved?: (region: string) => void;
  saveLabel?: string;
}) {
  const { region, setRegion, suggestedRegion } = useRegion();
  const [regions, setRegions] = useState<WatchRegion[]>([]);
  const [selected, setSelected] = useState(region ?? "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    loadWatchRegions()
      .then((list) => {
        if (!active) return;
        setRegions(list);
        // Prefill only once the list is known, so the guess is never a country
        // TMDB has no data for.
        setSelected((current) => {
          if (current) return current;
          const suggested = suggestedRegion;
          return suggested && list.some((entry) => entry.code === suggested) ? suggested : "";
        });
      })
      .catch(() => {
        if (active) setError("Could not load the country list.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [suggestedRegion]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError("");

    const result = await authClient.updateUser({ region: selected });
    setSaving(false);

    if (result.error) {
      setError("Could not save your country.");
      return;
    }

    setRegion(selected);
    onSaved?.(selected);
  }

  return (
    <div className="region-select">
      <SelectField
        description={description}
        disabled={loading || saving || regions.length === 0}
        error={error}
        label={label}
        onChange={(event) => setSelected(event.target.value)}
        value={selected}
      >
        <option value="" disabled>
          {loading ? "Loading countries…" : "Choose a country"}
        </option>
        {regions.map((entry) => (
          <option key={entry.code} value={entry.code}>{entry.name}</option>
        ))}
      </SelectField>
      <Button
        disabled={!selected || selected === region}
        loading={saving}
        onClick={save}
        variant="secondary"
      >
        {saveLabel}
      </Button>
    </div>
  );
}
