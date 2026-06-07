/**
 * 예상 일정 템플릿 — 날짜에서 추출·적용
 */

import {
  appendBudgetScheduleBlock,
  clearBudgetScheduleBlocksForDate,
  getBudgetGoals,
} from "../views/Time.js";
import { syncTimeDailyBudgetDateToSupabase } from "./timeDailyBudgetSupabase.js";
import {
  addBudgetScheduleTemplate,
  readBudgetScheduleTemplates,
} from "./timeDailyBudgetTemplateModel.js";
import {
  pullBudgetScheduleTemplatesFromSupabase,
  syncBudgetScheduleTemplateToSupabase,
} from "./timeDailyBudgetTemplateSupabase.js";

function normalizeDateKey(s) {
  const d = String(s || "").replace(/\//g, "-").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

function parseRangeToHhMm(range) {
  const parts = String(range || "").trim().split("-");
  if (parts.length < 2) return null;
  const startHhMm = parts[0].trim();
  const endHhMm = parts[1].trim();
  if (!startHhMm || !endHhMm) return null;
  return { startHhMm, endHhMm };
}

function minutesFromHhMm(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
}

/** @param {string} dateKey */
export function extractBudgetBlocksFromDateKey(dateKey) {
  const dk = normalizeDateKey(dateKey);
  if (!dk) return [];
  const goals = getBudgetGoals(dk);
  /** @type {import("./timeDailyBudgetTemplateModel.js").BudgetTemplateBlock[]} */
  const blocks = [];
  for (const [taskName, data] of Object.entries(goals || {})) {
    const name = String(taskName || "").trim();
    if (!name || !data || typeof data !== "object") continue;
    let scheduledTimes = [];
    let memos = [];
    let details = [];
    if (Array.isArray(data.scheduledTimes)) {
      scheduledTimes = data.scheduledTimes.filter((x) => x && String(x).trim());
      memos = Array.isArray(data.scheduleMemos) ? data.scheduleMemos : [];
      details = Array.isArray(data.scheduleDetails) ? data.scheduleDetails : [];
    } else if (data.scheduledTime && String(data.scheduledTime).trim()) {
      scheduledTimes = [String(data.scheduledTime).trim()];
      memos = Array.isArray(data.scheduleMemos) ? data.scheduleMemos : [];
      details = Array.isArray(data.scheduleDetails) ? data.scheduleDetails : [];
    }
    for (let i = 0; i < scheduledTimes.length; i++) {
      const parsed = parseRangeToHhMm(scheduledTimes[i]);
      if (!parsed) continue;
      blocks.push({
        taskName: name,
        startHhMm: parsed.startHhMm,
        endHhMm: parsed.endHhMm,
        memo: String(memos[i] || "").trim(),
        detail: String(details[i] || "").trim(),
      });
    }
  }
  blocks.sort(
    (a, b) =>
      minutesFromHhMm(a.startHhMm) - minutesFromHhMm(b.startHhMm) ||
      minutesFromHhMm(a.endHhMm) - minutesFromHhMm(b.endHhMm),
  );
  return blocks;
}

/**
 * @param {string} dateKey
 * @param {string} name
 */
export async function saveBudgetDayAsTemplate(dateKey, name) {
  const blocks = extractBudgetBlocksFromDateKey(dateKey);
  const result = addBudgetScheduleTemplate(name, blocks);
  if (!result.ok) return result;
  try {
    await syncBudgetScheduleTemplateToSupabase(result.template);
  } catch (_) {}
  return result;
}

/**
 * @param {string} dateKey
 * @param {string} templateId
 * @param {"append"|"replace"} mode
 */
export async function applyBudgetTemplateToDateKey(dateKey, templateId, mode) {
  const dk = normalizeDateKey(dateKey);
  const id = String(templateId || "").trim();
  if (!dk) return { ok: false, error: "날짜가 올바르지 않습니다." };
  if (!id) return { ok: false, error: "템플릿을 선택해 주세요." };
  const tpl = readBudgetScheduleTemplates().find((t) => t.id === id);
  if (!tpl) return { ok: false, error: "템플릿을 찾을 수 없습니다." };
  if (!tpl.blocks.length) {
    return { ok: false, error: "템플릿에 일정이 없습니다." };
  }
  if (mode === "replace") {
    clearBudgetScheduleBlocksForDate(dk);
  }
  let fail = 0;
  for (const b of tpl.blocks) {
    const r = appendBudgetScheduleBlock(
      dk,
      b.taskName,
      b.startHhMm,
      b.endHhMm,
      b.memo || "",
      b.detail || "",
    );
    if (!r?.ok) fail++;
  }
  try {
    await syncTimeDailyBudgetDateToSupabase(dk);
  } catch (_) {}
  if (fail > 0 && fail === tpl.blocks.length) {
    return { ok: false, error: "일정을 적용하지 못했습니다." };
  }
  return { ok: true, applied: tpl.blocks.length - fail, failed: fail };
}

export async function ensureBudgetTemplatesLoaded() {
  try {
    const pulled = await pullBudgetScheduleTemplatesFromSupabase();
    if (!pulled) {
      const { pushAllLocalBudgetTemplatesIfServerEmpty } = await import(
        "./timeDailyBudgetTemplateSupabase.js"
      );
      await pushAllLocalBudgetTemplatesIfServerEmpty();
    }
  } catch (_) {}
}
