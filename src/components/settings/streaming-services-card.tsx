"use client";

/* Provider logos are already sized at the TMDB CDN; a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { CheckboxField, TextField } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useRegion } from "@/components/region-provider";
import { readApiJson } from "@/lib/api-response";
import { providerLogoUrl } from "@/lib/media-display";

type StreamingService = {
  id: number;
  name: string;
  logoPath: string | null;
  mediaTypes: Array<"movie" | "tv">;
};

type StreamingServicesResponse = {
  providers: StreamingService[];
  region: string | null;
  selectedProviderIds: number[];
};

function sameIds(left: Set<number>, right: Set<number>) {
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

export function StreamingServicesCard() {
  const { region } = useRegion();
  const toast = useToast();
  const [providers, setProviders] = useState<StreamingService[]>([]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [stored, setStored] = useState<Set<number>>(() => new Set());
  const [query, setQuery] = useState("");
  const [loadedRegion, setLoadedRegion] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; region: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!region) {
      return;
    }

    const controller = new AbortController();

    fetch("/api/streaming-services", { cache: "no-store", signal: controller.signal })
      .then((response) => readApiJson<StreamingServicesResponse>(response))
      .then((data) => {
        const ids = new Set(data.selectedProviderIds);
        setProviders(data.providers);
        setSelected(ids);
        setStored(new Set(ids));
        setLoadError(null);
        setLoadedRegion(region);
      })
      .catch((caught: unknown) => {
        if ((caught as Error).name !== "AbortError") {
          setLoadError({
            message: caught instanceof Error ? caught.message : "Could not load streaming services.",
            region,
          });
        }
      });

    return () => controller.abort();
  }, [region]);

  const visibleProviders = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const matches = needle
      ? providers.filter((provider) => provider.name.toLocaleLowerCase().includes(needle))
      : providers;

    return [...matches].sort((left, right) => {
      const selectedDifference = Number(selected.has(right.id)) - Number(selected.has(left.id));
      return selectedDifference || left.name.localeCompare(right.name);
    });
  }, [providers, query, selected]);

  async function save() {
    setSaving(true);
    setSaveError("");

    try {
      const data = await readApiJson<StreamingServicesResponse>(await fetch("/api/streaming-services", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerIds: [...selected] }),
      }));
      const ids = new Set(data.selectedProviderIds);
      setSelected(ids);
      setStored(new Set(ids));
      toast.add({ title: "Streaming services updated." });
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not save streaming services.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

    /* Acting on a search result means you are done with that search. Clearing
       it hands back the whole list, with the choice you just made on top, and
       the field keeps focus so the next service can be typed straight away. */
    if (query) {
      setQuery("");
      searchRef.current?.focus();
    }
  }

  const currentLoadError = region && loadError?.region === region ? loadError.message : "";
  const loading = Boolean(region && loadedRegion !== region && !currentLoadError);
  const error = saveError || currentLoadError;

  return (
    <section className="settings-card">
      <h2>Your streaming services</h2>
      <p>Used by Tonight to show titles included with services you already have.</p>

      {!region ? (
        <p className="streaming-services-note">Choose and save your country above first.</p>
      ) : null}

      {region && loading ? (
        <div className="streaming-services-state" role="status">
          <Spinner size={18} /> Loading services…
        </div>
      ) : null}

      {error ? <InlineMessage>{error}</InlineMessage> : null}

      {region && !loading && !error && providers.length === 0 ? (
        <p className="streaming-services-note">No subscription services are listed for this country yet.</p>
      ) : null}

      {region && !loading && !error && providers.length > 0 ? (
        <div className="streaming-services-picker">
          <TextField
            label="Find a service"
            onChange={(event) => setQuery(event.target.value)}
            ref={searchRef}
            placeholder="Netflix, Max, Disney+…"
            type="search"
            value={query}
          />
          <p className="streaming-services-summary" aria-live="polite">
            {selected.size} {selected.size === 1 ? "service" : "services"} selected
          </p>
          <div className="streaming-services-list">
            {visibleProviders.map((provider) => {
              const logo = providerLogoUrl(provider.logoPath);
              const availability = provider.mediaTypes.length === 2
                ? "Movies and series"
                : provider.mediaTypes[0] === "movie" ? "Movies" : "Series";
              return (
                <div className="streaming-service-option" key={provider.id}>
                  {logo ? <img alt="" src={logo} /> : <span className="streaming-service-logo-placeholder" />}
                  <CheckboxField
                    checked={selected.has(provider.id)}
                    disabled={saving}
                    label={<span><strong>{provider.name}</strong><small>{availability}</small></span>}
                    onCheckedChange={(checked) => toggle(provider.id, checked)}
                  />
                </div>
              );
            })}
            {visibleProviders.length === 0 ? (
              <p className="streaming-services-note">No services match that search.</p>
            ) : null}
          </div>
          <div className="settings-actions">
            <Button
              disabled={sameIds(selected, stored)}
              loading={saving}
              onClick={() => void save()}
              variant="secondary"
            >
              Save services
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
