/**
 * 레포트 — 습관 점수판
 * 일: 오늘의 목표들 중 매일 반복만 / 주·월: 기간 칸 점수판
 */

import {
  buildHabitTrackerRows,
  getHabitTrackerCellLevel,
} from "./habitTrackerPageModel.js";
import { createHabitTrackerTodayRingElement } from "./habitTrackerTodayRing.js";
import {
  buildGoalTrackerTodayGoalsModel,
  createGoalTrackerTodayGoalsListElement,
} from "./kpiGoalTrackerTodayGoals.js";
import { timeLedgerLocalTodayYmd } from "./timeLedgerEntriesSupabase.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normYmd(v) {
  return String(v || "")
    .replace(/\//g, "-")
    .slice(0, 10);
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

function isDayComplete(level) {
  return Number(level) >= 4;
}

/**
 * @param {string} start
 * @param {string} end
 */
function resolveScoreboardPeriod(start, end) {
  const s = normYmd(start);
  const e = normYmd(end);
  if (s && s === e) {
    return { mode: "day", dateKeys: [s], title: "오늘의 습관" };
  }
  let keys = listDatesInclusive(s, e);
  if (keys.length > 40) {
    keys = keys.slice(-31);
  }
  if (keys.length <= 10) {
    return { mode: "week", dateKeys: keys, title: "이번주 습관 점수판" };
  }
  return { mode: "month", dateKeys: keys, title: "이번달 습관 점수판" };
}

/**
 * @param {{ start?: string, end?: string, skipSync?: boolean }} [opts]
 */
export function buildReportHabitScoreboardModel(opts = {}) {
  const today = timeLedgerLocalTodayYmd();
  const start = normYmd(opts.start) || today;
  const end = normYmd(opts.end) || start;
  const period = resolveScoreboardPeriod(start, end);

  if (period.mode === "day") {
    const dayGoals = buildGoalTrackerTodayGoalsModel({ habitsOnly: true });
    return {
      mode: "day",
      title: period.title,
      dateKeys: period.dateKeys,
      habits: [],
      dayGoals,
    };
  }

  /** @type {Map<string, object>} */
  const rowById = new Map();
  const months = new Set(
    period.dateKeys.map((dk) => dk.slice(0, 7)).filter(Boolean),
  );
  for (const ym of months) {
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7));
    for (const row of buildHabitTrackerRows(y, m, {
      skipSync: opts.skipSync !== false,
      habitsOnly: true,
    })) {
      if (!rowById.has(row.id)) rowById.set(row.id, row);
    }
  }

  const habits = [...rowById.values()].map((row) => {
    const completeFlags = period.dateKeys.map((dk) =>
      isDayComplete(getHabitTrackerCellLevel(row, dk)),
    );
    const doneCount = completeFlags.filter(Boolean).length;
    return {
      id: String(row.id || ""),
      label: String(row.label || "루틴").trim() || "루틴",
      completeFlags,
      doneCount,
    };
  });

  return {
    mode: period.mode,
    title: period.title,
    dateKeys: period.dateKeys,
    habits,
    dayGoals: null,
  };
}

/**
 * @param {ReturnType<typeof buildReportHabitScoreboardModel>} model
 */
export function createReportHabitScoreboardElement(model) {
  const root = document.createElement("div");
  root.className = "lp-tr2-habit-scoreboard";
  if (model?.mode === "month") {
    root.classList.add("lp-tr2-habit-scoreboard--month");
  }
  root.setAttribute("aria-label", model?.title || "습관 점수판");
  root.dataset.segCount = String((model?.dateKeys || []).length || 0);

  const badge = document.createElement("div");
  badge.className = "lp-tr2-habit-scoreboard-badge";
  badge.textContent = model?.title || "습관 점수판";
  root.appendChild(badge);

  if (model?.mode === "day") {
    const goals = model.dayGoals || {
      done: 0,
      total: 0,
      remaining: 0,
      pct: 0,
      items: [],
    };
    const ringHost = document.createElement("div");
    ringHost.className = "lp-tr2-habit-scoreboard-ring";
    const ring = createHabitTrackerTodayRingElement(goals);
    ring.setAttribute(
      "aria-label",
      `오늘 습관 ${goals.done} / ${goals.total}`,
    );
    ringHost.appendChild(ring);
    root.appendChild(ringHost);
    root.appendChild(createGoalTrackerTodayGoalsListElement(goals));
    return root;
  }

  const habits = Array.isArray(model?.habits) ? model.habits : [];
  const segCount = Math.max(1, (model?.dateKeys || []).length);
  const body = document.createElement("div");
  body.className = "lp-tr2-habit-scoreboard-body";

  if (!habits.length) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-habit-scoreboard-empty";
    empty.textContent = "표시할 습관이 없습니다.";
    body.appendChild(empty);
    root.appendChild(body);
    return root;
  }

  const ranked = habits.slice().sort((a, b) => b.doneCount - a.doneCount);
  body.innerHTML = ranked
    .map((h) => {
      const flags = Array.isArray(h.completeFlags) ? h.completeFlags : [];
      const segs = Array.from({ length: segCount }, (_, i) => {
        const on = !!flags[i];
        return `<span class="lp-tr2-habit-scoreboard-seg${on ? " is-on" : ""}"></span>`;
      }).join("");
      const done = Math.max(0, Number(h.doneCount) || 0);
      const tone =
        done <= 0
          ? "is-zero"
          : done / segCount >= 0.7
            ? "is-high"
            : done / segCount >= 0.4
              ? "is-mid"
              : "is-low";
      return `<div class="lp-tr2-habit-scoreboard-row ${tone}">
        <span class="lp-tr2-habit-scoreboard-name">${escapeHtml(h.label)}</span>
        <div class="lp-tr2-habit-scoreboard-bar" aria-hidden="true">${segs}</div>
        <span class="lp-tr2-habit-scoreboard-days">${done}<span class="lp-tr2-habit-scoreboard-unit">일</span></span>
      </div>`;
    })
    .join("");

  root.appendChild(body);
  return root;
}

/**
 * @param {HTMLElement} parent
 * @param {{ start?: string, end?: string }} range
 */
export function mountReportHabitScoreboard(parent, range = {}) {
  if (!parent) return null;
  const model = buildReportHabitScoreboardModel({
    start: range.start,
    end: range.end,
  });
  const el = createReportHabitScoreboardElement(model);
  parent.appendChild(el);
  return el;
}
