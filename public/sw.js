/* PWA 서비스 워커 — 앱 설치·오프라인 */
/** index.html·manifest 의 ?v= 와 동일하게 유지 */
const PWA_BRAND = "doodle-logo-3";
/** 번들·아이콘 등 캐시 버전 (전략·브랜드 바꿀 때 올리면 이전 캐시 정리됨) */
const ASSET_CACHE = "tip-assets-v30";
/** HTML 셸 캐시 — 홈 화면에서 열 때 즉시 표시용 */
const HTML_CACHE = "tip-html-v5";

const PWA_BRAND_BASENAMES = new Set([
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
]);

function isPwaBrandAsset(pathname) {
  return PWA_BRAND_BASENAMES.has(pathname);
}

/** install 단계: PWA 설치 조건만 빠르게 — 887개 아이콘은 클라이언트 idle prefetch */
const PWA_INSTALL_CORE_PATHS = [
  `/manifest.json?v=${PWA_BRAND}`,
  `/icon-192.png?v=${PWA_BRAND}`,
  `/icon-512.png?v=${PWA_BRAND}`,
  `/icon-maskable-192.png?v=${PWA_BRAND}`,
  `/icon-maskable-512.png?v=${PWA_BRAND}`,
  `/apple-touch-icon.png?v=${PWA_BRAND}`,
  "/pwa-splash-512.png",
  "/pwa-splash-portrait-1080.png",
  "/pwa-splash-portrait-1170.png",
  "/pwa-splash-portrait-1179.png",
  "/pwa-splash-portrait-1284.png",
  "/toolbaricons/splash/splash-screen.png",
  "/fonts/LP-KyoboHandwriting2025.otf",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const htmlCache = await caches.open(HTML_CACHE);
        const shell = await fetch(
          new Request(self.location.origin + "/", { cache: "reload" }),
        );
        if (shell && shell.ok) {
          await htmlCache.put(new Request(self.location.origin + "/"), shell.clone());
        }
      } catch (_e) {}
      try {
        const assetCache = await caches.open(ASSET_CACHE);
        await Promise.all(
          PWA_INSTALL_CORE_PATHS.map(async (path) => {
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
              ((k.startsWith("organism-html-") || k.startsWith("tip-html-")) &&
                k !== HTML_CACHE),
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

/** manifest·홈 화면 아이콘 — 네트워크 우선(구 로고·구 이름 캐시 방지) */
async function networkFirstBrandAsset(request) {
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
  if (isPwaBrandAsset(url.pathname)) {
    event.respondWith(networkFirstBrandAsset(req));
    return;
  }
  if (isStaticImageAsset(url.pathname)) {
    event.respondWith(cacheFirstStaticAsset(req));
    return;
  }
  event.respondWith(networkFirstAsset(req));
});
