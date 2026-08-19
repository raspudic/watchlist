"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Options<T> = {
  debounceMs?: number;
  enabled?: boolean;
  minLength?: number;
  /* Return a message to show, or null to handle the failure yourself —
     rate limiting and retry policy differ per surface and stay local. */
  onError?: (error: unknown) => string | null;
  search: (query: string, signal: AbortSignal) => Promise<T[]>;
};

export function useAsyncSearch<T>({
  debounceMs = 220,
  enabled = true,
  minLength = 2,
  onError,
  search,
}: Options<T>) {
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  /* Every request carries a sequence number so a slow earlier response can
     never overwrite a newer one after it resolves. */
  const requestId = useRef(0);
  const searchRef = useRef(search);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    searchRef.current = search;
    onErrorRef.current = onError;
  });

  const trimmed = query.trim();
  const ready = enabled && trimmed.length >= minLength;

  useEffect(() => {
    if (!ready) return;

    const id = (requestId.current += 1);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const next = await searchRef.current(trimmed, controller.signal);
        if (id !== requestId.current) return;
        setResults(next);
        setError("");
      } catch (caught) {
        if ((caught as Error).name === "AbortError" || id !== requestId.current) return;
        const message = onErrorRef.current ? onErrorRef.current(caught) : "Something went wrong.";
        if (message !== null) {
          setResults([]);
          setError(message);
        }
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [debounceMs, nonce, ready, trimmed]);

  const setQuery = useCallback(
    (next: string) => {
      setQueryState(next);
      if (next.trim().length < minLength) {
        requestId.current += 1;
        setResults([]);
        setSearching(false);
        setError("");
        return;
      }
      setSearching(true);
    },
    [minLength],
  );

  const reset = useCallback(() => {
    requestId.current += 1;
    setQueryState("");
    setResults([]);
    setSearching(false);
    setError("");
  }, []);

  const retry = useCallback(() => {
    setError("");
    setSearching(true);
    setNonce((current) => current + 1);
  }, []);

  return { error, query, reset, results, retry, searching, setError, setQuery, setResults };
}
