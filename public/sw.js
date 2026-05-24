/* PWA 서비스 워커 — 앱 설치·오프라인 + Web Push(할일 리마인더) */
/** 번들·아이콘 등 캐시 버전 (전략 바꿀 때만 올리면 이전 캐시 정리됨) */
const ASSET_CACHE = "tip-assets-v11";
/** HTML 셸 캐시 — 홈 화면에서 열 때 즉시 표시용 */
const HTML_CACHE = "tip-html-v2";

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
        const manifestRes = await fetch(
          self.location.origin + "/app-icon-prefetch.json",
        );
        if (manifestRes && manifestRes.ok) {
          const iconPaths = await manifestRes.json();
          const paths = Array.isArray(iconPaths)
            ? ["/manifest.json", ...iconPaths]
            : ["/manifest.json"];
          await Promise.all(
            paths.map(async (path) => {
              try {
                const p = String(path || "").trim();
                if (!p.startsWith("/")) return;
                const u = self.location.origin + p;
                const r = await fetch(u);
                if (r && r.ok) await assetCache.put(u, r.clone());
              } catch (_e) {}
            }),
          );
        }
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

function isBundledJsCss(pathname) {
  return (
    pathname.startsWith("/assets/") &&
    /\.(js|css)(\?.*)?$/i.test(pathname)
  );
}

function isStaticImageAsset(pathname) {
  return /\.(png|jpe?g|webp|gif|svg|ico)(\?.*)?$/i.test(pathname);
}

/** JS/CSS 번들 — 네트워크 우선(배포 직후 구 HTML·빈 캐시로 실행 실패·무한 로딩 방지) */
async function networkFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch (_e) {}
      return response;
    }
  } catch (_e) {}
  const cached = await cache.match(request);
  if (cached) return cached;
  return fetch(request);
}

/** PNG·SVG 등 정적 아이콘 — 캐시 우선(install·prefetch 로 채운 뒤 즉시 표시) */
async function cacheFirstStaticAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch (_e) {}
      return response;
    }
  } catch (_e) {}
  return fetch(request);
}

/** HTML 셸(/) — 네트워크 우선 후 오프라인일 때만 캐시 */
async function networkFirstHtml(request) {
  const cache = await caches.open(HTML_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch (_e) {}
      return response;
    }
  } catch (_e) {}
  const cached = await cache.match(request);
  if (cached) return cached;
  return fetch(request);
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
  /* 내비게이션 요청(HTML 페이지) */
  if (req.mode === "navigate") {
    event.respondWith(networkFirstHtml(req));
    return;
  }
  if (!shouldUseAssetCache(url)) {
    event.respondWith(fetch(req));
    return;
  }
  if (isBundledJsCss(url.pathname)) {
    event.respondWith(networkFirstAsset(req));
    return;
  }
  if (isStaticImageAsset(url.pathname) || url.pathname === "/manifest.json") {
    event.respondWith(cacheFirstStaticAsset(req));
    return;
  }
  event.respondWith(networkFirstAsset(req));
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
