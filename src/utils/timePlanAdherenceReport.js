/**
 * 시간 레포트 — 계획(예상 일정) vs 실제 기록 비교
 */

import { getBudgetGoals, parseTimeToHours } from "../views/Time.js";
import { getTaskOptionByName } from "./timeTaskOptionsModel.js";

const BUDGET_PLACEHOLDER_PREFIX = "(과제 선택)·";

const CATEGORY_LABELS = {
  sideincome: "시급 상승",
  happiness: "행복",
  health: "건강",
  pleasure: "쾌락",
  media_watch: "미디어",
  unhappiness: "불행",
  unhealthy: "비건강",
  moneylosing: "돈 잃는 일",
  work: "근무",
  sleep: "수면",
  other: "기타",
  "": "기타",
};

function normYmd(s) {
  return String(s || "").replace(/\//g, "-").slice(0, 10);
}

function addDaysYmd(ymd, delta) {
  const key = normYmd(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const [y, mo, d] = key.split("-").map(Number);
  const dt = new Date(y, mo - 1, d + delta);
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function listDatesInclusive(startYmd, endYmd) {
  const out = [];
  let cur = normYmd(startYmd);
  const end = normYmd(endYmd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cur) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return out;
  }
  while (cur <= end) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

function parseClockToMinutesOfDay(str) {
  if (!str || typeof str !== "string") return null;
  const t = str.trim();
  const m = t.match(/[T\s](\d{1,2}):(\d{2})/) || t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return ((h % 24) + 24) % 24 * 60 + ((min % 60) + 60) % 60;
}

function parseGoalDurationMinutes(goalTime) {
  const m = parseClockToMinutesOfDay(String(goalTime || "").trim());
  return m == null ? 0 : m;
}

function parseScheduledSlot(slotStr) {
  const parts = String(slotStr || "").trim().split("-");
  if (parts.length < 2) return null;
  const startMin = parseClockToMinutesOfDay(parts[0].trim());
  const endMin = parseClockToMinutesOfDay(parts[1].trim());
  if (startMin == null || endMin == null || endMin <= startMin) return null;
  return { startMin, endMin, durationMin: endMin - startMin };
}

function rowDateYmd(r) {
  return normYmd(r?.date);
}

function rowEffectiveMinutes(r) {
  const hrs = parseTimeToHours(r?.timeTracked);
  if (hrs > 0 && Number.isFinite(hrs)) return Math.round(hrs * 60);
  const st = parseClockToMinutesOfDay(String(r?.startTime || ""));
  const en = parseClockToMinutesOfDay(String(r?.endTime || ""));
  if (st != null && en != null && en > st) return en - st;
  return 0;
}

function taskCategoryKey(taskName) {
  const opt = getTaskOptionByName(String(taskName || "").trim());
  const cat = String(opt?.category || "").trim();
  return cat || "other";
}

function categoryLabel(key) {
  return CATEGORY_LABELS[key] || CATEGORY_LABELS.other;
}

function plannedMetaForDay(ymd) {
  const goals = getBudgetGoals(ymd);
  /** @type {Map<string, number>} */
  const plannedByTask = new Map();
  /** @type {Set<string>} */
  const plannedNames = new Set();
  /** @type {{ taskName: string, startMin: number, endMin: number }[]} */
  const blocks = [];

  for (const [taskName, data] of Object.entries(goals || {})) {
    if (String(taskName).startsWith(BUDGET_PLACEHOLDER_PREFIX)) continue;
    const name = String(taskName || "").trim();
    if (!name || !data || typeof data !== "object") continue;

    let totalExpected = 0;
    const sched = Array.isArray(data.scheduledTimes)
      ? data.scheduledTimes
      : data.scheduledTime && String(data.scheduledTime).trim()
        ? [String(data.scheduledTime).trim()]
        : [];

    for (const slot of sched) {
      const p = parseScheduledSlot(slot);
      if (!p) continue;
      totalExpected += p.durationMin;
      blocks.push({
        taskName: name,
        startMin: p.startMin,
        endMin: p.endMin,
      });
    }

    const gt = data.goalTime && String(data.goalTime).trim();
    if (totalExpected <= 0 && gt) {
      const dm = parseGoalDurationMinutes(gt);
      if (dm > 0) totalExpected = dm;
    }
    if (totalExpected <= 0) continue;

    plannedNames.add(name);
    plannedByTask.set(name, (plannedByTask.get(name) || 0) + totalExpected);
  }

  blocks.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  return { plannedByTask, plannedNames, blocks };
}

function actualByTaskForDay(rows, ymd) {
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const r of rows) {
    if (rowDateYmd(r) !== ymd) continue;
    const name = String(r.taskName || "").trim();
    if (!name) continue;
    const mins = rowEffectiveMinutes(r);
    if (mins <= 0) continue;
    map.set(name, (map.get(name) || 0) + mins);
  }
  return map;
}

function formatHoursMinutesShort(totalMinutes) {
  const n = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (n < 60) return `${n}분`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/**
 * @param {{ start: string, end: string }} range
 * @param {object[]} rows
 */
export function buildPlanAdherenceReportSnapshot(range, rows) {
  const start = normYmd(range?.start);
  const end = normYmd(range?.end || range?.start);
  const empty = () => ({
    hasPlanData: false,
    dayCount: 0,
    isSingleDay: true,
    plannedMinutes: 0,
    executedMinutes: 0,
    adherencePct: 0,
    oneLiner: "",
    categories: [],
    leak: { minutes: 0, pct: 0, items: [] },
    estimation: null,
    categoryRank: null,
  });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return empty();
  }

  const days = listDatesInclusive(start, end);
  const ledgerRows = Array.isArray(rows) ? rows : [];

  let totalPlanned = 0;
  let totalExecuted = 0;
  let totalActualAll = 0;
  let totalLeak = 0;
  /** @type {Map<string, { planned: number, actual: number }>} */
  const catAgg = new Map();
  /** @type {Map<string, number>} */
  const leakByTask = new Map();
  /** @type {number[]} */
  const biasSamples = [];
  let hasPlanData = false;

  for (const day of days) {
    const { plannedByTask, plannedNames } = plannedMetaForDay(day);
    if (plannedByTask.size > 0) hasPlanData = true;
    const actualByTask = actualByTaskForDay(ledgerRows, day);

    for (const [name, plannedMin] of plannedByTask.entries()) {
      totalPlanned += plannedMin;
      const actualMin = actualByTask.get(name) || 0;
      totalExecuted += Math.min(actualMin, plannedMin);

      const cat = taskCategoryKey(name);
      const cur = catAgg.get(cat) || { planned: 0, actual: 0 };
      cur.planned += plannedMin;
      catAgg.set(cat, cur);

      if (actualMin > 0 && plannedMin > 0) {
        biasSamples.push((actualMin - plannedMin) / plannedMin);
      }
    }

    for (const r of ledgerRows) {
      if (rowDateYmd(r) !== day) continue;
      const mins = rowEffectiveMinutes(r);
      if (mins <= 0) continue;
      totalActualAll += mins;
      const name = String(r.taskName || "").trim();
      if (!name) continue;
      const cat = taskCategoryKey(name);
      const cur = catAgg.get(cat) || { planned: 0, actual: 0 };
      cur.actual += mins;
      catAgg.set(cat, cur);

      if (!plannedNames.has(name)) {
        totalLeak += mins;
        leakByTask.set(name, (leakByTask.get(name) || 0) + mins);
      }
    }

  }

  if (!hasPlanData) return empty();

  const adherencePct =
    totalPlanned > 0
      ? Math.round((totalExecuted / totalPlanned) * 100)
      : 0;

  const periodLabel =
    days.length === 1 ? "계획" : `계획(${days.length}일)`;
  const oneLiner = `${periodLabel} ${formatHoursMinutesShort(totalPlanned)} 중 ${formatHoursMinutesShort(totalExecuted)} 실행 = ${adherencePct}%`;

  const categories = [...catAgg.entries()]
    .filter(([, v]) => v.planned > 0 || v.actual > 0)
    .map(([key, v]) => ({
      key,
      label: categoryLabel(key),
      plannedMin: v.planned,
      actualMin: v.actual,
      adherencePct:
        v.planned > 0
          ? Math.round((Math.min(v.actual, v.planned) / v.planned) * 100)
          : null,
    }))
    .sort(
      (a, b) =>
        b.plannedMin - a.plannedMin ||
        b.actualMin - a.actualMin ||
        a.label.localeCompare(b.label, "ko"),
    );

  const leakItems = [...leakByTask.entries()]
    .map(([taskName, minutes]) => ({ taskName, minutes }))
    .sort((a, b) => b.minutes - a.minutes || a.taskName.localeCompare(b.taskName, "ko"))
    .slice(0, 5);

  const leakPct =
    totalActualAll > 0 ? Math.round((totalLeak / totalActualAll) * 100) : 0;

  let estimation = null;
  if (biasSamples.length >= 2) {
    const avg =
      biasSamples.reduce((a, b) => a + b, 0) / biasSamples.length;
    const biasPct = Math.round(avg * 100);
    let message = "";
    if (biasPct > 8) {
      message = `작업 시간을 평균 ${biasPct}% 짧게 잡는 편이에요.`;
    } else if (biasPct < -8) {
      message = `계획보다 평균 ${Math.abs(biasPct)}% 길게 잡는 편이에요.`;
    } else {
      message = "계획과 실제 시간이 비교적 잘 맞아요.";
    }
    estimation = { biasPct, sampleCount: biasSamples.length, message };
  }

  let categoryRank = null;
  const ranked = categories.filter((c) => c.plannedMin > 0 && c.adherencePct != null);
  if (ranked.length >= 2) {
    const sorted = [...ranked].sort(
      (a, b) => (b.adherencePct ?? 0) - (a.adherencePct ?? 0),
    );
    categoryRank = {
      best: {
        label: sorted[0].label,
        pct: sorted[0].adherencePct ?? 0,
      },
      worst: {
        label: sorted[sorted.length - 1].label,
        pct: sorted[sorted.length - 1].adherencePct ?? 0,
      },
    };
  }

  return {
    hasPlanData: true,
    dayCount: days.length,
    isSingleDay: days.length === 1,
    plannedMinutes: totalPlanned,
    executedMinutes: totalExecuted,
    adherencePct,
    oneLiner,
    categories,
    leak: {
      minutes: totalLeak,
      pct: leakPct,
      items: leakItems,
    },
    estimation,
    categoryRank,
  };
}
