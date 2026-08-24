import { formatDeadlineRangeCompact } from "./ganttModal.js";
import {
  KPI_PROGRESS_STATUS,
  resolveKpiProgressStatus,
} from "./kpiProgressStatus.js";
import { timeLedgerLocalTodayYmd } from "./timeLedgerEntriesSupabase.js";

/** @param {object | null | undefined} kpi @returns {string} YYYY-MM-DD */
function kpiDeadlineYmd(kpi) {
  const deadline = String(kpi?.targetDeadline ?? "")
    .trim()
    .slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : "";
}

/** @returns {string} YYYY-MM-DD */
function localTodayYmd() {
  const today = String(timeLedgerLocalTodayYmd() || "")
    .trim()
    .slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : "";
}

/** 설정한 마감일이 오늘보다 이전인지 */
function isKpiDeadlineDatePassed(kpi) {
  const deadline = kpiDeadlineYmd(kpi);
  const today = localTodayYmd();
  if (!deadline || !today) return false;
  return deadline < today;
}

/** 진행중인데 마감일이 지났는지 (빨간 강조) */
function isActiveKpiPastDeadline(kpi) {
  if (!isKpiDeadlineDatePassed(kpi)) return false;
  return resolveKpiProgressStatus(kpi) === KPI_PROGRESS_STATUS.ACTIVE;
}

/**
 * 수동 목표(마감기한) KPI 카드 하단 — ㄴ 모양 + 기간 표시 (카드 inner 안)
 * @param {object | null | undefined} kpi
 * @param {(s: string) => string} escapeHtml
 */
export function buildKpiCardDeadlineFootHtml(kpi, escapeHtml) {
  const deadline = kpiDeadlineYmd(kpi);
  if (!deadline) return "";
  const start = String(kpi?.targetStartDate ?? "").trim().slice(0, 10);
  const range = formatDeadlineRangeCompact(start, deadline);
  if (!range) return "";
  const datePassed = isKpiDeadlineDatePassed(kpi);
  const overdueActive = isActiveKpiPastDeadline(kpi);
  /* 날짜 지나기 전: 기한 / 지난 뒤: 마감 */
  const label = datePassed ? "마감" : "기한";
  const text = `${label} ${range}`;
  const overdueClass = overdueActive
    ? " dream-kpi-card-deadline-foot--overdue"
    : "";
  return `<div class="dream-kpi-card-deadline-foot${overdueClass}" aria-label="${datePassed ? "마감" : "기한"}">
    <span class="dream-kpi-card-deadline-foot-corner" aria-hidden="true"></span>
    <span class="dream-kpi-card-deadline-foot-text">${escapeHtml(text)}</span>
  </div>`;
}

/** @param {HTMLElement} grid */
export function appendKpiCardToGrid(grid, card, kpi, escapeHtml) {
  const footHtml = buildKpiCardDeadlineFootHtml(kpi, escapeHtml);
  if (footHtml) {
    const inner = card.querySelector(".dream-kpi-card-inner");
    if (inner) inner.insertAdjacentHTML("beforeend", footHtml);
  }
  grid.appendChild(card);
}
