/**
 * 레포트 — 습관 점수판
 * 일: 오늘의 목표들 중 매일 반복만 / 주·월: 기간 칸 점수판
 */

import {
  beginHabitTrackerReportPaint,
  buildHabitTrackerRows,
  endHabitTrackerReportPaint,
  getHabitTrackerCellLevel,
} from "./habitTrackerPageModel.js";
import { createHabitTrackerTodayRingElement } from "./habitTrackerTodayRing.js";
import { buildGoalTrackerTodayGoalsModel } from "./kpiGoalTrackerTodayGoals.js";
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
    return { mode: "day", dateKeys: [s], title: "오늘의 행동" };
  }
  const keys = listDatesInclusive(s, e);
  if (keys.length >= 300) {
    const monthKeys = [...new Set(keys.map((dk) => dk.slice(0, 7)).filter(Boolean))];
    return {
      mode: "year",
      dateKeys: keys,
      monthKeys,
      title: "1년 습관 점수판",
    };
  }
  if (keys.length <= 10) {
    return { mode: "week", dateKeys: keys, title: "1주 습관 점수판" };
  }
  if (keys.length <= 40) {
    return { mode: "month", dateKeys: keys, title: "한달 습관 점수판" };
  }
  return { mode: "month", dateKeys: keys, title: "기간 습관 점수판" };
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
    const dayGoals = buildGoalTrackerTodayGoalsModel({
      forYmd: period.dateKeys[0] || start,
      skipSync: !!opts.skipSync,
    });
    return {
      mode: "day",
      title: period.title,
      dateKeys: period.dateKeys,
      habits: [],
      dayGoals,
    };
  }

  /* habitsOnly 목록은 월과 무관 — 한 번만 읽고 페인트 인덱스 공유 */
  const anchor = period.dateKeys[0] || start;
  const ay = Number(anchor.slice(0, 4)) || new Date().getFullYear();
  const am = Number(anchor.slice(5, 7)) || 1;
  const trackerRows = buildHabitTrackerRows(ay, am, {
    skipSync: opts.skipSync !== false,
    habitsOnly: true,
  });

  const isYear = period.mode === "year";
  const monthKeys = Array.isArray(period.monthKeys) ? period.monthKeys : [];

  beginHabitTrackerReportPaint(period.dateKeys, trackerRows);
  try {
    const habits = trackerRows.map((row) => {
      if (isYear) {
        /* 연간 카드는 doneCount만 필요 — 월 칸 completeFlags 생략 */
        let doneCount = 0;
        for (const dk of period.dateKeys) {
          if (isDayComplete(getHabitTrackerCellLevel(row, dk))) doneCount += 1;
        }
        return {
          id: String(row.id || ""),
          label: String(row.label || "루틴").trim() || "루틴",
          completeFlags: [],
          doneCount,
        };
      }
      const dayFlags = period.dateKeys.map((dk) =>
        isDayComplete(getHabitTrackerCellLevel(row, dk)),
      );
      return {
        id: String(row.id || ""),
        label: String(row.label || "루틴").trim() || "루틴",
        completeFlags: dayFlags,
        doneCount: dayFlags.filter(Boolean).length,
      };
    });

    return {
      mode: period.mode,
      title: period.title,
      dateKeys: isYear ? monthKeys : period.dateKeys,
      habits,
      dayGoals: null,
      /** 연간 달성률 분모(일 수) — UI 톤 계산용 */
      periodDayCount: isYear ? period.dateKeys.length : undefined,
    };
  } finally {
    endHabitTrackerReportPaint();
  }
}

/**
 * @param {ReturnType<typeof buildGoalTrackerTodayGoalsModel>} goals
 */
function createReportTodayActionsSplitList(goals) {
  const items = Array.isArray(goals?.items) ? goals.items : [];
  const wrap = document.createElement("div");
  wrap.className = "lp-tr2-today-actions-split";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "lp-tr2-habit-scoreboard-empty";
    empty.textContent = "그날 하기로 한 행동이 없습니다.";
    wrap.appendChild(empty);
    return wrap;
  }
  const missed = items.filter((x) => !x.done);
  const done = items.filter((x) => x.done);
  const groups = [
    { key: "missed", title: "안 한 것", rows: missed },
    { key: "kept", title: "한 것", rows: done },
  ];
  for (const g of groups) {
    const panel = document.createElement("div");
    panel.className = `lp-tr2-today-actions-panel lp-tr2-today-actions-panel--${g.key}`;
    const head = document.createElement("div");
    head.className = "lp-tr2-today-actions-panel-head";
    head.innerHTML = `<span class="lp-tr2-today-actions-panel-title">${g.title}</span><span class="lp-tr2-today-actions-panel-count">${g.rows.length}</span>`;
    panel.appendChild(head);
    if (!g.rows.length) {
      const none = document.createElement("p");
      none.className = "lp-tr2-today-actions-panel-empty";
      none.textContent = g.key === "missed" ? "안 한 행동이 없습니다." : "한 행동이 없습니다.";
      panel.appendChild(none);
    } else {
      const list = document.createElement("ul");
      list.className = "habit-tracker-today-goals-list";
      list.setAttribute("aria-label", g.title);
      for (const item of g.rows) {
        const li = document.createElement("li");
        li.className = `habit-tracker-today-goals-row${item.done ? " is-done" : ""}`;
        li.innerHTML = `
          <span class="habit-tracker-today-goals-mark" aria-label="${item.done ? "실행함" : "미실행"}">${item.done ? "O" : "X"}</span>
          <span class="habit-tracker-today-goals-main">
            <span class="habit-tracker-today-goals-name">${escapeHtml(item.name)}</span>
          </span>
        `;
        list.appendChild(li);
      }
      panel.appendChild(list);
    }
    wrap.appendChild(panel);
  }
  return wrap;
}

/**
 * @param {ReturnType<typeof buildReportHabitScoreboardModel>} model
 */
export function createReportHabitScoreboardElement(model) {
  const root = document.createElement("div");
  root.className = "lp-tr2-habit-scoreboard";
  if (model?.mode === "month" || model?.mode === "year") {
    root.classList.add("lp-tr2-habit-scoreboard--month");
  }
  if (model?.mode === "year") {
    root.classList.add("lp-tr2-habit-scoreboard--year");
  }
  root.setAttribute("aria-label", model?.title || "습관 점수판");
  root.dataset.segCount = String((model?.dateKeys || []).length || 0);

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
      `그날 행동 ${goals.done} / ${goals.total}`,
    );
    ringHost.appendChild(ring);
    root.appendChild(ringHost);
    root.appendChild(createReportTodayActionsSplitList(goals));
    return root;
  }

  const badge = document.createElement("div");
  badge.className = "lp-tr2-habit-scoreboard-badge";
  badge.textContent = model?.title || "습관 점수판";
  root.appendChild(badge);

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

  /* 연간: 월별 막대 대신 실행률 카드(한 줄 3개) */
  if (model?.mode === "year") {
    root.classList.add("lp-tr2-habit-scoreboard--cards");
    badge.remove();
    const totalDays = Math.max(
      1,
      Number(model.periodDayCount) || segCount || 365,
    );
    const grid = document.createElement("div");
    grid.className = "lp-tr2-habit-year-cards";
    grid.setAttribute("role", "list");
    ranked.forEach((h) => {
      const done = Math.max(0, Math.min(totalDays, Number(h.doneCount) || 0));
      const pct = (done / totalDays) * 100;
      const pctLabel =
        pct >= 10 ? pct.toFixed(1) : pct > 0 ? pct.toFixed(1) : "0";
      const card = document.createElement("article");
      card.className = "lp-tr2-habit-year-card";
      card.setAttribute("role", "listitem");
      card.title = `${h.label} · ${done}/${totalDays} · 실행률 ${pctLabel}%`;
      card.innerHTML = `
        <p class="lp-tr2-habit-year-card-name">${escapeHtml(h.label)}</p>
        <p class="lp-tr2-habit-year-card-frac"><strong>${done}</strong><span>/${totalDays}</span></p>
        <p class="lp-tr2-habit-year-card-pct">실행률 ${pctLabel}%</p>
      `;
      grid.appendChild(card);
    });
    body.appendChild(grid);
    root.appendChild(body);
    return root;
  }

  const toneDenom = segCount;
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
          : done / toneDenom >= 0.7
            ? "is-high"
            : done / toneDenom >= 0.4
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
 * @param {{ skipSync?: boolean }} [opts]
 */
export function mountReportHabitScoreboard(parent, range = {}, opts = {}) {
  if (!parent) return null;
  const model = buildReportHabitScoreboardModel({
    start: range.start,
    end: range.end,
    skipSync: !!opts.skipSync,
  });
  const el = createReportHabitScoreboardElement(model);
  parent.appendChild(el);
  return el;
}
