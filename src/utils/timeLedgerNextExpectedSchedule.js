/**
 * 레코딩(시간 사용내역) — 오늘 예상 일정 중 「지금 곧 할」 블록
 */

import { getBudgetGoals } from "../views/Time.js";

function normalizeDateKey(s) {
  const d = String(s || "").replace(/\//g, "-").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

function normalizeHhMm(raw) {
  const m = String(raw || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function minutesFromHhMm(hhmm) {
  const n = normalizeHhMm(hhmm);
  if (!n) return null;
  const [h, m] = n.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}

function collectBudgetBlocksForDate(dateKey) {
  const dk = normalizeDateKey(dateKey);
  if (!dk) return [];
  const goals = getBudgetGoals(dk);
  /** @type {{ taskName: string, startHhMm: string, endHhMm: string, memo: string, detail: string, startMin: number, endMin: number }[]} */
  const blocks = [];
  for (const [taskName, data] of Object.entries(goals || {})) {
    const name = String(taskName || "").trim();
    if (!name || !data || typeof data !== "object") continue;
    if (name.startsWith("(과제 선택)·")) continue;
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
      const parts = String(scheduledTimes[i] || "").trim().split("-");
      if (parts.length < 2) continue;
      const startHhMm = normalizeHhMm(parts[0]);
      const endHhMm = normalizeHhMm(parts[1]);
      const startMin = minutesFromHhMm(startHhMm);
      const endMin = minutesFromHhMm(endHhMm);
      if (startMin == null || endMin == null || endMin <= startMin) continue;
      blocks.push({
        taskName: name,
        startHhMm,
        endHhMm,
        memo: String(memos[i] || "").trim(),
        detail: String(details[i] || "").trim(),
        startMin,
        endMin,
      });
    }
  }
  blocks.sort(
    (a, b) =>
      a.startMin - b.startMin ||
      a.endMin - b.endMin ||
      a.taskName.localeCompare(b.taskName, "ko"),
  );
  return blocks;
}

/**
 * 예상 일정 중 「다음 예정」 1건 — 시작 전 lookahead 분 이내이거나 진행 중인 블록.
 * @param {string} dateKey YYYY-MM-DD
 * @param {{ now?: Date, lookaheadMinutesBeforeStart?: number }} [opts]
 */
export function findNextExpectedBudgetBlockForRecording(dateKey, opts = {}) {
  const dk = normalizeDateKey(dateKey);
  if (!dk) return null;
  const now = opts.now instanceof Date ? opts.now : new Date();
  const lookahead = Number(opts.lookaheadMinutesBeforeStart);
  const lookaheadMin = Number.isFinite(lookahead) ? Math.max(0, lookahead) : 30;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  for (const block of collectBudgetBlocksForDate(dk)) {
    if (block.endMin <= nowMin) continue;
    if (nowMin < block.startMin - lookaheadMin) continue;
    return block;
  }
  return null;
}
