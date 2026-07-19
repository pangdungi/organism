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

  if (isCurrentMonth) {
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

/** @param {HTMLElement | null | undefined} scrollOrHost @param {string} todayYmd */
export function scheduleScrollHabitTrackerToToday(scrollOrHost, todayYmd) {
  const ymd = normYmd(todayYmd);
  if (!scrollOrHost || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
  let attempts = 0;
  const maxAttempts = 16;
  const tick = () => {
    attempts += 1;
    const done = applyScrollHabitTrackerToToday(scrollOrHost, ymd);
    if (!done && attempts < maxAttempts) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

/** @returns {boolean} true when scroll applied or nothing left to try */
function applyScrollHabitTrackerToToday(scrollOrHost, todayYmd) {
  const ymd = normYmd(todayYmd);
  const scroll = resolveHabitTrackerGridScrollEl(scrollOrHost);
  if (!scroll || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return true;

  const todayHead = scroll.querySelector(
    `.habit-tracker-page-grid-th--day[data-ymd="${ymd}"]`,
  );
  if (!(todayHead instanceof HTMLElement)) return true;

  if (scroll.clientWidth < 4) return false;

  const habitHead = scroll.querySelector(".habit-tracker-page-grid-th--habit");
  const stickyW =
    habitHead instanceof HTMLElement
      ? habitHead.getBoundingClientRect().width
      : 0;

  const scrollRect = scroll.getBoundingClientRect();
  const headRect = todayHead.getBoundingClientRect();
  const dateViewportLeft = scrollRect.left + stickyW + 2;
  const dateViewportWidth = Math.max(
    1,
    scroll.clientWidth - stickyW - 4,
  );
  const headCenter = headRect.left + headRect.width / 2;
  const targetCenter = dateViewportLeft + dateViewportWidth / 2;
  const delta = headCenter - targetCenter;

  if (Math.abs(delta) < 1) return true;

  const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
  scroll.scrollLeft = Math.min(
    maxScroll,
    Math.max(0, scroll.scrollLeft + delta),
  );

  const headRectAfter = todayHead.getBoundingClientRect();
  const scrollRectAfter = scroll.getBoundingClientRect();
  const headCenterAfter = headRectAfter.left + headRectAfter.width / 2;
  const targetCenterAfter =
    scrollRectAfter.left + stickyW + 2 + dateViewportWidth / 2;
  return Math.abs(headCenterAfter - targetCenterAfter) < 2;
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
