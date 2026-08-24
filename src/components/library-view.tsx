"use client";

/* TMDB poster URLs are already sized at the CDN; using a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import {
  Bookmark,
  BookmarkPlus,
  CalendarDays,
  Check,
  ChevronDown,
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
import { WatchProviders } from "@/components/watch-providers";
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
import { readApiJson } from "@/lib/api-response";
import {
  mediaLabel,
  mediaMeta,
  posterUrl,
  watchedChipLabel,
  watchedDateStamp,
  watchedDateValue,
} from "@/lib/media-display";
import { SWIPE_TRAY_WIDTH, getSwipeRelease } from "@/lib/swipe";

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

  function postItem(result: AddableTitle, bulk?: boolean) {
    return fetch(bulk ? "/api/items?scope=bulk" : "/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
  }

  async function addItem(result: AddableTitle) {
    const data = await readApiJson<{ item: MediaItem }>(await postItem(result));
    upsertCachedLibraryItem(cacheScope, data.item);
    setItems((current) => [data.item, ...current.filter((item) => item.id !== data.item.id)]);
    return data.item;
  }

  async function addItems(results: AddableTitle[]): Promise<BulkAddOutcome> {
    const addedItems: MediaItem[] = [];
    const failedTitles: string[] = [];
    let duplicates = 0;

    for (let index = 0; index < results.length; index += 4) {
      const outcomes = await Promise.all(results.slice(index, index + 4).map(async (result) => {
        try {
          const response = await postItem(result, true);
          if (response.status === 409) return { kind: "duplicate" as const };
          const data = await readApiJson<{ item: MediaItem }>(response);
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

  function syncItem(item: MediaItem) {
    upsertCachedLibraryItem(cacheScope, item);
    setItems((current) => item.status === mode
      ? current.map((currentItem) => currentItem.id === item.id ? item : currentItem)
      : current.filter((currentItem) => currentItem.id !== item.id));
  }

  /* Saving from the sheet leaves it open, even when the change moves the title
     off this list: finishing something and rating it is one visit. */
  function replaceItem(item: MediaItem) {
    syncItem(item);
    setSelected(item);
  }

  /* The row shortcut commits on its own and offers the rating in the toast,
     so a quick swipe never turns into a trip through the sheet. */
  async function markWatched(item: MediaItem) {
    try {
      const data = await readApiJson<{ item: MediaItem }>(
        await fetch(`/api/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "watched" }),
        }),
      );
      syncItem(data.item);

      const toastId = `watched-${item.id}`;
      toast.add({
        actionProps: {
          children: "Rate it",
          onClick: () => {
            toast.close(toastId);
            setSelected(data.item);
          },
        },
        id: toastId,
        timeout: UNDO_WINDOW_MS,
        title: `${item.title} — watched today`,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not mark that title watched.");
    }
  }

  async function restoreItem(item: MediaItem) {
    try {
      const data = await readApiJson<{ item: MediaItem }>(
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
      await readApiJson(await fetch(`/api/items/${item.id}`, {
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
  const detailItem = selected ?? linkedItem;
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
        {mode === "watchlist" ? <AddTitleActions onAdd={addItem} onAddNote={setSelected} onBulkAdd={addItems} /> : null}
      </header>

      {error ? <InlineMessage onDismiss={() => setError("")}>{error}</InlineMessage> : null}

      {loading ? <LoadingList /> : null}

      {!loading && items.length === 0 ? (
        <EmptyState
          actions={mode === "watchlist" ? <AddTitleActions onAdd={addItem} onAddNote={setSelected} onBulkAdd={addItems} variant="empty" /> : undefined}
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
                  <MediaRow
                    item={item}
                    key={item.id}
                    onMarkWatched={markWatched}
                    onOpen={setSelected}
                    onRemove={removeItem}
                  />
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
  onMarkWatched,
  onOpen,
  onRemove,
  promptRating = false,
}: {
  item: MediaItem;
  /* Present only where marking watched is meaningful, which is what enables
     the right-hand tray at all. */
  onMarkWatched?: (item: MediaItem) => void;
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
  const canMarkWatched = Boolean(onMarkWatched);

  function settle(next: number) {
    offsetRef.current = next;
    setOffset(next);
  }

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
    settle(Math.max(
      -rowWidth.current,
      Math.min(canMarkWatched ? rowWidth.current : 0, delta + startOffset.current),
    ));
  }

  function pointerUp() {
    startX.current = null;
    const release = getSwipeRelease(offsetRef.current, rowWidth.current);

    if (release === "remove") {
      settle(-rowWidth.current);
      window.setTimeout(() => onRemove(item), 120);
      return;
    }

    if (release === "watched" && onMarkWatched) {
      settle(rowWidth.current);
      window.setTimeout(() => onMarkWatched(item), 120);
      return;
    }

    if (release === "reveal-remove") {
      settle(-SWIPE_TRAY_WIDTH);
      return;
    }

    if (release === "reveal-watched" && onMarkWatched) {
      settle(SWIPE_TRAY_WIDTH);
      return;
    }

    settle(0);
  }

  function pointerCancel() {
    startX.current = null;
    if (offsetRef.current < -44) {
      settle(-SWIPE_TRAY_WIDTH);
      return;
    }
    if (offsetRef.current > 44 && canMarkWatched) {
      settle(SWIPE_TRAY_WIDTH);
      return;
    }
    settle(0);
  }

  const rowClasses = ["swipe-row"];
  if (offset < 0) rowClasses.push("revealed-remove");
  if (offset > 0) rowClasses.push("revealed-watched");

  return (
    <div className={rowClasses.join(" ")}>
      {onMarkWatched ? (
        <button className="swipe-watched" onClick={() => onMarkWatched(item)} tabIndex={offset > 0 ? 0 : -1} type="button">
          <span className="swipe-action-content"><Check size={19} /><span>Watched</span></span>
        </button>
      ) : null}
      <button className="swipe-delete" onClick={() => onRemove(item)} tabIndex={offset < 0 ? 0 : -1} type="button">
        <span className="swipe-action-content"><Trash2 size={19} /><span>Remove</span></span>
      </button>
      <button
        className="media-row"
        onClick={() => {
          if (didSwipe.current) {
            didSwipe.current = false;
            return;
          }
          if (offset !== 0) {
            settle(0);
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
          <span className="row-meta">
            {mediaMeta(item.releaseYear, item.mediaType, item.status === "watched" ? item.watchedAt : null)}
          </span>
          {item.watchlistNote && item.status === "watchlist" ? <span className="row-note">{item.watchlistNote}</span> : null}
          {item.reviewNote && item.status === "watched" ? <span className="row-note">{item.reviewNote}</span> : null}
        </span>
        {promptRating ? <span className="rate-prompt"><Star size={15} /> Rate</span> : <ChevronRight className="row-chevron" size={18} />}
      </button>
    </div>
  );
}

const RATINGS = Array.from({ length: 10 }, (_, index) => String(index + 1));

type NoteField = "watchlistNote" | "reviewNote";

/* One sheet for the whole life of a title. Marking something watched keeps it
   open and turns it into the logging step, because deciding you have finished
   a film and deciding what you made of it are the same moment. */
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
  const [dateDraft, setDateDraft] = useState("");
  const [editingDate, setEditingDate] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  /* What the server already holds, so a blur that changed nothing stays quiet
     and a failed save is retried on the next one. */
  const storedNotes = useRef({
    watchlistNote: item.watchlistNote ?? "",
    reviewNote: item.reviewNote ?? "",
  });
  const pendingNote = useRef<Promise<boolean> | null>(null);
  const poster = posterUrl(item.posterPath, "w342");

  const watched = item.status === "watched";
  const noteField: NoteField = watched ? "reviewNote" : "watchlistNote";
  const noteValue = watched ? reviewNote : watchlistNote;
  const today = watchedDateValue(new Date().toISOString());

  /* `block` holds the sheet open behind a spinner. Notes and ratings save
     without it: they must never disable the button being clicked next. */
  async function persist(patch: Record<string, unknown>, block = true) {
    if (block) setSaving(true);
    setError("");
    try {
      const data = await readApiJson<{ item: MediaItem }>(
        await fetch(`/api/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }),
      );
      onUpdate(data.item);
      return data.item;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your changes.");
      return null;
    } finally {
      if (block) setSaving(false);
    }
  }

  function commitNote(): Promise<boolean> {
    const next = noteValue.trim() ? noteValue : "";
    if (storedNotes.current[noteField] === next) return pendingNote.current ?? Promise.resolve(true);

    const previous = storedNotes.current[noteField];
    storedNotes.current[noteField] = next;

    const pending = persist({ [noteField]: next || null }, false).then((saved) => {
      if (saved) {
        setNoteSaved(true);
        return true;
      }
      storedNotes.current[noteField] = previous;
      return false;
    });

    pendingNote.current = pending;
    return pending;
  }

  async function markWatched() {
    const note = watchlistNote.trim() ? watchlistNote : "";
    storedNotes.current.watchlistNote = note;
    setNoteSaved(false);
    await persist({ status: "watched", watchlistNote: note || null });
  }

  async function done() {
    if (await commitNote()) onClose();
  }

  const noteEditor = (
    <div className="note-block">
      <TextareaField
        id="item-note"
        label={watched ? "What you thought" : "Notes"}
        onBlur={() => void commitNote()}
        onChange={(event) => {
          setNoteSaved(false);
          if (watched) setReviewNote(event.target.value);
          else setWatchlistNote(event.target.value);
        }}
        placeholder={watched ? "What did you make of it?" : "Why you saved it."}
        rows={4}
        value={noteValue}
      />
      {noteSaved ? (
        <p className="note-status"><Check aria-hidden="true" size={13} /> Saved</p>
      ) : null}
    </div>
  );

  return (
    <Sheet
      className="detail-sheet"
      dismissible={!saving}
      onOpenChange={(open) => {
        if (open) return;
        void commitNote();
        onClose();
      }}
      open
    >
      <div className="sheet-topbar">
        <IconButton disabled={saving} label="Close" onClick={() => void done()}>
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
            {watched && editingDate ? (
              <input
                aria-label="Date watched"
                autoFocus
                className="watched-date-input"
                max={today}
                onBlur={() => setEditingDate(false)}
                onChange={(event) => {
                  setDateDraft(event.target.value);
                  const stamp = watchedDateStamp(event.target.value);
                  if (stamp) void persist({ watchedAt: stamp }, false);
                }}
                type="date"
                value={dateDraft}
              />
            ) : null}
            {watched && !editingDate ? (
              <button
                className="date-chip"
                onClick={() => {
                  setDateDraft(watchedDateValue(item.watchedAt) || today);
                  setEditingDate(true);
                }}
                type="button"
              >
                <CalendarDays aria-hidden="true" size={13} />
                {watchedChipLabel(item.watchedAt)}
                <ChevronDown aria-hidden="true" size={12} />
              </button>
            ) : null}
          </div>
        </div>

        {item.overview ? <p className="overview">{item.overview}</p> : null}

        {watched && item.watchlistNote ? (
          <div className="note-recall">
            <span>Notes</span>
            <p>{item.watchlistNote}</p>
          </div>
        ) : null}

        {/* Unwatched, the note belongs with the description: it says why the
            title is here, and the add flow drops you straight into it. Once
            watched it becomes the review and moves down beside the rating,
            because settling on a score and saying why are one thought. */}
        {watched ? null : noteEditor}

        <WatchProviders item={item} />

        {watched ? (
          <div className="rating-block">
            <div className="detail-section-title">
              <div><h3>Your rating</h3>{rating === null ? <p>Pick the number that feels right.</p> : null}</div>
            </div>
            <SegmentedControl
              allowEmpty
              className="rating-control"
              items={RATINGS.map((value) => ({ label: value, value }))}
              label="Rating out of 10"
              onValueChange={(next) => {
                const value = next === null ? null : Number(next);
                setRating(value);
                void persist({ rating: value }, false);
              }}
              value={rating === null ? null : String(rating)}
            />
          </div>
        ) : null}

        {watched ? noteEditor : null}

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <div className="panel-actions">
          {watched ? (
            <Button fullWidth loading={saving} onClick={() => void done()}>Done</Button>
          ) : (
            <Button fullWidth loading={saving} onClick={() => void markWatched()}>
              {saving ? null : <Check aria-hidden="true" size={18} />}
              I watched it
            </Button>
          )}
        </div>

        <div className="detail-footer-actions">
          {watched ? (
            <Button
              disabled={saving}
              onClick={() => void persist({ status: "watchlist" })}
              size="sm"
              variant="quiet"
            >
              <Bookmark aria-hidden="true" size={15} /> Move back to watchlist
            </Button>
          ) : null}
          <Button disabled={saving} onClick={() => onRemove(item)} size="sm" variant="danger">
            <Trash2 aria-hidden="true" size={16} /> Remove from library
          </Button>
        </div>
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
