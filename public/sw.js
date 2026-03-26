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
  /* iOS WebKit은 알림 아이콘에 SVG 를 쓰면 showNotification 이 조용히 실패하는 경우가 있음 → PNG 권장 */
  const options = {
    body: data.body || "설정한 시간이 되었어요.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "organism-reminder",
    renotify: true,
    silent: false,
    vibrate: [180, 80, 180],
    data: { url: data.url || "/" },
  };
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
      const msg = {
        type: "lp-reminder",
        title: data.title,
        body: data.body || "",
        url: data.url || "/",
      };
      /*
       * Safari(iOS PWA)는 백그라운드인데도 WindowClient.focused 가 true로 남는 경우가 있어
       * OS 알림을 생략하면 배너가 안 뜨고, postMessage 는 페이지가 살아날 때까지 처리 지연 → 앱을 열어야 토스트만 보임.
       * 구독이 userVisibleOnly 이므로 푸시마다 showNotification 을 항상 호출한다.
       */
      console.log(
        LOG,
        "windows",
        clientList.length,
        clientList.map((c) => [c.visibilityState, "focused" in c ? c.focused : "?", c.url || "?"]),
      );
      for (const client of clientList) {
        try {
          client.postMessage(msg);
          console.log(LOG, "postMessage", client.url || client.constructor?.name);
        } catch (e) {
          console.warn(LOG, "postMessage failed", e);
        }
      }
      console.log(LOG, "→ showNotification");
      return self.registration.showNotification(data.title, options).catch((err) => {
        console.warn(LOG, "showNotification failed, retry minimal options", err);
        return self.registration.showNotification(data.title, {
          body: options.body,
          tag: options.tag,
          renotify: options.renotify,
          data: options.data,
        });
      });
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
