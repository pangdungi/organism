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
  EMOTION_TRIGGER_CATEGORIES,
  buildEmotionTriggerPatternSentence,
  emotionTaskPolarity,
  emotionTriggerCategoryKey,
  emotionTriggerReportKey,
  emotionTriggerSituationPhrase,
  isEmotionalBuiltinTaskName,
  isNegativeEmotionalTaskName,
  isPositiveEmotionalTaskName,
  parseEmotionTrigger,
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

function normalizePositiveMemoKey(memo) {
  return String(memo || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function buildPositiveMemoPatternSentence(emotionLabel, memo) {
  const emotion = String(emotionLabel || "").trim();
  const core = normalizePositiveMemoKey(memo).replace(/[.。!！?？]+$/u, "");
  if (!emotion || !core) return "";
  return `「${core}」 때문에 ${emotion}의 감정을 느낍니다.`;
}

function hourBucketLabel(hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return "";
  if (hour >= 5 && hour < 12) return "오전";
  if (hour >= 12 && hour < 18) return "오후";
  if (hour >= 18 && hour < 22) return "저녁";
  return "밤·새벽";
}

function buildPositiveWhenPatternSentence(whenLabel, emotionLabel) {
  const when = String(whenLabel || "").trim();
  const emotion = String(emotionLabel || "").trim();
  if (!when || !emotion) return "";
  return `${when}에 ${emotion}의 감정을 자주 느낍니다.`;
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
  /** 부정만 트리거 칩 저장 · 긍정은 메모·시간대로 패턴 */
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

  /** @type {Map<string, { count: number, minutes: number, categoryLabel: string }>} */
  const triggerMap = new Map();
  if (includeTriggers) {
    EMOTION_TRIGGER_CATEGORIES.forEach((cat) => {
      cat.subs.forEach((sub) => {
        const subLabel = typeof sub === "string" ? sub : sub.label;
        triggerMap.set(subLabel, {
          count: 0,
          minutes: 0,
          categoryLabel: cat.label,
        });
      });
    });
  }
  /** 대분류별 합계 */
  /** @type {Map<string, { count: number, minutes: number }>} */
  const triggerCategoryMap = new Map();
  if (includeTriggers) {
    EMOTION_TRIGGER_CATEGORIES.forEach((cat) => {
      triggerCategoryMap.set(cat.label, { count: 0, minutes: 0 });
    });
  }
  const miscTrigger = {
    label: "기타",
    count: 0,
    minutes: 0,
    categoryLabel: "기타",
  };
  const unsetTrigger = {
    label: "미선택",
    count: 0,
    minutes: 0,
    categoryLabel: "미선택",
  };

  /** 감정 대분류 → 상황(트리거) 빈도 */
  /** @type {Map<string, Map<string, { count: number, minutes: number }>>} */
  const emotionToTrigger = new Map();
  /** 상황 → 감정 대분류 빈도 */
  /** @type {Map<string, Map<string, { count: number, minutes: number, categoryLabel: string }>>} */
  const triggerToEmotion = new Map();

  const heatmap = emptyHeatmap();

  function bumpPairMaps(catId, catLabel, triggerLabel, mins) {
    if (!includeTriggers || !triggerLabel) return;
    let tMap = emotionToTrigger.get(catId);
    if (!tMap) {
      tMap = new Map();
      emotionToTrigger.set(catId, tMap);
    }
    const tPrev = tMap.get(triggerLabel) || { count: 0, minutes: 0 };
    tPrev.count += 1;
    tPrev.minutes += mins;
    tMap.set(triggerLabel, tPrev);

    let eMap = triggerToEmotion.get(triggerLabel);
    if (!eMap) {
      eMap = new Map();
      triggerToEmotion.set(triggerLabel, eMap);
    }
    const ePrev = eMap.get(catId) || {
      count: 0,
      minutes: 0,
      categoryLabel: catLabel,
    };
    ePrev.count += 1;
    ePrev.minutes += mins;
    eMap.set(catId, ePrev);
  }

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

    /** @type {ReturnType<typeof parseEmotionTrigger>} */
    let resolved = {
      categoryLabel: "",
      subLabel: "",
      label: "",
      known: false,
      legacy: false,
    };
    if (includeTriggers) {
      const { text } = resolveLedgerRowDetail(r);
      resolved = parseEmotionTrigger(text);
      const reportKey = emotionTriggerReportKey(text);
      const catKey = emotionTriggerCategoryKey(text);
      let tBucket;
      if (!resolved.label && !resolved.categoryLabel) {
        tBucket = unsetTrigger;
      } else if (resolved.known && triggerMap.has(resolved.subLabel)) {
        tBucket = triggerMap.get(resolved.subLabel);
      } else if (triggerMap.has(reportKey)) {
        tBucket = triggerMap.get(reportKey);
      } else {
        tBucket = miscTrigger;
      }
      tBucket.count += 1;
      tBucket.minutes += mins;
      const catBucket = triggerCategoryMap.get(catKey);
      if (catBucket) {
        catBucket.count += 1;
        catBucket.minutes += mins;
      } else if (catKey && catKey !== "미선택") {
        const prev = triggerCategoryMap.get(catKey) || {
          count: 0,
          minutes: 0,
        };
        prev.count += 1;
        prev.minutes += mins;
        triggerCategoryMap.set(catKey, prev);
      }
      bumpPairMaps(cat.id, cat.label, reportKey, mins);
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
      trigger: includeTriggers
        ? resolved.known
          ? resolved.label
          : resolved.label || resolved.categoryLabel || ""
        : "",
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

  /** @type {{ label: string, categoryLabel: string, count: number, totalMinutes: number }[]} */
  const triggers = [];
  if (includeTriggers) {
    for (const [label, b] of triggerMap.entries()) {
      if (b?.count > 0) {
        triggers.push({
          label,
          categoryLabel: b.categoryLabel || emotionTriggerCategoryKey(label),
          count: b.count,
          totalMinutes: b.minutes,
        });
      }
    }
    [miscTrigger, unsetTrigger].forEach((b) => {
      if (b.count > 0) {
        triggers.push({
          label: b.label,
          categoryLabel: b.categoryLabel,
          count: b.count,
          totalMinutes: b.minutes,
        });
      }
    });
    triggers.sort(
      (a, b) => b.count - a.count || b.totalMinutes - a.totalMinutes,
    );
  }

  /** @type {{ label: string, count: number, totalMinutes: number }[]} */
  const triggerCategories = [];
  if (includeTriggers) {
    for (const [label, b] of triggerCategoryMap.entries()) {
      if (b.count > 0) {
        triggerCategories.push({
          label,
          count: b.count,
          totalMinutes: b.minutes,
        });
      }
    }
    triggerCategories.sort(
      (a, b) => b.count - a.count || b.totalMinutes - a.totalMinutes,
    );
  }

  const skipTriggerLabel = (label) =>
    !label || label === "기타" || label === "미선택";

  /** @type {{ categoryId: string, categoryLabel: string, count: number, minutes: number, situations: Array<{ label: string, count: number, minutes: number, phrase: string, sentence: string }>, sentences: string[] }[]} */
  const emotionPatterns = [];
  if (includeTriggers) {
    for (const cat of categories) {
      const tMap = emotionToTrigger.get(cat.id);
      const situations = tMap
        ? [...tMap.entries()]
            .filter(([label]) => !skipTriggerLabel(label))
            .map(([label, b]) => {
              const phrase = emotionTriggerSituationPhrase(label);
              const sentence = buildEmotionTriggerPatternSentence(
                label,
                cat.label,
              );
              return {
                label,
                count: b.count,
                minutes: b.minutes,
                phrase,
                sentence,
              };
            })
            .filter((s) => s.sentence)
            .sort((a, b) => b.count - a.count || b.minutes - a.minutes)
        : [];
      emotionPatterns.push({
        categoryId: cat.id,
        categoryLabel: cat.label,
        count: cat.count,
        minutes: cat.minutes,
        situations: situations.slice(0, 6),
        sentences: situations.map((s) => s.sentence).filter(Boolean),
      });
    }
  }

  /** @type {{ label: string, categoryLabel: string, count: number, minutes: number, phrase: string, emotions: Array<{ categoryId: string, categoryLabel: string, count: number, minutes: number }>, sentences: string[], headline: string }[]} */
  const situationPatterns = [];
  /** @type {{ sentence: string, emotionLabel: string, triggerLabel: string, categoryLabel: string, count: number, minutes: number, kind?: string }[]} */
  const patternSentences = [];
  if (includeTriggers) {
    for (const t of triggers) {
      if (skipTriggerLabel(t.label)) continue;
      const phrase = emotionTriggerSituationPhrase(t.label);
      if (!phrase) continue;
      const eMap = triggerToEmotion.get(t.label);
      const emotions = eMap
        ? [...eMap.entries()]
            .map(([categoryId, b]) => ({
              categoryId,
              categoryLabel: b.categoryLabel,
              count: b.count,
              minutes: b.minutes,
            }))
            .sort((a, b) => b.count - a.count || b.minutes - a.minutes)
        : [];
      const sentences = emotions
        .map((e) =>
          buildEmotionTriggerPatternSentence(t.label, e.categoryLabel),
        )
        .filter(Boolean);
      const top = emotions[0];
      const headline = top
        ? buildEmotionTriggerPatternSentence(t.label, top.categoryLabel)
        : phrase;
      situationPatterns.push({
        label: t.label,
        categoryLabel: t.categoryLabel || "",
        count: t.count,
        minutes: t.totalMinutes,
        phrase,
        emotions: emotions.slice(0, 4),
        sentences,
        headline,
      });
      emotions.forEach((e) => {
        const sentence = buildEmotionTriggerPatternSentence(
          t.label,
          e.categoryLabel,
        );
        if (!sentence) return;
        patternSentences.push({
          sentence,
          emotionLabel: e.categoryLabel,
          triggerLabel: t.label,
          categoryLabel: t.categoryLabel || "",
          count: e.count,
          minutes: e.minutes,
          kind: "trigger",
        });
      });
    }
    patternSentences.sort(
      (a, b) => b.count - a.count || b.minutes - a.minutes,
    );
  } else if (polarity === "positive") {
    /** @type {Map<string, { sentence: string, emotionLabel: string, count: number, minutes: number }>} */
    const memoMap = new Map();
    /** @type {Map<string, { sentence: string, emotionLabel: string, count: number, minutes: number }>} */
    const whenMap = new Map();
    for (const e of entries) {
      const memoKey = normalizePositiveMemoKey(e.memo);
      if (memoKey) {
        const sentence = buildPositiveMemoPatternSentence(
          e.categoryLabel,
          memoKey,
        );
        if (sentence) {
          const prev = memoMap.get(sentence) || {
            sentence,
            emotionLabel: e.categoryLabel,
            count: 0,
            minutes: 0,
          };
          prev.count += 1;
          prev.minutes += e.minutes;
          memoMap.set(sentence, prev);
        }
      }
      const when = hourBucketLabel(e.startHour);
      if (when) {
        const sentence = buildPositiveWhenPatternSentence(
          when,
          e.categoryLabel,
        );
        if (sentence) {
          const prev = whenMap.get(sentence) || {
            sentence,
            emotionLabel: e.categoryLabel,
            count: 0,
            minutes: 0,
          };
          prev.count += 1;
          prev.minutes += e.minutes;
          whenMap.set(sentence, prev);
        }
      }
    }
    const memoPatterns = [...memoMap.values()].sort(
      (a, b) => b.count - a.count || b.minutes - a.minutes,
    );
    const whenPatterns = [...whenMap.values()]
      .filter((p) => p.count >= 2)
      .sort((a, b) => b.count - a.count || b.minutes - a.minutes);
    memoPatterns.forEach((p) => {
      patternSentences.push({
        sentence: p.sentence,
        emotionLabel: p.emotionLabel,
        triggerLabel: "",
        categoryLabel: "",
        count: p.count,
        minutes: p.minutes,
        kind: "memo",
      });
    });
    whenPatterns.forEach((p) => {
      patternSentences.push({
        sentence: p.sentence,
        emotionLabel: p.emotionLabel,
        triggerLabel: "",
        categoryLabel: "",
        count: p.count,
        minutes: p.minutes,
        kind: "when",
      });
    });
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
    triggers: triggers.filter((t) => !skipTriggerLabel(t.label)),
    triggerCategories: triggerCategories.filter(
      (t) => !skipTriggerLabel(t.label) && t.label !== "기타",
    ),
    emotionPatterns,
    situationPatterns,
    patternSentences,
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
