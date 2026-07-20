/** 3분할 월별 캘린더 — 오늘 주가 보이도록 세로 스크롤만 (DOM 재그림 없음) */

function normYmd(v) {
  return String(v || "").trim().slice(0, 10);
}

function resolveCalendarMonthlyGridScrollEl(host) {
  if (!host) return null;
  if (host.classList?.contains("calendar-monthly-grid")) return host;
  return host.querySelector?.(
    ".calendar-monthly-grid:not(.calendar-monthly-grid--1week-timegrid)",
  );
}

function offsetTopWithinScrollContent(el, scroll) {
  let top = 0;
  let node = el;
  while (node && node !== scroll) {
    top += node.offsetTop;
    node = node.offsetParent;
  }
  if (node === scroll) return top;
  const scrollRect = scroll.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return elRect.top - scrollRect.top + scroll.scrollTop;
}

function isTargetVisibleInGrid(grid, targetEl) {
  const targetTop = offsetTopWithinScrollContent(targetEl, grid);
  const targetBottom = targetTop + (targetEl.offsetHeight || 0);
  const viewTop = grid.scrollTop;
  const viewBottom = viewTop + grid.clientHeight;
  return targetTop >= viewTop - 2 && targetBottom <= viewBottom + 2;
}

/** @param {HTMLElement | null | undefined} scrollOrHost @param {string} todayYmd @returns {boolean} */
export function scrollCalendarMonthlyGridToToday(scrollOrHost, todayYmd) {
  const ymd = normYmd(todayYmd);
  const grid = resolveCalendarMonthlyGridScrollEl(scrollOrHost);
  if (!grid || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  if (grid.clientHeight < 4) return false;

  const todayCell =
    grid.querySelector(".calendar-monthly-day.today") ||
    grid.querySelector(`.calendar-monthly-day[data-date="${ymd}"]`);
  if (!(todayCell instanceof HTMLElement)) return false;

  const weekWrap = todayCell.closest(".calendar-monthly-week-wrap");
  const targetEl = weekWrap instanceof HTMLElement ? weekWrap : todayCell;
  if (isTargetVisibleInGrid(grid, targetEl)) return true;

  try {
    targetEl.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    return true;
  } catch (_) {}

  const targetTop = offsetTopWithinScrollContent(targetEl, grid);
  const viewH = grid.clientHeight;
  const targetH = targetEl.offsetHeight || 0;
  const maxScroll = Math.max(0, grid.scrollHeight - viewH);
  const centered = targetTop - Math.max(0, (viewH - targetH) / 2);
  grid.scrollTop = Math.min(maxScroll, Math.max(0, centered));
  return true;
}

/** 레이아웃·막대 재측정 후에도 오늘 주로 스크롤 (깜빡임 없이 rAF만) */
export function scheduleScrollCalendarMonthlyGridToToday(scrollOrHost, todayYmd) {
  const ymd = normYmd(todayYmd);
  if (!scrollOrHost || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
  let attempts = 0;
  const tick = () => {
    attempts += 1;
    if (scrollCalendarMonthlyGridToToday(scrollOrHost, ymd)) return;
    if (attempts < 30) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** @param {HTMLElement} grid @param {() => void} fn */
export function bindCalendarMonthlyScrollTodayAfterLayout(grid, fn) {
  if (!(grid instanceof HTMLElement) || typeof fn !== "function") return;
  grid._lpAfterLayoutReveal = fn;
}
