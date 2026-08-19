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
import { Badge, TypeBadge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyInline, EmptyState } from "@/components/ui/empty-state";
import { TextareaField } from "@/components/ui/field";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { InlineMessage } from "@/components/ui/inline-message";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { type LibraryViewStyle, useLibraryViewStyle } from "@/hooks/use-library-view-style";
import {
  getCachedLibrary,
  isLibraryCacheFresh,
  loadLibrary,
  type LibraryMode,
  type MediaItem,
  removeCachedLibraryItem,
  upsertCachedLibraryItem,
} from "@/lib/library-cache";
import { mediaLabel, mediaMeta, posterUrl, readJson } from "@/lib/media-display";
import { getSwipeRelease } from "@/lib/swipe";

export type { MediaItem } from "@/lib/library-cache";

type ViewMode = LibraryMode;
type MediaFilter = "all" | "movie" | "tv";

const UNDO_WINDOW_MS = 6000;

export function LibraryView({ mode }: { mode: ViewMode }) {
  const cacheScope = useLibraryCacheScope();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();
  const initialItems = getCachedLibrary(cacheScope, mode);
  const [items, setItems] = useState<MediaItem[]>(initialItems ?? []);
  const [loading, setLoading] = useState(initialItems === null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MediaItem | null>(null);
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

  async function restoreItem(item: MediaItem) {
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

  async function removeItem(item: MediaItem) {
    closeDetail();
    removeCachedLibraryItem(cacheScope, item.id);
    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));

    try {
      await readJson(await fetch(`/api/items/${item.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      }));
      /* A fixed id keeps a repeated removal of the same title in one toast. */
      const toastId = `removed-${item.id}`;
      toast.add({
        actionProps: {
          children: "Undo",
          onClick: () => {
            toast.close(toastId);
            void restoreItem(item);
          },
        },
        id: toastId,
        timeout: UNDO_WINDOW_MS,
        title: `Removed ${item.title}`,
      });
    } catch (caught) {
      upsertCachedLibraryItem(cacheScope, item);
      setItems((current) => [item, ...current]);
      setError(caught instanceof Error ? caught.message : "Could not remove that title.");
    }
  }

  const visibleItems = mediaFilter === "all" ? items : items.filter((item) => item.mediaType === mediaFilter);
  const needsRating = mode === "watched" ? visibleItems.filter((item) => item.rating === null) : [];
  const rated = mode === "watched" ? visibleItems.filter((item) => item.rating !== null) : [];
  const linkedItemId = searchParams.get("item");
  const linkedItem = linkedItemId ? items.find((item) => item.id === linkedItemId) ?? null : null;
  const detailItem = linkedItem ?? selected;
  const listClass = viewStyle === "grid" ? "media-grid" : "media-list";

  const filters: Array<{ count: number; label: string; value: MediaFilter }> = [
    { count: items.length, label: "All", value: "all" },
    { count: items.filter((item) => item.mediaType === "movie").length, label: "Movies", value: "movie" },
    { count: items.filter((item) => item.mediaType === "tv").length, label: "Series", value: "tv" },
  ];

  return (
    <div className="library-page">
      <header className="library-header">
        <div>
          <h1>{mode === "watchlist" ? "Watchlist" : "Watched"}</h1>
          {mode === "watchlist" ? <p className="library-subtitle">Movies and shows saved for later.</p> : null}
        </div>
        {mode === "watchlist" ? <AddTitleActions onAdd={addItem} onBulkAdd={addItems} /> : null}
      </header>

      {error ? <InlineMessage onDismiss={() => setError("")}>{error}</InlineMessage> : null}

      {loading ? <LoadingList /> : null}

      {!loading && items.length === 0 ? (
        <EmptyState
          actions={mode === "watchlist" ? <AddTitleActions onAdd={addItem} onBulkAdd={addItems} variant="empty" /> : undefined}
          description={mode === "watchlist" ? "Add a movie or show to get started." : "Titles you finish will move here."}
          icon={mode === "watchlist" ? <BookmarkPlus size={24} /> : <Check size={25} />}
          title={mode === "watchlist" ? "Nothing waiting yet" : "Nothing watched yet"}
        />
      ) : null}

      {!loading && items.length > 0 ? (
        <FilterTabs
          items={filters}
          label="Filter titles"
          onValueChange={setMediaFilter}
          trailing={
            <SegmentedControl<LibraryViewStyle>
              iconsOnly
              items={[
                { icon: <List aria-hidden="true" size={16} />, label: "List view", value: "list" },
                { icon: <LayoutGrid aria-hidden="true" size={16} />, label: "Tile view", value: "grid" },
              ]}
              label="Choose layout"
              onValueChange={(next) => { if (next) setViewStyle(next); }}
              value={viewStyle}
            />
          }
          value={mediaFilter}
        >
          {visibleItems.length === 0 ? (
            <EmptyInline>No {mediaFilter === "movie" ? "movies" : "series"} here yet.</EmptyInline>
          ) : null}

          {mode === "watchlist" && visibleItems.length > 0 ? (
            <section aria-label="Watchlist titles" className="media-section">
              <div className={listClass}>
                {visibleItems.map((item) => (
                  <MediaRow item={item} key={item.id} onOpen={setSelected} onRemove={removeItem} />
                ))}
              </div>
            </section>
          ) : null}

          {mode === "watched" && needsRating.length > 0 ? (
            <section aria-labelledby="needs-rating-label" className="media-section">
              <div className="section-label">
                <span id="needs-rating-label">How was it?</span>
                <span>{needsRating.length}</span>
              </div>
              <div className={listClass}>
                {needsRating.map((item) => (
                  <MediaRow item={item} key={item.id} onOpen={setSelected} onRemove={removeItem} promptRating />
                ))}
              </div>
            </section>
          ) : null}

          {mode === "watched" && rated.length > 0 ? (
            <section aria-labelledby="rated-label" className="media-section">
              <div className="section-label">
                <span id="rated-label">Rated</span>
                <span>{rated.length}</span>
              </div>
              <div className={listClass}>
                {rated.map((item) => (
                  <MediaRow item={item} key={item.id} onOpen={setSelected} onRemove={removeItem} />
                ))}
              </div>
            </section>
          ) : null}
        </FilterTabs>
      ) : null}

      {detailItem ? (
        <DetailSheet
          item={detailItem}
          key={detailItem.id}
          onClose={closeDetail}
          onRemove={removeItem}
          onUpdate={replaceItem}
        />
      ) : null}
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
            {item.rating !== null ? <Badge tone="accent"><Star size={13} fill="currentColor" /> {item.rating}</Badge> : null}
          </span>
          <span className="row-meta">{mediaMeta(item.releaseYear, item.mediaType)}</span>
          {item.watchlistNote && item.status === "watchlist" ? <span className="row-note">{item.watchlistNote}</span> : null}
          {item.reviewNote && item.status === "watched" ? <span className="row-note">{item.reviewNote}</span> : null}
        </span>
        {promptRating ? <span className="rate-prompt"><Star size={15} /> Rate</span> : <ChevronRight className="row-chevron" size={18} />}
      </button>
    </div>
  );
}

const RATINGS = Array.from({ length: 10 }, (_, index) => String(index + 1));

function DetailSheet({
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
    <Sheet
      className="detail-sheet"
      dismissible={!saving}
      onOpenChange={(open) => { if (!open) onClose(); }}
      open
    >
      <div className="sheet-topbar">
        <IconButton disabled={saving} label="Close" onClick={onClose}>
          <X aria-hidden="true" size={19} />
        </IconButton>
      </div>

      <div className="sheet-body">
        <div className="detail-hero">
          {poster ? <img className="detail-poster" alt="" src={poster} /> : <span className="detail-poster placeholder"><Clapperboard size={32} /></span>}
          <div className="detail-title-copy">
            <TypeBadge>{mediaLabel(item.mediaType)}</TypeBadge>
            <SheetTitle className="detail-title">{item.title}</SheetTitle>
            {item.releaseYear ? <p className="detail-year">{item.releaseYear}</p> : null}
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
              <div><h3>Your rating</h3>{rating === null ? <p>Pick the number that feels right.</p> : null}</div>
            </div>
            <SegmentedControl
              allowEmpty
              className="rating-control"
              items={RATINGS.map((value) => ({ label: value, value }))}
              label="Rating out of 10"
              onValueChange={(next) => setRating(next === null ? null : Number(next))}
              value={rating === null ? null : String(rating)}
            />
          </div>
        ) : null}

        <div className="note-block">
          <TextareaField
            id="item-note"
            label="Notes"
            onChange={(event) => item.status === "watchlist" ? setWatchlistNote(event.target.value) : setReviewNote(event.target.value)}
            placeholder="Add anything you want to remember."
            rows={4}
            value={note}
          />
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <div className="panel-actions">
          {item.status === "watchlist" ? (
            <Button
              loading={saving}
              onClick={() => save({ watchlistNote: watchlistNote || null }, true)}
            >
              {saving ? null : <Check aria-hidden="true" size={18} />}
              Save notes
            </Button>
          ) : (
            <Button
              loading={saving}
              onClick={() => save({ rating, reviewNote: reviewNote || null }, true)}
            >
              {saving ? null : <Check aria-hidden="true" size={18} />}
              Save review
            </Button>
          )}
          {item.status === "watchlist" ? (
            <Button
              disabled={saving}
              onClick={() => save({ status: "watched", watchlistNote: watchlistNote || null })}
              variant="secondary"
            >
              <Check aria-hidden="true" size={17} /> Move to watched
            </Button>
          ) : null}
        </div>

        <Button
          className="detail-remove"
          disabled={saving}
          onClick={() => onRemove(item)}
          size="sm"
          variant="danger"
        >
          <Trash2 aria-hidden="true" size={16} /> Remove from library
        </Button>
      </div>
    </Sheet>
  );
}

function LoadingList() {
  return (
    <div aria-label="Loading titles" className="media-section media-list">
      {[0, 1, 2].map((value) => <div className="row-skeleton" key={value}><span /><div><i /><i /></div></div>)}
    </div>
  );
}
