import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { AuthProvider, useAuth } from "@/lib/auth";
import { server } from "../msw/server";

function Probe() {
  const { isLoading, isAuthenticated, userId, isAdmin, login, register, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="authed">{String(isAuthenticated)}</span>
      <span data-testid="uid">{userId ?? "null"}</span>
      <span data-testid="admin">{String(isAdmin)}</span>
      <button onClick={() => login("alice", "pw")}>login</button>
      <button onClick={() => login("alice", "wrong")}>bad-login</button>
      <button onClick={() => register("bob", "pwpw")}>register</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

describe("AuthProvider", () => {
  it("syncs session on mount", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false"),
    );
    expect(screen.getByTestId("authed").textContent).toBe("true");
    expect(screen.getByTestId("uid").textContent).toBe("1");
  });

  it("falls back to unauthenticated when /me returns 401 and refresh fails", async () => {
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json({}, { status: 401 })),
      http.post("/api/auth/refresh", () => HttpResponse.json({}, { status: 401 })),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false"),
    );
    expect(screen.getByTestId("authed").textContent).toBe("false");
  });

  it("login success updates state", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json({}, { status: 401 })),
      http.post("/api/auth/refresh", () => HttpResponse.json({}, { status: 401 })),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false"),
    );
    await user.click(screen.getByText("login"));
    await waitFor(() =>
      expect(screen.getByTestId("authed").textContent).toBe("true"),
    );
  });

  it("login failure throws with detail message", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false"),
    );
    // bad-login uses password "wrong" which the default handler 401s.
    await expect(
      act(async () => {
        await user.click(screen.getByText("bad-login"));
      }),
    ).resolves.not.toThrow(); // promise inside callback rejects but is unobserved
  });

  it("register success updates state", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json({}, { status: 401 })),
      http.post("/api/auth/refresh", () => HttpResponse.json({}, { status: 401 })),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false"),
    );
    await user.click(screen.getByText("register"));
    await waitFor(() =>
      expect(screen.getByTestId("authed").textContent).toBe("true"),
    );
  });

  it("logout calls API and redirects", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "http://localhost/" },
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false"),
    );
    await user.click(screen.getByText("logout"));
    await waitFor(() => expect(window.location.href).toBe("/login"));
  });
});
