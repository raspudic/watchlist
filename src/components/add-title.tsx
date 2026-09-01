"use client";

/* TMDB poster URLs are already sized at the CDN; using a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import {
  BookmarkPlus,
  Check,
  ChevronDown,
  Clapperboard,
  FileText,
  ListPlus,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { Menu } from "@base-ui/react/menu";

import { MediaDetailOverview } from "@/components/media/media-detail-overview";
import { MediaResultContent } from "@/components/media/media-result-content";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { TextareaField } from "@/components/ui/field";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useAsyncSearch } from "@/hooks/use-async-search";
import { usePreviewShortcut } from "@/hooks/use-preview-shortcut";
import type { MediaItem } from "@/lib/library-cache";
import { mediaLabel, posterUrl } from "@/lib/media-display";
import { useToast } from "@/components/ui/toast";
import {
  friendlySearchLimitMessage,
  isRateLimitError,
  readApiJson,
} from "@/lib/api-response";
import { MAX_BULK_TITLES, parseBulkTitles } from "@/lib/bulk-import";

export type SearchResult = {
  externalId: number | null;
  mediaType: "movie" | "tv" | "other";
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  posterPath: string | null;
  overview: string | null;
  popularity: number;
  voteAverage: number | null;
  provider: "tmdb";
};

export type CustomTitle = { provider: "custom"; title: string; mediaType: "other" };
export type AddableTitle = SearchResult | CustomTitle;
export type BulkAddOutcome = { added: number; duplicates: number; failedTitles: string[] };

type BulkDraft = {
  id: string;
  sourceTitle: string;
  match: AddableTitle | null;
  alternatives: SearchResult[];
  skipped: boolean;
  searchFailed: boolean;
};

type SearchCacheEntry = {
  expiresAt: number;
  results: SearchResult[];
};

const SEARCH_SESSION_CACHE_MAX_ENTRIES = 50;
const SEARCH_SESSION_CACHE_TTL_MS = 15 * 60 * 1000;
const titleSearchCache = new Map<string, SearchCacheEntry>();

function normalizeSearchQuery(query: string) {
  return query.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

function readSearchCache(cache: Map<string, SearchCacheEntry>, query: string, now = Date.now()) {
  const key = normalizeSearchQuery(query);
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }

  // Refresh insertion order so the least recently used query is evicted first.
  cache.delete(key);
  cache.set(key, entry);
  return entry.results;
}

function writeSearchCache(
  cache: Map<string, SearchCacheEntry>,
  query: string,
  results: SearchResult[],
  now = Date.now(),
) {
  const key = normalizeSearchQuery(query);
  cache.delete(key);
  cache.set(key, { expiresAt: now + SEARCH_SESSION_CACHE_TTL_MS, results });

  while (cache.size > SEARCH_SESSION_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function titleSearchDebounce(query: string, previousQuery: string) {
  if (query.length === 2) return 800;
  return query.length < previousQuery.length ? 600 : 350;
}

function normalizedTitle(title: string) {
  return title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function searchTitles(query: string, signal?: AbortSignal, scope?: "bulk") {
  const params = new URLSearchParams({ q: query });
  if (scope) params.set("scope", scope);
  return readApiJson<{ results: SearchResult[] }>(
    await fetch(`/api/search?${params}`, { signal }),
  );
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  worker: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return results;
}

export function AddTitleActions({
  onAdd,
  onAddNote,
  onBulkAdd,
  variant = "header",
}: {
  onAdd: (item: AddableTitle) => Promise<MediaItem | void>;
  /* Adding stays one tap; the note is offered afterwards, from the toast. */
  onAddNote?: (item: MediaItem) => void;
  onBulkAdd: (items: AddableTitle[]) => Promise<BulkAddOutcome>;
  variant?: "header" | "empty";
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <div className="add-actions">
        {variant === "header" ? (
          /* Importing is a once-or-never act for most accounts, so it hangs off
             the primary instead of holding a slot of its own in the header. */
          <div className="split-button">
            <Button className="split-button-main" onClick={() => setSearchOpen(true)}>
              <Plus aria-hidden="true" size={16} /> Add a title
            </Button>
            <Menu.Root>
              <Menu.Trigger
                aria-label="More ways to add"
                className="btn btn-primary split-button-more"
              >
                <ChevronDown aria-hidden="true" size={16} />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner align="end" className="menu-positioner" side="bottom" sideOffset={8}>
                  <Menu.Popup className="menu-popup menu-popup-compact">
                    <Menu.Item className="menu-item" onClick={() => setImportOpen(true)}>
                      <ListPlus aria-hidden="true" size={15} />
                      Import a list
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>
        ) : (
          <>
            <Button onClick={() => setSearchOpen(true)} size="sm">
              <Plus aria-hidden="true" size={16} /> Add a title
            </Button>
            <Button onClick={() => setImportOpen(true)} size="sm" variant="quiet">
              <ListPlus aria-hidden="true" size={15} /> Import a list
            </Button>
          </>
        )}
      </div>
      {searchOpen ? <SearchDialog onAdd={onAdd} onAddNote={onAddNote} onClose={() => setSearchOpen(false)} /> : null}
      {importOpen ? <BulkImportDialog onClose={() => setImportOpen(false)} onImport={onBulkAdd} /> : null}
    </>
  );
}

function SearchDialog({
  onAdd,
  onAddNote,
  onClose,
}: {
  onAdd: (item: AddableTitle) => Promise<MediaItem | void>;
  onAddNote?: (item: MediaItem) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState("");
  const [lastAdded, setLastAdded] = useState("");
  const [quickAdd, setQuickAdd] = useState(false);
  const [preview, setPreview] = useState<SearchResult | null>(null);
  const [highlighted, setHighlighted] = useState<SearchResult | undefined>();
  const [addedKeys, setAddedKeys] = useState<Set<string>>(() => new Set());
  const [rateLimit, setRateLimit] = useState<{ message: string; retryAt: number } | null>(null);
  const [clock, setClock] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewShortcut = usePreviewShortcut();

  /* A rate-limit response is not a search error — it drives its own countdown,
     so it is swallowed here and handled below. */
  const onError = useCallback((caught: unknown) => {
    if (isRateLimitError(caught)) {
      const limitedAt = Date.now();
      setClock(limitedAt);
      setRateLimit({
        message: friendlySearchLimitMessage(caught.reason),
        retryAt: limitedAt + caught.retryAfter * 1000,
      });
      return null;
    }
    return caught instanceof Error ? caught.message : "Search is unavailable.";
  }, []);

  const cooling = rateLimit !== null && rateLimit.retryAt > clock;
  const getCached = useCallback(
    (value: string) => readSearchCache(titleSearchCache, value),
    [],
  );
  const {
    error: searchError,
    query,
    reset,
    results,
    retry,
    searching,
    setQuery,
  } = useAsyncSearch<SearchResult>({
    debounceMs: titleSearchDebounce,
    enabled: !cooling,
    getCached,
    onError,
    search: async (value, signal) => {
      const data = await searchTitles(value, signal);
      writeSearchCache(titleSearchCache, value, data.results);
      return data.results;
    },
  });

  useEffect(() => {
    if (!rateLimit) return;
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [rateLimit]);

  async function choose(item: AddableTitle, key: string, stayOpen = false) {
    if (addedKeys.has(key)) return true;
    setAdding(key);
    setAddError("");
    try {
      const added = await onAdd(item);
      setAddedKeys((current) => new Set(current).add(key));
      toast.add({
        actionProps: !stayOpen && added && onAddNote
          ? { children: "Add a note", onClick: () => onAddNote(added) }
          : undefined,
        title: `Added ${item.title}`,
      });
      if (!stayOpen && !quickAdd) {
        onClose();
        return true;
      }
      if (!stayOpen) {
        setLastAdded(item.title);
        reset();
        setRateLimit(null);
        inputRef.current?.focus();
      }
      return true;
    } catch (caught) {
      setAddError(caught instanceof Error ? caught.message : "Could not add that title.");
      return false;
    } finally {
      setAdding(null);
    }
  }

  function openPreview(item: SearchResult) {
    setAddError("");
    setPreview(item);
  }

  const customTitle = query.trim();
  const retryIn = rateLimit ? Math.max(0, Math.ceil((rateLimit.retryAt - clock) / 1000)) : 0;
  const error = addError || searchError;

  return (
    <>
      <Dialog className="search-dialog" onOpenChange={(next) => !next && onClose()} open>
        <div className="add-search-header">
          <span className="add-search-icon" aria-hidden="true"><Plus size={18} /></span>
          <div><DialogTitle>Find a title</DialogTitle></div>
          <IconButton label="Close" onClick={onClose}><X aria-hidden="true" size={18} /></IconButton>
        </div>

        <Autocomplete.Root
        autoHighlight="always"
        filter={null}
        items={results}
        onItemHighlighted={setHighlighted}
        onValueChange={(value) => {
          setQuery(value);
          setHighlighted(undefined);
          setLastAdded("");
          if (value.trim().length < 2) setRateLimit(null);
        }}
        value={query}
      >
        <Autocomplete.InputGroup className="search-input-wrap add-search-input">
          {searching ? <Spinner size={20} /> : <Search aria-hidden="true" size={20} />}
          <Autocomplete.Input
            aria-label="Search movies and shows"
            autoComplete="off"
            autoFocus
            onKeyDownCapture={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;

              const selectedResult = highlighted ?? results[0];
              const wantsPreview = event.metaKey || event.ctrlKey;
              if (wantsPreview && selectedResult) {
                event.preventDefault();
                event.stopPropagation();
                openPreview(selectedResult);
                return;
              }

              if (wantsPreview) return;
              if (selectedResult) {
                event.preventDefault();
                event.stopPropagation();
                const key = `${selectedResult.mediaType}-${selectedResult.externalId}`;
                if (adding === null && !addedKeys.has(key)) void choose(selectedResult, key);
                return;
              }

              /* With no result to highlight, Enter falls through to the
                 custom title rather than doing nothing. */
              if (adding !== null || searching || customTitle.length < 2) return;
              event.preventDefault();
              event.stopPropagation();
              void choose({ provider: "custom", title: customTitle, mediaType: "other" }, "custom");
            }}
            placeholder="Search movies and shows..."
            ref={inputRef}
          />
        </Autocomplete.InputGroup>

        <div className="search-results">
          {rateLimit ? (
            <div className="search-limit-message" role="status">
              <p>{rateLimit.message}</p>
              <button
                disabled={retryIn > 0}
                onClick={() => {
                  setRateLimit(null);
                  retry();
                }}
                type="button"
              >
                {retryIn > 0 ? `Try again in ${retryIn}s` : "Try search again"}
              </button>
            </div>
          ) : null}
          {error ? <p className="search-message error">{error}</p> : null}
          {!error && !rateLimit && customTitle.length < 2 ? <p className="search-message">Start typing to search TMDB.</p> : null}
          {!error && !rateLimit && customTitle.length >= 2 && !searching && results.length === 0 ? <p className="search-message">No close matches found.</p> : null}
          {!rateLimit ? (
            <Autocomplete.List>
              {(result: SearchResult) => {
                const key = `${result.mediaType}-${result.externalId}`;
                const added = addedKeys.has(key);
                return (
                  <Autocomplete.Item
                    aria-label={`Preview ${result.title}`}
                    className="search-result"
                    disabled={adding !== null}
                    key={key}
                    onClick={() => openPreview(result)}
                    value={result}
                  >
                    <MediaResultContent
                      meta={[result.releaseYear, mediaLabel(result.mediaType, "Custom title")].filter(Boolean).join(" \u00b7 ")}
                      posterUrl={posterUrl(result.posterPath)}
                      title={result.title}
                      trailing={(
                        <button
                          aria-label={added ? `${result.title} is in your watchlist` : `Add ${result.title} to watchlist`}
                          className="result-add-button"
                          disabled={added || adding !== null}
                          onClick={(event) => {
                            event.stopPropagation();
                            void choose(result, key);
                          }}
                          type="button"
                        >
                          {adding === key ? <Spinner size={15} /> : added ? <Check aria-hidden="true" size={14} /> : null}
                          <span>{added ? "Added" : "Add"}</span>
                          {!added && adding !== key ? <span aria-hidden="true" className="return-key-glyph">↵</span> : null}
                        </button>
                      )}
                    />
                  </Autocomplete.Item>
                );
              }}
            </Autocomplete.List>
          ) : null}
        </div>
        </Autocomplete.Root>

        <div className="search-footer">
        <button
          className="custom-result"
          disabled={customTitle.length < 2 || adding !== null}
          onClick={() => choose({ provider: "custom", title: customTitle, mediaType: "other" }, "custom")}
          type="button"
        >
          <span className="mini-poster"><Plus size={17} /></span>
          <span className="result-copy">
            <strong>{customTitle.length >= 2 ? `Add \u201c${customTitle}\u201d as a custom title` : "Add a custom title"}</strong>
            <span>Custom title</span>
          </span>
          {adding === "custom" ? <Spinner size={17} /> : null}
        </button>
        <div className="search-footer-line">
          <p aria-live="polite" className="quick-add-status">
            {lastAdded ? `Added ${lastAdded}. Ready for another.` : null}
          </p>
          {!lastAdded && previewShortcut ? (
            <span aria-hidden="true" className="preview-shortcut-hint">{previewShortcut.display}</span>
          ) : null}
          <label className="quick-add-toggle">
            <input
              checked={quickAdd}
              disabled={adding !== null}
              onChange={(event) => setQuickAdd(event.target.checked)}
              type="checkbox"
            />
            <span>Quick add</span>
          </label>
        </div>
        </div>
      </Dialog>

      {preview ? (
        <SearchPreviewSheet
          added={addedKeys.has(`${preview.mediaType}-${preview.externalId}`)}
          adding={adding === `${preview.mediaType}-${preview.externalId}`}
          error={addError}
          item={preview}
          onAdd={() => choose(preview, `${preview.mediaType}-${preview.externalId}`, true)}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}

function SearchPreviewSheet({
  added,
  adding,
  error,
  item,
  onAdd,
  onClose,
}: {
  added: boolean;
  adding: boolean;
  error: string;
  item: SearchResult;
  onAdd: () => Promise<boolean>;
  onClose: () => void;
}) {
  return (
    <Sheet
      className="detail-sheet preview-sheet"
      dismissible={!adding}
      onOpenChange={(open) => { if (!open) onClose(); }}
      open
    >
      <div className="sheet-topbar">
        <IconButton disabled={adding} label="Close preview" onClick={onClose}>
          <X aria-hidden="true" size={19} />
        </IconButton>
      </div>
      <div className="sheet-body">
        <MediaDetailOverview item={item} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="panel-actions preview-actions" aria-live="polite">
          <Button disabled={added} fullWidth loading={adding} onClick={() => void onAdd()}>
            {added ? <Check aria-hidden="true" size={18} /> : <BookmarkPlus aria-hidden="true" size={18} />}
            {added ? "Added to Watchlist" : "Add to Watchlist"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function BulkImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (items: AddableTitle[]) => Promise<BulkAddOutcome>;
}) {
  const toast = useToast();
  const [step, setStep] = useState<"paste" | "review">("paste");
  const [input, setInput] = useState("");
  const [drafts, setDrafts] = useState<BulkDraft[]>([]);
  const [matching, setMatching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const parsedTitles = parseBulkTitles(input);
  const readyDrafts = drafts.filter((draft) => !draft.skipped && draft.match !== null);

  async function findMatches() {
    if (parsedTitles.length === 0) {
      setError("Paste at least one title, with one title per line.");
      return;
    }
    if (parsedTitles.length > MAX_BULK_TITLES) {
      setError(`Import up to ${MAX_BULK_TITLES} titles at a time.`);
      return;
    }

    setMatching(true);
    setError("");
    try {
      let limitedRetryAfter = 0;
      const matched = await mapWithConcurrency(parsedTitles, 4, async (sourceTitle, index): Promise<BulkDraft> => {
        try {
          const data = await searchTitles(sourceTitle, undefined, "bulk");
          return {
            id: `${index}-${sourceTitle}`,
            sourceTitle,
            match: data.results[0] ?? null,
            alternatives: data.results.slice(0, 6),
            skipped: false,
            searchFailed: false,
          };
        } catch (caught) {
          if (isRateLimitError(caught)) {
            limitedRetryAfter = Math.max(limitedRetryAfter, caught.retryAfter);
          }
          return {
            id: `${index}-${sourceTitle}`,
            sourceTitle,
            match: null,
            alternatives: [],
            skipped: false,
            searchFailed: true,
          };
        }
      });
      setDrafts(matched);
      setStep("review");
      if (limitedRetryAfter > 0) {
        setError(`TMDB paused some lookups. Try unresolved titles again in about ${limitedRetryAfter} seconds, or add them as custom titles.`);
      }
    } finally {
      setMatching(false);
    }
  }

  function updateDraft(id: string, patch: Partial<BulkDraft>) {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  }

  async function importMatches() {
    setImporting(true);
    setError("");
    try {
      const outcome = await onImport(readyDrafts.map((draft) => draft.match as AddableTitle));
      if (outcome.failedTitles.length > 0) {
        setError(`${outcome.added} added. Could not add: ${outcome.failedTitles.join(", ")}. You can try again.`);
        return;
      }

      const parts = [`Added ${outcome.added} ${outcome.added === 1 ? "title" : "titles"}`];
      if (outcome.duplicates > 0) parts.push(`${outcome.duplicates} already in your library`);
      toast.add({ title: parts.join(" · ") });
      onClose();
    } finally {
      setImporting(false);
    }
  }

  return (
    <Sheet
      className="bulk-dialog"
      dismissible={!matching && !importing}
      onOpenChange={(next) => !next && onClose()}
      open
    >
      <div className="bulk-header">
        <div>
          <SheetTitle>{step === "paste" ? "Paste your list" : "Review before adding"}</SheetTitle>
          <SheetDescription>{step === "paste" ? "One title per line. Bullets and numbered lists are fine." : "We picked the closest result for each line. Change anything that looks wrong."}</SheetDescription>
        </div>
        <IconButton disabled={matching || importing} label="Close" onClick={onClose}>
          <X aria-hidden="true" size={19} />
        </IconButton>
      </div>

      {step === "paste" ? (
        <div className="bulk-paste">
          <TextareaField
            id="bulk-titles"
            label="Titles"
            onChange={(event) => {
              setInput(event.target.value);
              setError("");
            }}
            placeholder={"- Arrival\n- Attack on Titan\n- Severance"}
            ref={textareaRef}
            rows={11}
            value={input}
          />
          <div className="bulk-count">
            <span className={parsedTitles.length > MAX_BULK_TITLES ? "over-limit" : undefined}>
              {parsedTitles.length} {parsedTitles.length === 1 ? "title" : "titles"} found
            </span>
            <span>Maximum {MAX_BULK_TITLES}</span>
          </div>
        </div>
      ) : (
        <div className="bulk-review">
          <div className="bulk-review-summary">
            <span><Check size={15} /> {readyDrafts.length} ready</span>
            <span>{drafts.length - readyDrafts.length} skipped or unresolved</span>
          </div>
          <div className="bulk-rows">
            {drafts.map((draft) => (
              <BulkMatchRow draft={draft} key={draft.id} onChange={(patch) => updateDraft(draft.id, patch)} />
            ))}
          </div>
        </div>
      )}

      {error ? <p className="bulk-error" role="alert">{error}</p> : null}

      <div className="bulk-footer">
        <Button
          disabled={matching || importing}
          onClick={() => (step === "review" ? setStep("paste") : onClose())}
          variant="secondary"
        >
          {step === "review" ? "Back" : "Cancel"}
        </Button>
        {step === "paste" ? (
          <Button
            disabled={parsedTitles.length === 0 || parsedTitles.length > MAX_BULK_TITLES}
            loading={matching}
            loadingLabel="Finding matches…"
            onClick={findMatches}
          >
            <Search aria-hidden="true" size={17} /> Find matches
          </Button>
        ) : (
          <Button
            disabled={readyDrafts.length === 0}
            loading={importing}
            loadingLabel="Adding…"
            onClick={importMatches}
          >
            <ListPlus aria-hidden="true" size={17} />
            {`Add ${readyDrafts.length} ${readyDrafts.length === 1 ? "title" : "titles"}`}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function BulkMatchRow({ draft, onChange }: { draft: BulkDraft; onChange: (patch: Partial<BulkDraft>) => void }) {
  const [editing, setEditing] = useState(false);
  const [pickerQuery, setPickerQuery] = useState(draft.sourceTitle);
  const [pickerResults, setPickerResults] = useState(draft.alternatives);
  const [searching, setSearching] = useState(false);
  const [pickerError, setPickerError] = useState("");

  useEffect(() => {
    if (!editing || pickerQuery.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setPickerError("");
      try {
        const data = await searchTitles(pickerQuery.trim(), controller.signal);
        setPickerResults(data.results.slice(0, 6));
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setPickerError(isRateLimitError(caught)
            ? `Search is cooling down. Try again in about ${caught.retryAfter} seconds.`
            : "Could not search. Try again.");
        }
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [editing, pickerQuery]);

  const match = draft.match;
  const poster = match && match.provider === "tmdb" ? posterUrl(match.posterPath) : null;
  const versionCount = match?.provider === "tmdb"
    ? draft.alternatives.filter((candidate) => normalizedTitle(candidate.title) === normalizedTitle(match.title)).length
    : 0;

  return (
    <article className={draft.skipped ? "bulk-row skipped" : "bulk-row"}>
      <div className="bulk-source-line">
        <span className="bulk-source" title={draft.sourceTitle}>{draft.sourceTitle}</span>
        <button aria-pressed={draft.skipped} className="bulk-skip" onClick={() => onChange({ skipped: !draft.skipped })} type="button">
          {draft.skipped ? "Include" : "Skip"}
        </button>
      </div>

      {!draft.skipped ? (
        <>
          <div className={match ? "bulk-match" : "bulk-match unresolved"}>
            {poster ? <img alt="" src={poster} /> : <span className="mini-poster">{match ? <FileText size={16} /> : <Search size={16} />}</span>}
            <span className="result-copy">
              <strong>{match?.title ?? (draft.searchFailed ? "Search failed" : "No match selected")}</strong>
              <span>{match ? ["Closest match", "releaseYear" in match ? match.releaseYear : null, mediaLabel(match.mediaType, "Custom title")].filter(Boolean).join(" \u00b7 ") : "Choose a different result or use your original title"}</span>
            </span>
            {versionCount > 1 ? <span className="version-cue">{versionCount} versions</span> : null}
            <button className="change-match" onClick={() => setEditing((current) => !current)} type="button">{editing ? "Done" : "Change"}</button>
          </div>

          {editing ? (
            <div className="match-picker">
              <div className="match-picker-input">
                {searching ? <Spinner size={16} /> : <Search aria-hidden="true" size={16} />}
                <input aria-label={`Change match for ${draft.sourceTitle}`} onChange={(event) => setPickerQuery(event.target.value)} value={pickerQuery} />
              </div>
              <div className="match-picker-results">
                {pickerError ? <p className="search-message error">{pickerError}</p> : null}
                {pickerResults.map((result) => {
                  const resultPoster = posterUrl(result.posterPath);
                  const selected = match?.provider === "tmdb" && match.mediaType === result.mediaType && match.externalId === result.externalId;
                  return (
                    <button
                      className={selected ? "picker-result selected" : "picker-result"}
                      key={`${result.mediaType}-${result.externalId}`}
                      onClick={() => {
                        onChange({ match: result, searchFailed: false });
                        setEditing(false);
                      }}
                      type="button"
                    >
                      {resultPoster ? <img alt="" src={resultPoster} /> : <span className="mini-poster"><Clapperboard size={14} /></span>}
                      <span className="result-copy"><strong>{result.title}</strong><span>{[result.releaseYear, mediaLabel(result.mediaType, "Custom title")].filter(Boolean).join(" \u00b7 ")}</span></span>
                      {selected ? <Check size={16} /> : null}
                    </button>
                  );
                })}
                <button
                  className="picker-custom"
                  onClick={() => {
                    onChange({ match: { provider: "custom", mediaType: "other", title: draft.sourceTitle }, searchFailed: false });
                    setEditing(false);
                  }}
                  type="button"
                >
                  <Plus size={15} /> {`Use "${draft.sourceTitle}"`}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
