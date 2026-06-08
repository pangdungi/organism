/**
 * 감정적이기 과제 — 시간 레포트 집계 (1~2점만)
 */

import { parseTimeToHours } from "../views/Time.js";
import { normalizeTimeRatingForRow } from "./timeLedgerEntriesModel.js";
import { resolveLedgerRowDetail } from "./timeLedgerCardKpiMemo.js";
import {
  EMOTION_TRIGGER_OPTIONS,
  isEmotionalBuiltinTaskName,
  resolveEmotionTriggerLabel,
} from "./timeTaskOptionsConstants.js";

function rowMinutes(r) {
  const hrs = parseTimeToHours(r.timeTracked);
  if (!(hrs > 0) || !Number.isFinite(hrs)) return 0;
  return Math.round(hrs * 60);
}

function isEmotionLedgerRow(r) {
  return isEmotionalBuiltinTaskName(r?.taskName);
}

function isLowEmotionRating(r) {
  const rating = normalizeTimeRatingForRow(r.timeRating);
  return rating === 1 || rating === 2;
}

function emptyTriggerBucket() {
  return { count: 0, ratingSum: 0, ratingCount: 0, minutesSum: 0 };
}

/**
 * @param {ReturnType<import('../views/Time.js').loadTimeRows>} rows
 * @param {number} [hourlyRate]
 */
export function buildEmotionReportSnapshot(rows, hourlyRate = 0) {
  const lowRows = (rows || []).filter(
    (r) => isEmotionLedgerRow(r) && isLowEmotionRating(r),
  );

  let consumptionMinutes = 0;
  let consumptionCount = 0;

  /** @type {Map<string, ReturnType<typeof emptyTriggerBucket>>} */
  const triggerMap = new Map();
  EMOTION_TRIGGER_OPTIONS.forEach((label) => {
    triggerMap.set(label, emptyTriggerBucket());
  });
  const miscBucket = { ...emptyTriggerBucket(), label: "기타" };
  const unsetBucket = { ...emptyTriggerBucket(), label: "미선택" };

  for (const r of lowRows) {
    const mins = rowMinutes(r);
    if (mins <= 0) continue;

    consumptionMinutes += mins;
    consumptionCount += 1;

    const rating = normalizeTimeRatingForRow(r.timeRating);
    const { text } = resolveLedgerRowDetail(r);
    const resolved = resolveEmotionTriggerLabel(text);
    let bucket;
    if (!resolved.label) {
      bucket = unsetBucket;
    } else if (resolved.known && triggerMap.has(resolved.label)) {
      bucket = triggerMap.get(resolved.label);
    } else {
      bucket = miscBucket;
    }

    bucket.count += 1;
    bucket.minutesSum += mins;
    if (rating != null) {
      bucket.ratingSum += rating;
      bucket.ratingCount += 1;
    }
  }

  const rate = Number(hourlyRate) || 0;
  const consumptionCostWon =
    rate > 0 && consumptionMinutes > 0
      ? Math.round((consumptionMinutes / 60) * rate)
      : 0;

  /** @type {{ label: string, count: number, avgRating: number|null, avgMinutes: number, totalMinutes: number }[]} */
  const triggers = EMOTION_TRIGGER_OPTIONS.map((label) => {
    const b = triggerMap.get(label);
    return {
      label,
      count: b.count,
      avgRating: b.ratingCount > 0 ? b.ratingSum / b.ratingCount : null,
      avgMinutes: b.count > 0 ? b.minutesSum / b.count : 0,
      totalMinutes: b.minutesSum,
    };
  });

  [miscBucket, unsetBucket].forEach((b) => {
    if (b.count > 0) {
      triggers.push({
        label: b.label,
        count: b.count,
        avgRating: b.ratingCount > 0 ? b.ratingSum / b.ratingCount : null,
        avgMinutes: b.count > 0 ? b.minutesSum / b.count : 0,
        totalMinutes: b.minutesSum,
      });
    }
  });

  triggers.sort((a, b) => b.count - a.count || b.totalMinutes - a.totalMinutes);

  return {
    hasData: consumptionCount > 0,
    consumptionMinutes,
    consumptionCount,
    consumptionCostWon,
    hourlyRate: rate,
    triggers: triggers.filter((t) => t.count > 0),
  };
}
