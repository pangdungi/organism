/**
 * 예상 일정(일간 예산) — 식단·대화·외출·콘텐츠 상세명 (실제 과제 기록 meal_detail 과 동일 역할)
 */

import * as TTC from "./timeTaskOptionsConstants.js";

/** 상세명을 과제명 대신 표시할지 — 식단·감정 트리거는 제외(과제명 유지) */
export function expectedSpanUsesDetailAsDisplayName(span) {
  const taskName = String(span?.taskName || "").trim();
  const detail = String(span?.scheduleDetail || "").trim();
  const kind = TTC.ledgerDetailTaskKind(taskName);
  if (kind === "meal" || kind === "emotion") return false;
  return TTC.isLedgerDetailTaskName(taskName) && !!detail;
}

/** 카드·타임라인·슬롯 그리드 — 화면용 과제명(저장 taskName 과 별개) */
export function expectedSpanDisplayTaskName(span) {
  const taskName = String(span?.taskName || "").trim();
  const detail = String(span?.scheduleDetail || "").trim();
  if (expectedSpanUsesDetailAsDisplayName(span)) return detail;
  return taskName;
}

/** 타임테이블(10분 슬롯)·타임박스 칸 라벨 */
export function expectedSpanSlotGridLabel(span) {
  return expectedSpanDisplayTaskName(span);
}

/** 예상 카드·툴팁용 상세 한 줄 */
export function formatExpectedSpanDetailLine(taskName, detailText) {
  const kind = TTC.ledgerDetailTaskKind(taskName);
  const text = String(detailText || "").trim();
  if (!kind || !text) return "";
  return `${TTC.ledgerDetailLinePrefix(kind)} ${text}`;
}

/** 예상 카드 메모 영역 — 상세명이 제목이면 사용자 메모만 */
export function expectedSpanCardMemoLines(span) {
  const taskName = String(span?.taskName || "").trim();
  const detail = String(span?.scheduleDetail || "").trim();
  const userMemo = String(span?.scheduleMemo || "").trim();
  const lines = [];
  if (!expectedSpanUsesDetailAsDisplayName(span)) {
    const detailLine = formatExpectedSpanDetailLine(taskName, detail);
    if (detailLine) lines.push(detailLine);
  }
  if (userMemo) lines.push(userMemo);
  return lines;
}
