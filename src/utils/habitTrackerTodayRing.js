/**
 * 홈 3분할 습관 트랙커 — 오늘 KPI(루틴) 완료 원형 링
 */

import {
  buildHabitTrackerRows,
  getHabitTrackerCellDisplay,
  getHabitTrackerCellText,
} from "./habitTrackerPageModel.js";
import { timeLedgerLocalTodayYmd } from "./timeLedgerEntriesSupabase.js";

/**
 * @param {{ skipSync?: boolean }} [opts]
 * @returns {{ done: number, total: number, remaining: number, pct: number, todayYmd: string }}
 */
export function buildHabitTrackerTodayDailyRingModel(opts = {}) {
  const todayYmd = timeLedgerLocalTodayYmd();
  const parts = String(todayYmd || "").split("-");
  const year = Number(parts[0]) || new Date().getFullYear();
  const month = Number(parts[1]) || new Date().getMonth() + 1;
  const rows = buildHabitTrackerRows(year, month, {
    skipSync: opts.skipSync !== false,
  });

  let done = 0;
  let total = 0;
  for (const row of rows) {
    if (row?.kind !== "kpi" || !row.kpi) continue;
    const cell = getHabitTrackerCellDisplay(row, todayYmd);
    if (cell.beforeStart) continue;
    total += 1;
    /*
     * 잔디 진하기(매일할일 전부 완료)가 아니라,
     * 오늘 해당 루틴에 시간기록·체크·값이 있으면 카운트 (표의 O와 동일)
     */
    if (String(getHabitTrackerCellText(row, todayYmd) || "").trim()) done += 1;
  }

  const remaining = Math.max(0, total - done);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, remaining, pct, todayYmd };
}

/**
 * @param {{ done: number, total: number, remaining: number, pct: number }} model
 */
export function createHabitTrackerTodayRingElement(model) {
  const done = Math.max(0, Number(model?.done) || 0);
  const total = Math.max(0, Number(model?.total) || 0);
  const remaining = Math.max(0, Number(model?.remaining) || 0);
  const pct = total > 0 ? Math.max(0, Math.min(100, Number(model?.pct) || 0)) : 0;

  const wrap = document.createElement("div");
  wrap.className = "habit-tracker-today-ring";
  wrap.setAttribute("aria-label", `오늘 루틴 ${done} / ${total}`);

  const size = 112;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = total > 0 ? c * (1 - pct / 100) : c;

  wrap.innerHTML = `
    <div class="habit-tracker-today-ring-visual">
      <svg class="habit-tracker-today-ring-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
        <circle class="habit-tracker-today-ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" />
        <circle class="habit-tracker-today-ring-progress" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
          stroke-linecap="round"
          stroke-dasharray="${c.toFixed(2)}"
          stroke-dashoffset="${offset.toFixed(2)}"
          transform="rotate(-90 ${size / 2} ${size / 2})" />
      </svg>
      <div class="habit-tracker-today-ring-center">
        <span class="habit-tracker-today-ring-done">${done}</span>
        <span class="habit-tracker-today-ring-total">/ ${total}</span>
      </div>
    </div>
    <p class="habit-tracker-today-ring-summary">${pct}% · ${remaining}개 남음</p>
  `;
  return wrap;
}
