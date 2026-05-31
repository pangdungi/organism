/**
 * 시간가계부 카드 메모 — KPI 매일할일·수행값 요약 (사용자 메모와 합쳐 표시)
 */

import { getKpiMeasureInfoByKpiId } from "./kpiTodoSync.js";

/** @param {object} rowData @param {string} kpiId */
export function formatTimeLedgerCardKpiMemoLines(rowData, kpiId) {
  const kid = String(kpiId || "").trim();
  if (!kid) return [];

  const lines = [];
  const performed = String(rowData?.kpiPerformedValue ?? "").trim();
  if (performed) {
    const measure = getKpiMeasureInfoByKpiId(kid);
    const unit = measure?.unit ? ` ${measure.unit}` : "";
    lines.push(`수행값 ${performed}${unit}`);
  }

  const daily = Array.isArray(rowData?.habitDailyCompleted)
    ? rowData.habitDailyCompleted
    : [];
  const texts = daily
    .map((t) => String(t?.text || "").trim())
    .filter(Boolean);
  if (texts.length > 0) {
    lines.push(`매일할일 ✓ ${texts.join(" · ")}`);
  }

  return lines;
}

/** KPI 요약 + 사용자 메모 */
export function buildTimeLedgerCardMemoText(rowData, kpiId) {
  const kpiPart = formatTimeLedgerCardKpiMemoLines(rowData, kpiId).join("\n");
  const memo = String(rowData?.feedback || "").trim();
  if (!kpiPart) return memo;
  if (!memo) return kpiPart;
  return `${kpiPart}\n${memo}`;
}
