self.addEventListener("push", (event) => {
  const payload = event.data
    ? event.data.json()
    : {
        title: "CofrinhoGordinho",
        body: "Você tem uma nova notificação.",
        link: "/carteira",
      };

  const options = {
    body: payload.body,
    icon: "/icon-512.png",
    badge: "/apple-icon.png",
    data: {
      id: payload.id,
      link: payload.link || "/carteira",
    },
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "CofrinhoGordinho", options),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notificationId = event.notification.data?.id;
  const link = event.notification.data?.link || "/carteira";

  event.waitUntil(
    (async () => {
      if (notificationId) {
        await fetch(`/api/notifications/${notificationId}/read`, {
          method: "PATCH",
          credentials: "include",
        }).catch(() => undefined);
      }

      const windows = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const target = new URL(link, self.location.origin);
      if (notificationId) {
        target.searchParams.set("push_notification_id", String(notificationId));
      }
      const targetUrl = target.href;

      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            return client.navigate(targetUrl);
          }
          return;
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })(),
  );
});
