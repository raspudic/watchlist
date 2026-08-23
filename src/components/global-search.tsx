"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { CheckCircle2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

import { MediaResultContent } from "@/components/media/media-result-content";
import { IconButton } from "@/components/ui/button";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useAsyncSearch } from "@/hooks/use-async-search";
import { readApiJson } from "@/lib/api-response";
import type { MediaItem } from "@/lib/library-cache";
import { mediaLabel, posterUrl } from "@/lib/media-display";

type LibraryGroup = { items: MediaItem[]; value: "Watchlist" | "Watched" };

function matchingNote(item: MediaItem, query: string) {
  const needle = query.toLocaleLowerCase();
  const notes = [
    { label: "Notes", value: item.watchlistNote },
    { label: "What you thought", value: item.reviewNote },
  ];
  return notes.find((note) => note.value?.toLocaleLowerCase().includes(needle)) ?? null;
}

async function searchLibrary(query: string, signal: AbortSignal) {
  const data = await readApiJson<{ items: MediaItem[] }>(
    await fetch(`/api/library-search?q=${encodeURIComponent(query)}`, { signal }),
  );
  return data.items;
}

export function GlobalSearch({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const router = useRouter();
  const onError = useCallback(
    (caught: unknown) => (caught instanceof Error ? caught.message : "Could not search your library."),
    [],
  );
  const { error, query, reset, results, searching, setQuery } = useAsyncSearch<MediaItem>({
    enabled: open,
    onError,
    search: searchLibrary,
  });

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

  const groups = useMemo<LibraryGroup[]>(() => {
    const watchlist = results.filter((item) => item.status === "watchlist");
    const watched = results.filter((item) => item.status === "watched");
    return [
      ...(watchlist.length > 0 ? [{ items: watchlist, value: "Watchlist" as const }] : []),
      ...(watched.length > 0 ? [{ items: watched, value: "Watched" as const }] : []),
    ];
  }, [results]);

  function close() {
    onOpenChange(false);
    reset();
  }

  function openItem(item: MediaItem) {
    close();
    router.push(`/${item.status}?item=${encodeURIComponent(item.id)}`);
  }

  const tooShort = query.trim().length < 2;

  return (
    <Dialog className="library-search-dialog" onOpenChange={(next) => !next && close()} open={open}>
      <DialogTitle className="sr-only">Search your library</DialogTitle>
      <Autocomplete.Root
        autoHighlight="always"
        filter={null}
        items={groups}
        onValueChange={setQuery}
        value={query}
      >
        <Autocomplete.InputGroup className="search-input-wrap">
          {searching ? <Spinner size={20} /> : <Search aria-hidden="true" size={20} />}
          <Autocomplete.Input
            aria-label="Search your library"
            autoComplete="off"
            autoFocus
            placeholder="Search titles and notes..."
          />
          <IconButton label="Close" onClick={close}>
            <X aria-hidden="true" size={18} />
          </IconButton>
        </Autocomplete.InputGroup>

        <div className="library-search-results">
          {error ? <p className="search-message error">{error}</p> : null}
          {!error && tooShort ? (
            <p className="search-message">Search everything you have saved, including notes.</p>
          ) : null}
          {!error && !tooShort && !searching && results.length === 0 ? (
            <p className="search-message">Nothing in your library matches that.</p>
          ) : null}
          <Autocomplete.List>
            {(group: LibraryGroup) => (
              <Autocomplete.Group className="library-search-group" items={group.items} key={group.value}>
                <Autocomplete.GroupLabel className="library-search-group-label">
                  <span>
                    {group.value === "Watched" ? <CheckCircle2 aria-hidden="true" size={13} /> : null}
                    {group.value}
                  </span>
                  <span>{group.items.length}</span>
                </Autocomplete.GroupLabel>
                <Autocomplete.Collection>
                  {(item: MediaItem) => {
                    const note = matchingNote(item, query.trim());
                    return (
                      <Autocomplete.Item
                        className="library-search-result"
                        key={item.id}
                        onClick={() => openItem(item)}
                        value={item}
                      >
                        <MediaResultContent
                          meta={[item.releaseYear, mediaLabel(item.mediaType)].filter(Boolean).join(" · ")}
                          noteLabel={note?.label}
                          noteValue={note?.value ?? undefined}
                          posterUrl={posterUrl(item.posterPath)}
                          rating={item.rating}
                          title={item.title}
                        />
                      </Autocomplete.Item>
                    );
                  }}
                </Autocomplete.Collection>
              </Autocomplete.Group>
            )}
          </Autocomplete.List>
        </div>
      </Autocomplete.Root>
      <div className="library-search-footer">
        <span>Titles and notes</span>
        <span className="keyboard-hint">Esc to close</span>
      </div>
    </Dialog>
  );
}
