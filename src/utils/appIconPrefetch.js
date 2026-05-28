/**
 * 앱 정적 아이콘 prefetch — 기동 직후 887장 sync 디코드는 메인 스레드 멈춤 유발
 * 목록: public/app-icon-prefetch.json
 */
import appIconPrefetchPaths from "../../public/app-icon-prefetch.json";

const CHUNK_SIZE = 32;
let prefetchScheduled = false;

export function getAllAppIconPrefetchPaths() {
  return appIconPrefetchPaths;
}

function scheduleIdle(fn) {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(fn, { timeout: 4000 });
    return;
  }
  setTimeout(fn, 150);
}

function prefetchPathsChunked(paths, startIndex = 0) {
  const list = Array.isArray(paths) ? paths : [];
  let i = startIndex;
  const end = Math.min(i + CHUNK_SIZE, list.length);
  for (; i < end; i++) {
    const img = new Image();
    img.decoding = "async";
    img.src = list[i];
  }
  if (i < list.length) {
    scheduleIdle(() => prefetchPathsChunked(list, i));
  }
}

/** 홈 메뉴·푸터 등 첫 화면에 필요한 아이콘만 즉시(소량) */
const CRITICAL_HOME_ICON_PATHS = [
  "/toolbaricons/dashboard.svg",
  "/toolbaricons/menu-time.png",
  "/toolbaricons/menu-time-report.png",
  "/toolbaricons/menu-schedule.png",
  "/toolbaricons/menu-stamp.png",
  "/toolbaricons/menu-todo.png",
  "/toolbaricons/menu-dream.png",
  "/toolbaricons/menu-sideincome.png",
  "/toolbaricons/menu-health.png",
  "/toolbaricons/menu-happiness.png",
  "/toolbaricons/menu-account.png",
  "/toolbaricons/caret-left-circle.svg",
];

export function prefetchCriticalAppIconAssets() {
  for (const path of CRITICAL_HOME_ICON_PATHS) {
    const img = new Image();
    img.decoding = "async";
    img.src = path;
  }
}

/** 전체 목록 — idle 에서 청크 단위(메인 프레임 블로킹 방지) */
export function prefetchAppIconAssets() {
  if (prefetchScheduled) return;
  prefetchScheduled = true;
  prefetchCriticalAppIconAssets();
  scheduleIdle(() => prefetchPathsChunked(appIconPrefetchPaths));
}
