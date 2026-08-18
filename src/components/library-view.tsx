"use client";

/* TMDB poster URLs are already sized at the CDN; using a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import {
  BookmarkPlus,
  Check,
  ChevronRight,
  Clapperboard,
  LayoutGrid,
  List,
  LoaderCircle,
  RotateCcw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  AddTitleActions,
  type AddableTitle,
  type BulkAddOutcome,
} from "@/components/add-title";
import { useLibraryCacheScope } from "@/components/library-cache-provider";
import { type LibraryViewStyle, useLibraryViewStyle } from "@/hooks/use-library-view-style";
import { usePullToDismiss } from "@/hooks/use-pull-to-dismiss";
import {
  getCachedLibrary,
  isLibraryCacheFresh,
  loadLibrary,
  type LibraryMode,
  type MediaItem,
  removeCachedLibraryItem,
  upsertCachedLibraryItem,
} from "@/lib/library-cache";
import { getSwipeRelease } from "@/lib/swipe";

export type { MediaItem } from "@/lib/library-cache";

type ViewMode = LibraryMode;
type MediaFilter = "all" | "movie" | "tv";

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
  const cacheScope = useLibraryCacheScope();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialItems = getCachedLibrary(cacheScope, mode);
  const [items, setItems] = useState<MediaItem[]>(initialItems ?? []);
  const [loading, setLoading] = useState(initialItems === null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [notice, setNotice] = useState("");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [viewStyle, setViewStyle] = useLibraryViewStyle(cacheScope);

  useEffect(() => {
    let active = true;

    async function loadItems(force = false) {
      try {
        const data = await loadLibrary(cacheScope, mode, force);
        if (active) {
          setItems(data);
          setError("");
          setLoading(false);
        }

        const otherMode = mode === "watchlist" ? "watched" : "watchlist";
        void loadLibrary(cacheScope, otherMode).catch(() => undefined);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load your list.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadItems();

    function refreshStaleData() {
      if (document.visibilityState === "visible" && !isLibraryCacheFresh(cacheScope, mode)) {
        void loadItems(true);
      }
    }

    document.addEventListener("visibilitychange", refreshStaleData);
    window.addEventListener("focus", refreshStaleData);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", refreshStaleData);
      window.removeEventListener("focus", refreshStaleData);
    };
  }, [cacheScope, mode]);

  useEffect(() => () => {
    if (undo) clearTimeout(undo.timer);
  }, [undo]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  function closeDetail() {
    setSelected(null);
    if (searchParams.has("item")) window.history.replaceState(null, "", pathname);
  }

  function postItem(result: AddableTitle) {
    return fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
  }

  async function addItem(result: AddableTitle) {
    const data = await readJson<{ item: MediaItem }>(await postItem(result));
    upsertCachedLibraryItem(cacheScope, data.item);
    setItems((current) => [data.item, ...current.filter((item) => item.id !== data.item.id)]);
  }

  async function addItems(results: AddableTitle[]): Promise<BulkAddOutcome> {
    const addedItems: MediaItem[] = [];
    const failedTitles: string[] = [];
    let duplicates = 0;

    for (let index = 0; index < results.length; index += 4) {
      const outcomes = await Promise.all(results.slice(index, index + 4).map(async (result) => {
        try {
          const response = await postItem(result);
          if (response.status === 409) return { kind: "duplicate" as const };
          const data = await readJson<{ item: MediaItem }>(response);
          return { kind: "added" as const, item: data.item };
        } catch {
          return { kind: "failed" as const, title: result.title };
        }
      }));

      for (const outcome of outcomes) {
        if (outcome.kind === "added") addedItems.push(outcome.item);
        if (outcome.kind === "duplicate") duplicates += 1;
        if (outcome.kind === "failed") failedTitles.push(outcome.title);
      }
    }

    if (addedItems.length > 0) {
      for (const item of addedItems) upsertCachedLibraryItem(cacheScope, item);
      setItems((current) => {
        const addedIds = new Set(addedItems.map((item) => item.id));
        return [...addedItems, ...current.filter((item) => !addedIds.has(item.id))];
      });
    }

    return { added: addedItems.length, duplicates, failedTitles };
  }

  function replaceItem(item: MediaItem) {
    upsertCachedLibraryItem(cacheScope, item);
    if (item.status !== mode) {
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      closeDetail();
    } else {
      setItems((current) => current.map((currentItem) => currentItem.id === item.id ? item : currentItem));
      setSelected(item);
    }
  }

  async function removeItem(item: MediaItem) {
    closeDetail();
    removeCachedLibraryItem(cacheScope, item.id);
    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));

    try {
      await readJson(await fetch(`/api/items/${item.id}`, { method: "DELETE" }));
      if (undo) clearTimeout(undo.timer);
      const timer = setTimeout(() => setUndo(null), 6000);
      setUndo({ item, timer });
    } catch (caught) {
      upsertCachedLibraryItem(cacheScope, item);
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
      upsertCachedLibraryItem(cacheScope, data.item);
      setItems((current) => [data.item, ...current]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not restore that title.");
    }
  }

  const visibleItems = mediaFilter === "all" ? items : items.filter((item) => item.mediaType === mediaFilter);
  const needsRating = mode === "watched" ? visibleItems.filter((item) => item.rating === null) : [];
  const rated = mode === "watched" ? visibleItems.filter((item) => item.rating !== null) : [];
  const linkedItemId = searchParams.get("item");
  const linkedItem = linkedItemId ? items.find((item) => item.id === linkedItemId) ?? null : null;
  const detailItem = linkedItem ?? selected;

  return (
    <div className="library-page">
      <div className="library-heading">
        <div>
          <p className="eyebrow">Your library</p>
          <h1>{mode === "watchlist" ? "Watchlist" : "Watched"}</h1>
          <p className="heading-copy">
            {mode === "watchlist"
              ? "Movies and shows saved for later."
              : "Your watched titles, ratings, and notes."}
          </p>
        </div>
        {mode === "watchlist" ? <AddTitleActions onAdd={addItem} onBulkAdd={addItems} onNotice={setNotice} /> : null}
      </div>

      {error ? (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} type="button"><X size={16} /></button>
        </div>
      ) : null}

      {loading ? <LoadingList /> : null}

      {!loading && items.length === 0 ? <EmptyState mode={mode} /> : null}

      {!loading && items.length > 0 ? (
        <LibraryTools
          filter={mediaFilter}
          onFilter={setMediaFilter}
          onView={setViewStyle}
          view={viewStyle}
        />
      ) : null}

      {!loading && items.length > 0 && visibleItems.length === 0 ? (
        <div className="filter-empty">No {mediaFilter === "movie" ? "movies" : "shows"} here yet.</div>
      ) : null}

      {!loading && mode === "watchlist" && visibleItems.length > 0 ? (
        <section className="media-section" aria-label="Watchlist titles">
          <div className="section-label"><span>{visibleItems.length} {visibleItems.length === 1 ? "title" : "titles"}</span></div>
          <div className={viewStyle === "grid" ? "media-grid" : "media-list"}>
            {visibleItems.map((item) => (
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
          <div className={viewStyle === "grid" ? "media-grid" : "media-list"}>
            {needsRating.map((item) => (
              <MediaRow item={item} key={item.id} onOpen={setSelected} onRemove={removeItem} promptRating />
            ))}
          </div>
        </section>
      ) : null}

      {!loading && mode === "watched" && rated.length > 0 ? (
        <section className="media-section" aria-labelledby="rated-heading">
          <div className="section-label" id="rated-heading"><span>Rated</span><span>{rated.length}</span></div>
          <div className={viewStyle === "grid" ? "media-grid" : "media-list"}>
            {rated.map((item) => (
              <MediaRow item={item} key={item.id} onOpen={setSelected} onRemove={removeItem} />
            ))}
          </div>
        </section>
      ) : null}

      {detailItem ? (
        <DetailPanel
          item={detailItem}
          onClose={closeDetail}
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
      {!undo && notice ? <div className="toast notice-toast" role="status"><span>{notice}</span></div> : null}
    </div>
  );
}

function LibraryTools({
  filter,
  onFilter,
  onView,
  view,
}: {
  filter: MediaFilter;
  onFilter: (filter: MediaFilter) => void;
  onView: (view: LibraryViewStyle) => void;
  view: LibraryViewStyle;
}) {
  const filters: Array<{ label: string; value: MediaFilter }> = [
    { label: "All", value: "all" },
    { label: "Movies", value: "movie" },
    { label: "Shows", value: "tv" },
  ];

  return (
    <div className="library-tools">
      <div aria-label="Filter titles" className="media-filter" role="group">
        {filters.map((option) => (
          <button
            aria-pressed={filter === option.value}
            className={filter === option.value ? "active" : undefined}
            key={option.value}
            onClick={() => onFilter(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div aria-label="Choose layout" className="view-switch" role="group">
        <button aria-label="List view" aria-pressed={view === "list"} className={view === "list" ? "active" : undefined} onClick={() => onView("list")} title="List view" type="button">
          <List aria-hidden="true" size={16} />
        </button>
        <button aria-label="Tile view" aria-pressed={view === "grid"} className={view === "grid" ? "active" : undefined} onClick={() => onView("grid")} title="Tile view" type="button">
          <LayoutGrid aria-hidden="true" size={16} />
        </button>
      </div>
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
  const offsetRef = useRef(0);
  const startX = useRef<number | null>(null);
  const startOffset = useRef(0);
  const rowWidth = useRef(0);
  const didSwipe = useRef(false);
  const poster = posterUrl(item.posterPath);

  function pointerDown(event: ReactPointerEvent) {
    startX.current = event.clientX;
    startOffset.current = offsetRef.current;
    rowWidth.current = event.currentTarget.clientWidth;
    didSwipe.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent) {
    if (startX.current === null) return;
    const delta = event.clientX - startX.current;
    if (Math.abs(delta) > 7) didSwipe.current = true;
    const nextOffset = Math.max(-rowWidth.current, Math.min(0, delta + startOffset.current));
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  }

  function pointerUp() {
    startX.current = null;
    const release = getSwipeRelease(offsetRef.current, rowWidth.current);
    if (release === "remove") {
      offsetRef.current = -rowWidth.current;
      setOffset(-rowWidth.current);
      window.setTimeout(() => onRemove(item), 120);
      return;
    }

    const nextOffset = release === "reveal" ? -92 : 0;
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  }

  function pointerCancel() {
    startX.current = null;
    const nextOffset = offsetRef.current < -44 ? -92 : 0;
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  }

  return (
    <div className={offset < 0 ? "swipe-row revealed" : "swipe-row"}>
      <button className="swipe-delete" onClick={() => onRemove(item)} tabIndex={offset < 0 ? 0 : -1} type="button">
        <span className="swipe-delete-content"><Trash2 size={19} /><span>Remove</span></span>
      </button>
      <button
        className="media-row"
        onClick={() => {
          if (didSwipe.current) {
            didSwipe.current = false;
            return;
          }
          if (offset < 0) {
            offsetRef.current = 0;
            setOffset(0);
            return;
          }
          onOpen(item);
        }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerCancel={pointerCancel}
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
  const sheet = usePullToDismiss(onClose);

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

  async function save(patch: Record<string, unknown>, closeAfterSave = false) {
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
      if (closeAfterSave) onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  }

  const note = item.status === "watchlist" ? watchlistNote : reviewNote;
  return (
    <div className="panel-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        aria-labelledby="detail-title"
        aria-modal="true"
        className={sheet.dragging ? "detail-panel sheet-dragging" : "detail-panel"}
        role="dialog"
        style={sheet.style}
      >
        <div className="sheet-drag-region" {...sheet.dragProps}>
          <div className="panel-handle" aria-hidden="true" />
          <div className="panel-topbar">
            <button className="sheet-close-button" onClick={onClose} type="button"><X size={18} /><span>Close</span></button>
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
        </div>

        {item.overview ? <p className="overview">{item.overview}</p> : null}

        {item.status === "watched" && item.watchlistNote ? (
          <details className="watchlist-note-history">
            <summary>Watchlist note</summary>
            <p>{item.watchlistNote}</p>
          </details>
        ) : null}

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
          <label htmlFor="item-note">Notes</label>
          <textarea
            id="item-note"
            onChange={(event) => item.status === "watchlist" ? setWatchlistNote(event.target.value) : setReviewNote(event.target.value)}
            placeholder="Add anything you want to remember."
            rows={4}
            value={note}
          />
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <div className="panel-actions">
          {item.status === "watchlist" ? (
            <button className="primary-button" disabled={saving} onClick={() => save({ watchlistNote: watchlistNote || null }, true)} type="button">
              {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={18} />}
              Save notes
            </button>
          ) : (
            <button className="primary-button" disabled={saving} onClick={() => save({ rating, reviewNote: reviewNote || null })} type="button">
              {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={18} />}
              Save review
            </button>
          )}
          {item.status === "watchlist" ? (
            <button className="secondary-button watched-button" disabled={saving} onClick={() => save({ status: "watched", watchlistNote: watchlistNote || null })} type="button">
              <Check size={17} /> Move to watched
            </button>
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
      <p>{mode === "watchlist" ? "Add a movie or show above." : "Titles you finish will move here."}</p>
    </div>
  );
}
