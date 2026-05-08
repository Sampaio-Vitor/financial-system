import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { apiFetch, refreshAuthSession } from "@/lib/api";
import { server } from "../msw/server";

const originalLocation = window.location;

beforeEach(() => {
  // jsdom's window.location is read-only; replace via defineProperty
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, href: "http://localhost/" },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("apiFetch", () => {
  it("parses JSON success", async () => {
    server.use(http.get("/api/assets", () => HttpResponse.json([{ id: 1 }])));
    const data = await apiFetch<Array<{ id: number }>>("/assets");
    expect(data).toEqual([{ id: 1 }]);
  });

  it("returns undefined on 204", async () => {
    server.use(
      http.delete("/api/purchases/1", () => new HttpResponse(null, { status: 204 })),
    );
    const out = await apiFetch("/purchases/1", { method: "DELETE" });
    expect(out).toBeUndefined();
  });

  it("throws with detail on non-2xx", async () => {
    server.use(
      http.post("/api/purchases", () =>
        HttpResponse.json({ detail: "not allowed" }, { status: 400 }),
      ),
    );
    await expect(apiFetch("/purchases", { method: "POST" })).rejects.toThrow("not allowed");
  });

  it("falls back to HTTP <status> when error body has no detail", async () => {
    server.use(
      http.get("/api/x", () => HttpResponse.text("", { status: 500 })),
    );
    await expect(apiFetch("/x")).rejects.toThrow("Request failed");
  });

  it("retries after a successful refresh on 401", async () => {
    let attempts = 0;
    server.use(
      http.get("/api/assets", () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json({}, { status: 401 });
        }
        return HttpResponse.json([{ id: 99 }]);
      }),
      http.post("/api/auth/refresh", () => HttpResponse.json({})),
    );
    const out = await apiFetch<Array<{ id: number }>>("/assets");
    expect(out).toEqual([{ id: 99 }]);
    expect(attempts).toBe(2);
  });

  it("redirects to /login when refresh fails", async () => {
    server.use(
      http.get("/api/assets", () => HttpResponse.json({}, { status: 401 })),
      http.post("/api/auth/refresh", () => HttpResponse.json({}, { status: 401 })),
    );
    await expect(apiFetch("/assets")).rejects.toThrow("Unauthorized");
    expect(window.location.href).toBe("/login");
  });

  it("does not retry refresh for /auth/login responses", async () => {
    server.use(
      http.post("/api/auth/login", () => HttpResponse.json({}, { status: 401 })),
    );
    await expect(apiFetch("/auth/login", { method: "POST" })).rejects.toThrow();
    expect(window.location.href).toBe("/login");
  });
});

describe("refreshAuthSession", () => {
  it("returns true on 200", async () => {
    server.use(http.post("/api/auth/refresh", () => HttpResponse.json({})));
    expect(await refreshAuthSession()).toBe(true);
  });

  it("returns false on 401", async () => {
    server.use(
      http.post("/api/auth/refresh", () => HttpResponse.json({}, { status: 401 })),
    );
    expect(await refreshAuthSession()).toBe(false);
  });

  it("dedupes concurrent calls", async () => {
    let count = 0;
    server.use(
      http.post("/api/auth/refresh", () => {
        count += 1;
        return HttpResponse.json({});
      }),
    );
    const [a, b, c] = await Promise.all([
      refreshAuthSession(),
      refreshAuthSession(),
      refreshAuthSession(),
    ]);
    expect([a, b, c]).toEqual([true, true, true]);
    expect(count).toBe(1);
  });
});
