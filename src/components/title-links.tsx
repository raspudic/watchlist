"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { readApiJson } from "@/lib/api-response";
import { type LinkableMediaType, titleLinks } from "@/lib/title-links";

type ExternalIds = { imdbId: string | null };

type Result = { key: string; externalIds: ExternalIds };

// A title's ids never change, so the first answer holds for the tab's lifetime.
// The server keeps the durable 30-day cache.
const cache = new Map<string, ExternalIds>();

export type TitleLinksItem = {
  externalId: number | null;
  mediaType: "movie" | "tv" | "other";
  provider: string;
};

export function TitleLinks({ item }: { item: TitleLinksItem }) {
  const tmdbId = item.externalId;
  const mediaType = item.mediaType;

  // Custom entries and "other" media have nothing to link to.
  if (item.provider !== "tmdb" || tmdbId === null) return null;
  if (mediaType !== "movie" && mediaType !== "tv") return null;

  return <LinkRow mediaType={mediaType} tmdbId={tmdbId} />;
}

function LinkRow({ mediaType, tmdbId }: { mediaType: LinkableMediaType; tmdbId: number }) {
  const key = `${mediaType}:${tmdbId}`;
  // The result carries the key it belongs to, so switching titles falls back to
  // the empty state during render rather than through a setState.
  const [result, setResult] = useState<Result | null>(null);

  const current = cache.has(key)
    ? cache.get(key)!
    : result?.key === key ? result.externalIds : null;

  useEffect(() => {
    if (cache.has(key)) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ mediaType, tmdbId: String(tmdbId) });

    fetch(`/api/external-ids?${params}`, { cache: "no-store", signal: controller.signal })
      .then((response) => readApiJson<{ externalIds: ExternalIds }>(response))
      .then((data) => {
        cache.set(key, data.externalIds);
        setResult({ key, externalIds: data.externalIds });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        // The links that need no lookup are still worth offering, and a failed
        // one is left out rather than announced: this row is not the task.
        setResult({ key, externalIds: { imdbId: null } });
      });

    return () => controller.abort();
  }, [key, mediaType, tmdbId]);

  // The row appears once, complete. Waiting is quieter than letting IMDb push
  // its way in at the head of a row the reader has already started scanning.
  if (!current) return null;

  return (
    <ul className="title-links">
      {titleLinks({ imdbId: current.imdbId, mediaType, tmdbId }).map((link) => (
        <li key={link.href}>
          <a href={link.href} rel="noreferrer" target="_blank">
            {link.label} <ExternalLink aria-hidden="true" size={12} />
          </a>
        </li>
      ))}
    </ul>
  );
}
