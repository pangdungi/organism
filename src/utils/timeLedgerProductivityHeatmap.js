/** 시간가계부 타임박스뷰 — 다일 조회: 12개월×일자 세로 잔디형 생산성 히트맵 */

import { showToast } from "./showToast.js";

const MAX_DAYS_IN_MONTH = 31;

function parseYmd(ymd) {
  const s = String(ymd || "").trim().slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return {
    y: parseInt(m[1], 10),
    mo: parseInt(m[2], 10) - 1,
    d: parseInt(m[3], 10),
  };
}

function daysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function yearsInRange(startYmd, endYmd) {
  const s = parseYmd(startYmd);
  const e = parseYmd(endYmd);
  if (!s || !e) return [new Date().getFullYear()];
  const out = [];
  for (let y = s.y; y <= e.y; y++) out.push(y);
  return out.length ? out : [new Date().getFullYear()];
}

/** 0~4 — 기록 없음 / 생산적 시간 비율 */
export function productivityLevelFromPct(pct) {
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return 0;
  if (pct < 25) return 1;
  if (pct < 50) return 2;
  if (pct < 75) return 3;
  return 4;
}

function isYmdInRange(ymd, startYmd, endYmd) {
  const d = String(ymd || "").slice(0, 10);
  const s = String(startYmd || "").slice(0, 10);
  const e = String(endYmd || "").slice(0, 10);
  if (!d || !s || !e) return true;
  return d >= s && d <= e;
}

function buildMonthDayRowsForYear(year) {
  const rows = [];
  for (let mo = 0; mo < 12; mo++) {
    const dayCount = daysInMonth(year, mo);
    const cells = [];
    for (let day = 1; day <= MAX_DAYS_IN_MONTH; day++) {
      if (day <= dayCount) {
        const ymd = `${year}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        cells.push(ymd);
      } else {
        cells.push(null);
      }
    }
    rows.push({ month: mo + 1, cells });
  }
  return rows;
}

function formatPctKo(pct) {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${Math.round(pct)}%`;
}

function formatHoursBrief(hrs) {
  const h = Number(hrs) || 0;
  if (h <= 0) return "0분";
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (hh === 0) return `${mm}분`;
  if (mm === 0) return `${hh}시간`;
  return `${hh}시간 ${mm}분`;
}

function showHeatmapDayInfo(ymd, stat) {
  if (!stat || !(stat.totalHrs > 0)) {
    showToast(ymd.replace(/-/g, "."), "이 날 시간 기록이 없습니다.");
    return;
  }
  const lines = [
    `생산적 ${formatPctKo(stat.pct)} (${formatHoursBrief(stat.productiveHrs)} / ${formatHoursBrief(stat.totalHrs)})`,
  ];
  if (stat.nonproductiveHrs > 0) {
    lines.push(`비생산적 ${formatHoursBrief(stat.nonproductiveHrs)}`);
  }
  if (stat.otherHrs > 0) {
    lines.push(`그 외 ${formatHoursBrief(stat.otherHrs)}`);
  }
  showToast(ymd.replace(/-/g, "."), lines.join("\n"));
}

function appendHeatmapCell(rowEl, ymd, { rangeStartYmd, rangeEndYmd, dayProductivityMap }) {
  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = "time-ledger-productivity-heatmap-cell";

  if (!ymd) {
    cell.classList.add("time-ledger-productivity-heatmap-cell--empty");
    cell.disabled = true;
    cell.tabIndex = -1;
    rowEl.appendChild(cell);
    return;
  }

  const inRange = isYmdInRange(ymd, rangeStartYmd, rangeEndYmd);
  const stat = dayProductivityMap?.get?.(ymd) || null;
  const level = inRange ? productivityLevelFromPct(stat?.pct) : 0;

  cell.dataset.ymd = ymd;
  cell.classList.add(`time-ledger-productivity-heatmap-cell--lv${level}`);
  if (!inRange) {
    cell.classList.add("time-ledger-productivity-heatmap-cell--out-range");
  } else if (!stat || !(stat.totalHrs > 0)) {
    cell.classList.add("time-ledger-productivity-heatmap-cell--no-data");
  }

  const pctLabel = stat && stat.totalHrs > 0 ? formatPctKo(stat.pct) : "기록 없음";
  cell.title = inRange ? `${ymd} · 생산적 ${pctLabel}` : `${ymd}`;
  cell.setAttribute(
    "aria-label",
    inRange ? `${ymd} 생산적 비율 ${pctLabel}` : `${ymd} 조회 범위 밖`,
  );

  if (inRange) {
    cell.addEventListener("click", () => showHeatmapDayInfo(ymd, stat));
  } else {
    cell.disabled = true;
    cell.tabIndex = -1;
  }

  rowEl.appendChild(cell);
}

function createYearHeatmapBlock(year, { rangeStartYmd, rangeEndYmd, dayProductivityMap }) {
  const block = document.createElement("div");
  block.className = "time-ledger-productivity-heatmap-year";
  block.dataset.year = String(year);

  const yearTitle = document.createElement("div");
  yearTitle.className = "time-ledger-productivity-heatmap-year-title";
  yearTitle.textContent = String(year);
  block.appendChild(yearTitle);

  const body = document.createElement("div");
  body.className = "time-ledger-productivity-heatmap-body";

  const monthCol = document.createElement("div");
  monthCol.className = "time-ledger-productivity-heatmap-month-col";
  monthCol.setAttribute("aria-hidden", "true");
  const monthCorner = document.createElement("span");
  monthCorner.className = "time-ledger-productivity-heatmap-month-corner";
  monthCol.appendChild(monthCorner);

  const gridWrap = document.createElement("div");
  gridWrap.className = "time-ledger-productivity-heatmap-grid-wrap";

  const dayHead = document.createElement("div");
  dayHead.className = "time-ledger-productivity-heatmap-day-head";
  dayHead.setAttribute("aria-hidden", "true");
  for (let day = 1; day <= MAX_DAYS_IN_MONTH; day++) {
    const label = document.createElement("span");
    label.className = "time-ledger-productivity-heatmap-day-label";
    label.textContent = String(day);
    dayHead.appendChild(label);
  }

  const grid = document.createElement("div");
  grid.className = "time-ledger-productivity-heatmap-grid";

  const monthRows = buildMonthDayRowsForYear(year);
  monthRows.forEach(({ month, cells }) => {
    const monthLabel = document.createElement("span");
    monthLabel.className = "time-ledger-productivity-heatmap-month";
    monthLabel.textContent = String(month).padStart(2, "0");
    monthCol.appendChild(monthLabel);

    const rowEl = document.createElement("div");
    rowEl.className = "time-ledger-productivity-heatmap-month-row";
    cells.forEach((ymd) => {
      appendHeatmapCell(rowEl, ymd, {
        rangeStartYmd,
        rangeEndYmd,
        dayProductivityMap,
      });
    });
    grid.appendChild(rowEl);
  });

  gridWrap.appendChild(dayHead);
  gridWrap.appendChild(grid);
  body.appendChild(monthCol);
  body.appendChild(gridWrap);
  block.appendChild(body);

  const legend = document.createElement("div");
  legend.className = "time-ledger-productivity-heatmap-legend";
  legend.setAttribute("aria-hidden", "true");
  const category = document.createElement("span");
  category.className = "time-ledger-productivity-heatmap-legend-category";
  category.textContent = "생산성";
  legend.appendChild(category);
  const less = document.createElement("span");
  less.className = "time-ledger-productivity-heatmap-legend-end";
  less.textContent = "낮음";
  legend.appendChild(less);
  for (let lv = 0; lv <= 4; lv++) {
    const sw = document.createElement("span");
    sw.className = `time-ledger-productivity-heatmap-legend-swatch time-ledger-productivity-heatmap-cell--lv${lv}`;
    legend.appendChild(sw);
  }
  const more = document.createElement("span");
  more.className = "time-ledger-productivity-heatmap-legend-end";
  more.textContent = "높음";
  legend.appendChild(more);
  block.appendChild(legend);

  return block;
}

/**
 * @param {{
 *   rangeStartYmd: string,
 *   rangeEndYmd: string,
 *   dayProductivityMap: Map<string, { ymd: string, productiveHrs: number, nonproductiveHrs: number, otherHrs: number, totalHrs: number, pct: number }>,
 * }} opts
 */
export function createTimeLedgerVerticalProductivityHeatmap(opts) {
  const { rangeStartYmd, rangeEndYmd, dayProductivityMap } = opts || {};
  const scroll = document.createElement("div");
  scroll.className = "time-ledger-productivity-heatmap-scroll";

  const root = document.createElement("div");
  root.className = "time-ledger-productivity-heatmap";
  root.setAttribute("role", "img");
  root.setAttribute(
    "aria-label",
    "조회 기간 연도별 일별 생산적 시간 비율",
  );

  for (const year of yearsInRange(rangeStartYmd, rangeEndYmd)) {
    root.appendChild(
      createYearHeatmapBlock(year, {
        rangeStartYmd,
        rangeEndYmd,
        dayProductivityMap,
      }),
    );
  }

  scroll.appendChild(root);
  return scroll;
}
