/* PWA 서비스 워커 — 앱 설치·오프라인 */
/** index.html·manifest 의 ?v= 와 동일하게 유지 */
const PWA_BRAND = "doodle-calendar-1";
/** 번들·아이콘 등 캐시 버전 (전략·브랜드 바꿀 때 올리면 이전 캐시 정리됨) */
const ASSET_CACHE = "tip-assets-v79";
const LOGIN_BRAND_LOGO_V = "user-1";

const PWA_BRAND_BASENAMES = new Set([
  "/manifest.json",
  "/favicon.ico",
  "/icon-16.png",
  "/icon-32.png",
  "/icon-48.png",
  "/icon-192.png",
  "/icon-512.png",
  "/og-app-icon.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/icon.svg",
  "/login-brand-doodle.jpg",
  "/login-brand-doodle.png",
  "/login brand logo.png",
]);

function isPwaBrandAsset(pathname) {
  return PWA_BRAND_BASENAMES.has(pathname);
}

function isPaperDoodlePath(pathname) {
  return (
    pathname === "/home time management.png" ||
    pathname === "/homedesk.png" ||
    pathname === "/login brand logo.png" ||
    pathname === "/home-time-management-ink.png" ||
    pathname === "/home-desk-doodle-ink.png" ||
    pathname === "/home-time-management.png" ||
    pathname === "/home-desk-doodle.png" ||
    pathname === "/toolbaricons/splash/splash-screen-ink.png" ||
    pathname === "/toolbaricons/splash/splash-screen.png" ||
    pathname === "/login-brand-doodle.png"
  );
}

/** install 단계: PWA 설치 조건만 빠르게 — 887개 아이콘은 클라이언트 idle prefetch */
const PWA_INSTALL_CORE_PATHS = [
  `/manifest.json?v=${PWA_BRAND}`,
  `/icon-192.png?v=${PWA_BRAND}`,
  `/icon-512.png?v=${PWA_BRAND}`,
  `/icon-maskable-192.png?v=${PWA_BRAND}`,
  `/icon-maskable-512.png?v=${PWA_BRAND}`,
  `/apple-touch-icon.png?v=${PWA_BRAND}`,
  `/favicon.ico?v=${PWA_BRAND}`,
  `/icon-48.png?v=${PWA_BRAND}`,
  `/og-app-icon.png?v=${PWA_BRAND}`,
  "/pwa-splash-512.png",
  "/pwa-splash-portrait-1080.png",
  "/pwa-splash-portrait-1170.png",
  "/pwa-splash-portrait-1179.png",
  "/pwa-splash-portrait-1284.png",
  "/toolbaricons/splash/splash-screen.png",
  "/home time management.png",
  "/homedesk.png",
  "/login brand logo.png",
  "/fonts/LP-Griun-Cocochoitoon.ttf",
  "/fonts/LP-LeeSeoyun.otf",
  "/fonts/Hello-Scratchy-Outlines.otf",
  "/fonts/LP-Ongleip-Gongbujahana.ttf",
  "/fonts/LP-Griun-Myeoneunheulrim.ttf",
  "/fonts/LP-Ongleip-Mitmi.ttf",
  "/fonts/LP-Griun-Mongtori-Rg.ttf",
  "/fonts/LP-Griun-Cherry1Spoon-Rg.ttf",
  "/fonts/LP-Griun-Fromsol-Rg.ttf",
  `/login%20brand%20logo.png?v=${LOGIN_BRAND_LOGO_V}`,
];

/** 오프라인·캐시 미스 — respondWith 가 reject 되지 않게 항상 Response 반환 */
function offlineFallbackResponse(request) {
  const accept = String(request?.headers?.get?.("accept") || "");
  const isNav =
    request?.mode === "navigate" ||
    accept.includes("text/html");
  if (isNav) {
    return new Response(
      "<!doctype html><meta charset=utf-8><title>오프라인</title><body style=\"font-family:system-ui;padding:2rem;text-align:center\"><p>인터넷 연결이 필요합니다.</p><p>Wi-Fi 또는 데이터를 켠 뒤 다시 열어 주세요.</p></body>",
      {
        status: 503,
        statusText: "Offline",
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }
  return new Response("", { status: 503, statusText: "Offline" });
}

async function safeFetch(request, init) {
  try {
    return await fetch(request, init);
  } catch (_e) {
    return null;
  }
}

async function matchCached(cache, request) {
  try {
    let hit = await cache.match(request);
    if (hit && hit.ok) return hit;
    hit = await cache.match(request, { ignoreSearch: true });
    if (hit && hit.ok) return hit;
  } catch (_e) {}
  return null;
}

/** 홈 화면 추가 시 과제 아이콘 picker PNG(우선) 캐시 */
async function cacheTimeTaskPickerIcons(assetCache) {
  try {
    const listRes = await safeFetch(
      new Request(self.location.origin + "/app-icon-prefetch.json", {
        cache: "reload",
      }),
    );
    if (!listRes || !listRes.ok) return;
    const paths = await listRes.json();
    const picker = (Array.isArray(paths) ? paths : []).filter((p) =>
      String(p || "").startsWith("/toolbaricons/time-task-picker/"),
    );
    const BATCH = 12;
    for (let i = 0; i < picker.length; i += BATCH) {
      await Promise.all(
        picker.slice(i, i + BATCH).map(async (path) => {
          try {
            const u = self.location.origin + path;
            const cached = await assetCache.match(u);
            if (cached) return;
            const r = await safeFetch(u);
            if (r && r.ok) await assetCache.put(u, r.clone());
          } catch (_e) {}
        }),
      );
    }
  } catch (_e) {}
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const assetCache = await caches.open(ASSET_CACHE);
        await Promise.all(
          PWA_INSTALL_CORE_PATHS.map(async (path) => {
            try {
              const u = self.location.origin + path;
              const r = await safeFetch(new Request(u, { cache: "reload" }));
              if (r && r.ok) await assetCache.put(u, r.clone());
            } catch (_e) {}
          }),
        );
        await cacheTimeTaskPickerIcons(assetCache);
      } catch (_e) {}
    })(),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter((k) => k.startsWith("organism-html-") || k.startsWith("tip-html-"))
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
  if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf|eot|otf)(\?.*)?$/i.test(p)) return true;
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

function isToolbarIconPath(pathname) {
  return pathname.startsWith("/toolbaricons/");
}

function isFontPath(pathname) {
  return pathname.startsWith("/fonts/");
}

/** JS/CSS 번들 — 네트워크 우선 */
async function networkFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const response = await safeFetch(new Request(request, { cache: "reload" }));
  if (response && response.ok) {
    try {
      await cache.put(request, response.clone());
    } catch (_e) {}
    return response;
  }
  const cached = await matchCached(cache, request);
  if (cached) return cached;
  return offlineFallbackResponse(request);
}

/** manifest·홈 화면 아이콘 — 네트워크 우선 */
async function networkFirstBrandAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const response = await safeFetch(new Request(request, { cache: "reload" }));
  if (response && response.ok) {
    try {
      await cache.put(request, response.clone());
    } catch (_e) {}
    return response;
  }
  const cached = await matchCached(cache, request);
  if (cached) return cached;
  return offlineFallbackResponse(request);
}

/** PNG·SVG·폰트 — 캐시 우선 */
async function cacheFirstStaticAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await matchCached(cache, request);
  if (cached) return cached;
  const response = await safeFetch(request);
  if (response && response.ok) {
    try {
      await cache.put(request, response.clone());
    } catch (_e) {}
    return response;
  }
  return offlineFallbackResponse(request);
}

/** toolbaricons — stale-while-revalidate */
async function staleWhileRevalidateToolbarIcon(request, event) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await matchCached(cache, request);
  const refresh = (async () => {
    const response = await safeFetch(new Request(request, { cache: "no-cache" }));
    if (response && response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch (_e) {}
      return response;
    }
    return null;
  })();
  if (cached) {
    try {
      event.waitUntil(refresh);
    } catch (_e) {}
    return cached;
  }
  const fresh = await refresh;
  if (fresh) return fresh;
  return offlineFallbackResponse(request);
}

/** 페이지는 저장하지 않음. 아이콘 캐시는 그대로 */
async function networkOnlyHtml(request) {
  const response = await safeFetch(new Request(request, { cache: "reload" }));
  if (response && response.ok) return response;
  return offlineFallbackResponse(request);
}

function respondWithSafe(event, handlerPromise) {
  event.respondWith(
    Promise.resolve(handlerPromise).catch(() => offlineFallbackResponse(event.request)),
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") {
    respondWithSafe(event, safeFetch(req).then((r) => r || offlineFallbackResponse(req)));
    return;
  }
  let url;
  try {
    url = new URL(req.url);
  } catch (_e) {
    respondWithSafe(event, safeFetch(req).then((r) => r || offlineFallbackResponse(req)));
    return;
  }
  if (url.origin !== self.location.origin) {
    respondWithSafe(event, safeFetch(req).then((r) => r || offlineFallbackResponse(req)));
    return;
  }
  if (req.mode === "navigate") {
    respondWithSafe(event, networkOnlyHtml(req));
    return;
  }
  if (!shouldUseAssetCache(url)) {
    respondWithSafe(event, safeFetch(req).then((r) => r || offlineFallbackResponse(req)));
    return;
  }
  if (isBundledJsCss(url.pathname)) {
    respondWithSafe(event, networkFirstAsset(req));
    return;
  }
  if (isPwaBrandAsset(url.pathname)) {
    respondWithSafe(event, networkFirstBrandAsset(req));
    return;
  }
  if (isStaticImageAsset(url.pathname)) {
    if (isPaperDoodlePath(url.pathname)) {
      respondWithSafe(event, networkFirstBrandAsset(req));
      return;
    }
    if (isToolbarIconPath(url.pathname)) {
      respondWithSafe(event, staleWhileRevalidateToolbarIcon(req, event));
      return;
    }
    respondWithSafe(event, cacheFirstStaticAsset(req));
    return;
  }
  if (isFontPath(url.pathname)) {
    respondWithSafe(event, cacheFirstStaticAsset(req));
    return;
  }
  respondWithSafe(event, networkFirstAsset(req));
});
