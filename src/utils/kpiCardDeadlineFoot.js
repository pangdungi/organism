import { formatDeadlineRangeCompact } from "./ganttModal.js";

/**
 * 수동 목표(마감기한) KPI 카드 하단 — ㄴ 모양 + 기간 표시 (카드 inner 안)
 * @param {object | null | undefined} kpi
 * @param {(s: string) => string} escapeHtml
 */
export function buildKpiCardDeadlineFootHtml(kpi, escapeHtml) {
  const deadline = String(kpi?.targetDeadline ?? "").trim().slice(0, 10);
  if (!deadline) return "";
  const start = String(kpi?.targetStartDate ?? "").trim().slice(0, 10);
  const range = formatDeadlineRangeCompact(start, deadline);
  if (!range) return "";
  const text = `마감 ${range}`;
  return `<div class="dream-kpi-card-deadline-foot" aria-label="마감기한">
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
