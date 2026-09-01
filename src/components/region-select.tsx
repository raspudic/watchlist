"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { useRegion } from "@/components/region-provider";
import { Button, IconButton } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { readApiJson } from "@/lib/api-response";
import { MAX_ACCOUNT_REGIONS, regionFlag } from "@/lib/region";

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

/**
 * The flag is decoration: platforms without flag glyphs draw the two letters,
 * so the country code always travels with it.
 */
export function RegionMark({ code }: { code: string }) {
  return (
    <span className="region-mark">
      <span aria-hidden="true">{regionFlag(code)}</span> {code}
    </span>
  );
}

async function saveRegions(regions: string[]) {
  return readApiJson<{ regions: string[] }>(await fetch("/api/regions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regions }),
  }));
}

/** Loads the country list once and prefills the browser's guess. */
function useWatchRegions() {
  const { suggestedRegion } = useRegion();
  const [regions, setRegions] = useState<WatchRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  useEffect(() => {
    let active = true;

    loadWatchRegions()
      .then((list) => { if (active) setRegions(list); })
      .catch(() => { if (active) setListError("Could not load the country list."); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, []);

  // Only suggest a country TMDB actually has data for.
  const suggestion = suggestedRegion && regions.some((entry) => entry.code === suggestedRegion)
    ? suggestedRegion
    : "";

  return { listError, loading, regions, suggestion };
}

/**
 * Sets the first country, for the prompt inside a title's detail sheet. The
 * full list lives in Settings; here one country is the whole question.
 */
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
  const { regions: saved, setRegions } = useRegion();
  const { listError, loading, regions, suggestion } = useWatchRegions();
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const value = selected || saved[0] || suggestion;

  async function save() {
    if (!value) return;
    setSaving(true);
    setError("");

    try {
      const data = await saveRegions([value, ...saved.filter((code) => code !== value)]);
      setRegions(data.regions);
      onSaved?.(value);
    } catch {
      setError("Could not save your country.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="region-select">
      <SelectField
        description={description}
        disabled={loading || saving || regions.length === 0}
        error={error || listError}
        label={label}
        onChange={(event) => setSelected(event.target.value)}
        value={value}
      >
        <option value="" disabled>
          {loading ? "Loading countries…" : "Choose a country"}
        </option>
        {regions.map((entry) => (
          <option key={entry.code} value={entry.code}>{entry.name}</option>
        ))}
      </SelectField>
      <Button
        disabled={!value || value === saved[0]}
        loading={saving}
        onClick={() => void save()}
        variant="secondary"
      >
        {saveLabel}
      </Button>
    </div>
  );
}

/** The whole list, for Settings: add, remove, and choose which one is home. */
export function RegionPicker({ onSaved }: { onSaved?: () => void }) {
  const { regions: saved, setRegions } = useRegion();
  const { listError, loading, regions, suggestion } = useWatchRegions();
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const full = saved.length >= MAX_ACCOUNT_REGIONS;
  const available = regions.filter((entry) => !saved.includes(entry.code));
  const value = selected || (saved.includes(suggestion) ? "" : suggestion);

  async function commit(next: string[]) {
    setSaving(true);
    setError("");

    try {
      const data = await saveRegions(next);
      setRegions(data.regions);
      setSelected("");
      onSaved?.();
    } catch {
      setError("Could not save your countries.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="region-picker">
      {saved.length > 0 ? (
        <ul className="region-list">
          {saved.map((code, index) => (
            <li key={code}>
              <RegionMark code={code} />
              <span className="region-name">{regionName(regions, code)}</span>
              {index === 0 ? (
                <span className="region-home">Home</span>
              ) : (
                <Button
                  disabled={saving}
                  onClick={() => void commit([code, ...saved.filter((entry) => entry !== code)])}
                  size="sm"
                  variant="quiet"
                >
                  Make home
                </Button>
              )}
              <IconButton
                disabled={saving}
                label={`Remove ${regionName(regions, code)}`}
                onClick={() => void commit(saved.filter((entry) => entry !== code))}
              >
                <X aria-hidden="true" size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}

      {full ? (
        <p className="region-note">
          Three countries is the limit. Remove one to add another.
        </p>
      ) : (
        <div className="region-select">
          <SelectField
            disabled={loading || saving || available.length === 0}
            label={saved.length === 0 ? "Country" : "Add another country"}
            onChange={(event) => setSelected(event.target.value)}
            value={value}
          >
            <option value="" disabled>
              {loading ? "Loading countries…" : "Choose a country"}
            </option>
            {available.map((entry) => (
              <option key={entry.code} value={entry.code}>{entry.name}</option>
            ))}
          </SelectField>
          <Button
            disabled={!value}
            loading={saving}
            onClick={() => void commit([...saved, value])}
            variant="secondary"
          >
            {saved.length === 0 ? "Save" : "Add"}
          </Button>
        </div>
      )}

      {/* Outside the select: removing a country at the cap has no select to
          hang an error on. */}
      {error || listError ? <p className="field-error" role="alert">{error || listError}</p> : null}
    </div>
  );
}
