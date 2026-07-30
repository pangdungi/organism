/** 캘린더 1일뷰 — 24행×12열(5분 칸) 그리드 — 시간기록 타임박스와 동일 */

import { expectedSpanSlotGridLabel } from "./expectedScheduleDetail.js";
import { showToast } from "./showToast.js";
import * as TTC from "./timeTaskOptionsConstants.js";

export const CAL_1DAY_SLOT_MINUTES = 5;
export const CAL_1DAY_SLOT_COLS = 12;
export const CAL_1DAY_SLOT_ROWS = 24;
export const CAL_1DAY_SLOT_COL_LABELS = [
  "5",
  "10",
  "15",
  "20",
  "25",
  "30",
  "35",
  "40",
  "45",
  "50",
  "55",
  "60",
];

function slotMinForCell(row, col) {
  return row * 60 + col * CAL_1DAY_SLOT_MINUTES;
}

/** 5분 칸 시작 분(0~1435) → "0:00" 표기 */
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
  return minutesOfDayToHhMm(m);
}

/** 예상 일정 저장용 — 24:00(1440분)까지 허용 */
export function minutesOfDayToHhMm(minOfDay) {
  const m = Math.max(0, Math.min(24 * 60, Math.floor(Number(minOfDay) || 0)));
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
  const taskName = String(span?.taskName || "").trim();
  if (
    TTC.isConversationDetailTaskName(taskName) ||
    TTC.isOutingDetailTaskName(taskName)
  ) {
    return "social";
  }
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

function spanKey(span) {
  if (!span) return "";
  return `${span.startMin}|${span.endMin}|${String(span.taskName || "").trim()}|${String(span.scheduleDetail || "").trim()}`;
}

/** 타임박스 칸 라벨 — 공백은 표시에서 제외(「모닝 루틴」→「모닝루틴」) */
function compactSlotGridLabel(span) {
  return String(expectedSpanSlotGridLabel(span) || "").replace(/\s+/g, "");
}

function findSpanMatchingKey(spans, key) {
  if (!key) return null;
  for (const span of normalizeSpans(spans)) {
    if (spanKey(span) === key) return span;
  }
  return null;
}

function appendSlotGridCellLabel(cell, span) {
  const labelText = compactSlotGridLabel(span);
  if (!labelText) return;
  cell.textContent = "";
  const labelEl = document.createElement("span");
  labelEl.className = "calendar-1day-slot-grid-cell-label";
  labelEl.textContent = labelText;
  cell.appendChild(labelEl);
  cell.classList.add(
    "calendar-1day-slot-grid-cell--labeled",
    "calendar-1day-slot-grid-cell--span-labeled",
  );
}

/** 같은 행에서 연속 칸만 가로(span)로 시작~끝 한 덩어리 — 라벨은 span당 1회(가장 넓은 구간) */
function applyCalendarSlotGridRowSpanMerges(root, spans) {
  const sorted = normalizeSpans(spans);
  /** spanKey → 가장 넓은 가로 구간(동률이면 더 이른 칸) */
  const labelAnchors = new Map();

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
      const span =
        findSpanMatchingKey(sorted, key) || findSpanForCell(slotMin, sorted);
      if (!span) {
        i += run;
        continue;
      }

      if (run >= 2) {
        cell.style.gridColumn = `span ${run}`;
        cell.classList.add("calendar-1day-slot-grid-cell--span-merged");
        for (let k = 1; k < run; k += 1) {
          const absorbed = cells[i + k];
          absorbed.classList.add("calendar-1day-slot-grid-cell--span-absorbed");
          absorbed.style.display = "none";
        }
      }

      const prev = labelAnchors.get(key);
      const candidate = { cell, run, slotMin, span };
      if (
        !prev ||
        run > prev.run ||
        (run === prev.run && slotMin < prev.slotMin)
      ) {
        labelAnchors.set(key, candidate);
      }

      i += run;
    }
  });

  for (const { cell, span } of labelAnchors.values()) {
    appendSlotGridCellLabel(cell, span);
  }
}

/** 24행×12열(5분 칸) 스크롤 래퍼 */
export function createCalendar1DaySlotGridScroll() {
  const scroll = document.createElement("div");
  scroll.className = "calendar-1day-slot-grid-scroll";

  const matrix = document.createElement("div");
  matrix.className = "calendar-1day-slot-grid-matrix";
  matrix.setAttribute("role", "grid");
  matrix.setAttribute("aria-label", "하루 24행 12열 5분 단위");

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
    delete cell.dataset.lpTipTitle;
    cell.removeAttribute("title");

    const span = findSpanForCell(slotMin, sorted);
    if (!span) {
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
    /* title은 라벨 merge 후 · 글자 잘릴 때만 (아래 sync) */
    cell.dataset.lpTipTitle = titleTask
      ? `${titleTask} (${span.startDisplay || ""} ~ ${span.endDisplay || ""})`
      : "";
    cell.removeAttribute("title");
  });

  applyCalendarSlotGridRowSpanMerges(root, sorted);
  syncCalendar1DaySlotGridHoverTitles(root);
}

/** 칸 라벨이 ellipsis로 잘렸을 때만 native title */
function syncCalendar1DaySlotGridHoverTitles(root) {
  if (!root) return;
  const apply = () => {
    if (!root.isConnected) return;
    root.querySelectorAll(".calendar-1day-slot-grid-cell").forEach((cell) => {
      const tip = String(cell.dataset.lpTipTitle || "").trim();
      const label = cell.querySelector(".calendar-1day-slot-grid-cell-label");
      const cut =
        !!label &&
        (label.scrollWidth > label.clientWidth + 0.5 ||
          label.scrollHeight > label.clientHeight + 0.5);
      if (tip && cut) cell.title = tip;
      else cell.removeAttribute("title");
    });
  };
  requestAnimationFrame(() => requestAnimationFrame(apply));
}

function spansMatchForDrag(a, b) {
  if (!a || !b) return false;
  return (
    String(a.taskName || "").trim() === String(b.taskName || "").trim() &&
    Number(a.startMin) === Number(b.startMin) &&
    Number(a.endMin) === Number(b.endMin)
  );
}

/** 이동 대상 구간에 다른 예상 일정이 겹치면 false */
export function canMoveSpanToStart(spans, span, newStartMin) {
  const sm = Number(span?.startMin);
  const em = Number(span?.endMin);
  if (!Number.isFinite(sm) || !Number.isFinite(em) || em <= sm) return false;
  const duration = em - sm;
  const nextStart = Number(newStartMin);
  const nextEnd = nextStart + duration;
  if (!Number.isFinite(nextStart) || nextStart < 0 || nextEnd > 24 * 60) {
    return false;
  }
  for (let m = nextStart; m < nextEnd; m += CAL_1DAY_SLOT_MINUTES) {
    const hit = findSpanForCell(m, normalizeSpans(spans));
    if (hit && !spansMatchForDrag(hit, span)) return false;
  }
  return true;
}

function mergedCellRunCount(cell) {
  const raw = String(cell?.style?.gridColumn || "").trim();
  const m = raw.match(/span\s+(\d+)/i);
  const n = m ? parseInt(m[1], 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** 합쳐진 칸 안에서도 5분 칸 단위로 포인터 위치 해석 */
function slotMinAtPoint(root, clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const cell = el?.closest?.(".calendar-1day-slot-grid-cell");
  if (!cell || !root.contains(cell)) return null;
  let slotMin = Number(cell.dataset.slotMin);
  if (!Number.isFinite(slotMin)) return null;
  const run = mergedCellRunCount(cell);
  if (run > 1) {
    const rect = cell.getBoundingClientRect();
    if (rect.width > 0) {
      const colWidth = rect.width / run;
      const offsetCol = Math.floor((clientX - rect.left) / colWidth);
      const clamped = Math.max(0, Math.min(run - 1, offsetCol));
      slotMin += clamped * CAL_1DAY_SLOT_MINUTES;
    }
  }
  return slotMin;
}

function cellAtPoint(root, clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const cell = el?.closest?.(".calendar-1day-slot-grid-cell");
  if (!cell || !root.contains(cell)) return null;
  const slotMin = slotMinAtPoint(root, clientX, clientY);
  return Number.isFinite(slotMin) ? { cell, slotMin } : null;
}

function snapSlotMin(min) {
  const step = CAL_1DAY_SLOT_MINUTES;
  return Math.round(Number(min) / step) * step;
}

function cellsForSpanKey(root, key) {
  if (!key) return [];
  return [...root.querySelectorAll(".calendar-1day-slot-grid-cell")].filter(
    (c) => c.dataset.spanKey === key,
  );
}

function clearDragVisuals(root) {
  root.querySelectorAll(".calendar-1day-slot-grid-cell--drag-source").forEach((c) => {
    c.classList.remove("calendar-1day-slot-grid-cell--drag-source");
  });
  root.querySelectorAll(".calendar-1day-slot-grid-cell--drop-preview").forEach((c) => {
    c.classList.remove("calendar-1day-slot-grid-cell--drop-preview");
  });
}

function paintDropPreview(root, startMin, durationMin) {
  for (let m = startMin; m < startMin + durationMin; m += CAL_1DAY_SLOT_MINUTES) {
    const cell = root.querySelector(
      `.calendar-1day-slot-grid-cell[data-slot-min="${m}"]`,
    );
    if (cell) cell.classList.add("calendar-1day-slot-grid-cell--drop-preview");
  }
}

const DRAG_MOVE_THRESHOLD_PX = 6;

/**
 * 예상 일정 덩어리 드래그 이동 (일간 예산 슬롯만 · 길이 유지 · 5분 격자)
 * @param {HTMLElement} root
 * @param {{
 *   getSpans: () => object[],
 *   getBudgetSlotIndex: (span: object) => number,
 *   onMoveSpan: (span: object, newStartMin: number, newEndMin: number) => Promise<{ ok?: boolean, error?: string }>,
 *   onComplete?: () => void,
 * }} options
 */
export function wireCalendar1DaySlotGridDrag(root, options) {
  if (!root || root.dataset.slotGridDragWired === "1") return;
  root.dataset.slotGridDragWired = "1";

  let drag = null;
  let suppressClickUntil = 0;

  root.addEventListener("selectstart", (e) => {
    e.preventDefault();
  });
  root.addEventListener(
    "dragstart",
    (e) => {
      if (e.target.closest(".calendar-1day-slot-grid-cell--filled")) {
        e.preventDefault();
      }
    },
    true,
  );

  root.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      const cell = e.target.closest(".calendar-1day-slot-grid-cell--filled");
      if (!cell || !root.contains(cell)) return;
      e.preventDefault();
      const slotMin = Number(cell.dataset.slotMin);
      if (!Number.isFinite(slotMin)) return;
      const spans = options.getSpans();
      const span = findSpanForCell(slotMin, spans);
      if (!span) return;
      const slotIdx = options.getBudgetSlotIndex(span);
      if (slotIdx < 0) return;

      const anchorSlotMin = slotMinAtPoint(root, e.clientX, e.clientY) ?? slotMin;
      drag = {
        span,
        slotIdx,
        spanKey: spanKey(span),
        originStartMin: Number(span.startMin),
        anchorSlotMin,
        durationMin: Number(span.endMin) - Number(span.startMin),
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        captureCell: cell,
      };
      try {
        cell.setPointerCapture(e.pointerId);
      } catch (_) {}
    },
    { passive: false },
  );

  const finishDrag = async (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const state = drag;
    drag = null;
    root.classList.remove("calendar-1day-slot-grid-scroll--dragging");
    try {
      if (state.captureCell?.hasPointerCapture?.(e.pointerId)) {
        state.captureCell.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}

    clearDragVisuals(root);

    if (!state.moved) return;

    /* click은 pointerup 직후·저장 await 전에 발생 → 여기서 먼저 막음 */
    suppressClickUntil = Date.now() + 600;

    const dropSlotMin = slotMinAtPoint(root, e.clientX, e.clientY);
    if (!Number.isFinite(dropSlotMin)) return;

    const deltaMin = dropSlotMin - state.anchorSlotMin;
    const newStartMin = snapSlotMin(state.originStartMin + deltaMin);
    const newEndMin = newStartMin + state.durationMin;
    const spans = options.getSpans();
    if (!canMoveSpanToStart(spans, state.span, newStartMin)) {
      showToast("이 시간에는 같은 길이로 옮길 수 없습니다.");
      return;
    }
    if (newStartMin === Number(state.span.startMin)) return;

    let result = options.onMoveSpan(state.span, newStartMin, newEndMin);
    if (result && typeof result.then === "function") {
      result = await result;
    }
    if (!result?.ok) {
      showToast(result?.error || "예상 일정 이동에 실패했습니다.");
      return;
    }
    if (typeof options.onComplete === "function") options.onComplete();
  };

  root.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_MOVE_THRESHOLD_PX) return;

    if (!drag.moved) {
      drag.moved = true;
      root.classList.add("calendar-1day-slot-grid-scroll--dragging");
      cellsForSpanKey(root, drag.spanKey).forEach((c) => {
        c.classList.add("calendar-1day-slot-grid-cell--drag-source");
      });
    }

    e.preventDefault();

    clearDragVisuals(root);
    cellsForSpanKey(root, drag.spanKey).forEach((c) => {
      c.classList.add("calendar-1day-slot-grid-cell--drag-source");
    });

    const dropSlotMin = slotMinAtPoint(root, e.clientX, e.clientY);
    if (!Number.isFinite(dropSlotMin)) return;
    const deltaMin = dropSlotMin - drag.anchorSlotMin;
    const newStartMin = snapSlotMin(drag.originStartMin + deltaMin);
    const spans = options.getSpans();
    if (canMoveSpanToStart(spans, drag.span, newStartMin)) {
      paintDropPreview(root, newStartMin, drag.durationMin);
    }
  }, { passive: false });

  root.addEventListener("pointerup", (e) => {
    if (drag?.moved) {
      suppressClickUntil = Date.now() + 600;
      e.preventDefault();
    }
    void finishDrag(e);
  });
  root.addEventListener("pointercancel", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag = null;
    root.classList.remove("calendar-1day-slot-grid-scroll--dragging");
    clearDragVisuals(root);
    suppressClickUntil = Date.now() + 300;
  });

  root.addEventListener(
    "click",
    (e) => {
      if (Date.now() < suppressClickUntil) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );
}
