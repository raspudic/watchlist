"use client";

/* TMDB poster URLs are already sized at the CDN; using a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  BookmarkPlus,
  Check,
  ChevronRight,
  Clapperboard,
  LoaderCircle,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type ViewMode = "watchlist" | "watched";

export type MediaItem = {
  id: string;
  provider: string;
  externalId: number | null;
  mediaType: "movie" | "tv" | "other";
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  posterPath: string | null;
  overview: string | null;
  status: ViewMode;
  watchlistNote: string | null;
  reviewNote: string | null;
  rating: number | null;
  addedAt: string;
  watchedAt: string | null;
};

type SearchResult = Pick<
  MediaItem,
  "externalId" | "mediaType" | "title" | "originalTitle" | "releaseYear" | "posterPath" | "overview"
> & { provider: "tmdb" };

type UndoState = { item: MediaItem; timer: ReturnType<typeof setTimeout> };

function posterUrl(path: string | null, size = "w185") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
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

export function LibraryView({ mode }: { mode: ViewMode }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);

  useEffect(() => {
    let active = true;

    async function loadItems() {
      try {
        const data = await readJson<{ items: MediaItem[] }>(await fetch(`/api/items?status=${mode}`));
        if (active) setItems(data.items);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load your list.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadItems();
    return () => { active = false; };
  }, [mode]);

  useEffect(() => () => {
    if (undo) clearTimeout(undo.timer);
  }, [undo]);

  async function addItem(result: SearchResult | { provider: "custom"; title: string; mediaType: "other" }) {
    const data = await readJson<{ item: MediaItem }>(
      await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      }),
    );
    setItems((current) => [data.item, ...current.filter((item) => item.id !== data.item.id)]);
    setSelected(data.item);
  }

  function replaceItem(item: MediaItem) {
    if (item.status !== mode) {
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
    } else {
      setItems((current) => current.map((currentItem) => currentItem.id === item.id ? item : currentItem));
    }
    setSelected(item.status === mode ? item : null);
  }

  async function removeItem(item: MediaItem) {
    setSelected(null);
    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));

    try {
      await readJson(await fetch(`/api/items/${item.id}`, { method: "DELETE" }));
      if (undo) clearTimeout(undo.timer);
      const timer = setTimeout(() => setUndo(null), 6000);
      setUndo({ item, timer });
    } catch (caught) {
      setItems((current) => [item, ...current]);
      setError(caught instanceof Error ? caught.message : "Could not remove that title.");
    }
  }

  async function undoRemove() {
    if (!undo) return;
    clearTimeout(undo.timer);
    const item = undo.item;
    setUndo(null);
    try {
      const data = await readJson<{ item: MediaItem }>(
        await fetch(`/api/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: item.status }),
        }),
      );
      setItems((current) => [data.item, ...current]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not restore that title.");
    }
  }

  const needsRating = mode === "watched" ? items.filter((item) => item.rating === null) : [];
  const rated = mode === "watched" ? items.filter((item) => item.rating !== null) : [];

  return (
    <div className="library-page">
      <div className="library-heading">
        <div>
          <p className="eyebrow">Your library</p>
          <h1>{mode === "watchlist" ? "Watchlist" : "Watched"}</h1>
          <p className="heading-copy">
            {mode === "watchlist"
              ? "Everything you want to make time for."
              : "What you have seen, remembered your way."}
          </p>
        </div>
        {mode === "watchlist" ? <QuickAdd onAdd={addItem} /> : null}
      </div>

      {error ? (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} type="button"><X size={16} /></button>
        </div>
      ) : null}

      {loading ? <LoadingList /> : null}

      {!loading && items.length === 0 ? <EmptyState mode={mode} /> : null}

      {!loading && mode === "watchlist" && items.length > 0 ? (
        <section className="media-section" aria-label="Watchlist titles">
          <div className="section-label"><span>{items.length} {items.length === 1 ? "title" : "titles"}</span></div>
          <div className="media-list">
            {items.map((item) => (
              <MediaRow item={item} key={item.id} onOpen={setSelected} onRemove={removeItem} />
            ))}
          </div>
        </section>
      ) : null}

      {!loading && mode === "watched" && needsRating.length > 0 ? (
        <section className="media-section rating-section" aria-labelledby="needs-rating-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Worth remembering</p>
              <h2 id="needs-rating-heading">How was it?</h2>
            </div>
            <span className="count-pill">{needsRating.length}</span>
          </div>
          <div className="media-list">
            {needsRating.map((item) => (
              <MediaRow item={item} key={item.id} onOpen={setSelected} onRemove={removeItem} promptRating />
            ))}
          </div>
        </section>
      ) : null}

      {!loading && mode === "watched" && rated.length > 0 ? (
        <section className="media-section" aria-labelledby="rated-heading">
          <div className="section-label" id="rated-heading"><span>Rated</span><span>{rated.length}</span></div>
          <div className="media-list">
            {rated.map((item) => (
              <MediaRow item={item} key={item.id} onOpen={setSelected} onRemove={removeItem} />
            ))}
          </div>
        </section>
      ) : null}

      {selected ? (
        <DetailPanel
          item={selected}
          onClose={() => setSelected(null)}
          onRemove={removeItem}
          onUpdate={replaceItem}
        />
      ) : null}

      {undo ? (
        <div className="toast" role="status">
          <span>Removed <strong>{undo.item.title}</strong></span>
          <button onClick={undoRemove} type="button"><RotateCcw size={15} /> Undo</button>
        </div>
      ) : null}
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (item: SearchResult | { provider: "custom"; title: string; mediaType: "other" }) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const data = await readJson<{ results: SearchResult[] }>(
          await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal }),
        );
        setResults(data.results);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setError(caught instanceof Error ? caught.message : "Search is unavailable.");
        }
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function choose(item: SearchResult | { provider: "custom"; title: string; mediaType: "other" }, key: string) {
    setAdding(key);
    setError("");
    try {
      await onAdd(item);
      setOpen(false);
      setQuery("");
      setResults([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add that title.");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className={open ? "quick-add open" : "quick-add"}>
      {!open ? (
        <button className="add-button" onClick={() => setOpen(true)} type="button">
          <Plus aria-hidden="true" size={18} /> Add a title
        </button>
      ) : (
        <div className="search-popover">
          <div className="search-input-wrap">
            {searching ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />}
            <input
              aria-label="Search movies and shows"
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                if (event.target.value.trim().length < 2) {
                  setResults([]);
                  setSearching(false);
                }
              }}
              placeholder="Search movies, shows, anime…"
              ref={inputRef}
              value={query}
            />
            <button className="close-search" onClick={() => setOpen(false)} type="button"><X size={17} /></button>
          </div>
          <div className="search-results">
            {error ? <p className="search-message error">{error}</p> : null}
            {!error && query.trim().length < 2 ? <p className="search-message">Type a title to find it.</p> : null}
            {results.map((result) => {
              const key = `${result.mediaType}-${result.externalId}`;
              const poster = posterUrl(result.posterPath, "w92");
              return (
                <button className="search-result" disabled={adding !== null} key={key} onClick={() => choose(result, key)} type="button">
                  {poster ? <img alt="" src={poster} /> : <span className="mini-poster"><Clapperboard size={16} /></span>}
                  <span className="result-copy">
                    <strong>{result.title}</strong>
                    <span>{[result.releaseYear, mediaLabel(result.mediaType)].filter(Boolean).join(" · ")}</span>
                  </span>
                  {adding === key ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
                </button>
              );
            })}
            {query.trim().length >= 2 && !searching ? (
              <button className="custom-result" disabled={adding !== null} onClick={() => choose({ provider: "custom", title: query.trim(), mediaType: "other" }, "custom")} type="button">
                <span className="mini-poster"><Plus size={17} /></span>
                <span className="result-copy"><strong>Add “{query.trim()}”</strong><span>Use your own title</span></span>
                {adding === "custom" ? <LoaderCircle className="spin" size={17} /> : null}
              </button>
            ) : null}
          </div>
          <p className="search-credit">Search data by TMDB</p>
        </div>
      )}
    </div>
  );
}

function MediaRow({
  item,
  onOpen,
  onRemove,
  promptRating = false,
}: {
  item: MediaItem;
  onOpen: (item: MediaItem) => void;
  onRemove: (item: MediaItem) => void;
  promptRating?: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const didSwipe = useRef(false);
  const poster = posterUrl(item.posterPath);

  function pointerDown(event: ReactPointerEvent) {
    startX.current = event.clientX;
    didSwipe.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent) {
    if (startX.current === null) return;
    const delta = event.clientX - startX.current;
    if (Math.abs(delta) > 7) didSwipe.current = true;
    setOffset(Math.max(-92, Math.min(0, delta + (offset < 0 ? -92 : 0))));
  }

  function pointerUp() {
    startX.current = null;
    setOffset((current) => current < -44 ? -92 : 0);
  }

  return (
    <div className={offset < 0 ? "swipe-row revealed" : "swipe-row"}>
      <button className="swipe-delete" onClick={() => onRemove(item)} tabIndex={offset < 0 ? 0 : -1} type="button">
        <Trash2 size={19} /><span>Remove</span>
      </button>
      <button
        className="media-row"
        onClick={() => {
          if (didSwipe.current) {
            didSwipe.current = false;
            return;
          }
          if (offset < 0) {
            setOffset(0);
            return;
          }
          onOpen(item);
        }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        style={{ transform: `translateX(${offset}px)` }}
        type="button"
      >
        {poster ? <img className="row-poster" alt="" src={poster} /> : <span className="row-poster placeholder"><Clapperboard size={22} /></span>}
        <span className="row-content">
          <span className="row-title-line">
            <strong>{item.title}</strong>
            {item.rating !== null ? <span className="rating-badge"><Star size={13} fill="currentColor" /> {item.rating}</span> : null}
          </span>
          <span className="row-meta">{[item.releaseYear, mediaLabel(item.mediaType)].filter(Boolean).join(" · ")}</span>
          {item.watchlistNote && item.status === "watchlist" ? <span className="row-note">{item.watchlistNote}</span> : null}
          {item.reviewNote && item.status === "watched" ? <span className="row-note">{item.reviewNote}</span> : null}
        </span>
        {promptRating ? <span className="rate-prompt"><Star size={15} /> Rate</span> : <ChevronRight className="row-chevron" size={18} />}
      </button>
    </div>
  );
}

function DetailPanel({
  item,
  onClose,
  onRemove,
  onUpdate,
}: {
  item: MediaItem;
  onClose: () => void;
  onRemove: (item: MediaItem) => void;
  onUpdate: (item: MediaItem) => void;
}) {
  const [rating, setRating] = useState<number | null>(item.rating);
  const [watchlistNote, setWatchlistNote] = useState(item.watchlistNote ?? "");
  const [reviewNote, setReviewNote] = useState(item.reviewNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const poster = posterUrl(item.posterPath, "w342");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("panel-open");
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("panel-open");
    };
  }, [onClose]);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const data = await readJson<{ item: MediaItem }>(
        await fetch(`/api/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }),
      );
      onUpdate(data.item);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  }

  const note = item.status === "watchlist" ? watchlistNote : reviewNote;
  return (
    <div className="panel-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-labelledby="detail-title" aria-modal="true" className="detail-panel" role="dialog">
        <div className="panel-handle" aria-hidden="true" />
        <div className="panel-topbar">
          <button className="panel-back" onClick={onClose} type="button"><ArrowLeft size={19} /><span>Back</span></button>
          <button className="panel-close" onClick={onClose} type="button"><X size={19} /><span className="sr-only">Close</span></button>
        </div>

        <div className="detail-hero">
          {poster ? <img className="detail-poster" alt="" src={poster} /> : <span className="detail-poster placeholder"><Clapperboard size={32} /></span>}
          <div className="detail-title-copy">
            <span className="type-pill">{mediaLabel(item.mediaType)}</span>
            <h2 id="detail-title">{item.title}</h2>
            {item.releaseYear ? <p>{item.releaseYear}</p> : null}
          </div>
        </div>

        {item.overview ? <p className="overview">{item.overview}</p> : null}

        {item.status === "watched" ? (
          <div className="rating-block">
            <div className="detail-section-title">
              <div><h3>Your rating</h3><p>{rating ? `${rating} out of 10` : "Pick the number that feels right."}</p></div>
              {rating ? <span className="rating-large">{rating}</span> : null}
            </div>
            <div className="rating-grid" role="group" aria-label="Rating out of 10">
              {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                <button
                  aria-pressed={rating === value}
                  className={rating === value ? "rating-option selected" : "rating-option"}
                  key={value}
                  onClick={() => setRating(rating === value ? null : value)}
                  type="button"
                >{value}</button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="note-block">
          <label htmlFor="item-note">{item.status === "watchlist" ? "Why this one?" : "A note for later"}</label>
          <textarea
            id="item-note"
            onChange={(event) => item.status === "watchlist" ? setWatchlistNote(event.target.value) : setReviewNote(event.target.value)}
            placeholder={item.status === "watchlist" ? "A friend recommended it because…" : "What stayed with you?"}
            rows={4}
            value={note}
          />
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <div className="panel-actions">
          {item.status === "watchlist" ? (
            <button className="primary-button" disabled={saving} onClick={() => save({ status: "watched", watchlistNote: watchlistNote || null })} type="button">
              {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={18} />}
              I watched this
            </button>
          ) : (
            <button className="primary-button" disabled={saving} onClick={() => save({ rating, reviewNote: reviewNote || null })} type="button">
              {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={18} />}
              Save review
            </button>
          )}
          {item.status === "watchlist" ? (
            <button className="secondary-button" disabled={saving} onClick={() => save({ watchlistNote: watchlistNote || null })} type="button">Save note</button>
          ) : null}
        </div>

        <button className="danger-button" onClick={() => onRemove(item)} type="button"><Trash2 size={16} /> Remove from library</button>
      </section>
    </div>
  );
}

function LoadingList() {
  return (
    <div className="media-list loading-list" aria-label="Loading titles">
      {[0, 1, 2].map((value) => <div className="row-skeleton" key={value}><span /><div><i /><i /></div></div>)}
    </div>
  );
}

function EmptyState({ mode }: { mode: ViewMode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{mode === "watchlist" ? <BookmarkPlus size={24} /> : <Check size={25} />}</span>
      <h2>{mode === "watchlist" ? "Nothing waiting yet" : "Nothing watched yet"}</h2>
      <p>{mode === "watchlist" ? "Add a title above. Movies, series, and anime all work." : "Titles you finish will move here."}</p>
    </div>
  );
}
