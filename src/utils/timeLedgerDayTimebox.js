/** 시간가계부 타임박스뷰 — 24행(0~23시)×12열(5분 칸) 그리드 */

import { showToast } from "./showToast.js";

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

function prodKeyForBlock(prod) {
  const pk = String(prod || "other").toLowerCase();
  if (pk === "productive" || pk === "nonproductive") return pk;
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

/** 이 5분 칸에 기록 시작 시각이 들어있으면 라벨 표시 */
function blockStartsInCell(block, slotMin) {
  const sm = Number(block.startMin);
  if (!Number.isFinite(sm)) return false;
  return sm >= slotMin && sm < slotMin + TIME_LEDGER_TIMEBOX_SLOT_MINUTES;
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
  const taskName = String(block.taskName || "").trim() || "기록";
  const startDisplay =
    block.startDisplay || formatMinOfDayClock(block.startMin);
  const endDisplay = block.endDisplay || formatMinOfDayClock(block.endMin);
  const memo = String(block.rowData?.feedback || "").trim();
  showToast(taskName, [ `${startDisplay} ~ ${endDisplay}`, memo ].filter(Boolean).join("\n"));
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
    cell.removeAttribute("tabindex");
    cell.removeAttribute("role");
    delete cell.dataset.taskName;
    delete cell.dataset.startDisplay;
    delete cell.dataset.endDisplay;
    delete cell.dataset.memo;

    const block = findBlockForCell(slotMin, blocks);
    if (!block) {
      cell.title = formatMinOfDayClock(slotMin);
      return;
    }

    const pk = prodKeyForBlock(block.prod);
    cell.classList.add(`time-ledger-day-timebox-matrix-cell--${pk}`);

    const labelBlock = blocks.find((b) => blockStartsInCell(b, slotMin));
    const titleBlock = labelBlock || block;
    const taskName = String(block.taskName || "").trim() || "기록";
    const startDisplay =
      block.startDisplay || formatMinOfDayClock(block.startMin);
    const endDisplay = block.endDisplay || formatMinOfDayClock(block.endMin);
    const memo = String(block.rowData?.feedback || "").trim();

    cell.classList.add("time-ledger-day-timebox-matrix-cell--interactive");
    cell.setAttribute("role", "button");
    cell.setAttribute("tabindex", "0");
    cell.dataset.taskName = taskName;
    cell.dataset.startDisplay = startDisplay;
    cell.dataset.endDisplay = endDisplay;
    if (memo) cell.dataset.memo = memo;

    if (labelBlock) {
      const labelName = String(labelBlock.taskName || "").trim();
      if (labelName) {
        cell.textContent = labelName.slice(0, 2);
        cell.classList.add("time-ledger-day-timebox-matrix-cell--labeled");
      }
    }

    cell.title = `${taskName} (${startDisplay} ~ ${endDisplay})`;
  });
}

export function refreshTimeLedgerDayTimeboxScroll(scrollEl, rawBlocks) {
  const body = scrollEl?.querySelector(".time-ledger-day-timebox-matrix-body");
  if (!body) return;
  paintTimeLedgerDayTimeboxMatrixCells(body, rawBlocks);
  const empty = scrollEl.querySelector(".time-ledger-day-timebox-empty");
  const hasBlocks = normalizeBlocks(rawBlocks).length > 0;
  if (empty) empty.hidden = hasBlocks;
}
