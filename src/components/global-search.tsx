"use client";

/* TMDB poster URLs are already sized at the CDN; using a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import { CheckCircle2, Clapperboard, LoaderCircle, Search, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { MediaItem } from "@/lib/library-cache";

function posterUrl(path: string | null) {
  return path ? `https://image.tmdb.org/t/p/w92${path}` : null;
}

function mediaLabel(type: MediaItem["mediaType"]) {
  if (type === "tv") return "Series";
  if (type === "movie") return "Movie";
  return "Title";
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Something went wrong.");
  return body;
}

function matchingNote(item: MediaItem, query: string) {
  const needle = query.toLocaleLowerCase();
  const notes = [
    { label: "Watchlist note", value: item.watchlistNote },
    { label: "Review note", value: item.reviewNote },
  ];
  return notes.find((note) => note.value?.toLocaleLowerCase().includes(needle)) ?? null;
}

export function GlobalSearch({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function openFromKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
      if ((event.key.toLocaleLowerCase() === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !isTyping)) {
        event.preventDefault();
        onOpenChange(true);
      }
    }
    document.addEventListener("keydown", openFromKeyboard);
    return () => document.removeEventListener("keydown", openFromKeyboard);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 40);
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("panel-open");
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("panel-open");
    };
  }, [onOpenChange, open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const data = await readJson<{ items: MediaItem[] }>(
          await fetch(`/api/library-search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal }),
        );
        setItems(data.items);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setError(caught instanceof Error ? caught.message : "Could not search your library.");
        }
      } finally {
        setSearching(false);
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  function close() {
    onOpenChange(false);
    setQuery("");
    setItems([]);
    setError("");
  }

  function openItem(item: MediaItem) {
    close();
    router.push(`/${item.status}?item=${encodeURIComponent(item.id)}`);
  }

  const watchlist = items.filter((item) => item.status === "watchlist");
  const watched = items.filter((item) => item.status === "watched");

  return (
    <>
      {open ? (
        <div className="modal-layer global-search-layer" onMouseDown={(event) => event.target === event.currentTarget && close()} role="presentation">
          <section aria-labelledby="library-search-title" aria-modal="true" className="library-search-dialog" role="dialog">
            <h2 className="sr-only" id="library-search-title">Search your library</h2>
            <div className="search-input-wrap">
              {searching ? <LoaderCircle className="spin" size={20} /> : <Search size={20} />}
              <input
                aria-label="Search your library"
                autoComplete="off"
                onChange={(event) => {
                  const value = event.target.value;
                  setQuery(value);
                  if (value.trim().length < 2) {
                    setItems([]);
                    setSearching(false);
                    setError("");
                  }
                }}
                placeholder="Search titles and notes..."
                ref={inputRef}
                value={query}
              />
              <button className="close-search" onClick={close} type="button"><X size={18} /><span className="sr-only">Close</span></button>
            </div>

            <div className="library-search-results">
              {error ? <p className="search-message error">{error}</p> : null}
              {!error && query.trim().length < 2 ? <p className="search-message">Search everything you have saved, including notes.</p> : null}
              {!error && query.trim().length >= 2 && !searching && items.length === 0 ? <p className="search-message">Nothing in your library matches that.</p> : null}
              {watchlist.length > 0 ? <SearchGroup items={watchlist} label="Watchlist" onOpen={openItem} query={query} /> : null}
              {watched.length > 0 ? <SearchGroup items={watched} label="Watched" onOpen={openItem} query={query} /> : null}
            </div>
            <div className="library-search-footer"><span>Titles and notes</span><span className="keyboard-hint">Esc to close</span></div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function SearchGroup({
  items,
  label,
  onOpen,
  query,
}: {
  items: MediaItem[];
  label: "Watchlist" | "Watched";
  onOpen: (item: MediaItem) => void;
  query: string;
}) {
  return (
    <section className="library-search-group" aria-label={label}>
      <div className="library-search-group-label">
        <span>{label === "Watched" ? <CheckCircle2 size={13} /> : null}{label}</span>
        <span>{items.length}</span>
      </div>
      {items.map((item) => {
        const poster = posterUrl(item.posterPath);
        const note = matchingNote(item, query.trim());
        return (
          <button className="library-search-result" key={item.id} onClick={() => onOpen(item)} type="button">
            {poster ? <img alt="" src={poster} /> : <span className="mini-poster"><Clapperboard size={16} /></span>}
            <span className="result-copy">
              <strong>{item.title}</strong>
              <span>{[item.releaseYear, mediaLabel(item.mediaType)].filter(Boolean).join(" / ")}</span>
              {note ? <span className="library-note-match"><b>{note.label}</b> {note.value}</span> : null}
            </span>
            {item.rating !== null ? <span className="search-rating"><Star size={12} fill="currentColor" />{item.rating}</span> : null}
          </button>
        );
      })}
    </section>
  );
}
