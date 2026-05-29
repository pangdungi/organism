/**
 * 앱 정적 아이콘 prefetch — 탭 진입 시에만 해당 경로(전량 887장 기동 prefetch 금지)
 */
import appIconPrefetchPaths from "../../public/app-icon-prefetch.json";

const CHUNK_SIZE = 24;
/** @type {Set<string>} */
const prefetchedPaths = new Set();

/** @type {Map<string, Promise<void>>} */
const tabPrefetchJobs = new Map();

/** @param {string} tabId @returns {((path: string) => boolean) | null} */
function matcherForTab(tabId) {
  const id = String(tabId || "").trim();
  switch (id) {
    case "time":
      return (p) => p.startsWith("/toolbaricons/time-task-picker/");
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
    requestIdleCallback(fn, { timeout: 3000 });
    return;
  }
  setTimeout(fn, 120);
}

function prefetchPath(path) {
  if (!path || prefetchedPaths.has(path)) return;
  prefetchedPaths.add(path);
  const img = new Image();
  img.decoding = "async";
  img.src = path;
}

function prefetchPathsChunked(paths, startIndex = 0) {
  const list = Array.isArray(paths) ? paths : [];
  let i = startIndex;
  const end = Math.min(i + CHUNK_SIZE, list.length);
  for (; i < end; i++) prefetchPath(list[i]);
  if (i < list.length) {
    scheduleIdle(() => prefetchPathsChunked(list, i));
  }
}

/** 홈 메뉴·푸터 등 첫 화면에 필요한 아이콘만 즉시(소량) */
const CRITICAL_HOME_ICON_PATHS = [
  "/toolbaricons/dashboard.svg",
  "/toolbaricons/menu-home/mainlogo-new.svg",
  "/toolbaricons/menu-home-calendar-time.png",
  "/toolbaricons/menu-home-calendar.png",
  "/toolbaricons/menu-home-account.png",
  "/toolbaricons/menu-home/dream-new.svg",
  "/toolbaricons/menu-home/sideincome-new.svg",
  "/toolbaricons/menu-home/health-new.svg",
  "/toolbaricons/menu-home/happiness-new.svg",
  "/toolbaricons/menu-time.png",
  "/toolbaricons/menu-schedule.png",
  "/toolbaricons/caret-left-circle.svg",
];

export function getAllAppIconPrefetchPaths() {
  return appIconPrefetchPaths;
}

export function prefetchCriticalAppIconAssets() {
  for (const path of CRITICAL_HOME_ICON_PATHS) {
    prefetchPath(path);
  }
}

/** @param {string} tabId */
export function prefetchIconsForTab(tabId) {
  const id = String(tabId || "").trim();
  if (!id || id === "home") return Promise.resolve();
  const existing = tabPrefetchJobs.get(id);
  if (existing) return existing;

  const match = matcherForTab(id);
  if (!match) {
    const done = Promise.resolve();
    tabPrefetchJobs.set(id, done);
    return done;
  }

  const paths = appIconPrefetchPaths.filter((p) => match(p));
  const job = new Promise((resolve) => {
    scheduleIdle(() => {
      prefetchPathsChunked(paths);
      resolve();
    });
  });
  tabPrefetchJobs.set(id, job);
  return job;
}

/** @deprecated 기동 시 전량 prefetch — 사용 금지. 호환용으로 critical 만 */
export function prefetchAppIconAssets() {
  prefetchCriticalAppIconAssets();
}
