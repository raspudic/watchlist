// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/login-form";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  username: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { username: mocks.username } },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LoginForm", () => {
  it("remembers the session by default and passes the explicit choice", async () => {
    mocks.username.mockResolvedValue({ data: {}, error: null });
    render(<LoginForm returnTo="/account/sessions" />);

    const rememberMe = screen.getByRole("checkbox", { name: /keep me signed in/i });
    expect(rememberMe).toBeChecked();
    fireEvent.click(rememberMe);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "friend" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(mocks.username).toHaveBeenCalledWith({
      password: "correct horse battery staple",
      rememberMe: false,
      username: "friend",
    }));
    expect(mocks.replace).toHaveBeenCalledWith("/account/sessions");
  });
});
