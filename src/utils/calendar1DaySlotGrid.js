/** 캘린더 1일뷰 — 24행×6열(10분 칸) 그리드 */

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

function spanStartsInCell(span, slotMin) {
  const sm = Number(span?.startMin);
  if (!Number.isFinite(sm)) return false;
  return sm >= slotMin && sm < slotMin + CAL_1DAY_SLOT_MINUTES;
}

export function prodKeyForSlotGridSpan(span) {
  const pk = String(span?.prod || "other").toLowerCase();
  if (pk === "productive" || pk === "nonproductive") return pk;
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

    const span = findSpanForCell(slotMin, sorted);
    if (!span) {
      cell.title = formatCalendar1DaySlotClockLabel(slotMin);
      return;
    }

    const pk = prodKeyForSlotGridSpan(span);
    cell.classList.add(`calendar-1day-slot-grid-cell--${pk}`);
    const taskName = String(span.taskName || "").trim();
    if (spanStartsInCell(span, slotMin) && taskName) {
      cell.textContent = taskName.slice(0, 2);
      cell.classList.add("calendar-1day-slot-grid-cell--labeled");
    }
    cell.title = taskName
      ? `${taskName} (${span.startDisplay || ""} ~ ${span.endDisplay || ""})`
      : formatCalendar1DaySlotClockLabel(slotMin);
  });
}
