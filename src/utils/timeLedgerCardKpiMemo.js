/**
 * 시간가계부 카드 메모 — 식단·콘텐츠·KPI 매일할일·수행값 요약 (사용자 메모와 합쳐 표시)
 */

import { getKpiMeasureInfoByKpiId } from "./kpiTodoSync.js";
import { emotionReflectMemoParts } from "./timeEmotionReflectMemo.js";
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

/** 상세명을 과제명 대신 표시할지 — 식단·감정·독서는 제외(과제명 유지) */
export function ledgerRowUsesDetailAsDisplayName(rowData) {
  const taskName = String(rowData?.taskName || "").trim();
  const { kind, text } = resolveLedgerRowDetail(rowData);
  if (kind === "emotion" || kind === "meal" || kind === "reading") return false;
  return !!kind && !!text && TTC.isLedgerDetailTaskName(taskName);
}

/** 카드·타임라인·타임박스 — 화면용 과제명 */
export function ledgerRowDisplayTaskName(rowData) {
  const rawName = String(rowData?.taskName || "").trim();
  const taskName = TTC.canonicalMealTaskDisplayName(rawName) || rawName;
  if (rawName === MOVE_ROUTINE_TASK_NAME || taskName === MOVE_ROUTINE_TASK_NAME) {
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

/**
 * @typedef {{ label?: string, body: string }} TimeLedgerCardMemoPart
 */

/** @param {object} rowData @param {string} kpiId @returns {TimeLedgerCardMemoPart[]} */
export function buildTimeLedgerCardMemoParts(rowData, kpiId) {
  /** @type {TimeLedgerCardMemoPart[]} */
  const parts = [];

  if (!ledgerRowUsesDetailAsDisplayName(rowData)) {
    const { kind, text } = resolveLedgerRowDetail(rowData);
    if (kind && text) {
      const label = TTC.ledgerDetailLinePrefix(kind);
      if (label) parts.push({ label, body: text });
      else parts.push({ body: text });
    }
  }

  const kid = String(kpiId || "").trim();
  if (kid) {
    const performed = String(rowData?.kpiPerformedValue ?? "").trim();
    if (performed) {
      const measure = getKpiMeasureInfoByKpiId(kid);
      const unit = measure?.unit ? ` ${measure.unit}` : "";
      parts.push({ label: "수행값", body: `${performed}${unit}`.trim() });
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
        parts.push({ label: "매일할일", body: `✓ ${texts.join(" · ")}` });
      }
    }
  }

  let memo = ledgerRowUserMemoFeedback(rowData);
  if (memo && TTC.isNegativeEmotionalTaskName(rowData?.taskName)) {
    parts.push(...emotionReflectMemoParts(memo));
  } else if (memo) {
    parts.push({ body: memo });
  }

  return parts;
}

/** @param {object} rowData @param {string} kpiId */
export function formatTimeLedgerCardKpiMemoLines(rowData, kpiId) {
  return buildTimeLedgerCardMemoParts(rowData, kpiId)
    .filter((p) => p.label === "수행값" || p.label === "매일할일")
    .map((p) => (p.label ? `${p.label} ${p.body}` : p.body));
}

/** 식단·콘텐츠·KPI 요약 + 사용자 메모 (평문) */
export function buildTimeLedgerCardMemoText(rowData, kpiId) {
  return buildTimeLedgerCardMemoParts(rowData, kpiId)
    .map((p) => (p.label ? `${p.label} ${p.body}` : p.body))
    .join("\n");
}

/**
 * 카드 메모 DOM — 라벨은 칩, 본문은 일반 글
 * @returns {boolean} 내용 있음
 */
export function fillTimeLedgerCardMemoElement(el, rowData, kpiId) {
  if (!(el instanceof Element)) return false;
  const parts = buildTimeLedgerCardMemoParts(rowData, kpiId);
  el.replaceChildren();
  if (!parts.length) {
    el.classList.remove("time-ledger-card-memo--structured");
    return false;
  }
  el.classList.add("time-ledger-card-memo--structured");
  for (const part of parts) {
    const row = document.createElement("div");
    row.className = "time-ledger-card-memo-row";
    if (part.label) {
      const chip = document.createElement("span");
      chip.className = "time-ledger-card-memo-chip";
      chip.textContent = part.label;
      row.appendChild(chip);
    }
    const body = document.createElement("span");
    body.className = "time-ledger-card-memo-body";
    body.textContent = part.body;
    row.appendChild(body);
    el.appendChild(row);
  }
  return true;
}
