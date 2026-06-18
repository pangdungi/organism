/** 시간가계부 타임박스뷰 — 24행(0~23시)×12열(5분 칸) 그리드 */

import { showToast } from "./showToast.js";
import { ledgerRowTimeboxDisplayLabel } from "./timeLedgerCardKpiMemo.js";
import * as TTC from "./timeTaskOptionsConstants.js";

export const TIME_LEDGER_TIMEBOX_GRID_ROWS = 24;
export const TIME_LEDGER_TIMEBOX_GRID_COLS = 12;
export const TIME_LEDGER_TIMEBOX_SLOT_MINUTES = 5;

const COL_LABELS = ["5", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55", "60"];

function formatMinOfDayClock(minOfDay) {
  const m = Math.max(0, Math.floor(Number(minOfDay) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${String(h).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** 생산·비생산 대화·외출 — 타임박스 전용 보라(기존 행복 핑크·비생산 블루 대신) */
function isTimeboxSocialDialogOutingTask(block) {
  const taskName = String(
    block?.rowData?.taskName || block?.taskName || "",
  ).trim();
  if (!taskName) return false;
  return (
    TTC.isConversationDetailTaskName(taskName) ||
    TTC.isOutingDetailTaskName(taskName)
  );
}

/** 타임박스 칸 채움 — 카테고리·생산성 → CSS 수정자 키 */
function paintKeyForTimeboxBlock(block) {
  if (isTimeboxSocialDialogOutingTask(block)) return "social";
  const cat = String(block?.category || "").trim().toLowerCase();
  if (cat === "sideincome") return "sideincome";
  if (cat === "happiness") return "happiness";
  if (cat === "health") return "health";
  const pk = String(block?.prod || "other").toLowerCase();
  if (pk === "nonproductive") return "nonproductive";
  return "other";
}

export function slotMinForTimeboxCell(row, col) {
  return row * 60 + col * TIME_LEDGER_TIMEBOX_SLOT_MINUTES;
}

function normalizeBlocks(rawBlocks) {
  return (rawBlocks || [])
    .filter(
      (b) =>
        Number.isFinite(b.startMin) &&
        Number.isFinite(b.endMin) &&
        b.endMin > b.startMin,
    )
    .map((b) => ({
      ...b,
      startMin: Math.max(0, b.startMin),
      endMin: Math.max(0, b.endMin),
    }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

function cellOverlapsBlock(slotMin, block) {
  const cellEnd = slotMin + TIME_LEDGER_TIMEBOX_SLOT_MINUTES;
  return slotMin < block.endMin && cellEnd > block.startMin;
}

/** 기록 시작 칸 기준 N번째 5분 칸 (0=시작 칸) */
function slotOffsetInBlock(block, slotMin) {
  const sm = Number(block?.startMin);
  if (!Number.isFinite(sm)) return 0;
  return Math.max(0, Math.floor((slotMin - sm) / TIME_LEDGER_TIMEBOX_SLOT_MINUTES));
}

function blockKey(block) {
  if (!block) return "";
  const baseTask = String(block.rowData?.taskName || block.taskName || "").trim();
  const detail = String(block.rowData?.mealDetail || "").trim();
  const label = String(block.taskName || "").trim();
  return `${block.startMin}|${block.endMin}|${baseTask}|${detail}|${label}`;
}

function appendTimeboxCellLabel(cell, block, { spanMerged = false } = {}) {
  const name = String(block.taskName || "").trim();
  if (!name) return;
  if (spanMerged) {
    const labelEl = document.createElement("span");
    labelEl.className = "time-ledger-day-timebox-matrix-cell-label";
    labelEl.textContent = name;
    cell.appendChild(labelEl);
    cell.classList.add("time-ledger-day-timebox-matrix-cell--span-labeled");
  } else {
    cell.textContent = name;
  }
  cell.classList.add("time-ledger-day-timebox-matrix-cell--labeled");
}

/** 같은 행에서 연속 칸만 가로(span)로 시작~끝 한 덩어리 */
function applyTimeboxRowSpanMerges(body, blocks) {
  body.querySelectorAll(".time-ledger-day-timebox-matrix-row").forEach((rowEl) => {
    const cells = [...rowEl.querySelectorAll(".time-ledger-day-timebox-matrix-cell")];
    let i = 0;
    while (i < cells.length) {
      const cell = cells[i];
      const key = cell.dataset.blockKey || "";
      if (!key || !cell.classList.contains("time-ledger-day-timebox-matrix-cell--interactive")) {
        i += 1;
        continue;
      }

      let span = 1;
      while (i + span < cells.length) {
        const next = cells[i + span];
        if (next.dataset.blockKey !== key) break;
        if (!next.classList.contains("time-ledger-day-timebox-matrix-cell--interactive")) break;
        span += 1;
      }

      const slotMin = Number(cell.dataset.slotMin);
      const block = findBlockForCell(slotMin, blocks);
      if (!block) {
        i += span;
        continue;
      }

      const offset = slotOffsetInBlock(block, slotMin);

      if (span >= 2) {
        cell.style.gridColumn = `span ${span}`;
        cell.classList.add("time-ledger-day-timebox-matrix-cell--span-merged");
        for (let k = 1; k < span; k += 1) {
          const absorbed = cells[i + k];
          absorbed.classList.add("time-ledger-day-timebox-matrix-cell--span-absorbed");
          absorbed.style.display = "none";
        }
      }

      if (offset === 0) {
        appendTimeboxCellLabel(cell, block, { spanMerged: span >= 2 });
      }

      i += span;
    }
  });
}

/** 겹치는 기록 중 가장 짧은 구간 우선 (긴·진행 중 기록이 짧은 기록을 가리지 않게) */
function findBlockForCell(slotMin, blocks) {
  let best = null;
  for (const block of blocks) {
    if (!cellOverlapsBlock(slotMin, block)) continue;
    if (!best) {
      best = block;
      continue;
    }
    const dur = block.endMin - block.startMin;
    const bestDur = best.endMin - best.startMin;
    if (dur < bestDur) best = block;
    else if (dur === bestDur && block.startMin > best.startMin) best = block;
  }
  return best;
}

function showTimeboxCellRecordInfo(block) {
  if (!block) return;
  const baseTask = String(block.rowData?.taskName || "").trim();
  const label = String(block.taskName || "").trim() || baseTask || "기록";
  const title =
    baseTask && label && baseTask !== label ? `${baseTask} · ${label}` : label;
  const startDisplay =
    block.startDisplay || formatMinOfDayClock(block.startMin);
  const endDisplay = block.endDisplay || formatMinOfDayClock(block.endMin);
  const memo = String(block.rowData?.feedback || "").trim();
  showToast(title, [ `${startDisplay} ~ ${endDisplay}`, memo ].filter(Boolean).join("\n"));
}

function wireTimeLedgerDayTimeboxCellClicks(body) {
  if (!body || body.dataset.lpTimeboxClickWired === "1") return;
  body.dataset.lpTimeboxClickWired = "1";
  body.addEventListener("click", (e) => {
    const cell = e.target.closest(".time-ledger-day-timebox-matrix-cell--interactive");
    if (!cell) return;
    e.stopPropagation();
    const taskName = cell.dataset.taskName || "";
    if (!taskName) return;
    showTimeboxCellRecordInfo({
      taskName,
      startDisplay: cell.dataset.startDisplay || "",
      endDisplay: cell.dataset.endDisplay || "",
      rowData: { feedback: cell.dataset.memo || "" },
    });
  });
  body.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const cell = e.target.closest(".time-ledger-day-timebox-matrix-cell--interactive");
    if (!cell) return;
    e.preventDefault();
    cell.click();
  });
}

export function createTimeLedgerDayTimeboxElement(blocks) {
  const scroll = document.createElement("div");
  scroll.className = "time-ledger-day-timebox-scroll";

  const matrix = document.createElement("div");
  matrix.className = "time-ledger-day-timebox-matrix";
  matrix.setAttribute("role", "grid");
  matrix.setAttribute(
    "aria-label",
    "하루 24행 12열 5분 단위 시간박스",
  );

  const head = document.createElement("div");
  head.className = "time-ledger-day-timebox-matrix-head";
  head.setAttribute("role", "row");
  const headCorner = document.createElement("span");
  headCorner.className = "time-ledger-day-timebox-matrix-corner";
  headCorner.setAttribute("aria-hidden", "true");
  head.appendChild(headCorner);
  COL_LABELS.forEach((label) => {
    const col = document.createElement("span");
    col.className = "time-ledger-day-timebox-matrix-col-label";
    col.textContent = label;
    head.appendChild(col);
  });
  matrix.appendChild(head);

  const body = document.createElement("div");
  body.className = "time-ledger-day-timebox-matrix-body";
  for (let row = 0; row < TIME_LEDGER_TIMEBOX_GRID_ROWS; row++) {
    const rowEl = document.createElement("div");
    rowEl.className = "time-ledger-day-timebox-matrix-row";
    rowEl.setAttribute("role", "row");

    const rowLabel = document.createElement("span");
    rowLabel.className = "time-ledger-day-timebox-matrix-row-label";
    rowLabel.textContent = String(row).padStart(2, "0");
    rowEl.appendChild(rowLabel);

    for (let col = 0; col < TIME_LEDGER_TIMEBOX_GRID_COLS; col++) {
      const slotMin = slotMinForTimeboxCell(row, col);
      const cell = document.createElement("span");
      cell.className = "time-ledger-day-timebox-matrix-cell";
      cell.setAttribute("role", "gridcell");
      cell.dataset.slotMin = String(slotMin);
      rowEl.appendChild(cell);
    }
    body.appendChild(rowEl);
  }
  matrix.appendChild(body);
  scroll.appendChild(matrix);

  wireTimeLedgerDayTimeboxCellClicks(body);
  paintTimeLedgerDayTimeboxMatrixCells(body, blocks);

  if (!normalizeBlocks(blocks).length) {
    const empty = document.createElement("p");
    empty.className = "time-ledger-day-timebox-empty";
    empty.textContent = "시작·종료 시간이 있는 기록이 없습니다.";
    scroll.appendChild(empty);
  }

  return scroll;
}

export function paintTimeLedgerDayTimeboxMatrixCells(body, rawBlocks) {
  if (!body) return;
  const blocks = normalizeBlocks(rawBlocks);

  body.querySelectorAll(".time-ledger-day-timebox-matrix-cell").forEach((cell) => {
    const slotMin = Number(cell.dataset.slotMin);
    cell.className = "time-ledger-day-timebox-matrix-cell";
    cell.textContent = "";
    cell.style.display = "";
    cell.style.gridColumn = "";
    cell.removeAttribute("tabindex");
    cell.removeAttribute("role");
    delete cell.dataset.taskName;
    delete cell.dataset.startDisplay;
    delete cell.dataset.endDisplay;
    delete cell.dataset.memo;
    delete cell.dataset.blockKey;

    const block = findBlockForCell(slotMin, blocks);
    if (!block) {
      cell.title = formatMinOfDayClock(slotMin);
      return;
    }

    const pk = paintKeyForTimeboxBlock(block);
    cell.classList.add(`time-ledger-day-timebox-matrix-cell--${pk}`);

    const baseTask = String(block.rowData?.taskName || "").trim();
    const label = String(block.taskName || "").trim() || baseTask || "기록";
    const startDisplay =
      block.startDisplay || formatMinOfDayClock(block.startMin);
    const endDisplay = block.endDisplay || formatMinOfDayClock(block.endMin);
    const memo = String(block.rowData?.feedback || "").trim();

    cell.classList.add("time-ledger-day-timebox-matrix-cell--interactive");
    cell.setAttribute("role", "button");
    cell.setAttribute("tabindex", "0");
    cell.dataset.taskName = label;
    cell.dataset.startDisplay = startDisplay;
    cell.dataset.endDisplay = endDisplay;
    cell.dataset.blockKey = blockKey(block);
    if (memo) cell.dataset.memo = memo;

    const titleTask =
      baseTask && label && baseTask !== label ? `${baseTask} · ${label}` : label;
    cell.title = `${titleTask} (${startDisplay} ~ ${endDisplay})`;
  });

  applyTimeboxRowSpanMerges(body, blocks);
}

export function refreshTimeLedgerDayTimeboxScroll(scrollEl, rawBlocks) {
  const body = scrollEl?.querySelector(".time-ledger-day-timebox-matrix-body");
  if (!body) return;
  paintTimeLedgerDayTimeboxMatrixCells(body, rawBlocks);
  const empty = scrollEl.querySelector(".time-ledger-day-timebox-empty");
  const hasBlocks = normalizeBlocks(rawBlocks).length > 0;
  if (empty) empty.hidden = hasBlocks;
}
