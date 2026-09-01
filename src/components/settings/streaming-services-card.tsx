"use client";

/* Provider logos are already sized at the TMDB CDN; a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { CheckboxField, TextField } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { RegionMark } from "@/components/region-select";
import { useRegion } from "@/components/region-provider";
import { readApiJson } from "@/lib/api-response";
import { providerLogoUrl } from "@/lib/media-display";

type StreamingService = {
  id: number;
  providerIds: number[];
  name: string;
  logoPath: string | null;
  mediaTypes: Array<"movie" | "tv">;
  regions: string[];
};

type StreamingServicesResponse = {
  providers: StreamingService[];
  regions: string[];
  selectedProviderIds: number[];
};

function sameIds(left: Set<number>, right: Set<number>) {
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

function selectedService(provider: StreamingService, selected: Set<number>) {
  return provider.providerIds.some((id) => selected.has(id));
}

function expandSelectedIds(ids: number[], providers: StreamingService[]) {
  const expanded = new Set(ids);
  for (const provider of providers) {
    if (selectedService(provider, expanded)) {
      for (const id of provider.providerIds) expanded.add(id);
    }
  }
  return expanded;
}

export function StreamingServicesCard() {
  const { regions } = useRegion();
  /* A stable key for the saved countries, so the effect reruns when they
     change without depending on the array's identity. */
  const savedRegions = regions.join(",");
  const toast = useToast();
  const [providers, setProviders] = useState<StreamingService[]>([]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [stored, setStored] = useState<Set<number>>(() => new Set());
  const [query, setQuery] = useState("");
  const [loadedRegions, setLoadedRegions] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; regions: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!savedRegions) {
      return;
    }

    const controller = new AbortController();

    fetch("/api/streaming-services", { cache: "no-store", signal: controller.signal })
      .then((response) => readApiJson<StreamingServicesResponse>(response))
      .then((data) => {
        const ids = expandSelectedIds(data.selectedProviderIds, data.providers);
        setProviders(data.providers);
        setSelected(ids);
        setStored(new Set(ids));
        setLoadError(null);
        setLoadedRegions(savedRegions);
      })
      .catch((caught: unknown) => {
        if ((caught as Error).name !== "AbortError") {
          setLoadError({
            message: caught instanceof Error ? caught.message : "Could not load streaming services.",
            regions: savedRegions,
          });
        }
      });

    return () => controller.abort();
  }, [savedRegions]);

  const visibleProviders = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const matches = needle
      ? providers.filter((provider) => provider.name.toLocaleLowerCase().includes(needle))
      : providers;

    return [...matches].sort((left, right) => {
      const selectedDifference = Number(selectedService(right, selected)) - Number(selectedService(left, selected));
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
        body: JSON.stringify({ providerIds: [...selected].sort((a, b) => a - b) }),
      }));
      const ids = expandSelectedIds(data.selectedProviderIds, data.providers);
      setSelected(ids);
      setStored(new Set(ids));
      toast.add({ title: "Streaming services updated." });
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not save streaming services.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(providerIds: number[], checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of providerIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
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

  const currentLoadError = savedRegions && loadError?.regions === savedRegions ? loadError.message : "";
  const loading = Boolean(savedRegions && loadedRegions !== savedRegions && !currentLoadError);
  const error = saveError || currentLoadError;
  const selectedCount = providers.filter((provider) => selectedService(provider, selected)).length;

  return (
    <section className="settings-card">
      <h2>Your streaming services</h2>
      <p>
        What you subscribe to, wherever you are. Your watchlist marks the titles included
        with them, and says which of your countries carries each one.
      </p>

      {regions.length === 0 ? (
        <p className="streaming-services-note">Choose and save a country above first.</p>
      ) : null}

      {savedRegions && loading ? (
        <div className="streaming-services-state" role="status">
          <Spinner size={18} /> Loading services…
        </div>
      ) : null}

      {error ? <InlineMessage>{error}</InlineMessage> : null}

      {savedRegions && !loading && !error && providers.length === 0 ? (
        <p className="streaming-services-note">
          No subscription services are listed for {regions.length === 1 ? "this country" : "these countries"} yet.
        </p>
      ) : null}

      {savedRegions && !loading && !error && providers.length > 0 ? (
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
            {selectedCount} {selectedCount === 1 ? "service" : "services"} selected
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
                    checked={selectedService(provider, selected)}
                    disabled={saving}
                    label={(
                      <span>
                        <strong>{provider.name}</strong>
                        <small>
                          {availability}
                          {/* Which of your countries carry it, when that can differ. */}
                          {regions.length > 1 ? (
                            <> · {provider.regions.map((code) => <RegionMark code={code} key={code} />)}</>
                          ) : null}
                        </small>
                      </span>
                    )}
                    onCheckedChange={(checked) => toggle(provider.providerIds, checked)}
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
