// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";

import { AddTitleActions } from "./add-title";

afterEach(cleanup);

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
      />,
      { wrapper: ToastProvider },
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
    expect(screen.getByRole("button", { name: /Add “Arrival” as a custom title/ })).toBeEnabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByRole("button", { name: "Try search again" })).toBeEnabled();
  });
});

describe("AddTitleActions add behavior", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("closes after adding by default", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(
      <AddTitleActions
        onAdd={onAdd}
        onBulkAdd={vi.fn()}
      />,
      { wrapper: ToastProvider },
    );

    fireEvent.click(screen.getByRole("button", { name: "Add a title" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search movies and shows" }), { target: { value: "Arrival" } });
    fireEvent.click(screen.getByRole("button", { name: /Add “Arrival” as a custom title/ }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Find a title" })).not.toBeInTheDocument();
    });
  });

  it("stays open and resets the search when Quick add is enabled", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(
      <AddTitleActions
        onAdd={onAdd}
        onBulkAdd={vi.fn()}
      />,
      { wrapper: ToastProvider },
    );

    fireEvent.click(screen.getByRole("button", { name: "Add a title" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Quick add" }));
    const input = screen.getByRole("textbox", { name: "Search movies and shows" });
    fireEvent.change(input, { target: { value: "Arrival" } });
    fireEvent.click(screen.getByRole("button", { name: /Add “Arrival” as a custom title/ }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog", { name: "Find a title" })).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(screen.getByText("Added Arrival. Ready for another.")).toBeInTheDocument();
  });
});
