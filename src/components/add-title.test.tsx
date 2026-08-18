// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AddTitleActions } from "./add-title";

describe("AddTitleActions rate-limit experience", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("preserves the query, explains the cooldown, and keeps custom titles available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
      {
        error: "TMDB is temporarily busy.",
        code: "RATE_LIMITED",
        reason: "tmdb_upstream",
        retryAfter: 5,
      },
      { status: 429, headers: { "Retry-After": "5" } },
    )));

    render(
      <AddTitleActions
        onAdd={vi.fn()}
        onBulkAdd={vi.fn()}
        onNotice={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add a title" }));
    const input = screen.getByRole("textbox", { name: "Search movies and shows" });
    fireEvent.change(input, { target: { value: "Arrival" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(input).toHaveValue("Arrival");
    expect(screen.getByText("TMDB is temporarily busy. Your library and custom titles still work.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again in 5s" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Add "Arrival"/ })).toBeEnabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByRole("button", { name: "Try search again" })).toBeEnabled();
  });
});
