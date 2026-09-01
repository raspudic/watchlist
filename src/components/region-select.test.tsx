// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RegionProvider } from "@/components/region-provider";

import { RegionPicker, RegionSelect } from "./region-select";

const watchRegions = [
  { code: "SE", name: "Sweden" },
  { code: "US", name: "United States of America" },
  { code: "AR", name: "Argentina" },
  { code: "GB", name: "United Kingdom" },
];

function stubFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/watch-regions")) {
      return Promise.resolve(Response.json({ regions: watchRegions }));
    }
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as { regions: string[] };
      return Promise.resolve(Response.json({ regions: body.regions }));
    }
    return Promise.resolve(Response.json({}));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPicker(regions: string[], suggestedRegion: string | null = null) {
  return render(
    <RegionProvider regions={regions} suggestedRegion={suggestedRegion}>
      <RegionPicker />
    </RegionProvider>,
  );
}

function renderSelect(regions: string[], suggestedRegion: string | null = null) {
  return render(
    <RegionProvider regions={regions} suggestedRegion={suggestedRegion}>
      <RegionSelect />
    </RegionProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("RegionPicker", () => {
  it("lists the saved countries with the home one marked Home, offering Make home only on the others", async () => {
    stubFetch();
    renderPicker(["SE", "US"]);

    await screen.findByText("Sweden");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);

    const [home, other] = items;
    expect(within(home).getByText("Sweden")).toBeInTheDocument();
    expect(within(home).getByText("Home")).toBeInTheDocument();
    expect(within(home).queryByRole("button", { name: "Make home" })).not.toBeInTheDocument();

    expect(within(other).getByText("United States of America")).toBeInTheDocument();
    expect(within(other).getByRole("button", { name: "Make home" })).toBeInTheDocument();
    expect(within(other).queryByText("Home")).not.toBeInTheDocument();
  });

  it("adds a country: PUTs the existing list plus the new one, then shows it", async () => {
    const fetchMock = stubFetch();
    renderPicker(["SE"]);

    const select = await screen.findByLabelText("Add another country");
    await waitFor(() => expect(select).not.toBeDisabled());

    fireEvent.change(select, { target: { value: "US" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith("/api/regions", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ regions: ["SE", "US"] }),
      }));
    });

    expect(await screen.findByText("United States of America")).toBeInTheDocument();
  });

  it("Make home PUTs the list reordered with that country first", async () => {
    const fetchMock = stubFetch();
    renderPicker(["SE", "US"]);

    const makeHome = await screen.findByRole("button", { name: "Make home" });
    fireEvent.click(makeHome);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith("/api/regions", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ regions: ["US", "SE"] }),
      }));
    });
  });

  it("removing a country PUTs the list without it", async () => {
    const fetchMock = stubFetch();
    renderPicker(["SE", "US"]);

    await screen.findByText("Sweden");
    fireEvent.click(screen.getByRole("button", { name: "Remove Sweden" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith("/api/regions", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ regions: ["US"] }),
      }));
    });
  });

  it("with three countries saved there is no country select, and the limit is explained", async () => {
    stubFetch();
    renderPicker(["SE", "US", "AR"]);

    await screen.findByText("Sweden");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText(/Three countries is the limit/)).toBeInTheDocument();
  });

  it("does not offer an already-saved country in the select", async () => {
    stubFetch();
    renderPicker(["SE"]);

    const select = await screen.findByLabelText("Add another country");
    await waitFor(() => expect(select).not.toBeDisabled());

    expect(within(select).queryByText("Sweden")).not.toBeInTheDocument();
    expect(within(select).getByText("United States of America")).toBeInTheDocument();
    expect(within(select).getByText("Argentina")).toBeInTheDocument();
    expect(within(select).getByText("United Kingdom")).toBeInTheDocument();
  });
});

describe("RegionSelect", () => {
  it("preselects the browser's suggestion when no countries are saved, and saving PUTs a single-country list", async () => {
    const fetchMock = stubFetch();
    renderSelect([], "AR");

    await waitFor(() => {
      expect(screen.getByLabelText("Country")).toHaveValue("AR");
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith("/api/regions", expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ regions: ["AR"] }),
      }));
    });
  });
});
