/* PWA 서비스 워커 — 앱 설치·오프라인 + Web Push(할일 리마인더) */
/** 번들·아이콘 등 캐시 버전 (전략 바꿀 때만 올리면 이전 캐시 정리됨) */
const ASSET_CACHE = "tip-assets-v7";
/** HTML 셸 캐시 — 홈 화면에서 열 때 즉시 표시용 */
const HTML_CACHE = "tip-html-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      /* 첫 방문 직후에도 재실행 시 HTML·아이콘·매니페스트를 즉시 줄 수 있게 미리 채움 */
      try {
        const htmlCache = await caches.open(HTML_CACHE);
        const shell = await fetch(new Request(self.location.origin + "/", { cache: "reload" }));
        if (shell && shell.ok) {
          await htmlCache.put(new Request(self.location.origin + "/"), shell.clone());
        }
      } catch (_e) {}
      try {
        const assetCache = await caches.open(ASSET_CACHE);
        const urls = [
          "/manifest.json",
          "/icon-192.png?v=timeisprice-icon-2",
          "/toolbaricons/dashboard.svg",
          "/toolbaricons/menu-time.png",
          "/toolbaricons/menu-todo.png",
          "/toolbaricons/menu-schedule.png",
          "/toolbaricons/menu-dream.png",
          "/toolbaricons/menu-sideincome.png",
          "/toolbaricons/menu-happiness.png",
          "/toolbaricons/menu-health.png",
          "/toolbaricons/menu-time-report.png",
          "/toolbaricons/menu-stamp.png",
          "/toolbaricons/menu-account.png",
        ];
        await Promise.all(
          urls.map(async (path) => {
            try {
              const u = self.location.origin + path;
              const r = await fetch(u);
              if (r && r.ok) await assetCache.put(u, r.clone());
            } catch (_e) {}
          }),
        );
      } catch (_e) {}
    })(),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (k) =>
              ((k.startsWith("organism-assets-") || k.startsWith("tip-assets-")) &&
                k !== ASSET_CACHE) ||
              ((k.startsWith("organism-html-") || k.startsWith("tip-html-")) && k !== HTML_CACHE),
          )
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function shouldUseAssetCache(url) {
  const p = url.pathname;
  if (p === "/sw.js") return false;
  if (p.startsWith("/assets/") && (p.endsWith(".js") || p.endsWith(".css"))) return true;
  if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf|eot)(\?.*)?$/i.test(p)) return true;
  if (p === "/manifest.json" || p.startsWith("/manifest.json")) return true;
  return false;
}

/** 캐시 먼저로 재방문·홈화면 실행 시 큰 JS/CSS 즉시 응답, 백그라운드에서 네트워크로 갱신 */
async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        try {
          cache.put(request, response.clone());
        } catch (_e) {}
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }
  const live = await networkPromise;
  if (live) return live;
  return new Response("", { status: 504, statusText: "Offline" });
}

/** HTML 셸(/) — 캐시 먼저 즉시 반환 후 백그라운드에서 최신 갱신 */
async function staleWhileRevalidateHtml(event, request) {
  const cache = await caches.open(HTML_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        try {
          cache.put(request, response.clone());
        } catch (_e) {}
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }
  const live = await networkPromise;
  if (live) return live;
  return new Response("", { status: 504, statusText: "Offline" });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") {
    event.respondWith(fetch(req));
    return;
  }
  let url;
  try {
    url = new URL(req.url);
  } catch (_e) {
    event.respondWith(fetch(req));
    return;
  }
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(req));
    return;
  }
  /* 내비게이션 요청(HTML 페이지) — 홈 화면에서 열 때 캐시로 즉시 표시 */
  if (req.mode === "navigate") {
    event.respondWith(staleWhileRevalidateHtml(event, req));
    return;
  }
  if (!shouldUseAssetCache(url)) {
    event.respondWith(fetch(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(event, req));
});

self.addEventListener("push", (event) => {
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
    void e;
  }
  /* iOS WebKit은 알림 아이콘에 SVG 를 쓰면 showNotification 이 조용히 실패하는 경우가 있음 → PNG 권장 */
  const options = {
    body: data.body || "설정한 시간이 되었어요.",
    icon: "/icon-192.png?v=timeisprice-icon-2",
    badge: "/icon-192.png?v=timeisprice-icon-2",
    tag: data.tag || "timeisprice-reminder",
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
      for (const client of clientList) {
        try {
          client.postMessage(msg);
        } catch (_e) {}
      }
      return self.registration.showNotification(data.title, options).catch((err) => {
        void err;
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
