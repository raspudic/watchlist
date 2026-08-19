"use client";

/* TMDB poster URLs are already sized at the CDN; using a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import {
  Check,
  Clapperboard,
  FileText,
  ListPlus,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
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



function normalizedTitle(title: string) {
  return title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function searchTitles(query: string, signal?: AbortSignal) {
  return readApiJson<{ results: SearchResult[] }>(
    await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal }),
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
  onBulkAdd,
  variant = "header",
}: {
  onAdd: (item: AddableTitle) => Promise<void>;
  onBulkAdd: (items: AddableTitle[]) => Promise<BulkAddOutcome>;
  variant?: "header" | "empty";
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <div className="add-actions">
        {variant === "header" ? (
          <>
            <IconButton label="Import a list" onClick={() => setImportOpen(true)} size="lg">
              <ListPlus aria-hidden="true" size={18} />
            </IconButton>
            <Button onClick={() => setSearchOpen(true)}>
              <Plus aria-hidden="true" size={18} /> Add a title
            </Button>
          </>
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
      {searchOpen ? <SearchDialog onAdd={onAdd} onClose={() => setSearchOpen(false)} /> : null}
      {importOpen ? <BulkImportDialog onClose={() => setImportOpen(false)} onImport={onBulkAdd} /> : null}
    </>
  );
}

function SearchDialog({
  onAdd,
  onClose,
}: {
  onAdd: (item: AddableTitle) => Promise<void>;
  onClose: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [lastAdded, setLastAdded] = useState("");
  const [quickAdd, setQuickAdd] = useState(false);
  const [rateLimit, setRateLimit] = useState<{ message: string; retryAt: number } | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [clock, setClock] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!rateLimit) return;
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [rateLimit]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    if (rateLimit && rateLimit.retryAt > Date.now()) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const data = await searchTitles(trimmed, controller.signal);
        setResults(data.results);
        setHighlightedIndex(0);
        setRateLimit(null);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          if (isRateLimitError(caught)) {
            const limitedAt = Date.now();
            setClock(limitedAt);
            setResults([]);
            setHighlightedIndex(0);
            setRateLimit({
              message: friendlySearchLimitMessage(caught.reason),
              retryAt: limitedAt + caught.retryAfter * 1000,
            });
          } else {
            setError(caught instanceof Error ? caught.message : "Search is unavailable.");
          }
        }
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, rateLimit, retryNonce]);

  async function choose(item: AddableTitle, key: string) {
    setAdding(key);
    setError("");
    try {
      await onAdd(item);
      toast.add({ title: `Added ${item.title}` });
      if (!quickAdd) {
        onClose();
        return;
      }
      setLastAdded(item.title);
      setQuery("");
      setResults([]);
      setRateLimit(null);
      setHighlightedIndex(0);
      inputRef.current?.focus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add that title.");
    } finally {
      setAdding(null);
    }
  }

  const customTitle = query.trim();
  const retryIn = rateLimit ? Math.max(0, Math.ceil((rateLimit.retryAt - clock) / 1000)) : 0;

  function handleSearchKeys(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key !== "Enter" || adding !== null || searching || customTitle.length < 2) return;

    event.preventDefault();
    const highlighted = results[highlightedIndex];
    if (highlighted) {
      void choose(highlighted, `${highlighted.mediaType}-${highlighted.externalId}`);
    } else {
      void choose({ provider: "custom", title: customTitle, mediaType: "other" }, "custom");
    }
  }

  return (
    <Dialog className="search-dialog" onOpenChange={(next) => !next && onClose()} open>
      <div className="add-search-header">
        <span className="add-search-icon" aria-hidden="true"><Plus size={18} /></span>
        <div><p className="eyebrow">Add to watchlist</p><DialogTitle>Find a title</DialogTitle></div>
        <IconButton label="Close" onClick={onClose}><X aria-hidden="true" size={18} /></IconButton>
      </div>
        <div className="search-input-wrap add-search-input">
          {searching ? <Spinner size={20} /> : <Search aria-hidden="true" size={20} />}
          <input
            aria-label="Search movies and shows"
            autoComplete="off"
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              setLastAdded("");
              if (value.trim().length >= 2 && !rateLimit) setSearching(true);
              if (value.trim().length < 2) {
                setResults([]);
                setSearching(false);
                setError("");
                setRateLimit(null);
              }
            }}
            onKeyDown={handleSearchKeys}
            placeholder="Search movies and shows..."
            ref={inputRef}
            value={query}
          />
        </div>

        <div className="search-results">
          {rateLimit ? (
            <div className="search-limit-message" role="status">
              <p>{rateLimit.message}</p>
              <button
                disabled={retryIn > 0}
                onClick={() => {
                  setRateLimit(null);
                  setRetryNonce((current) => current + 1);
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
          {!rateLimit ? results.map((result) => {
            const key = `${result.mediaType}-${result.externalId}`;
            return (
              <SearchResultButton
                adding={adding === key}
                disabled={adding !== null}
                key={key}
                onClick={() => choose(result, key)}
                result={result}
                selected={highlightedIndex === results.indexOf(result)}
              />
            );
          }) : null}
        </div>

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
              {lastAdded ? `Added ${lastAdded}. Ready for another.` : quickAdd ? "Highlighted result adds on Enter" : "Enter adds and closes"}
            </p>
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
  );
}

function SearchResultButton({
  adding,
  disabled,
  onClick,
  result,
  selected,
}: {
  adding: boolean;
  disabled: boolean;
  onClick: () => void;
  result: SearchResult;
  selected: boolean;
}) {
  const poster = posterUrl(result.posterPath);
  return (
    <button aria-current={selected ? "true" : undefined} className={selected ? "search-result selected" : "search-result"} disabled={disabled} onClick={onClick} type="button">
      {poster ? <img alt="" src={poster} /> : <span className="mini-poster"><Clapperboard size={16} /></span>}
      <span className="result-copy">
        <strong>{result.title}</strong>
        <span>{[result.releaseYear, mediaLabel(result.mediaType, "Custom title")].filter(Boolean).join(" \u00b7 ")}</span>
      </span>
      {adding ? <Spinner size={17} /> : <Plus aria-hidden="true" size={17} />}
    </button>
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
          const data = await searchTitles(sourceTitle);
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
          <p className="eyebrow">{step === "paste" ? "Bulk import" : "Confirm matches"}</p>
          <SheetTitle>{step === "paste" ? "Paste your list" : "Review before adding"}</SheetTitle>
          <p>{step === "paste" ? "One title per line. Bullets and numbered lists are fine." : "We picked the closest result for each line. Change anything that looks wrong."}</p>
        </div>
        <IconButton disabled={matching || importing} label="Close" onClick={onClose}>
          <X aria-hidden="true" size={19} />
        </IconButton>
      </div>

        {step === "paste" ? (
          <div className="bulk-paste">
            <label htmlFor="bulk-titles">Titles</label>
            <textarea
              id="bulk-titles"
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
              <span>{parsedTitles.length} {parsedTitles.length === 1 ? "title" : "titles"} found</span>
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
              disabled={parsedTitles.length === 0}
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
