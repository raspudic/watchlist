/* TMDB poster URLs are already sized at the CDN; using a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import { Clapperboard, Star } from "lucide-react";
import type { ReactNode } from "react";

/* The content of a media search result. The interactive container stays with
   the caller — an autocomplete item, a button, or a bulk-match row. */
export function MediaResultContent({
  meta,
  noteLabel,
  noteValue,
  posterUrl,
  rating,
  title,
  trailing,
}: {
  meta?: ReactNode;
  noteLabel?: string;
  noteValue?: string;
  posterUrl: string | null;
  rating?: number | null;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <>
      {posterUrl ? (
        <img alt="" src={posterUrl} />
      ) : (
        <span className="mini-poster"><Clapperboard aria-hidden="true" size={16} /></span>
      )}
      <span className="result-copy">
        <strong>{title}</strong>
        {meta ? <span>{meta}</span> : null}
        {noteValue ? (
          <span className="library-note-match">
            {noteLabel ? <b>{noteLabel}</b> : null} {noteValue}
          </span>
        ) : null}
      </span>
      {rating !== null && rating !== undefined ? (
        <span className="search-rating">
          <Star aria-hidden="true" fill="currentColor" size={12} />
          {rating}
        </span>
      ) : null}
      {trailing}
    </>
  );
}
