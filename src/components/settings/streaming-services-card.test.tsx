// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RegionProvider } from "@/components/region-provider";
import { ToastProvider } from "@/components/ui/toast";

import { StreamingServicesCard } from "./streaming-services-card";

const providers = [
  { id: 8, providerIds: [8], name: "Netflix", logoPath: "/netflix.jpg", mediaTypes: ["movie", "tv"], regions: ["SE"] },
  { id: 337, providerIds: [337], name: "Disney Plus", logoPath: null, mediaTypes: ["movie"], regions: ["SE"] },
];

function renderCard(regions: string[] = ["SE"]) {
  return render(
    <RegionProvider regions={regions} suggestedRegion={null}>
      <ToastProvider><StreamingServicesCard /></ToastProvider>
    </RegionProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StreamingServicesCard", () => {
  it("waits for a saved country before loading providers", () => {
    vi.stubGlobal("fetch", vi.fn());

    renderCard([]);

    expect(screen.getByText(/Choose and save a country above first/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads, filters and saves the selected services", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return Promise.resolve(Response.json({
          regions: ["SE"],
          providers,
          selectedProviderIds: [8, 337],
        }));
      }
      return Promise.resolve(Response.json({ regions: ["SE"], providers, selectedProviderIds: [8] }));
    }));

    renderCard();

    expect(await screen.findByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText("1 service selected")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Find a service"), { target: { value: "Disney" } });
    expect(screen.queryByText("Netflix")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Disney Plus"));
    expect(screen.getByText("2 services selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save services" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenLastCalledWith("/api/streaming-services", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ providerIds: [8, 337] }),
      }));
    });
    expect(await screen.findByText("Streaming services updated.")).toBeInTheDocument();
  });

  it("clears the search when a result is ticked, so the next one can be typed", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(
      Response.json({ regions: ["SE"], providers, selectedProviderIds: [] }),
    )));

    renderCard();

    const search = await screen.findByLabelText("Find a service");
    fireEvent.change(search, { target: { value: "Disney" } });
    expect(screen.queryByText("Netflix")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Disney Plus"));

    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText("1 service selected")).toBeInTheDocument();
  });

  it("keeps a useful error when provider loading fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json(
      { error: "Streaming services are unavailable right now." },
      { status: 502 },
    ))));

    renderCard();

    expect(await screen.findByRole("alert")).toHaveTextContent("Streaming services are unavailable right now.");
  });

  it("treats regional provider ids as one selected service", async () => {
    const prime = [{
      id: 9,
      providerIds: [9, 119],
      name: "Prime Video",
      logoPath: "/prime.jpg",
      mediaTypes: ["movie", "tv"],
      regions: ["SE", "US"],
    }];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(
      Response.json({ regions: ["SE", "US"], providers: prime, selectedProviderIds: [119] }),
    )));

    renderCard(["SE", "US"]);

    expect(await screen.findByText("Prime Video")).toBeInTheDocument();
    expect(screen.getAllByText("Prime Video")).toHaveLength(1);
    expect(screen.getByText("1 service selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Prime Video/ })).toBeChecked();
  });
});
