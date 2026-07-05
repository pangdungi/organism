/**
 * 감정적이기 과제 — 시간 레포트 집계 (5대분류·소분류·트리거·히트맵)
 */

import { parseTimeToHours } from "../views/Time.js";
import { resolveLedgerRowDetail } from "./timeLedgerCardKpiMemo.js";
import {
  EMOTION_CATEGORIES,
  parseEmotionFromRow,
} from "./timeEmotionTaxonomy.js";
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

function parseRowStartHour(r) {
  const st = String(r?.startTime || "").trim();
  const m = st.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number.parseInt(m[1], 10);
  if (!Number.isInteger(h) || h < 0 || h > 23) return null;
  return h;
}

function parseRowDayOfWeek(r) {
  const d = String(r?.date || "")
    .replace(/\//g, "-")
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const dt = new Date(`${d}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getDay();
}

function emptyHeatmap() {
  return Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );
}

/**
 * @param {ReturnType<import('../views/Time.js').loadTimeRows>} rows
 * @param {number} [hourlyRate]
 */
export function buildEmotionReportSnapshot(rows, hourlyRate = 0) {
  const emotionRows = (rows || []).filter(isEmotionLedgerRow);
  const modernRows = emotionRows.filter((r) => parseEmotionFromRow(r).isModern);
  const legacyRows = emotionRows.filter((r) => parseEmotionFromRow(r).isLegacy);

  let consumptionMinutes = 0;
  let consumptionCount = 0;

  /** @type {Map<string, { id: string, label: string, count: number, minutes: number }>} */
  const categoryMap = new Map();
  EMOTION_CATEGORIES.forEach((c) => {
    categoryMap.set(c.id, { id: c.id, label: c.label, count: 0, minutes: 0 });
  });

  /** @type {Map<string, { label: string, categoryLabel: string, count: number, minutes: number }>} */
  const subMap = new Map();

  /** @type {Map<string, { count: number, minutes: number }>} */
  const triggerMap = new Map();
  EMOTION_TRIGGER_OPTIONS.forEach((label) => {
    triggerMap.set(label, { count: 0, minutes: 0 });
  });
  const miscTrigger = { label: "기타", count: 0, minutes: 0 };
  const unsetTrigger = { label: "미선택", count: 0, minutes: 0 };

  const heatmap = emptyHeatmap();

  for (const r of modernRows) {
    const mins = rowMinutes(r);
    if (mins <= 0) continue;

    const parsed = parseEmotionFromRow(r);
    const cat = parsed.category;
    if (!cat || !parsed.subLabel) continue;

    consumptionMinutes += mins;
    consumptionCount += 1;

    const catBucket = categoryMap.get(cat.id);
    if (catBucket) {
      catBucket.count += 1;
      catBucket.minutes += mins;
    }

    const subKey = parsed.subLabel;
    const subPrev = subMap.get(subKey) || {
      label: subKey,
      categoryLabel: cat.label,
      count: 0,
      minutes: 0,
    };
    subPrev.count += 1;
    subPrev.minutes += mins;
    subMap.set(subKey, subPrev);

    const { text } = resolveLedgerRowDetail(r);
    const resolved = resolveEmotionTriggerLabel(text);
    let tBucket;
    if (!resolved.label) {
      tBucket = unsetTrigger;
    } else if (resolved.known && triggerMap.has(resolved.label)) {
      tBucket = triggerMap.get(resolved.label);
    } else {
      tBucket = miscTrigger;
    }
    tBucket.count += 1;
    tBucket.minutes += mins;

    const dow = parseRowDayOfWeek(r);
    const hour = parseRowStartHour(r);
    if (dow != null && hour != null) {
      heatmap[dow][hour] += 1;
    }
  }

  const rate = Number(hourlyRate) || 0;
  const consumptionCostWon =
    rate > 0 && consumptionMinutes > 0
      ? Math.round((consumptionMinutes / 60) * rate)
      : 0;

  const categories = [...categoryMap.values()]
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || b.minutes - a.minutes);

  const subEmotions = [...subMap.values()]
    .sort((a, b) => b.count - a.count || b.minutes - a.minutes)
    .slice(0, 5);

  /** @type {{ label: string, count: number, totalMinutes: number }[]} */
  const triggers = EMOTION_TRIGGER_OPTIONS.map((label) => {
    const b = triggerMap.get(label);
    return {
      label,
      count: b.count,
      totalMinutes: b.minutes,
    };
  }).filter((t) => t.count > 0);

  [miscTrigger, unsetTrigger].forEach((b) => {
    if (b.count > 0) {
      triggers.push({
        label: b.label,
        count: b.count,
        totalMinutes: b.minutes,
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
    legacyCount: legacyRows.length,
    categories,
    subEmotions,
    triggers,
    heatmap,
  };
}
