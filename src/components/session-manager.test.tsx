// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionManager } from "@/components/session-manager";

const mocks = vi.hoisted(() => {
  const refresh = vi.fn();
  const replace = vi.fn();
  return {
    listSessions: vi.fn(),
    refresh,
    replace,
    revokeOtherSessions: vi.fn(),
    revokeSession: vi.fn(),
    router: { refresh, replace },
    signOut: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    listSessions: mocks.listSessions,
    revokeOtherSessions: mocks.revokeOtherSessions,
    revokeSession: mocks.revokeSession,
    signOut: mocks.signOut,
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SessionManager", () => {
  it("identifies the current session and masks its network address", async () => {
    mocks.listSessions.mockResolvedValue({
      data: [{
        id: "current-session",
        token: "secret-session-token",
        createdAt: "2026-08-19T10:00:00.000Z",
        updatedAt: "2026-08-19T11:00:00.000Z",
        expiresAt: "2026-09-18T11:00:00.000Z",
        ipAddress: "203.0.113.42",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36",
      }],
      error: null,
    });

    render(<SessionManager currentSessionId="current-session" />);

    expect(await screen.findByText("Current device")).toBeInTheDocument();
    expect(screen.getByText("Chrome on Windows")).toBeInTheDocument();
    expect(screen.getByText("203.0.x.x")).toBeInTheDocument();
    expect(screen.queryByText("203.0.113.42")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("explains when a fresh sign-in is required", async () => {
    mocks.listSessions.mockResolvedValue({
      data: null,
      error: { code: "SESSION_NOT_FRESH", status: 403 },
    });

    render(<SessionManager currentSessionId="current-session" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Confirm it’s you" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeInTheDocument();
  });

  it("revokes an individual other session through Better Auth", async () => {
    mocks.listSessions.mockResolvedValue({
      data: [{
        id: "other-session",
        token: "other-session-token",
        createdAt: "2026-08-18T10:00:00.000Z",
        updatedAt: "2026-08-19T09:00:00.000Z",
        expiresAt: "2026-09-18T09:00:00.000Z",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15",
      }],
      error: null,
    });
    mocks.revokeSession.mockResolvedValue({ data: { status: true }, error: null });

    render(<SessionManager currentSessionId="current-session" />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(mocks.revokeSession).toHaveBeenCalledWith({ token: "other-session-token" }));
    await waitFor(() => expect(screen.getByText("The device was signed out.")).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Safari on macOS")).not.toBeInTheDocument());
  });

  it("gives rate-limited users a retry action", async () => {
    mocks.listSessions.mockResolvedValue({ data: null, error: { status: 429 } });

    render(<SessionManager currentSessionId="current-session" />);

    expect(await screen.findByText("Too many requests were made. Wait a minute, then try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
