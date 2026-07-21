/**
 * 해빗 트랙커 — 월간 격자 DOM
 */

import {
  buildHabitTrackerPageModel,
  formatHabitTrackerMonthCornerLabel,
  getHabitTrackerCellDisplay,
} from "./habitTrackerPageModel.js";
import { shiftMonthYear } from "./kpiHabitTrackerStartDate.js";

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
  const wrap = document.createElement("div");
  wrap.className = "habit-tracker-page-grid-wrap";

  const scroll = document.createElement("div");
  scroll.className = "habit-tracker-page-grid-scroll";

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
  scroll.appendChild(monthNav);

  const table = document.createElement("table");
  table.className = "habit-tracker-page-grid-table";
  table.setAttribute("role", "grid");
  table.setAttribute("aria-label", "루틴 트랙커");
  table.style.setProperty("--ht-day-cols", String(model.dateKeys.length || 1));

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
      td.dataset.ymd = dk;
      const { text, beforeStart, level } = getHabitTrackerCellDisplay(row, dk);
      const tip = text ? `${dk} · ${text}` : dk;
      td.title = tip;
      td.setAttribute("aria-label", tip);
      if (beforeStart) {
        td.classList.add("habit-tracker-page-grid-cell--before-start");
      } else if (level > 0) {
        td.classList.add(
          "habit-tracker-page-grid-cell--ok",
          `habit-tracker-page-grid-cell--lv${level}`,
        );
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  scroll.appendChild(table);
  wrap.appendChild(scroll);

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

/** 화면 너비에 맞춤 — 가로 스크롤 없음. 오늘 칸만 확인 */
export function scrollHabitTrackerToToday(scrollOrHost, todayYmd) {
  const ymd = normYmd(todayYmd);
  const scroll = resolveHabitTrackerGridScrollEl(scrollOrHost);
  if (!scroll || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  return !!scroll.querySelector(
    `.habit-tracker-page-grid-td--cell[data-ymd="${ymd}"]`,
  );
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
