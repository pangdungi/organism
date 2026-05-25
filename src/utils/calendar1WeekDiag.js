/**
 * 캘린더 1주(W) 뷰 진단 — 로컬에서 W 진입·그리기 경로 추적용
 * 끄기: localStorage.setItem('debug_calendar_1week','0')
 */

const FLAG = "debug_calendar_1week";
const PREFIX = "[cal-1week]";

export function calendar1WeekDiagEnabled() {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(FLAG) === "0") {
      return false;
    }
  } catch (_) {}
  return true;
}

export function calendar1WeekDiagLog(tag, payload) {
  if (!calendar1WeekDiagEnabled()) return;
  if (payload === undefined) {
    console.log(PREFIX, tag);
    return;
  }
  console.log(PREFIX, tag, payload);
}

function measureEl(el, name) {
  if (!el) return { name, missing: true };
  let rect = { width: 0, height: 0 };
  try {
    rect = el.getBoundingClientRect();
  } catch (_) {}
  let cs = null;
  try {
    cs = getComputedStyle(el);
  } catch (_) {}
  return {
    name,
    w: Math.round(rect.width),
    h: Math.round(rect.height),
    visibility: cs?.visibility || "",
    display: cs?.display || "",
    opacity: cs?.opacity || "",
    classes: el.className || "",
  };
}

/** 1주 격자·스트립·스크롤·layout-pending 상태 스냅샷 */
export function calendar1WeekDiagSnapshot(root, label = "snapshot") {
  if (!calendar1WeekDiagEnabled()) return null;
  const scope =
    root?.querySelector?.(".calendar-monthly-layout") ||
    root?.closest?.(".calendar-monthly-layout") ||
    root ||
    document;
  const grid = scope.querySelector?.(".calendar-monthly-grid--1week-timegrid");
  const snap = {
    label,
    ts: Date.now(),
    grid: measureEl(grid, "grid"),
    strip: measureEl(scope.querySelector?.(".calendar-1week-strip-header"), "strip"),
    scroll: measureEl(scope.querySelector?.(".calendar-1week-google-scroll"), "scroll"),
    body: measureEl(scope.querySelector?.(".calendar-1week-google-body"), "body"),
    cards: scope.querySelectorAll?.(".calendar-1week-flow-card")?.length ?? 0,
    bars: scope.querySelectorAll?.(".calendar-monthly-span-bar")?.length ?? 0,
    layoutPending: !!grid?.classList?.contains("calendar-monthly-grid--layout-pending"),
    layoutReady: !!grid?.classList?.contains("calendar-monthly-grid--layout-ready"),
  };
  calendar1WeekDiagLog("snapshot", snap);
  return snap;
}

calendar1WeekDiagLog("diag module loaded");
