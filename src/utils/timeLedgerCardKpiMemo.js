/**
 * 시간가계부 카드 메모 — 식단·콘텐츠·KPI 매일할일·수행값 요약 (사용자 메모와 합쳐 표시)
 */

import { getKpiMeasureInfoByKpiId } from "./kpiTodoSync.js";
import { splitUnhealthyMealMemoFromDb } from "./timeLedgerEntriesModel.js";
import * as TTC from "./timeTaskOptionsConstants.js";

const CONTENT_MEMO_PREFIX = "[콘텐츠] ";
const MOVE_ROUTINE_TASK_NAME = "이동 루틴";

/** 이동 루틴 + 체크한 매일할일 → 카드·타임라인 표시용 */
export function formatMoveRoutineDisplayLabel(habitDailyCompleted) {
  const texts = (Array.isArray(habitDailyCompleted) ? habitDailyCompleted : [])
    .map((t) => String(t?.text || "").trim())
    .filter(Boolean);
  if (!texts.length) return "";
  const quoted = texts.map((t) => `'${t}'`).join(", ");
  return `${quoted} 하면서 이동하기`;
}

/**
 * @returns {{ kind: "meal" | "conversation" | "outing" | "content" | "emotion" | null, text: string }}
 */
export function resolveLedgerRowDetail(rowData) {
  const taskName = String(rowData?.taskName || "").trim();
  const kind = TTC.ledgerDetailTaskKind(taskName);
  if (!kind) return { kind: null, text: "" };

  let text = String(rowData?.mealDetail || "").trim();
  if (TTC.isChipDetailTaskKind(kind)) {
    text = TTC.formatChipDetailDisplayText(taskName, text);
  }
  if (!text) {
    const feedback = String(rowData?.feedback || "").trim();
    if (kind === "meal" && feedback.startsWith("[식단] ")) {
      text = splitUnhealthyMealMemoFromDb(feedback).mealDetail;
    } else if (kind === "content" && feedback.startsWith(CONTENT_MEMO_PREFIX)) {
      const firstLine = feedback.split("\n")[0] || "";
      text = firstLine.slice(CONTENT_MEMO_PREFIX.length).trim();
    }
  }
  return { kind, text };
}

/** 건강 섭취 전용(레포트 집계) */
export function resolveLedgerRowMealDetail(rowData) {
  const { kind, text } = resolveLedgerRowDetail(rowData);
  if (kind !== "meal") return "";
  return text;
}

/** @param {object} rowData */
export function formatTimeLedgerCardDetailLines(rowData) {
  const { kind, text } = resolveLedgerRowDetail(rowData);
  if (!kind || !text) return [];
  return [`${TTC.ledgerDetailLinePrefix(kind)} ${text}`];
}

/** 상세명을 과제명 대신 표시할지 — 식단·감정 트리거는 제외(과제명 유지) */
export function ledgerRowUsesDetailAsDisplayName(rowData) {
  const taskName = String(rowData?.taskName || "").trim();
  const { kind, text } = resolveLedgerRowDetail(rowData);
  if (kind === "emotion" || kind === "meal") return false;
  return !!kind && !!text && TTC.isLedgerDetailTaskName(taskName);
}

/** 카드·타임라인·타임박스 — 화면용 과제명 */
export function ledgerRowDisplayTaskName(rowData) {
  const taskName = String(rowData?.taskName || "").trim();
  if (taskName === MOVE_ROUTINE_TASK_NAME) {
    const moveLabel = formatMoveRoutineDisplayLabel(rowData?.habitDailyCompleted);
    if (moveLabel) return moveLabel;
  }
  const { text } = resolveLedgerRowDetail(rowData);
  if (ledgerRowUsesDetailAsDisplayName(rowData)) return text;
  return taskName;
}

/** 타임박스·일간 슬롯 그리드 칸 라벨 */
export function ledgerRowTimeboxDisplayLabel(rowData) {
  return ledgerRowDisplayTaskName(rowData);
}

/** @deprecated formatTimeLedgerCardDetailLines */
export function formatTimeLedgerCardMealDetailLines(rowData) {
  return formatTimeLedgerCardDetailLines(rowData);
}

/** 사용자 메모 본문(식단·콘텐츠 접두·KPI 요약 제외) */
export function ledgerRowUserMemoFeedback(rowData) {
  let memo = String(rowData?.feedback || "").trim();
  const taskName = String(rowData?.taskName || "").trim();
  const kind = TTC.ledgerDetailTaskKind(taskName);
  if (kind === "meal" && memo.startsWith("[식단] ")) {
    memo = splitUnhealthyMealMemoFromDb(memo).feedback;
  } else if (kind === "content" && memo.startsWith(CONTENT_MEMO_PREFIX)) {
    const nl = memo.indexOf("\n");
    memo = nl >= 0 ? memo.slice(nl + 1).trim() : "";
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
    const taskName = String(rowData?.taskName || "").trim();
    const moveUsesDailyAsTitle =
      taskName === MOVE_ROUTINE_TASK_NAME &&
      !!formatMoveRoutineDisplayLabel(rowData?.habitDailyCompleted);
    if (!moveUsesDailyAsTitle) {
      lines.push(`매일할일 ✓ ${texts.join(" · ")}`);
    }
  }

  return lines;
}

/** 식단·콘텐츠·KPI 요약 + 사용자 메모 */
export function buildTimeLedgerCardMemoText(rowData, kpiId) {
  const summary = [
    ...(ledgerRowUsesDetailAsDisplayName(rowData)
      ? []
      : formatTimeLedgerCardDetailLines(rowData)),
    ...formatTimeLedgerCardKpiMemoLines(rowData, kpiId),
  ].join("\n");
  const memo = ledgerRowUserMemoFeedback(rowData);
  if (!summary) return memo;
  if (!memo) return summary;
  return `${summary}\n${memo}`;
}
