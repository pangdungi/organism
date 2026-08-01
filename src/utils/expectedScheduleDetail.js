/**
 * 예상 일정(일간 예산) — 식단·대화·외출·독서·콘텐츠 상세명 (실제 과제 기록 meal_detail 과 동일 역할)
 */

import * as TTC from "./timeTaskOptionsConstants.js";
import { getKpiTodoTextById } from "./kpiTodoSync.js";

/** 상세명을 과제명 대신 표시할지 — 식단·감정·독서·대화는 제외(과제명 유지) */
export function expectedSpanUsesDetailAsDisplayName(span) {
  const taskName = String(span?.taskName || "").trim();
  const detail = String(span?.scheduleDetail || "").trim();
  const kind = TTC.ledgerDetailTaskKind(taskName);
  if (
    kind === "meal" ||
    kind === "emotion" ||
    kind === "reading" ||
    TTC.isConversationDetailTaskName(taskName)
  ) {
    return false;
  }
  return TTC.isLedgerDetailTaskName(taskName) && !!detail;
}

/** 카드·타임라인·슬롯 그리드 — 화면용 과제명(저장 taskName 과 별개) */
export function expectedSpanDisplayTaskName(span) {
  const taskName = String(span?.taskName || "").trim();
  const detail = String(span?.scheduleDetail || "").trim();
  if (expectedSpanUsesDetailAsDisplayName(span)) {
    if (TTC.isConversationDetailTaskName(taskName)) {
      return TTC.formatConversationDisplayText(detail) || detail;
    }
    if (TTC.isChipDetailTaskName(taskName)) {
      return TTC.formatChipDetailDisplayText(taskName, detail) || detail;
    }
    return detail;
  }
  return taskName;
}

/** 타임테이블(5분 슬롯)·타임박스 칸 라벨 */
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

/** 계획 할일 id → 표시용 ◽️ 줄 (실제 메모 문자열과 분리) */
function plannedTodoDisplayLinesForSpan(span) {
  const ids = Array.isArray(span?.plannedTodoIds)
    ? span.plannedTodoIds.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  if (!ids.length) return [];
  const lines = [];
  for (const id of ids) {
    const text = getKpiTodoTextById(id);
    if (text) lines.push(`◽️ ${text}`);
  }
  return lines;
}

/** 예상 카드 메모 영역 — 상세·계획 할일(표시만)·사용자 메모 */
export function expectedSpanCardMemoLines(span) {
  const taskName = String(span?.taskName || "").trim();
  const detail = String(span?.scheduleDetail || "").trim();
  const userMemo = String(span?.scheduleMemo || "").trim();
  const lines = [];
  if (TTC.isConversationDetailTaskName(taskName) && detail) {
    const parsed = TTC.parseConversationDetail(detail);
    if (parsed.types.length) {
      lines.push(
        `종류 ${parsed.types.join(TTC.CHIP_DETAIL_STORE_SEPARATOR)}`,
      );
    }
    if (parsed.name) lines.push(`대화 ${parsed.name}`);
    if (parsed.speechChecks?.length) {
      lines.push(
        `말 점검 ${parsed.speechChecks.join(TTC.CHIP_DETAIL_STORE_SEPARATOR)}`,
      );
    }
  } else if (!expectedSpanUsesDetailAsDisplayName(span)) {
    const detailLine = formatExpectedSpanDetailLine(taskName, detail);
    if (detailLine) lines.push(detailLine);
  }
  for (const line of plannedTodoDisplayLinesForSpan(span)) {
    lines.push(line);
  }
  if (userMemo) lines.push(userMemo);
  return lines;
}
