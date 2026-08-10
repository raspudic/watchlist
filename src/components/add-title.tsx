"use client";

/* TMDB poster URLs are already sized at the CDN; using a plain image avoids image-proxy overhead. */
/* eslint-disable @next/next/no-img-element */

import {
  Check,
  Clapperboard,
  FileText,
  ListPlus,
  LoaderCircle,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

function posterUrl(path: string | null) {
  return path ? `https://image.tmdb.org/t/p/w92${path}` : null;
}

function mediaLabel(type: AddableTitle["mediaType"]) {
  if (type === "tv") return "Series";
  if (type === "movie") return "Movie";
  return "Custom title";
}

function normalizedTitle(title: string) {
  return title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Something went wrong.");
  return body;
}

async function searchTitles(query: string, signal?: AbortSignal) {
  return readJson<{ results: SearchResult[] }>(
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
  onNotice,
}: {
  onAdd: (item: AddableTitle) => Promise<void>;
  onBulkAdd: (items: AddableTitle[]) => Promise<BulkAddOutcome>;
  onNotice: (message: string) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <div className="add-actions">
        <button className="add-button" onClick={() => setSearchOpen(true)} type="button">
          <Plus aria-hidden="true" size={18} /> Add a title
        </button>
        <button className="import-button" onClick={() => setImportOpen(true)} type="button">
          <ListPlus aria-hidden="true" size={17} /> Import list
        </button>
      </div>
      {searchOpen ? <SearchDialog onAdd={onAdd} onClose={() => setSearchOpen(false)} onNotice={onNotice} /> : null}
      {importOpen ? (
        <BulkImportDialog
          onClose={() => setImportOpen(false)}
          onImport={onBulkAdd}
          onNotice={onNotice}
        />
      ) : null}
    </>
  );
}

function useModalLifecycle(onClose: () => void) {
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
}

function SearchDialog({
  onAdd,
  onClose,
  onNotice,
}: {
  onAdd: (item: AddableTitle) => Promise<void>;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [lastAdded, setLastAdded] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useModalLifecycle(onClose);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const data = await searchTitles(trimmed, controller.signal);
        setResults(data.results);
        setHighlightedIndex(0);
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

  async function choose(item: AddableTitle, key: string) {
    setAdding(key);
    setError("");
    try {
      await onAdd(item);
      setLastAdded(item.title);
      onNotice(`Added ${item.title}`);
      setQuery("");
      setResults([]);
      setHighlightedIndex(0);
      inputRef.current?.focus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add that title.");
    } finally {
      setAdding(null);
    }
  }

  const customTitle = query.trim();

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
    <div className="modal-layer search-modal-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="search-dialog-title" aria-modal="true" className="search-dialog" role="dialog">
        <h2 className="sr-only" id="search-dialog-title">Add a title</h2>
        <div className="search-input-wrap">
          {searching ? <LoaderCircle className="spin" size={20} /> : <Search size={20} />}
          <input
            aria-label="Search movies and shows"
            autoComplete="off"
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              setLastAdded("");
              if (value.trim().length >= 2) setSearching(true);
              if (value.trim().length < 2) {
                setResults([]);
                setSearching(false);
                setError("");
              }
            }}
            onKeyDown={handleSearchKeys}
            placeholder="Search movies, shows, anime..."
            ref={inputRef}
            value={query}
          />
          <button className="close-search" onClick={onClose} type="button"><X size={18} /><span className="sr-only">Close</span></button>
        </div>

        <div className="search-results">
          {error ? <p className="search-message error">{error}</p> : null}
          {!error && customTitle.length < 2 ? <p className="search-message">Start typing to search TMDB.</p> : null}
          {!error && customTitle.length >= 2 && !searching && results.length === 0 ? <p className="search-message">No close matches found.</p> : null}
          {results.map((result) => {
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
          })}
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
              <strong>{customTitle.length >= 2 ? `Add "${customTitle}"` : "Add a custom title"}</strong>
              <span>Custom title</span>
            </span>
            {adding === "custom" ? <LoaderCircle className="spin" size={17} /> : null}
          </button>
          <div className="search-footer-line">
            <p aria-live="polite" className="quick-add-status">{lastAdded ? `Added ${lastAdded}. Ready for another.` : "Enter adds the selected result"}</p>
            <p className="search-credit">Search data by TMDB</p>
          </div>
        </div>
      </section>
    </div>
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
        <span>{[result.releaseYear, mediaLabel(result.mediaType)].filter(Boolean).join(" / ")}</span>
      </span>
      {adding ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
    </button>
  );
}

function BulkImportDialog({
  onClose,
  onImport,
  onNotice,
}: {
  onClose: () => void;
  onImport: (items: AddableTitle[]) => Promise<BulkAddOutcome>;
  onNotice: (message: string) => void;
}) {
  const [step, setStep] = useState<"paste" | "review">("paste");
  const [input, setInput] = useState("");
  const [drafts, setDrafts] = useState<BulkDraft[]>([]);
  const [matching, setMatching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useModalLifecycle(onClose);

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
        } catch {
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
      onNotice(parts.join("; "));
      onClose();
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="modal-layer bulk-modal-layer" onMouseDown={(event) => event.target === event.currentTarget && !matching && !importing && onClose()} role="presentation">
      <section aria-labelledby="bulk-dialog-title" aria-modal="true" className="bulk-dialog" role="dialog">
        <div className="bulk-header">
          <div>
            <p className="eyebrow">{step === "paste" ? "Bulk import" : "Confirm matches"}</p>
            <h2 id="bulk-dialog-title">{step === "paste" ? "Paste your list" : "Review before adding"}</h2>
            <p>{step === "paste" ? "One title per line. Bullets and numbered lists are fine." : "We picked the closest result for each line. Change anything that looks wrong."}</p>
          </div>
          <button className="panel-close" disabled={matching || importing} onClick={onClose} type="button"><X size={19} /><span className="sr-only">Close</span></button>
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
          <button className="secondary-button" disabled={matching || importing} onClick={() => step === "review" ? setStep("paste") : onClose()} type="button">
            {step === "review" ? "Back" : "Cancel"}
          </button>
          {step === "paste" ? (
            <button className="primary-button" disabled={matching || parsedTitles.length === 0} onClick={findMatches} type="button">
              {matching ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}
              {matching ? "Finding matches..." : "Find matches"}
            </button>
          ) : (
            <button className="primary-button" disabled={importing || readyDrafts.length === 0} onClick={importMatches} type="button">
              {importing ? <LoaderCircle className="spin" size={17} /> : <ListPlus size={17} />}
              {importing ? "Adding..." : `Add ${readyDrafts.length} ${readyDrafts.length === 1 ? "title" : "titles"}`}
            </button>
          )}
        </div>
      </section>
    </div>
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
        if ((caught as Error).name !== "AbortError") setPickerError("Could not search. Try again.");
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
              <span>{match ? ["Closest match", "releaseYear" in match ? match.releaseYear : null, mediaLabel(match.mediaType)].filter(Boolean).join(" / ") : "Choose a different result or use your original title"}</span>
            </span>
            {versionCount > 1 ? <span className="version-cue">{versionCount} versions</span> : null}
            <button className="change-match" onClick={() => setEditing((current) => !current)} type="button">{editing ? "Done" : "Change"}</button>
          </div>

          {editing ? (
            <div className="match-picker">
              <div className="match-picker-input">
                {searching ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}
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
                      <span className="result-copy"><strong>{result.title}</strong><span>{[result.releaseYear, mediaLabel(result.mediaType)].filter(Boolean).join(" / ")}</span></span>
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
