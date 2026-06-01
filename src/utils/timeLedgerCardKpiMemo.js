/**
 * 시간가계부 카드 메모 — 식단·KPI 매일할일·수행값 요약 (사용자 메모와 합쳐 표시)
 */

import { getKpiMeasureInfoByKpiId } from "./kpiTodoSync.js";
import { splitUnhealthyMealMemoFromDb } from "./timeLedgerEntriesModel.js";
import * as TTC from "./timeTaskOptionsConstants.js";

/** 건강한·건강하지 않은 섭취 — meal_detail(구버전 [식단] memo) */
export function resolveLedgerRowMealDetail(rowData) {
  const taskName = String(rowData?.taskName || "").trim();
  if (!TTC.isMealDetailTaskName(taskName)) return "";
  let mealDetail = String(rowData?.mealDetail || "").trim();
  if (!mealDetail) {
    const feedback = String(rowData?.feedback || "").trim();
    if (feedback.startsWith("[식단] ")) {
      mealDetail = splitUnhealthyMealMemoFromDb(feedback).mealDetail;
    }
  }
  return mealDetail;
}

/** @param {object} rowData */
export function formatTimeLedgerCardMealDetailLines(rowData) {
  const mealDetail = resolveLedgerRowMealDetail(rowData);
  if (!mealDetail) return [];
  return [`식단 ${mealDetail}`];
}

/** 사용자 메모 본문(식단 접두·KPI 요약 제외) */
export function ledgerRowUserMemoFeedback(rowData) {
  let memo = String(rowData?.feedback || "").trim();
  const taskName = String(rowData?.taskName || "").trim();
  if (TTC.isMealDetailTaskName(taskName) && memo.startsWith("[식단] ")) {
    memo = splitUnhealthyMealMemoFromDb(memo).feedback;
  }
  return memo;
}

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

/** 식단·KPI 요약 + 사용자 메모 */
export function buildTimeLedgerCardMemoText(rowData, kpiId) {
  const summary = [
    ...formatTimeLedgerCardMealDetailLines(rowData),
    ...formatTimeLedgerCardKpiMemoLines(rowData, kpiId),
  ].join("\n");
  const memo = ledgerRowUserMemoFeedback(rowData);
  if (!summary) return memo;
  if (!memo) return summary;
  return `${summary}\n${memo}`;
}
