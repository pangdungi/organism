/**
 * 목표 진행 상황 — 오늘의 목표들 (링 + KPI명·목표값·실행여부)
 */

import { createHabitTrackerTodayRingElement } from "./habitTrackerTodayRing.js";
import { kpiHasHabitUnitGoal } from "./kpiHabitUnitGoal.js";
import { isKpiHabitDateBeforeStart } from "./kpiHabitTrackerStartDate.js";
import {
  collectKpiHabitSuccessDateKeys,
  getKpiHabitTodayNumericValue,
} from "./kpiHabitStreak.js";
import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import { filterKpisByProgressStatus } from "./kpiProgressStatus.js";
import { resolveKpiDetailLogEntriesLocal } from "./kpiTimeLedgerLogs.js";
import { computeKpiProgress, resolveKpiGoalMode } from "./kpiTimeUnitKpi.js";
import {
  getAccumulatedMinutesForKpiIdOnDate,
  normalizeKpiLogDateYmd,
  syncHabitTrackerLogs,
} from "./timeKpiSync.js";
import { timeLedgerLocalTodayYmd } from "./timeLedgerEntriesSupabase.js";
import { isHabitScheduledOnYmd } from "./kpiHabitWeekdays.js";
import {
  DEFAULT_CHECKUP_KPI_ID,
  DEFAULT_READING_KPI_ID,
} from "./defaultKpiIconIds.js";
import {
  appendTodayActionPinnedTodos,
  readTodayActionExtraIds,
  readTodayActionHiddenIds,
  showTodayActionTodosModal,
} from "./kpiTodayActionTodos.js";
import { readTimeDailyBudgetGoalsRaw } from "./timeDailyBudgetModel.js";
import { getTaskOptionByName } from "./timeTaskOptionsModel.js";
import { resolveKpiIdForTaskId } from "./kpiTodoSync.js";

const BUDGET_PLACEHOLDER_PREFIX = "(과제 선택)·";

/** 오늘의 행동 목록에서 제외 — 기본 KPI「건강검진」「독서하기」 */
const TODAY_GOALS_EXCLUDED_KPI_IDS = new Set([
  DEFAULT_CHECKUP_KPI_ID,
  DEFAULT_READING_KPI_ID,
]);

const DOMAINS = [
  { storageKey: "kpi-sideincome-paths", category: "시급" },
  { storageKey: "kpi-health-map", category: "건강" },
  { storageKey: "kpi-happiness-map", category: "행복" },
];

function loadMap(storageKey) {
  try {
    const raw = readKpiMapScopedStorageRaw(storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function parseNum(str) {
  const n = parseFloat(String(str || "").replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function toDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDisplayNum(n) {
  if (n == null || Number.isNaN(Number(n))) return "0";
  const x = Number(n);
  if (Number.isInteger(x)) return String(x);
  return String(Math.round(x * 100) / 100);
}

function progressForKpi(kpi, data) {
  return computeKpiProgress(kpi, {
    getAllKpiLogs: () => data.kpiLogs || [],
    getKpiTodos: (kpiId) =>
      (data.kpiTodos || []).filter(
        (t) => String(t?.kpiId || "") === String(kpiId || ""),
      ),
    getKpiTaskCompletionEvents: (kpiId) =>
      (data.kpiTaskCompletionEvents || []).filter(
        (e) => String(e?.kpiId || "") === String(kpiId || ""),
      ),
    parseNum,
    toDateKey,
  });
}

function formatMinutesShort(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  if (m <= 0) return "0분";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r}분`;
  if (r <= 0) return `${h}시간`;
  return `${h}시간 ${r}분`;
}

/** 목표값이 있으면 `한 양 / 목표` 형태 */
function formatTodayTargetLabel(kpi, data, todayYmd) {
  const mode = resolveKpiGoalMode(kpi);
  const unit = String(kpi?.unit || "").trim();
  const logs = data.kpiLogs || [];

  if (mode === "habit") {
    if (kpiHasHabitUnitGoal(kpi)) {
      const goalNum = parseNum(kpi.targetValue);
      const result = getKpiHabitTodayNumericValue(kpi, logs, todayYmd);
      return `${formatDisplayNum(result)} / ${formatDisplayNum(goalNum)}${unit}`;
    }
    return "매일";
  }
  if (mode === "task") {
    const todos = (data.kpiTodos || []).filter(
      (t) =>
        String(t?.kpiId || "") === String(kpi?.id || "") &&
        String(t?.text || "").trim(),
    );
    const total = todos.length;
    if (total <= 0) return "과제";
    const doneCount = todos.filter((t) => !!t.completed).length;
    return `${doneCount} / ${total}개`;
  }
  if (mode === "time") {
    const raw = String(kpi?.targetValue || kpi?.targetTimeRequired || "").trim();
    if (!raw) return "시간";
    const mins = getAccumulatedMinutesForKpiIdOnDate(
      kpi?.id,
      kpi?.name,
      todayYmd,
    );
    return `${formatMinutesShort(mins)} / ${raw}`;
  }
  const raw = String(kpi?.targetValue || "").trim();
  if (!raw) return "—";
  const goalNum = parseNum(raw);
  if (goalNum > 0 || unit) {
    const result = getKpiHabitTodayNumericValue(kpi, logs, todayYmd);
    const goalLabel = goalNum > 0 ? formatDisplayNum(goalNum) : raw;
    return `${formatDisplayNum(result)} / ${goalLabel}${unit}`;
  }
  return raw;
}

function hasLogOrLedgerActivityToday(kpi, logs, todayYmd) {
  const kid = String(kpi?.id || "").trim();
  if (!kid) return false;
  const entries = resolveKpiDetailLogEntriesLocal(kpi, logs);
  for (const entry of entries) {
    if (normalizeKpiLogDateYmd(entry?.dateRaw || entry?.date || "") !== todayYmd) {
      continue;
    }
    const v = String(entry?.value ?? "").trim();
    const hasChecks = (entry?.dailyCompleted || []).length > 0;
    const hasLedger =
      (Array.isArray(entry?.timeLedgerEntryIds) &&
        entry.timeLedgerEntryIds.length > 0) ||
      Number(entry?.__ledgerMinutes) > 0;
    if (hasChecks || hasLedger || (v && v !== "0")) return true;
  }
  if (getAccumulatedMinutesForKpiIdOnDate(kid, kpi?.name, todayYmd) > 0) {
    return true;
  }
  return false;
}

function hasTaskCompletionToday(kpi, data, todayYmd) {
  const kid = String(kpi?.id || "").trim();
  for (const e of data.kpiTaskCompletionEvents || []) {
    if (String(e?.kpiId || "").trim() !== kid) continue;
    const dk = normalizeKpiLogDateYmd(
      e?.dateRaw || e?.date || e?.completedAt || e?.createdAt || "",
    );
    if (dk === todayYmd) return true;
  }
  return hasLogOrLedgerActivityToday(kpi, data.kpiLogs || [], todayYmd);
}

function isKpiExecutedToday(kpi, data, todayYmd) {
  const mode = resolveKpiGoalMode(kpi);
  const logs = data.kpiLogs || [];

  if (mode === "habit") {
    if (isKpiHabitDateBeforeStart(kpi, todayYmd)) return false;
    if (kpiHasHabitUnitGoal(kpi)) {
      const goalNum = parseNum(kpi.targetValue);
      const result = getKpiHabitTodayNumericValue(kpi, logs, todayYmd);
      return goalNum > 0 ? result >= goalNum : result > 0;
    }
    return collectKpiHabitSuccessDateKeys(kpi, logs).has(todayYmd);
  }
  if (mode === "task") {
    return hasTaskCompletionToday(kpi, data, todayYmd);
  }
  return hasLogOrLedgerActivityToday(kpi, logs, todayYmd);
}

function scheduledTimesForBudgetTask(data) {
  if (!data) return [];
  if (Array.isArray(data.scheduledTimes)) {
    return data.scheduledTimes.filter((x) => x && String(x).trim());
  }
  if (data.scheduledTime && String(data.scheduledTime).trim()) {
    return [String(data.scheduledTime).trim()];
  }
  return [];
}

/** 그날 예상일정에 올라간 행동 KPI id */
function listExpectedScheduleKpiIdsForYmd(ymd) {
  const key = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return [];
  let goals = {};
  try {
    const raw = readTimeDailyBudgetGoalsRaw();
    const all = raw ? JSON.parse(raw) : {};
    const day = all[key];
    if (day && typeof day === "object" && !Array.isArray(day)) goals = day;
  } catch (_) {
    return [];
  }
  const ids = [];
  const seen = new Set();
  for (const [taskName, data] of Object.entries(goals)) {
    if (String(taskName).startsWith(BUDGET_PLACEHOLDER_PREFIX)) continue;
    if (!scheduledTimesForBudgetTask(data).length) continue;
    const opt = getTaskOptionByName(taskName);
    const kid =
      resolveKpiIdForTaskId(opt?.id) || String(opt?.kpiId || "").trim();
    if (!kid || seen.has(kid)) continue;
    seen.add(kid);
    ids.push(kid);
  }
  return ids;
}

function makeTodayGoalItem(kpi, data, category, todayYmd) {
  const id = String(kpi?.id || "").trim();
  const isHabit = resolveKpiGoalMode(kpi) === "habit" || !!kpi?.needHabitTracker;
  return {
    id,
    name: String(kpi?.name || "").trim(),
    targetLabel: formatTodayTargetLabel(kpi, data, todayYmd),
    done: isKpiExecutedToday(kpi, data, todayYmd),
    category,
    isHabit,
  };
}

/**
 * 진행중 KPI (시급·건강·행복) — 오늘 할 목록
 * 기본 KPI「건강검진」「독서하기」는 제외
 * @param {{ habitsOnly?: boolean, forYmd?: string }} [opts]
 *   habitsOnly — true면 매일 반복만
 *   forYmd — 그 날짜 기준으로 목록·실행여부 (없으면 오늘). 오늘 빼기·추가는 오늘만 반영
 * @returns {{
 *   todayYmd: string,
 *   done: number,
 *   total: number,
 *   remaining: number,
 *   pct: number,
 *   items: Array<{ id: string, name: string, targetLabel: string, done: boolean, category: string, isHabit: boolean }>
 * }}
 */
export function buildGoalTrackerTodayGoalsModel(opts = {}) {
  if (!opts.skipSync) {
    try {
      syncHabitTrackerLogs();
    } catch (_) {}
  }

  const realToday = timeLedgerLocalTodayYmd() || toDateKey();
  const asked = String(opts.forYmd || "").slice(0, 10);
  const todayYmd = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : realToday;
  const applyTodayEdits = todayYmd === realToday;
  const hidden = new Set(
    applyTodayEdits ? readTodayActionHiddenIds(todayYmd) : [],
  );
  const extra = applyTodayEdits ? readTodayActionExtraIds(todayYmd) : [];
  /** @type {Array<{ id: string, name: string, targetLabel: string, done: boolean, category: string, isHabit: boolean }>} */
  const items = [];
  /** @type {Map<string, { kpi: object, data: object, category: string }>} */
  const byId = new Map();

  for (const domain of DOMAINS) {
    const data = loadMap(domain.storageKey);
    const list = Array.isArray(data.kpis) ? data.kpis : [];
    for (const kpi of list) {
      const id = String(kpi?.id || "").trim();
      const name = String(kpi?.name || "").trim();
      if (!id || !name) continue;
      if (!byId.has(id)) byId.set(id, { kpi, data, category: domain.category });
    }
    const active = filterKpisByProgressStatus(list, "active", (kpi) =>
      progressForKpi(kpi, data),
    );
    for (const kpi of active) {
      const id = String(kpi?.id || "").trim();
      const name = String(kpi?.name || "").trim();
      if (!id || !name) continue;
      if (TODAY_GOALS_EXCLUDED_KPI_IDS.has(id)) continue;
      const isHabit = resolveKpiGoalMode(kpi) === "habit" || !!kpi?.needHabitTracker;
      if (opts.habitsOnly && !isHabit) continue;
      if (isHabit && isKpiHabitDateBeforeStart(kpi, todayYmd)) {
        continue;
      }
      /* 매일하기 — 하는 요일이 아니면 오늘의 행동·습관 목록에서 제외 */
      if (isHabit && !isHabitScheduledOnYmd(kpi, todayYmd)) {
        continue;
      }
      if (hidden.has(id)) continue;
      items.push(makeTodayGoalItem(kpi, data, domain.category, todayYmd));
    }
  }

  const pushIfMissing = (kpiId, { ignoreHidden = false } = {}) => {
    const id = String(kpiId || "").trim();
    if (!id) return;
    if (!ignoreHidden && hidden.has(id)) return;
    if (items.some((x) => x.id === id)) return;
    const found = byId.get(id);
    if (!found) return;
    const isHabit =
      resolveKpiGoalMode(found.kpi) === "habit" || !!found.kpi?.needHabitTracker;
    if (opts.habitsOnly && !isHabit) return;
    items.push(makeTodayGoalItem(found.kpi, found.data, found.category, todayYmd));
  };

  for (const extraId of extra) {
    pushIfMissing(extraId);
  }
  for (const scheduledId of listExpectedScheduleKpiIdsForYmd(todayYmd)) {
    pushIfMissing(scheduledId, { ignoreHidden: true });
  }

  /* 매일 반복 먼저, 그다음 나머지 */
  items.sort((a, b) => Number(!!b.isHabit) - Number(!!a.isHabit));

  const total = items.length;
  const done = items.filter((x) => x.done).length;
  const remaining = Math.max(0, total - done);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { todayYmd, done, total, remaining, pct, items };
}

/**
 * 목록 DOM만 생성 (제목·링 없이)
 * @param {ReturnType<typeof buildGoalTrackerTodayGoalsModel>} model
 */
export function createGoalTrackerTodayGoalsListElement(model) {
  const items = Array.isArray(model?.items) ? model.items : [];
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "habit-tracker-today-goals-empty";
    empty.textContent = "오늘 할 매일 반복 목표가 없습니다.";
    return empty;
  }
  const list = document.createElement("ul");
  list.className = "habit-tracker-today-goals-list";
  list.setAttribute("aria-label", "오늘의 습관 목록");
  for (const item of items) {
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
  return list;
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   pinChrome?: boolean,
 *   skipSync?: boolean,
 * }} [opts]
 *   pinChrome — 제목·링을 스크롤 밖에 두고 목록만 스크롤 (3분할)
 */
export function mountKpiGoalTodayGoalsSection(container, opts = {}) {
  if (!container) return;

  container
    .querySelectorAll(".habit-tracker-today-goals-section")
    .forEach((el) => el.remove());
  container
    .querySelectorAll(".habit-tracker-today-goals-pin")
    .forEach((el) => el.remove());

  const model = buildGoalTrackerTodayGoalsModel({
    skipSync: !!opts.skipSync,
  });
  const pinChrome = !!opts.pinChrome;

  const chrome = document.createElement("div");
  chrome.className = pinChrome
    ? "habit-tracker-today-goals-sticky habit-tracker-today-goals-sticky--pin"
    : "habit-tracker-today-goals-sticky";

  if (pinChrome) {
    const head = document.createElement("h2");
    head.className = "habit-tracker-today-goals-title";
    head.textContent = "오늘의 행동";
    chrome.appendChild(head);
  }

  const ringHost = document.createElement("div");
  ringHost.className = "habit-tracker-today-goals-ring-host";
  const ringEl = createHabitTrackerTodayRingElement({
    done: model.done,
    total: model.total,
    remaining: model.remaining,
    pct: model.pct,
  });
  ringEl.setAttribute(
    "aria-label",
    `오늘 행동 ${model.done} / ${model.total}`,
  );
  ringHost.appendChild(ringEl);
  chrome.appendChild(ringHost);

  /** @type {HTMLElement} */
  let listParent;
  if (pinChrome) {
    const pin = document.createElement("div");
    pin.className = "habit-tracker-today-goals-pin";
    const scroll = document.createElement("div");
    scroll.className = "habit-tracker-today-goals-pin-scroll";
    pin.append(chrome, scroll);
    container.appendChild(pin);
    listParent = scroll;
  } else {
    const section = document.createElement("section");
    section.className = "habit-tracker-today-goals-section";
    section.appendChild(chrome);
    container.appendChild(section);
    listParent = section;
  }

  const remount = () => {
    const scrollEl = container.querySelector(
      ".habit-tracker-today-goals-pin-scroll",
    );
    const keepTop =
      scrollEl instanceof HTMLElement ? scrollEl.scrollTop : 0;
    mountKpiGoalTodayGoalsSection(container, {
      ...opts,
      skipSync: true,
      restoreScrollTop: keepTop,
    });
  };

  if (!model.items.length) {
    const empty = document.createElement("p");
    empty.className = "habit-tracker-today-goals-empty";
    empty.textContent = "오늘 진행 중인 목표가 없습니다.";
    listParent.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "habit-tracker-today-goals-list";
  list.setAttribute("aria-label", "오늘의 행동 목록");

  for (const item of model.items) {
    const li = document.createElement("li");
    li.className = `habit-tracker-today-goals-row has-todos${
      item.done ? " is-done" : ""
    }`;

    const rowHead = document.createElement("button");
    rowHead.type = "button";
    rowHead.setAttribute("aria-label", item.name);
    rowHead.className = "habit-tracker-today-goals-head";
    rowHead.innerHTML = `
      <span class="habit-tracker-today-goals-mark" aria-label="${item.done ? "실행함" : "미실행"}">${item.done ? "O" : "X"}</span>
      <span class="habit-tracker-today-goals-main">
        <span class="habit-tracker-today-goals-name">${escapeHtml(item.name)}</span>
      </span>
    `;
    rowHead.addEventListener("click", () => {
      showTodayActionTodosModal({
        kpiId: item.id,
        name: item.name,
        todayYmd: model.todayYmd,
        onChange: remount,
      });
    });
    li.appendChild(rowHead);
    appendTodayActionPinnedTodos(li, item, {
      todayYmd: model.todayYmd,
      onChange: remount,
    });
    list.appendChild(li);
  }
  listParent.appendChild(list);

  const restoreTop = Number(opts.restoreScrollTop);
  if (Number.isFinite(restoreTop) && restoreTop > 0) {
    const scrollEl = container.querySelector(
      ".habit-tracker-today-goals-pin-scroll",
    );
    if (scrollEl instanceof HTMLElement) {
      scrollEl.scrollTop = restoreTop;
      requestAnimationFrame(() => {
        scrollEl.scrollTop = restoreTop;
      });
    }
  }
}
