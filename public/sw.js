/* PWA 서비스 워커 — 앱 설치·오프라인 + Web Push(할일 리마인더) */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  const LOG = "[lp-reminder-sw]";
  let data = { title: "할일 리마인더", body: "", url: "/", tag: "" };
  try {
    if (event.data) {
      const j = event.data.json();
      if (j.title) data.title = j.title;
      if (j.body) data.body = j.body;
      if (j.url) data.url = j.url;
      if (j.tag) data.tag = j.tag;
    }
  } catch (e) {
    try {
      const t = event.data?.text();
      if (t) data.body = t;
    } catch (_) {}
    console.warn(LOG, "json parse fail, fallback text", e);
  }
  console.log(LOG, "push payload", { title: data.title, body: data.body, url: data.url });
  const options = {
    body: data.body || "설정한 시간이 되었어요.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: data.tag || "organism-reminder",
    renotify: true,
    silent: false,
    vibrate: [180, 80, 180],
    data: { url: data.url || "/" },
  };
  event.waitUntil(
    self.clients.matchAll({ type: "all", includeUncontrolled: true }).then((clientList) => {
      const msg = {
        type: "lp-reminder",
        title: data.title,
        body: data.body || "",
        url: data.url || "/",
      };
      const anyVisible = clientList.some((c) => c.visibilityState === "visible");
      console.log(
        LOG,
        "clients",
        clientList.length,
        "anyVisible",
        anyVisible,
        clientList.map((c) => [c.visibilityState, c.url || c.id || "?"]),
      );
      for (const client of clientList) {
        try {
          client.postMessage(msg);
          console.log(LOG, "postMessage", client.url || client.constructor?.name);
        } catch (e) {
          console.warn(LOG, "postMessage failed", e);
        }
      }
      /* 백그라운드(보이는 창 없음)이거나 앱 완전 종료 → OS 알림 */
      if (!anyVisible) {
        console.log(LOG, "→ showNotification");
        return self.registration.showNotification(data.title, options);
      }
      console.log(LOG, "foreground → OS 알림 생략(앱에서 토스트)");
      return Promise.resolve();
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
