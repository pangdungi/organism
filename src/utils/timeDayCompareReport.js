/**
 * 하루 레포트 — 어제 vs 오늘 과제별 시간 비교(그래프)
 */

import {
  formatIntegerMinutesDurationKo,
  parseTimeToHours,
} from "../views/Time.js";
import {
  SLEEP_BUILTIN_TASK_NAME,
  WORK_BUILTIN_TASK_NAME,
} from "./timeTaskOptionsConstants.js";

function normYmd(v) {
  return String(v || "")
    .replace(/\//g, "-")
    .slice(0, 10);
}

function localTodayYmd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shiftYmdTenByDays(ymdTen, deltaDays) {
  const s = normYmd(ymdTen);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, mo, d] = s.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function rowMinutes(r) {
  const hrs = parseTimeToHours(r?.timeTracked);
  if (!(hrs > 0) || !Number.isFinite(hrs)) return 0;
  return Math.round(hrs * 60);
}

function filterRowsForYmd(allRows, ymd) {
  const key = normYmd(ymd);
  return (Array.isArray(allRows) ? allRows : []).filter((r) => {
    const d = String(r?.date || "")
      .replace(/\//g, "-")
      .slice(0, 10);
    return d === key;
  });
}

/** 이틀만 한 번에 거름 (전체 배열 2번 스캔 방지) */
function filterRowsForTwoYmds(allRows, ymdA, ymdB) {
  const a = normYmd(ymdA);
  const b = normYmd(ymdB);
  /** @type {object[]} */
  const rowsA = [];
  /** @type {object[]} */
  const rowsB = [];
  for (const r of Array.isArray(allRows) ? allRows : []) {
    const d = String(r?.date || "")
      .replace(/\//g, "-")
      .slice(0, 10);
    if (d === a) rowsA.push(r);
    else if (d === b) rowsB.push(r);
  }
  return { rowsA, rowsB };
}

/** @param {object[]} rows @returns {Map<string, number>} */
function taskMinutesMap(rows) {
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const r of rows) {
    const mins = rowMinutes(r);
    if (mins <= 0) continue;
    const name = String(r?.taskName || "").trim() || "(제목 없음)";
    map.set(name, (map.get(name) || 0) + mins);
  }
  return map;
}

function taskSortRank(name) {
  if (name === WORK_BUILTIN_TASK_NAME) return 0;
  if (name === SLEEP_BUILTIN_TASK_NAME) return 1;
  return 10;
}

function dur(mins) {
  return formatIntegerMinutesDurationKo(Math.max(0, Math.round(Number(mins) || 0)));
}

export function formatDayCompareDelta(deltaMin) {
  const n = Math.round(Number(deltaMin) || 0);
  if (n === 0) return "동일";
  const abs = dur(Math.abs(n));
  return n > 0 ? `+${abs}` : `−${abs}`;
}

/**
 * @param {string} dayYmd
 * @param {object[]} allRows
 */
export function buildDayTaskCompareReport(dayYmd, allRows) {
  const cur = normYmd(dayYmd);
  const prev = shiftYmdTenByDays(cur, -1);
  const isToday = cur === localTodayYmd();
  const prevLabel = isToday ? "어제" : "전날";
  const curLabel = isToday ? "오늘" : "이날";

  const { rowsA: prevRows, rowsB: curRows } = filterRowsForTwoYmds(
    allRows,
    prev,
    cur,
  );
  const prevMap = taskMinutesMap(prevRows);
  const curMap = taskMinutesMap(curRows);

  const names = new Set([...prevMap.keys(), ...curMap.keys()]);
  /** @type {Array<{ taskName: string, prevMin: number, curMin: number, deltaMin: number }>} */
  const tasks = [...names]
    .map((taskName) => {
      const prevMin = prevMap.get(taskName) || 0;
      const curMin = curMap.get(taskName) || 0;
      return {
        taskName,
        prevMin,
        curMin,
        deltaMin: curMin - prevMin,
      };
    })
    .filter((t) => t.prevMin > 0 || t.curMin > 0)
    .sort((a, b) => {
      const ra = taskSortRank(a.taskName);
      const rb = taskSortRank(b.taskName);
      if (ra !== rb) return ra - rb;
      const maxA = Math.max(a.prevMin, a.curMin);
      const maxB = Math.max(b.prevMin, b.curMin);
      if (maxB !== maxA) return maxB - maxA;
      return a.taskName.localeCompare(b.taskName, "ko");
    });

  const scaleMaxMin = Math.max(
    60,
    ...tasks.map((t) => Math.max(t.prevMin, t.curMin)),
  );

  return {
    dayYmd: cur,
    prevYmd: prev,
    prevLabel,
    curLabel,
    hasData: tasks.length > 0,
    scaleMaxMin,
    tasks,
  };
}

const PREV_BAR_COLOR = "#B0B0B0";
const CUR_BAR_COLOR = "#000000";

/**
 * @param {HTMLElement} parent
 * @param {ReturnType<typeof buildDayTaskCompareReport>} report
 */
export function renderDayTaskCompareChart(parent, report) {
  if (!(parent instanceof HTMLElement) || !report) return;

  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-day-task-compare";
  const prevL = report.prevLabel || "어제";
  const curL = report.curLabel || "오늘";
  const prevCode = prevL.charCodeAt(prevL.length - 1);
  const wa =
    prevCode >= 0xac00 &&
    prevCode <= 0xd7a3 &&
    (prevCode - 0xac00) % 28 > 0
      ? "과"
      : "와";
  wrap.setAttribute("aria-label", `${prevL}${wa} ${curL} 과제별 시간 비교`);

  const legend = document.createElement("div");
  legend.className = "lp-tr2-day-task-compare-legend";
  legend.innerHTML = [
    `<span class="lp-tr2-day-task-compare-swatch" style="background:${PREV_BAR_COLOR}"></span><span>${report.prevLabel}</span>`,
    `<span class="lp-tr2-day-task-compare-swatch" style="background:${CUR_BAR_COLOR}"></span><span>${report.curLabel}</span>`,
  ].join("");
  wrap.appendChild(legend);

  if (!report.tasks.length) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-chart-note";
    empty.textContent = "비교할 시간 기록이 없습니다.";
    wrap.appendChild(empty);
    parent.appendChild(wrap);
    return;
  }

  const list = document.createElement("div");
  list.className = "lp-tr2-day-task-compare-list";
  const scale = Math.max(1, report.scaleMaxMin);

  for (const item of report.tasks) {
    const row = document.createElement("div");
    row.className = "lp-tr2-day-task-compare-row";

    const head = document.createElement("div");
    head.className = "lp-tr2-day-task-compare-head";

    const name = document.createElement("span");
    name.className = "lp-tr2-day-task-compare-name";
    name.textContent = item.taskName;

    const delta = document.createElement("span");
    delta.className = "lp-tr2-day-task-compare-delta";
    if (item.deltaMin > 0) delta.classList.add("is-up");
    else if (item.deltaMin < 0) delta.classList.add("is-down");
    else delta.classList.add("is-same");
    delta.textContent = formatDayCompareDelta(item.deltaMin);

    head.append(name, delta);

    const meta = document.createElement("p");
    meta.className = "lp-tr2-day-task-compare-meta";
    meta.textContent = `${report.prevLabel} ${dur(item.prevMin)} → ${report.curLabel} ${dur(item.curMin)}`;

    const bars = document.createElement("div");
    bars.className = "lp-tr2-day-task-compare-bars";

    const prevTrack = document.createElement("div");
    prevTrack.className = "lp-tr2-day-task-compare-bar";
    const prevFill = document.createElement("div");
    prevFill.className = "lp-tr2-day-task-compare-bar-fill is-prev";
    prevFill.style.width = `${Math.min(100, (item.prevMin / scale) * 100)}%`;
    prevFill.style.background = PREV_BAR_COLOR;
    prevTrack.appendChild(prevFill);

    const curTrack = document.createElement("div");
    curTrack.className = "lp-tr2-day-task-compare-bar";
    const curFill = document.createElement("div");
    curFill.className = "lp-tr2-day-task-compare-bar-fill is-cur";
    curFill.style.width = `${Math.min(100, (item.curMin / scale) * 100)}%`;
    curFill.style.background = CUR_BAR_COLOR;
    curTrack.appendChild(curFill);

    bars.append(prevTrack, curTrack);
    row.append(head, meta, bars);
    list.appendChild(row);
  }

  wrap.appendChild(list);
  parent.appendChild(wrap);
}
