/**
 * 시간가계부 - 데일리 시간 입력용
 * 과제명, 사용시간, 생산성, 카테고리, 날짜
 */

import {
  getKpiSyncedTaskNames,
  syncHabitTrackerLogs,
  replaceHabitTrackerLogDailyCompleted,
  getHabitTrackerDailyCompletedForDate,
  getHabitTrackerDailyCompletedForLedgerEntry,
  removeKpiHabitLogsForTimeLedgerEntry,
} from "../utils/timeKpiSync.js";
import {
  getKpiTodosAsTasks,
  getKpiDailyRepeatInfoByKpiId,
} from "../utils/kpiTodoSync.js";
import { kpiTodoFineTrace } from "../utils/kpiTodoFineTrace.js";
import {
  bindModalNativeDateRange,
  initModalNativeDateFieldsIn,
} from "../utils/modalNativeDateField.js";
import {
  getCustomSections,
  getCategoryColorForReport,
} from "../utils/todoSettings.js";
import { showToast } from "../utils/showToast.js";
import { showConfirmModal } from "../utils/confirmModal.js";
import {
  APP_FOOTER_ICON_BTN_CLASS,
  clearAppFooterActions,
  getAppFooterActionsSlot,
} from "../utils/appFooterShell.js";
import { USER_HOURLY_RATE_KEY, readUserHourlyRateLocal } from "../utils/userHourlySync.js";
import * as TTC from "../utils/timeTaskOptionsConstants.js";
import {
  getFullTaskOptions,
  getTaskOptions,
  addTaskOption,
  addTaskOptionFull,
  updateTaskOption,
  updateTaskOptionIconByName,
  removeTaskOption,
  getTaskOptionByName,
  migrateTimeLogRowsTaskIds,
  patchKpiLinkedTasksFromKpiMaps,
  isUuid,
} from "../utils/timeTaskOptionsModel.js";
import {
  attachTimeLedgerTasksSaveListener,
  pullTimeLedgerTasksFromSupabase,
} from "../utils/timeLedgerTasksSupabase.js";
import { pullKpiMapsForTaskLogModalOpen } from "../utils/kpiTabCloudRefresh.js";
import {
  scheduleTimeDailyBudgetSyncPush,
} from "../utils/timeDailyBudgetSupabase.js";
import {
  readTimeDailyBudgetGoalsRaw,
  readTimeDailyBudgetExcludedRaw,
  writeTimeDailyBudgetGoalsRaw,
  writeTimeDailyBudgetExcludedRaw,
} from "../utils/timeDailyBudgetModel.js";
import {
  buildTimeTaskLogPickerDropdown,
  taskAllowedForLedgerPreset,
} from "../utils/timeTaskLogPickerDropdown.js";
import {
  getTimeTaskListIconSrc,
  resolveTimeTaskDisplayIconSrc,
} from "../utils/timeTaskIconUrls.js";
import { mountTimeAddTaskIconPicker } from "../utils/timeAddTaskIconPicker.js";
import {
  ensureTimeLedgerEntryIds,
  ledgerRowEntryDateYmd,
  parseYmdTenFromLedgerStartTimeStr,
  readTimeLedgerEntriesRaw,
  splitUnhealthyMealMemoFromDb,
  stripTimeLedgerSyncMetaForCompare,
  TIME_LEDGER_ENTRIES_KEY,
  writeTimeLedgerEntriesRaw,
} from "../utils/timeLedgerEntriesModel.js";
import { closeStaleInProgressTimeLedgerRows, timeLedgerRowIsActiveLiveInProgress } from "../utils/timeLedgerStaleInProgressClose.js";
import {
  deleteTimeLedgerEntryFromSupabase,
  pullTimeLedgerEntriesForDateRange,
  pushDirtyTimeLedgerEntriesToSupabase,
  timeLedgerLocalTodayYmd,
} from "../utils/timeLedgerEntriesSupabase.js";
import { pullTimeLedgerTabEnterFromCloud } from "../utils/timeLedgerCloudRefresh.js";
import { timeLedgerSyncLog } from "../utils/timeLedgerSyncDebug.js";
import { lpSaveDebug } from "../utils/lpSaveDebug.js";
import { logTabSync } from "../utils/lpTabSyncDebug.js";
import { bindLpHorizontalPanNavigate } from "../utils/lpHorizontalPanNavigate.js";
import {
  createTimeLedgerDayTimeboxElement,
  refreshTimeLedgerDayTimeboxScroll,
} from "../utils/timeLedgerDayTimebox.js";
import { createTimeLedgerVerticalProductivityHeatmap } from "../utils/timeLedgerProductivityHeatmap.js";

import {
  lpSetClasses,
  lpTokenAdd,
  lpTokenRemove,
  lpTokenToggle,
  lpTokenHas,
} from "../utils/timeLedgerClassPolicy.js";
export { getTaskOptionByName };

/** 모바일 과제 기록 FAB — TodoList ADD_TASK_ICON과 동일 */
const TIME_LEDGER_ADD_FAB_SVG =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 8v8"/><path d="m8 12h8"/><path d="m18 22h-12c-2.209 0-4-1.791-4-4v-12c0-2.209 1.791-4 4-4h12c2.209 0 4 1.791 4 4v12c0 2.209-1.791 4-4 4z"/></g></svg>';

/** 상단 툴바: 라벨 없는 단순 + (설정·필터 아이콘과 동일 20px 박스) */
const TIME_LEDGER_ADD_PLUS_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>';

/** 툴바 설정·필터: img 필터 대신 +와 동일 currentColor (버튼 color #dc2626 상속) */
const TIME_LEDGER_TOOLBAR_SETTINGS_ICON_SVG =
  '<svg data-legacy="time-btn-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m19.845 13.561c.1-.505.155-1.027.155-1.561s-.055-1.056-.155-1.561l1.806-1.489c.502-.414.632-1.132.307-1.696l-.869-1.508c-.325-.564-1.011-.811-1.62-.582l-2.198.825c-.779-.684-1.689-1.218-2.691-1.559l-.385-2.316c-.108-.643-.663-1.114-1.314-1.114h-1.738c-.651 0-1.206.471-1.313 1.114l-.386 2.316c-1.002.341-1.912.875-2.691 1.559l-2.198-.825c-.61-.228-1.295.018-1.62.582l-.87 1.508c-.325.564-.195 1.282.307 1.696l1.806 1.489c-.1.505-.155 1.026-.155 1.561s.055 1.056.155 1.561l-1.806 1.489c-.502.414-.632 1.132-.307 1.696l.869 1.508c.325.564 1.011.811 1.62.582l2.198-.825c.779.684 1.689 1.218 2.691 1.559l.385 2.316c.109.643.664 1.114 1.315 1.114h1.738c.651 0 1.206-.471 1.313-1.114l.385-2.316c1.002-.341 1.913-.875 2.691-1.559l2.198.825c.609.229 1.295-.017 1.62-.582l.869-1.508c.325-.564.196-1.282-.307-1.696z"/><circle cx="12.012" cy="12" r="3"/></g></svg>';

const TIME_LEDGER_TOOLBAR_FILTER_ICON_SVG =
  '<svg data-legacy="time-btn-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="m20.988 2h-17.976c-1.664 0-2.606 1.899-1.595 3.216l7.583 9.784v7l4.853-2.101c.731-.318 1.147-1.037 1.147-1.832v-3.067l7.583-9.784c1.011-1.317.069-3.216-1.595-3.216z"/></svg>';

/** 앱 푸터 날짜 아이콘 — settings/필터/+ 와 동일 currentColor (main.css .app-footer-icon-btn) */
const TIME_LEDGER_FOOTER_DATE_ICON_SVG =
  '<svg data-legacy="time-btn-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></g></svg>';

const PRODUCTIVITY_OPTIONS = [
  { value: "productive", label: "생산적", color: "prod-pink" },
  { value: "nonproductive", label: "비생산적", color: "prod-blue" },
  { value: "other", label: "그 외", color: "prod-green" },
];

const BUDGET_GOALS_KEY = "time_daily_budget_goals";
const BUDGET_EXCLUDED_KEY = "time_budget_excluded";
/** 하루 기록 상한(홈 목표·시간 잔액): 23시간 59분 */
const TIME_LEDGER_DAILY_RECORD_CAP_HOURS = 23 + 59 / 60;

function notifyTimeDailyBudgetSaved(dateStr) {
  if (!(dateStr || "").trim()) return;
  scheduleTimeDailyBudgetSyncPush(String(dateStr).trim().slice(0, 10));
}

/** 감정적이기 과제 선택 시 감정 드롭다운 필터 */
const EMOTION_TASK_POSITIVE = "감정적이기(긍정적)";
const EMOTION_TASK_NEGATIVE = "감정적이기(부정적)";
const EMOTION_LIST_POSITIVE = [
  "기쁨",
  "행복",
  "즐거움",
  "고마움",
  "기특함",
  "감동",
  "사랑",
  "신뢰감",
  "자신감",
  "자부심",
  "편안감",
];
const EMOTION_LIST_NEGATIVE = [
  "공포",
  "불안",
  "걱정",
  "자존심",
  "자격지심",
  "열등감",
  "분노",
  "억울함",
  "괘씸함",
  "서운함",
  "미움",
  "혐오",
  "괴로움",
  "부담감",
  "죄책감",
  "수치심",
  "짜증",
  "원망",
];

function collectKpiLinkedNamesFromFullTaskOptions() {
  const s = new Set();
  try {
    for (const o of getFullTaskOptions()) {
      const kid = String(o.kpiId || "").trim();
      const n = String(o.name || "").trim();
      if (kid && n) s.add(n);
    }
  } catch (_) {}
  return s;
}

function getLockedTaskNames() {
  return new Set([
    ...TTC.FIXED_OTHER_TASKS.map((t) => t.name),
    ...TTC.FIXED_PRODUCTIVE_TASKS.map((t) => t.name),
    ...TTC.FIXED_NONPRODUCTIVE_TASKS.map((t) => t.name),
    ...TTC.TASKS_LOCKED_FOR_EDIT,
    ...getKpiSyncedTaskNames(),
    ...collectKpiLinkedNamesFromFullTaskOptions(),
  ]);
}

/** 과제 설정 모달에서 수정/삭제 버튼 숨김 대상 (고정 과제 + KPI 연동) */
function getLockedForSetupDisplay() {
  return getLockedTaskNames();
}

/** KPI 맵에서 연동된 과제 — 서버 time_ledger_tasks.kpi_id 기준 */
function isTimeTaskKpiLinked(task) {
  return Boolean(task && String(task.kpiId || "").trim());
}

/** 앱 기본 제공 과제(삭제 불가 템플릿) — FIXED_* 목록 이름 일치 */
const BUILTIN_TEMPLATE_NAMES = new Set([
  ...TTC.FIXED_OTHER_TASKS.map((t) => t.name),
  ...TTC.FIXED_PRODUCTIVE_TASKS.map((t) => t.name),
  ...TTC.FIXED_NONPRODUCTIVE_TASKS.map((t) => t.name),
]);

function isTimeTaskBuiltinTemplate(task) {
  const n = String(task?.name ?? "").trim();
  return Boolean(n && BUILTIN_TEMPLATE_NAMES.has(n));
}

/** KPI·기본 과제 — 과제명·생산성·카테고리 잠금, 아이콘만 수정 */
function isTaskIconOnlyEditLocked(task) {
  if (!task) return false;
  const n = String(task.name || "").trim();
  if (!n) return false;
  return getLockedTaskNames().has(n) || isTimeTaskKpiLinked(task);
}

/** 과제 설정 수정 모달 — 삭제 버튼 비활성화 (KPI·기본 과제) */
function isTaskDeleteLockedInSetup(task) {
  if (!task) return false;
  const n = String(task.name || "").trim();
  if (!n) return false;
  return isTimeTaskKpiLinked(task) || getLockedTaskNames().has(n);
}

function getTaskDeleteLockedInSetupMessage(task) {
  if (isTimeTaskKpiLinked(task)) return MSG_TIME_TASK_KPI_LINKED;
  if (isTimeTaskBuiltinTemplate(task)) {
    return "앱에서 제공하는 기본 과제입니다. 과제 설정에서 삭제할 수 없습니다.";
  }
  return "이 과제는 과제 설정에서 삭제할 수 없습니다.";
}

function appendTaskDropdownBadges(textWrap, task, opts = {}) {
  if (opts.omitBadges) return;
  if (isTimeTaskBuiltinTemplate(task)) {
    const bb = document.createElement("span");
    lpSetClasses(bb, "lp-task-badge lp-task-badge--builtin");
    bb.textContent = "기본";
    bb.title =
      "앱에서 제공하는 기본 과제입니다. 과제 설정에서 삭제할 수 없습니다.";
    textWrap.appendChild(bb);
  }
  if (isTimeTaskKpiLinked(task)) {
    const kb = document.createElement("span");
    lpSetClasses(kb, "lp-task-badge lp-task-badge--kpi");
    kb.textContent = "KPI";
    kb.title = "KPI와 연결된 과제입니다. 이름·삭제는 KPI 화면에서만 변경할 수 있습니다.";
    textWrap.appendChild(kb);
  }
}

/** KPI에서 만든 과제 — 시간가계부 과제 설정에서 삭제 불가 안내 */
const MSG_TIME_TASK_KPI_LINKED =
  "KPI와 연결된 과제입니다. 과제 설정에서는 삭제할 수 없습니다. 꿈·건강·행복·부수입 등 KPI 화면에서 해당 KPI를 삭제하면 서버와 과제 목록에서 함께 제거됩니다.";

const PRODUCTIVE_CATEGORIES = [
  { value: "dream", label: "꿈", color: "cat-dream" },
  { value: "sideincome", label: "부수입", color: "cat-sideincome" },
  { value: "happiness", label: "행복", color: "cat-happiness" },
  { value: "health", label: "건강", color: "cat-health" },
];

const NONPRODUCTIVE_CATEGORIES = [
  { value: "pleasure", label: "쾌락충족", color: "cat-pleasure" },
  {
    value: "media_watch",
    label: "미디어 시청",
    color: "cat-media-watch",
  },
  {
    value: "dreamblocking",
    label: "꿈을 방해하는 일",
    color: "cat-dreamblocking",
  },
  { value: "unhappiness", label: "불행", color: "cat-unhappiness" },
  { value: "unhealthy", label: "비건강", color: "cat-unhealthy" },
  { value: "moneylosing", label: "돈을 잃는 일", color: "cat-moneylosing" },
];

/** 일간시간예산 목표 시간 저장/불러오기 - { "YYYY-MM-DD": { "과제명": { goalTime: "08:00", scheduledTime: "hh:mm-hh:mm", isInvest: true } } } */
export function getBudgetGoals(dateStr) {
  try {
    const raw = readTimeDailyBudgetGoalsRaw();
    if (raw) {
      const all = JSON.parse(raw);
      const result = all[dateStr] || {};
      if (
        typeof result !== "object" ||
        result === null ||
        Array.isArray(result)
      )
        return {};
      return result;
    }
  } catch (_) {}
  return {};
}

export function saveBudgetGoal(dateStr, taskName, goalTime, isInvest) {
  if (!(taskName || "").trim()) return;
  try {
    removeFromBudgetExcluded(dateStr, taskName);
    const raw = readTimeDailyBudgetGoalsRaw();
    const all = raw ? JSON.parse(raw) : {};
    if (!all[dateStr]) all[dateStr] = {};
    const key = String(taskName).trim();
    const existing = all[dateStr][key] || {};
    if (goalTime && goalTime.trim()) {
      all[dateStr][key] = { ...existing, goalTime: goalTime.trim(), isInvest };
    } else {
      const { goalTime: _, ...rest } = existing;
      // 과제만 선택했을 때(목표 시간 없음)에도 행 유지
      all[dateStr][key] = Object.keys(rest).length
        ? { ...rest, isInvest }
        : { isInvest };
    }
    writeTimeDailyBudgetGoalsRaw(JSON.stringify(all));
    notifyTimeDailyBudgetSaved(dateStr);
  } catch (_) {}
}

/** 일간 예산 블록 저장 시 시:분 정규화 (예: 9:5 → 09:05) */
function parseBudgetTimeToNormalizedHhMm(s) {
  if (s == null || !String(s).trim()) return "";
  const str = String(s).trim();
  let h;
  let min;
  const m = str.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m) {
    h = parseInt(m[1], 10);
    min = parseInt(m[2], 10) || 0;
  } else {
    const m4 = str.match(/^(\d{3,4})$/);
    if (!m4) return "";
    const digits = m4[1];
    if (digits.length === 4) {
      h = parseInt(digits.slice(0, 2), 10);
      min = parseInt(digits.slice(2), 10);
    } else {
      h = parseInt(digits.slice(0, 1), 10);
      min = parseInt(digits.slice(1), 10);
    }
  }
  if (!Number.isFinite(h) || !Number.isFinite(min)) return "";
  h = Math.max(0, Math.min(23, h));
  min = Math.max(0, Math.min(59, min));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * 일간 타임블록(캘린더)용: 과제명·예상 시작~마감·메모를 goals.scheduledTimes / scheduleMemos 에 추가.
 * 서버 반영은 time_daily_budget_days — notify 후 호출부에서 sync 권장.
 */
export function appendBudgetScheduleBlock(
  dateStr,
  taskName,
  startHHmm,
  endHHmm,
  memo = "",
) {
  const dk = String(dateStr || "")
    .replace(/\//g, "-")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) {
    return { ok: false, error: "날짜가 올바르지 않습니다." };
  }
  const name = String(taskName || "").trim();
  if (!name) {
    return { ok: false, error: "과제명을 입력해 주세요." };
  }
  const st = parseBudgetTimeToNormalizedHhMm(startHHmm);
  const et = parseBudgetTimeToNormalizedHhMm(endHHmm);
  if (!st || !et) {
    return {
      ok: false,
      error: "시작·마감 시간을 시:분 형식으로 입력해 주세요. (예: 09:00)",
    };
  }
  const [h1, m1] = st.split(":").map((x) => parseInt(x, 10));
  const [h2, m2] = et.split(":").map((x) => parseInt(x, 10));
  const startMin = h1 * 60 + m1;
  const endMin = h2 * 60 + m2;
  if (endMin <= startMin) {
    return { ok: false, error: "마감 시간은 시작 시간보다 늦어야 합니다." };
  }
  try {
    removeFromBudgetExcluded(dk, name);
    const raw = readTimeDailyBudgetGoalsRaw();
    const all = raw ? JSON.parse(raw) : {};
    if (!all[dk]) all[dk] = {};
    const existing = all[dk][name] || {};
    let scheduledTimes = [];
    let scheduleMemos = [];
    if (Array.isArray(existing.scheduledTimes)) {
      scheduledTimes = [...existing.scheduledTimes];
      scheduleMemos = Array.isArray(existing.scheduleMemos)
        ? [...existing.scheduleMemos]
        : [];
    } else if (existing.scheduledTime && String(existing.scheduledTime).trim()) {
      scheduledTimes = [String(existing.scheduledTime).trim()];
      scheduleMemos = Array.isArray(existing.scheduleMemos)
        ? [...existing.scheduleMemos]
        : [];
    }
    let scheduledSavedAts = Array.isArray(existing.scheduledSavedAts)
      ? [...existing.scheduledSavedAts]
      : [];
    while (scheduleMemos.length < scheduledTimes.length) {
      scheduleMemos.push("");
    }
    while (scheduledSavedAts.length < scheduledTimes.length) {
      scheduledSavedAts.push(0);
    }
    scheduledTimes.push(`${st}-${et}`);
    scheduleMemos.push(String(memo || "").trim());
    scheduledSavedAts.push(Date.now());
    const next = {
      ...existing,
      scheduledTimes,
      scheduleMemos,
      scheduledSavedAts,
    };
    delete next.scheduledTime;
    all[dk][name] = next;
    writeTimeDailyBudgetGoalsRaw(JSON.stringify(all));
    notifyTimeDailyBudgetSaved(dk);
    return { ok: true };
  } catch (_) {
    return { ok: false, error: "저장 중 오류가 났습니다." };
  }
}

function normalizeBudgetScheduledEntryString(entry) {
  const parts = String(entry || "").trim().split("-");
  if (parts.length < 2) return "";
  const a = parseBudgetTimeToNormalizedHhMm(parts[0]);
  const b = parseBudgetTimeToNormalizedHhMm(parts[1]);
  if (!a || !b) return "";
  return `${a}-${b}`;
}

/**
 * 일간 예산 scheduledTimes에서 startMin~endMin 과 일치하는 슬롯 인덱스 (타임라인 수정 모달용).
 */
export function findBudgetScheduleSlotIndex(dateStr, taskName, startMin, endMin) {
  const dk = String(dateStr || "")
    .replace(/\//g, "-")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) return -1;
  const name = String(taskName || "").trim();
  if (!name) return -1;
  const sm = Number(startMin);
  const em = Number(endMin);
  if (!Number.isFinite(sm) || !Number.isFinite(em)) return -1;
  const fmt = (m) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const needle = `${fmt(sm)}-${fmt(em)}`;
  const goals = getBudgetGoals(dk);
  const existing = goals[name];
  if (!existing) return -1;
  let scheduledTimes = [];
  if (Array.isArray(existing.scheduledTimes)) {
    scheduledTimes = existing.scheduledTimes;
  } else if (existing.scheduledTime && String(existing.scheduledTime).trim()) {
    scheduledTimes = [String(existing.scheduledTime).trim()];
  }
  for (let i = 0; i < scheduledTimes.length; i++) {
    if (normalizeBudgetScheduledEntryString(scheduledTimes[i]) === needle) {
      return i;
    }
  }
  return -1;
}

/** @param {number} timeIdx — goals[taskName].scheduledTimes 인덱스 */
export function removeBudgetScheduleBlockAtIndex(dateStr, taskName, timeIdx) {
  const dk = String(dateStr || "")
    .replace(/\//g, "-")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) {
    return { ok: false, error: "날짜가 올바르지 않습니다." };
  }
  const name = String(taskName || "").trim();
  if (!name) {
    return { ok: false, error: "과제명이 없습니다." };
  }
  const idx = Number(timeIdx);
  if (!Number.isFinite(idx) || idx < 0) {
    return { ok: false, error: "항목을 찾지 못했습니다." };
  }
  try {
    const raw = readTimeDailyBudgetGoalsRaw();
    const all = raw ? JSON.parse(raw) : {};
    if (!all[dk] || !all[dk][name]) {
      return { ok: false, error: "항목을 찾지 못했습니다." };
    }
    const existing = all[dk][name] || {};
    let scheduledTimes = [];
    let scheduleMemos = [];
    if (Array.isArray(existing.scheduledTimes)) {
      scheduledTimes = [...existing.scheduledTimes];
      scheduleMemos = Array.isArray(existing.scheduleMemos)
        ? [...existing.scheduleMemos]
        : [];
    } else if (existing.scheduledTime && String(existing.scheduledTime).trim()) {
      scheduledTimes = [String(existing.scheduledTime).trim()];
      scheduleMemos = Array.isArray(existing.scheduleMemos)
        ? [...existing.scheduleMemos]
        : [];
    }
    let scheduledSavedAts = Array.isArray(existing.scheduledSavedAts)
      ? [...existing.scheduledSavedAts]
      : [];
    while (scheduleMemos.length < scheduledTimes.length) {
      scheduleMemos.push("");
    }
    while (scheduledSavedAts.length < scheduledTimes.length) {
      scheduledSavedAts.push(0);
    }
    if (idx >= scheduledTimes.length) {
      return { ok: false, error: "항목을 찾지 못했습니다." };
    }
    scheduledTimes.splice(idx, 1);
    scheduleMemos.splice(idx, 1);
    scheduledSavedAts.splice(idx, 1);
    const next = { ...existing, scheduledTimes, scheduleMemos, scheduledSavedAts };
    delete next.scheduledTime;
    if (scheduledTimes.length === 0) {
      delete next.scheduledTimes;
      delete next.scheduleMemos;
      delete next.scheduledSavedAts;
    }
    if (Object.keys(next).length === 0) {
      delete all[dk][name];
    } else {
      all[dk][name] = next;
    }
    if (all[dk] && Object.keys(all[dk]).length === 0) {
      delete all[dk];
    }
    writeTimeDailyBudgetGoalsRaw(JSON.stringify(all));
    notifyTimeDailyBudgetSaved(dk);
    return { ok: true };
  } catch (_) {
    return { ok: false, error: "삭제 중 오류가 났습니다." };
  }
}

/**
 * 일간 예산 예정 슬롯 수정 (과제명 변경 시 이전 과제에서 제거 후 새 과제에 추가).
 */
export function updateBudgetScheduleBlockAtIndex(
  dateStr,
  prevTaskName,
  timeIdx,
  nextTaskName,
  startHHmm,
  endHHmm,
  memo,
) {
  const dk = String(dateStr || "")
    .replace(/\//g, "-")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) {
    return { ok: false, error: "날짜가 올바르지 않습니다." };
  }
  const prevKey = String(prevTaskName || "").trim();
  const nextKey = String(nextTaskName || "").trim();
  if (!prevKey || !nextKey) {
    return { ok: false, error: "과제를 선택해 주세요." };
  }
  const ix = Number(timeIdx);
  if (!Number.isFinite(ix) || ix < 0) {
    return { ok: false, error: "항목을 찾지 못했습니다." };
  }
  const st = parseBudgetTimeToNormalizedHhMm(startHHmm);
  const et = parseBudgetTimeToNormalizedHhMm(endHHmm);
  if (!st || !et) {
    return {
      ok: false,
      error: "시작·마감 시간을 시:분 형식으로 입력해 주세요. (예: 09:00)",
    };
  }
  const [h1, m1] = st.split(":").map((x) => parseInt(x, 10));
  const [h2, m2] = et.split(":").map((x) => parseInt(x, 10));
  const startMin = h1 * 60 + m1;
  const endMin = h2 * 60 + m2;
  if (endMin <= startMin) {
    return { ok: false, error: "마감 시간은 시작 시간보다 늦어야 합니다." };
  }
  const newSlot = `${st}-${et}`;
  const newMemo = String(memo || "").trim();
  try {
    removeFromBudgetExcluded(dk, nextKey);
    const raw = readTimeDailyBudgetGoalsRaw();
    const all = raw ? JSON.parse(raw) : {};
    if (!all[dk]) all[dk] = {};
    if (!all[dk][prevKey]) {
      return { ok: false, error: "항목을 찾지 못했습니다." };
    }
    const readSlotArrays = (key) => {
      const existing = all[dk][key] || {};
      let scheduledTimes = [];
      let scheduleMemos = [];
      if (Array.isArray(existing.scheduledTimes)) {
        scheduledTimes = [...existing.scheduledTimes];
        scheduleMemos = Array.isArray(existing.scheduleMemos)
          ? [...existing.scheduleMemos]
          : [];
      } else if (existing.scheduledTime && String(existing.scheduledTime).trim()) {
        scheduledTimes = [String(existing.scheduledTime).trim()];
        scheduleMemos = Array.isArray(existing.scheduleMemos)
          ? [...existing.scheduleMemos]
          : [];
      }
      let scheduledSavedAts = Array.isArray(existing.scheduledSavedAts)
        ? [...existing.scheduledSavedAts]
        : [];
      while (scheduleMemos.length < scheduledTimes.length) {
        scheduleMemos.push("");
      }
      while (scheduledSavedAts.length < scheduledTimes.length) {
        scheduledSavedAts.push(0);
      }
      return { existing, scheduledTimes, scheduleMemos, scheduledSavedAts };
    };
    const p = readSlotArrays(prevKey);
    if (ix >= p.scheduledTimes.length) {
      return { ok: false, error: "항목을 찾지 못했습니다." };
    }
    if (prevKey === nextKey) {
      p.scheduledTimes[ix] = newSlot;
      p.scheduleMemos[ix] = newMemo;
      p.scheduledSavedAts[ix] = Date.now();
      const nextObj = {
        ...p.existing,
        scheduledTimes: p.scheduledTimes,
        scheduleMemos: p.scheduleMemos,
        scheduledSavedAts: p.scheduledSavedAts,
      };
      delete nextObj.scheduledTime;
      all[dk][prevKey] = nextObj;
    } else {
      p.scheduledTimes.splice(ix, 1);
      p.scheduleMemos.splice(ix, 1);
      p.scheduledSavedAts.splice(ix, 1);
      const prevNext = {
        ...p.existing,
        scheduledTimes: p.scheduledTimes,
        scheduleMemos: p.scheduleMemos,
        scheduledSavedAts: p.scheduledSavedAts,
      };
      delete prevNext.scheduledTime;
      if (p.scheduledTimes.length === 0) {
        delete prevNext.scheduledTimes;
        delete prevNext.scheduleMemos;
        delete prevNext.scheduledSavedAts;
      }
      if (Object.keys(prevNext).length === 0) {
        delete all[dk][prevKey];
      } else {
        all[dk][prevKey] = prevNext;
      }
      const n = readSlotArrays(nextKey);
      n.scheduledTimes.push(newSlot);
      n.scheduleMemos.push(newMemo);
      n.scheduledSavedAts.push(Date.now());
      const nextObj = {
        ...n.existing,
        scheduledTimes: n.scheduledTimes,
        scheduleMemos: n.scheduleMemos,
        scheduledSavedAts: n.scheduledSavedAts,
      };
      delete nextObj.scheduledTime;
      all[dk][nextKey] = nextObj;
    }
    writeTimeDailyBudgetGoalsRaw(JSON.stringify(all));
    notifyTimeDailyBudgetSaved(dk);
    return { ok: true };
  } catch (_) {
    return { ok: false, error: "저장 중 오류가 났습니다." };
  }
}

/** 새 행 플레이스홀더 (재렌더 시 행 유지용) */
const BUDGET_PLACEHOLDER_PREFIX = "(과제 선택)·";
function isBudgetPlaceholder(key) {
  return (key || "").startsWith(BUDGET_PLACEHOLDER_PREFIX);
}

/**
 * 해당 날짜 일간 예산(goals) 예상 블록 중 가장 늦은 마감 시각(HH:mm).
 * 새 예상 일정 시작 기본값 — 과제 기록의 getNextTaskLogStartHhMmFromLedger 와 같이 이어 붙이기.
 */
export function getLatestBudgetScheduleEndHhMm(dateStr) {
  const dk = String(dateStr || "")
    .replace(/\//g, "-")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) return null;
  const goals = getBudgetGoals(dk);
  let maxMin = -1;
  for (const [taskKey, data] of Object.entries(goals)) {
    if (isBudgetPlaceholder(taskKey)) continue;
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    const slots = [];
    if (Array.isArray(data.scheduledTimes)) {
      for (const x of data.scheduledTimes) {
        if (x && String(x).trim()) slots.push(String(x).trim());
      }
    } else if (data.scheduledTime && String(data.scheduledTime).trim()) {
      slots.push(String(data.scheduledTime).trim());
    }
    for (const slot of slots) {
      const parts = String(slot).trim().split("-");
      if (parts.length < 2) continue;
      const endNorm = parseBudgetTimeToNormalizedHhMm(parts[1].trim());
      if (!endNorm) continue;
      const [h, m] = endNorm.split(":").map((x) => parseInt(x, 10));
      const total = h * 60 + m;
      if (total > maxMin) maxMin = total;
    }
  }
  if (maxMin < 0) return null;
  const h = Math.floor(maxMin / 60) % 24;
  const mi = maxMin % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

function getBudgetExcluded(dateStr) {
  try {
    const raw = readTimeDailyBudgetExcludedRaw();
    const excl = raw ? JSON.parse(raw) : {};
    return new Set(excl[dateStr] || []);
  } catch (_) {}
  return new Set();
}

/** 제외 목록에서 과제 제거 (다시 추가 시 행이 표시되도록) */
function removeFromBudgetExcluded(dateStr, taskName) {
  const key = (taskName || "").trim();
  if (!key) return;
  try {
    const raw = readTimeDailyBudgetExcludedRaw();
    const excl = raw ? JSON.parse(raw) : {};
    if (excl[dateStr]) {
      excl[dateStr] = excl[dateStr].filter((n) => n !== key);
      if (excl[dateStr].length === 0) delete excl[dateStr];
      writeTimeDailyBudgetExcludedRaw(JSON.stringify(excl));
      notifyTimeDailyBudgetSaved(dateStr);
    }
  } catch (_) {}
}

/** 과제 기록 로컬 저장 — IndexedDB(+미러) 경로는 timeLedgerEntriesModel */
export function loadTimeRows() {
  try {
    let arr = readTimeLedgerEntriesRaw();
    const closed = closeStaleInProgressTimeLedgerRows(arr);
    if (closed.changed) {
      saveTimeRows(closed.rows);
      arr = readTimeLedgerEntriesRaw();
    }
    const { rows, dirty } = ensureTimeLedgerEntryIds(arr);
    if (dirty) {
      writeTimeLedgerEntriesRaw(rows);
    }
    return rows;
  } catch (_) {
    return [];
  }
}

let _syncHabitTrackerLogsTimer = null;

function scheduleSyncHabitTrackerLogs() {
  if (_syncHabitTrackerLogsTimer != null) {
    clearTimeout(_syncHabitTrackerLogsTimer);
  }
  _syncHabitTrackerLogsTimer = setTimeout(() => {
    _syncHabitTrackerLogsTimer = null;
    try {
      syncHabitTrackerLogs();
    } catch (_) {}
  }, 450);
}

function saveTimeRows(rows) {
  try {
    const prevSnap = readTimeLedgerEntriesRaw();
    const prevById = new Map(
      (Array.isArray(prevSnap) ? prevSnap : []).map((r) => [
        String(r?.id || "").trim(),
        r,
      ]),
    );
    const arr = Array.isArray(rows) ? rows : [];
    const { rows: withIds, dirty } = ensureTimeLedgerEntryIds(arr);
    const toSave = withIds.map((r) => {
      const id = String(r?.id || "").trim();
      const prevRow = id ? prevById.get(id) : null;
      if (!prevRow) {
        const lm =
          typeof r.localModifiedAt === "number" &&
          Number.isFinite(r.localModifiedAt)
            ? r.localModifiedAt
            : Date.now();
        return { ...r, localModifiedAt: lm };
      }
      const same =
        stripTimeLedgerSyncMetaForCompare(prevRow) ===
        stripTimeLedgerSyncMetaForCompare(r);
      if (same) {
        return {
          ...r,
          localModifiedAt: prevRow.localModifiedAt,
          serverUpdatedAt:
            prevRow.serverUpdatedAt !== undefined &&
            prevRow.serverUpdatedAt !== ""
              ? prevRow.serverUpdatedAt
              : r.serverUpdatedAt,
        };
      }
      return { ...r, localModifiedAt: Date.now() };
    });
    if (dirty) {
      /* 신규 id 부여분 반영 */
    }
    writeTimeLedgerEntriesRaw(toSave);
    timeLedgerSyncLog("local_rows_saved", {
      totalRows: toSave.length,
      note: "로컬 저장 완료 → 곧 서버 반영(push) 시도",
    });
    scheduleSyncHabitTrackerLogs();
    if (typeof document !== "undefined") {
      document.dispatchEvent(
        new CustomEvent("calendar-time-rows-updated", { detail: {} }),
      );
    }
    try {
      if (typeof window !== "undefined") {
        void pushDirtyTimeLedgerEntriesToSupabase({ skipPull: true });
      }
    } catch (_) {}
  } catch (_) {}
}

const TASK_BAR_COLORS = [
  "#a8c8e8",
  "#dce4f4",
  "#ffd3b6",
  "#ffaaa5",
  "#ff8b94",
  "#c7ceea",
  "#b8a9c9",
  "#d4a5a5",
  "#92a8d1",
  "#6b8eb8",
  "#f7cac9",
  "#92c5de",
  "#f4a460",
  "#98b4d8",
  "#f7dc6f",
  "#bb8fce",
  "#85c1e9",
  "#f8b500",
  "#3498db",
  "#e74c3c",
];

const CATEGORY_OPTIONS = [
  { value: "", label: "—", color: "cat-empty" },
  { value: "dream", label: "꿈", color: "cat-dream" },
  { value: "sideincome", label: "부수입", color: "cat-sideincome" },
  { value: "happiness", label: "행복", color: "cat-happiness" },
  { value: "health", label: "건강", color: "cat-health" },
  { value: "pleasure", label: "쾌락충족", color: "cat-pleasure" },
  {
    value: "media_watch",
    label: "미디어 시청",
    color: "cat-media-watch",
  },
  {
    value: "dreamblocking",
    label: "꿈을 방해하는 일",
    color: "cat-dreamblocking",
  },
  { value: "unhappiness", label: "불행", color: "cat-unhappiness" },
  { value: "unhealthy", label: "비건강", color: "cat-unhealthy" },
  { value: "moneylosing", label: "돈을 잃는 일", color: "cat-moneylosing" },
  { value: "work", label: "근무", color: "cat-work" },
  { value: "sleep", label: "수면", color: "cat-sleep" },
];

/** 투자=생산적(prod-pink), 소비=비생산적(prod-blue) 컬러 */
function getTaskColorForDropdown(taskOpt, isProductive) {
  return isProductive ? "prod-pink" : "prod-blue";
}

/** 카테고리에 따른 생산성 자동 매핑 */
function getProductivityFromCategory(categoryValue) {
  if (!categoryValue) return "";
  const productive = ["dream", "sideincome", "happiness", "health"];
  const nonproductive = [
    "unhappiness",
    "unhealthy",
    "moneylosing",
    "dreamblocking",
    "pleasure",
    "media_watch",
  ];
  const other = ["work", "sleep"];
  if (productive.includes(categoryValue)) return "productive";
  if (nonproductive.includes(categoryValue)) return "nonproductive";
  if (other.includes(categoryValue)) return "other";
  return "";
}

/** 낮잠 과제: 사용시간 30분 초과 시 쾌락충족/비생산적, 30분 이하 시 건강/생산적 */
function getNapCategoryProductivity(timeTracked) {
  const hours = parseTimeToHours(timeTracked);
  const minutes = hours * 60;
  if (minutes > 30)
    return { category: "pleasure", productivity: "nonproductive" };
  return { category: "health", productivity: "productive" };
}

function resolveRowCategoryProductivityForAudit(r) {
  const taskName = (r.taskName || "").trim();
  if (!taskName) return { category: "", productivity: "" };
  const opt = getTaskOptionByName(taskName);
  let productivity =
    String(r.productivity || "").trim() || opt?.productivity || "";
  let category = String(r.category || "").trim() || opt?.category || "";
  if (TTC.isNapBuiltinTaskName(taskName) && r.timeTracked) {
    const nap = getNapCategoryProductivity(r.timeTracked);
    category = nap.category;
    productivity = nap.productivity;
  }
  if (!productivity && category)
    productivity = getProductivityFromCategory(category) || productivity;
  return { category, productivity };
}

/** 홈·간단 UI용: 행의 표시 생산성 키 (productive | nonproductive | other) */
export function getTimeLedgerRowDisplayProductivity(row) {
  if (!row) return "other";
  try {
    const { productivity } = resolveRowCategoryProductivityForAudit(row);
    const p = String(productivity || "")
      .trim()
      .toLowerCase();
    if (p === "productive") return "productive";
    if (p === "nonproductive") return "nonproductive";
  } catch (_) {}
  return "other";
}
function formatDateDisplay(val) {
  if (!val || val.length < 10) return "";
  const [y, m, d] = val.split("-");
  return `${y}/${m}/${d}`;
}

/** yyyy/mm/dd hh:mm <-> datetime-local(yyyy-mm-ddThh:mm) 변환 */
function toDateTimeLocalValue(str) {
  if (!str || typeof str !== "string") return "";
  const s = str.trim();
  if (!s) return "";
  const m = s.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})$/,
  );
  if (m) {
    const [, y, mo, d, h, min] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${min}`;
  }
  if (s.includes("T")) return s;
  return "";
}

function toDisplayDateTime(str) {
  if (!str || typeof str !== "string") return "";
  const s = str.trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (m) {
    const [, y, mo, d, h, min] = m;
    return `${y}/${mo}/${d} ${h}:${min}`;
  }
  const m2 = s.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})/,
  );
  if (m2) return s;
  return "";
}

/** 테이블 표시용: hh:mm 시간만 추출 */
function toDisplayTimeOnly(str) {
  if (!str || typeof str !== "string") return "";
  const s = str.trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const [, h, min] = m;
    return `${h.padStart(2, "0")}:${min}`;
  }
  return "";
}

/** 날짜·시간 문자열에서 YYYY-MM-DD 추출 */
function parseDateFromDateTime(str) {
  if (!str || typeof str !== "string") return "";
  const m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return "";
}

/** 마감시간에 시작시간 날짜 적용 (날짜 통일) */
function mergeEndTimeWithStartDate(startTime, endTime) {
  const startDate = parseDateFromDateTime(startTime);
  if (!startDate || !endTime) return endTime;
  const m = endTime.match(/[T\s](\d{1,2}):(\d{2})/);
  if (!m) return endTime;
  const [, h, min] = m;
  return `${startDate}T${String(h).padStart(2, "0")}:${min}`;
}

/** 시작/마감시간 입력을 yyyy/mm/dd hh:mm 형식으로 정규화 */
function formatDateTimeInput(val) {
  if (!val || typeof val !== "string") return "";
  const s = val.trim();
  if (!s) return "";
  const m = s.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})$/,
  );
  if (m) {
    const [, y, mo, d, h, min] = m;
    return `${y}/${mo.padStart(2, "0")}/${d.padStart(2, "0")} ${h.padStart(2, "0")}:${min}`;
  }
  const m2 = s.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):?(\d{2})?/,
  );
  if (m2) {
    const [, y, mo, d, h = "00", min = "00"] = m2;
    return `${y}/${mo.padStart(2, "0")}/${d.padStart(2, "0")} ${h.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  const m3 = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (m3) {
    const [, y, mo, d, h, min] = m3;
    return `${y}/${mo}/${d} ${h}:${min}`;
  }
  /* 숨은값·외부 데이터에 2026-4-5T9:05 식 한 자리 월/일·시가 섞인 경우 */
  const m3lax = s.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})T(\d{1,2}):(\d{2})/,
  );
  if (m3lax) {
    const [, y, mo, d, h, min] = m3lax;
    return `${y}/${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")} ${String(h).padStart(2, "0")}:${min}`;
  }
  return "";
}

/** 숫자만 입력된 경우 콜론 자동 삽입 (0030 -> 00:30) */
function formatTimeInput(val) {
  if (!val || typeof val !== "string") return val;
  const digits = val.replace(/\D/g, "");
  if (digits.length === 4) {
    return digits.slice(0, 2) + ":" + digits.slice(2);
  }
  if (digits.length === 3) {
    return "0" + digits.slice(0, 1) + ":" + digits.slice(1);
  }
  return val;
}

/** hh:mm 형식을 시간(소수)으로 변환 */
export function parseTimeToHours(str) {
  if (!str || typeof str !== "string") return 0;
  const trimmed = str.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h + m / 60;
}

/** 목표 대비 배치 차이 포맷: (-1h) / (+1h25m) / (-30m) / "" — 초과 +, 부족 - */
export function formatGoalDiff(diffHours) {
  if (diffHours === 0 || !isFinite(diffHours) || Math.abs(diffHours) < 1 / 60)
    return "";
  const sign = diffHours > 0 ? "+" : diffHours < 0 ? "-" : "";
  const absH = Math.abs(diffHours);
  const h = Math.floor(absH);
  const m = Math.round((absH - h) * 60);
  if (h === 0 && m === 0) return "";
  if (h === 0) return `(${sign}${m}m)`;
  if (m === 0) return `(${sign}${h}h)`;
  return `(${sign}${h}h${m}m)`;
}

/** 날짜·시간 문자열(YYYY-MM-DDThh:mm 등)을 시간(소수)으로 변환 */
function parseDateTimeToHours(str) {
  if (!str || typeof str !== "string") return null;
  const m = str.match(/[T\s](\d{1,2}):?(\d{2})?/);
  if (!m) return null;
  const h = parseInt(m[1], 10) || 0;
  const min = parseInt(m[2], 10) || 0;
  return h + min / 60;
}

/** 성취능력 문자열을 -50~+50 숫자로 파싱 */
function parseEnergyToNumber(val) {
  const s = String(val || "")
    .trim()
    .replace(/%/g, "");
  if (!s) return null;
  const n = parseInt(s.replace(/^\+/, ""), 10);
  if (!isNaN(n) && n >= -50 && n <= 50) return n;
  return null;
}

/** 성취능력 곡선용: 시간대별(0~23시) 성취능력 평균 집계 */
function aggregateEnergyByHour(rows) {
  const byHour = {};
  for (let h = 0; h <= 23; h++) byHour[h] = { sum: 0, count: 0 };
  rows.forEach((r) => {
    const energy = parseEnergyToNumber(r.energy);
    if (energy == null) return;
    const startH = parseDateTimeToHours(r.startTime);
    const endH = parseDateTimeToHours(r.endTime);
    if (startH == null || endH == null) return;
    for (let h = 0; h <= 23; h++) {
      if (startH < h + 1 && endH > h) {
        byHour[h].sum += energy;
        byHour[h].count += 1;
      }
    }
  });
  const result = {};
  for (let h = 0; h <= 23; h++) {
    result[h] = byHour[h].count > 0 ? byHour[h].sum / byHour[h].count : null;
  }
  return result;
}

/** 방해 이벤트 파싱: "10:30|메신저체크;11:15|유튜브" → [{time,type},...] (구형 "3|메신저체크" 호환) */
function parseFocusEvents(raw, defaultTime = "") {
  const s = String(raw || "").trim();
  if (!s) return [];
  if (s.includes(";")) {
    return s.split(";").map((seg) => {
      const [t, type] = seg.split("|");
      return { time: (t || "").trim(), type: (type || "").trim() };
    });
  }
  const [a, b] = s.split("|");
  if (/^\d{1,2}:\d{2}$/.test(String(a || "").trim())) {
    return [{ time: (a || "").trim(), type: (b || "").trim() }];
  }
  const cnt = parseInt(String(a || "0").replace(/\D/g, ""), 10) || 0;
  const type = (b || "").trim();
  if (cnt <= 0 || !type) return [];
  return Array.from({ length: cnt }, () => ({ time: defaultTime, type }));
}

/** 방해 값을 인라인 표시용 문자열로: "10:30 메신저체크, 11:15 유튜브" */
function formatFocusForDisplay(raw) {
  const events = parseFocusEvents(raw);
  if (events.length === 0) return "";
  return events
    .map((e) => (e.time ? `${e.time} ${e.type}`.trim() : e.type || "").trim())
    .filter(Boolean)
    .join(", ");
}

/** 방해 빈도 곡선용: 시간대별(0~23시) 방해횟수 집계 */
function aggregateFocusByHour(rows) {
  const byHour = {};
  for (let h = 0; h <= 23; h++) byHour[h] = 0;
  rows.forEach((r) => {
    const events = parseFocusEvents(r.focus);
    if (events.length === 0) return;
    const startH = parseDateTimeToHours(r.startTime);
    const endH = parseDateTimeToHours(r.endTime);
    const hasTaskRange = startH != null && endH != null;
    events.forEach((e) => {
      if (e.time) {
        const m = e.time.match(/^(\d{1,2}):?(\d{2})?/);
        const h = m ? parseInt(m[1], 10) : null;
        if (h != null && h >= 0 && h <= 23) byHour[h] += 1;
      } else if (hasTaskRange) {
        for (let h = 0; h <= 23; h++) {
          if (startH < h + 1 && endH > h) byHour[h] += 1;
        }
      }
    });
  });
  return byHour;
}

/** 시간(소수)을 "Xh Ym" 형식으로 표시 (단위 소문자) */
function formatHoursDisplay(hours) {
  if (hours < 0 || !isFinite(hours)) return "0h 0m";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** 은행 앱 잔고 카드용 시·분 표시 (한도 초과 시 음수 가능) */
function formatHoursDisplayHhMmColon(hours) {
  if (!isFinite(hours)) return "00 : 00";
  const neg = hours < 0;
  const totalMins = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const core = `${String(h).padStart(2, "0")} : ${String(m).padStart(2, "0")}`;
  return neg ? `-${core}` : core;
}

function formatLedgerWonInteger(n) {
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  return abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 모바일 시간기록 카드: 진행 중(마감 없음)일 때 경과 시간 갱신용 타이머 정리 */
function clearTimeLedgerMobileElapsedTimer(viewEl) {
  if (!viewEl?._timeLedgerMobileElapsedIntervalId) return;
  clearInterval(viewEl._timeLedgerMobileElapsedIntervalId);
  viewEl._timeLedgerMobileElapsedIntervalId = null;
}

export function rowHasEndTimeForMobileCard(rowData) {
  return !!(rowData?.endTime && String(rowData.endTime).trim());
}

/** 행의 시작 시각을 로컬 Date로 (없으면 null) */
export function getRowStartInstantForMobileCard(rowData) {
  if (!rowData) return null;
  const st = (rowData.startTime || "").trim();
  if (!st) return null;
  const normalized = formatDateTimeInput(st);
  const s = normalized || st;
  const m = s.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})/,
  );
  if (m) {
    return new Date(
      parseInt(m[1], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[3], 10),
      parseInt(m[4], 10),
      parseInt(m[5], 10),
      0,
      0,
    );
  }
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})/);
  if (m2) {
    return new Date(
      parseInt(m2[1], 10),
      parseInt(m2[2], 10) - 1,
      parseInt(m2[3], 10),
      parseInt(m2[4], 10),
      parseInt(m2[5], 10),
      0,
      0,
    );
  }
  const dateStr = (rowData.date || "").trim().replace(/\//g, "-");
  const timeStr = toDisplayTimeOnly(st);
  if (!dateStr || !timeStr) return null;
  const dm = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (!dm || !tm) return null;
  return new Date(
    parseInt(dm[1], 10),
    parseInt(dm[2], 10) - 1,
    parseInt(dm[3], 10),
    parseInt(tm[1], 10),
    parseInt(tm[2], 10),
    0,
    0,
  );
}

/** 행의 마감 시각을 로컬 Date로 (마감 없으면 null) */
export function getRowEndInstantForMobileCard(rowData) {
  if (!rowHasEndTimeForMobileCard(rowData)) return null;
  const merged = mergeEndTimeWithStartDate(
    rowData.startTime || "",
    rowData.endTime || "",
  );
  return getRowStartInstantForMobileCard({
    ...rowData,
    startTime: merged || rowData.endTime,
  });
}

function formatElapsedDurationForMobileCard(ms) {
  const hours = ms / 3600000;
  return formatHoursDisplay(hours);
}

/** 모바일 카드 우측: 수동 사용시간 > 마감 있음(빈 사용시간은 —) > 진행 중이면 경과 */
function getMobileCardTrackedDisplayForRow(rowData) {
  const tracked = (rowData.timeTracked || "").trim();
  if (tracked) return tracked;
  if (rowHasEndTimeForMobileCard(rowData)) return "—";
  const start = getRowStartInstantForMobileCard(rowData);
  if (!start) return "—";
  const ms = Date.now() - start.getTime();
  if (ms < 0) return "0h";
  return formatElapsedDurationForMobileCard(ms);
}

/** 마감 미입력(진행 중)일 때 테이블·모바일 카드에 쓰는 표시 (실제 종료 시각으로 오해하지 않도록) */
const TIME_LEDGER_IN_PROGRESS_LABEL = "진행중";

function formatTimeLedgerEndCellDisplay(startTime, endTime) {
  const end = String(endTime || "").trim();
  if (end) return toDisplayTimeOnly(end) || end;
  const start = String(startTime || "").trim();
  return start ? TIME_LEDGER_IN_PROGRESS_LABEL : "";
}

/** 모바일 카드 시간 줄 HTML: 완료 시 시작–마감, 진행 중이면 시작–「진행중」태그(현재 시각 미표시) */
function getMobileCardTimeRangeHtmlForRow(rowData) {
  const startStr = toDisplayTimeOnly(rowData?.startTime) || "";
  const endStr = toDisplayTimeOnly(rowData?.endTime) || "";
  if (startStr && endStr) return escapeHtml(`${startStr} - ${endStr}`);
  if (startStr && !rowHasEndTimeForMobileCard(rowData)) {
    return `${escapeHtml(startStr)} - <span data-legacy="time-mobile-card-in-progress-tag">${escapeHtml(TIME_LEDGER_IN_PROGRESS_LABEL)}</span>`;
  }
  const single = startStr || endStr || "";
  return single ? escapeHtml(single) : "";
}

function getMobileCardProductivityValue(rowData) {
  if (!rowData) return "";
  return (
    (rowData.productivity || "").trim() ||
    getProductivityFromCategory(rowData.category) ||
    ""
  );
}

const MOBILE_CARD_TIME_SLOT_CLASSES = [
  "calendar-1day-timeline-card--usage-slot-productive",
  "calendar-1day-timeline-card--usage-slot-nonproductive",
  "calendar-1day-timeline-card--usage-slot-sleep",
];

/** 사용내역 카드 — 시작·마감 시각 칸 배경(생산/비생산/수면) */
function getMobileCardTimeSlotBgClass(rowData) {
  if (!rowData) return "";
  const { category, productivity } =
    resolveRowCategoryProductivityForAudit(rowData);
  const cat = String(category || "").trim();
  if (cat === "sleep") {
    return "calendar-1day-timeline-card--usage-slot-sleep";
  }
  const pv = (
    String(productivity || "").trim().toLowerCase() ||
    String(getProductivityFromCategory(cat) || "")
      .trim()
      .toLowerCase()
  );
  if (pv === "productive") {
    return "calendar-1day-timeline-card--usage-slot-productive";
  }
  if (pv === "nonproductive") {
    return "calendar-1day-timeline-card--usage-slot-nonproductive";
  }
  return "";
}

function applyMobileCardTimeSlotBgClass(card, rowData) {
  if (!card) return;
  for (const cls of MOBILE_CARD_TIME_SLOT_CLASSES) {
    card.classList.remove(cls);
  }
  const slotClass = getMobileCardTimeSlotBgClass(rowData);
  if (slotClass) card.classList.add(slotClass);
}

function hoursBetweenRowStartEnd(rowData) {
  let startTime =
    formatDateTimeInput(rowData.startTime) ||
    String(rowData.startTime || "").trim();
  let endTime =
    formatDateTimeInput(rowData.endTime) ||
    String(rowData.endTime || "").trim();
  if (!startTime || !endTime) return 0;
  endTime = mergeEndTimeWithStartDate(startTime, endTime) || endTime;
  const toIso = (str) => {
    const m = str.match(
      /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[T\s]+(\d{1,2}):(\d{2})/,
    );
    if (m)
      return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:00`;
    const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}T${m2[4]}:${m2[5]}:00`;
    return String(str).replace(" ", "T") + ":00";
  };
  try {
    const s = new Date(toIso(startTime));
    const e = new Date(toIso(endTime));
    const diff = (e - s) / (1000 * 60 * 60);
    return diff > 0 && isFinite(diff) ? diff : 0;
  } catch (_) {
    return 0;
  }
}

/** 행동의 가치 계산용 유효 시간(h): 사용시간 입력 > 마감 있음(구간) > 진행 중(경과) */
export function getMobileCardEffectiveHoursForPrice(rowData) {
  const tracked = (rowData.timeTracked || "").trim();
  if (tracked) return parseTimeToHours(tracked) || 0;
  if (rowHasEndTimeForMobileCard(rowData))
    return hoursBetweenRowStartEnd(rowData);
  const start = getRowStartInstantForMobileCard(rowData);
  if (!start) return 0;
  const ms = Date.now() - start.getTime();
  return ms < 0 ? 0 : ms / 3600000;
}

function computeMobileCardPriceValue(rowData, hourlyRate) {
  const hours = getMobileCardEffectiveHoursForPrice(rowData);
  const rate = parseFloat(String(hourlyRate ?? 0).replace(/,/g, "")) || 0;
  const pv = getMobileCardProductivityValue(rowData);
  let price = hours * rate;
  if (pv === "nonproductive") price *= -1;
  else if (pv === "other" || pv === "그 외" || !pv) price = 0;
  return price;
}

/** 리스트 카드 가격 칸: productive / nonproductive / other(금액 없음) */
function getMobileCardPriceProductivitySlot(rowData) {
  const pv = getMobileCardProductivityValue(rowData);
  if (pv === "productive") return "productive";
  if (pv === "nonproductive") return "nonproductive";
  return "other";
}

function applyMobileCardPriceEl(priceEl, rowData, hourlyRate) {
  if (!priceEl) return;
  const slot = getMobileCardPriceProductivitySlot(rowData);
  const value = computeMobileCardPriceValue(rowData, hourlyRate);
  for (const t of [
    "time-mobile-card-price--productive",
    "time-mobile-card-price--nonproductive",
    "time-mobile-card-price--other",
    "is-positive",
    "is-negative",
  ]) {
    lpTokenRemove(priceEl, t);
    priceEl.classList.remove(t);
  }
  lpTokenAdd(priceEl, `time-mobile-card-price--${slot}`);
  priceEl.classList.add(`time-mobile-card-price--${slot}`);
  if (slot === "other") {
    priceEl.textContent = "\u00a0";
    return;
  }
  const display = formatTimeLedgerActionPriceDisplay(value, slot);
  priceEl.textContent = display || "\u00a0";
}

function mobileCardNeedsLiveClock(rowData) {
  if (!timeLedgerRowIsActiveLiveInProgress(rowData)) return false;
  return !!getRowStartInstantForMobileCard(rowData);
}

/** 마감 없이 시작만 있는 오늘 기록 = 진행 중 (홈 타임트래커·모바일 카드와 동일 기준) */
function timeLedgerRowIsLiveInProgress(row) {
  return mobileCardNeedsLiveClock(row);
}

/** Calendar 타임라인 등: 실제로 마감 없이 기록 중인 행인지 */
export function isTimeLedgerRowLiveRecording(row) {
  return timeLedgerRowIsLiveInProgress(row);
}

/**
 * 오늘 날짜 기준, 현재 진행 중인 시간기록 행 하나(시작 최신 순).
 * 없으면 null.
 */
export function getTodayLiveTimeLedgerRow() {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const rows = loadTimeRows().filter(
    (r) => (r.date || "").toString().slice(0, 10) === todayKey,
  );
  const live = rows.filter(timeLedgerRowIsLiveInProgress);
  if (!live.length) return null;
  live.sort((a, b) => {
    const sa = getRowStartInstantForMobileCard(a)?.getTime() ?? 0;
    const sb = getRowStartInstantForMobileCard(b)?.getTime() ?? 0;
    return sb - sa;
  });
  return live[0];
}

/** 갱신 타이머용 행 식별 (id 또는 날짜·시작·과제명) */
export function getTimeLedgerRowLiveStableKey(row) {
  if (!row) return "";
  const id = String(row.id || "").trim();
  if (id) return `id:${id}`;
  return `k:${(row.date || "").slice(0, 10)}|${(row.startTime || "").trim()}|${(row.taskName || "").trim()}`;
}

export function getTimeLedgerRowLiveElapsedMs(row) {
  const start = getRowStartInstantForMobileCard(row);
  if (!start) return 0;
  return Date.now() - start.getTime();
}

/** 홈 타임트래커 부가 문구: 「N분째」(60분 미만) 또는 「h시간 m분째」 */
export function formatHomeLiveElapsedMinutesPhrase(ms) {
  const m = Math.floor(ms / 60000);
  if (m <= 0) return "방금 시작";
  if (m < 60) return `${m}분째`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}시간 ${r}분째`;
}

/** 정수 분 소요 시간: 60분 미만 「N분」, 이상 「h시간 m분」(예: 480 → 8시간 0분) */
export function formatIntegerMinutesDurationKo(totalMinutes) {
  const n = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (n < 60) return `${n}분`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${h}시간 ${m}분`;
}

/** Diary 로그 타임라인 등: 저장된 시급 기준 모바일 카드와 동일한 「행동의 가치」표시 */
export function getTimeLedgerRowMobilePriceDisplay(rowData) {
  const hourlyRate = readUserHourlyRateNumber();
  const slot = getMobileCardPriceProductivitySlot(rowData);
  const value = computeMobileCardPriceValue(rowData, hourlyRate);
  return {
    slot,
    text: formatTimeLedgerActionPriceDisplay(value, slot),
  };
}

/** 홈 타임트래커: 시작 시각 (짧은 h:mm) */
export function formatHomeLiveStartClock(row) {
  if (!row) return "";
  const fromStart = toDisplayTimeOnly(row.startTime || "");
  if (fromStart) {
    const parts = fromStart.split(":");
    if (parts.length >= 2)
      return `${parseInt(parts[0], 10)}:${parts[1].padStart(2, "0")}`;
  }
  const inst = getRowStartInstantForMobileCard(row);
  if (!inst) return "";
  return `${inst.getHours()}:${String(inst.getMinutes()).padStart(2, "0")}`;
}

function updateMobileTimeCardLiveFields(card) {
  if (!card?._rowData) return;
  const live = mobileCardNeedsLiveClock(card._rowData);
  lpTokenToggle(card, "time-ledger-mobile-card--in-progress", live);
  card.classList.toggle("calendar-1day-timeline-card--in-progress", live);
  if (!live) return;
  const rd = card._rowData;
  const viewEl = card._timeLedgerViewEl;
  const trackedEl = card.querySelector(".calendar-1day-timeline-card-duration");
  const endEl = card.querySelector(".calendar-1day-timeline-card-end");
  const priceEl = card.querySelector(".diary-tab5-timeline-price");
  const start = getRowStartInstantForMobileCard(rd);
  if (!start) return;
  const ms = Date.now() - start.getTime();
  if (trackedEl) {
    const mins = ms < 0 ? 0 : Math.floor(ms / 60000);
    trackedEl.textContent = formatIntegerMinutesDurationKo(mins);
  }
  if (endEl) endEl.textContent = TIME_LEDGER_IN_PROGRESS_LABEL;
  if (priceEl && viewEl) {
    const hourlyInput = viewEl.querySelector(
      '[data-legacy~="time-hourly-input"]',
    );
    const hourlyRate =
      parseFloat(String(hourlyInput?.value || "0").replace(/,/g, "")) || 0;
    applyMobileCardPriceEl(priceEl, rd, hourlyRate);
  }
}

/** 시간(소수)을 "HH:MM" 형식으로 표시 */
function formatHoursToHHMM(hours) {
  if (hours < 0 || !isFinite(hours)) return "00:00";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 시간(소수)을 "X시간 Y분" 또는 "X분" 형식으로 표시 (평가 문구용) */
function formatHoursToReadable(hours) {
  if (hours < 0 || !isFinite(hours)) return "0분";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

function formatEnergyForDisplay(val) {
  const s = String(val || "")
    .trim()
    .replace(/%/g, "");
  if (!s) return "";
  const n = parseInt(s.replace(/^\+/, ""), 10);
  if (!isNaN(n) && n >= -50 && n <= 50) {
    return n > 0 ? `+${n}%` : n + "%";
  }
  return s;
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 기간에 따른 날짜 범위 반환 (YYYY-MM-DD, 로컬 기준) - 레거시 period 문자열용 */
function getDateRangeForPeriod(period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (period === "이번달") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today);
    return { start: toDateStr(start), end: toDateStr(end) };
  }
  if (period === "지난달") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: toDateStr(start), end: toDateStr(end) };
  }
  if (period === "최근 7일") {
    const end = new Date(today);
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { start: toDateStr(start), end: toDateStr(end) };
  }
  if (period === "전일") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { start: toDateStr(yesterday), end: toDateStr(yesterday) };
  }
  return { start: null, end: null };
}

/** 하루 필터용 날짜 표시 포맷 (예: 2월 27일 (금)) */
function formatDateForDayFilter(dateStr) {
  if (!dateStr || dateStr.length < 10) return "";
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return "";
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = d.toLocaleDateString("ko-KR", { weekday: "short" });
  return `${month}월 ${day}일 (${weekday})`;
}

/** 필터 타입에 따른 날짜 범위 반환 (월별/일주일/하루/날짜선택) */
function getDateRangeForFilterType(type, year, month, start, end) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (type === "day") {
    const d = start && start.length >= 10 ? start : toDateStr(today);
    return { start: d, end: d };
  }
  if (type === "week") {
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return { start: toDateStr(weekAgo), end: toDateStr(today) };
  }
  if (type === "month" && year && month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    return { start: toDateStr(startDate), end: toDateStr(endDate) };
  }
  if (type === "range" && start && end) {
    let s = start;
    let e = end;
    if (s > e) {
      const t = s;
      s = e;
      e = t;
    }
    return { start: s, end: e };
  }
  return { start: null, end: null };
}

/** 필터 타입에 따른 표시 라벨 */
function getFilterPeriodLabel(type, year, month, start, end) {
  if (type === "month" && year && month) return `${year}년 ${month}월`;
  if (type === "week") return "최근 7일";
  if (type === "day")
    return formatDateForDayFilter(start || toDateStr(new Date())) || "오늘";
  if (type === "range" && start && end)
    return start === end
      ? formatDateForDayFilter(start) || start
      : `${start} ~ ${end}`;
  return "";
}

/** 기간에 맞는 행 필터링 */
function filterRowsByPeriod(rows, period) {
  const { start, end } = getDateRangeForPeriod(period);
  return rows.filter((r) => {
    const d = (r.date || "").trim();
    if (!d) return false;
    if (!start || !end) return true;
    return d >= start && d <= end;
  });
}

/** 날짜 문자열을 YYYY-MM-DD로 정규화 (필터 비교용) */
function normalizeDateForCompare(str) {
  if (!str || typeof str !== "string") return "";
  const m = str.trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return "";
}

/** 로컬 저장 행의 시각 문자열 → 당일 기준 분(0~1439) */
function parseLedgerTimeStringToMinutes(s) {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  const m = t.match(/[T\s](\d{1,2}):(\d{2})/) || t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  const hh = ((h % 24) + 24) % 24;
  const mm = ((min % 60) + 60) % 60;
  return hh * 60 + mm;
}

/** 행당 '그날 마지막 시각': 마감 있으면 마감, 없으면 시작 */
function rowEffectiveLastMinutesLedger(row) {
  const endTrim = (row?.endTime || "").trim();
  const src = endTrim ? row.endTime : row.startTime;
  return parseLedgerTimeStringToMinutes(String(src || ""));
}

/** loadTimeRows와 화면 캐시(allRowsCache) 병합 — 동일 id·동일 복합키는 캐시가 우선 */
function mergeLedgerRowsForDedupe(diskRows, cacheRows) {
  const map = new Map();
  const keyOf = (r) => {
    if (!r || typeof r !== "object") return "";
    const id = String(r.id || "").trim();
    if (id) return `id:${id}`;
    const d =
      normalizeDateForCompare(r.date || "") ||
      String(r.date || "")
        .trim()
        .replace(/\//g, "-")
        .slice(0, 10);
    return `c:${d}|${(r.taskName || "").trim()}|${(r.startTime || "").trim()}`;
  };
  for (const r of diskRows || []) {
    if (r) map.set(keyOf(r), r);
  }
  for (const r of cacheRows || []) {
    if (r) map.set(keyOf(r), r);
  }
  return [...map.values()];
}

/**
 * 로컬 배열에서 시간기록 행 제거.
 * - id(UUID)가 있으면 id만으로 제거(시작시간 표기 yyyy/mm/dd HH:mm vs HH:mm 불일치로 캐시에서 안 지워지던 문제 방지).
 * - id가 없으면 날짜·과제명·시작시간 복합키(여러 표기 변형)로 시도.
 * @returns {{ next: typeof rows, removed: number }}
 */
function removeTimeLedgerRowFromRows(rows, rowData) {
  const arr = Array.isArray(rows) ? rows.slice() : [];
  if (!rowData || typeof rowData !== "object") {
    return { next: arr, removed: 0 };
  }
  const entryId = String(rowData.id || "").trim();
  if (entryId) {
    const before = arr.length;
    const next = arr.filter((c) => String(c?.id || "").trim() !== entryId);
    return { next, removed: before - next.length };
  }
  const d =
    normalizeDateForCompare(rowData.date || "") ||
    String(rowData.date || "")
      .trim()
      .replace(/\//g, "-")
      .slice(0, 10);
  const task = String(rowData.taskName || "").trim();
  const stRaw = String(rowData.startTime || "").trim();
  const stNorm = formatDateTimeInput(stRaw) || stRaw;
  const dateVariants = new Set([d]);
  const rawDate = String(rowData.date || "").trim();
  if (rawDate) {
    dateVariants.add(rawDate.replace(/\//g, "-").slice(0, 10));
  }
  const keySet = new Set();
  for (const dv of dateVariants) {
    if (!dv) continue;
    keySet.add(`${dv}|${task}|${stRaw}`);
    keySet.add(`${dv}|${task}|${stNorm}`);
  }
  const before = arr.length;
  const next = arr.filter((c) => {
    const cd =
      normalizeDateForCompare(c.date || "") ||
      String(c.date || "")
        .trim()
        .replace(/\//g, "-")
        .slice(0, 10);
    const cn = String(c.taskName || "").trim();
    const stc = String(c.startTime || "").trim();
    const cNorm = formatDateTimeInput(stc) || stc;
    const c1 = `${cd}|${cn}|${stc}`;
    const c2 = `${cd}|${cn}|${cNorm}`;
    for (const k of keySet) {
      if (k === c1 || k === c2) return false;
    }
    return true;
  });
  return { next, removed: before - next.length };
}

/**
 * 신규 과제 기록 시작 시각 제안: 해당일 기록 중 마감이 있으면 **가장 늦은 마감** 시각,
 * 전부 마감 없으면 **가장 늦은 시작** 시각. `r.date`가 비면 `startTime`에서 날짜 추출.
 */
export function getNextTaskLogStartHhMmFromLedger(
  dateInputValue,
  exclude,
  rowsOverride,
) {
  const normDate =
    normalizeDateForCompare(dateInputValue || "") ||
    String(dateInputValue || "")
      .trim()
      .replace(/\//g, "-")
      .slice(0, 10);
  if (!normDate) return null;
  const rows =
    rowsOverride !== undefined && rowsOverride !== null
      ? rowsOverride
      : loadTimeRows();
  const dayRows = [];
  for (const r of rows) {
    if (!r) continue;
    const rd =
      normalizeDateForCompare(r.date || "") ||
      parseDateFromDateTime(String(r.startTime || ""));
    if (rd !== normDate) continue;
    if (exclude) {
      const rid = String(r.id || "").trim();
      if (exclude.id && rid && rid === exclude.id) continue;
      const ck = `${rd}|${(r.taskName || "").trim()}|${(r.startTime || "").trim()}`;
      if (exclude.composite && ck === exclude.composite) continue;
    }
    dayRows.push(r);
  }
  if (dayRows.length === 0) return null;

  const withEnd = dayRows.filter((r) => String(r.endTime || "").trim());
  let maxM = -1;

  const bump = (fieldVal) => {
    const mm = parseLedgerTimeStringToMinutes(String(fieldVal || ""));
    if (mm != null && mm > maxM) maxM = mm;
  };

  if (withEnd.length) {
    for (const r of withEnd) bump(r.endTime);
  } else {
    for (const r of dayRows) bump(r.startTime);
  }

  if (maxM < 0) return null;
  const h = Math.floor(maxM / 60) % 24;
  const mi = maxM % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/** 날짜·시작시간 기준 과거→최근 (이른 날짜·이른 시각이 위, 시간레포트 로그와 동일) */
function sortRowsByDateTime(rows) {
  return [...rows].sort((a, b) => {
    const dateA = normalizeDateForCompare(a.date || "") || a.date || "";
    const dateB = normalizeDateForCompare(b.date || "") || b.date || "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const startA = parseDateTimeToHours(a.startTime) ?? 0;
    const startB = parseDateTimeToHours(b.startTime) ?? 0;
    return startA - startB;
  });
}

/** 필터·목록용 행 날짜 (date 없으면 startTime에서 추출) */
function ledgerRowDateYmdForFilter(r) {
  return ledgerRowEntryDateYmd(r);
}

/** 필터 타입에 따른 행 필터링 (기록날짜 기준) */
function filterRowsByFilterType(rows, type, year, month, start, end) {
  const { start: s, end: e } = getDateRangeForFilterType(
    type,
    year,
    month,
    start,
    end,
  );
  const normStart = normalizeDateForCompare(s) || s;
  const normEnd = normalizeDateForCompare(e) || e;
  const filtered = rows.filter((r) => {
    const d = ledgerRowDateYmdForFilter(r);
    if (!d) return false;
    if (!normStart || !normEnd) return true;
    return d >= normStart && d <= normEnd;
  });
  return sortRowsByDateTime(filtered);
}

/** 과제명별 시간 집계 { taskName: hours } */
function aggregateHoursByTask(rows) {
  const map = {};
  rows.forEach((r) => {
    const task = (r.taskName || "").trim();
    if (!task) return;
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0) return;
    map[task] = (map[task] || 0) + hrs;
  });
  return map;
}

/** 과제별 dominant 카테고리 (해당 과제에 가장 많은 시간이 배정된 카테고리) */
function getDominantCategoryForTask(rows, taskName) {
  const byCat = {};
  rows.forEach((r) => {
    if ((r.taskName || "").trim() !== taskName) return;
    const cat = (r.category || "").trim() || "";
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0) return;
    byCat[cat] = (byCat[cat] || 0) + hrs;
  });
  let maxHrs = 0;
  let maxCat = "";
  Object.entries(byCat).forEach(([cat, hrs]) => {
    if (hrs > maxHrs) {
      maxHrs = hrs;
      maxCat = cat;
    }
  });
  return maxCat;
}

/** 카테고리별 시간 집계 { category: hours } */
function aggregateHoursByCategory(rows) {
  const map = {};
  rows.forEach((r) => {
    const cat = (r.category || "").trim() || "그 외";
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0) return;
    map[cat] = (map[cat] || 0) + hrs;
  });
  return map;
}

/** 생산성별 시간 집계 { productive: hrs, nonproductive: hrs } */
function aggregateHoursByProductivity(rows) {
  let productive = 0;
  let nonproductive = 0;
  rows.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0) return;
    const p = r.productivity || getProductivityFromCategory(r.category);
    if (p === "productive") productive += hrs;
    else if (p === "nonproductive") nonproductive += hrs;
  });
  return { productive, nonproductive };
}

/** 생산성별 시간 집계 (3분류) { productive, nonproductive, other } */
function aggregateHoursByProductivityAllThree(rows) {
  let productive = 0;
  let nonproductive = 0;
  let other = 0;
  rows.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0) return;
    const p = r.productivity || getProductivityFromCategory(r.category);
    if (p === "productive") productive += hrs;
    else if (p === "nonproductive") nonproductive += hrs;
    else other += hrs;
  });
  return { productive, nonproductive, other };
}

/** 기간 내 하루 가치 합계 (시급 * 시간, 생산성 반영) */
function calcPeriodValue(rows, period, hourlyRate) {
  const filtered = filterRowsByPeriod(rows, period);
  return calcPeriodValueFromFiltered(filtered, hourlyRate);
}

function calcPeriodValueFromFiltered(filtered, hourlyRate) {
  let sum = 0;
  filtered.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked);
    const pv = (
      r.productivity ||
      getProductivityFromCategory(r.category) ||
      ""
    ).trim();
    let price = hrs * hourlyRate;
    if (pv === "nonproductive") price *= -1;
    else if (pv === "other" || pv === "그 외" || !pv) price = 0;
    sum += price;
  });
  return sum;
}

/** 오늘 날짜 시간 기록 요약 (홈/오늘 뷰 4분면용) */
export function getTodayTimeSummary() {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const rows = loadTimeRows().filter(
    (r) => (r.date || "").toString().slice(0, 10) === todayKey,
  );
  let hourlyRate = 0;
  try {
    hourlyRate =
      parseFloat(
        String(readUserHourlyRateLocal() || "0").replace(
          /,/g,
          "",
        ),
      ) || 0;
  } catch (_) {}
  let totalHrs = 0;
  let productiveHrs = 0;
  let investedPrice = 0;
  let wastedValue = 0;
  let workHrsToday = 0;
  let sleepHrsToday = 0;
  rows.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked) || 0;
    totalHrs += hrs;
    const cat = (r.category || "").trim();
    if (cat === "work") workHrsToday += hrs;
    else if (cat === "sleep") sleepHrsToday += hrs;
    const pv = (
      r.productivity ||
      getProductivityFromCategory(r.category) ||
      ""
    ).trim();
    if (pv === "productive") {
      productiveHrs += hrs;
      investedPrice += hrs * hourlyRate;
    }
    if (pv === "nonproductive") {
      wastedValue += hrs * hourlyRate;
    }
  });
  const trackedDisplay =
    totalHrs <= 0 || !isFinite(totalHrs)
      ? "0h 0m"
      : formatHoursDisplay(totalHrs);
  const productiveDisplay =
    productiveHrs <= 0 || !isFinite(productiveHrs)
      ? "0h 0m"
      : formatHoursDisplay(productiveHrs);
  /** 홈 오늘 통계: 총 기록 목표(고정) */
  const totalRecordGoalHours = TIME_LEDGER_DAILY_RECORD_CAP_HOURS;
  const totalRecordGoalDisplay = formatHoursDisplay(totalRecordGoalHours);
  /** 24h − 근무 − 수면 = 가용 시간(당일 기록 기준) */
  const availableHrsToday = Math.max(0, 24 - workHrsToday - sleepHrsToday);
  /** 홈 통계 푸터: 짧은 한 줄(가용 시·분 + '중'은 줄바꿈 유발) */
  const productiveContextDisplay = "가용 시간의";
  /** 홈 요약 막대: 하루 24시간 기준… (호환용) */
  const trackedPct24 = Math.min(100, Math.max(0, (totalHrs / 24) * 100));
  const productivePct24 = Math.min(
    100,
    Math.max(0, (productiveHrs / 24) * 100),
  );
  /** 총기록 막대: 고정 목표(23h59m) 대비 */
  const trackedPctOfGoal = Math.min(
    100,
    Math.max(0, (totalHrs / totalRecordGoalHours) * 100),
  );
  /** 생산적 막대: 당일 가용 시간 대비 */
  const productivePctOfAvailable =
    availableHrsToday > 0 && isFinite(availableHrsToday)
      ? Math.min(100, Math.max(0, (productiveHrs / availableHrsToday) * 100))
      : 0;
  return {
    trackedDisplay,
    productiveDisplay,
    priceDisplay: `+${formatPrice(investedPrice)}`,
    wastedDisplay: `-${formatPrice(wastedValue)}`,
    totalRecordGoalDisplay,
    productiveContextDisplay,
    trackedPct24,
    productivePct24,
    trackedPctOfGoal,
    productivePctOfAvailable,
    trackedGoalPercentLabel: `${Math.round(trackedPctOfGoal)}%`,
    productiveOfAvailablePercentLabel: `${Math.round(productivePctOfAvailable)}%`,
  };
}

/** 오늘(로컬 달력) 시간기록 행동가치 합 — 시간가계부와 동일 규칙(시급·생산성) */
export function getTodayTimeLedgerValueSum() {
  const todayKey = timeLedgerLocalTodayYmd();
  const rows = loadTimeRows().filter(
    (r) => (r.date || "").toString().slice(0, 10) === todayKey,
  );
  let hourlyRate = 0;
  try {
    hourlyRate =
      parseFloat(
        String(readUserHourlyRateLocal() || "0").replace(
          /,/g,
          "",
        ),
      ) || 0;
  } catch (_) {}
  return calcPeriodValueFromFiltered(rows, hourlyRate);
}

/**
 * 시간사용 레포트 도넛: 수면·근무 제외, 생산·비생산 카테고리별 시간(행 배열 동일 규칙).
 */
function aggregateDailyTimeReportDonutFromLedgerRows(rows) {
  const byCat = {};
  rows.forEach((r) => {
    const { category, productivity } = resolveRowCategoryProductivityForAudit(r);
    const cat = (category || "").trim();
    if (cat === "work" || cat === "sleep") return;
    const p = (
      String(productivity || "")
        .trim()
        .toLowerCase() || getProductivityFromCategory(cat)
    ).trim();
    if (p !== "productive" && p !== "nonproductive") return;
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0 || !Number.isFinite(hrs)) return;
    const k = cat || "other";
    byCat[k] = (byCat[k] || 0) + hrs;
  });
  const totalHours = Object.values(byCat).reduce((a, h) => a + h, 0);
  const categoryLabel = (value) => {
    if (!value || value === "other") return "미분류";
    const opt = CATEGORY_OPTIONS.find((o) => o.value === value);
    return opt?.label || value;
  };
  const segments = Object.entries(byCat)
    .map(([catKey, hours]) => ({
      key: catKey,
      label: categoryLabel(catKey),
      hours,
    }))
    .sort((a, b) => b.hours - a.hours);
  return {
    segments,
    totalHours,
    totalMinutesRounded: Math.round(totalHours * 60),
  };
}

/** 앵커 YYYY-MM-DD가 속한 달의 1일~말일(문자열, inclusive) — 동기화·월 집계용 */
export function getTimeReportMonthInclusiveRange(ymdTen) {
  const key = String(ymdTen || "")
    .replace(/\//g, "-")
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const y = parseInt(key.slice(0, 4), 10);
  const mo = parseInt(key.slice(5, 7), 10) - 1;
  const lastDay = new Date(y, mo + 1, 0).getDate();
  const ym = key.slice(0, 7);
  return {
    start: `${ym}-01`,
    end: `${ym}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * 시간사용 레포트(일별): 해당 날짜에서 수면·근무 기록을 제외하고,
 * 생산·비생산 세부(category)별 시간 — 도넛 차트용.
 */
export function getDailyTimeReportDonutSnapshot(ymdTen) {
  const key = String(ymdTen || "")
    .replace(/\//g, "-")
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return { segments: [], totalHours: 0, totalMinutesRounded: 0 };
  }
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d === key;
  });
  return aggregateDailyTimeReportDonutFromLedgerRows(rows);
}

/**
 * 시간사용 레포트(월별): 해당 월 1일~말일 — 도넛(일별과 동일 집계 규칙).
 */
export function getMonthlyTimeReportDonutSnapshot(ymdTen) {
  const range = getTimeReportMonthInclusiveRange(ymdTen);
  if (!range) {
    return { segments: [], totalHours: 0, totalMinutesRounded: 0 };
  }
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d >= range.start && d <= range.end;
  });
  return aggregateDailyTimeReportDonutFromLedgerRows(rows);
}

function readUserHourlyRateNumber() {
  try {
    return (
      parseFloat(
        String(readUserHourlyRateLocal() || "0").replace(
          /,/g,
          "",
        ),
      ) || 0
    );
  } catch (_) {
    return 0;
  }
}

function aggregateDailyTimeReportSummaryFromLedgerRows(rows) {
  const hourlyRate = readUserHourlyRateNumber();
  let workMinutes = 0;
  let sleepMinutes = 0;
  let mediaMinutes = 0;
  let mediaLossWon = 0;
  let pleasureMinutes = 0;
  let pleasureLossWon = 0;
  let unhappinessMinutes = 0;
  let unhappinessLossWon = 0;
  let unhealthyMinutes = 0;
  const unhealthyMealDetails = [];
  let moneylosingMinutes = 0;
  let moneylosingLossWon = 0;

  rows.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0 || !Number.isFinite(hrs)) return;
    const { category: catRaw, productivity: prodRaw } =
      resolveRowCategoryProductivityForAudit(r);
    const cat = String(catRaw || "").trim();
    const pv = (
      String(prodRaw || "")
        .trim()
        .toLowerCase() ||
      String(getProductivityFromCategory(cat) || "")
        .trim()
        .toLowerCase()
    ).trim();
    const mins = Math.round(hrs * 60);
    const wonMag =
      hourlyRate > 0 && Number.isFinite(hrs * hourlyRate)
        ? Math.round(hrs * hourlyRate)
        : 0;
    const countsLoss = pv === "nonproductive";

    if (cat === "work") {
      workMinutes += mins;
      return;
    }
    if (cat === "sleep") {
      sleepMinutes += mins;
      return;
    }
    if (cat === "media_watch") {
      mediaMinutes += mins;
      if (countsLoss) mediaLossWon += wonMag;
      return;
    }
    if (cat === "pleasure") {
      pleasureMinutes += mins;
      if (countsLoss) pleasureLossWon += wonMag;
      return;
    }
    if (cat === "unhappiness") {
      unhappinessMinutes += mins;
      if (countsLoss) unhappinessLossWon += wonMag;
      return;
    }
    if (cat === "unhealthy") {
      unhealthyMinutes += mins;
      const tn = String(r.taskName || "").trim();
      if (TTC.isUnhealthyMealDetailTaskName(tn)) {
        const md = String(r.mealDetail || "").trim();
        if (md) unhealthyMealDetails.push(md);
      }
      return;
    }
    if (cat === "moneylosing") {
      moneylosingMinutes += mins;
      if (countsLoss) moneylosingLossWon += wonMag;
    }
  });

  return {
    workMinutes,
    sleepMinutes,
    mediaMinutes,
    mediaLossWon,
    pleasureMinutes,
    pleasureLossWon,
    unhappinessMinutes,
    unhappinessLossWon,
    unhealthyMinutes,
    unhealthyMealDetails: [...new Set(unhealthyMealDetails)],
    moneylosingMinutes,
    moneylosingLossWon,
    hourlyRate,
  };
}

/**
 * 시간사용 레포트(일별): 근무·수면·미디어·쾌락충족·불행·비건강·돈을 잃는 일 집계(시급×시간은 비생산과 동일).
 * 식단 목록은 소비 탭 「건강하지 않은 섭취」 카드에서 표시(「건강하지 않은 섭취」 과제 mealDetail).
 */
export function getDailyTimeReportSummaryGrid(ymdTen) {
  const key = String(ymdTen || "")
    .replace(/\//g, "-")
    .slice(0, 10);
  const empty = () => ({
    workMinutes: 0,
    sleepMinutes: 0,
    mediaMinutes: 0,
    mediaLossWon: 0,
    pleasureMinutes: 0,
    pleasureLossWon: 0,
    unhappinessMinutes: 0,
    unhappinessLossWon: 0,
    unhealthyMinutes: 0,
    unhealthyMealDetails: [],
    moneylosingMinutes: 0,
    moneylosingLossWon: 0,
    hourlyRate: 0,
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return empty();

  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d === key;
  });
  return aggregateDailyTimeReportSummaryFromLedgerRows(rows);
}

/**
 * 시간사용 레포트(월별): 해당 월 1일~말일 요약 카드 그리드(일별과 동일 규칙).
 */
export function getMonthlyTimeReportSummaryGrid(ymdTen) {
  const empty = () => ({
    workMinutes: 0,
    sleepMinutes: 0,
    mediaMinutes: 0,
    mediaLossWon: 0,
    pleasureMinutes: 0,
    pleasureLossWon: 0,
    unhappinessMinutes: 0,
    unhappinessLossWon: 0,
    unhealthyMinutes: 0,
    unhealthyMealDetails: [],
    moneylosingMinutes: 0,
    moneylosingLossWon: 0,
    hourlyRate: 0,
  });
  const range = getTimeReportMonthInclusiveRange(ymdTen);
  if (!range) return empty();
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d >= range.start && d <= range.end;
  });
  return aggregateDailyTimeReportSummaryFromLedgerRows(rows);
}

function aggregateTopTasksByTrackedMinutesFromRows(rows, limit) {
  const cap = Math.max(1, Math.min(12, Number(limit) || 3));
  /** @type {Map<string, number>} */
  const map = new Map();
  rows.forEach((r) => {
    const { category: catRaw } = resolveRowCategoryProductivityForAudit(r);
    const cat = String(catRaw || "").trim();
    if (cat === "work" || cat === "sleep") return;
    const name = String(r.taskName || "").trim();
    if (!name) return;
    const hrs = parseTimeToHours(r.timeTracked);
    if (!(hrs > 0) || !Number.isFinite(hrs)) return;
    const mins = Math.round(hrs * 60);
    map.set(name, (map.get(name) || 0) + mins);
  });
  const arr = [...map.entries()].map(([taskName, minutes]) => ({ taskName, minutes }));
  arr.sort((a, b) => {
    if (b.minutes !== a.minutes) return b.minutes - a.minutes;
    return String(a.taskName).localeCompare(String(b.taskName), "ko");
  });
  return arr.slice(0, cap);
}

/** 소비 레포트: 해당 일 기준 과제명별 기록 시간 합 → 상위 N개(근무·수면 제외) */
export function getDailyTimeReportTopTasksByMinutes(ymdTen, limit = 3) {
  const key = String(ymdTen || "")
    .replace(/\//g, "-")
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return [];
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d === key;
  });
  return aggregateTopTasksByTrackedMinutesFromRows(rows, limit);
}

/** 소비 레포트: 해당 월 기준 과제명별 기록 시간 합 → 상위 N개(근무·수면 제외) */
export function getMonthlyTimeReportTopTasksByMinutes(ymdTen, limit = 3) {
  const range = getTimeReportMonthInclusiveRange(ymdTen);
  if (!range) return [];
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d >= range.start && d <= range.end;
  });
  return aggregateTopTasksByTrackedMinutesFromRows(rows, limit);
}

/** 소비·투자 레포트: 투자·다시 받을 금액 「+₩n」 표기(소비 -₩n 과 동일 간격) */
export function formatInvestReclaimWonDisplay(won) {
  const w = Math.round(Number(won) || 0);
  return `+₩${formatLedgerWonInteger(w)}`;
}

/** 다시 받을 금액: 마감·사용시간 입력 등 확정된 기록만. 진행 중(경과) 행은 제외해 금액이 실시간으로 변하지 않게 함 */
export function getLedgerEffectiveHoursForReclaim(rowData) {
  if (!rowData) return 0;
  if (timeLedgerRowIsLiveInProgress(rowData)) return 0;
  return getMobileCardEffectiveHoursForPrice(rowData);
}

/** 다시 받을 금액·투자 레포트: 해당 기간 **표시 생산적** 과제 기록의 유효 시간 합 × 시급(행동의 가치 +와 일치) */
function aggregateInvestReclaimSnapshotFromRows(rows) {
  const hourlyRate = readUserHourlyRateNumber();
  let reclaimHrs = 0;
  rows.forEach((r) => {
    if (getTimeLedgerRowDisplayProductivity(r) !== "productive") return;
    const h = getLedgerEffectiveHoursForReclaim(r);
    if (!(h > 0) || !Number.isFinite(h)) return;
    reclaimHrs += h;
  });
  const reclaimMinutesRounded = Math.round(reclaimHrs * 60);
  return {
    reclaimHours: reclaimHrs,
    reclaimMinutesRounded,
    reclaimWon: Math.round(reclaimHrs * hourlyRate),
    hourlyRate,
  };
}

export function getDailyInvestReclaimSnapshot(ymdTen) {
  const key = String(ymdTen || "")
    .replace(/\//g, "-")
    .slice(0, 10);
  const empty = () => ({
    reclaimHours: 0,
    reclaimMinutesRounded: 0,
    reclaimWon: 0,
    hourlyRate: readUserHourlyRateNumber(),
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return empty();
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d === key;
  });
  return aggregateInvestReclaimSnapshotFromRows(rows);
}

export function getMonthlyInvestReclaimSnapshot(ymdTen) {
  const empty = () => ({
    reclaimHours: 0,
    reclaimMinutesRounded: 0,
    reclaimWon: 0,
    hourlyRate: readUserHourlyRateNumber(),
  });
  const range = getTimeReportMonthInclusiveRange(ymdTen);
  if (!range) return empty();
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d >= range.start && d <= range.end;
  });
  return aggregateInvestReclaimSnapshotFromRows(rows);
}

function productiveCategoryLabelForReport(catKey) {
  const row = CATEGORY_OPTIONS.find((x) => x.value === catKey);
  return row?.label || catKey || "";
}

function aggregateProductiveCategoryInvestBarsFromRows(rows) {
  const hourlyRate = readUserHourlyRateNumber();
  const KEYS = ["dream", "happiness", "sideincome", "health"];
  const hoursBy = Object.fromEntries(KEYS.map((k) => [k, 0]));
  let otherProdHours = 0;
  rows.forEach((r) => {
    const h = getMobileCardEffectiveHoursForPrice(r);
    if (!(h > 0) || !Number.isFinite(h)) return;
    const { category, productivity } = resolveRowCategoryProductivityForAudit(r);
    const cat = String(category || "").trim().toLowerCase();
    const pv = (
      String(productivity || "")
        .trim()
        .toLowerCase() ||
      String(getProductivityFromCategory(cat) || "")
        .trim()
        .toLowerCase()
    ).trim();
    if (pv !== "productive") return;
    if (KEYS.includes(cat)) hoursBy[cat] += h;
    else otherProdHours += h;
  });
  /** @type {{ categoryKey: string, label: string, hours: number, won: number, pct: number, pctRounded: number }[]} */
  const segments = KEYS.filter((k) => hoursBy[k] > 1e-9).map((k) => ({
    categoryKey: k,
    label: productiveCategoryLabelForReport(k),
    hours: hoursBy[k],
    won: Math.round(hoursBy[k] * hourlyRate),
    pct: 0,
    pctRounded: 0,
  }));
  if (otherProdHours > 1e-9) {
    segments.push({
      categoryKey: "other_prod",
      label: "그 외(생산)",
      hours: otherProdHours,
      won: Math.round(otherProdHours * hourlyRate),
      pct: 0,
      pctRounded: 0,
    });
  }
  const totalHrs = segments.reduce((s, x) => s + x.hours, 0);
  segments.forEach((s) => {
    s.pct = totalHrs > 0 ? (s.hours / totalHrs) * 100 : 0;
    s.pctRounded = Math.round(s.pct);
  });
  segments.sort((a, b) => b.hours - a.hours);
  return {
    segments,
    totalProductiveHours: totalHrs,
    hourlyRate,
  };
}

export function getDailyProductiveCategoryInvestBarsSnapshot(ymdTen) {
  const key = String(ymdTen || "")
    .replace(/\//g, "-")
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key))
    return { segments: [], totalProductiveHours: 0, hourlyRate: readUserHourlyRateNumber() };
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d === key;
  });
  return aggregateProductiveCategoryInvestBarsFromRows(rows);
}

export function getMonthlyProductiveCategoryInvestBarsSnapshot(ymdTen) {
  const range = getTimeReportMonthInclusiveRange(ymdTen);
  if (!range)
    return { segments: [], totalProductiveHours: 0, hourlyRate: readUserHourlyRateNumber() };
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d >= range.start && d <= range.end;
  });
  return aggregateProductiveCategoryInvestBarsFromRows(rows);
}

const PROD_INVEST_CATEGORY_KEYS = ["dream", "happiness", "sideincome", "health"];

/**
 * 투자 레포트: 생산 카테고리(꿈·행복·부수입·건강)별 과제명·기록 시간 합
 * @param {object[]} rows
 * @param {string} categoryKey
 * @param {number} [limit]
 * @returns {{ taskName: string, minutes: number }[]}
 */
function aggregateProductiveTasksByCategoryFromRows(rows, categoryKey, limit = 200) {
  const cat = String(categoryKey || "").trim().toLowerCase();
  if (!PROD_INVEST_CATEGORY_KEYS.includes(cat)) return [];
  const cap = Math.max(1, Math.min(200, Number(limit) || 200));
  /** @type {Map<string, number>} */
  const map = new Map();
  rows.forEach((r) => {
    const h = getMobileCardEffectiveHoursForPrice(r);
    if (!(h > 0) || !Number.isFinite(h)) return;
    const { category, productivity } = resolveRowCategoryProductivityForAudit(r);
    const rowCat = String(category || "").trim().toLowerCase();
    const pv = (
      String(productivity || "")
        .trim()
        .toLowerCase() ||
      String(getProductivityFromCategory(rowCat) || "")
        .trim()
        .toLowerCase()
    ).trim();
    if (pv !== "productive" || rowCat !== cat) return;
    const name = String(r.taskName || "").trim();
    if (!name) return;
    const mins = Math.round(h * 60);
    map.set(name, (map.get(name) || 0) + mins);
  });
  const arr = [...map.entries()].map(([taskName, minutes]) => ({ taskName, minutes }));
  arr.sort((a, b) => {
    if (b.minutes !== a.minutes) return b.minutes - a.minutes;
    return String(a.taskName).localeCompare(String(b.taskName), "ko");
  });
  return arr.slice(0, cap);
}

/** 투자 레포트: 해당 일 · 생산 카테고리별 과제 시간 */
export function getDailyProductiveCategoryTaskBreakdown(ymdTen, categoryKey, limit = 200) {
  const key = String(ymdTen || "")
    .replace(/\//g, "-")
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return [];
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d === key;
  });
  return aggregateProductiveTasksByCategoryFromRows(rows, categoryKey, limit);
}

/** 투자 레포트: 해당 월 · 생산 카테고리별 과제 시간 */
export function getMonthlyProductiveCategoryTaskBreakdown(ymdTen, categoryKey, limit = 200) {
  const range = getTimeReportMonthInclusiveRange(ymdTen);
  if (!range) return [];
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d >= range.start && d <= range.end;
  });
  return aggregateProductiveTasksByCategoryFromRows(rows, categoryKey, limit);
}

/** 투자 레포트: 「건강한 섭취」 과제 mealDetail 목록(중복 제거) */
function aggregateHealthyMealDetailsFromRows(rows) {
  const healthyMealDetails = [];
  rows.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0 || !Number.isFinite(hrs)) return;
    const { category: catRaw } = resolveRowCategoryProductivityForAudit(r);
    const cat = String(catRaw || "").trim();
    if (cat !== "health") return;
    const tn = String(r.taskName || "").trim();
    if (!TTC.isHealthyMealDetailTaskName(tn)) return;
    const md = String(r.mealDetail || "").trim();
    if (md) healthyMealDetails.push(md);
  });
  return [...new Set(healthyMealDetails)];
}

/** 투자 레포트(일별): 건강 카드 식단 목록 */
export function getDailyHealthyMealDetails(ymdTen) {
  const key = String(ymdTen || "")
    .replace(/\//g, "-")
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return [];
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d === key;
  });
  return aggregateHealthyMealDetailsFromRows(rows);
}

/** 투자 레포트(월별): 건강 카드 식단 목록 */
export function getMonthlyHealthyMealDetails(ymdTen) {
  const range = getTimeReportMonthInclusiveRange(ymdTen);
  if (!range) return [];
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d >= range.start && d <= range.end;
  });
  return aggregateHealthyMealDetailsFromRows(rows);
}

/** 소비 레포트: 「건강하지 않은 섭취」 과제 기록 시간(분) */
function aggregateUnhealthyMealIntakeMinutesFromRows(rows) {
  let minutes = 0;
  rows.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0 || !Number.isFinite(hrs)) return;
    const { category: catRaw } = resolveRowCategoryProductivityForAudit(r);
    if (String(catRaw || "").trim() !== "unhealthy") return;
    const tn = String(r.taskName || "").trim();
    if (!TTC.isUnhealthyMealDetailTaskName(tn)) return;
    minutes += Math.round(hrs * 60);
  });
  return minutes;
}

/** 투자 레포트: 「건강한 섭취」 과제 기록 시간(분) */
function aggregateHealthyMealIntakeMinutesFromRows(rows) {
  let minutes = 0;
  rows.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked);
    if (hrs <= 0 || !Number.isFinite(hrs)) return;
    const { category: catRaw, productivity: prodRaw } =
      resolveRowCategoryProductivityForAudit(r);
    const cat = String(catRaw || "").trim();
    if (cat !== "health") return;
    const pv = (
      String(prodRaw || "")
        .trim()
        .toLowerCase() ||
      String(getProductivityFromCategory(cat) || "")
        .trim()
        .toLowerCase()
    ).trim();
    if (pv !== "productive") return;
    const tn = String(r.taskName || "").trim();
    if (!TTC.isHealthyMealDetailTaskName(tn)) return;
    minutes += Math.round(hrs * 60);
  });
  return minutes;
}

export function getDailyUnhealthyMealIntakeMinutes(ymdTen) {
  const key = String(ymdTen || "")
    .replace(/\//g, "-")
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return 0;
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d === key;
  });
  return aggregateUnhealthyMealIntakeMinutesFromRows(rows);
}

export function getMonthlyUnhealthyMealIntakeMinutes(ymdTen) {
  const range = getTimeReportMonthInclusiveRange(ymdTen);
  if (!range) return 0;
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d >= range.start && d <= range.end;
  });
  return aggregateUnhealthyMealIntakeMinutesFromRows(rows);
}

export function getDailyHealthyMealIntakeMinutes(ymdTen) {
  const key = String(ymdTen || "")
    .replace(/\//g, "-")
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return 0;
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d === key;
  });
  return aggregateHealthyMealIntakeMinutesFromRows(rows);
}

export function getMonthlyHealthyMealIntakeMinutes(ymdTen) {
  const range = getTimeReportMonthInclusiveRange(ymdTen);
  if (!range) return 0;
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d >= range.start && d <= range.end;
  });
  return aggregateHealthyMealIntakeMinutesFromRows(rows);
}

const CONSUMPTION_REPORT_CATEGORY_KEYS = [
  "media_watch",
  "pleasure",
  "unhealthy",
  "moneylosing",
  "unhappiness",
];

/**
 * 소비 레포트: 카테고리별 과제명·기록 시간(요약 그리드와 동일 — parseTimeToHours)
 * @param {object[]} rows
 * @param {string} categoryKey
 * @param {number} [limit]
 * @returns {{ taskName: string, minutes: number }[]}
 */
function aggregateConsumptionCategoryTasksFromRows(rows, categoryKey, limit = 200) {
  const cat = String(categoryKey || "").trim();
  if (!CONSUMPTION_REPORT_CATEGORY_KEYS.includes(cat)) return [];
  const cap = Math.max(1, Math.min(200, Number(limit) || 200));
  /** @type {Map<string, number>} */
  const map = new Map();
  rows.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked);
    if (!(hrs > 0) || !Number.isFinite(hrs)) return;
    const { category: catRaw } = resolveRowCategoryProductivityForAudit(r);
    const rowCat = String(catRaw || "").trim();
    if (rowCat !== cat) return;
    const name = String(r.taskName || "").trim();
    if (!name) return;
    const mins = Math.round(hrs * 60);
    map.set(name, (map.get(name) || 0) + mins);
  });
  const arr = [...map.entries()].map(([taskName, minutes]) => ({ taskName, minutes }));
  arr.sort((a, b) => {
    if (b.minutes !== a.minutes) return b.minutes - a.minutes;
    return String(a.taskName).localeCompare(String(b.taskName), "ko");
  });
  return arr.slice(0, cap);
}

/** 소비 레포트: 해당 일 · 카테고리별 과제 시간 */
export function getDailyConsumptionCategoryTaskBreakdown(ymdTen, categoryKey, limit = 200) {
  const key = String(ymdTen || "")
    .replace(/\//g, "-")
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return [];
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d === key;
  });
  return aggregateConsumptionCategoryTasksFromRows(rows, categoryKey, limit);
}

/** 소비 레포트: 해당 월 · 카테고리별 과제 시간 */
export function getMonthlyConsumptionCategoryTaskBreakdown(ymdTen, categoryKey, limit = 200) {
  const range = getTimeReportMonthInclusiveRange(ymdTen);
  if (!range) return [];
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d >= range.start && d <= range.end;
  });
  return aggregateConsumptionCategoryTasksFromRows(rows, categoryKey, limit);
}

/** 비생산(nonproductive)으로 기록된 사용시간(분 단위 합) — 카테고리 도넛·요약과 동일 산술 규칙 */
function aggregateNonproductiveMinutesFromLedgerRows(rows) {
  let total = 0;
  rows.forEach((r) => {
    const hrs = parseTimeToHours(r.timeTracked);
    if (!(hrs > 0) || !Number.isFinite(hrs)) return;
    const { category, productivity } = resolveRowCategoryProductivityForAudit(r);
    const cat = String(category || "").trim().toLowerCase();
    const pv = (
      String(productivity || "")
        .trim()
        .toLowerCase() ||
      String(getProductivityFromCategory(cat) || "")
        .trim()
        .toLowerCase()
    ).trim();
    if (pv !== "nonproductive") return;
    total += Math.round(hrs * 60);
  });
  return total;
}

function aggregateNonproductiveWasteSnapshotFromRows(rows) {
  const wastedMinutesRounded = aggregateNonproductiveMinutesFromLedgerRows(rows);
  const hourlyRate = readUserHourlyRateNumber();
  const wastedWon =
    hourlyRate > 0 && wastedMinutesRounded > 0
      ? Math.round((wastedMinutesRounded / 60) * hourlyRate)
      : 0;
  return { wastedMinutesRounded, wastedWon, hourlyRate };
}

/** 일별: 비생산적 활동 시간(분 합 → 표시 시 formatIntegerMinutesDurationKo 등) */
export function getDailyNonproductiveWastedMinutesRounded(ymdTen) {
  return getDailyNonproductiveWastedSnapshot(ymdTen).wastedMinutesRounded;
}

/** 일별: 비생산적 활동 시간·낭비 금액(시급×시간) */
export function getDailyNonproductiveWastedSnapshot(ymdTen) {
  const key = String(ymdTen || "")
    .replace(/\//g, "-")
    .slice(0, 10);
  const empty = () => ({
    wastedMinutesRounded: 0,
    wastedWon: 0,
    hourlyRate: readUserHourlyRateNumber(),
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return empty();
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d === key;
  });
  return aggregateNonproductiveWasteSnapshotFromRows(rows);
}

/** 월별: 비생산적 활동 시간 합산 */
export function getMonthlyNonproductiveWastedMinutesRounded(ymdTen) {
  return getMonthlyNonproductiveWastedSnapshot(ymdTen).wastedMinutesRounded;
}

/** 월별: 비생산적 활동 시간·낭비 금액(시급×시간) */
export function getMonthlyNonproductiveWastedSnapshot(ymdTen) {
  const empty = () => ({
    wastedMinutesRounded: 0,
    wastedWon: 0,
    hourlyRate: readUserHourlyRateNumber(),
  });
  const range = getTimeReportMonthInclusiveRange(ymdTen);
  if (!range) return empty();
  const rows = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return d >= range.start && d <= range.end;
  });
  return aggregateNonproductiveWasteSnapshotFromRows(rows);
}

/** YYYY-MM-DD → "2026. 05. 18(화)" — 레포트 날짜 줄 */
export function formatYmdDotsWithWeekdayKo(ymdTen) {
  const dStr = String(ymdTen || "")
    .replace(/\//g, "-")
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return "";
  const [y, mo, d] = dStr.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const yy = String(y);
  const mm = String(mo).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${yy}. ${mm}. ${dd}(${weekdays[dt.getDay()]})`;
}

/** 비생산 손실(원): 양수 크기를 넣으면 「-₩n」 표기 */
export function formatLedgerLossKrwDisplay(wonPositiveMagnitude) {
  const w = Math.abs(Math.round(Number(wonPositiveMagnitude) || 0));
  const parts = getHomeMenuLedgerKrwParts(-w);
  return `-₩${parts.digits}`;
}

/** 홈 메뉴 금액: 부호·₩·숫자를 나눠 간격·접근성 라벨 제공 */
export function getHomeMenuLedgerKrwParts(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(Math.round(v));
  const digits = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (v === 0) {
    return { sign: null, digits, ariaLabel: `${digits}원` };
  }
  if (v < 0) {
    return { sign: "-", digits, ariaLabel: `마이너스 ${digits}원` };
  }
  return { sign: "+", digits, ariaLabel: `플러스 ${digits}원` };
}

/** 카테고리 라벨 조회 */
function getCategoryLabel(value) {
  if (value === "productive_consumption")
    return "부수입"; /* 구 카테고리 → 부수입으로 표시 */
  const opt = CATEGORY_OPTIONS.find((o) => o.value === value);
  return opt ? opt.label : value || "그 외";
}

function getCategoryColor(value) {
  if (value === "productive_consumption") return "cat-sideincome";
  const opt = CATEGORY_OPTIONS.find((o) => o.value === value);
  return opt ? opt.color : "cat-empty";
}

/** 하루 평균 가용시간 계산 (24 - 근무 - 수면) */
function calcAvgAvailableHours(rows, period = "이번달") {
  const filtered = filterRowsByPeriod(rows, period);
  return calcAvgAvailableHoursFromFiltered(filtered);
}

function calcAvgAvailableHoursFromFiltered(filtered) {
  const byDate = {};
  filtered.forEach((r) => {
    if (r.category !== "work" && r.category !== "sleep") return;
    const d = r.date.trim();
    if (!byDate[d]) byDate[d] = { work: 0, sleep: 0 };
    const hrs = parseTimeToHours(r.timeTracked);
    if (r.category === "work") byDate[d].work += hrs;
    else byDate[d].sleep += hrs;
  });
  const dates = Object.keys(byDate);
  if (dates.length === 0) return null;
  let totalAvailable = 0;
  dates.forEach((d) => {
    const used = byDate[d].work + byDate[d].sleep;
    const available = Math.max(0, 24 - used);
    totalAvailable += available;
  });
  return totalAvailable / dates.length;
}

function formatPrice(n) {
  if (n === 0) return "0";
  const abs = Math.abs(Math.round(n));
  const str = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n < 0 ? `-${str}` : str;
}

/** 타임 카드·표 「행동의 가치」: 생산적 +n 원 / 비생산적 -n 원 */
function formatTimeLedgerActionPriceDisplay(value, productivitySlot) {
  if (productivitySlot === "other") return "";
  const abs = Math.abs(Math.round(Number(value) || 0));
  const str = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (productivitySlot === "productive") return `+${str} 원`;
  if (productivitySlot === "nonproductive") return `-${str} 원`;
  return "";
}

function parsePriceFromDisplay(text) {
  if (!text || typeof text !== "string") return 0;
  const trimmed = text.trim().replace(/,/g, "");
  if (!trimmed) return 0;
  const num = parseFloat(trimmed);
  return isNaN(num) ? 0 : num;
}

function createDateCell(initialValue) {
  const wrap = document.createElement("div");
  lpSetClasses(wrap, "time-date-cell");
  const display = document.createElement("span");
  lpSetClasses(display, "time-date-display");
  const input = document.createElement("input");
  input.type = "date";
  lpSetClasses(input, "time-input-date-hidden");
  input.name = "time-date";
  function refresh() {
    if (input.value) {
      display.textContent = formatDateDisplay(input.value);
      lpTokenAdd(display, "has-value");
    } else {
      display.textContent = "";
      lpTokenRemove(display, "has-value");
    }
  }
  input.addEventListener("change", refresh);
  wrap.appendChild(display);
  wrap.appendChild(input);
  wrap.addEventListener("click", () => {
    input.focus();
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  });
  if (initialValue) {
    input.value = initialValue;
    refresh();
  }
  return { wrap, input, refresh };
}

/**
 * @param {AbortSignal} [tabSignal] 탭 이탈 시 document 리스너 정리용
 * @param {boolean} [enablePanelFilter] true면 열린 패널 맨 위 입력칸으로 목록만 필터 (표·트리거 스타일 변경 없음)
 */
function createTagDropdown(
  options,
  initialValue,
  optionClass,
  onSelect,
  tabSignal,
  enablePanelFilter = false,
) {
  const wrap = document.createElement("div");
  lpSetClasses(wrap, "time-tag-dropdown-wrap");
  let value =
    initialValue !== undefined && initialValue !== null
      ? String(initialValue)
      : options[0]?.value !== undefined && options[0]?.value !== null
        ? String(options[0].value)
        : "";

  const trigger = document.createElement("button");
  trigger.type = "button";
  lpSetClasses(trigger, "time-tag-trigger");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  function updateTrigger() {
    const opt = options.find((o) => o.value === value);
    const label = opt ? opt.label : value || "—";
    const colorClass = opt ? opt.color : "";
    trigger.innerHTML = `<span data-legacy="time-tag-pill ${optionClass} ${colorClass}">${escapeHtml(label)}</span>`;
    trigger.setAttribute("aria-label", `선택: ${label}. 클릭 시 메뉴 열기`);
  }
  updateTrigger();

  const panel = document.createElement("div");
  lpSetClasses(
    panel,
    "time-tag-panel" +
      (enablePanelFilter ? " time-tag-panel--with-filter" : ""),
  );
  panel.hidden = true;

  /** @type {HTMLInputElement | null} */
  let filterInput = null;
  let listRoot = panel;

  if (enablePanelFilter) {
    filterInput = document.createElement("input");
    filterInput.type = "text";
    lpSetClasses(filterInput, "time-tag-panel-filter");
    filterInput.setAttribute("aria-label", "과제 검색");
    filterInput.placeholder = "과제 검색…";
    filterInput.autocomplete = "off";
    listRoot = document.createElement("div");
    lpSetClasses(listRoot, "time-tag-panel-list");
    panel.appendChild(filterInput);
    panel.appendChild(listRoot);

    function applyFilter() {
      const q = (filterInput.value || "").trim().toLowerCase();
      listRoot
        .querySelectorAll('[data-legacy~="time-tag-option"]')
        .forEach((el) => {
          const label = (el.dataset.filterLabel || "").toLowerCase();
          const show = !q || label.includes(q);
          el.hidden = !show;
        });
    }
    filterInput.addEventListener("input", applyFilter);
    filterInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closePanel();
        trigger.focus();
      }
    });
  }

  function appendOption(o) {
    const opt = document.createElement("div");
    lpSetClasses(
      opt,
      "time-tag-option" +
        (String(o.value ?? "") === String(value ?? "") ? " is-selected" : ""),
    );
    opt.innerHTML = `<span data-legacy="time-tag-pill ${o.color || ""}">${escapeHtml(o.label)}</span>`;
    opt.setAttribute(
      "data-option-value",
      o.value === undefined || o.value === null ? "" : String(o.value),
    );
    if (enablePanelFilter) {
      opt.dataset.filterLabel = String(o.label ?? o.value ?? "");
    }
    opt.addEventListener("click", () => {
      value = o.value === undefined || o.value === null ? "" : String(o.value);
      updateTrigger();
      closePanel();
      onSelect?.(value);
    });
    listRoot.appendChild(opt);
  }
  if (enablePanelFilter) {
    const hadEmpty = options.some((o) => o.value === "");
    options.filter((o) => o.value !== "").forEach(appendOption);
    if (hadEmpty) {
      appendOption({
        value: "",
        label: "선택 안 함",
        color: "cat-empty",
      });
    }
  } else {
    options.forEach(appendOption);
  }

  function resetPanelFilter() {
    if (!enablePanelFilter || !filterInput) return;
    filterInput.value = "";
    listRoot
      .querySelectorAll('[data-legacy~="time-tag-option"]')
      .forEach((el) => {
        el.hidden = false;
      });
  }

  /** body 고정 패널을 트리거 위치에 맞춤 (스크롤·리사이즈 후에도 깨짐 방지) */
  let panelScrollSyncAc = null;
  function syncPanelToTrigger() {
    if (panel.hidden) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 4;
    panel.style.position = "fixed";
    panel.style.top = `${rect.bottom + margin}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 140)}px`;
    panel.style.zIndex = "999999";
    const vw = window.innerWidth;
    const estW = Math.max(panel.offsetWidth, Math.max(rect.width, 140));
    let left = rect.left;
    if (left + estW > vw - 8) left = Math.max(8, vw - estW - 8);
    panel.style.left = `${left}px`;
  }

  function closePanel() {
    panelScrollSyncAc?.abort();
    panelScrollSyncAc = null;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (panel.parentElement === document.body) {
      document.body.removeChild(panel);
      wrap.appendChild(panel);
    }
    resetPanelFilter();
  }

  function openPanel() {
    trigger.setAttribute("aria-expanded", "true");
    panelScrollSyncAc?.abort();
    panelScrollSyncAc = new AbortController();
    const { signal } = panelScrollSyncAc;
    const reposition = () => {
      syncPanelToTrigger();
    };
    /* 캘린더 1일뷰 등: 부모 overflow 스크롤 시에도 트리거와 맞춤 */
    document.addEventListener("scroll", reposition, { capture: true, signal });
    window.addEventListener("resize", reposition, { signal });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", reposition, { signal });
      window.visualViewport.addEventListener("scroll", reposition, { signal });
    }
    if (panel.parentElement !== document.body) {
      wrap.removeChild(panel);
      document.body.appendChild(panel);
    }
    panel.hidden = false;
    syncPanelToTrigger();
    requestAnimationFrame(() => syncPanelToTrigger());
    resetPanelFilter();
    if (enablePanelFilter && filterInput) {
      requestAnimationFrame(() => filterInput.focus());
    }
  }

  trigger.addEventListener("click", () => {
    if (panel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  });
  if (tabSignal) {
    tabSignal.addEventListener(
      "abort",
      () => {
        closePanel();
      },
      { once: true },
    );
    document.addEventListener(
      "keydown",
      (e) => {
        if (panel.hidden) return;
        if (e.key === "Escape") {
          closePanel();
          trigger.focus();
        }
      },
      { signal: tabSignal },
    );
    document.addEventListener(
      "click",
      (e) => {
        if (!wrap.contains(e.target) && !panel.contains(e.target)) {
          closePanel();
        }
      },
      { signal: tabSignal },
    );
  } else {
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target) && !panel.contains(e.target)) {
        closePanel();
      }
    });
  }

  wrap.appendChild(trigger);
  wrap.appendChild(panel);
  wrap._getValue = () => value;
  wrap._setValue = (v) => {
    value = v !== undefined && v !== null ? String(v) : "";
    updateTrigger();
    panel
      .querySelectorAll('[data-legacy~="time-tag-option"]')
      .forEach((optEl) => {
        const ov = optEl.getAttribute("data-option-value");
        lpTokenToggle(optEl, "is-selected", ov === value);
      });
  };
  return { wrap, getValue: () => value };
}

const DELETE_ICON =
  '<svg data-legacy="time-task-delete-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

/** 과제명 입력: 포커스 시 목록 표시, 목록에 없으면 Create 옵션 @param {AbortSignal} [tabSignal] */
function createTaskNameInput(initialValue, onTaskSelect, tabSignal) {
  const wrap = document.createElement("div");
  lpSetClasses(wrap, "time-task-name-wrap");
  const inputWrap = document.createElement("div");
  lpSetClasses(inputWrap, "time-task-input-wrap");
  const input = document.createElement("input");
  input.type = "text";
  input.name = "time-task-name";
  lpSetClasses(input, "time-input-task");
  input.placeholder = "Search";
  if (initialValue) input.value = initialValue;

  inputWrap.appendChild(input);

  const panel = document.createElement("div");
  lpSetClasses(panel, "time-task-name-panel");
  panel.hidden = true;

  let highlightedIndex = -1;

  function renderPanel(query) {
    const q = (query || "").trim().toLowerCase();
    const all = getTaskOptions();
    const getName = (o) => (typeof o === "string" ? o : o.name);
    let matches = q
      ? all.filter((o) => getName(o).toLowerCase().includes(q))
      : all;
    matches = [...matches].sort((a, b) =>
      getName(a).localeCompare(getName(b), "ko"),
    );
    const exactMatch = q && matches.some((o) => getName(o).toLowerCase() === q);
    const showCreate = q && !exactMatch;

    panel.innerHTML = "";
    highlightedIndex = -1;

    if (matches.length === 0 && !showCreate) {
      panel.hidden = true;
      return;
    }

    const sep = document.createElement("div");
    lpSetClasses(sep, "time-task-name-separator");
    sep.textContent = "—";
    panel.appendChild(sep);

    const lockedNames = getLockedTaskNames();
    matches.forEach((opt) => {
      const name = getName(opt);
      const isLocked = lockedNames.has(name);
      const row = document.createElement("div");
      lpSetClasses(row, "time-task-name-option");
      row.innerHTML = `<span data-legacy="time-task-tag">${escapeHtml(name)}</span>${isLocked ? "" : `<button type="button" data-legacy="time-task-delete-btn" title="삭제">${DELETE_ICON}</button>`}`;
      row.dataset.value = name;
      const delBtn = row.querySelector('[data-legacy~="time-task-delete-btn"]');
      row.addEventListener("click", (e) => {
        if (e.target.closest('[data-legacy~="time-task-delete-btn"]')) return;
        input.value = name;
        panel.hidden = true;
        input.blur();
        onTaskSelect?.(name);
      });
      if (delBtn) {
        delBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (getLockedTaskNames().has(name)) {
            alert(MSG_TIME_TASK_KPI_LINKED);
            return;
          }
          if (!(await removeTaskOption(name))) {
            alert(MSG_TIME_TASK_KPI_LINKED);
            return;
          }
          renderPanel(input.value);
        });
      }
      panel.appendChild(row);
    });

    if (showCreate) {
      const createRow = document.createElement("div");
      lpSetClasses(createRow, "time-task-name-option time-task-name-create");
      createRow.innerHTML = `<span data-legacy="time-task-create-label">Create</span><span data-legacy="time-task-tag">${escapeHtml((query || "").trim())}</span>`;
      createRow.dataset.value = (query || "").trim();
      createRow.dataset.isCreate = "true";
      createRow.addEventListener("click", () => {
        const val = (query || "").trim();
        addTaskOption(val);
        input.value = val;
        panel.hidden = true;
        input.blur();
        onTaskSelect?.(val);
      });
      panel.appendChild(createRow);
    }

    highlightedIndex = 0;
    const opts = panel.querySelectorAll(
      '[data-legacy~="time-task-name-option"]',
    );
    if (opts[0]) lpTokenAdd(opts[0], "is-highlighted");
    panel.hidden = false;
  }

  function closePanel() {
    panel.hidden = true;
    highlightedIndex = -1;
  }

  input.addEventListener("focus", () => renderPanel(input.value));

  input.addEventListener("input", () => renderPanel(input.value));

  input.addEventListener("blur", () => {
    setTimeout(closePanel, 150);
  });

  input.addEventListener("keydown", (e) => {
    if (panel.hidden) {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
      return;
    }
    const opts = panel.querySelectorAll(
      '[data-legacy~="time-task-name-option"]',
    );
    if (opts.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, opts.length - 1);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) =>
        lpTokenToggle(o, "is-highlighted", i === highlightedIndex),
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) =>
        lpTokenToggle(o, "is-highlighted", i === highlightedIndex),
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const sel = opts[highlightedIndex >= 0 ? highlightedIndex : 0];
      if (sel) {
        const val = sel.dataset.value;
        if (sel.dataset.isCreate === "true") addTaskOption(val);
        input.value = val;
        closePanel();
        input.blur();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closePanel();
    }
  });

  const docClickClose = (e) => {
    if (!wrap.contains(e.target)) closePanel();
  };
  if (tabSignal) {
    document.addEventListener("click", docClickClose, { signal: tabSignal });
  } else {
    document.addEventListener("click", docClickClose);
  }

  wrap.appendChild(inputWrap);
  wrap.appendChild(panel);
  return { wrap, input, getValue: () => input.value };
}

function createRow(initialData, onUpdate, viewEl, onRowDelete, onRowEdit) {
  const tr = document.createElement("tr");
  lpSetClasses(tr, "time-row");
  const taskName = initialData?.taskName || "";
  const opt = taskName ? getTaskOptionByName(taskName) : null;
  const idIn = String(initialData?.id || "").trim();
  const rowId = isUuid(idIn)
    ? idIn
    : typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const tid = String((initialData?.taskId || opt?.id || "").trim());
  const rowData = {
    id: rowId,
    taskName,
    taskId: isUuid(tid) ? tid : "",
    startTime: (initialData?.startTime || "").trim(),
    endTime: (initialData?.endTime || "").trim(),
    timeTracked: initialData?.timeTracked || "",
    productivity:
      initialData?.productivity ??
      (initialData?.category
        ? getProductivityFromCategory(initialData.category)
        : taskName
          ? opt?.productivity
          : ""),
    category: initialData?.category ?? (taskName ? opt?.category : ""),
    date: initialData?.date || "",
    feedback: initialData?.feedback || "",
    mealDetail: String(initialData?.mealDetail || "").trim(),
    memoTags: Array.isArray(initialData?.memoTags) ? initialData.memoTags : [],
    linkedExpenseIds: [],
    focus: String(initialData?.focus || "").trim(),
    habitDailyCompleted: Array.isArray(initialData?.habitDailyCompleted)
      ? initialData.habitDailyCompleted
      : [],
  };
  tr._rowData = rowData;

  const prodTd = document.createElement("td");
  lpSetClasses(prodTd, "time-cell time-cell-productivity");
  const priceTd = document.createElement("td");
  lpSetClasses(priceTd, "time-cell time-cell-price");
  const priceDisplay = document.createElement("span");
  lpSetClasses(priceDisplay, "time-price-display");
  const prodDisplay = document.createElement("span");
  lpSetClasses(prodDisplay, "time-tag-pill prod");
  const prodOpt = PRODUCTIVITY_OPTIONS.find(
    (o) => o.value === rowData.productivity,
  );
  prodDisplay.textContent = prodOpt ? prodOpt.label : "";
  lpSetClasses(
    prodDisplay,
    "time-tag-pill prod " + (prodOpt ? prodOpt.color : ""),
  );
  prodTd.appendChild(prodDisplay);

  const startTimeTd = document.createElement("td");
  lpSetClasses(startTimeTd, "time-cell time-cell-start");
  const startTimeSpan = document.createElement("span");
  lpSetClasses(startTimeSpan, "time-display-start");
  startTimeSpan.textContent = rowData.startTime
    ? toDisplayTimeOnly(rowData.startTime) || rowData.startTime
    : "";
  startTimeTd.appendChild(startTimeSpan);

  const endTimeTd = document.createElement("td");
  lpSetClasses(endTimeTd, "time-cell time-cell-end");
  const endTimeSpan = document.createElement("span");
  lpSetClasses(endTimeSpan, "time-display-end");
  endTimeSpan.textContent = formatTimeLedgerEndCellDisplay(
    rowData.startTime,
    rowData.endTime,
  );
  endTimeTd.appendChild(endTimeSpan);

  const timeTd = document.createElement("td");
  lpSetClasses(timeTd, "time-cell time-cell-tracked");
  const timeSpan = document.createElement("span");
  lpSetClasses(timeSpan, "time-display-tracked");
  timeTd.appendChild(timeSpan);

  function updatePrice() {
    const data = tr._rowData || rowData;
    const hourlyInput = viewEl?.querySelector(
      '[data-legacy~="time-hourly-input"]',
    );
    const hourlyRate =
      parseFloat(String(hourlyInput?.value || "0").replace(/,/g, "")) || 0;
    const hours = getMobileCardEffectiveHoursForPrice(data);
    const pv = getMobileCardProductivityValue(data);
    let price = hours * hourlyRate;
    if (pv === "nonproductive") price *= -1;
    else if (pv === "other" || pv === "그 외" || !pv) price = 0;
    const slot = getMobileCardPriceProductivitySlot(data);
    priceDisplay.textContent = formatTimeLedgerActionPriceDisplay(price, slot);
    lpTokenToggle(priceDisplay, "is-negative", price < 0);
    lpTokenToggle(priceDisplay, "is-positive", price > 0);

    const tracked = (data.timeTracked || "").trim();
    const hasStart = !!(data.startTime && String(data.startTime).trim());
    if (tracked) timeSpan.textContent = tracked;
    else if (!hasStart) timeSpan.textContent = "";
    else timeSpan.textContent = formatHoursToHHMM(hours);

    /* 마감 없음·시작 있음 → 「진행중」(모바일 카드 시간 줄과 동일 의미) */
    endTimeSpan.textContent = formatTimeLedgerEndCellDisplay(
      data.startTime,
      data.endTime,
    );

    viewEl?._updateTotal?.();
  }

  const catTd = document.createElement("td");
  lpSetClasses(catTd, "time-cell time-cell-category");
  const catDisplay = document.createElement("span");
  lpSetClasses(catDisplay, "time-tag-pill cat cat-empty");
  catDisplay.textContent = getCategoryLabel(rowData.category) || "—";
  lpSetClasses(
    catDisplay,
    "time-tag-pill cat " + getCategoryColor(rowData.category),
  );
  catTd.appendChild(catDisplay);

  const taskTd = document.createElement("td");
  lpSetClasses(taskTd, "time-cell time-cell-task");
  const taskInner = document.createElement("div");
  lpSetClasses(taskInner, "time-cell-task-inner");
  const prodBar = document.createElement("span");
  lpSetClasses(prodBar, "time-task-prod-bar");
  const prodBarMod =
    rowData.productivity === "productive"
      ? "time-task-prod-bar--productive"
      : rowData.productivity === "nonproductive"
        ? "time-task-prod-bar--nonproductive"
        : "time-task-prod-bar--other";
  lpTokenAdd(prodBar, prodBarMod);
  const taskSpan = document.createElement("span");
  lpSetClasses(taskSpan, "time-display-task");
  taskSpan.textContent = rowData.taskName || "";
  taskInner.appendChild(prodBar);
  taskInner.appendChild(taskSpan);
  taskTd.appendChild(taskInner);

  tr.appendChild(taskTd);
  tr.appendChild(startTimeTd);
  tr.appendChild(endTimeTd);
  tr.appendChild(timeTd);
  tr.appendChild(catTd);
  tr.appendChild(prodTd);

  const dateTd = document.createElement("td");
  lpSetClasses(dateTd, "time-cell time-cell-date");
  const dateSpan = document.createElement("span");
  lpSetClasses(dateSpan, "time-display-date");
  dateSpan.textContent = rowData.date ? formatDateDisplay(rowData.date) : "";
  dateTd.appendChild(dateSpan);
  tr.appendChild(dateTd);

  priceTd.appendChild(priceDisplay);
  tr.appendChild(priceTd);

  const feedbackTd = document.createElement("td");
  lpSetClasses(feedbackTd, "time-cell time-cell-feedback");
  const feedbackSpan = document.createElement("span");
  lpSetClasses(feedbackSpan, "time-display-feedback");
  feedbackSpan.textContent = rowData.feedback || "";
  feedbackTd.appendChild(feedbackSpan);
  tr.appendChild(feedbackTd);

  const memoTagTd = document.createElement("td");
  lpSetClasses(memoTagTd, "time-cell time-cell-memo-tag");
  const memoTagDisplayTexts = getMemoTagDisplayTextsForLedgerRow(rowData);
  const memoTagWrap = document.createElement("span");
  lpSetClasses(memoTagWrap, "time-display-memo-tags");
  memoTagDisplayTexts.forEach((tag) => {
    const pill = document.createElement("span");
    lpSetClasses(pill, "time-memo-tag-pill");
    pill.textContent = tag;
    memoTagWrap.appendChild(pill);
  });
  memoTagTd.appendChild(memoTagWrap);
  tr.appendChild(memoTagTd);

  tr._onRowDelete = onRowDelete;
  tr._updatePrice = updatePrice;
  updatePrice();

  if (onRowEdit) {
    lpTokenAdd(tr, "time-row-clickable");
    tr.title = "클릭하여 수정";
    tr.addEventListener("click", (e) => {
      onRowEdit(tr, collectRowFromTR(tr));
    });
  }

  return tr;
}

export function parseTagsFromFeedback(feedbackStr) {
  if (!feedbackStr || typeof feedbackStr !== "string") return [];
  const matches = feedbackStr.match(/#([^\s#]+)/g) || [];
  return [...new Set(matches.map((m) => m.slice(1).trim()).filter(Boolean))];
}

/** 구 memo_tags 안의 가계부 연동 접두사 — 화면·저장 시 제외 */
const LP_LEDGER_EXPENSE_TAG_PREFIX = "lp-expense:";

function userMemoTagsFromLedgerRaw(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const t of arr) {
    const s = String(t ?? "").trim();
    if (!s || s.startsWith(LP_LEDGER_EXPENSE_TAG_PREFIX)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** 사용자 메모 태그만 memo_tags에 넣음 */
function buildLedgerMemoTagsForSubmit(userTags) {
  const base = [...(Array.isArray(userTags) ? userTags : [])];
  const seen = new Set();
  const out = [];
  for (const x of base) {
    const k = String(x).trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/** 테이블 메모 태그 열: 사용자 태그만 */
function getMemoTagDisplayTextsForLedgerRow(rowData) {
  const raw =
    rowData?.memoTags?.length > 0
      ? rowData.memoTags
      : parseTagsFromFeedback(rowData?.feedback || "");
  const userTags = userMemoTagsFromLedgerRaw(Array.isArray(raw) ? raw : []);
  const texts = [];
  const LP_MEAL_LEGACY_PREFIX = "lp-meal:";
  for (const t of userTags) {
    const s = String(t ?? "").trim();
    if (!s) continue;
    if (s.startsWith(LP_MEAL_LEGACY_PREFIX)) {
      const inner = s.slice(LP_MEAL_LEGACY_PREFIX.length).trim();
      texts.push(inner || s);
      continue;
    }
    texts.push(s);
  }
  return texts;
}

/** contenteditable 메모 영역 직렬화: 텍스트 + #태그명 → 한 줄 문자열 */
function serializeMemoContent(containerEl) {
  if (!containerEl) return "";
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || "").trim();
      if (t) parts.push(t);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (lpTokenHas(node, "time-memo-tag-chip")) {
        const tag = (node.getAttribute("data-tag") || "").trim();
        if (tag) parts.push("#" + tag);
        return;
      }
      node.childNodes.forEach(walk);
    }
  };
  containerEl.childNodes.forEach(walk);
  return parts.join(" ");
}

/** 메모 문자열을 contenteditable에 반영 (텍스트 + 태그 칩) */
function setMemoContent(containerEl, feedbackStr) {
  if (!containerEl) return;
  const str = (feedbackStr || "").trim();
  containerEl.innerHTML = "";
  if (!str) {
    lpTokenAdd(containerEl, "is-empty");
    return;
  }
  lpTokenRemove(containerEl, "is-empty");
  const tokens = str.split(/(#[^\s#]+)/g).filter(Boolean);
  tokens.forEach((tok) => {
    if (tok.startsWith("#") && tok.length > 1) {
      const tagName = tok.slice(1).trim();
      if (!tagName) return;
      const chip = document.createElement("span");
      lpSetClasses(chip, "time-memo-tag-chip");
      chip.contentEditable = "false";
      chip.setAttribute("data-tag", tagName);
      chip.innerHTML = `<span data-legacy="time-memo-tag-chip-text">${escapeHtml(tagName)}</span><button type="button" data-legacy="time-memo-tag-chip-remove" aria-label="태그 삭제">&times;</button>`;
      chip
        .querySelector('[data-legacy~="time-memo-tag-chip-remove"]')
        ?.addEventListener("click", (e) => {
          e.preventDefault();
          chip.remove();
        });
      containerEl.appendChild(chip);
    } else {
      const text = document.createTextNode(tok);
      containerEl.appendChild(text);
    }
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/** contenteditable 메모 필드에 # 태그 입력·삭제 동작 초기화 */
function initMemoFeedbackWithTags(containerEl) {
  if (!containerEl) return;
  let composing = false;
  containerEl.addEventListener("compositionstart", () => {
    composing = true;
  });
  containerEl.addEventListener("compositionend", () => {
    composing = false;
  });

  function getTextBeforeCaret(container, range) {
    const preRange = document.createRange();
    preRange.setStart(container, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    return preRange.toString().replace(/\u200B/g, "");
  }
  function getTextAfterCaret(container, range) {
    const postRange = document.createRange();
    postRange.setStart(range.endContainer, range.endOffset);
    postRange.setEnd(container, getNodeLength(container));
    return postRange.toString();
  }
  function getNodeLength(node) {
    if (node.nodeType === Node.TEXT_NODE)
      return (node.textContent || "").length;
    return node.childNodes.length;
  }
  function tryCommitTag(
    container,
    range,
    replaceLen,
    tagName,
    insertSpaceAfter,
  ) {
    const tagNameTrim = (tagName || "").trim();
    if (!tagNameTrim) return;
    const sel = window.getSelection();
    const startCharOffset = getCharacterOffset(
      container,
      range.startContainer,
      range.startOffset,
    );
    const fromOffset = Math.max(0, startCharOffset - replaceLen);
    const fromPos = getNodeAndOffsetAt(container, fromOffset);
    if (!fromPos) return;
    const delRange = document.createRange();
    delRange.setStart(fromPos.node, fromPos.offset);
    delRange.setEnd(range.startContainer, range.startOffset);
    delRange.deleteContents();
    const chip = document.createElement("span");
    lpSetClasses(chip, "time-memo-tag-chip");
    chip.contentEditable = "false";
    chip.setAttribute("data-tag", tagNameTrim);
    chip.innerHTML = `<span data-legacy="time-memo-tag-chip-text">${escapeHtml(tagNameTrim)}</span><button type="button" data-legacy="time-memo-tag-chip-remove" aria-label="태그 삭제">&times;</button>`;
    chip
      .querySelector('[data-legacy~="time-memo-tag-chip-remove"]')
      ?.addEventListener("click", (ev) => {
        ev.preventDefault();
        chip.remove();
      });
    range.setStart(fromPos.node, fromPos.offset);
    range.collapse(true);
    range.insertNode(chip);
    if (insertSpaceAfter) {
      const space = document.createTextNode("\u00A0");
      chip.after(space);
      range.setStart(space, 1);
      range.setEnd(space, 1);
    } else {
      range.setStartAfter(chip);
      range.setEndAfter(chip);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function getCharacterOffset(container, targetNode, targetOffset) {
    let count = 0;
    const walk = (n) => {
      if (n === targetNode) {
        if (n.nodeType === Node.TEXT_NODE) {
          count += Math.min(targetOffset, (n.textContent || "").length);
          return true;
        }
        if (
          n.nodeType === Node.ELEMENT_NODE &&
          lpTokenHas(n, "time-memo-tag-chip")
        ) {
          count += 1 + (n.getAttribute("data-tag") || "").trim().length;
          return true;
        }
        return true;
      }
      if (n.nodeType === Node.TEXT_NODE) {
        count += (n.textContent || "").length;
        return false;
      }
      if (
        n.nodeType === Node.ELEMENT_NODE &&
        lpTokenHas(n, "time-memo-tag-chip")
      ) {
        count += 1 + (n.getAttribute("data-tag") || "").trim().length;
        return false;
      }
      if (n.nodeType === Node.ELEMENT_NODE) {
        for (let i = 0; i < n.childNodes.length; i++) {
          if (walk(n.childNodes[i])) return true;
        }
      }
      return false;
    };
    walk(container);
    return count;
  }
  function getNodeAndOffsetAt(container, charOffset) {
    let passed = 0;
    const walk = (n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const len = (n.textContent || "").length;
        if (passed + len >= charOffset)
          return { node: n, offset: charOffset - passed };
        passed += len;
        return null;
      }
      if (
        n.nodeType === Node.ELEMENT_NODE &&
        lpTokenHas(n, "time-memo-tag-chip")
      ) {
        const len = 1 + (n.getAttribute("data-tag") || "").trim().length;
        if (passed + len >= charOffset) return { node: n, offset: 0 };
        passed += len;
        return null;
      }
      if (n.nodeType === Node.ELEMENT_NODE) {
        for (let i = 0; i < n.childNodes.length; i++) {
          const r = walk(n.childNodes[i]);
          if (r) return r;
        }
      }
      return null;
    };
    return walk(container);
  }

  containerEl.addEventListener("input", () => {
    if (serializeMemoContent(containerEl).trim() === "")
      lpTokenAdd(containerEl, "is-empty");
    else lpTokenRemove(containerEl, "is-empty");
    if (composing) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!containerEl.contains(range.commonAncestorContainer)) return;
    const beforeCaret = getTextBeforeCaret(containerEl, range);
    const tagMatch = beforeCaret.match(/#([^\s#]*)$/);
    if (tagMatch) {
      const tagPart = tagMatch[1];
      if (/[\s,，]/.test(tagPart) || tagPart.endsWith("#")) return;
      const after = getTextAfterCaret(containerEl, range).charAt(0);
      if (tagPart.length > 0 && /[\s\n,]/.test(after)) {
        tryCommitTag(containerEl, range, tagMatch[0].length, tagPart, false);
      }
    }
  });

  containerEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (composing)
        return; /* 한글 조합 중에는 태그 확정하지 않음 → 글자 중복/깨짐 방지 */
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (!containerEl.contains(range.commonAncestorContainer)) return;
      const beforeCaret = getTextBeforeCaret(containerEl, range);
      const tagMatch = beforeCaret.match(/#([^\s#]*)$/);
      if (tagMatch && tagMatch[1].length > 0) {
        e.preventDefault();
        tryCommitTag(
          containerEl,
          range,
          tagMatch[0].length,
          tagMatch[1],
          e.key === " ",
        );
      }
    }
  });
}

/** 과제명, 사용시간, 피드백이 전부 비어있으면 빈 행 (저장 제외) */
function isEmptyTimeRow(row) {
  const taskName = (row.taskName || "").trim();
  const timeTracked = (row.timeTracked || "").trim();
  const feedback = (row.feedback || "").trim();
  return !taskName && !timeTracked && !feedback;
}

function collectRowFromTR(tr) {
  if (tr._rowData) return tr._rowData;
  const taskInput = tr.querySelector('[data-legacy~="time-input-task"]');
  const timeInput = tr.querySelector('[data-legacy~="time-input-tracked"]');
  const startInput = tr.querySelector('[data-legacy~="time-input-start"]');
  const endInput = tr.querySelector('[data-legacy~="time-input-end"]');
  const prodWrap = tr.querySelector(
    '[data-legacy~="time-cell-productivity"] [data-legacy~="time-productivity-display-wrap"]',
  );
  const dateInput = tr.querySelector(
    '[data-legacy~="time-cell-date"] input[type="date"]',
  );
  const feedbackInput = tr.querySelector(
    '[data-legacy~="time-input-feedback"]',
  );
  const taskName = (taskInput?.value || "").trim();
  const opt = taskName ? getTaskOptionByName(taskName) : null;
  const tid = (opt?.id || "").trim();
  const startVal = (startInput?.value || "").trim();
  const endVal = (endInput?.value || "").trim();
  return {
    taskName,
    taskId: isUuid(tid) ? tid : "",
    startTime: startVal ? formatDateTimeInput(startVal) || startVal : "",
    endTime: endVal ? formatDateTimeInput(endVal) || endVal : "",
    timeTracked: timeInput?.value || "",
    productivity:
      (typeof prodWrap?._getValue === "function"
        ? prodWrap._getValue()
        : null) || "",
    category: opt?.category || "",
    date: dateInput?.value || "",
    feedback: feedbackInput?.value || "",
    focus: (tr._rowData?.focus || "").trim(),
    memoTags: [],
    linkedExpenseIds: [],
  };
}

function collectRowsFromDOM(container) {
  const rows = [];
  container.querySelectorAll('[data-legacy~="time-row"]').forEach((tr) => {
    const row = collectRowFromTR(tr);
    if (!isEmptyTimeRow(row)) rows.push(row);
  });
  container
    .querySelectorAll('[data-legacy~="time-ledger-mobile-card"]')
    .forEach((card) => {
      if (card._rowData && !isEmptyTimeRow(card._rowData))
        rows.push(card._rowData);
    });
  return rows;
}

function timeLedgerListRowIconSrc(rowData) {
  const opt = rowData?.taskName ? getTaskOptionByName(rowData.taskName) : null;
  return resolveTimeTaskDisplayIconSrc(rowData?.taskName, {
    category: rowData?.category ?? opt?.category,
    productivity: rowData?.productivity ?? opt?.productivity,
    iconKey: opt?.iconKey || "",
  });
}

/** 모바일 리스트 왼쪽 컬러바 — 기본 생산성 3색(테이블 막대·DEFAULT_TIME_CATEGORY_COLORS와 동일 톤) */
function getProductivityBarColor(prod) {
  if (prod === "productive") return "#FFABAB";
  if (prod === "nonproductive") return "#AFCBE6";
  return "#93B4E6";
}

const TIME_LEDGER_DAY_OVERVIEW_MINUTES = 24 * 60;

function getLedgerDayBarProductivityKey(rowData) {
  const pv = String(getMobileCardProductivityValue(rowData) || "")
    .trim()
    .toLowerCase();
  if (pv === "productive") return "productive";
  if (pv === "nonproductive") return "nonproductive";
  return "other";
}

/** 하루 24h 바 — 시작·끝(분, 0=자정). 시작 없으면 null */
function getLedgerRowDayBarSegmentMinutes(rowData) {
  const startInst = getRowStartInstantForMobileCard(rowData);
  if (!startInst) return null;
  let endInst = getRowEndInstantForMobileCard(rowData);
  if (!endInst) {
    const tracked = String(rowData.timeTracked || "").trim();
    if (tracked) {
      const hrs = parseTimeToHours(tracked) || 0;
      if (hrs > 0) {
        endInst = new Date(startInst.getTime() + hrs * 3600000);
      }
    }
  }
  if (!endInst && mobileCardNeedsLiveClock(rowData)) {
    endInst = new Date();
  }
  if (!endInst) return null;
  const startMin =
    startInst.getHours() * 60 +
    startInst.getMinutes() +
    startInst.getSeconds() / 60;
  let endMin =
    endInst.getHours() * 60 + endInst.getMinutes() + endInst.getSeconds() / 60;
  if (
    endInst.getFullYear() !== startInst.getFullYear() ||
    endInst.getMonth() !== startInst.getMonth() ||
    endInst.getDate() !== startInst.getDate() ||
    endInst <= startInst
  ) {
    endMin = TIME_LEDGER_DAY_OVERVIEW_MINUTES;
  }
  endMin = Math.min(TIME_LEDGER_DAY_OVERVIEW_MINUTES, endMin);
  if (endMin <= startMin) return null;
  return { startMin, endMin, prod: getLedgerDayBarProductivityKey(rowData) };
}

function formatLedgerSlotGridClockMin(minOfDay) {
  const m = Math.max(0, Math.floor(Number(minOfDay) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${String(h).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** 타임박스뷰 — 실제 시작·끝(분) 구간 목록 */
function buildTimeLedgerDayTimeboxBlocks(dayRows) {
  const blocks = [];
  for (const r of dayRows || []) {
    const seg = getLedgerRowDayBarSegmentMinutes(r);
    if (!seg) continue;
    blocks.push({
      startMin: seg.startMin,
      endMin: seg.endMin,
      prod: seg.prod,
      taskName: String(r.taskName || "").trim(),
      startDisplay: formatLedgerSlotGridClockMin(seg.startMin),
      endDisplay: formatLedgerSlotGridClockMin(seg.endMin),
      rowData: r,
    });
  }
  return blocks;
}

/** 다일 타임박스 — 날짜별 생산적 시간 비율 */
function buildDayProductivityStatsMap(rows) {
  const byDay = new Map();
  for (const r of rows || []) {
    const ymd = ledgerRowDateYmdForFilter(r);
    if (!ymd) continue;
    if (!byDay.has(ymd)) byDay.set(ymd, []);
    byDay.get(ymd).push(r);
  }
  const stats = new Map();
  for (const [ymd, dayRows] of byDay) {
    let productive = 0;
    let nonproductive = 0;
    let other = 0;
    for (const r of dayRows) {
      const hrs = getMobileCardEffectiveHoursForPrice(r);
      if (hrs <= 0) continue;
      const p = getMobileCardProductivityValue(r);
      if (p === "productive") productive += hrs;
      else if (p === "nonproductive") nonproductive += hrs;
      else other += hrs;
    }
    const total = productive + nonproductive + other;
    stats.set(ymd, {
      ymd,
      productiveHrs: productive,
      nonproductiveHrs: nonproductive,
      otherHrs: other,
      totalHrs: total,
      pct: total > 0 ? (productive / total) * 100 : 0,
    });
  }
  return stats;
}

function mountTimeLedgerTimeboxView(
  timeboxShell,
  { dayRows, isMultiDay, rangeStartYmd, rangeEndYmd, allRowsInRange },
) {
  if (!timeboxShell) return;
  timeboxShell.replaceChildren();
  timeboxShell.className = "time-ledger-timebox-view-shell";
  if (isMultiDay) {
    timeboxShell.appendChild(
      createTimeLedgerVerticalProductivityHeatmap({
        rangeStartYmd,
        rangeEndYmd,
        dayProductivityMap: buildDayProductivityStatsMap(
          allRowsInRange || dayRows,
        ),
      }),
    );
    return;
  }
  const blocks = buildTimeLedgerDayTimeboxBlocks(dayRows);
  timeboxShell.appendChild(createTimeLedgerDayTimeboxElement(blocks));
}

function refreshTimeLedgerTimeboxSlotGrid(timeboxShell, dayRows) {
  const scroll = timeboxShell?.querySelector(".time-ledger-day-timebox-scroll");
  if (!scroll) return;
  refreshTimeLedgerDayTimeboxScroll(scroll, buildTimeLedgerDayTimeboxBlocks(dayRows));
}

function populateTimeLedgerDayOverviewBarSegments(segmentsLayer, dayRows) {
  if (!segmentsLayer) return;
  segmentsLayer.replaceChildren();
  const segments = [];
  for (const r of dayRows || []) {
    const seg = getLedgerRowDayBarSegmentMinutes(r);
    if (seg) segments.push(seg);
  }
  segments.sort((a, b) => a.startMin - b.startMin);
  segments.forEach((seg, i) => {
    const el = document.createElement("span");
    lpSetClasses(
      el,
      `time-ledger-day-overview-bar-seg time-ledger-day-overview-bar-seg--${seg.prod}`,
    );
    el.style.left = `${(seg.startMin / TIME_LEDGER_DAY_OVERVIEW_MINUTES) * 100}%`;
    el.style.width = `${((seg.endMin - seg.startMin) / TIME_LEDGER_DAY_OVERVIEW_MINUTES) * 100}%`;
    el.style.zIndex = String(i + 1);
    segmentsLayer.appendChild(el);
  });
}

/** 시간 사용내역 — 0시~24시 타임라인 바(기록 구간·길이 = 24h 대비 비율) */
function createTimeLedgerDayOverviewBar(dayRows, dayKeyYmd = "") {
  const wrap = document.createElement("div");
  lpSetClasses(wrap, "time-ledger-day-overview-bar-wrap");
  if (dayKeyYmd) wrap.dataset.dayKey = dayKeyYmd;

  const track = document.createElement("div");
  lpSetClasses(track, "time-ledger-day-overview-bar-track");
  track.setAttribute("role", "img");
  track.setAttribute(
    "aria-label",
    "하루 0시부터 24시까지 시간대별 생산적·비생산적·그 외 기록",
  );

  const segmentsLayer = document.createElement("div");
  lpSetClasses(segmentsLayer, "time-ledger-day-overview-bar-segments");
  populateTimeLedgerDayOverviewBarSegments(segmentsLayer, dayRows);
  track.appendChild(segmentsLayer);
  wrap.appendChild(track);
  return wrap;
}

/** 시간가계부 상단 — 타임라인뷰 / 타임박스뷰 (시간레포트 DAY·MONTH와 동일 세그먼트 스타일) */
function createTimeLedgerViewModeBar(onViewChange) {
  const wrap = document.createElement("div");
  wrap.className = "time-ledger-view-mode-bar-wrap";

  const bar = document.createElement("div");
  bar.className = "diary-report-granularity time-ledger-view-mode-bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "타임라인 · 타임박스 보기");

  const timelineBtn = document.createElement("button");
  timelineBtn.type = "button";
  timelineBtn.className = "diary-report-granularity__seg";
  timelineBtn.textContent = "타임라인뷰";
  timelineBtn.title = "타임라인 보기";

  const timeboxBtn = document.createElement("button");
  timeboxBtn.type = "button";
  timeboxBtn.className = "diary-report-granularity__seg";
  timeboxBtn.textContent = "타임박스뷰";
  timeboxBtn.title = "타임박스 보기";

  bar.appendChild(timelineBtn);
  bar.appendChild(timeboxBtn);
  wrap.appendChild(bar);

  function syncUi(view) {
    const isTimeline = view === "timeline";
    timelineBtn.classList.toggle("is-active", isTimeline);
    timeboxBtn.classList.toggle("is-active", !isTimeline);
    timelineBtn.setAttribute("aria-pressed", isTimeline ? "true" : "false");
    timeboxBtn.setAttribute("aria-pressed", isTimeline ? "false" : "true");
  }

  timelineBtn.addEventListener("click", () => onViewChange("timeline"));
  timeboxBtn.addEventListener("click", () => onViewChange("timebox"));

  wrap._syncTimeLedgerViewModeUi = syncUi;
  return wrap;
}

function refreshTimeLedgerDayOverviewBars(root, rowsForDay) {
  if (!root) return;
  root
    .querySelectorAll('[data-legacy~="time-ledger-day-overview-bar-wrap"]')
    .forEach((wrap) => {
      const key = String(wrap.dataset.dayKey || "").trim();
      const dayRows = key
        ? rowsForDay.filter((r) => ledgerRowDateYmdForFilter(r) === key)
        : rowsForDay;
      const layer = wrap.querySelector(
        '[data-legacy~="time-ledger-day-overview-bar-segments"]',
      );
      populateTimeLedgerDayOverviewBarSegments(layer, dayRows);
    });
}

function formatLedgerTimelineClockHHmm(inst) {
  if (!inst || !(inst instanceof Date)) return "";
  return `${String(inst.getHours()).padStart(2, "0")}:${String(inst.getMinutes()).padStart(2, "0")}`;
}

function formatLedgerTimelineEndClock(row) {
  if (rowHasEndTimeForMobileCard(row)) {
    const inst = getRowEndInstantForMobileCard(row);
    return formatLedgerTimelineClockHHmm(inst) || "—";
  }
  if (mobileCardNeedsLiveClock(row)) return TIME_LEDGER_IN_PROGRESS_LABEL;
  return "—";
}

/** 모바일 시간가계부 카드 — 좌 시간열 | 우(아이콘·과제명 1–2행·소요/가격·메모) */
function createMobileTimeCard(rowData, onEdit, onDelete, viewEl) {
  const taskLabel = String(rowData.taskName || "").trim() || "(제목 없음)";
  const memoText = String(rowData.feedback || "").trim();
  const startInst = getRowStartInstantForMobileCard(rowData);
  const startClock = formatLedgerTimelineClockHHmm(startInst) || "—";
  const endClock = formatLedgerTimelineEndClock(rowData);
  const durMin = Math.max(
    0,
    Math.round((getMobileCardEffectiveHoursForPrice(rowData) || 0) * 60),
  );
  const hourlyRate =
    parseFloat(
      String(
        viewEl?.querySelector('[data-legacy~="time-hourly-input"]')?.value ||
          "0",
      ).replace(/,/g, ""),
    ) || 0;
  const priceVal = computeMobileCardPriceValue(rowData, hourlyRate);
  const priceSlot = getMobileCardPriceProductivitySlot(rowData);
  const priceText = formatTimeLedgerActionPriceDisplay(priceVal, priceSlot);
  const iconSrc = timeLedgerListRowIconSrc(rowData);
  const live = mobileCardNeedsLiveClock(rowData);

  const item = document.createElement("div");
  item.className = "calendar-1day-timeline-item";

  const card = document.createElement("div");
  lpSetClasses(
    card,
    "time-ledger-mobile-card" +
      (live ? " time-ledger-mobile-card--in-progress" : ""),
  );
  card.classList.add("calendar-1day-timeline-card");
  card.classList.add("calendar-1day-timeline-card--usage-layout");
  applyMobileCardTimeSlotBgClass(card, rowData);
  if (live) card.classList.add("calendar-1day-timeline-card--in-progress");
  card._rowData = rowData;
  card._timeLedgerViewEl = viewEl || null;
  card._onRowDelete = onDelete;
  card.title = memoText
    ? `${taskLabel} (${startClock} ~ ${endClock})\n${memoText}`
    : `${taskLabel} (${startClock} ~ ${endClock})`;

  const startEl = document.createElement("span");
  startEl.className = "calendar-1day-timeline-card-start";
  startEl.textContent = startClock;

  const timeConnector = document.createElement("span");
  timeConnector.className = "calendar-1day-timeline-card-time-connector";
  timeConnector.setAttribute("aria-hidden", "true");

  const endEl = document.createElement("span");
  endEl.className = "calendar-1day-timeline-card-end";
  endEl.textContent = endClock;

  const iconCell = document.createElement("div");
  iconCell.className = "time-ledger-usage-icon-cell";
  if (iconSrc) {
    const iconImg = document.createElement("img");
    iconImg.src = iconSrc;
    iconImg.alt = "";
    iconImg.loading = "eager";
    iconImg.decoding = "sync";
    iconCell.appendChild(iconImg);
  }

  const titleEl = document.createElement("div");
  titleEl.className = "calendar-1day-timeline-card-title";
  titleEl.textContent = taskLabel;

  const durRow = document.createElement("span");
  durRow.className = "calendar-1day-timeline-card-duration";
  durRow.textContent = formatIntegerMinutesDurationKo(durMin);

  const priceEl = document.createElement("span");
  priceEl.className =
    "diary-tab5-timeline-price time-mobile-card-price time-mobile-card-price--" +
    priceSlot;
  priceEl.textContent = priceText || "\u00a0";

  const statsCol = document.createElement("div");
  statsCol.className = "time-ledger-usage-stats-col";
  statsCol.appendChild(durRow);
  statsCol.appendChild(priceEl);

  card.appendChild(startEl);
  card.appendChild(timeConnector);
  card.appendChild(iconCell);
  card.appendChild(titleEl);
  card.appendChild(statsCol);
  if (memoText) {
    const memoEl = document.createElement("div");
    memoEl.className = "calendar-1day-timeline-card-memo";
    memoEl.textContent = memoText;
    card.appendChild(memoEl);
  }

  card.appendChild(endEl);

  card.addEventListener("click", (e) => {
    if (
      e.target.closest(
        ".calendar-1day-timeline-card-start, .calendar-1day-timeline-card-end, .calendar-1day-timeline-card-time-connector",
      )
    ) {
      return;
    }
    onEdit(card, rowData);
  });

  item.appendChild(card);
  return item;
}

/** 과제명 열 너비 변경 시 sticky left 위치 동기화 */
function updateStickyLefts(table) {
  if (!table) return;
  const taskEl = table.querySelector('[data-legacy~="time-th-task"]');
  if (!taskEl) return;
  const taskW = taskEl.getBoundingClientRect().width;
  const startW = 90;
  const endW = 90;
  const trackedW = 90;
  table.style.setProperty("--sticky-left-start", `${taskW}px`);
  table.style.setProperty("--sticky-left-end", `${taskW + startW}px`);
  table.style.setProperty(
    "--sticky-left-tracked",
    `${taskW + startW + endW}px`,
  );
}

function createTableHTML() {
  return `
    <colgroup>
      <col data-legacy="time-col-task">
      <col data-legacy="time-col-start">
      <col data-legacy="time-col-end">
      <col data-legacy="time-col-tracked">
      <col data-legacy="time-col-category">
      <col data-legacy="time-col-productivity">
      <col data-legacy="time-col-date">
      <col data-legacy="time-col-price">
      <col data-legacy="time-col-feedback">
      <col data-legacy="time-col-memo-tag">
    </colgroup>
    <thead>
      <tr>
        <th data-legacy="time-th-task">과제명</th>
        <th data-legacy="time-th-start">시작시간</th>
        <th data-legacy="time-th-end">마감시간</th>
        <th data-legacy="time-th-tracked">사용 시간</th>
        <th data-legacy="time-th-category">카테고리</th>
        <th data-legacy="time-th-productivity">생산성</th>
        <th data-legacy="time-th-date">기록 날짜</th>
        <th data-legacy="time-th-price">행동의 가치</th>
        <th data-legacy="time-th-feedback">과제 메모</th>
        <th data-legacy="time-th-memo-tag">메모 태그</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
}

export function render(opts = {}) {
  const taskLogBridgeMode = !!opts?.taskLogBridgeMode;
  const el = document.createElement("div");
  lpSetClasses(el, "app-tab-panel-content time-ledger-view");
  el.dataset.timeContentView = "all";
  el._lpUsageListScrollToBottomPending = false;
  requestUsageListScrollToBottomOnce();
  const timeTabAbort = new AbortController();
  el._lpTabAbortController = timeTabAbort;
  const signal = timeTabAbort.signal;

  attachTimeLedgerTasksSaveListener();

  const storedRate = (() => {
    try {
      const v = readUserHourlyRateLocal();
      const n = parseFloat(v);
      return Number.isNaN(n) ? 0 : n;
    } catch (_) {
      return 0;
    }
  })();
  const hourlyInput = document.createElement("input");
  hourlyInput.type = "hidden";
  lpSetClasses(hourlyInput, "time-hourly-input");
  hourlyInput.value = String(storedRate);
  el.appendChild(hourlyInput);

  const hourlyAddSlot = document.createElement("div");
  lpSetClasses(hourlyAddSlot, "time-hourly-add-slot");

  const now = new Date();
  function getLedgerFilterTodayYmd() {
    return timeLedgerLocalTodayYmd();
  }

  /** YYYY-MM-DD → "2026. 05. 05(화)" — 목록 일자·잔고 카드 공통 */
  function formatTimeFilterDateDotsWithWeekday(dStr) {
    if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return "";
    const [y, mo, d] = dStr.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const yy = String(y);
    const mm = String(mo).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${yy}. ${mm}. ${dd}(${weekdays[dt.getDay()]})`;
  }

  /** 목록 조회 구간 캡션 (짧게, 제목 오른쪽용) */
  function formatUsageRangeCaption(startYmd, endYmd) {
    if (
      !startYmd ||
      !endYmd ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startYmd) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)
    ) {
      return "";
    }
    const short = (d) => {
      const [y, mo, da] = d.split("-");
      return `${String(y).slice(2)}.${mo}.${da}`;
    };
    if (startYmd === endYmd) return short(startYmd);
    return `${short(startYmd)} ~ ${short(endYmd)}`;
  }

  const filterType = "range";
  let filterYear = now.getFullYear();
  let filterMonth = now.getMonth() + 1;

  function readUsageListRangeFromSession() {
    try {
      if (typeof sessionStorage === "undefined") return null;
      const us = sessionStorage.getItem("lp_time_usage_list_start");
      const ue = sessionStorage.getItem("lp_time_usage_list_end");
      if (!us || !/^\d{4}-\d{2}-\d{2}$/.test(us)) return null;
      let rs = us;
      let re = ue && /^\d{4}-\d{2}-\d{2}$/.test(ue) ? ue : us;
      if (rs > re) {
        const x = rs;
        rs = re;
        re = x;
      }
      return { start: rs, end: re };
    } catch (_) {
      return null;
    }
  }
  const _usageListFromSession = readUsageListRangeFromSession();
  const _todayForUsageRange = getLedgerFilterTodayYmd();
  let usageHistoryRangeStartYmd =
    _usageListFromSession?.start ?? _todayForUsageRange;
  let usageHistoryRangeEndYmd = _usageListFromSession?.end ?? _todayForUsageRange;

  const LP_TIME_LEDGER_LAYOUT_VIEW_KEY = "lp_time_ledger_layout_view";
  /** 시간가계부 본문: 타임라인(기록 목록) | 타임박스(준비 중) */
  let timeLedgerLayoutView = (() => {
    try {
      const raw = sessionStorage.getItem(LP_TIME_LEDGER_LAYOUT_VIEW_KEY);
      if (raw === "timeline" || raw === "timebox") return raw;
    } catch (_) {}
    return "timeline";
  })();
  function persistTimeLedgerLayoutView() {
    try {
      sessionStorage.setItem(LP_TIME_LEDGER_LAYOUT_VIEW_KEY, timeLedgerLayoutView);
    } catch (_) {}
  }

  function persistActiveViewTimeFilterToSession() {
    const t = getLedgerFilterTodayYmd();
    try {
      if (typeof sessionStorage === "undefined") return;
      sessionStorage.setItem("lp_time_usage_list_start", usageHistoryRangeStartYmd);
      sessionStorage.setItem("lp_time_usage_list_end", usageHistoryRangeEndYmd);
      sessionStorage.setItem("lp_time_filter_start", t);
      sessionStorage.setItem("lp_time_filter_end", t);
    } catch (_) {}
  }
  /** 과제 필터: null = 전체, string[] = 선택한 과제만 표시 (히스토리 기준) */
  let selectedTaskNamesForFilter = null;

  const taskSetupBtn = document.createElement("button");
  taskSetupBtn.type = "button";
  lpSetClasses(taskSetupBtn, "time-task-setup-btn");
  taskSetupBtn.dataset.filterFor = "all";
  taskSetupBtn.title = "과제명, 생산성, 카테고리를 한 번에 설정";
  taskSetupBtn.setAttribute("aria-label", "과제 설정");
  taskSetupBtn.innerHTML = TIME_LEDGER_TOOLBAR_SETTINGS_ICON_SVG;
  lpTokenAdd(taskSetupBtn, "time-ledger-tabs-settings-btn");
  lpTokenAdd(taskSetupBtn, "time-ledger-toolbar-icon-btn");
  lpTokenAdd(taskSetupBtn, APP_FOOTER_ICON_BTN_CLASS);

  const taskSelectBtn = document.createElement("button");
  taskSelectBtn.type = "button";
  lpSetClasses(
    taskSelectBtn,
    "time-task-setup-btn time-filter-task-select-btn time-ledger-toolbar-icon-btn",
  );
  taskSelectBtn.id = "time-task-select-btn";
  taskSelectBtn.title = "과제 선택";
  taskSelectBtn.setAttribute("aria-label", "과제 선택");
  taskSelectBtn.innerHTML = TIME_LEDGER_TOOLBAR_FILTER_ICON_SVG;
  lpTokenAdd(taskSelectBtn, APP_FOOTER_ICON_BTN_CLASS);

  const footerDateBtn = document.createElement("button");
  footerDateBtn.type = "button";
  lpSetClasses(footerDateBtn, "time-ledger-footer-date-btn");
  footerDateBtn.title = "시간 사용내역 조회 기간";
  footerDateBtn.setAttribute("aria-label", "시간 사용내역 조회 기간");
  footerDateBtn.innerHTML = TIME_LEDGER_FOOTER_DATE_ICON_SVG;
  lpTokenAdd(footerDateBtn, APP_FOOTER_ICON_BTN_CLASS);

  let _timeLedgerFilterPullTimer = null;
  let _usageListPullGen = 0;

  function patchUsageRangeHeadingOnly() {
    const cap = contentWrap.querySelector("[data-usage-range-caption]");
    if (cap) {
      cap.textContent = formatUsageRangeCaption(
        usageHistoryRangeStartYmd,
        usageHistoryRangeEndYmd,
      );
    }
  }

  function schedulePullTimeLedgerForPickerRange() {
    if (_timeLedgerFilterPullTimer) clearTimeout(_timeLedgerFilterPullTimer);
    _timeLedgerFilterPullTimer = setTimeout(() => {
      _timeLedgerFilterPullTimer = null;
      const pullGen = ++_usageListPullGen;
      void (async () => {
        if (!el.isConnected) return;
        persistActiveViewTimeFilterToSession();
        let rs = String(usageHistoryRangeStartYmd || "").trim();
        let re = String(usageHistoryRangeEndYmd || "").trim();
        if (rs > re) {
          const x = rs;
          rs = re;
          re = x;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rs) || !/^\d{4}-\d{2}-\d{2}$/.test(re)) {
          return;
        }
        const ok = await pullTimeLedgerEntriesForDateRange(rs, re);
        if (pullGen !== _usageListPullGen) return;
        if (!el.isConnected) return;
        const cacheRows = loadTimeRows();
        const filtered = applyUsageListFilters(cacheRows);
        if (!ok) return;
        allRowsCache = cacheRows;
        cachedRows = [...cacheRows];
        renderAll(filtered);
        rememberTimeLedgerPaintSignature();
        updateTotal();
        persistActiveViewTimeFilterToSession();
      })();
    }, 400);
  }

  /** 조회 기간·과제 필터 등 사용자가 명시적으로 조회 조건을 바꾼 직후에만 서버 pull */
  function requestTimeLedgerPullForUserQueryChange(_source = "unknown") {
    schedulePullTimeLedgerForPickerRange();
  }

  function applyUsageListFilters(rows) {
    let filtered = filterRowsByFilterType(
      rows,
      filterType,
      filterYear,
      filterMonth,
      usageHistoryRangeStartYmd,
      usageHistoryRangeEndYmd,
    );
    if (
      selectedTaskNamesForFilter != null &&
      selectedTaskNamesForFilter.length > 0
    ) {
      const set = new Set(selectedTaskNamesForFilter);
      filtered = filtered.filter((r) => set.has((r.taskName || "").trim()));
    }
    return filtered;
  }

  function onFilterChange(skipMerge = false) {
    const rows = getFullRowsForFilter(skipMerge);
    cachedRows = rows;
    const filtered = applyUsageListFilters(rows);
    renderAll(filtered);
    rememberTimeLedgerPaintSignature();
    updateTotal();
    persistActiveViewTimeFilterToSession();
  }

  function shiftYmdTenByDays(ymdTen, deltaDays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymdTen)) return ymdTen;
    const [y, mo, d] = ymdTen.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }

  function getUsageHistoryAnchorYmd() {
    let s = usageHistoryRangeStartYmd;
    let e = usageHistoryRangeEndYmd;
    if (s > e) {
      const x = s;
      s = e;
      e = x;
    }
    return e;
  }

  /** 왼쪽 스와이프=다음날, 오른쪽 스와이프=전날 */
  function shiftUsageHistoryDay(step) {
    if (step !== 1 && step !== -1) return;
    const anchorBefore = getUsageHistoryAnchorYmd();
    const next = shiftYmdTenByDays(anchorBefore, step);
    usageHistoryRangeStartYmd = next;
    usageHistoryRangeEndYmd = next;
    persistActiveViewTimeFilterToSession();
    patchUsageRangeHeadingOnly();
    requestUsageListScrollToBottomOnce();
    requestTimeLedgerPullForUserQueryChange("swipe");
  }

  /** pull·소프트 갱신: 기록·조회 구간이 같으면 renderAll 생략(아이콘 재로드 깜빡임 방지) */
  function snapshotTimeLedgerPaintSignature() {
    let ledger = "";
    try {
      /* 기록 행은 메모리(_ledgerRowsMem)만 사용 — localStorage 키는 비어 있음 */
      ledger = JSON.stringify(loadTimeRows());
    } catch (_) {}
    const taskFilter =
      selectedTaskNamesForFilter == null
        ? ""
        : selectedTaskNamesForFilter.join("\x1e");
    return `${usageHistoryRangeStartYmd}|${usageHistoryRangeEndYmd}|${taskFilter}|${timeLedgerLayoutView}|${ledger}`;
  }

  function rememberTimeLedgerPaintSignature() {
    el._lpLastTimeLedgerPaintSig = snapshotTimeLedgerPaintSignature();
  }

  function patchTimeLedgerUsageHeadingInPlace(rows) {
    const cap = contentWrap.querySelector("[data-usage-range-caption]");
    if (cap) {
      cap.textContent = formatUsageRangeCaption(
        usageHistoryRangeStartYmd,
        usageHistoryRangeEndYmd,
      );
    }
    const total = contentWrap.querySelector("[data-usage-total-time]");
    if (total) {
      total.textContent = formatHoursToHHMM(sumTimeLedgerDayHours(rows));
    }
  }

  /** 푸터 + 버튼은 renderAll 마다 innerHTML 비우지 않음 — 한 번만 붙임 */
  function ensureHourlyAddFooterButton() {
    if (!hourlyAddSlot || hourlyAddSlot.dataset.lpFooterAddBound === "1") return;
    hourlyAddSlot.dataset.lpFooterAddBound = "1";
    hourlyAddSlot.innerHTML = "";
    const addInner = document.createElement("div");
    lpSetClasses(
      addInner,
      "time-hourly-add-inner time-ledger-add-inner--icon-only",
    );
    const addBtnEl = document.createElement("button");
    addBtnEl.type = "button";
    lpSetClasses(addBtnEl, APP_FOOTER_ICON_BTN_CLASS);
    addBtnEl.title = "과제 기록";
    addBtnEl.setAttribute("aria-label", "과제 기록");
    addBtnEl.innerHTML = TIME_LEDGER_ADD_PLUS_ICON_SVG;
    addInner.appendChild(addBtnEl);
    hourlyAddSlot.appendChild(addInner);
    addBtnEl.addEventListener("click", () => {
      const refs = el._lpTaskLogModalLedgerRefs;
      if (openTaskLogModal && refs?.hiddenTbody) {
        openTaskLogModal({
          productivity: null,
          tbody: refs.hiddenTbody,
          addRow: null,
          onRowUpdate: () => {
            updateTotal();
            onFilterChange();
          },
          viewEl: el,
          createRow,
          handleRowDelete: refs.handleCardDelete,
          handleRowEdit: refs.handleCardEdit,
        });
      }
    });
  }

  /** 설정·필터·과제 기록(+) — 앱 푸터 공통: appFooterShell + main.css; 시간가계부 전용 래핑은 time-ledger.css */
  function syncAppFooterLedgerActions() {
    ensureHourlyAddFooterButton();
    const slot = getAppFooterActionsSlot();
    if (!slot) return;
    const nodes = [taskSetupBtn, taskSelectBtn, hourlyAddSlot, footerDateBtn];
    for (const node of nodes) {
      if (node && node.parentElement !== slot) slot.appendChild(node);
    }
  }
  if (!taskLogBridgeMode) syncAppFooterLedgerActions();

  const taskSetupModal = document.createElement("div");
  lpSetClasses(taskSetupModal, "time-task-setup-modal");
  taskSetupModal.innerHTML = `
    <div data-legacy="time-task-setup-backdrop"></div>
    <div data-legacy="time-task-setup-panel">
      <div data-legacy="time-task-setup-header">
        <h3 data-legacy="time-task-setup-title">과제 설정</h3>
        <button type="button" data-legacy="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div data-legacy="time-task-setup-body">
        <button type="button" data-legacy="time-task-add-btn">+ 과제 추가하기</button>
        <div data-legacy="time-task-setup-tabs">
          <button type="button" data-legacy="time-task-setup-tab active" data-tab="all">전체</button>
          <button type="button" data-legacy="time-task-setup-tab" data-tab="productive">생산적</button>
          <button type="button" data-legacy="time-task-setup-tab" data-tab="nonproductive">비생산적</button>
          <button type="button" data-legacy="time-task-setup-tab" data-tab="other">그 외</button>
        </div>
        <div data-legacy="time-task-setup-subcats" data-subcat-bar style="display:none">
          <button type="button" data-legacy="time-task-setup-subcat-btn active" data-subcat="">전체</button>
        </div>
        <div data-legacy="time-task-setup-list-scroll">
          <div data-legacy="time-task-setup-list" data-tab-content="all"></div>
          <div data-legacy="time-task-setup-list" data-tab-content="productive" style="display:none"></div>
          <div data-legacy="time-task-setup-list" data-tab-content="nonproductive" style="display:none"></div>
          <div data-legacy="time-task-setup-list" data-tab-content="other" style="display:none"></div>
        </div>
      </div>
    </div>
  `;
  taskSetupModal.hidden = true;
  el.appendChild(taskSetupModal);

  const taskSelectModal = document.createElement("div");
  lpSetClasses(taskSelectModal, "time-task-setup-modal time-task-select-modal");
  taskSelectModal.innerHTML = `
    <div data-legacy="time-task-setup-backdrop"></div>
    <div data-legacy="time-task-setup-panel time-task-select-panel">
      <div data-legacy="time-task-setup-header">
        <h3 data-legacy="time-task-setup-title">과제 선택</h3>
        <button type="button" data-legacy="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div data-legacy="time-task-setup-body">
        <div data-legacy="time-task-select-actions">
          <button type="button" data-legacy="time-task-select-all-btn">전체 선택</button>
          <button type="button" data-legacy="time-task-select-none-btn">전체 해제</button>
        </div>
        <div data-legacy="time-task-select-list" data-task-select-list></div>
      </div>
      <div data-legacy="time-task-select-footer time-task-log-footer">
        <button type="button" data-legacy="time-task-select-clear-btn">필터 해제</button>
        <button type="button" data-legacy="time-task-select-apply-btn">적용</button>
      </div>
    </div>
  `;
  taskSelectModal.hidden = true;
  el.appendChild(taskSelectModal);

  (function initTaskSelectModal() {
    const taskSelectList = taskSelectModal.querySelector(
      "[data-task-select-list]",
    );
    const taskSelectBackdrop = taskSelectModal.querySelector(
      '[data-legacy~="time-task-setup-backdrop"]',
    );
    const taskSelectClose = taskSelectModal.querySelector(
      '[data-legacy~="time-task-setup-header"] [data-legacy~="time-task-setup-close"]',
    );
    const taskSelectAllBtn = taskSelectModal.querySelector(
      '[data-legacy~="time-task-select-all-btn"]',
    );
    const taskSelectNoneBtn = taskSelectModal.querySelector(
      '[data-legacy~="time-task-select-none-btn"]',
    );
    const taskSelectApplyBtn = taskSelectModal.querySelector(
      '[data-legacy~="time-task-select-apply-btn"]',
    );
    const taskSelectClearBtn = taskSelectModal.querySelector(
      '[data-legacy~="time-task-select-clear-btn"]',
    );

    function openTaskSelectModal() {
      const rows = getFullRowsForFilter(true);
      const names = [
        ...new Set(rows.map((r) => (r.taskName || "").trim()).filter(Boolean)),
      ];
      names.sort((a, b) => a.localeCompare(b, "ko"));
      const selectedSet =
        selectedTaskNamesForFilter == null
          ? null
          : new Set(selectedTaskNamesForFilter);
      taskSelectList.innerHTML = names
        .map((name) => {
          const attrEsc = String(name).replace(/"/g, "&quot;");
          const nameHtml = String(name)
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          const opt = getTaskOptionByName(name);
          const kpiMark =
            opt && isTimeTaskKpiLinked(opt)
              ? '<span data-legacy="lp-task-badge lp-task-badge--kpi" title="KPI(맵)에서 연결된 과제입니다">KPI</span>'
              : "";
          const builtinMark = isTimeTaskBuiltinTemplate({ name })
            ? '<span data-legacy="lp-task-badge lp-task-badge--builtin" title="앱에서 제공하는 기본 과제입니다. 과제 설정에서 삭제할 수 없습니다.">기본</span>'
            : "";
          return `<label data-legacy="time-task-select-item"><input type="checkbox" data-legacy="time-task-select-cb" data-task-name="${attrEsc}" ${selectedSet === null || selectedSet.has(name) ? "checked" : ""} /><span data-legacy="time-task-select-item-text"><span data-legacy="time-task-select-item-name-part">${nameHtml}</span>${builtinMark}${kpiMark}</span></label>`;
        })
        .join("");
      if (names.length === 0)
        taskSelectList.innerHTML =
          '<p data-legacy="time-task-select-empty">기록된 과제가 없습니다.</p>';
      taskSelectModal.hidden = false;
    }

    function closeTaskSelectModal() {
      taskSelectModal.hidden = true;
    }

    taskSelectBtn?.addEventListener("click", openTaskSelectModal);
    taskSelectClose?.addEventListener("click", closeTaskSelectModal);
    taskSelectAllBtn?.addEventListener("click", () => {
      taskSelectModal
        .querySelectorAll('[data-legacy~="time-task-select-cb"]')
        .forEach((cb) => {
          cb.checked = true;
        });
    });
    taskSelectNoneBtn?.addEventListener("click", () => {
      taskSelectModal
        .querySelectorAll('[data-legacy~="time-task-select-cb"]')
        .forEach((cb) => {
          cb.checked = false;
        });
    });
    taskSelectApplyBtn?.addEventListener("click", () => {
      const checked = [
        ...taskSelectModal.querySelectorAll(
          '[data-legacy~="time-task-select-cb"]:checked',
        ),
      ].map((cb) => cb.dataset.taskName || "");
      selectedTaskNamesForFilter = checked.length === 0 ? null : checked;
      closeTaskSelectModal();
      onFilterChange();
      requestTimeLedgerPullForUserQueryChange("task_filter_apply");
      if (taskSelectBtn)
        lpTokenToggle(
          taskSelectBtn,
          "is-active",
          selectedTaskNamesForFilter != null &&
            selectedTaskNamesForFilter.length > 0,
        );
    });
    taskSelectClearBtn?.addEventListener("click", () => {
      selectedTaskNamesForFilter = null;
      closeTaskSelectModal();
      onFilterChange();
      requestTimeLedgerPullForUserQueryChange("task_filter_clear");
      lpTokenRemove(taskSelectBtn, "is-active");
    });
  })();

  const usageRangeModal = document.createElement("div");
  lpSetClasses(usageRangeModal, "time-task-setup-modal time-usage-range-modal");
  usageRangeModal.innerHTML = `
    <div data-legacy="time-task-setup-backdrop"></div>
    <div class="time-task-setup-panel todo-list-modal-panel" data-legacy="time-usage-range-panel work-schedule-day-entry-modal-panel">
      <div data-legacy="time-task-setup-header">
        <h3 data-legacy="time-task-setup-title">조회 기간</h3>
        <button type="button" data-legacy="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div data-legacy="time-task-setup-body time-usage-range-body">
        <div class="time-task-log-field">
          <label>시작</label>
          <div class="time-task-log-date-native-wrap">
            <input type="date" class="todo-task-edit-start" data-usage-range-start aria-label="시작" />
            <span class="time-task-log-date-overlay" aria-hidden="true"></span>
          </div>
        </div>
        <div class="time-task-log-field">
          <label>마감</label>
          <div class="time-task-log-date-native-wrap">
            <input type="date" class="todo-task-edit-due" data-usage-range-end aria-label="마감" />
            <span class="time-task-log-date-overlay" aria-hidden="true"></span>
          </div>
        </div>
      </div>
      <div class="time-task-log-footer" data-legacy="time-usage-range-footer">
        <button type="button" class="time-task-log-submit" data-legacy="time-usage-range-apply" data-usage-range-apply>조회</button>
      </div>
    </div>`;
  usageRangeModal.hidden = true;
  el.appendChild(usageRangeModal);

  (function initUsageRangeModal() {
    const usageRangeClose = usageRangeModal.querySelector(
      '[data-legacy~="time-task-setup-header"] [data-legacy~="time-task-setup-close"]',
    );
    const usageRangeStartInp = usageRangeModal.querySelector(
      "[data-usage-range-start]",
    );
    const usageRangeEndInp = usageRangeModal.querySelector("[data-usage-range-end]");
    const usageRangeApplyBtn = usageRangeModal.querySelector(
      "[data-usage-range-apply]",
    );

    function openUsageRangeModal() {
      if (usageRangeStartInp) usageRangeStartInp.value = usageHistoryRangeStartYmd;
      if (usageRangeEndInp) usageRangeEndInp.value = usageHistoryRangeEndYmd;
      initModalNativeDateFieldsIn(usageRangeModal);
      bindModalNativeDateRange(usageRangeStartInp, usageRangeEndInp);
      usageRangeModal.hidden = false;
    }
    function closeUsageRangeModal() {
      usageRangeModal.hidden = true;
    }

    footerDateBtn?.addEventListener("click", openUsageRangeModal);
    /* 배경 탭으로 닫지 않음 (닫기는 ×·적용만) */
    usageRangeClose?.addEventListener("click", closeUsageRangeModal);
    usageRangeApplyBtn?.addEventListener("click", () => {
      const fallback = getLedgerFilterTodayYmd();
      let s = String(usageRangeStartInp?.value || "").trim();
      let e = String(usageRangeEndInp?.value || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) s = fallback;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) e = s;
      if (s > e) {
        const x = s;
        s = e;
        e = x;
      }
      usageHistoryRangeStartYmd = s;
      usageHistoryRangeEndYmd = e;
      closeUsageRangeModal();
      persistActiveViewTimeFilterToSession();
      requestUsageListScrollToBottomOnce();
      onFilterChange();
      requestTimeLedgerPullForUserQueryChange("usage_range_modal");
    });
  })();

  const addTaskModal = document.createElement("div");
  lpSetClasses(addTaskModal, "time-task-setup-modal time-add-task-modal");
  addTaskModal.innerHTML = `
    <div data-legacy="time-task-setup-backdrop"></div>
    <div data-legacy="time-task-setup-panel time-add-task-panel">
      <div data-legacy="time-task-setup-header">
        <h3 data-legacy="time-task-setup-title">과제 추가</h3>
        <button type="button" data-legacy="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div data-legacy="time-task-setup-body">
        <div data-legacy="time-add-task-field">
          <label>과제명</label>
          <input type="text" data-legacy="time-add-task-name" name="time-add-task-name" placeholder="과제명 입력" />
        </div>
        <div data-legacy="time-add-task-field time-add-task-icon-field">
          <label>아이콘</label>
          <div data-legacy="time-add-task-icon-picker-mount"></div>
        </div>
        <div data-legacy="time-add-task-field">
          <label>생산성</label>
          <div data-legacy="time-add-task-productivity">
            <label data-legacy="time-add-task-radio"><input type="radio" name="addProd" value="productive" checked /> 생산적</label>
            <label data-legacy="time-add-task-radio"><input type="radio" name="addProd" value="nonproductive" /> 비생산적</label>
          </div>
        </div>
        <div data-legacy="time-add-task-field time-add-task-category-wrap">
          <label>카테고리</label>
          <div data-legacy="time-add-task-categories lp-choice-chip-row" data-for="productive"></div>
          <div data-legacy="time-add-task-categories lp-choice-chip-row" data-for="nonproductive" style="display:none"></div>
        </div>
      </div>
      <div data-legacy="time-add-task-footer time-task-log-footer">
        <button type="button" data-legacy="time-add-task-delete" hidden>과제 삭제</button>
        <button type="button" data-legacy="time-add-task-submit">추가</button>
      </div>
    </div>
  `;
  addTaskModal.hidden = true;
  el.appendChild(addTaskModal);
  const addTaskIconPicker = mountTimeAddTaskIconPicker(
    addTaskModal.querySelector('[data-legacy~="time-add-task-icon-picker-mount"]'),
  );

  const taskLogModal = document.createElement("div");
  lpSetClasses(taskLogModal, "time-task-setup-modal time-task-log-modal");
  taskLogModal.innerHTML = `
    <div data-legacy="time-task-setup-backdrop"></div>
    <div data-legacy="time-task-setup-panel time-task-log-panel">
      <div data-legacy="time-datetime-picker-backdrop" hidden></div>
      <div data-legacy="time-task-setup-header time-task-log-header">
        <h3 data-legacy="time-task-setup-title">과제 기록</h3>
        <button type="button" data-legacy="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div data-legacy="time-task-setup-body time-task-log-body">
        <div data-legacy="time-task-log-scroll-area">
        <div data-legacy="time-task-log-datetime-fields-wrap">
          <div data-legacy="time-task-log-field">
            <label>이 시간에 할 행동</label>
            <div data-legacy="time-task-log-task-wrap"></div>
          </div>
          <div data-legacy="time-task-log-field time-task-log-datetime-onerow">
            <div data-legacy="time-task-log-datetime-card lp-modal-datetime-card">
              <div data-legacy="time-task-log-datetime-input-row time-task-log-datetime-main-row">
                <div data-legacy="time-task-log-date-native-wrap">
                  <input type="date" data-legacy="time-task-log-date-start" name="time-task-log-date" data-hide-delete-btn="true" data-use-native-mobile="true" aria-label="기록 날짜" />
                  <span data-legacy="time-task-log-date-overlay" aria-hidden="true"></span>
                </div>
                <span data-legacy="time-task-log-datetime-sep" aria-hidden="true">–</span>
                <input type="text" data-legacy="time-task-log-time-start" name="time-task-log-time-start" lang="en" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="--:--" maxlength="5" autocomplete="off" inputmode="numeric" pattern="[0-9]*" aria-label="시작 시각" />
                <span data-legacy="time-task-log-datetime-sep" aria-hidden="true">–</span>
                <input type="text" data-legacy="time-task-log-time-end" name="time-task-log-time-end" lang="en" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="--:--" maxlength="5" autocomplete="off" inputmode="numeric" pattern="[0-9]*" aria-label="마감 시각" />
              </div>
            </div>
            <p data-legacy="time-task-log-time-order-warning" hidden role="alert">마감시간은 시작시간보다 빠를 수 없습니다.</p>
            <div data-legacy="time-task-log-quick-block">
            <div data-legacy="time-task-log-time-adjust-btns">
              <button type="button" data-legacy="time-task-log-time-adjust-btn time-task-log-time-adjust-now" data-now="true">지금</button>
              <button type="button" data-legacy="time-task-log-time-adjust-btn time-task-log-time-adjust-last" data-last="true">마지막</button>
              <button type="button" data-legacy="time-task-log-time-adjust-btn" data-delta="-30">−30</button>
              <button type="button" data-legacy="time-task-log-time-adjust-btn" data-delta="-15">−15</button>
              <button type="button" data-legacy="time-task-log-time-adjust-btn" data-delta="15">+15</button>
              <button type="button" data-legacy="time-task-log-time-adjust-btn" data-delta="30">+30</button>
              <button type="button" data-legacy="time-task-log-time-adjust-btn" data-day-end="true">하루끝</button>
            </div>
            </div>
            <input type="hidden" data-legacy="time-task-log-start" />
            <input type="hidden" data-legacy="time-task-log-end" />
          </div>
        </div>
        <div data-legacy="time-task-log-kpi-todos-section" hidden>
          <h4 data-legacy="time-task-log-kpi-todos-title">할일 목록</h4>
          <div data-legacy="time-task-log-kpi-todos-list"></div>
        </div>
        <div data-legacy="time-task-log-daily-todos-section" hidden>
          <h4 data-legacy="time-task-log-daily-todos-title">매일 할일 목록</h4>
          <div data-legacy="time-task-log-daily-todos-list"></div>
        </div>
        <div data-legacy="time-task-log-memo-section">
          <span data-legacy="time-task-log-section-label time-task-log-memo-section-label">메모</span>
          <div data-legacy="time-task-log-memo-fields">
            <div data-legacy="time-task-log-field time-task-log-meal-detail-section" hidden>
              <label data-legacy="time-task-log-section-label time-task-log-meal-detail-label" for="time-task-log-meal-detail">식단명</label>
              <input type="text" id="time-task-log-meal-detail" data-legacy="time-task-log-meal-detail-input time-task-log-memo-input" placeholder="무엇을 드셨는지 한 줄로 적어 주세요" autocomplete="off" />
            </div>
            <div data-legacy="time-task-log-field">
              <textarea data-legacy="time-task-log-feedback time-task-log-memo-input" rows="3" placeholder="메모를 입력하세요"></textarea>
            </div>
          </div>
        </div>
        </div>
      </div>
      <div data-legacy="time-task-log-footer" data-task-log-footer>
        <button type="button" data-legacy="time-task-log-delete-btn" hidden>이 시간기록 삭제</button>
        <button type="button" data-legacy="time-task-log-submit">기록</button>
      </div>
      <div data-legacy="time-datetime-picker-wrap time-datetime-picker-bottom" hidden>
        <div data-legacy="time-datetime-picker-buttons-wrap">
          <div data-legacy="time-datetime-picker-header">
            <span data-legacy="time-datetime-picker-title"></span>
            <button type="button" data-legacy="time-datetime-picker-confirm">확인</button>
          </div>
          <div data-legacy="time-datetime-picker-buttons time-datetime-picker-offset-btns">
            <button type="button" data-legacy="time-datetime-picker-btn" data-offset="-30">-30</button>
            <button type="button" data-legacy="time-datetime-picker-btn" data-offset="-15">-15</button>
            <button type="button" data-legacy="time-datetime-picker-btn" data-offset="-5">-5</button>
            <button type="button" data-legacy="time-datetime-picker-btn" data-offset="5">+5</button>
            <button type="button" data-legacy="time-datetime-picker-btn" data-offset="15">+15</button>
            <button type="button" data-legacy="time-datetime-picker-btn" data-offset="30">+30</button>
          </div>
          <div data-legacy="time-datetime-picker-buttons time-datetime-picker-action-btns">
            <button type="button" data-legacy="time-datetime-picker-btn" data-action="last">마지막</button>
            <button type="button" data-legacy="time-datetime-picker-btn" data-action="now">지금</button>
            <button type="button" data-legacy="time-datetime-picker-btn" data-action="eod">하루의 끝</button>
          </div>
        </div>
        <div data-legacy="time-datetime-picker-wheels">
          <div data-legacy="time-datetime-picker-column" data-col="date"></div>
          <div data-legacy="time-datetime-picker-column" data-col="ampm"></div>
          <div data-legacy="time-datetime-picker-column" data-col="hour"></div>
          <div data-legacy="time-datetime-picker-column" data-col="minute"></div>
        </div>
      </div>
    </div>
  `;
  taskLogModal.hidden = true;
  try {
    document.body.appendChild(taskLogModal);
  } catch (_) {
    el.appendChild(taskLogModal);
  }

  const taskLogPickerWrap = taskLogModal.querySelector(
    '[data-legacy~="time-datetime-picker-wrap"]',
  );
  const taskLogPickerBackdrop = taskLogModal.querySelector(
    '[data-legacy~="time-datetime-picker-backdrop"]',
  );

  function closeDateTimePicker() {
    if (taskLogPickerWrap) taskLogPickerWrap.hidden = true;
    if (taskLogPickerBackdrop) taskLogPickerBackdrop.hidden = true;
  }

  const taskLogTitleEl = taskLogModal.querySelector(
    '[data-legacy~="time-task-setup-title"]',
  );
  const taskLogFooterEl = taskLogModal.querySelector("[data-task-log-footer]");
  const taskLogTaskWrap = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-task-wrap"]',
  );
  const taskLogStartInput = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-start"]',
  );
  const taskLogEndInput = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-end"]',
  );
  const taskLogDateStart = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-date-start"]',
  );
  const taskLogTimeStart = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-time-start"]',
  );
  const taskLogTimeEnd = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-time-end"]',
  );
  const taskLogTimeOrderWarning = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-time-order-warning"]',
  );
  let taskLogEditTr = null;
  const taskLogEndWrap = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-datetime-wrap-end"]',
  );
  const taskLogFeedbackInput = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-feedback"]',
  );
  const taskLogMealDetailSection = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-meal-detail-section"]',
  );
  const taskLogMealDetailInput = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-meal-detail-input"]',
  );
  function updateTaskLogMealDetailVisibility(taskName) {
    const show = TTC.isMealDetailTaskName((taskName || "").trim());
    if (taskLogMealDetailSection) {
      taskLogMealDetailSection.hidden = !show;
      if (!show && taskLogMealDetailInput) taskLogMealDetailInput.value = "";
    }
  }
  let taskLogMemoTags = [];

  /* 메모 + 버튼 → 내부 모달 (레거시, 미사용) */
  const taskLogMemoAddBtn = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-memo-add-btn"]',
  );
  const taskLogMemoInnerModal = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-memo-inner-modal"]',
  );
  const taskLogMemoInnerBackdrop = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-memo-inner-backdrop"]',
  );
  const taskLogMemoInnerInput = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-memo-inner-input"]',
  );
  const taskLogMemoInnerTagInput = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-memo-inner-tag-input"]',
  );
  const taskLogMemoInnerTagList = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-memo-inner-tag-list"]',
  );
  const taskLogMemoInnerCancel = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-memo-inner-cancel"]',
  );
  const taskLogMemoInnerAdd = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-memo-inner-add"]',
  );

  let taskLogMemoModalTags = [];

  function renderMemoModalTagPills() {
    if (!taskLogMemoInnerTagList) return;
    taskLogMemoInnerTagList.innerHTML = "";
    taskLogMemoModalTags.forEach((tag, i) => {
      const pill = document.createElement("span");
      lpSetClasses(pill, "time-memo-tag-chip time-task-log-tag-pill");
      pill.innerHTML = `<span data-legacy="time-memo-tag-chip-text">${escapeHtml(tag)}</span><button type="button" data-legacy="time-memo-tag-chip-remove" aria-label="태그 삭제">&times;</button>`;
      pill
        .querySelector('[data-legacy~="time-memo-tag-chip-remove"]')
        ?.addEventListener("click", () => {
          taskLogMemoModalTags = taskLogMemoModalTags.filter(
            (_, idx) => idx !== i,
          );
          renderMemoModalTagPills();
        });
      taskLogMemoInnerTagList.appendChild(pill);
    });
  }

  function openMemoInnerModal() {
    if (taskLogMemoInnerModal) taskLogMemoInnerModal.hidden = false;
    if (taskLogMemoInnerInput)
      taskLogMemoInnerInput.value = taskLogFeedbackInput?.value || "";
    taskLogMemoModalTags = taskLogMemoTags.slice();
    renderMemoModalTagPills();
    if (taskLogMemoInnerTagInput) taskLogMemoInnerTagInput.value = "";
    taskLogMemoInnerInput?.focus();
  }

  function closeMemoInnerModal() {
    if (taskLogMemoInnerModal) taskLogMemoInnerModal.hidden = true;
  }

  taskLogMemoAddBtn?.addEventListener("click", openMemoInnerModal);
  taskLogMemoInnerCancel?.addEventListener("click", closeMemoInnerModal);

  taskLogMemoInnerAdd?.addEventListener("click", () => {
    if (taskLogFeedbackInput)
      taskLogFeedbackInput.value = (taskLogMemoInnerInput?.value || "").trim();
    taskLogMemoTags = taskLogMemoModalTags.slice();
    closeMemoInnerModal();
  });

  taskLogMemoInnerTagInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      if (e.isComposing) return;
      e.preventDefault();
      const val = (taskLogMemoInnerTagInput.value || "")
        .trim()
        .replace(/^#/, "");
      if (val && !taskLogMemoModalTags.includes(val)) {
        taskLogMemoModalTags.push(val);
        renderMemoModalTagPills();
        taskLogMemoInnerTagInput.value = "";
      }
    }
  });

  function formatTaskLogDateOverlayYmd(isoTen) {
    const m = String(isoTen || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    return `${m[1]}.${m[2]}.${m[3]}`;
  }

  function syncTaskLogDateOverlay() {
    if (!taskLogDateStart) return;
    let v = (taskLogDateStart.value || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const fromHidden = parseDateFromDateTime(
        String(taskLogStartInput?.value || "").trim(),
      );
      if (fromHidden) v = fromHidden;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) && !taskLogEditTr) {
      v = taskLogDefaultRecordYmd();
    }
    /* WebKit 등: programmatic value가 비어 보일 때 오버레이·hidden 기준으로 복구 */
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const cur = (taskLogDateStart.value || "").trim().slice(0, 10);
      if (cur !== v) taskLogDateStart.value = v;
    }
    const has = /^\d{4}-\d{2}-\d{2}$/.test(v);
    lpTokenToggle(taskLogDateStart, "time-task-log-date-has-value", has);
    const wrap = taskLogDateStart.closest(
      '[data-legacy~="time-task-log-date-native-wrap"]',
    );
    if (wrap?.classList) {
      lpTokenToggle(wrap, "time-task-log-date-native-wrap--has-value", has);
    }
    const ov = wrap?.querySelector?.(
      '[data-legacy~="time-task-log-date-overlay"]',
    );
    if (ov) ov.textContent = has ? formatTaskLogDateOverlayYmd(v) : "";
  }

  const normalizeHhMm = (val) => {
    if (!val || typeof val !== "string") return "";
    const m = val.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return val.trim();
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  };

  const autoFormatDigitsToHhMm = (val) => {
    const digits = (val || "").trim().replace(/\D/g, "");
    if (digits.length >= 4) {
      const h = Math.min(23, Math.max(0, parseInt(digits.slice(0, 2), 10)));
      const min = Math.min(59, Math.max(0, parseInt(digits.slice(2, 4), 10)));
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
    if (digits.length === 3) {
      const h = Math.min(9, Math.max(0, parseInt(digits[0], 10)));
      const min = Math.min(59, Math.max(0, parseInt(digits.slice(1), 10)));
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
    if (digits.length === 2) {
      const min = Math.min(59, Math.max(0, parseInt(digits, 10)));
      return `00:${String(min).padStart(2, "0")}`;
    }
    if (digits.length === 1) {
      return `00:0${digits}`;
    }
    return val.trim();
  };

  /** 과제 기록 모달: 기본 기록일은 오늘(로컬). 상단 피커 구간과 무관 — 과거·다른 날은 모달에서 날짜를 바꿈. */
  function taskLogDefaultRecordYmd() {
    return toDateStr(new Date());
  }

  /** 신규 기록: 캘린더 등에서 넘긴 `taskLogAddContext.recordDateKey`가 있으면 그날을 기록일로 씀. */
  function resolveTaskLogNewEntryRecordYmd() {
    const ctxYmd = String(taskLogAddContext?.recordDateKey || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(ctxYmd)) return ctxYmd;
    return taskLogDefaultRecordYmd();
  }

  /**
   * 기록일 YYYY-MM-DD — 모바일·PWA(WebKit)에서 type=date 값이 비는 경우가 있어
   * 숨은 시작값에서 날짜를 복구해 마감 hidden 이 비지 않게 함.
   */
  function taskLogResolveYmdForSync() {
    const fromDateInput = (taskLogDateStart?.value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromDateInput)) return fromDateInput;
    const fromStartHidden = parseDateFromDateTime(
      String(taskLogStartInput?.value || "").trim(),
    );
    if (fromStartHidden) return fromStartHidden;
    /* date 인풋·hidden 모두 비면 기록 기본일(오늘) */
    return taskLogDefaultRecordYmd();
  }

  /** 같은 날 기준: 마감 시각이 시작보다 이르면 경고 표시(과제 기록은 일당 하루). */
  function updateTaskLogTimeOrderWarning() {
    const el = taskLogTimeOrderWarning;
    if (!el) return;
    const startRaw = normalizeHhMm((taskLogTimeStart?.value || "").trim());
    const endRaw = normalizeHhMm((taskLogTimeEnd?.value || "").trim());
    if (!endRaw || !/^\d{1,2}:\d{2}$/.test(endRaw)) {
      el.hidden = true;
      return;
    }
    if (!startRaw || !/^\d{1,2}:\d{2}$/.test(startRaw)) {
      el.hidden = true;
      return;
    }
    const sm = parseLedgerTimeStringToMinutes(startRaw);
    const em = parseLedgerTimeStringToMinutes(endRaw);
    if (sm == null || em == null) {
      el.hidden = true;
      return;
    }
    el.hidden = em >= sm;
  }

  /**
   * 과제 기록: 날짜 인풋이 비었을 때 폴백 — hidden 파싱 → 오늘(피커와 무관).
   */
  function syncStartToHidden() {
    let date = (taskLogDateStart?.value || "").trim();
    const time = normalizeHhMm(taskLogTimeStart?.value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const prevHidden = String(taskLogStartInput?.value || "").trim();
      date = parseDateFromDateTime(prevHidden) || taskLogDefaultRecordYmd();
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && taskLogDateStart) {
        taskLogDateStart.value = date;
      }
    }
    if (date && time) {
      taskLogStartInput.value = `${date}T${time}`;
    } else if (date) {
      taskLogStartInput.value = `${date}T00:00`;
    } else {
      taskLogStartInput.value = "";
    }
    syncTaskLogDateOverlay();
    updateTaskLogTimeOrderWarning();
  }

  function syncEndToHidden() {
    const date = taskLogResolveYmdForSync();
    const time = normalizeHhMm(taskLogTimeEnd?.value || "");
    if (date && time) {
      taskLogEndInput.value = `${date}T${time}`;
      if (
        taskLogDateStart &&
        !String(taskLogDateStart.value || "").trim() &&
        /^\d{4}-\d{2}-\d{2}$/.test(date)
      ) {
        taskLogDateStart.value = date;
      }
    } else {
      taskLogEndInput.value = "";
    }
    updateEndTimeClearVisibility();
    syncTaskLogDateOverlay();
    updateTaskLogTimeOrderWarning();
  }

  function setStartFromDatetime(dtStr) {
    if (!dtStr || typeof dtStr !== "string") {
      taskLogDateStart.value = "";
      taskLogTimeStart.value = "";
      syncStartToHidden();
      syncTaskLogDateOverlay();
      return;
    }
    const s = dtStr.trim();
    const m = s.match(
      /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[T\s](\d{1,2}):(\d{2})/,
    );
    const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    const timeMatch = s.match(/[T\s](\d{1,2}):(\d{2})/);
    let dateStr = "";
    if (m) {
      dateStr = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
      taskLogTimeStart.value = `${String(parseInt(m[4], 10)).padStart(2, "0")}:${m[5]}`;
    } else if (m2 && timeMatch) {
      dateStr = `${m2[1]}-${String(m2[2]).padStart(2, "0")}-${String(m2[3]).padStart(2, "0")}`;
      taskLogTimeStart.value = `${String(parseInt(timeMatch[1], 10)).padStart(2, "0")}:${timeMatch[2]}`;
    } else if (m2) {
      dateStr = `${m2[1]}-${String(m2[2]).padStart(2, "0")}-${String(m2[3]).padStart(2, "0")}`;
      taskLogTimeStart.value = "";
    } else {
      taskLogTimeStart.value = "";
    }
    const ymd =
      dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? dateStr
        : taskLogDefaultRecordYmd();
    taskLogDateStart.value = ymd;
    syncStartToHidden();
  }

  function setEndFromDatetime(dtStr) {
    if (!dtStr || typeof dtStr !== "string") {
      taskLogTimeEnd.value = "";
      syncEndToHidden();
      return;
    }
    const m = dtStr.match(/[T\s](\d{1,2}):(\d{2})/);
    if (m) {
      taskLogTimeEnd.value = `${String(parseInt(m[1], 10)).padStart(2, "0")}:${m[2]}`;
    } else {
      taskLogTimeEnd.value = "";
    }
    syncEndToHidden();
  }

  function updateEndTimeClearVisibility() {
    const hasValue = (taskLogEndInput.value || "").trim().length > 0;
    if (taskLogEndWrap) lpTokenToggle(taskLogEndWrap, "has-value", hasValue);
  }

  const beforeInputTimeDigitsOnly = (e) => {
    const it = e.inputType || "";
    if (
      it === "deleteContentBackward" ||
      it === "deleteContentForward" ||
      it === "deleteByCut" ||
      it === "historyUndo" ||
      it === "historyRedo"
    ) {
      return;
    }
    const d = e.data;
    if (d == null || d === "") return;
    /* 숫자·콜론만 (한글·이모지·전각숫자 등은 input/compositionend에서도 제거) */
    if (/[^\d:]/.test(d)) {
      e.preventDefault();
    }
  };

  const sanitizeTaskLogTimeField = (el) => {
    if (!el) return;
    const raw = String(el.value || "");
    const cleaned = raw.replace(/[^\d:]/g, "");
    if (cleaned !== raw) el.value = cleaned;
  };

  const restrictToTimeChars = (e) => {
    if (
      [
        "Backspace",
        "Delete",
        "Tab",
        "Escape",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(e.key)
    )
      return;
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const input = e.target;
      const formatted =
        autoFormatDigitsToHhMm(input.value) || normalizeHhMm(input.value);
      input.value = formatted;
      input.blur();
      return;
    }
    if (!/^\d$/.test(e.key)) e.preventDefault();
  };

  const filterPastedTime = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData?.getData("text") || "").replace(/\D/g, "");
    const input = e.target;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const current = input.value;
    const newVal = current.slice(0, start) + pasted + current.slice(end);
    input.value = newVal;
    input.setSelectionRange(start + pasted.length, start + pasted.length);
    updateTaskLogTimeOrderWarning();
  };

  const taskLogFocusOutTargetIsTimeAdjustBtn = (ev) =>
    !!ev.relatedTarget?.closest?.(
      '[data-legacy~="time-task-log-time-adjust-btns"]',
    );

  [taskLogDateStart, taskLogTimeStart].forEach((el) => {
    el?.addEventListener("change", () => {
      syncStartToHidden();
      syncEndToHidden();
      const tn = taskLogTaskDropdown?._getValue?.() || "";
      if (tn) refreshKpiTodosInLogModal(tn);
    });
    el?.addEventListener("focusout", (ev) => {
      const skipEndSync = taskLogFocusOutTargetIsTimeAdjustBtn(ev);
      if (el === taskLogTimeStart) {
        const preformatted =
          autoFormatDigitsToHhMm(taskLogTimeStart.value) ||
          taskLogTimeStart.value;
        taskLogTimeStart.value = normalizeHhMm(preformatted) || preformatted;
      }
      syncStartToHidden();
      if (!skipEndSync) syncEndToHidden();
    });
  });
  taskLogDateStart?.addEventListener("input", syncTaskLogDateOverlay);
  taskLogTimeStart?.addEventListener("beforeinput", beforeInputTimeDigitsOnly);
  taskLogTimeStart?.addEventListener("input", () => {
    sanitizeTaskLogTimeField(taskLogTimeStart);
    updateTaskLogTimeOrderWarning();
  });
  taskLogTimeStart?.addEventListener("compositionend", (ev) => {
    sanitizeTaskLogTimeField(ev.target);
    updateTaskLogTimeOrderWarning();
  });
  taskLogTimeStart?.addEventListener("keydown", restrictToTimeChars);
  taskLogTimeStart?.addEventListener("paste", filterPastedTime);

  taskLogTimeEnd?.addEventListener("change", syncEndToHidden);
  taskLogTimeEnd?.addEventListener("focusout", (ev) => {
    if (taskLogFocusOutTargetIsTimeAdjustBtn(ev)) return;
    const preformatted =
      autoFormatDigitsToHhMm(taskLogTimeEnd.value) || taskLogTimeEnd.value;
    taskLogTimeEnd.value = normalizeHhMm(preformatted) || preformatted;
    syncEndToHidden();
  });
  taskLogTimeEnd?.addEventListener("beforeinput", beforeInputTimeDigitsOnly);
  taskLogTimeEnd?.addEventListener("input", () => {
    sanitizeTaskLogTimeField(taskLogTimeEnd);
    updateTaskLogTimeOrderWarning();
  });
  taskLogTimeEnd?.addEventListener("compositionend", (ev) => {
    sanitizeTaskLogTimeField(ev.target);
    updateTaskLogTimeOrderWarning();
  });
  taskLogTimeEnd?.addEventListener("keydown", restrictToTimeChars);
  taskLogTimeEnd?.addEventListener("paste", filterPastedTime);

  let lastFocusedTimeField = "end";
  [taskLogTimeStart, taskLogDateStart].forEach((el) => {
    if (!el) return;
    el.addEventListener("focus", () => {
      lastFocusedTimeField = "start";
    });
  });
  taskLogTimeEnd?.addEventListener("focus", () => {
    lastFocusedTimeField = "end";
  });

  let taskLogEditExclude = null;

  function setTaskLogQuickAdjustActive(btn) {
    taskLogModal
      .querySelectorAll('[data-legacy~="time-task-log-time-adjust-btn"]')
      .forEach((b) => {
        lpTokenToggle(
          b,
          "time-task-log-time-adjust-active",
          !!(btn && b === btn),
        );
      });
  }

  taskLogModal
    .querySelectorAll('[data-legacy~="time-task-log-time-adjust-btn"]')
    .forEach((btn) => {
      /* 데스크탑: 버튼으로 포커스가 빠지며 blur→syncEndToHidden이 먼저 돌아 마감 hidden이 비는 순서 경합 방지 */
      btn.addEventListener("mousedown", (e) => {
        if (e.button === 0) e.preventDefault();
      });
      btn.addEventListener("click", () => {
        const endVal = (taskLogTimeEnd?.value || "").trim();
        const endHasTime = endVal && endVal.match(/\d{1,2}:\d{2}/);
        /* 마감이 비어 있는데 날짜/시작만 포커스된 경우 lastFocused가 "start"로 남음 → 지금/마지막/±가 시작에만 들어가던 문제 방지 */
        const targetIsStart = lastFocusedTimeField === "start" && endHasTime;

        const startTimeVal = normalizeHhMm(
          (taskLogTimeStart?.value || "").trim(),
        );
        const startHasTime =
          startTimeVal && startTimeVal.match(/\d{1,2}:\d{2}/);
        const fallbackTime = startHasTime
          ? startTimeVal
          : `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;

        if (btn.dataset.last === "true") {
          const dateVal = (taskLogDateStart?.value || "").trim();
          const mergedRows = mergeLedgerRowsForDedupe(
            loadTimeRows(),
            Array.isArray(allRowsCache) ? allRowsCache : [],
          );
          const latest = getNextTaskLogStartHhMmFromLedger(
            dateVal,
            taskLogEditExclude,
            mergedRows,
          );
          if (!latest) {
            showToast("해당 날짜에 참고할 기록이 없습니다.", "info");
            return;
          }
          if (targetIsStart) {
            if (taskLogTimeStart) taskLogTimeStart.value = latest;
            syncStartToHidden();
          } else {
            if (taskLogTimeEnd) taskLogTimeEnd.value = latest;
            syncEndToHidden();
          }
          setTaskLogQuickAdjustActive(btn);
          return;
        }

        if (btn.dataset.dayEnd === "true") {
          if (taskLogTimeEnd) taskLogTimeEnd.value = "23:59";
          syncEndToHidden();
          setTaskLogQuickAdjustActive(btn);
          return;
        }

        if (btn.dataset.now === "true") {
          const newTime = `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;
          if (targetIsStart) {
            if (taskLogTimeStart) taskLogTimeStart.value = newTime;
            syncStartToHidden();
          } else {
            if (taskLogTimeEnd) taskLogTimeEnd.value = newTime;
            syncEndToHidden();
          }
          console.log("[lp-task-log]", "modal_quick_now", {
            targetIsStart,
            lastFocusedTimeField,
            endHasTime: Boolean(endHasTime),
            newTime,
            startVis: (taskLogTimeStart?.value || "").trim(),
            endVis: (taskLogTimeEnd?.value || "").trim(),
            startHidden: (taskLogStartInput?.value || "").trim().slice(0, 30),
            endHidden: (taskLogEndInput?.value || "").trim().slice(0, 30),
          });
          setTaskLogQuickAdjustActive(btn);
        } else {
          const delta = parseInt(btn.dataset.delta || "0", 10);
          const baseTime = targetIsStart
            ? startHasTime
              ? startTimeVal
              : fallbackTime
            : endHasTime
              ? normalizeHhMm(endVal)
              : startHasTime
                ? startTimeVal
                : fallbackTime;
          const normalized = normalizeHhMm(baseTime) || fallbackTime;
          const [h, min] = normalized
            .split(":")
            .map((n) => parseInt(n, 10) || 0);
          let totalMin = h * 60 + min + delta;
          totalMin = ((totalMin % 1440) + 1440) % 1440;
          const nh = Math.floor(totalMin / 60) % 24;
          const nmin = totalMin % 60;
          const newTime = `${String(nh).padStart(2, "0")}:${String(nmin).padStart(2, "0")}`;
          if (targetIsStart) {
            if (taskLogTimeStart) taskLogTimeStart.value = newTime;
            syncStartToHidden();
          } else {
            if (taskLogTimeEnd) taskLogTimeEnd.value = newTime;
            syncEndToHidden();
          }
          setTaskLogQuickAdjustActive(btn);
        }
      });
    });

  const taskLogKpiTodosSection = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-kpi-todos-section"]',
  );
  const taskLogKpiTodosList = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-kpi-todos-list"]',
  );
  const taskLogDailyTodosSection = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-daily-todos-section"]',
  );
  const taskLogDailyTodosList = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-daily-todos-list"]',
  );
  const taskLogSubmitBtn = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-submit"]',
  );
  const taskLogCloseBtn = taskLogModal.querySelector(
    '[data-legacy~="time-task-setup-panel"] [data-legacy~="time-task-setup-close"]',
  );

  /* 아코디언: 한 번에 하나만 열림, 열린 걸 다시 누르면 닫힘 */
  taskLogModal
    .querySelectorAll('[data-legacy~="time-task-log-accordion-header"]')
    .forEach((header) => {
      header.addEventListener("click", (e) => {
        if (e.target.closest("label")) return;
        const item = header.closest(
          '[data-legacy~="time-task-log-accordion-item"]',
        );
        if (!item) return;
        const body = item.querySelector(
          '[data-legacy~="time-task-log-accordion-body"]',
        );
        const chevron = item.querySelector(
          '[data-legacy~="time-task-log-accordion-chevron"]',
        );
        const isExpanded = lpTokenHas(item, "time-task-log-accordion-expanded");
        if (isExpanded) {
          lpTokenRemove(item, "time-task-log-accordion-expanded");
          header.setAttribute("aria-expanded", "false");
          if (chevron) chevron.textContent = "▶";
          if (body) body.hidden = true;
        } else {
          taskLogModal
            .querySelectorAll('[data-legacy~="time-task-log-accordion-item"]')
            .forEach((other) => {
              if (other === item) return;
              lpTokenRemove(other, "time-task-log-accordion-expanded");
              const otherHeader = other.querySelector(
                '[data-legacy~="time-task-log-accordion-header"]',
              );
              const otherBody = other.querySelector(
                '[data-legacy~="time-task-log-accordion-body"]',
              );
              const otherChevron = other.querySelector(
                '[data-legacy~="time-task-log-accordion-chevron"]',
              );
              if (otherHeader)
                otherHeader.setAttribute("aria-expanded", "false");
              if (otherBody) otherBody.hidden = true;
              if (otherChevron) otherChevron.textContent = "▶";
            });
          lpTokenAdd(item, "time-task-log-accordion-expanded");
          header.setAttribute("aria-expanded", "true");
          if (chevron) chevron.textContent = "▼";
          if (body) body.hidden = false;
          requestAnimationFrame(() => {
            item.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
        }
      });
    });
  taskLogModal
    .querySelectorAll(
      '[data-legacy~="time-task-log-accordion-item"]:not([data-legacy~="time-task-log-accordion-expanded"]) [data-legacy~="time-task-log-accordion-body"]',
    )
    .forEach((body) => {
      body.hidden = true;
    });
  taskLogModal
    .querySelectorAll(
      '[data-legacy~="time-task-log-accordion-item"]:not([data-legacy~="time-task-log-accordion-expanded"]) [data-legacy~="time-task-log-accordion-chevron"]',
    )
    .forEach((chevron) => {
      chevron.textContent = "▶";
    });

  let taskLogTaskDropdown = null;
  let taskLogAddContext = null;
  let pendingEditStartTime = "";

  function buildTaskDropdown() {
    return buildTimeTaskLogPickerDropdown({
      abortSignal: signal,
      onTaskSelected: onTaskSelectedForLog,
    });
  }

  const taskLogPickerTitle = taskLogPickerWrap?.querySelector(
    '[data-legacy~="time-datetime-picker-title"]',
  );

  function createDateTimePickerModal(getOtherValue, onConfirm) {
    const wrap = taskLogPickerWrap;
    const colDate = wrap.querySelector('[data-col="date"]');
    const colAmpm = wrap.querySelector('[data-col="ampm"]');
    const colHour = wrap.querySelector('[data-col="hour"]');
    const colMinute = wrap.querySelector('[data-col="minute"]');
    const confirmBtn = wrap.querySelector(
      '[data-legacy~="time-datetime-picker-confirm"]',
    );
    let currentD = new Date();
    let fieldType = "start";
    let lastEndTime = null;
    let lockedDate = null;
    let skipScrollSync = false;

    const AMPM = ["오전", "오후"];
    const HOURS_AM = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const HOURS_PM = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
    const MINUTES = Array.from({ length: 60 }, (_, i) => i);

    function toValue(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const h = d.getHours();
      const min = d.getMinutes();
      const ampm = h < 12 ? 0 : 1;
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${y}-${m}-${day}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }

    function parseValue(str) {
      if (!str || typeof str !== "string") return null;
      const m = str.match(
        /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[T\s]+(\d{1,2}):(\d{2})/,
      );
      if (m) {
        const [, y, mo, d, h, min] = m;
        return new Date(
          parseInt(y),
          parseInt(mo) - 1,
          parseInt(d),
          parseInt(h),
          parseInt(min),
          0,
          0,
        );
      }
      const m2 = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (m2) {
        const [, y, mo, d] = m2;
        return new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), 0, 0, 0, 0);
      }
      return null;
    }

    function enforceLockedDate() {
      if (fieldType !== "end" || !lockedDate) return;
      const ld = new Date(lockedDate);
      ld.setHours(0, 0, 0, 0);
      const cd = new Date(currentD);
      const currentDayStart = new Date(
        cd.getFullYear(),
        cd.getMonth(),
        cd.getDate(),
      );
      if (currentDayStart.getTime() !== ld.getTime()) {
        if (cd > ld) {
          currentD.setFullYear(ld.getFullYear(), ld.getMonth(), ld.getDate());
          currentD.setHours(23, 59, 0, 0);
        } else {
          currentD.setFullYear(ld.getFullYear(), ld.getMonth(), ld.getDate());
          currentD.setHours(0, 0, 0, 0);
        }
      }
    }

    function renderWheels() {
      const dates = [];
      const base = new Date(currentD);
      base.setHours(0, 0, 0, 0);
      for (let i = -14; i <= 14; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() + i);
        dates.push(d);
      }
      const ampmIdx = currentD.getHours() < 12 ? 0 : 1;
      const hour24 = currentD.getHours();
      const hoursArr = ampmIdx === 0 ? HOURS_AM : HOURS_PM;
      const min = currentD.getMinutes();

      function scrollOptionToCenter(container, element) {
        const targetY =
          element.offsetTop +
          element.offsetHeight / 2 -
          container.clientHeight / 2;
        container.scrollTop = Math.max(
          0,
          Math.min(targetY, container.scrollHeight - container.clientHeight),
        );
      }

      function renderColumn(container, items, selectedVal, format, addSpacers) {
        container.innerHTML = "";
        if (addSpacers) {
          const spacer = document.createElement("div");
          lpSetClasses(spacer, "time-datetime-picker-spacer");
          container.appendChild(spacer);
        }
        items.forEach((item) => {
          const div = document.createElement("div");
          lpSetClasses(div, "time-datetime-picker-option");
          div.textContent = typeof format === "function" ? format(item) : item;
          div.dataset.value = String(
            typeof item === "object"
              ? item instanceof Date
                ? item.getTime()
                : item
              : item,
          );
          if (String(selectedVal) === div.dataset.value)
            lpTokenAdd(div, "selected");
          div.addEventListener("click", () => {
            container
              .querySelectorAll('[data-legacy~="time-datetime-picker-option"]')
              .forEach((o) => lpTokenRemove(o, "selected"));
            lpTokenAdd(div, "selected");
            const needsScroll = container !== colAmpm;
            if (item instanceof Date) {
              currentD.setFullYear(
                item.getFullYear(),
                item.getMonth(),
                item.getDate(),
              );
            } else if (container === colAmpm) {
              const h = currentD.getHours();
              if (item === "오후" && h < 12) currentD.setHours(h + 12);
              else if (item === "오전" && h >= 12) currentD.setHours(h - 12);
              renderWheels();
            } else if (container === colHour) {
              currentD.setHours(item, currentD.getMinutes());
            } else if (container === colMinute) {
              currentD.setMinutes(item);
            }
            updateDisplay();
            if (needsScroll)
              requestAnimationFrame(() => scrollOptionToCenter(container, div));
          });
          container.appendChild(div);
        });
        if (addSpacers) {
          const spacer = document.createElement("div");
          lpSetClasses(spacer, "time-datetime-picker-spacer");
          container.appendChild(spacer);
        }
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const selDate = new Date(
        currentD.getFullYear(),
        currentD.getMonth(),
        currentD.getDate(),
      );
      function formatDateItem(d) {
        const dStart = new Date(d);
        dStart.setHours(0, 0, 0, 0);
        if (dStart.getTime() === todayStart.getTime()) return "오늘";
        const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
        return `${d.getMonth() + 1}월 ${d.getDate()}일 ${weekdays[d.getDay()]}`;
      }
      if (fieldType === "end") {
        colDate.style.display = "none";
      } else {
        colDate.style.display = "";
        renderColumn(colDate, dates, selDate.getTime(), formatDateItem, true);
      }
      renderColumn(colAmpm, AMPM, AMPM[ampmIdx], null, true);
      renderColumn(
        colHour,
        hoursArr,
        hour24,
        (h) => String(h).padStart(2, "0"),
        true,
      );
      renderColumn(
        colMinute,
        MINUTES,
        min,
        (m) => String(m).padStart(2, "0"),
        true,
      );

      const scrollToSelected = () => {
        [colDate, colAmpm, colHour, colMinute].forEach((col) => {
          const sel = col.querySelector(
            '[data-legacy~="time-datetime-picker-option"][data-legacy~="selected"]',
          );
          if (sel) {
            sel.scrollIntoView({
              block: "center",
              inline: "nearest",
              behavior: "auto",
            });
          }
        });
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToSelected();
        });
      });
      setTimeout(scrollToSelected, 50);
    }

    function getCenteredOption(col) {
      const opts = col.querySelectorAll(
        '[data-legacy~="time-datetime-picker-option"]',
      );
      if (!opts.length) return null;
      const centerY = col.scrollTop + col.clientHeight / 2;
      let best = opts[0];
      let bestDist = Infinity;
      opts.forEach((o) => {
        const oCenter = o.offsetTop + o.offsetHeight / 2;
        const d = Math.abs(oCenter - centerY);
        if (d < bestDist) {
          bestDist = d;
          best = o;
        }
      });
      return best;
    }

    function applyValueFromCenteredOption(col, option) {
      const val = option.dataset.value;
      if (col === colDate) {
        const t = parseInt(val, 10);
        if (!isNaN(t)) {
          const d = new Date(t);
          currentD.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
        }
      } else if (col === colAmpm) {
        const h = currentD.getHours();
        if (val === "오후" && h < 12) currentD.setHours(h + 12);
        else if (val === "오전" && h >= 12) currentD.setHours(h - 12);
      } else if (col === colHour) {
        const h = parseInt(val, 10);
        if (!isNaN(h)) currentD.setHours(h, currentD.getMinutes());
      } else if (col === colMinute) {
        const m = parseInt(val, 10);
        if (!isNaN(m)) currentD.setMinutes(m);
      }
    }

    function updateDisplay() {
      onConfirm?.(toValue(currentD));
    }

    function syncSelectionFromScroll(col) {
      if (skipScrollSync) return;
      const centered = getCenteredOption(col);
      if (!centered) return;
      col
        .querySelectorAll('[data-legacy~="time-datetime-picker-option"]')
        .forEach((o) => lpTokenRemove(o, "selected"));
      lpTokenAdd(centered, "selected");
      const prevAmpm = currentD.getHours() < 12 ? "오전" : "오후";
      applyValueFromCenteredOption(col, centered);
      if (col === colAmpm) {
        const newAmpm = currentD.getHours() < 12 ? "오전" : "오후";
        if (prevAmpm !== newAmpm) renderWheels();
      }
      updateDisplay();
    }

    [colDate, colAmpm, colHour, colMinute].forEach((col) => {
      col.addEventListener("scroll", () => syncSelectionFromScroll(col));
    });

    function applyOffset(mins) {
      currentD.setTime(currentD.getTime() + mins * 60 * 1000);
      enforceLockedDate();
      renderWheels();
      updateDisplay();
    }

    wrap
      .querySelectorAll('[data-legacy~="time-datetime-picker-btn"]')
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const offset = btn.dataset.offset;
          const action = btn.dataset.action;
          if (offset) {
            applyOffset(parseInt(offset, 10));
          } else if (action === "now") {
            if (fieldType === "end" && lockedDate) {
              const now = new Date();
              currentD.setHours(now.getHours(), now.getMinutes(), 0, 0);
              enforceLockedDate();
            } else {
              currentD = new Date();
            }
            console.log("[lp-task-log]", "bottom_picker_now", {
              fieldType,
              lockedDateYmd: lockedDate
                ? `${lockedDate.getFullYear()}-${String(lockedDate.getMonth() + 1).padStart(2, "0")}-${String(lockedDate.getDate()).padStart(2, "0")}`
                : null,
            });
            renderWheels();
            updateDisplay();
          } else if (action === "eod") {
            if (fieldType === "end" && lockedDate) {
              currentD.setFullYear(
                lockedDate.getFullYear(),
                lockedDate.getMonth(),
                lockedDate.getDate(),
              );
            }
            currentD.setHours(23, 59, 0, 0);
            enforceLockedDate();
            renderWheels();
            updateDisplay();
          } else if (action === "last" && lastEndTime) {
            const parsed = parseValue(lastEndTime);
            if (parsed) {
              currentD = parsed;
              renderWheels();
              updateDisplay();
            }
          }
        });
      });

    confirmBtn.addEventListener("click", () => {
      onConfirm?.(toValue(currentD));
      wrap.hidden = true;
      const backdrop = wrap
        .closest('[data-legacy~="time-task-log-panel"]')
        ?.querySelector('[data-legacy~="time-datetime-picker-backdrop"]');
      if (backdrop) backdrop.hidden = true;
    });

    return {
      show(initialValue, refDate, field, lastEnd) {
        fieldType = field || "start";
        lastEndTime = lastEnd || null;
        lockedDate = null;
        taskLogPickerTitle.textContent =
          fieldType === "start" ? "시작 시간" : "마감 시간";
        if (fieldType === "end" && refDate) {
          const startParsed = parseValue(refDate);
          if (startParsed) {
            lockedDate = new Date(
              startParsed.getFullYear(),
              startParsed.getMonth(),
              startParsed.getDate(),
            );
            const endParsed = parseValue(initialValue);
            if (endParsed) {
              currentD = new Date(lockedDate);
              currentD.setHours(
                endParsed.getHours(),
                endParsed.getMinutes(),
                0,
                0,
              );
            } else {
              currentD = new Date(startParsed);
              currentD.setMinutes(currentD.getMinutes() + 30);
            }
          } else {
            currentD = new Date();
          }
        } else {
          const parsed = parseValue(initialValue) || refDate || new Date();
          currentD = new Date(parsed);
        }
        skipScrollSync = true;
        renderWheels();
        wrap.hidden = false;
        const backdrop = wrap
          .closest('[data-legacy~="time-task-log-panel"]')
          ?.querySelector('[data-legacy~="time-datetime-picker-backdrop"]');
        if (backdrop) backdrop.hidden = false;
        setTimeout(() => {
          skipScrollSync = false;
        }, 150);
      },
    };
  }

  /** 과제 기록 모달: 선택 과제의 kpiId → 매일 할일 (이름 매칭 없음) */
  function getKpiDailyRepeatInfoForTaskLog(taskName) {
    const opt = getTaskOptionByName((taskName || "").trim());
    const kpiId = String(opt?.kpiId || "").trim();
    if (!kpiId) return null;
    return getKpiDailyRepeatInfoByKpiId(kpiId);
  }

  function onTaskSelectedForLog(taskName) {
    refreshKpiTodosInLogModal(taskName);
    updateTaskLogMealDetailVisibility(taskName);
  }

  function isHabitDailyTodoChecked(todo, completedList) {
    const tid = String(todo?.id || "").trim();
    const ttext = String(todo?.text || "").trim();
    return (completedList || []).some((x) => {
      const xid = String(x?.id || "").trim();
      const xtext = String(x?.text || "").trim();
      if (tid && xid && tid === xid) return true;
      if (ttext && xtext && ttext === xtext) return true;
      return false;
    });
  }

  function refreshKpiTodosInLogModal(taskName) {
    const name = (taskName || "").trim();
    if (taskLogKpiTodosSection) {
      taskLogKpiTodosSection.hidden = true;
      if (taskLogKpiTodosList) taskLogKpiTodosList.innerHTML = "";
    }

    if (!taskLogDailyTodosSection || !taskLogDailyTodosList) return;
    const taskLogDailyTodosTitle = taskLogModal.querySelector(
      '[data-legacy~="time-task-log-daily-todos-title"]',
    );
    const DEFAULT_DAILY_TODOS_TITLE = "매일 할일 목록";

    function normalizeTaskLogPickerDateYmd() {
      const raw = (taskLogDateStart?.value || "").trim();
      if (!raw) return "";
      const m = raw.match(/(\d{4})[.\-\s/]*(\d{1,2})[.\-\s/]*(\d{1,2})/);
      if (m)
        return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
      return raw.replace(/\//g, "-").slice(0, 10);
    }

    const dateYmd = normalizeTaskLogPickerDateYmd();
    const dailyInfo = getKpiDailyRepeatInfoForTaskLog(name);

    if (dailyInfo && dailyInfo.needHabitTracker) {
      if (taskLogDailyTodosTitle)
        taskLogDailyTodosTitle.textContent = DEFAULT_DAILY_TODOS_TITLE;
      taskLogDailyTodosSection.hidden = false;
      taskLogDailyTodosList.innerHTML = "";
      const {
        storageKey: dailyStorageKey,
        kpiId: dailyKpiId,
        dailyTodos,
      } = dailyInfo;
      const editRow = taskLogEditTr?._rowData;
      const ledgerEntryId = String(editRow?.id || "").trim();
      const fromRow = Array.isArray(editRow?.habitDailyCompleted)
        ? editRow.habitDailyCompleted
        : [];
      const fromLog =
        dateYmd.length >= 10
          ? getHabitTrackerDailyCompletedForLedgerEntry(
              dailyStorageKey,
              dailyKpiId,
              dateYmd,
              ledgerEntryId,
            )
          : [];
      const checkedSource = fromRow.length > 0 ? fromRow : fromLog;
      dailyTodos.forEach((todo) => {
        const label = document.createElement("label");
        lpSetClasses(
          label,
          "time-task-log-kpi-todo-row time-task-log-daily-todo-row",
        );
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = isHabitDailyTodoChecked(todo, checkedSource);
        checkbox.dataset.todoId = todo.id;
        const span = document.createElement("span");
        lpSetClasses(span, "time-task-log-kpi-todo-text");
        span.textContent = todo.text || "";
        if (checkbox.checked) lpTokenAdd(span, "is-done");
        label.appendChild(checkbox);
        label.appendChild(span);
        checkbox.addEventListener("change", () => {
          kpiTodoFineTrace("Time.과제기록모달:매일할일체크(저장은 기록 버튼)", {
            todoId: String(todo.id),
            storageKey: dailyStorageKey,
            checked: checkbox.checked,
          });
          const ymd = normalizeTaskLogPickerDateYmd();
          if (ymd.length < 10) return;
          /* KPI 맵은 「기록」 저장 시에만 반영 — X로 닫으면 체크만 무효 */
          lpTokenToggle(span, "is-done", checkbox.checked);
        });
        taskLogDailyTodosList.appendChild(label);
      });
      return;
    }

    taskLogDailyTodosSection.hidden = true;
    taskLogDailyTodosList.innerHTML = "";
    if (taskLogDailyTodosTitle)
      taskLogDailyTodosTitle.textContent = DEFAULT_DAILY_TODOS_TITLE;
  }

  function setupScoreButtons(container, getValue, setValue) {
    if (!container) return;
    container
      .querySelectorAll('[data-legacy~="time-task-log-score-btn"]')
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const val = btn.dataset.value || "";
          container
            .querySelectorAll('[data-legacy~="time-task-log-score-btn"]')
            .forEach((b) => lpTokenRemove(b, "selected"));
          if (getValue() === val) {
            setValue("");
          } else {
            setValue(val);
            lpTokenAdd(btn, "selected");
          }
        });
      });
  }
  function updateScoreBtnStates(container, value) {
    if (!container) return;
    container
      .querySelectorAll('[data-legacy~="time-task-log-score-btn"]')
      .forEach((b) => {
        lpTokenToggle(b, "selected", b.dataset.value === value);
      });
  }
  function parseEnergyToValue(val) {
    const s = String(val || "")
      .trim()
      .replace(/%/g, "");
    if (!s) return null;
    const n = parseInt(s.replace(/^\+/, ""), 10);
    if (!isNaN(n) && n >= -50 && n <= 50) return n;
    return null;
  }

  /**
   * 신규 과제 기록 모달: 오늘 날짜·오버레이 확정, 시작=해당일 마지막 마감(없으면 늦은 시작), 마감 입력 비움.
   * (type=date/WebKit 이슈 대비 인풋 값·value 속성·오버레이 문구를 모두 맞춤.)
   */
  function applyTaskLogModalDefaultsForNewEntry() {
    const ymd = resolveTaskLogNewEntryRecordYmd();
    const mergedRows = mergeLedgerRowsForDedupe(
      loadTimeRows(),
      Array.isArray(allRowsCache) ? allRowsCache : [],
    );
    const startHhMm =
      getNextTaskLogStartHhMmFromLedger(ymd, null, mergedRows) || "00:00";
    if (taskLogDateStart) {
      taskLogDateStart.value = ymd;
      try {
        taskLogDateStart.defaultValue = ymd;
      } catch (_) {}
      try {
        taskLogDateStart.setAttribute("value", ymd);
      } catch (_) {}
    }
    if (taskLogTimeStart) {
      taskLogTimeStart.value = startHhMm;
      try {
        taskLogTimeStart.defaultValue = startHhMm;
      } catch (_) {}
    }
    if (taskLogTimeEnd) {
      taskLogTimeEnd.value = "";
      try {
        taskLogTimeEnd.defaultValue = "";
      } catch (_) {}
    }
    if (taskLogEndInput) taskLogEndInput.value = "";
    const wrap = taskLogDateStart?.closest?.(
      '[data-legacy~="time-task-log-date-native-wrap"]',
    );
    const ov = wrap?.querySelector?.(
      '[data-legacy~="time-task-log-date-overlay"]',
    );
    if (ov && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      ov.textContent = formatTaskLogDateOverlayYmd(ymd);
    }
    syncStartToHidden();
    syncEndToHidden();
    syncTaskLogDateOverlay();
    updateEndTimeClearVisibility();
    try {
      taskLogDateStart?.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (_) {}
  }

  /** 과제설정 모달: 서버 과제 목록만 pull (업서트 없음). 시간 탭 진입 시에도 tabEnter 에서 pull. */
  async function pullTimeLedgerTasksWhenSetupModalOpens() {
    try {
      await pullTimeLedgerTasksFromSupabase();
    } catch (_) {}
    try {
      patchKpiLinkedTasksFromKpiMaps();
      getFullTaskOptions();
      migrateTimeLogRowsTaskIds();
    } catch (_) {}
  }

  /**
   * 과제 기록/수정 모달: KPI 탭 미방문 상태에서도 매일 할일이 비지 않게 서버와 맞춤.
   */
  async function ensureTaskLogModalCloudData() {
    await Promise.all([
      pullTimeLedgerTasksFromSupabase().catch(() => {}),
      pullKpiMapsForTaskLogModalOpen().catch(() => {}),
    ]);
    try {
      patchKpiLinkedTasksFromKpiMaps();
      getFullTaskOptions();
      migrateTimeLogRowsTaskIds();
    } catch (_) {}
  }

  /** 기록 모달이 이미 열린 뒤 서버 과제 목록이 도착했을 때 드롭다운·KPI 연동만 맞춤(즉시 열기용). */
  function afterTaskListSyncForTaskLogAddModal() {
    if (!el.isConnected || taskLogModal?.hidden) return;
    const v = (taskLogTaskDropdown?._getValue?.() || "").trim();
    if (v) onTaskSelectedForLog(v);
    else {
      const preset = taskLogAddContext?.ledgerBucketPreset;
      let mainTasks = getFullTaskOptions().filter(
        (t) => !(t.name || "").includes(" > "),
      );
      if (preset)
        mainTasks = mainTasks.filter((t) =>
          taskAllowedForLedgerPreset(t, preset),
        );
      const first = mainTasks[0]?.name || "";
      if (first) {
        taskLogTaskDropdown?._setValue?.(first);
        onTaskSelectedForLog(first);
      }
    }
  }

  function openTaskLogModal(addContext) {
    /** pull 완료를 기다려 모달을 늦추면(느린망 ~1초) 체감 지연 → 먼저 열고 동기화는 비동기 */
    openTaskLogModalAfterPull(addContext);
    afterTaskListSyncForTaskLogAddModal();
    void ensureTaskLogModalCloudData()
      .catch(() => {})
      .then(() => {
        if (!el.isConnected || taskLogModal.hidden) return;
        afterTaskListSyncForTaskLogAddModal();
      });
  }

  function openTaskLogModalAfterPull(addContext) {
    taskLogAddContext = addContext;
    taskLogEditTr = null;
    taskLogEditExclude = null;
    pendingEditStartTime = "";
    taskLogTitleEl.textContent = "과제 기록";
    taskLogSubmitBtn.textContent = "기록";
    if (taskLogFooterEl) taskLogFooterEl.style.display = "";
    if (taskLogDeleteBtn) taskLogDeleteBtn.hidden = true;
    taskLogModal.hidden = false;
    document.body.style.overflow = "hidden";
    closeDateTimePicker();
    const bodyEl = taskLogModal.querySelector(
      '[data-legacy~="time-task-setup-body"]',
    );
    if (bodyEl) bodyEl.scrollTop = 0;
    if (!taskLogTaskDropdown) {
      taskLogTaskDropdown = buildTaskDropdown();
      taskLogTaskWrap.innerHTML = "";
      taskLogTaskWrap.appendChild(taskLogTaskDropdown);
    }
    taskLogTaskDropdown._setLedgerBucketPreset?.(
      addContext?.ledgerBucketPreset ?? null,
    );
    const taskDropdownPanel = taskLogTaskDropdown?.querySelector(
      '[data-legacy~="time-task-log-task-dropdown-panel"]',
    );
    if (taskDropdownPanel) taskDropdownPanel.hidden = true;
    const presetAdd = addContext?.ledgerBucketPreset;
    let pickTasks = getFullTaskOptions().filter(
      (t) => !(t.name || "").includes(" > "),
    );
    if (presetAdd)
      pickTasks = pickTasks.filter((t) =>
        taskAllowedForLedgerPreset(t, presetAdd),
      );
    const firstTask = pickTasks[0]?.name || "";
    if (taskLogFeedbackInput) taskLogFeedbackInput.value = "";
    if (taskLogMealDetailInput) taskLogMealDetailInput.value = "";
    taskLogMemoTags = [];
    taskLogModal
      .querySelectorAll('[data-legacy~="time-task-log-accordion-item"]')
      .forEach((item) => {
        if (
          !lpTokenHas(item, "time-task-log-accordion-expanded") ||
          item.dataset?.accordion === "expense"
        )
          return;
        lpTokenRemove(item, "time-task-log-accordion-expanded");
        const body = item.querySelector(
          '[data-legacy~="time-task-log-accordion-body"]',
        );
        const chevron = item.querySelector(
          '[data-legacy~="time-task-log-accordion-chevron"]',
        );
        const header = item.querySelector(
          '[data-legacy~="time-task-log-accordion-header"]',
        );
        if (body) body.hidden = true;
        if (chevron) chevron.textContent = "▶";
        if (header) header.setAttribute("aria-expanded", "false");
      });
    if (taskLogKpiTodosSection) taskLogKpiTodosSection.hidden = true;
    if (taskLogKpiTodosList) taskLogKpiTodosList.innerHTML = "";
    applyTaskLogModalDefaultsForNewEntry();
    taskLogTaskDropdown._setValue?.(firstTask);
    requestAnimationFrame(() => {
      applyTaskLogModalDefaultsForNewEntry();
      requestAnimationFrame(() => {
        applyTaskLogModalDefaultsForNewEntry();
      });
    });
    setTimeout(() => {
      if (!el.isConnected || taskLogModal.hidden) return;
      applyTaskLogModalDefaultsForNewEntry();
    }, 0);
    setTaskLogQuickAdjustActive(
      taskLogModal.querySelector(
        '[data-legacy~="time-task-log-time-adjust-last"]',
      ),
    );
  }

  function openTaskLogModalForEdit(tr, rowData) {
    const data =
      tr?._rowData && typeof tr._rowData === "object" ? tr._rowData : rowData;
    let startTime = data.startTime || "";
    let endTime = data.endTime || "";
    const rowDateEl = tr?.querySelector('[data-legacy~="time-display-date"]');
    const displayDateStr = (rowDateEl?.textContent || "").trim();
    const recordDate =
      normalizeDateForCompare(displayDateStr) ||
      normalizeDateForCompare(data.date || "");

    if (recordDate) {
      if (startTime) {
        const startDate = parseDateFromDateTime(startTime);
        if (!startDate || normalizeDateForCompare(startDate) !== recordDate) {
          const m = startTime.match(/[T\s](\d{1,2}):(\d{2})/);
          const [, h = "00", min = "00"] = m || [];
          startTime = `${recordDate}T${String(h).padStart(2, "0")}:${min}`;
        }
      } else {
        startTime = `${recordDate}T00:00`;
      }
      if (endTime) {
        const endDate = parseDateFromDateTime(endTime);
        const normEnd = normalizeDateForCompare(endDate);
        if (!normEnd || normEnd !== recordDate) {
          const m = endTime.match(/[T\s](\d{1,2}):(\d{2})/);
          const [, h = "00", min = "00"] = m || [];
          endTime = `${recordDate}T${String(h).padStart(2, "0")}:${min}`;
        }
      }
    }

    taskLogAddContext = null;
    taskLogEditTr = tr;
    const recKey =
      recordDate ||
      normalizeDateForCompare(data.date || "") ||
      String(data.date || "")
        .trim()
        .replace(/\//g, "-")
        .slice(0, 10);
    taskLogEditExclude = {
      id: String(data.id || "").trim(),
      composite: `${recKey}|${(data.taskName || "").trim()}|${(data.startTime || "").trim()}`,
    };
    pendingEditStartTime = startTime || "";
    taskLogTitleEl.textContent = "과제 수정";
    taskLogSubmitBtn.textContent = "수정";
    if (taskLogFooterEl) taskLogFooterEl.style.display = "";
    if (taskLogDeleteBtn) taskLogDeleteBtn.hidden = false;
    setTaskLogQuickAdjustActive(null);
    const recordDateYmd =
      recordDate ||
      normalizeDateForCompare(data.date || "") ||
      String(data.date || "")
        .trim()
        .replace(/\//g, "-")
        .slice(0, 10);
    const tnForDaily = (data.taskName || "").trim();
    const dailyInfoForEdit = getKpiDailyRepeatInfoForTaskLog(tnForDaily);
    const dailyCompletedBeforeCloudPull =
      dailyInfoForEdit?.needHabitTracker && recordDateYmd.length >= 10
        ? (Array.isArray(data.habitDailyCompleted) &&
          data.habitDailyCompleted.length > 0
            ? data.habitDailyCompleted
            : getHabitTrackerDailyCompletedForLedgerEntry(
                dailyInfoForEdit.storageKey,
                dailyInfoForEdit.kpiId,
                recordDateYmd,
                String(data.id || "").trim(),
              ))
        : [];
    function restoreDailyCompletedIfCloudPullWiped(taskName, ledgerEntryId) {
      if (!dailyCompletedBeforeCloudPull.length) return;
      const info = getKpiDailyRepeatInfoForTaskLog((taskName || "").trim());
      if (!info?.needHabitTracker) return;
      const raw = (taskLogDateStart?.value || "").trim();
      const m = raw.match(/(\d{4})[.\-\s/]*(\d{1,2})[.\-\s/]*(\d{1,2})/);
      const ymd = m
        ? `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`
        : recordDateYmd;
      if (ymd.length < 10) return;
      const afterPull = getHabitTrackerDailyCompletedForLedgerEntry(
        info.storageKey,
        info.kpiId,
        ymd,
        String(ledgerEntryId || "").trim(),
      );
      const rowStill = Array.isArray(taskLogEditTr?._rowData?.habitDailyCompleted)
        ? taskLogEditTr._rowData.habitDailyCompleted
        : [];
      if (afterPull.length === 0 && rowStill.length === 0) {
        replaceHabitTrackerLogDailyCompleted(
          info.storageKey,
          info.kpiId,
          ymd,
          dailyCompletedBeforeCloudPull,
          isUuid(ledgerEntryId) ? ledgerEntryId : undefined,
        );
        if (taskLogEditTr?._rowData) {
          taskLogEditTr._rowData.habitDailyCompleted = [
            ...dailyCompletedBeforeCloudPull,
          ];
        }
      }
    }
    taskLogModal.hidden = false;
    document.body.style.overflow = "hidden";
    closeDateTimePicker();
    const bodyEl = taskLogModal.querySelector(
      '[data-legacy~="time-task-setup-body"]',
    );
    if (bodyEl) bodyEl.scrollTop = 0;
    if (!taskLogTaskDropdown) {
      taskLogTaskDropdown = buildTaskDropdown();
      taskLogTaskWrap.innerHTML = "";
      taskLogTaskWrap.appendChild(taskLogTaskDropdown);
    }
    taskLogTaskDropdown._setLedgerBucketPreset?.(null);
    taskLogTaskDropdown._setValue?.(data.taskName || "");
    setStartFromDatetime(startTime || "");
    setEndFromDatetime(endTime || "");
    updateEndTimeClearVisibility();
    let mealDetailVal = String(data.mealDetail || "").trim();
    let feedbackRaw = String(data.feedback || "").trim();
    const tnForMemo = (data.taskName || "").trim();
    if (TTC.isMealDetailTaskName(tnForMemo)) {
      if (!mealDetailVal && feedbackRaw.startsWith("[식단] ")) {
        const sp = splitUnhealthyMealMemoFromDb(feedbackRaw);
        mealDetailVal = sp.mealDetail;
        feedbackRaw = sp.feedback;
      }
    }
    const memoOnly = feedbackRaw.replace(/#[^\s#]+/g, "").trim();
    if (taskLogMealDetailInput) taskLogMealDetailInput.value = mealDetailVal;
    if (taskLogFeedbackInput) taskLogFeedbackInput.value = memoOnly;
    const rawMemoTagsForEdit = Array.isArray(data.memoTags)
      ? [...data.memoTags]
      : parseTagsFromFeedback(feedbackRaw);
    taskLogMemoTags = userMemoTagsFromLedgerRaw(rawMemoTagsForEdit)
      .map((t) => String(t ?? "").trim())
      .filter(Boolean);
    const tnSync = tnForDaily;
    refreshKpiTodosInLogModal(tnSync);
    const lockedName = tnForDaily;
    if (taskLogTaskDropdown && lockedName) {
      taskLogTaskDropdown._setValue?.(lockedName);
      refreshKpiTodosInLogModal(lockedName);
    }
    updateTaskLogMealDetailVisibility((data.taskName || "").trim());
    syncTaskLogDateOverlay();
    void ensureTaskLogModalCloudData()
      .catch(() => {})
      .then(() => {
        if (!el.isConnected || taskLogModal.hidden) return;
        try {
          getFullTaskOptions();
          migrateTimeLogRowsTaskIds();
        } catch (_) {}
        const tnPost = tnForDaily;
        restoreDailyCompletedIfCloudPullWiped(tnPost, data.id);
        refreshKpiTodosInLogModal(tnPost);
        if (taskLogTaskDropdown && tnPost) {
          taskLogTaskDropdown._setValue?.(tnPost);
          refreshKpiTodosInLogModal(tnPost);
        }
        updateTaskLogMealDetailVisibility(tnPost);
      });
  }

  function closeTaskLogModal() {
    taskLogModal.hidden = true;
    if (taskLogFooterEl) taskLogFooterEl.style.display = "none";
    closeDateTimePicker();
    const taskDropdownPanel = taskLogTaskDropdown?.querySelector(
      '[data-legacy~="time-task-log-task-dropdown-panel"]',
    );
    if (taskDropdownPanel) taskDropdownPanel.hidden = true;
    taskLogModal.style.zIndex = "";
    document.body.style.overflow = "";
    taskLogAddContext = null;
    taskLogEditTr = null;
    taskLogEditExclude = null;
    pendingEditStartTime = "";
  }

  /** 기록 버튼: blur 없이 바로 누르면 숫자만 입력된 시각이 hidden에 반영되지 않을 수 있음 → blur와 동일 포맷 후 동기화 */
  function flushTaskLogTimeInputsBeforeSubmit() {
    if (taskLogTimeStart) {
      const raw = taskLogTimeStart.value || "";
      const preformatted = autoFormatDigitsToHhMm(raw) || raw;
      taskLogTimeStart.value = normalizeHhMm(preformatted) || preformatted;
    }
    if (taskLogTimeEnd) {
      const raw = taskLogTimeEnd.value || "";
      const preformatted = autoFormatDigitsToHhMm(raw) || raw;
      taskLogTimeEnd.value = normalizeHhMm(preformatted) || preformatted;
    }
    syncStartToHidden();
    syncEndToHidden();
    const endVisNorm = normalizeHhMm(
      (taskLogTimeEnd?.value || "").trim(),
    ).trim();
    const endHid = (taskLogEndInput?.value || "").trim();
    if (endVisNorm && /^\d{1,2}:\d{2}$/.test(endVisNorm) && !endHid) {
      syncEndToHidden();
    }
  }

  taskLogSubmitBtn.addEventListener("click", () => {
    flushTaskLogTimeInputsBeforeSubmit();
    console.log("[lp-task-log]", "submit_click", {
      mode: taskLogEditTr ? "edit" : taskLogAddContext ? "add" : "none",
    });

    const editTr = taskLogEditTr;
    const addCtx = taskLogAddContext;
    let addLedgerTr = null;
    let oldRowDataToRemove = null;

    const taskName = (taskLogTaskDropdown?._getValue?.() || "").trim();
    const startRaw = (taskLogStartInput.value || "").trim();
    let endRaw = (taskLogEndInput.value || "").trim();
    const endVisibleGuard =
      normalizeHhMm((taskLogTimeEnd?.value || "").trim()) || "";
    if (!endRaw && endVisibleGuard && /^\d{1,2}:\d{2}$/.test(endVisibleGuard)) {
      syncEndToHidden();
      endRaw = (taskLogEndInput.value || "").trim();
    }
    if (!taskName || !startRaw) {
      console.warn("[lp-task-log]", "submit_abort", {
        reason: "missing_task_or_start",
        hasTaskName: Boolean(taskName),
        hasStartRaw: Boolean(startRaw),
      });
      alert("과제 선택과 시작 시간을 입력해 주세요.");
      return;
    }
    let startTime = formatDateTimeInput(startRaw) || startRaw;
    let endTime = formatDateTimeInput(endRaw) || endRaw;
    if (startTime && endTime) {
      endTime = mergeEndTimeWithStartDate(startTime, endTime) || endTime;
    }
    if (
      endVisibleGuard &&
      /^\d{1,2}:\d{2}$/.test(endVisibleGuard) &&
      !String(endTime || "").trim()
    ) {
      console.warn("[lp-task-log]", "submit_abort", {
        reason: "end_visible_not_in_hidden",
        endVisibleGuard,
        endRaw,
        endTime,
      });
      showToast(
        "마감 시간이 반영되지 않았습니다. 「지금」을 한 번 더 누른 뒤 저장해 주세요.",
        "warn",
      );
      return;
    }
    const feedbackBody = (taskLogFeedbackInput?.value || "").trim();
    const mealDetailForRow = TTC.isMealDetailTaskName(taskName)
      ? (taskLogMealDetailInput?.value || "").trim()
      : "";
    const feedback = feedbackBody;
    const userTagsForSubmit = (
      Array.isArray(taskLogMemoTags) ? taskLogMemoTags : []
    )
      .map((t) => String(t ?? "").trim())
      .filter(Boolean);
    const memoTags = buildLedgerMemoTagsForSubmit(userTagsForSubmit);
    const timeTracked = (() => {
      if (startTime && endTime) {
        const toIso = (str) => {
          const m = str.match(
            /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[T\s]+(\d{1,2}):(\d{2})/,
          );
          if (m)
            return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:00`;
          return str.replace(" ", "T") + ":00";
        };
        const s = new Date(toIso(startTime));
        const e = new Date(toIso(endTime));
        const diff = (e - s) / (1000 * 60 * 60);
        if (diff > 0) return formatHoursToHHMM(diff);
      }
      return "";
    })();
    const opt = taskName ? getTaskOptionByName(taskName) : null;
    let productivity =
      opt?.productivity || (addCtx?.productivity ?? "productive");
    let category = opt?.category || "";
    if (TTC.isNapBuiltinTaskName(taskName) && timeTracked) {
      const nap = getNapCategoryProductivity(timeTracked);
      category = nap.category;
      productivity = nap.productivity;
    }
    const dateStr = parseDateFromDateTime(startTime) || toDateStr(new Date());
    const focusValue = "";

    if (editTr) {
      oldRowDataToRemove = editTr._rowData ? { ...editTr._rowData } : null;
      const prevRow = editTr._rowData || {};
      const optTask = taskName ? getTaskOptionByName(taskName) : null;
      const tidRow = String((optTask?.id || prevRow.taskId || "").trim());
      const prevId = String(prevRow.id || "").trim();
      const newRowData = {
        id: isUuid(prevId)
          ? prevId
          : typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        taskId: isUuid(tidRow) ? tidRow : "",
        taskName,
        startTime,
        endTime,
        timeTracked,
        productivity,
        category,
        date: dateStr,
        feedback,
        mealDetail: mealDetailForRow,
        memoTags,
        linkedExpenseIds: [],
        focus: focusValue,
        habitDailyCompleted: Array.isArray(prevRow.habitDailyCompleted)
          ? prevRow.habitDailyCompleted
          : [],
      };
      editTr._rowData = newRowData;
      const isMobileCard = lpTokenHas(editTr, "time-ledger-mobile-card");
      if (!isMobileCard) {
        const dispTask = editTr.querySelector(
          '[data-legacy~="time-display-task"]',
        );
        if (dispTask) dispTask.textContent = taskName;
        const prodBarEl = editTr.querySelector(
          '[data-legacy~="time-task-prod-bar"]',
        );
        if (prodBarEl) {
          lpTokenRemove(prodBarEl, "time-task-prod-bar--productive");
          lpTokenRemove(prodBarEl, "time-task-prod-bar--nonproductive");
          lpTokenRemove(prodBarEl, "time-task-prod-bar--other");
          lpTokenAdd(
            prodBarEl,
            productivity === "productive"
              ? "time-task-prod-bar--productive"
              : productivity === "nonproductive"
                ? "time-task-prod-bar--nonproductive"
                : "time-task-prod-bar--other",
          );
        }
        const dispStart = editTr.querySelector(
          '[data-legacy~="time-display-start"]',
        );
        if (dispStart)
          dispStart.textContent = startTime
            ? toDisplayTimeOnly(startTime) || startTime
            : "";
        const dispEnd = editTr.querySelector(
          '[data-legacy~="time-display-end"]',
        );
        if (dispEnd)
          dispEnd.textContent = formatTimeLedgerEndCellDisplay(
            startTime,
            endTime,
          );
        const dispTracked = editTr.querySelector(
          '[data-legacy~="time-display-tracked"]',
        );
        if (dispTracked) dispTracked.textContent = timeTracked;
        const dispFeedback = editTr.querySelector(
          '[data-legacy~="time-display-feedback"]',
        );
        if (dispFeedback) dispFeedback.textContent = feedback;
        const memoTagCell = editTr.querySelector(
          '[data-legacy~="time-cell-memo-tag"] [data-legacy~="time-display-memo-tags"]',
        );
        if (memoTagCell) {
          memoTagCell.innerHTML = "";
          getMemoTagDisplayTextsForLedgerRow(newRowData).forEach((tag) => {
            const pill = document.createElement("span");
            lpSetClasses(pill, "time-memo-tag-pill");
            pill.textContent = tag;
            memoTagCell.appendChild(pill);
          });
        }
        const catPill = editTr.querySelector(
          '[data-legacy~="time-cell-category"] [data-legacy~="time-tag-pill"]',
        );
        if (catPill) {
          catPill.textContent = getCategoryLabel(category) || "—";
          lpSetClasses(
            catPill,
            "time-tag-pill cat " + getCategoryColor(category),
          );
        }
        const prodOpt = PRODUCTIVITY_OPTIONS.find(
          (o) => o.value === productivity,
        );
        const prodPill = editTr.querySelector(
          '[data-legacy~="time-cell-productivity"] [data-legacy~="time-tag-pill"]',
        );
        if (prodPill) {
          prodPill.textContent = prodOpt ? prodOpt.label : "";
          lpSetClasses(
            prodPill,
            "time-tag-pill prod " + (prodOpt ? prodOpt.color : ""),
          );
        }
        const dispDate = editTr.querySelector(
          '[data-legacy~="time-display-date"]',
        );
        if (dispDate)
          dispDate.textContent = dateStr ? formatDateDisplay(dateStr) : "";
        editTr._updatePrice?.();
      }
    } else if (addCtx) {
      const ctx = addCtx;
      const optAdd = taskName ? getTaskOptionByName(taskName) : null;
      const tidAdd = String((optAdd?.id || "").trim());
      const newRowData = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        taskId: isUuid(tidAdd) ? tidAdd : "",
        taskName,
        startTime,
        endTime,
        timeTracked,
        productivity: ctx.productivity || productivity,
        category,
        date: dateStr,
        feedback,
        mealDetail: mealDetailForRow,
        memoTags,
        linkedExpenseIds: [],
        focus: focusValue,
        habitDailyCompleted: [],
      };
      const tr = createRow(
        newRowData,
        ctx.onRowUpdate,
        ctx.viewEl,
        ctx.handleRowDelete,
        ctx.handleRowEdit,
      );
      addLedgerTr = tr;
      if (ctx.addRow) ctx.tbody.insertBefore(tr, ctx.addRow);
      else ctx.tbody.appendChild(tr);
      /* DOM과 동일 객체를 캐시에 둠(createRow가 정규화한 행 = 저장·서버 push 기준) */
      allRowsCache.push(tr._rowData);
      ctx.onRowUpdate?.();
    }

    if (editTr || addCtx) {
      if (editTr && oldRowDataToRemove) {
        const { next } = removeTimeLedgerRowFromRows(
          allRowsCache,
          oldRowDataToRemove,
        );
        allRowsCache = next;
        const isMobileCardEdit = lpTokenHas(editTr, "time-ledger-mobile-card");
        if (isMobileCardEdit && editTr._rowData) {
          allRowsCache.push(editTr._rowData);
        }
      }
      const dailyInfoSubmit = getKpiDailyRepeatInfoForTaskLog(taskName);
      const hasCheckedInUi = Boolean(
        taskLogDailyTodosList?.querySelector(
          'label[data-legacy~="time-task-log-daily-todo-row"] input[type="checkbox"]:checked',
        ),
      );
      if (
        dailyInfoSubmit?.needHabitTracker &&
        taskLogDailyTodosList &&
        ((timeTracked || "").trim() || hasCheckedInUi)
      ) {
        const completed = [];
        taskLogDailyTodosList
          .querySelectorAll(
            'label[data-legacy~="time-task-log-daily-todo-row"]',
          )
          .forEach((label) => {
            const cb = label.querySelector('input[type="checkbox"]');
            const span = label.querySelector(
              '[data-legacy~="time-task-log-kpi-todo-text"]',
            );
            const id =
              cb && cb.dataset && cb.dataset.todoId ? cb.dataset.todoId : "";
            const text =
              span && span.textContent ? span.textContent.trim() : "";
            if (!id) return;
            if (cb && cb.checked) completed.push({ id, text });
          });
        const dateRawStr = (dateStr || "")
          .toString()
          .replace(/\//g, "-")
          .replace(/\s/g, "");
        const m = dateRawStr.match(/(\d{4})[.\-\s]*(\d{1,2})[.\-\s]*(\d{1,2})/);
        const normalizedDateRaw = m
          ? `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`
          : dateRawStr.slice(0, 10);
        if (normalizedDateRaw.length >= 10) {
          const habitLedgerId = String(
            (editTr?._rowData?.id || addLedgerTr?._rowData?.id || "").trim(),
          );
          replaceHabitTrackerLogDailyCompleted(
            dailyInfoSubmit.storageKey,
            dailyInfoSubmit.kpiId,
            normalizedDateRaw,
            completed,
            isUuid(habitLedgerId) ? habitLedgerId : undefined,
          );
          if (editTr?._rowData) {
            editTr._rowData.habitDailyCompleted = completed;
          }
          if (addLedgerTr?._rowData) {
            addLedgerTr._rowData.habitDailyCompleted = completed;
          }
        }
      }
      if (addCtx) requestUsageListScrollToBottomOnce();
      onFilterChange();
      saveTimeRows(getFullRowsForFilter(true));
    } else {
      console.warn("[lp-task-log]", "submit_no_row_context", {
        taskName: (taskName || "").slice(0, 80),
        note: "editTr·addCtx 없음 — 시간 행 저장·갱신 블록 스킵",
      });
    }
    console.log("[lp-task-log]", "submit_finished", {
      savedLedgerRow: Boolean(editTr || addCtx),
      taskName: (taskName || "").slice(0, 80),
    });
    closeTaskLogModal();
    el._updateTotal?.();
  });

  /* 배경 탭으로 닫지 않음 — 실수로 터치 시 저장 없이 닫혀 기록이 안 남는 문제 방지 (닫기는 ×·Esc만) */
  taskLogCloseBtn?.addEventListener("click", closeTaskLogModal);

  const taskLogDeleteBtn = taskLogModal.querySelector(
    '[data-legacy~="time-task-log-delete-btn"]',
  );
  taskLogDeleteBtn?.addEventListener("click", async () => {
    const tr = taskLogEditTr;
    if (!tr) return;
    const ok = await showConfirmModal({
      title: "시간 기록 삭제",
      message: "이 시간 기록을 삭제할까요?",
      warnMessage: "삭제 후에는 복구할 수 없습니다.",
      confirmText: "삭제",
      cancelText: "취소",
      confirmDanger: true,
    });
    if (!ok) return;
    const rowData = tr._rowData || collectRowFromTR(tr);
    if (tr._onRowDelete) tr._onRowDelete(tr, rowData);
    closeTaskLogModal();
  });

  const closeBtn = taskSetupModal.querySelector(
    '[data-legacy~="time-task-setup-close"]',
  );
  const addTaskBtn = taskSetupModal.querySelector(
    '[data-legacy~="time-task-add-btn"]',
  );
  const setupTabs = taskSetupModal.querySelectorAll(
    '[data-legacy~="time-task-setup-tab"]',
  );
  const setupListAll = taskSetupModal.querySelector('[data-tab-content="all"]');
  const setupListProd = taskSetupModal.querySelector(
    '[data-tab-content="productive"]',
  );
  const setupListNonProd = taskSetupModal.querySelector(
    '[data-tab-content="nonproductive"]',
  );
  const setupListOther = taskSetupModal.querySelector(
    '[data-tab-content="other"]',
  );
  const setupSubcatBar = taskSetupModal.querySelector("[data-subcat-bar]");

  const addTaskCloseBtn = addTaskModal.querySelector(
    '[data-legacy~="time-task-setup-close"]',
  );
  const addTaskNameInput = addTaskModal.querySelector(
    '[data-legacy~="time-add-task-name"]',
  );
  const addTaskProdRadios = addTaskModal.querySelectorAll(
    'input[name="addProd"]',
  );
  const addTaskCatProd = addTaskModal.querySelector(
    '[data-legacy~="time-add-task-categories"][data-for="productive"]',
  );
  const addTaskCatNonProd = addTaskModal.querySelector(
    '[data-legacy~="time-add-task-categories"][data-for="nonproductive"]',
  );
  const addTaskSubmitBtn = addTaskModal.querySelector(
    '[data-legacy~="time-add-task-submit"]',
  );
  const addTaskModalTitle = addTaskModal.querySelector(
    '[data-legacy~="time-task-setup-title"]',
  );
  const addTaskDeleteBtn = addTaskModal.querySelector(
    '[data-legacy~="time-add-task-delete"]',
  );

  function renderCategoryButtons(container, categories) {
    container.innerHTML = "";
    categories.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      lpSetClasses(btn, "lp-choice-chip");
      btn.textContent = c.label;
      btn.dataset.value = c.value;
      container.appendChild(btn);
    });
  }
  renderCategoryButtons(addTaskCatProd, PRODUCTIVE_CATEGORIES);
  renderCategoryButtons(addTaskCatNonProd, NONPRODUCTIVE_CATEGORIES);

  function setAddTaskModalFieldsLocked(locked) {
    addTaskNameInput.disabled = locked;
    addTaskProdRadios.forEach((r) => {
      r.disabled = locked;
    });
    const chips = [
      ...addTaskCatProd.querySelectorAll('[data-legacy~="lp-choice-chip"]'),
      ...addTaskCatNonProd.querySelectorAll('[data-legacy~="lp-choice-chip"]'),
    ];
    chips.forEach((b) => {
      if (locked) {
        b.disabled = true;
        lpTokenAdd(b, "time-add-task-choice--locked");
      } else {
        b.disabled = false;
        lpTokenRemove(b, "time-add-task-choice--locked");
      }
    });
  }

  const ALL_CATEGORIES = [
    ...PRODUCTIVE_CATEGORIES,
    ...NONPRODUCTIVE_CATEGORIES,
    { value: "work", label: "근무", color: "cat-work" },
    { value: "sleep", label: "수면", color: "cat-sleep" },
  ];

  let selectedSubcat = "";
  let activeSetupTab = "all";
  /** 과제 수정 모달이 열려 있을 때 리스트에서 강조할 과제명 */
  let setupListSelectedTaskName = "";

  function renderSubcatButtons(prodType) {
    if (!setupSubcatBar) return;
    if (prodType !== "productive" && prodType !== "nonproductive") {
      setupSubcatBar.style.display = "none";
      selectedSubcat = "";
      return;
    }
    selectedSubcat = "";
    const categories =
      prodType === "productive"
        ? [{ value: "", label: "전체" }, ...PRODUCTIVE_CATEGORIES]
        : [{ value: "", label: "전체" }, ...NONPRODUCTIVE_CATEGORIES];
    setupSubcatBar.innerHTML = "";
    categories.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      lpSetClasses(
        btn,
        "time-task-setup-subcat-btn" +
          (c.value === selectedSubcat ? " active" : ""),
      );
      btn.textContent = c.label;
      btn.dataset.subcat = c.value;
      if (c.color) lpTokenAdd(btn, c.color);
      btn.addEventListener("click", () => {
        selectedSubcat = c.value;
        setupSubcatBar
          .querySelectorAll('[data-legacy~="time-task-setup-subcat-btn"]')
          .forEach((b) => lpTokenRemove(b, "active"));
        lpTokenAdd(btn, "active");
        renderTaskSetupList();
      });
      setupSubcatBar.appendChild(btn);
    });
    setupSubcatBar.style.display = "flex";
  }

  function renderTaskSetupList() {
    const allTasks = getFullTaskOptions();
    const mainTasksOnly = allTasks.filter(
      (t) => !(t.name || "").includes(" > "),
    );
    let prodTasks = mainTasksOnly.filter(
      (t) => t.productivity === "productive",
    );
    let nonProdTasks = mainTasksOnly.filter(
      (t) => t.productivity === "nonproductive",
    );
    const otherTasks = mainTasksOnly.filter(
      (t) =>
        t.productivity === "other" ||
        !["productive", "nonproductive"].includes(t.productivity),
    );
    if (activeSetupTab === "productive" && selectedSubcat) {
      prodTasks = prodTasks.filter((t) => t.category === selectedSubcat);
    }
    if (activeSetupTab === "nonproductive" && selectedSubcat) {
      nonProdTasks = nonProdTasks.filter((t) => t.category === selectedSubcat);
    }
    const getCatLabel = (v) =>
      ALL_CATEGORIES.find((c) => c.value === v)?.label ||
      CATEGORY_OPTIONS.find((c) => c.value === v)?.label ||
      v ||
      "—";
    const lockedForDisplay = getLockedForSetupDisplay();
    function renderList(container, list) {
      container.innerHTML = "";
      list.forEach((t) => {
        const fromKpi = isTimeTaskKpiLinked(t);
        const isLocked = fromKpi || lockedForDisplay.has(t.name);
        const catLabel = getCatLabel(t.category);
        const row = document.createElement("div");
        const isRowSelected =
          Boolean(setupListSelectedTaskName) &&
          setupListSelectedTaskName === t.name;
        lpSetClasses(
          row,
          "time-task-setup-item" +
            (isLocked
              ? " time-task-setup-item--locked"
              : " time-task-setup-item--editable") +
            (isRowSelected ? " time-task-setup-item--selected" : ""),
        );
        const nameEsc = (t.name || "").replace(/</g, "&lt;");
        const iconSrc = getTimeTaskListIconSrc(t.name, {
          category: t.category,
          productivity: t.productivity,
          iconKey: t.iconKey,
        });
        const iconBlock = iconSrc
          ? `<span data-legacy="time-task-setup-item-icon-wrap"><img data-legacy="time-task-setup-item-icon" src="${iconSrc}" alt="" loading="eager" decoding="sync" /></span>`
          : "";
        const builtinBadge = isTimeTaskBuiltinTemplate(t)
          ? `<span data-legacy="lp-task-badge lp-task-badge--builtin" title="앱에서 제공하는 기본 과제입니다. 과제 설정에서 삭제할 수 없습니다.">기본</span>`
          : "";
        const kpiBadge = fromKpi
          ? `<span data-legacy="lp-task-badge lp-task-badge--kpi" title="KPI(맵)에서 연결된 과제입니다">KPI</span>`
          : "";
        row.innerHTML = `
          ${iconBlock}
          <span data-legacy="time-task-setup-item-title">
            <span data-legacy="time-task-setup-item-name">${nameEsc}</span>
            ${builtinBadge}${kpiBadge}
          </span>
          <span data-legacy="time-task-setup-item-cat">${catLabel}</span>
        `;
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.addEventListener("click", () => {
          void openAddTaskModal(t);
        });
        row.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            row.click();
          }
        });
        container.appendChild(row);
      });
      if (list.length === 0) {
        const empty = document.createElement("div");
        lpSetClasses(empty, "time-task-setup-empty");
        empty.textContent = "등록된 과제가 없습니다";
        container.appendChild(empty);
      }
    }
    renderList(setupListAll, mainTasksOnly);
    renderList(setupListProd, prodTasks);
    renderList(setupListNonProd, nonProdTasks);
    renderList(setupListOther, otherTasks);
  }

  let selectedCategory = "";
  function syncAddTaskSubmitState() {
    const name = (addTaskNameInput.value || "").trim();
    const editName = (addTaskNameInput.dataset.editName || "").trim();
    if (editName && isTaskIconOnlyEditLocked(getTaskOptionByName(editName))) {
      addTaskSubmitBtn.disabled = false;
      return;
    }
    addTaskSubmitBtn.disabled = !(name && selectedCategory);
  }
  function openAddTaskModal(editTask) {
    if (!el.isConnected) return;
    addTaskModal.hidden = false;
    setupListSelectedTaskName = editTask ? editTask.name : "";
    const isEdit = Boolean(editTask);
    const iconOnlyLocked = isEdit && isTaskIconOnlyEditLocked(editTask);
    if (addTaskModalTitle) {
      addTaskModalTitle.textContent = isEdit ? "과제 수정" : "과제 추가";
    }
    addTaskSubmitBtn.textContent = isEdit ? "저장" : "추가";
    if (addTaskDeleteBtn) {
      const deleteLocked = isEdit && isTaskDeleteLockedInSetup(editTask);
      addTaskDeleteBtn.hidden = !isEdit;
      addTaskDeleteBtn.disabled = deleteLocked;
      addTaskDeleteBtn.title = deleteLocked
        ? getTaskDeleteLockedInSetupMessage(editTask)
        : "";
      addTaskDeleteBtn.setAttribute(
        "aria-disabled",
        deleteLocked ? "true" : "false",
      );
    }
    setAddTaskModalFieldsLocked(iconOnlyLocked);
    addTaskNameInput.value = editTask ? editTask.name : "";
    addTaskNameInput.dataset.editName = editTask ? editTask.name : "";
    const prod =
      editTask &&
      (editTask.productivity === "productive" ||
        editTask.productivity === "nonproductive")
        ? editTask.productivity
        : "productive";
    addTaskModal.querySelector(
      `input[name="addProd"][value="${prod}"]`,
    ).checked = true;
    selectedCategory = editTask ? editTask.category : "";
    addTaskCatProd.style.display = prod === "productive" ? "" : "none";
    addTaskCatNonProd.style.display = prod === "nonproductive" ? "" : "none";
    addTaskCatProd
      .querySelectorAll('[data-legacy~="lp-choice-chip"]')
      .forEach((b) =>
        lpTokenToggle(
          b,
          "lp-choice-chip--on",
          b.dataset.value === selectedCategory,
        ),
      );
    addTaskCatNonProd
      .querySelectorAll('[data-legacy~="lp-choice-chip"]')
      .forEach((b) =>
        lpTokenToggle(
          b,
          "lp-choice-chip--on",
          b.dataset.value === selectedCategory,
        ),
      );
    syncAddTaskSubmitState();
    if (editTask) {
      addTaskIconPicker.setSelectedKey(editTask.iconKey || "");
    } else {
      addTaskIconPicker.reset();
    }
    renderTaskSetupList();
    if (iconOnlyLocked) {
      addTaskModal
        .querySelector('[data-legacy~="time-add-task-icon-picker-mount"] button')
        ?.focus?.();
    } else {
      addTaskNameInput.focus();
    }
  }

  function closeAddTaskModal() {
    addTaskModal.hidden = true;
    setupListSelectedTaskName = "";
    setAddTaskModalFieldsLocked(false);
    if (addTaskDeleteBtn) {
      addTaskDeleteBtn.disabled = false;
      addTaskDeleteBtn.title = "";
      addTaskDeleteBtn.setAttribute("aria-disabled", "false");
    }
    renderTaskSetupList();
  }

  addTaskNameInput.addEventListener("input", syncAddTaskSubmitState);

  addTaskProdRadios.forEach((r) => {
    r.addEventListener("change", () => {
      const prod = r.value;
      addTaskCatProd.style.display = prod === "productive" ? "" : "none";
      addTaskCatNonProd.style.display = prod === "nonproductive" ? "" : "none";
      selectedCategory = "";
      addTaskCatProd
        .querySelectorAll('[data-legacy~="lp-choice-chip"]')
        .forEach((b) => lpTokenRemove(b, "lp-choice-chip--on"));
      addTaskCatNonProd
        .querySelectorAll('[data-legacy~="lp-choice-chip"]')
        .forEach((b) => lpTokenRemove(b, "lp-choice-chip--on"));
      syncAddTaskSubmitState();
    });
  });
  addTaskCatProd
    .querySelectorAll('[data-legacy~="lp-choice-chip"]')
    .forEach((b) => {
      b.addEventListener("click", () => {
        addTaskCatProd
          .querySelectorAll('[data-legacy~="lp-choice-chip"]')
          .forEach((x) => lpTokenRemove(x, "lp-choice-chip--on"));
        lpTokenAdd(b, "lp-choice-chip--on");
        selectedCategory = b.dataset.value;
        syncAddTaskSubmitState();
      });
    });
  addTaskCatNonProd
    .querySelectorAll('[data-legacy~="lp-choice-chip"]')
    .forEach((b) => {
      b.addEventListener("click", () => {
        addTaskCatNonProd
          .querySelectorAll('[data-legacy~="lp-choice-chip"]')
          .forEach((x) => lpTokenRemove(x, "lp-choice-chip--on"));
        lpTokenAdd(b, "lp-choice-chip--on");
        selectedCategory = b.dataset.value;
        syncAddTaskSubmitState();
      });
    });

  addTaskSubmitBtn.addEventListener("click", () => {
    const name = (addTaskNameInput.value || "").trim();
    const editName = (addTaskNameInput.dataset.editName || "").trim();
    const iconKey = addTaskIconPicker.getSelectedKey();
    if (editName && isTaskIconOnlyEditLocked(getTaskOptionByName(editName))) {
      updateTaskOptionIconByName(editName, iconKey);
      closeAddTaskModal();
      renderTaskSetupList();
      return;
    }
    if (!name || !selectedCategory) {
      return;
    }
    const prod =
      addTaskModal.querySelector('input[name="addProd"]:checked')?.value ||
      "productive";
    if (editName) {
      updateTaskOption(editName, {
        name,
        category: selectedCategory,
        productivity: prod,
        memo: "",
        iconKey,
      });
    } else {
      addTaskOptionFull({
        name,
        category: selectedCategory,
        productivity: prod,
        memo: "",
        iconKey,
      });
    }
    closeAddTaskModal();
  });

  addTaskDeleteBtn?.addEventListener("click", async () => {
    const editName = (addTaskNameInput.dataset.editName || "").trim();
    if (!editName || addTaskDeleteBtn.disabled) {
      return;
    }
    const editTask = getTaskOptionByName(editName);
    if (editTask && isTaskDeleteLockedInSetup(editTask)) {
      alert(getTaskDeleteLockedInSetupMessage(editTask));
      return;
    }
    if (!(await removeTaskOption(editName))) {
      alert(MSG_TIME_TASK_KPI_LINKED);
      return;
    }
    closeAddTaskModal();
  });

  syncAddTaskSubmitState();

  addTaskBtn?.addEventListener("click", () => void openAddTaskModal(null));
  /* 과제 추가/수정 모달도 배경 탭으로 닫지 않음(저장 전 이탈 방지) */
  addTaskCloseBtn?.addEventListener("click", closeAddTaskModal);

  setupTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setupTabs.forEach((t) => lpTokenRemove(t, "active"));
      lpTokenAdd(tab, "active");
      const which = tab.dataset.tab;
      activeSetupTab = which;
      setupListAll.style.display = which === "all" ? "" : "none";
      setupListProd.style.display = which === "productive" ? "" : "none";
      setupListNonProd.style.display = which === "nonproductive" ? "" : "none";
      setupListOther.style.display = which === "other" ? "" : "none";
      renderSubcatButtons(which);
      renderTaskSetupList();
    });
  });

  taskSetupBtn?.addEventListener("click", () => {
    void (async () => {
      await pullTimeLedgerTasksWhenSetupModalOpens();
      if (!el.isConnected) return;
      taskSetupModal.hidden = false;
      document.body.style.overflow = "hidden";
      activeSetupTab =
        taskSetupModal.querySelector(
          '[data-legacy~="time-task-setup-tab"][data-legacy~="active"]',
        )?.dataset?.tab || "all";
      selectedSubcat = "";
      renderSubcatButtons(activeSetupTab);
      renderTaskSetupList();
    })();
  });
  function closeTaskSetupModal() {
    taskSetupModal.hidden = true;
    document.body.style.overflow = "";
    closeAddTaskModal();
  }
  /* 과제 설정 모달: 배경 탭으로 닫지 않음 */
  closeBtn?.addEventListener("click", closeTaskSetupModal);
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      if (!taskLogPickerWrap.hidden) {
        closeDateTimePicker();
        e.preventDefault();
        return;
      }
      /* 과제 기록 모달 안 중첩 UI가 열려 있으면 Esc/백키로 메인까지 닫지 않고 해당 레이어만 닫음 */
      if (!taskLogModal.hidden) {
        if (focusModal && !focusModal.hidden) {
          closeFocusModal();
          e.preventDefault();
          return;
        }
        if (taskLogMemoInnerModal && !taskLogMemoInnerModal.hidden) {
          closeMemoInnerModal();
          e.preventDefault();
          return;
        }
        closeTaskLogModal();
        e.preventDefault();
        return;
      }
      if (!addTaskModal.hidden) {
        closeAddTaskModal();
        e.preventDefault();
        return;
      }
      if (!taskSetupModal.hidden) {
        closeTaskSetupModal();
        e.preventDefault();
      }
    },
    { signal },
  );

  const contentWrap = document.createElement("div");
  lpSetClasses(contentWrap, "time-view-content-wrap");
  el.appendChild(contentWrap);

  bindLpHorizontalPanNavigate(contentWrap, {
    signal,
    onNext: () => shiftUsageHistoryDay(1),
    onPrev: () => shiftUsageHistoryDay(-1),
    shouldIgnoreTarget: (target) =>
      !!target?.closest?.(
        "input, textarea, select, button, a, [role='dialog'], .time-task-setup-modal",
      ),
    lockMs: 400,
  });

  let allRowsCache = loadTimeRows();
  let cachedRows = [];

  logTabSync("time_tab_hydrate", {});
  allRowsCache = loadTimeRows();
  cachedRows = getFullRowsForFilter(true);

  function mergeRowsIntoCache() {
    const fromDom = collectRowsFromDOM(contentWrap);
    const seen = new Set();
    fromDom.forEach((r) => {
      if (isEmptyTimeRow(r)) return;
      const k = `${r.date}|${r.taskName}|${r.startTime}`;
      const idx = allRowsCache.findIndex(
        (c) => `${c.date}|${c.taskName}|${c.startTime}` === k,
      );
      if (idx >= 0) allRowsCache[idx] = r;
      else if (!seen.has(k)) {
        seen.add(k);
        allRowsCache.push(r);
      }
    });
  }

  function getFullRowsForFilter(skipMerge = false) {
    if (!skipMerge) mergeRowsIntoCache();
    return [...allRowsCache];
  }

  function updateTotal() {
    const allTable = contentWrap.querySelector(
      '[data-legacy~="time-ledger-container"] [data-legacy~="time-ledger-table"]',
    );
    const allTfoot = allTable?.querySelector("tfoot");
    if (allTable && allTfoot) {
      const tbody = allTable.querySelector("tbody");
      let totalHrs = 0;
      tbody?.querySelectorAll('[data-legacy~="time-row"]').forEach((tr) => {
        const timeEl =
          tr.querySelector('[data-legacy~="time-input-tracked"]') ||
          tr.querySelector('[data-legacy~="time-display-tracked"]');
        const val = (timeEl?.value ?? timeEl?.textContent ?? "").trim();
        totalHrs += parseTimeToHours(val) || 0;
      });
      const overHrs = totalHrs > 24 ? totalHrs - 24 : 0;
      const overRow = allTfoot.querySelector(
        '[data-legacy~="time-ledger-over-row"]',
      );
      if (overRow)
        lpTokenToggle(overRow, "time-ledger-over-row-visible", overHrs > 0);
      const totalOverEl = allTfoot.querySelector(
        '[data-legacy~="time-ledger-total-over"]',
      );
      if (totalOverEl) {
        totalOverEl.textContent =
          overHrs > 0 ? formatHoursDisplay(overHrs) : "";
        lpTokenToggle(totalOverEl, "has-over", overHrs > 0);
      }
    }

    contentWrap
      .querySelectorAll('[data-legacy~="time-section"]')
      .forEach((section) => {
        const tbody = section.querySelector("tbody");
        const tfoot = section.querySelector("tfoot");
        const summaryTracked = tfoot?.querySelector(
          '[data-legacy~="time-section-summary-tracked"]',
        );
        const summaryPrice = tfoot?.querySelector(
          '[data-legacy~="time-section-summary-price"]',
        );
        if (!tbody || !summaryTracked || !summaryPrice) return;
        const prod = section.dataset.productivity || "";
        const hourlyRate =
          parseFloat(
            String(
              el.querySelector('[data-legacy~="time-hourly-input"]')?.value ||
                "0",
            ).replace(/,/g, ""),
          ) || 0;
        let totalHrs = 0;
        let totalPrice = 0;
        tbody.querySelectorAll('[data-legacy~="time-row"]').forEach((tr) => {
          const timeEl =
            tr.querySelector('[data-legacy~="time-input-tracked"]') ||
            tr.querySelector('[data-legacy~="time-display-tracked"]');
          const val = (timeEl?.value ?? timeEl?.textContent ?? "").trim();
          const hrs = parseTimeToHours(val) || 0;
          totalHrs += hrs;
          const pv = (tr._rowData?.productivity || prod || "").trim();
          let price = hrs * hourlyRate;
          if (pv === "nonproductive") price *= -1;
          else if (pv === "other" || pv === "그 외" || !pv) price = 0;
          totalPrice += price;
        });
        summaryTracked.textContent =
          totalHrs > 0 ? formatHoursDisplay(totalHrs) : "";
        const prodSlot =
          prod === "productive"
            ? "productive"
            : prod === "nonproductive"
              ? "nonproductive"
              : "other";
        summaryPrice.textContent = formatTimeLedgerActionPriceDisplay(
          totalPrice,
          prodSlot,
        );
        lpSetClasses(
          summaryPrice,
          "time-section-summary-price" +
            (totalPrice < 0
              ? " is-negative"
              : totalPrice > 0
                ? " is-positive"
                : ""),
        );
      });

    mergeRowsIntoCache();
  }
  el._updateTotal = updateTotal;

  const tableWrap = document.createElement("div");
  lpSetClasses(tableWrap, "time-ledger-table-wrap");
  const table = document.createElement("table");
  lpSetClasses(table, "time-ledger-table");
  table.innerHTML = createTableHTML();

  const taskTh = table.querySelector('[data-legacy~="time-th-task"]');
  const taskCol = table.querySelector('[data-legacy~="time-col-task"]');

  if (taskTh && taskCol) {
    const resizer = document.createElement("div");
    lpSetClasses(resizer, "time-col-resizer");
    resizer.title = "드래그하여 너비 조절";
    taskTh.appendChild(resizer);

    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = taskTh.getBoundingClientRect().width;
      const onMove = (moveE) => {
        const dx = moveE.clientX - startX;
        const newWidth = Math.max(80, Math.min(500, startWidth + dx));
        taskCol.style.width = `${newWidth}px`;
        taskCol.style.minWidth = `${newWidth}px`;
        updateStickyLefts(table);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        updateStickyLefts(table);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    });
    requestAnimationFrame(() => updateStickyLefts(table));
  }

  updateTotal();

  function rescueTimeFilterControlsToFilterBar() {}

  /** 시간 기록(전체) 카드 목록: 행 기준일 YYYY-MM-DD */
  function timeLedgerRowYmd(r) {
    return ledgerRowDateYmdForFilter(r);
  }

  function timeLedgerFilterSpansMultipleDays() {
    const s = usageHistoryRangeStartYmd;
    const e = usageHistoryRangeEndYmd;
    return !!(s && e && s !== e);
  }

  /** 날짜 구간이 이틀 이상이거나, 화면에 실제로 이틀 이상의 기록이 있을 때 일자 헤더 표시 */
  function timeLedgerShouldShowDayGroups(rows) {
    if (!rows.length) return false;
    if (timeLedgerFilterSpansMultipleDays()) return true;
    const set = new Set();
    for (const r of rows) {
      const y = timeLedgerRowYmd(r);
      if (y) set.add(y);
    }
    return set.size > 1;
  }

  function timeLedgerGroupRowsByDay(sortedRows) {
    const groups = [];
    for (const r of sortedRows) {
      const key = timeLedgerRowYmd(r) || "_nodate";
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.rows.push(r);
      else groups.push({ key, rows: [r] });
    }
    return groups;
  }

  function sumTimeLedgerDayHours(dayRows) {
    let s = 0;
    for (const r of dayRows) {
      s += getMobileCardEffectiveHoursForPrice(r);
    }
    return s;
  }

  /** 사용내역 목록 — 진입·날짜 변경 시 1회만 맨 아래(최근 기록)로 스크롤 */
  function requestUsageListScrollToBottomOnce() {
    el._lpUsageListScrollToBottomPending = true;
  }

  function applyUsageListScrollToBottomIfPending(cardsWrap) {
    if (!cardsWrap || !el._lpUsageListScrollToBottomPending) return;
    el._lpUsageListScrollToBottomPending = false;
    const scrollToBottom = () => {
      if (!cardsWrap.isConnected) return;
      cardsWrap.scrollTop = cardsWrap.scrollHeight;
    };
    /* DOM 붙인 직후 동기 스크롤 — rAF 2회만 쓰면 위 화면이 잠깐 보임 */
    scrollToBottom();
    requestAnimationFrame(scrollToBottom);
  }

  function renderAll(rows = []) {
    clearTimeLedgerMobileElapsedTimer(el);
    rescueTimeFilterControlsToFilterBar();
    try {
      delete el._lpTaskLogModalLedgerRefs;
    } catch (_) {}
    contentWrap.innerHTML = "";

    const handleCardDelete = (card, rowData) => {
      card.remove();
      updateTotal();
      if (!rowData) return;
      const entryId = String(rowData?.id || "").trim();
      void (async () => {
        if (entryId) {
          removeKpiHabitLogsForTimeLedgerEntry(entryId);
          timeLedgerSyncLog("ui_time_row_delete", {
            idPreview: `${entryId.slice(0, 8)}…`,
          });
          await deleteTimeLedgerEntryFromSupabase(entryId);
        }
        const { next } = removeTimeLedgerRowFromRows(allRowsCache, rowData);
        allRowsCache = next;
        saveTimeRows(allRowsCache);
      })();
    };
    const handleCardEdit = (card, rowData) => {
      openTaskLogModalForEdit(card, rowData);
    };

    const hiddenTableWrap = document.createElement("div");
    lpSetClasses(hiddenTableWrap, "time-ledger-mobile-hidden-table");
    hiddenTableWrap.style.cssText =
      "position:absolute;left:-62.5rem;width:0.0625rem;height:0.0625rem;overflow:hidden;";
    const hiddenTable = document.createElement("table");
    lpSetClasses(hiddenTable, "time-ledger-table");
    hiddenTable.innerHTML = createTableHTML();
    const hiddenTbody = hiddenTable.querySelector("tbody");
    hiddenTableWrap.appendChild(hiddenTable);
    contentWrap.appendChild(hiddenTableWrap);

    const cardsWrap = document.createElement("div");
    lpSetClasses(cardsWrap, "time-ledger-mobile-cards");
    const timelineWrap = document.createElement("div");
    timelineWrap.className =
      "diary-tab5-ledger-log-wrap calendar-1day-timeline-wrap";
    const timelineList = document.createElement("div");
    timelineList.className = "calendar-1day-timeline-list";
    timelineWrap.appendChild(timelineList);
    cardsWrap.appendChild(timelineWrap);
    const showDayGroups = timeLedgerShouldShowDayGroups(rows);
    const appendCardTo = (parent, d) => {
      const card = createMobileTimeCard(
        d,
        handleCardEdit,
        handleCardDelete,
        el,
      );
      card._onRowDelete = handleCardDelete;
      parent.appendChild(card);
    };

    /** 새 카드는 마지막 일별 스택에 붙임 */
    function appendNewCardToLedgerCardsWrap(card) {
      let stack = timelineList.querySelector(
        '[data-legacy~="time-ledger-day-card-stack"]:last-of-type',
      );
      if (!stack) stack = timelineList;
      stack.appendChild(card);
    }

    if (showDayGroups) {
      const groups = timeLedgerGroupRowsByDay(rows);
      for (const g of groups) {
        if (g.key !== "_nodate") {
          const header = document.createElement("div");
          lpSetClasses(header, "time-ledger-day-group-header");
          header.setAttribute("role", "presentation");
          const label = document.createElement("span");
          lpSetClasses(label, "time-ledger-day-group-date");
          label.textContent = formatTimeFilterDateDotsWithWeekday(g.key);
          const totalEl = document.createElement("span");
          lpSetClasses(totalEl, "time-ledger-day-group-total");
          totalEl.textContent = formatHoursDisplay(
            sumTimeLedgerDayHours(g.rows),
          );
          header.appendChild(label);
          header.appendChild(totalEl);
          timelineList.appendChild(header);
        }
        const cardParent =
          g.rows.length > 0
            ? (() => {
                const stack = document.createElement("div");
                lpSetClasses(stack, "time-ledger-day-card-stack");
                timelineList.appendChild(stack);
                return stack;
              })()
            : timelineList;
        for (const d of g.rows) appendCardTo(cardParent, d);
      }
    } else {
      rows.forEach((d) => appendCardTo(timelineList, d));
    }

    const ledgerContainer = document.createElement("div");
    lpSetClasses(
      ledgerContainer,
      "time-ledger-container time-ledger-usage-sheet",
    );
    const usageHistoryHeadingRow = document.createElement("div");
    lpSetClasses(
      usageHistoryHeadingRow,
      "time-ledger-usage-history-heading-row",
    );
    const usageHistoryHeadingLeft = document.createElement("div");
    lpSetClasses(
      usageHistoryHeadingLeft,
      "time-ledger-usage-history-heading-left",
    );
    const usageHistoryHeading = document.createElement("h2");
    lpSetClasses(usageHistoryHeading, "time-ledger-usage-history-heading");
    usageHistoryHeading.setAttribute("data-usage-range-caption", "");
    usageHistoryHeading.textContent = formatUsageRangeCaption(
      usageHistoryRangeStartYmd,
      usageHistoryRangeEndYmd,
    );
    const usageHistoryRangeCaption = document.createElement("span");
    lpSetClasses(
      usageHistoryRangeCaption,
      "time-ledger-usage-range-caption",
    );
    usageHistoryRangeCaption.textContent = "시간 사용내역";
    usageHistoryHeadingLeft.appendChild(usageHistoryHeading);
    usageHistoryHeadingLeft.appendChild(usageHistoryRangeCaption);
    const usageHistoryTotalTime = document.createElement("span");
    lpSetClasses(usageHistoryTotalTime, "time-ledger-usage-history-total");
    usageHistoryTotalTime.setAttribute("data-usage-total-time", "");
    usageHistoryTotalTime.textContent = formatHoursToHHMM(
      sumTimeLedgerDayHours(rows),
    );
    usageHistoryHeadingRow.appendChild(usageHistoryHeadingLeft);
    usageHistoryHeadingRow.appendChild(usageHistoryTotalTime);
    ledgerContainer.appendChild(usageHistoryHeadingRow);

    const viewModeBarWrap = createTimeLedgerViewModeBar((nextView) => {
      if (timeLedgerLayoutView === nextView) return;
      timeLedgerLayoutView = nextView;
      persistTimeLedgerLayoutView();
      renderAll(getFilteredRows(getFullRowsForFilter(true)));
    });
    viewModeBarWrap._syncTimeLedgerViewModeUi?.(timeLedgerLayoutView);
    ledgerContainer.appendChild(viewModeBarWrap);

    const showTimelineLedgerContent = timeLedgerLayoutView !== "timebox";

    if (showTimelineLedgerContent) {
      ledgerContainer.appendChild(cardsWrap);
    } else {
      const timeboxShell = document.createElement("div");
      timeboxShell.className = "time-ledger-timebox-view-shell";
      timeboxShell.setAttribute("aria-label", "타임박스 뷰");
      ledgerContainer.appendChild(timeboxShell);
      const dayKey = usageHistoryRangeStartYmd;
      const dayRows = rows.filter((r) => timeLedgerRowYmd(r) === dayKey);
      mountTimeLedgerTimeboxView(timeboxShell, {
        dayRows,
        isMultiDay: timeLedgerFilterSpansMultipleDays(),
        rangeStartYmd: usageHistoryRangeStartYmd,
        rangeEndYmd: usageHistoryRangeEndYmd,
        allRowsInRange: rows,
      });
    }
    contentWrap.appendChild(ledgerContainer);

    const refreshCardLiveFields = () => {
      if (!el.isConnected) {
        clearTimeLedgerMobileElapsedTimer(el);
        return;
      }
      const liveRows = getFilteredRows(getFullRowsForFilter(true));
      if (showTimelineLedgerContent) {
        cardsWrap
          .querySelectorAll('[data-legacy~="time-ledger-mobile-card"]')
          .forEach(updateMobileTimeCardLiveFields);
      } else if (!timeLedgerFilterSpansMultipleDays()) {
        const shell = contentWrap.querySelector(".time-ledger-timebox-view-shell");
        if (shell) {
          const dayKey = usageHistoryRangeStartYmd;
          const dayRows = liveRows.filter((r) => timeLedgerRowYmd(r) === dayKey);
          refreshTimeLedgerTimeboxSlotGrid(shell, dayRows);
        }
      }
      const totalEl = contentWrap.querySelector("[data-usage-total-time]");
      if (totalEl) {
        totalEl.textContent = formatHoursToHHMM(
          sumTimeLedgerDayHours(liveRows),
        );
      }
      updateTotal();
    };
    if (rows.some((d) => mobileCardNeedsLiveClock(d))) {
      refreshCardLiveFields();
      el._timeLedgerMobileElapsedIntervalId = setInterval(
        refreshCardLiveFields,
        10000,
      );
    }
    try {
      el._lpTaskLogModalLedgerRefs = {
        hiddenTbody,
        handleCardDelete,
        handleCardEdit,
      };
    } catch (_) {}
    updateTotal();
    applyUsageListScrollToBottomIfPending(cardsWrap);
  }

  function updateFilterBarVisibility() {
    if (taskSetupBtn) taskSetupBtn.style.display = "";
    if (taskSelectBtn) taskSelectBtn.style.display = "";
  }

  function getFilteredRows(rows) {
    return applyUsageListFilters(rows);
  }

  function syncTimeLedgerContent(opts = {}) {
    const userSubTabClick = !!opts.userSubTabClick;
    el.dataset.timeContentView = "all";
    mergeRowsIntoCache();
    cachedRows = getFullRowsForFilter(true);
    const rowsToUse = getFilteredRows(cachedRows);
    const nextSig = snapshotTimeLedgerPaintSignature();
    const sigSame = !opts.force && nextSig === el._lpLastTimeLedgerPaintSig;
    if (sigSame) {
      patchTimeLedgerUsageHeadingInPlace(rowsToUse);
      updateTotal();
      persistActiveViewTimeFilterToSession();
      updateFilterBarVisibility();
    } else {
      renderAll(rowsToUse);
      rememberTimeLedgerPaintSignature();
      updateTotal();
      persistActiveViewTimeFilterToSession();
      updateFilterBarVisibility();
    }
    if (userSubTabClick) {
      const gen = (el._lpTimeSubTabPullGen =
        (el._lpTimeSubTabPullGen || 0) + 1);
      void (async () => {
        try {
          await pullTimeLedgerTabEnterFromCloud();
        } catch (_) {}
        if (!el.isConnected || gen !== el._lpTimeSubTabPullGen) return;
        refreshTimeLedgerFromRemotePull();
      })();
    }
  }

  tableWrap.appendChild(table);
  const ledgerContainer = document.createElement("div");
  lpSetClasses(ledgerContainer, "time-ledger-container");
  ledgerContainer.appendChild(tableWrap);
  contentWrap.appendChild(ledgerContainer);

  onFilterChange(true);

  function refreshTimeLedgerFromRemotePull(opts = {}) {
    if (!el.isConnected) return;
    if (opts.scrollUsageListToBottom) {
      requestUsageListScrollToBottomOnce();
    }
    /* App 탭 진입 pull 직후 session 만 오늘 등으로 바뀌고 DOM 날짜는 옛값일 수 있음 → 통째로 renderMain 하지 않고 갱신할 때 맞춤 */
    try {
      const t = getLedgerFilterTodayYmd();
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem("lp_time_filter_start", t);
          sessionStorage.setItem("lp_time_filter_end", t);
        }
      } catch (_) {}
    } catch (_) {}
    allRowsCache = loadTimeRows();
    cachedRows = getFullRowsForFilter(true);
    const prevSig = el._lpLastTimeLedgerPaintSig;
    syncTimeLedgerContent({ force: false });
    /* pull 후 기록이 같으면 renderAll 생략 — 다르면 같은 턴에 맨 아래(재그림 1회만) */
    if (el._lpLastTimeLedgerPaintSig !== prevSig) {
      const cardsWrap = contentWrap.querySelector(
        '[data-legacy~="time-ledger-mobile-cards"]',
      );
      if (cardsWrap?.isConnected) {
        cardsWrap.scrollTop = cardsWrap.scrollHeight;
      }
    }
  }

  function openTaskLogModalFromExternal(partial = {}) {
    const refs = el._lpTaskLogModalLedgerRefs;
    if (!refs?.hiddenTbody) {
      try {
        onFilterChange(true);
      } catch (_) {}
    }
    const r = el._lpTaskLogModalLedgerRefs;
    if (!r?.hiddenTbody) return;
    openTaskLogModal({
      productivity: null,
      tbody: r.hiddenTbody,
      addRow: null,
      onRowUpdate: () => {
        updateTotal();
        onFilterChange();
      },
      viewEl: el,
      createRow,
      handleRowDelete: r.handleCardDelete,
      handleRowEdit: r.handleCardEdit,
      ...partial,
    });
  }

  window.__lpOpenTimeTaskLog = openTaskLogModalFromExternal;

  /** App.setActiveTab 에서 pull 후 두 번째 renderMain 대신 호출 — 패널 통째 교체 없이 위 갱신만 */
  window.__lpTimeLedgerSoftRefresh = () => refreshTimeLedgerFromRemotePull();

  signal.addEventListener(
    "abort",
    () => {
      if (_timeLedgerFilterPullTimer) {
        clearTimeout(_timeLedgerFilterPullTimer);
        _timeLedgerFilterPullTimer = null;
      }
      clearTimeLedgerMobileElapsedTimer(el);
      try {
        closeTaskLogModal();
      } catch (_) {}
      try {
        taskLogModal?.remove();
      } catch (_) {}
      clearAppFooterActions();
      if (
        window.__lpTimeLedgerSoftRefresh === refreshTimeLedgerFromRemotePull
      ) {
        delete window.__lpTimeLedgerSoftRefresh;
      }
      if (window.__lpOpenTimeTaskLog === openTaskLogModalFromExternal) {
        delete window.__lpOpenTimeTaskLog;
      }
    },
    { once: true },
  );

  document.addEventListener(
    "lp-time-ledger-remote-updated",
    () => refreshTimeLedgerFromRemotePull(),
    { signal },
  );

  return el;
}

const LP_DETACHED_TIME_TASK_LOG_BRIDGE_ID = "lp-time-task-log-bridge";

/** 일정 캘린더 등에서 탭 전환 없이 과제 기록 모달만 쓰기 위해 마운트한 숨김 호스트 — 시간가계부 탭 진입 시 제거 */
export function teardownDetachedTimeLedgerTaskLogBridge() {
  const bridge = document.getElementById(LP_DETACHED_TIME_TASK_LOG_BRIDGE_ID);
  if (!bridge) return;
  const inner = bridge.firstElementChild;
  try {
    inner?._lpTabAbortController?.abort();
  } catch (_) {}
  try {
    bridge.remove();
  } catch (_) {}
}

/** 시간가계부 탭을 열지 않고도 `window.__lpOpenTimeTaskLog` 를 제공 */
export function ensureDetachedTimeLedgerTaskLogBridge() {
  if (typeof document === "undefined") return;
  if (typeof window.__lpOpenTimeTaskLog === "function") return;
  let bridge = document.getElementById(LP_DETACHED_TIME_TASK_LOG_BRIDGE_ID);
  if (!bridge) {
    bridge = document.createElement("div");
    bridge.id = LP_DETACHED_TIME_TASK_LOG_BRIDGE_ID;
    bridge.setAttribute("aria-hidden", "true");
    bridge.style.cssText =
      "position:fixed;inset:0;pointer-events:none;visibility:hidden;z-index:-1;";
    document.body.appendChild(bridge);
  }
  if (bridge.querySelector(".time-ledger-view")) return;
  bridge.appendChild(render({ taskLogBridgeMode: true }));
}

if (typeof document !== "undefined") {
  document.addEventListener("lp-open-time-task-log", (e) => {
    const dk = String(e.detail?.dateKey || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) return;
    try {
      ensureDetachedTimeLedgerTaskLogBridge();
      window.__lpOpenTimeTaskLog?.({ recordDateKey: dk });
    } catch (_) {}
  });

  document.addEventListener("app-hourly-rate-changed", (e) => {
    const rate = Number(e.detail?.rate ?? 0);
    const root = document.querySelector(
      '[data-legacy~="app-tab-panel-content"][data-legacy~="time-ledger-view"]',
    );
    if (!root) return;
    const inp = root.querySelector('[data-legacy~="time-hourly-input"]');
    if (inp) inp.value = String(rate);
    if (typeof root._updateTotal === "function") root._updateTotal();
  });
}
