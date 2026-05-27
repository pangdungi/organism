/** 캘린더 1일뷰 · 시간가계부 타임박스뷰 공통 15분 슬롯 그리드 */

export const CAL_1DAY_SLOT_COL_LABELS = [":15", ":30", ":45", ":60"];

/** 15분 칸 시작 분(0~1425) → "0:00" 표기 */
export function formatCalendar1DaySlotClockLabel(slotMin) {
  const m = Math.max(0, Math.min(24 * 60 - 15, Math.floor(Number(slotMin) || 0)));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}:${String(r).padStart(2, "0")}`;
}

export function slotMinToHhMm(slotMin) {
  const m = Math.max(0, Math.min(24 * 60 - 15, Math.floor(Number(slotMin) || 0)));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${String(h).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function calendarSlotCellOverlapsSpan(slotMin, span) {
  const cellStart = Number(slotMin);
  const cellEnd = cellStart + 15;
  const spanStart = Number(span?.startMin);
  const spanEnd = Number(span?.endMin);
  if (![cellStart, cellEnd, spanStart, spanEnd].every(Number.isFinite)) return false;
  return cellStart < spanEnd && cellEnd > spanStart;
}

export function calendarSlotFirstCellMin(span) {
  const sm = Number(span?.startMin);
  if (!Number.isFinite(sm)) return null;
  return Math.floor(sm / 15) * 15;
}

export function prodKeyForSlotGridSpan(span) {
  const pk = String(span?.prod || "other").toLowerCase();
  if (pk === "productive" || pk === "nonproductive") return pk;
  return "other";
}

export function appendCalendar1DaySlotGridHalf(
  parent,
  startHour,
  endHourExclusive,
  periodLabel,
) {
  const half = document.createElement("div");
  half.className = "calendar-1day-slot-grid-half";

  const titleRow = document.createElement("div");
  titleRow.className = "calendar-1day-slot-grid-half-title-row";
  const titleSpacer = document.createElement("span");
  titleSpacer.className = "calendar-1day-slot-grid-corner";
  titleSpacer.setAttribute("aria-hidden", "true");
  titleRow.appendChild(titleSpacer);
  const title = document.createElement("div");
  title.className = "calendar-1day-slot-grid-half-title";
  title.textContent = periodLabel;
  titleRow.appendChild(title);
  half.appendChild(titleRow);

  const head = document.createElement("div");
  head.className = "calendar-1day-slot-grid-head";
  head.setAttribute("aria-hidden", "true");
  const headCorner = document.createElement("span");
  headCorner.className = "calendar-1day-slot-grid-corner";
  head.appendChild(headCorner);
  CAL_1DAY_SLOT_COL_LABELS.forEach((label) => {
    const span = document.createElement("span");
    span.className = "calendar-1day-slot-grid-col-label";
    span.textContent = label;
    head.appendChild(span);
  });
  half.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "calendar-1day-slot-grid";
  grid.setAttribute("role", "grid");
  grid.setAttribute(
    "aria-label",
    `${periodLabel} ${startHour}시~${endHourExclusive}시 15분 단위`,
  );

  for (let hour = startHour; hour < endHourExclusive; hour++) {
    const rowEl = document.createElement("div");
    rowEl.className = "calendar-1day-slot-grid-row";
    rowEl.setAttribute("role", "row");
    const rowLabel = document.createElement("span");
    rowLabel.className = "calendar-1day-slot-grid-row-label";
    rowLabel.textContent = String(hour).padStart(2, "0");
    rowEl.appendChild(rowLabel);
    for (let col = 0; col < 4; col++) {
      const slotMin = hour * 60 + col * 15;
      const cell = document.createElement("span");
      cell.className = "calendar-1day-slot-grid-cell";
      cell.setAttribute("role", "gridcell");
      cell.dataset.slotMin = String(slotMin);
      cell.title = formatCalendar1DaySlotClockLabel(slotMin);
      rowEl.appendChild(cell);
    }
    grid.appendChild(rowEl);
  }
  half.appendChild(grid);
  parent.appendChild(half);
}

/** 오전·오후 12행×4열(15분 칸) 스크롤 래퍼 */
export function createCalendar1DaySlotGridScroll() {
  const scroll = document.createElement("div");
  scroll.className = "calendar-1day-slot-grid-scroll";

  const wrap = document.createElement("div");
  wrap.className = "calendar-1day-slot-grid-wrap";

  const dual = document.createElement("div");
  dual.className = "calendar-1day-slot-grid-dual";
  appendCalendar1DaySlotGridHalf(dual, 0, 12, "오전");
  appendCalendar1DaySlotGridHalf(dual, 12, 24, "오후");
  wrap.appendChild(dual);

  scroll.appendChild(wrap);
  return scroll;
}

/**
 * @param {HTMLElement} root
 * @param {Array<{ startMin: number, endMin: number, prod?: string, taskName?: string, startDisplay?: string, endDisplay?: string }>} spans
 * @param {{ firstLabeledCellMin?: (span: object) => number | null }} [options]
 */
export function paintCalendar1DaySlotGridFromSpans(root, spans, options = {}) {
  if (!root) return;
  const getFirstCellMin =
    options.firstLabeledCellMin || calendarSlotFirstCellMin;
  const sorted = [...(spans || [])].sort(
    (a, b) => Number(a.startMin) - Number(b.startMin),
  );
  root.querySelectorAll(".calendar-1day-slot-grid-cell").forEach((cell) => {
    const slotMin = Number(cell.dataset.slotMin);
    cell.className = "calendar-1day-slot-grid-cell";
    cell.textContent = "";
    const span = sorted.find((s) => calendarSlotCellOverlapsSpan(slotMin, s));
    if (!span) {
      cell.title = formatCalendar1DaySlotClockLabel(slotMin);
      return;
    }
    const pk = prodKeyForSlotGridSpan(span);
    cell.classList.add(`calendar-1day-slot-grid-cell--${pk}`);
    const taskName = String(span.taskName || "").trim();
    const labelMin = getFirstCellMin(span);
    if (labelMin === slotMin && taskName) {
      cell.textContent = taskName.slice(0, 2);
      cell.classList.add("calendar-1day-slot-grid-cell--labeled");
    }
    cell.title = taskName
      ? `${taskName} (${span.startDisplay || ""} ~ ${span.endDisplay || ""})`
      : formatCalendar1DaySlotClockLabel(slotMin);
  });
}
