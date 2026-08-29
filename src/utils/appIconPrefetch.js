/**
 * 앱 정적 아이콘 — Service Worker 캐시에만 적재(화면에 <img> prefetch 금지: iOS·Android 메모리 폭주 방지)
 *
 * 과제·스탬프 picker(time-task-picker):
 * - 탭 진입 시 전량 받지 않음 → 기본+사용 중만 (`pickerIconCacheWarm`)
 * - 전량은 아이콘 선택 화면을 열 때만
 */
import appIconPrefetchPaths from "../../public/app-icon-prefetch.json";
import {
  SW_ASSET_CACHE,
  withToolbarIconCacheVersion,
} from "./toolbarIconUrl.js";

/** @deprecated import SW_ASSET_CACHE from toolbarIconUrl.js */
export { SW_ASSET_CACHE };

const CHUNK_SIZE = 20;
/** @type {Set<string>} */
const warmedPaths = new Set();

/** @type {Map<string, Promise<void>>} */
const tabWarmJobs = new Map();

let pickerIconsWarmStarted = false;

/** @param {string} tabId @returns {((path: string) => boolean) | null} */
function matcherForTab(tabId) {
  const id = String(tabId || "").trim();
  switch (id) {
    case "time":
      /* picker 전량은 선택 모달에서만 — 탭 진입 시 UI 아이콘만 */
      return (p) =>
        p.startsWith("/toolbaricons/menu-time") ||
        p.startsWith("/toolbaricons/time/") ||
        p === "/toolbaricons/menu-time.png";
    case "diary":
      return (p) => p.startsWith("/diary-tr-icons/");
    case "calendar":
    case "schedulecalendar":
      return (p) =>
        p.startsWith("/todo-card-icons/") ||
        p.startsWith("/todo-tab-icons/") ||
        p.startsWith("/toolbaricons/calendar") ||
        p.startsWith("/toolbaricons/menu-schedule") ||
        p.startsWith("/toolbaricons/menu-todo");
    case "dream":
      return (p) =>
        p.startsWith("/retrospect-kpi/") ||
        p.startsWith("/toolbaricons/menu-dream");
    case "health":
      return (p) =>
        p.startsWith("/retrospect-kpi/") ||
        p.startsWith("/toolbaricons/menu-health");
    case "happiness":
      return (p) =>
        p.startsWith("/retrospect-kpi/") ||
        p.startsWith("/toolbaricons/menu-happiness");
    case "sideincome":
      return (p) =>
        p.startsWith("/retrospect-kpi/") ||
        p.startsWith("/toolbaricons/menu-sideincome");
    case "idea":
      return (p) => p.startsWith("/toolbaricons/menu-account");
    case "home":
      return null;
    default:
      return null;
  }
}

function scheduleIdle(fn) {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(fn, { timeout: 4000 });
    return;
  }
  setTimeout(fn, 150);
}

/**
 * SW 디스크 캐시만 채움 — DOM Image() 로 디코딩하지 않음
 * @param {string} path
 */
export async function warmIconPathInSwCache(path) {
  const p = String(path || "").trim();
  if (!p || warmedPaths.has(p)) return;
  warmedPaths.add(p);
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(SW_ASSET_CACHE);
    const url = new URL(withToolbarIconCacheVersion(p), location.origin).href;
    const req = new Request(url);
    if (await cache.match(req)) return;
    const r = await fetch(req);
    if (r.ok) await cache.put(req, r.clone());
  } catch (_) {}
}

function warmPathsChunked(paths, startIndex = 0) {
  const list = Array.isArray(paths) ? paths : [];
  let i = startIndex;
  const end = Math.min(i + CHUNK_SIZE, list.length);
  const batch = [];
  for (; i < end; i++) batch.push(warmIconPathInSwCache(list[i]));
  void Promise.all(batch);
  if (i < list.length) {
    scheduleIdle(() => warmPathsChunked(list, i));
  }
}

/** 홈 메뉴·푸터 등 첫 화면에 필요한 아이콘만 즉시(소량) */
const CRITICAL_HOME_ICON_PATHS = [
  "/toolbaricons/dashboard.png",
  "/toolbaricons/menu-home/grid-icon-time.png",
  "/toolbaricons/menu-home/grid-icon-planner.png",
  "/toolbaricons/menu-home/grid-icon-sideincome.png",
  "/toolbaricons/menu-home/grid-icon-health.png",
  "/toolbaricons/menu-home/grid-icon-happiness.png",
  "/toolbaricons/menu-home/grid-icon-habit.png",
  "/toolbaricons/menu-home/grid-my-account.png",
  "/toolbaricons/menu-home/desktop-my-account.png",
  "/toolbaricons/menu-time.png",
  "/toolbaricons/menu-schedule.png",
  "/toolbaricons/caret-left-circle.png",
];

export function getAllAppIconPrefetchPaths() {
  return appIconPrefetchPaths;
}

export function prefetchCriticalAppIconAssets() {
  for (const path of CRITICAL_HOME_ICON_PATHS) {
    void warmIconPathInSwCache(path);
  }
}

/**
 * picker 아이콘 전량 — 아이콘 선택 모달을 열 때만 호출.
 * (탭 진입·모바일/데스크탑 공통으로 전량 미리받기는 하지 않음)
 */
export function warmTimeTaskPickerIconsOnce() {
  if (pickerIconsWarmStarted) return Promise.resolve();
  pickerIconsWarmStarted = true;
  const paths = appIconPrefetchPaths.filter((p) =>
    p.startsWith("/toolbaricons/time-task-picker/"),
  );
  return new Promise((resolve) => {
    scheduleIdle(() => {
      warmPathsChunked(paths);
      resolve();
    });
  });
}

function warmDefaultAndInUseForTab() {
  void import("./pickerIconCacheWarm.js")
    .then((m) => {
      m.warmDefaultAndInUsePickerIcons();
    })
    .catch(() => {});
}

/** @param {string} tabId */
export function prefetchIconsForTab(tabId) {
  const id = String(tabId || "").trim();
  if (!id || id === "home") return Promise.resolve();

  if (
    id === "time" ||
    id === "schedulecalendar" ||
    id === "calendar" ||
    id === "dream" ||
    id === "health" ||
    id === "happiness" ||
    id === "sideincome" ||
    id === "habittracker"
  ) {
    warmDefaultAndInUseForTab();
  }

  if (id === "schedulecalendar" || id === "calendar") {
    void import("./calendarDayIconsModel.js").then((m) => {
      m.warmCalendarDayStampIconAssetsFromMemory();
    });
  }

  const existing = tabWarmJobs.get(id);
  if (existing) return existing;

  const match = matcherForTab(id);
  if (!match) {
    const done = Promise.resolve();
    tabWarmJobs.set(id, done);
    return done;
  }

  const paths = appIconPrefetchPaths.filter((p) => match(p));
  const job = new Promise((resolve) => {
    scheduleIdle(() => {
      warmPathsChunked(paths);
      resolve();
    });
  });
  tabWarmJobs.set(id, job);
  return job;
}

/** @deprecated 기동 시 전량 prefetch — 사용 금지. 호환용으로 critical 만 */
export function prefetchAppIconAssets() {
  prefetchCriticalAppIconAssets();
}
