/**
 * 예상 일정 템플릿 — 계정별 localStorage
 * @typedef {{ taskName: string, startHhMm: string, endHhMm: string, memo?: string, detail?: string }} BudgetTemplateBlock
 * @typedef {{ id: string, name: string, blocks: BudgetTemplateBlock[], updatedAt?: number }} BudgetScheduleTemplate
 */

import {
  getScopedLocalStorageItem,
  setScopedLocalStorageItem,
} from "./clientStorageScope.js";

export const TIME_DAILY_BUDGET_TEMPLATES_KEY = "time_daily_budget_templates";

function newTemplateId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** @returns {BudgetScheduleTemplate[]} */
export function readBudgetScheduleTemplates() {
  try {
    const raw = getScopedLocalStorageItem(TIME_DAILY_BUDGET_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t) => normalizeTemplateRow(t))
      .filter((t) => t && t.id && t.name);
  } catch (_) {
    return [];
  }
}

function normalizeTemplateRow(t) {
  if (!t || typeof t !== "object") return null;
  const id = String(t.id || "").trim();
  const name = String(t.name || "").trim();
  if (!id || !name) return null;
  const blocks = (Array.isArray(t.blocks) ? t.blocks : [])
    .map((b) => normalizeBlock(b))
    .filter(Boolean);
  return {
    id,
    name,
    blocks,
    updatedAt: Number(t.updatedAt) || 0,
  };
}

function normalizeBlock(b) {
  if (!b || typeof b !== "object") return null;
  const taskName = String(b.taskName || "").trim();
  const startHhMm = String(b.startHhMm || "").trim();
  const endHhMm = String(b.endHhMm || "").trim();
  if (!taskName || !startHhMm || !endHhMm) return null;
  return {
    taskName,
    startHhMm,
    endHhMm,
    memo: String(b.memo || "").trim(),
    detail: String(b.detail || "").trim(),
  };
}

/** @param {BudgetScheduleTemplate[]} list */
export function writeBudgetScheduleTemplates(list) {
  const next = (Array.isArray(list) ? list : [])
    .map((t) => normalizeTemplateRow(t))
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  setScopedLocalStorageItem(
    TIME_DAILY_BUDGET_TEMPLATES_KEY,
    JSON.stringify(next),
  );
  return next;
}

/** @param {string} name @param {BudgetTemplateBlock[]} blocks */
export function addBudgetScheduleTemplate(name, blocks) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return { ok: false, error: "템플릿 이름을 입력해 주세요." };
  const normalized = (Array.isArray(blocks) ? blocks : [])
    .map((b) => normalizeBlock(b))
    .filter(Boolean);
  if (normalized.length === 0) {
    return { ok: false, error: "저장할 예상 일정이 없습니다." };
  }
  const list = readBudgetScheduleTemplates();
  const row = {
    id: newTemplateId(),
    name: trimmed,
    blocks: normalized,
    updatedAt: Date.now(),
  };
  list.unshift(row);
  writeBudgetScheduleTemplates(list);
  return { ok: true, template: row };
}

/** @param {string} templateId */
export function removeBudgetScheduleTemplate(templateId) {
  const id = String(templateId || "").trim();
  if (!id) return false;
  const list = readBudgetScheduleTemplates();
  const next = list.filter((t) => t.id !== id);
  if (next.length === list.length) return false;
  writeBudgetScheduleTemplates(next);
  return true;
}

/** 서버 스냅샷으로 로컬 덮기 — 빈 서버면 false */
export function mergeBudgetScheduleTemplatesFromServer(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const next = rows
    .map((r) => {
      const id = String(r.template_id || r.id || "").trim();
      const name = String(r.name || "").trim();
      const blocks = (Array.isArray(r.blocks) ? r.blocks : [])
        .map((b) => normalizeBlock(b))
        .filter(Boolean);
      if (!id || !name) return null;
      return {
        id,
        name,
        blocks,
        updatedAt: r.updated_at ? Date.parse(r.updated_at) || 0 : 0,
      };
    })
    .filter(Boolean);
  if (next.length === 0) return false;
  writeBudgetScheduleTemplates(next);
  return true;
}

/** @param {BudgetScheduleTemplate[]} list */
export function buildBudgetTemplateUpsertPayloads(userId, list) {
  const uid = String(userId || "").trim();
  if (!uid) return [];
  return (Array.isArray(list) ? list : []).map((t) => ({
    user_id: uid,
    template_id: t.id,
    name: t.name,
    blocks: t.blocks,
    updated_at: t.updatedAt
      ? new Date(t.updatedAt).toISOString()
      : new Date().toISOString(),
  }));
}
