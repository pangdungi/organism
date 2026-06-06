/** 캘린더 1일뷰 — 24행×6열(10분 칸) 그리드 */

import { expectedSpanSlotGridLabel } from "./expectedScheduleDetail.js";

export const CAL_1DAY_SLOT_MINUTES = 10;
export const CAL_1DAY_SLOT_COLS = 6;
export const CAL_1DAY_SLOT_ROWS = 24;
export const CAL_1DAY_SLOT_COL_LABELS = [
  "10",
  "20",
  "30",
  "40",
  "50",
  "60",
];

function slotMinForCell(row, col) {
  return row * 60 + col * CAL_1DAY_SLOT_MINUTES;
}

/** 10분 칸 시작 분(0~1430) → "0:00" 표기 */
export function formatCalendar1DaySlotClockLabel(slotMin) {
  const m = Math.max(
    0,
    Math.min(24 * 60 - CAL_1DAY_SLOT_MINUTES, Math.floor(Number(slotMin) || 0)),
  );
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}:${String(r).padStart(2, "0")}`;
}

export function slotMinToHhMm(slotMin) {
  const m = Math.max(
    0,
    Math.min(24 * 60 - CAL_1DAY_SLOT_MINUTES, Math.floor(Number(slotMin) || 0)),
  );
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${String(h).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function calendarSlotCellOverlapsSpan(slotMin, span) {
  const cellStart = Number(slotMin);
  const cellEnd = cellStart + CAL_1DAY_SLOT_MINUTES;
  const spanStart = Number(span?.startMin);
  const spanEnd = Number(span?.endMin);
  if (![cellStart, cellEnd, spanStart, spanEnd].every(Number.isFinite)) return false;
  return cellStart < spanEnd && cellEnd > spanStart;
}

export function findCalendarSlotSpanAtMin(slotMin, spans) {
  return findSpanForCell(Number(slotMin), normalizeSpans(spans));
}

/** 타임박스 칸 채움 — 카테고리·생산성 → CSS 수정자 키 */
function paintKeyForSlotGridSpan(span) {
  const cat = String(span?.category || "").trim().toLowerCase();
  if (cat === "sideincome") return "sideincome";
  if (cat === "happiness") return "happiness";
  if (cat === "health") return "health";
  const pk = String(span?.prod || "other").toLowerCase();
  if (pk === "nonproductive") return "nonproductive";
  return "other";
}

function normalizeSpans(spans) {
  return (spans || [])
    .filter(
      (s) =>
        Number.isFinite(s.startMin) &&
        Number.isFinite(s.endMin) &&
        s.endMin > s.startMin,
    )
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

/** 겹치는 구간 중 가장 짧은 것 우선 */
function findSpanForCell(slotMin, spans) {
  let best = null;
  for (const span of spans) {
    if (!calendarSlotCellOverlapsSpan(slotMin, span)) continue;
    if (!best) {
      best = span;
      continue;
    }
    const dur = span.endMin - span.startMin;
    const bestDur = best.endMin - best.startMin;
    if (dur < bestDur) best = span;
    else if (dur === bestDur && span.startMin > best.startMin) best = span;
  }
  return best;
}

function spanSlotCount(span) {
  const dur = Number(span?.endMin) - Number(span?.startMin);
  if (!Number.isFinite(dur) || dur <= 0) return 0;
  return Math.ceil(dur / CAL_1DAY_SLOT_MINUTES);
}

function slotOffsetInSpan(span, slotMin) {
  const sm = Number(span?.startMin);
  if (!Number.isFinite(sm)) return 0;
  return Math.max(0, Math.floor((slotMin - sm) / CAL_1DAY_SLOT_MINUTES));
}

function spanKey(span) {
  if (!span) return "";
  return `${span.startMin}|${span.endMin}|${String(span.taskName || "").trim()}|${String(span.scheduleDetail || "").trim()}`;
}

function maxLabelCharsForSpan(span) {
  const name = expectedSpanSlotGridLabel(span);
  if (!name) return 0;
  return Math.min(name.length, spanSlotCount(span) * 2);
}

function appendSlotGridCellLabel(cell, span, { spanMerged = false } = {}) {
  const chars = maxLabelCharsForSpan(span);
  if (chars <= 0) return;
  const name = expectedSpanSlotGridLabel(span);
  if (spanMerged) {
    const labelEl = document.createElement("span");
    labelEl.className = "calendar-1day-slot-grid-cell-label";
    labelEl.textContent = name.slice(0, chars);
    cell.appendChild(labelEl);
    cell.classList.add("calendar-1day-slot-grid-cell--span-labeled");
  } else {
    cell.textContent = name.slice(0, chars);
  }
  cell.classList.add("calendar-1day-slot-grid-cell--labeled");
}

/** 같은 행에서 연속 칸만 가로(span)로 시작~끝 한 덩어리 */
function applyCalendarSlotGridRowSpanMerges(root, spans) {
  const sorted = normalizeSpans(spans);
  root.querySelectorAll(".calendar-1day-slot-grid-row").forEach((rowEl) => {
    const cells = [...rowEl.querySelectorAll(".calendar-1day-slot-grid-cell")];
    let i = 0;
    while (i < cells.length) {
      const cell = cells[i];
      const key = cell.dataset.spanKey || "";
      if (!key || !cell.classList.contains("calendar-1day-slot-grid-cell--filled")) {
        i += 1;
        continue;
      }

      let run = 1;
      while (i + run < cells.length) {
        const next = cells[i + run];
        if (next.dataset.spanKey !== key) break;
        if (!next.classList.contains("calendar-1day-slot-grid-cell--filled")) break;
        run += 1;
      }

      const slotMin = Number(cell.dataset.slotMin);
      const span = findSpanForCell(slotMin, sorted);
      if (!span) {
        i += run;
        continue;
      }

      const offset = slotOffsetInSpan(span, slotMin);

      if (run >= 2) {
        cell.style.gridColumn = `span ${run}`;
        cell.classList.add("calendar-1day-slot-grid-cell--span-merged");
        for (let k = 1; k < run; k += 1) {
          const absorbed = cells[i + k];
          absorbed.classList.add("calendar-1day-slot-grid-cell--span-absorbed");
          absorbed.style.display = "none";
        }
      }

      if (offset === 0) {
        appendSlotGridCellLabel(cell, span, { spanMerged: run >= 2 });
      }

      i += run;
    }
  });
}

/** 24행×6열(10분 칸) 스크롤 래퍼 */
export function createCalendar1DaySlotGridScroll() {
  const scroll = document.createElement("div");
  scroll.className = "calendar-1day-slot-grid-scroll";

  const matrix = document.createElement("div");
  matrix.className = "calendar-1day-slot-grid-matrix";
  matrix.setAttribute("role", "grid");
  matrix.setAttribute("aria-label", "하루 24행 6열 10분 단위");

  const head = document.createElement("div");
  head.className = "calendar-1day-slot-grid-head";
  head.setAttribute("role", "row");
  const headCorner = document.createElement("span");
  headCorner.className = "calendar-1day-slot-grid-corner";
  headCorner.setAttribute("aria-hidden", "true");
  head.appendChild(headCorner);
  CAL_1DAY_SLOT_COL_LABELS.forEach((label) => {
    const col = document.createElement("span");
    col.className = "calendar-1day-slot-grid-col-label";
    col.textContent = label;
    head.appendChild(col);
  });
  matrix.appendChild(head);

  const body = document.createElement("div");
  body.className = "calendar-1day-slot-grid-body";
  for (let row = 0; row < CAL_1DAY_SLOT_ROWS; row++) {
    const rowEl = document.createElement("div");
    rowEl.className = "calendar-1day-slot-grid-row";
    rowEl.setAttribute("role", "row");

    const rowLabel = document.createElement("span");
    rowLabel.className = "calendar-1day-slot-grid-row-label";
    rowLabel.textContent = String(row).padStart(2, "0");
    rowEl.appendChild(rowLabel);

    for (let col = 0; col < CAL_1DAY_SLOT_COLS; col++) {
      const slotMin = slotMinForCell(row, col);
      const cell = document.createElement("span");
      cell.className = "calendar-1day-slot-grid-cell";
      cell.setAttribute("role", "gridcell");
      cell.dataset.slotMin = String(slotMin);
      cell.title = formatCalendar1DaySlotClockLabel(slotMin);
      rowEl.appendChild(cell);
    }
    body.appendChild(rowEl);
  }
  matrix.appendChild(body);
  scroll.appendChild(matrix);
  return scroll;
}

export function paintCalendar1DaySlotGridFromSpans(root, spans) {
  if (!root) return;
  const sorted = normalizeSpans(spans);

  root.querySelectorAll(".calendar-1day-slot-grid-cell").forEach((cell) => {
    const slotMin = Number(cell.dataset.slotMin);
    cell.className = "calendar-1day-slot-grid-cell";
    cell.textContent = "";
    cell.style.display = "";
    cell.style.gridColumn = "";
    delete cell.dataset.spanKey;

    const span = findSpanForCell(slotMin, sorted);
    if (!span) {
      cell.title = formatCalendar1DaySlotClockLabel(slotMin);
      return;
    }

    const pk = paintKeyForSlotGridSpan(span);
    cell.classList.add(`calendar-1day-slot-grid-cell--${pk}`);
    cell.classList.add("calendar-1day-slot-grid-cell--filled");
    cell.dataset.spanKey = spanKey(span);

    const taskName = String(span.taskName || "").trim();
    const label = expectedSpanSlotGridLabel(span);
    const titleTask =
      taskName && label && taskName !== label ? `${taskName} · ${label}` : label;
    cell.title = titleTask
      ? `${titleTask} (${span.startDisplay || ""} ~ ${span.endDisplay || ""})`
      : formatCalendar1DaySlotClockLabel(slotMin);
  });

  applyCalendarSlotGridRowSpanMerges(root, sorted);
}
