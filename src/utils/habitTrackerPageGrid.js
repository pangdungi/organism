/**
 * 해빗 트랙커 — 월간 격자 DOM
 */

import {
  buildHabitTrackerPageModel,
  formatHabitTrackerDayColLabel,
  formatHabitTrackerMonthCornerLabel,
  getHabitTrackerCellDisplay,
} from "./habitTrackerPageModel.js";
import { shiftMonthYear } from "./kpiHabitTrackerStartDate.js";
import { timeLedgerLocalTodayYmd } from "./timeLedgerEntriesSupabase.js";

/**
 * @param {{
 *   year?: number,
 *   month?: number,
 *   todayYmd?: string,
 *   onMonthChange?: (next: { year: number, month: number }) => void | Promise<void>,
 *   skipSync?: boolean,
 *   autoScrollToday?: boolean,
 * }} [opts]
 * @returns {HTMLDivElement}
 */
export function createHabitTrackerPageGridElement(opts = {}) {
  const refDate = new Date();
  const year = Number.isFinite(Number(opts.year))
    ? Number(opts.year)
    : refDate.getFullYear();
  const month = Number.isFinite(Number(opts.month))
    ? Number(opts.month)
    : refDate.getMonth() + 1;

  const model = buildHabitTrackerPageModel({
    year,
    month,
    skipSync: !!opts.skipSync,
  });
  const todayYmd = normYmd(opts.todayYmd || timeLedgerLocalTodayYmd());
  const isCurrentMonth =
    year === refDate.getFullYear() && month === refDate.getMonth() + 1;

  const wrap = document.createElement("div");
  wrap.className = "habit-tracker-page-grid-wrap";

  const scroll = document.createElement("div");
  scroll.className = "habit-tracker-page-grid-scroll";

  const table = document.createElement("table");
  table.className = "habit-tracker-page-grid-table";
  table.setAttribute("role", "grid");
  table.setAttribute("aria-label", "해빗 트랙커");

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const cornerTh = document.createElement("th");
  cornerTh.className =
    "habit-tracker-page-grid-th habit-tracker-page-grid-th--habit habit-tracker-page-grid-th--year";
  cornerTh.scope = "row";

  const monthNav = document.createElement("div");
  monthNav.className = "habit-tracker-page-grid-month-nav";
  monthNav.setAttribute("role", "group");
  monthNav.setAttribute(
    "aria-label",
    `${formatHabitTrackerMonthCornerLabel(year, month)} 월 이동`,
  );

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "habit-tracker-page-grid-month-nav-btn";
  prevBtn.textContent = "‹";
  prevBtn.setAttribute("aria-label", "이전 달");
  prevBtn.addEventListener("click", () => {
    void handleMonthShift(-1);
  });

  const monthLabel = document.createElement("span");
  monthLabel.className = "habit-tracker-page-grid-month-nav-label";
  monthLabel.textContent = formatHabitTrackerMonthCornerLabel(year, month);

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "habit-tracker-page-grid-month-nav-btn";
  nextBtn.textContent = "›";
  nextBtn.setAttribute("aria-label", "다음 달");
  nextBtn.addEventListener("click", () => {
    void handleMonthShift(1);
  });

  monthNav.append(prevBtn, monthLabel, nextBtn);
  cornerTh.appendChild(monthNav);
  headRow.appendChild(cornerTh);

  for (const dk of model.dateKeys) {
    const th = document.createElement("th");
    th.className = "habit-tracker-page-grid-th habit-tracker-page-grid-th--day";
    th.dataset.ymd = dk;
    th.textContent = formatHabitTrackerDayColLabel(dk);
    th.title = dk;
    if (isCurrentMonth && dk === todayYmd) {
      th.classList.add("habit-tracker-page-grid-th--today");
    }
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of model.rows) {
    const tr = document.createElement("tr");
    const tdName = document.createElement("td");
    tdName.className =
      "habit-tracker-page-grid-td habit-tracker-page-grid-td--habit";
    tdName.textContent = row.label;
    tr.appendChild(tdName);

    for (const dk of model.dateKeys) {
      const td = document.createElement("td");
      td.className =
        "habit-tracker-page-grid-td habit-tracker-page-grid-td--cell";
      const { text, beforeStart } = getHabitTrackerCellDisplay(row, dk);
      td.textContent = text;
      if (beforeStart) {
        td.classList.add("habit-tracker-page-grid-cell--before-start");
      } else if (text === "O") {
        td.classList.add("habit-tracker-page-grid-cell--ok");
      } else if (text) {
        td.classList.add("habit-tracker-page-grid-cell--value");
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  scroll.appendChild(table);
  wrap.appendChild(scroll);

  const autoScrollToday = opts.autoScrollToday !== false;
  if (isCurrentMonth && autoScrollToday) {
    scheduleScrollHabitTrackerToToday(scroll, todayYmd);
  }

  async function handleMonthShift(delta) {
    if (typeof opts.onMonthChange !== "function") return;
    const next = shiftMonthYear(year, month, delta);
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    try {
      await opts.onMonthChange(next);
    } finally {
      prevBtn.disabled = false;
      nextBtn.disabled = false;
    }
  }

  return wrap;
}

/** @param {HTMLElement | null | undefined} scrollOrHost @param {string} todayYmd @returns {boolean} */
export function scrollHabitTrackerToToday(scrollOrHost, todayYmd) {
  const ymd = normYmd(todayYmd);
  const scroll = resolveHabitTrackerGridScrollEl(scrollOrHost);
  if (!scroll || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;

  const todayHead = scroll.querySelector(
    `.habit-tracker-page-grid-th--day[data-ymd="${ymd}"]`,
  );
  if (!(todayHead instanceof HTMLElement)) return false;
  if (scroll.clientWidth < 4) return false;

  const habitHead = scroll.querySelector(".habit-tracker-page-grid-th--habit");
  const stickyW =
    habitHead instanceof HTMLElement ? habitHead.offsetWidth : 0;
  const dayW = todayHead.offsetWidth || 0;
  const dayLeft = offsetLeftWithinScrollContent(todayHead, scroll);
  const viewW = Math.max(1, scroll.clientWidth - stickyW - 4);
  const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
  const target =
    dayLeft - stickyW - Math.max(0, (viewW - dayW) / 2);
  scroll.scrollLeft = Math.min(maxScroll, Math.max(0, target));
  return true;
}

/** 레이아웃 확정 후 1~2회만 시도 (3분할 embed — 연속 rAF 스크롤로 깜빡임 방지) */
export function scheduleScrollHabitTrackerToToday(scrollOrHost, todayYmd) {
  const ymd = normYmd(todayYmd);
  if (!scrollOrHost || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
  let attempts = 0;
  const tick = () => {
    attempts += 1;
    if (scrollHabitTrackerToToday(scrollOrHost, ymd)) return;
    if (attempts < 2) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function offsetLeftWithinScrollContent(el, scroll) {
  let left = 0;
  let node = el;
  while (node && node !== scroll) {
    left += node.offsetLeft;
    node = node.offsetParent;
  }
  if (node === scroll) return left;
  const scrollRect = scroll.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return elRect.left - scrollRect.left + scroll.scrollLeft;
}

function resolveHabitTrackerGridScrollEl(scrollOrHost) {
  if (!(scrollOrHost instanceof HTMLElement)) return null;
  if (scrollOrHost.classList.contains("habit-tracker-page-grid-scroll")) {
    return scrollOrHost;
  }
  const nested = scrollOrHost.querySelector(".habit-tracker-page-grid-scroll");
  return nested instanceof HTMLElement ? nested : null;
}

function normYmd(v) {
  return String(v || "")
    .replace(/\//g, "-")
    .slice(0, 10);
}
