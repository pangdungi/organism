/**
 * 감정적이기 과제 — 시간 레포트 집계 (부정/긍정 분리)
 */

import { parseTimeToHours } from "../views/Time.js";
import {
  ledgerRowUserMemoFeedback,
  resolveLedgerRowDetail,
} from "./timeLedgerCardKpiMemo.js";
import {
  getEmotionCategoriesForPolarity,
  parseEmotionFromRow,
} from "./timeEmotionTaxonomy.js";
import {
  EMOTION_TRIGGER_OPTIONS,
  emotionTaskPolarity,
  isEmotionalBuiltinTaskName,
  isNegativeEmotionalTaskName,
  isPositiveEmotionalTaskName,
  resolveEmotionTriggerLabel,
} from "./timeTaskOptionsConstants.js";

function rowMinutes(r) {
  const hrs = parseTimeToHours(r.timeTracked);
  if (!(hrs > 0) || !Number.isFinite(hrs)) return 0;
  return Math.round(hrs * 60);
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

/** @returns {{ count: number, cats: Record<string, number> }[][]} */
function emptyHeatmap() {
  return Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ count: 0, cats: {} })),
  );
}

/**
 * @param {ReturnType<import('../views/Time.js').loadTimeRows>} rows
 * @param {number} [hourlyRate]
 * @param {{ polarity?: "negative"|"positive" }} [opts]
 */
export function buildEmotionReportSnapshot(
  rows,
  hourlyRate = 0,
  opts = {},
) {
  const polarity = opts.polarity === "positive" ? "positive" : "negative";
  const categoriesList = getEmotionCategoriesForPolarity(polarity);
  const includeTriggers = polarity === "negative";

  const emotionRows = (rows || []).filter((r) => {
    if (!isEmotionalBuiltinTaskName(r?.taskName)) return false;
    if (polarity === "positive") return isPositiveEmotionalTaskName(r.taskName);
    return isNegativeEmotionalTaskName(r.taskName);
  });

  const modernRows = emotionRows.filter(
    (r) => parseEmotionFromRow(r, polarity).isModern,
  );
  const legacyRows = emotionRows.filter(
    (r) => parseEmotionFromRow(r, polarity).isLegacy,
  );

  let consumptionMinutes = 0;
  let consumptionCount = 0;

  /** @type {Map<string, { id: string, label: string, count: number, minutes: number }>} */
  const categoryMap = new Map();
  categoriesList.forEach((c) => {
    categoryMap.set(c.id, { id: c.id, label: c.label, count: 0, minutes: 0 });
  });

  /** @type {Map<string, { label: string, categoryLabel: string, count: number, minutes: number }>} */
  const subMap = new Map();

  /** @type {Map<string, { count: number, minutes: number }>} */
  const triggerMap = new Map();
  if (includeTriggers) {
    EMOTION_TRIGGER_OPTIONS.forEach((label) => {
      triggerMap.set(label, { count: 0, minutes: 0 });
    });
  }
  const miscTrigger = { label: "기타", count: 0, minutes: 0 };
  const unsetTrigger = { label: "미선택", count: 0, minutes: 0 };

  const heatmap = emptyHeatmap();

  /** @type {{ date: string, startHour: number|null, startMinOfDay: number|null, startLabel: string, minutes: number, categoryId: string, categoryLabel: string, subLabel: string, trigger: string, memo: string, polarity: string }[]} */
  const entries = [];

  for (const r of modernRows) {
    const mins = rowMinutes(r);
    if (mins <= 0) continue;

    const parsed = parseEmotionFromRow(r, polarity);
    const cat = parsed.category;
    if (!cat) continue;
    if (!cat.selectOnly && !parsed.subLabel) continue;

    consumptionMinutes += mins;
    consumptionCount += 1;

    const catBucket = categoryMap.get(cat.id);
    if (catBucket) {
      catBucket.count += 1;
      catBucket.minutes += mins;
    }

    if (!cat.selectOnly && parsed.subLabel) {
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
    }

    let resolved = { label: "", known: false };
    if (includeTriggers) {
      const { text } = resolveLedgerRowDetail(r);
      resolved = resolveEmotionTriggerLabel(text);
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
    }

    const dow = parseRowDayOfWeek(r);
    const hour = parseRowStartHour(r);
    if (dow != null && hour != null) {
      const cell = heatmap[dow][hour];
      cell.count += 1;
      cell.cats[cat.id] = (cell.cats[cat.id] || 0) + 1;
    }

    const date = String(r?.date || "")
      .replace(/\//g, "-")
      .slice(0, 10);
    const clockMatch = String(r?.startTime || "").match(/(\d{1,2}):(\d{2})/);
    let startMinOfDay = null;
    let startLabel = "";
    if (clockMatch) {
      const h = Number.parseInt(clockMatch[1], 10);
      const mi = Number.parseInt(clockMatch[2], 10);
      if (Number.isInteger(h) && h >= 0 && h <= 23 && Number.isInteger(mi)) {
        startMinOfDay = h * 60 + mi;
        startLabel = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
      }
    }
    entries.push({
      date,
      startHour: hour,
      startMinOfDay,
      startLabel,
      minutes: mins,
      categoryId: cat.id,
      categoryLabel: cat.label,
      subLabel: parsed.subLabel || cat.label,
      trigger: includeTriggers ? resolved.label || "" : "",
      memo: ledgerRowUserMemoFeedback(r),
      polarity,
    });
  }

  entries.sort((a, b) => {
    const am = a.startMinOfDay == null ? 99 * 60 : a.startMinOfDay;
    const bm = b.startMinOfDay == null ? 99 * 60 : b.startMinOfDay;
    return (
      String(a.date).localeCompare(String(b.date)) ||
      am - bm ||
      a.startLabel.localeCompare(b.startLabel)
    );
  });

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
  const triggers = [];
  if (includeTriggers) {
    EMOTION_TRIGGER_OPTIONS.forEach((label) => {
      const b = triggerMap.get(label);
      if (b?.count > 0) {
        triggers.push({
          label,
          count: b.count,
          totalMinutes: b.minutes,
        });
      }
    });
    [miscTrigger, unsetTrigger].forEach((b) => {
      if (b.count > 0) {
        triggers.push({
          label: b.label,
          count: b.count,
          totalMinutes: b.minutes,
        });
      }
    });
    triggers.sort(
      (a, b) => b.count - a.count || b.totalMinutes - a.totalMinutes,
    );
  }

  return {
    polarity,
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
    entries,
  };
}

/** 부정·긍정 둘 다 있는지 빠른 확인 */
export function emotionReportHasAnyData(rows) {
  return (rows || []).some((r) => isEmotionalBuiltinTaskName(r?.taskName));
}

export function emotionReportPolarityOfRow(row) {
  return emotionTaskPolarity(row?.taskName);
}
