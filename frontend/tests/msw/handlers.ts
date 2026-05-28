import { http, HttpResponse } from "msw";

const API = "/api";

/**
 * Default handlers used as a sane baseline. Individual tests can override
 * these via `server.use(...)` to customize per-test responses.
 */
export const handlers = [
  http.get(`${API}/auth/me`, () =>
    HttpResponse.json({ user_id: 1, username: "alice", is_admin: false }),
  ),
  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { username: string; password: string };
    if (body.password === "wrong") {
      return HttpResponse.json({ detail: "Usuário ou senha inválidos" }, { status: 401 });
    }
    return HttpResponse.json({
      user: { user_id: 1, username: body.username, is_admin: false },
    });
  }),
  http.post(`${API}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as { username: string };
    return HttpResponse.json(
      { user: { user_id: 2, username: body.username, is_admin: false } },
      { status: 201 },
    );
  }),
  http.post(`${API}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${API}/auth/refresh`, () =>
    HttpResponse.json({
      user: { user_id: 1, username: "alice", is_admin: false },
    }),
  ),

  http.get(`${API}/assets`, () => HttpResponse.json([])),
  http.get(`${API}/purchases`, () => HttpResponse.json([])),
  http.get(`${API}/notifications/unread-count`, () =>
    HttpResponse.json({ unread_count: 0 }),
  ),
  http.get(`${API}/notifications`, () =>
    HttpResponse.json({ notifications: [], unread_count: 0, total_count: 0 }),
  ),
  http.get(`${API}/financial-reserves`, () =>
    HttpResponse.json({ month: "2026-05", amount: null, entry: null }),
  ),
];
