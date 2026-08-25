/* TMDB poster URLs are already sized at the CDN; using a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import { Clapperboard } from "lucide-react";
import type { ReactNode } from "react";

import { TypeBadge } from "@/components/ui/badge";
import { SheetTitle } from "@/components/ui/sheet";
import { WatchProviders } from "@/components/watch-providers";
import { mediaLabel, posterUrl } from "@/lib/media-display";

export type MediaDetailItem = {
  externalId: number | null;
  mediaType: "movie" | "tv" | "other";
  overview: string | null;
  posterPath: string | null;
  provider: string;
  releaseYear: number | null;
  title: string;
};

/** Shared read-only title presentation for preview, watchlist and watched. */
export function MediaDetailOverview({
  children,
  item,
  titleMeta,
}: {
  children?: ReactNode;
  item: MediaDetailItem;
  titleMeta?: ReactNode;
}) {
  const poster = posterUrl(item.posterPath, "w342");

  return (
    <>
      <div className="detail-hero">
        {poster ? (
          <img className="detail-poster" alt="" src={poster} />
        ) : (
          <span className="detail-poster placeholder"><Clapperboard size={32} /></span>
        )}
        <div className="detail-title-copy">
          <TypeBadge>{mediaLabel(item.mediaType)}</TypeBadge>
          <SheetTitle className="detail-title">{item.title}</SheetTitle>
          {item.releaseYear ? <p className="detail-year">{item.releaseYear}</p> : null}
          {titleMeta}
        </div>
      </div>

      {item.overview ? <p className="overview">{item.overview}</p> : null}
      {children}
      <WatchProviders item={item} />
    </>
  );
}
