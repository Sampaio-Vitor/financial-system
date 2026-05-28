import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationBell from "@/components/notification-bell";
import { server } from "../msw/server";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("NotificationBell", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("renders without a badge when there are no unread notifications", async () => {
    render(<NotificationBell />);

    expect(await screen.findByLabelText("Notificações")).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("shows unread count and notification rows in the dropdown", async () => {
    server.use(
      http.get("/api/notifications/unread-count", () =>
        HttpResponse.json({ unread_count: 2 }),
      ),
      http.get("/api/notifications", () =>
        HttpResponse.json({
          unread_count: 2,
          total_count: 1,
          notifications: [
            {
              id: 7,
              type: "TEST",
              title: "Novo provento",
              message: "ITUB4 pagou R$ 12,34.",
              severity: "info",
              link: "/carteira/proventos",
              metadata: null,
              read_at: null,
              created_at: "2026-05-28T12:00:00Z",
            },
          ],
        }),
      ),
      http.patch("/api/notifications/7/read", () =>
        HttpResponse.json({
          id: 7,
          type: "TEST",
          title: "Novo provento",
          message: "ITUB4 pagou R$ 12,34.",
          severity: "info",
          link: "/carteira/proventos",
          metadata: null,
          read_at: "2026-05-28T12:01:00Z",
          created_at: "2026-05-28T12:00:00Z",
        }),
      ),
    );

    const user = userEvent.setup();
    render(<NotificationBell />);

    expect(await screen.findByText("2")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Notificações"));

    expect(await screen.findByText("Novo provento")).toBeInTheDocument();
    await user.click(screen.getByText("Novo provento"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/carteira/proventos"));
  });

  it("marks all notifications as read", async () => {
    server.use(
      http.get("/api/notifications/unread-count", () =>
        HttpResponse.json({ unread_count: 1 }),
      ),
      http.get("/api/notifications", () =>
        HttpResponse.json({
          unread_count: 1,
          total_count: 1,
          notifications: [
            {
              id: 1,
              type: "TEST",
              title: "Alerta",
              message: "Mensagem",
              severity: "warning",
              link: null,
              metadata: null,
              read_at: null,
              created_at: "2026-05-28T12:00:00Z",
            },
          ],
        }),
      ),
      http.post("/api/notifications/mark-all-read", () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );

    const user = userEvent.setup();
    render(<NotificationBell />);

    expect(await screen.findByText("1")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Notificações"));
    await user.click(await screen.findByLabelText("Marcar todas como lidas"));

    await waitFor(() => expect(screen.queryByText("1")).not.toBeInTheDocument());
  });
});
