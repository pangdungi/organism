/**
 * 시간가계부 - 데일리 시간 입력용
 * 과제명, 사용시간, 생산성, 카테고리, 날짜
 */

import {
  loadExpenseRows,
  saveExpenseRows,
  newExpenseRowId,
  getClassificationToCategoryMap,
  getClassificationsByFlowType,
  getPaymentOptions,
} from "./Asset.js";
import { EXPENSE_MODAL_CLASSIFICATIONS } from "../expenseModalClassifications.js";
import { BAG_DOLLAR_PATHS_INNER } from "../utils/expenseLedgerIcons.js";
import {
  getKpiSyncedTaskNames,
  syncHabitTrackerLogs,
  upsertHabitTrackerLogWithDailyState,
  getHabitTrackerDailyCompletedForDate,
  removeKpiHabitLogsForTimeLedgerEntry,
} from "../utils/timeKpiSync.js";
import {
  getKpiTodosAsTasks,
  getKpiDailyRepeatInfoByKpiName,
} from "../utils/kpiTodoSync.js";
import { kpiTodoFineTrace } from "../utils/kpiTodoFineTrace.js";
import { getCustomSections, getCategoryColorForReport } from "../utils/todoSettings.js";
import { showToast } from "../utils/showToast.js";
import {
  APP_FOOTER_ICON_BTN_CLASS,
  clearAppFooterActions,
  getAppFooterActionsSlot,
} from "../utils/appFooterShell.js";
import { USER_HOURLY_RATE_KEY } from "../utils/userHourlySync.js";
import * as TTC from "../utils/timeTaskOptionsConstants.js";
import {
  getFullTaskOptions,
  getTaskOptions,
  addTaskOption,
  addTaskOptionFull,
  updateTaskOption,
  removeTaskOption,
  getTaskOptionByName,
  migrateTimeLogRowsTaskIds,
  isUuid,
} from "../utils/timeTaskOptionsModel.js";
import {
  attachTimeLedgerTasksSaveListener,
  pullTimeLedgerTasksFromSupabase,
} from "../utils/timeLedgerTasksSupabase.js";
import { pullKpiMapsForTaskLogModalOpen } from "../utils/kpiTabCloudRefresh.js";
import { pullWorkScheduleFromSupabase } from "../utils/workScheduleSupabase.js";
import { scheduleTimeDailyBudgetSyncPush } from "../utils/timeDailyBudgetSupabase.js";
import {
  ensureTimeLedgerEntryIds,
  readTimeLedgerEntriesRaw,
  splitUnhealthyMealMemoFromDb,
  stripTimeLedgerSyncMetaForCompare,
  writeTimeLedgerEntriesRaw,
} from "../utils/timeLedgerEntriesModel.js";
import {
  deleteTimeLedgerEntryFromSupabase,
  pullTimeLedgerEntriesForDateRange,
  pushDirtyTimeLedgerEntriesToSupabase,
  readTimeLedgerSessionFilterRangeYmd,
  readTimeLedgerCombinedPullRangeYmd,
} from "../utils/timeLedgerEntriesSupabase.js";
import {
  deleteAssetExpenseTransactionsFromSupabase,
  grantAssetExpenseTransactionServerWrite,
  pullAssetExpenseTransactionsFromSupabase,
  syncAssetExpenseTransactionsToSupabase,
} from "../utils/assetExpenseTransactionsSupabase.js";
import { pullTimeLedgerTabEnterFromCloud } from "../utils/timeLedgerCloudRefresh.js";
import { timeLedgerSyncLog } from "../utils/timeLedgerSyncDebug.js";
import { lpSaveDebug } from "../utils/lpSaveDebug.js";
import { logTabSync } from "../utils/lpTabSyncDebug.js";
import {
  persistSectionTasksAndSchedule,
  persistCustomSectionTasksAndSchedule,
} from "../utils/todoSectionTasksSupabase.js";
import {
  readSectionTasksObject,
  readCustomSectionTasksObject,
} from "../utils/todoSectionTasksModel.js";
import { listWorkScheduleDietTypeNamesFromMem } from "../utils/workScheduleModel.js";
import {
  getMealChecklistState,
  setMealChecklistItem,
} from "../utils/mealTaskChecklistStorage.js";
import {
  dietNameFromLedgerMemoTag,
  isWorkScheduleDietLedgerMemoTag,
  ledgerRowLogsDietForWorkSchedule,
  makeWorkScheduleDietLedgerMemoTag,
  WS_DIET_LEDGER_TASK_NAMES,
} from "../utils/workScheduleDietLedgerTags.js";

export { getTaskOptionByName };

/** 모바일 과제 기록 FAB — TodoList ADD_TASK_ICON과 동일 */
const TIME_LEDGER_ADD_FAB_SVG =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 8v8"/><path d="m8 12h8"/><path d="m18 22h-12c-2.209 0-4-1.791-4-4v-12c0-2.209 1.791-4 4-4h12c2.209 0 4 1.791 4 4v12c0 2.209-1.791 4-4 4z"/></g></svg>';

/** 상단 툴바: 라벨 없는 단순 + (설정·필터 아이콘과 동일 20px 박스) */
const TIME_LEDGER_ADD_PLUS_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>';

/** 툴바 설정·필터: img 필터 대신 +와 동일 currentColor (버튼 color #dc2626 상속) */
const TIME_LEDGER_TOOLBAR_SETTINGS_ICON_SVG =
  '<svg class="time-btn-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m19.845 13.561c.1-.505.155-1.027.155-1.561s-.055-1.056-.155-1.561l1.806-1.489c.502-.414.632-1.132.307-1.696l-.869-1.508c-.325-.564-1.011-.811-1.62-.582l-2.198.825c-.779-.684-1.689-1.218-2.691-1.559l-.385-2.316c-.108-.643-.663-1.114-1.314-1.114h-1.738c-.651 0-1.206.471-1.313 1.114l-.386 2.316c-1.002.341-1.912.875-2.691 1.559l-2.198-.825c-.61-.228-1.295.018-1.62.582l-.87 1.508c-.325.564-.195 1.282.307 1.696l1.806 1.489c-.1.505-.155 1.026-.155 1.561s.055 1.056.155 1.561l-1.806 1.489c-.502.414-.632 1.132-.307 1.696l.869 1.508c.325.564 1.011.811 1.62.582l2.198-.825c.779.684 1.689 1.218 2.691 1.559l.385 2.316c.109.643.664 1.114 1.315 1.114h1.738c.651 0 1.206-.471 1.313-1.114l.385-2.316c1.002-.341 1.913-.875 2.691-1.559l2.198.825c.609.229 1.295-.017 1.62-.582l.869-1.508c.325-.564.196-1.282-.307-1.696z"/><circle cx="12.012" cy="12" r="3"/></g></svg>';

const TIME_LEDGER_TOOLBAR_FILTER_ICON_SVG =
  '<svg class="time-btn-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="m20.988 2h-17.976c-1.664 0-2.606 1.899-1.595 3.216l7.583 9.784v7l4.853-2.101c.731-.318 1.147-1.037 1.147-1.832v-3.067l7.583-9.784c1.011-1.317.069-3.216-1.595-3.216z"/></svg>';

const PRODUCTIVITY_OPTIONS = [
  { value: "productive", label: "생산적", color: "prod-pink" },
  { value: "nonproductive", label: "비생산적", color: "prod-blue" },
  { value: "other", label: "그 외", color: "prod-green" },
];

const BUDGET_GOALS_KEY = "time_daily_budget_goals";
const BUDGET_EXCLUDED_KEY = "time_budget_excluded";

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

function appendTaskDropdownBadges(textWrap, task, opts = {}) {
  if (opts.omitBadges) return;
  if (isTimeTaskBuiltinTemplate(task)) {
    const bb = document.createElement("span");
    bb.className = "lp-task-badge lp-task-badge--builtin";
    bb.textContent = "기본";
    bb.title =
      "앱에서 제공하는 기본 과제입니다. 과제 설정에서 삭제할 수 없습니다.";
    textWrap.appendChild(bb);
  }
  if (isTimeTaskKpiLinked(task)) {
    const kb = document.createElement("span");
    kb.className = "lp-task-badge lp-task-badge--kpi";
    kb.textContent = "KPI";
    kb.title = "KPI(맵)에서 연결된 과제입니다";
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
    const raw = localStorage.getItem(BUDGET_GOALS_KEY);
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
    const raw = localStorage.getItem(BUDGET_GOALS_KEY);
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
    localStorage.setItem(BUDGET_GOALS_KEY, JSON.stringify(all));
    notifyTimeDailyBudgetSaved(dateStr);
  } catch (_) {}
}

/** 새 행 플레이스홀더 (재렌더 시 행 유지용) */
const BUDGET_PLACEHOLDER_PREFIX = "(과제 선택)·";
function isBudgetPlaceholder(key) {
  return (key || "").startsWith(BUDGET_PLACEHOLDER_PREFIX);
}

function getBudgetExcluded(dateStr) {
  try {
    const raw = localStorage.getItem(BUDGET_EXCLUDED_KEY);
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
    const raw = localStorage.getItem(BUDGET_EXCLUDED_KEY);
    const excl = raw ? JSON.parse(raw) : {};
    if (excl[dateStr]) {
      excl[dateStr] = excl[dateStr].filter((n) => n !== key);
      if (excl[dateStr].length === 0) delete excl[dateStr];
      localStorage.setItem(BUDGET_EXCLUDED_KEY, JSON.stringify(excl));
      notifyTimeDailyBudgetSaved(dateStr);
    }
  } catch (_) {}
}

/** 과제 기록 로컬 저장 — IndexedDB(+미러) 경로는 timeLedgerEntriesModel */
export function loadTimeRows() {
  try {
    const arr = readTimeLedgerEntriesRaw();
    const { rows, dirty } = ensureTimeLedgerEntryIds(arr);
    if (dirty) {
      writeTimeLedgerEntriesRaw(rows);
    }
    return rows;
  } catch (_) {
    return [];
  }
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
          typeof r.localModifiedAt === "number" && Number.isFinite(r.localModifiedAt)
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
            prevRow.serverUpdatedAt !== undefined && prevRow.serverUpdatedAt !== ""
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
    syncHabitTrackerLogs();
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
  "#a8e6cf",
  "#dcedc1",
  "#ffd3b6",
  "#ffaaa5",
  "#ff8b94",
  "#c7ceea",
  "#b8a9c9",
  "#d4a5a5",
  "#92a8d1",
  "#88b04b",
  "#f7cac9",
  "#92c5de",
  "#f4a460",
  "#98d8c8",
  "#f7dc6f",
  "#bb8fce",
  "#85c1e9",
  "#f8b500",
  "#2ecc71",
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
  let productivity = String(r.productivity || "").trim() || opt?.productivity || "";
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
    const p = String(productivity || "").trim().toLowerCase();
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
  const sign =
    diffHours > 0 ? "+" : diffHours < 0 ? "-" : "";
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

/** 필터 구간 합계 표시용 "hh:mm" (시·분 두 자리) */
function formatTotalRecordedHoursAsHhMm(hours) {
  if (hours < 0 || !isFinite(hours)) return "00:00";
  const totalMin = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 모바일 시간기록 카드: 진행 중(마감 없음)일 때 경과 시간 갱신용 타이머 정리 */
function clearTimeLedgerMobileElapsedTimer(viewEl) {
  if (!viewEl?._timeLedgerMobileElapsedIntervalId) return;
  clearInterval(viewEl._timeLedgerMobileElapsedIntervalId);
  viewEl._timeLedgerMobileElapsedIntervalId = null;
}

function rowHasEndTimeForMobileCard(rowData) {
  return !!(rowData?.endTime && String(rowData.endTime).trim());
}

/** 행의 시작 시각을 로컬 Date로 (없으면 null) */
function getRowStartInstantForMobileCard(rowData) {
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
  if (startStr && endStr)
    return escapeHtml(`${startStr} - ${endStr}`);
  if (startStr && !rowHasEndTimeForMobileCard(rowData)) {
    return `${escapeHtml(startStr)} - <span class="time-mobile-card-in-progress-tag">${escapeHtml(TIME_LEDGER_IN_PROGRESS_LABEL)}</span>`;
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
    if (m2)
      return `${m2[1]}-${m2[2]}-${m2[3]}T${m2[4]}:${m2[5]}:00`;
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
function getMobileCardEffectiveHoursForPrice(rowData) {
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

function applyMobileCardPriceEl(priceEl, value) {
  if (!priceEl) return;
  priceEl.textContent = formatPrice(value);
  priceEl.classList.toggle("is-negative", value < 0);
  priceEl.classList.toggle("is-positive", value > 0);
}

function mobileCardNeedsLiveClock(rowData) {
  if (!rowData) return false;
  if ((rowData.timeTracked || "").trim()) return false;
  if (rowHasEndTimeForMobileCard(rowData)) return false;
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
  card.classList.toggle("time-ledger-mobile-card--in-progress", live);
  if (!live) return;
  const rd = card._rowData;
  const viewEl = card._timeLedgerViewEl;
  const trackedEl = card.querySelector(".time-mobile-card-tracked");
  const timeEl = card.querySelector(".time-mobile-card-time");
  const priceEl = card.querySelector(".time-mobile-card-price");
  const start = getRowStartInstantForMobileCard(rd);
  if (!start) return;
  const ms = Date.now() - start.getTime();
  if (trackedEl)
    trackedEl.textContent =
      ms < 0 ? "0h" : formatElapsedDurationForMobileCard(ms);
  if (timeEl) {
    timeEl.innerHTML = getMobileCardTimeRangeHtmlForRow(rd) || "—";
  }
  if (priceEl && viewEl) {
    const hourlyInput = viewEl.querySelector(".time-hourly-input");
    const hourlyRate =
      parseFloat(String(hourlyInput?.value || "0").replace(/,/g, "")) || 0;
    applyMobileCardPriceEl(priceEl, computeMobileCardPriceValue(rd, hourlyRate));
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
  const m =
    t.match(/[T\s](\d{1,2}):(\d{2})/) || t.match(/^(\d{1,2}):(\d{2})$/);
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
    String(rowData.date || "").trim().replace(/\//g, "-").slice(0, 10);
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
      String(c.date || "").trim().replace(/\//g, "-").slice(0, 10);
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
function getNextTaskLogStartHhMmFromLedger(dateInputValue, exclude, rowsOverride) {
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

/** 날짜·시작시간 기준 최신 먼저 (최근 날짜 위, 같은 날은 늦은 시각→이른 시각) */
function sortRowsByDateTime(rows) {
  return [...rows].sort((a, b) => {
    const dateA = normalizeDateForCompare(a.date || "") || a.date || "";
    const dateB = normalizeDateForCompare(b.date || "") || b.date || "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    const startA = parseDateTimeToHours(a.startTime) ?? 0;
    const startB = parseDateTimeToHours(b.startTime) ?? 0;
    return startB - startA;
  });
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
    const d = normalizeDateForCompare(r.date || "");
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
    hourlyRate = parseFloat(String(localStorage.getItem(USER_HOURLY_RATE_KEY) || "0").replace(/,/g, "")) || 0;
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
    const pv = (r.productivity || getProductivityFromCategory(r.category) || "").trim();
    if (pv === "productive") {
      productiveHrs += hrs;
      investedPrice += hrs * hourlyRate;
    }
    if (pv === "nonproductive") {
      wastedValue += hrs * hourlyRate;
    }
  });
  const trackedDisplay = totalHrs <= 0 || !isFinite(totalHrs) ? "0h 0m" : formatHoursDisplay(totalHrs);
  const productiveDisplay = productiveHrs <= 0 || !isFinite(productiveHrs) ? "0h 0m" : formatHoursDisplay(productiveHrs);
  /** 홈 오늘 통계: 총 기록 목표(고정) */
  const totalRecordGoalHours = 23 + 59 / 60;
  const totalRecordGoalDisplay = formatHoursDisplay(totalRecordGoalHours);
  /** 24h − 근무 − 수면 = 가용 시간(당일 기록 기준) */
  const availableHrsToday = Math.max(0, 24 - workHrsToday - sleepHrsToday);
  /** 홈 통계 푸터: 짧은 한 줄(가용 시·분 + '중'은 줄바꿈 유발) */
  const productiveContextDisplay = "가용 시간의";
  /** 홈 요약 막대: 하루 24시간 기준… (호환용) */
  const trackedPct24 = Math.min(100, Math.max(0, (totalHrs / 24) * 100));
  const productivePct24 = Math.min(100, Math.max(0, (productiveHrs / 24) * 100));
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

function parsePriceFromDisplay(text) {
  if (!text || typeof text !== "string") return 0;
  const trimmed = text.trim().replace(/,/g, "");
  if (!trimmed) return 0;
  const num = parseFloat(trimmed);
  return isNaN(num) ? 0 : num;
}

function createDateCell(initialValue) {
  const wrap = document.createElement("div");
  wrap.className = "time-date-cell";
  const display = document.createElement("span");
  display.className = "time-date-display";
  const input = document.createElement("input");
  input.type = "date";
  input.className = "time-input-date-hidden";
  input.name = "time-date";
  function refresh() {
    if (input.value) {
      display.textContent = formatDateDisplay(input.value);
      display.classList.add("has-value");
    } else {
      display.textContent = "";
      display.classList.remove("has-value");
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
  wrap.className = "time-tag-dropdown-wrap";
  let value =
    initialValue !== undefined && initialValue !== null
      ? String(initialValue)
      : options[0]?.value !== undefined && options[0]?.value !== null
        ? String(options[0].value)
        : "";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "time-tag-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  function updateTrigger() {
    const opt = options.find((o) => o.value === value);
    const label = opt ? opt.label : value || "—";
    const colorClass = opt ? opt.color : "";
    trigger.innerHTML = `<span class="time-tag-pill ${optionClass} ${colorClass}">${label}</span>`;
    trigger.setAttribute("aria-label", `선택: ${label}. 클릭 시 메뉴 열기`);
  }
  updateTrigger();

  const panel = document.createElement("div");
  panel.className =
    "time-tag-panel" +
    (enablePanelFilter ? " time-tag-panel--with-filter" : "");
  panel.hidden = true;

  /** @type {HTMLInputElement | null} */
  let filterInput = null;
  let listRoot = panel;

  if (enablePanelFilter) {
    filterInput = document.createElement("input");
    filterInput.type = "text";
    filterInput.className = "time-tag-panel-filter";
    filterInput.setAttribute("aria-label", "과제 검색");
    filterInput.placeholder = "과제 검색…";
    filterInput.autocomplete = "off";
    listRoot = document.createElement("div");
    listRoot.className = "time-tag-panel-list";
    panel.appendChild(filterInput);
    panel.appendChild(listRoot);

    function applyFilter() {
      const q = (filterInput.value || "").trim().toLowerCase();
      listRoot.querySelectorAll(".time-tag-option").forEach((el) => {
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
    opt.className =
      "time-tag-option" +
      (String(o.value ?? "") === String(value ?? "") ? " is-selected" : "");
    opt.innerHTML = `<span class="time-tag-pill ${o.color || ""}">${o.label}</span>`;
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
    options
      .filter((o) => o.value !== "")
      .forEach(appendOption);
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
    listRoot.querySelectorAll(".time-tag-option").forEach((el) => {
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
    panel.querySelectorAll(".time-tag-option").forEach((optEl) => {
      const ov = optEl.getAttribute("data-option-value");
      optEl.classList.toggle("is-selected", ov === value);
    });
  };
  return { wrap, getValue: () => value };
}

const DELETE_ICON =
  '<svg class="time-task-delete-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

/** 과제명 입력: 포커스 시 목록 표시, 목록에 없으면 Create 옵션 @param {AbortSignal} [tabSignal] */
function createTaskNameInput(initialValue, onTaskSelect, tabSignal) {
  const wrap = document.createElement("div");
  wrap.className = "time-task-name-wrap";

  const inputWrap = document.createElement("div");
  inputWrap.className = "time-task-input-wrap";

  const input = document.createElement("input");
  input.type = "text";
  input.name = "time-task-name";
  input.className = "time-input-task";
  input.placeholder = "Search";
  if (initialValue) input.value = initialValue;

  inputWrap.appendChild(input);

  const panel = document.createElement("div");
  panel.className = "time-task-name-panel";
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
    sep.className = "time-task-name-separator";
    sep.textContent = "—";
    panel.appendChild(sep);

    const lockedNames = getLockedTaskNames();
    matches.forEach((opt) => {
      const name = getName(opt);
      const isLocked = lockedNames.has(name);
      const row = document.createElement("div");
      row.className = "time-task-name-option";
      row.innerHTML = `<span class="time-task-tag">${name}</span>${isLocked ? "" : `<button type="button" class="time-task-delete-btn" title="삭제">${DELETE_ICON}</button>`}`;
      row.dataset.value = name;
      const delBtn = row.querySelector(".time-task-delete-btn");
      row.addEventListener("click", (e) => {
        if (e.target.closest(".time-task-delete-btn")) return;
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
      createRow.className = "time-task-name-option time-task-name-create";
      createRow.innerHTML = `<span class="time-task-create-label">Create</span><span class="time-task-tag">${(query || "").trim()}</span>`;
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
    const opts = panel.querySelectorAll(".time-task-name-option");
    if (opts[0]) opts[0].classList.add("is-highlighted");
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
    const opts = panel.querySelectorAll(".time-task-name-option");
    if (opts.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, opts.length - 1);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) =>
        o.classList.toggle("is-highlighted", i === highlightedIndex),
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) =>
        o.classList.toggle("is-highlighted", i === highlightedIndex),
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
  tr.className = "time-row";

  const taskName = initialData?.taskName || "";
  const opt = taskName ? getTaskOptionByName(taskName) : null;
  const idIn = String(initialData?.id || "").trim();
  const rowId =
    isUuid(idIn)
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
    category:
      initialData?.category ?? (taskName ? opt?.category : ""),
    date: initialData?.date || "",
    feedback: initialData?.feedback || "",
    mealDetail: String(initialData?.mealDetail || "").trim(),
    memoTags: Array.isArray(initialData?.memoTags) ? initialData.memoTags : [],
    linkedExpenseIds: Array.isArray(initialData?.linkedExpenseIds)
      ? initialData.linkedExpenseIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [],
    focus: String(initialData?.focus || "").trim(),
  };
  tr._rowData = rowData;

  const prodTd = document.createElement("td");
  prodTd.className = "time-cell time-cell-productivity";
  const priceTd = document.createElement("td");
  priceTd.className = "time-cell time-cell-price";
  const priceDisplay = document.createElement("span");
  priceDisplay.className = "time-price-display";

  const prodDisplay = document.createElement("span");
  prodDisplay.className = "time-tag-pill prod";
  const prodOpt = PRODUCTIVITY_OPTIONS.find(
    (o) => o.value === rowData.productivity,
  );
  prodDisplay.textContent = prodOpt ? prodOpt.label : "";
  prodDisplay.className =
    "time-tag-pill prod " + (prodOpt ? prodOpt.color : "");
  prodTd.appendChild(prodDisplay);

  const startTimeTd = document.createElement("td");
  startTimeTd.className = "time-cell time-cell-start";
  const startTimeSpan = document.createElement("span");
  startTimeSpan.className = "time-display-start";
  startTimeSpan.textContent = rowData.startTime
    ? toDisplayTimeOnly(rowData.startTime) || rowData.startTime
    : "";
  startTimeTd.appendChild(startTimeSpan);

  const endTimeTd = document.createElement("td");
  endTimeTd.className = "time-cell time-cell-end";
  const endTimeSpan = document.createElement("span");
  endTimeSpan.className = "time-display-end";
  endTimeSpan.textContent = formatTimeLedgerEndCellDisplay(
    rowData.startTime,
    rowData.endTime,
  );
  endTimeTd.appendChild(endTimeSpan);

  const timeTd = document.createElement("td");
  timeTd.className = "time-cell time-cell-tracked";
  const timeSpan = document.createElement("span");
  timeSpan.className = "time-display-tracked";
  timeTd.appendChild(timeSpan);

  function updatePrice() {
    const data = tr._rowData || rowData;
    const hourlyInput = viewEl?.querySelector(".time-hourly-input");
    const hourlyRate =
      parseFloat(String(hourlyInput?.value || "0").replace(/,/g, "")) || 0;
    const hours = getMobileCardEffectiveHoursForPrice(data);
    const pv = getMobileCardProductivityValue(data);
    let price = hours * hourlyRate;
    if (pv === "nonproductive") price *= -1;
    else if (pv === "other" || pv === "그 외" || !pv) price = 0;
    priceDisplay.textContent = formatPrice(price);
    priceDisplay.classList.toggle("is-negative", price < 0);
    priceDisplay.classList.toggle("is-positive", price > 0);

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
  catTd.className = "time-cell time-cell-category";
  const catDisplay = document.createElement("span");
  catDisplay.className = "time-tag-pill cat cat-empty";
  catDisplay.textContent = getCategoryLabel(rowData.category) || "—";
  catDisplay.className =
    "time-tag-pill cat " + getCategoryColor(rowData.category);
  catTd.appendChild(catDisplay);

  const taskTd = document.createElement("td");
  taskTd.className = "time-cell time-cell-task";
  const taskInner = document.createElement("div");
  taskInner.className = "time-cell-task-inner";
  const prodBar = document.createElement("span");
  prodBar.className = "time-task-prod-bar";
  const prodBarMod =
    rowData.productivity === "productive"
      ? "time-task-prod-bar--productive"
      : rowData.productivity === "nonproductive"
        ? "time-task-prod-bar--nonproductive"
        : "time-task-prod-bar--other";
  prodBar.classList.add(prodBarMod);
  const taskSpan = document.createElement("span");
  taskSpan.className = "time-display-task";
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
  dateTd.className = "time-cell time-cell-date";
  const dateSpan = document.createElement("span");
  dateSpan.className = "time-display-date";
  dateSpan.textContent = rowData.date ? formatDateDisplay(rowData.date) : "";
  dateTd.appendChild(dateSpan);
  tr.appendChild(dateTd);

  priceTd.appendChild(priceDisplay);
  tr.appendChild(priceTd);

  const feedbackTd = document.createElement("td");
  feedbackTd.className = "time-cell time-cell-feedback";
  const feedbackSpan = document.createElement("span");
  feedbackSpan.className = "time-display-feedback";
  feedbackSpan.textContent = rowData.feedback || "";
  feedbackTd.appendChild(feedbackSpan);
  tr.appendChild(feedbackTd);

  const memoTagTd = document.createElement("td");
  memoTagTd.className = "time-cell time-cell-memo-tag";
  const memoTagDisplayTexts = getMemoTagDisplayTextsForLedgerRow(rowData);
  const memoTagWrap = document.createElement("span");
  memoTagWrap.className = "time-display-memo-tags";
  memoTagDisplayTexts.forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "time-memo-tag-pill";
    pill.textContent = tag;
    memoTagWrap.appendChild(pill);
  });
  memoTagTd.appendChild(memoTagWrap);
  tr.appendChild(memoTagTd);

  tr._onRowDelete = onRowDelete;
  tr._updatePrice = updatePrice;
  updatePrice();

  if (onRowEdit) {
    tr.classList.add("time-row-clickable");
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

/** 구버전 memo_tags에 섞여 있던 가계부 지출 참조 접두사 — pull 시 linkedExpenseIds로 이전 */
const LP_LEDGER_EXPENSE_TAG_PREFIX = "lp-expense:";

function isLedgerExpenseRefTag(tag) {
  return String(tag || "").trim().startsWith(LP_LEDGER_EXPENSE_TAG_PREFIX);
}

function expenseIdFromLedgerMemoTag(tag) {
  const s = String(tag || "").trim();
  if (!isLedgerExpenseRefTag(s)) return "";
  return s.slice(LP_LEDGER_EXPENSE_TAG_PREFIX.length).trim();
}

/**
 * memo_tags에서 사용자 표시 태그와 소비 거래 id 목록 분리
 * @returns {{ userTags: string[], expenseIds: string[] }}
 */
function splitLedgerMemoTags(memoTags) {
  const userTags = [];
  const expenseIds = [];
  for (const t of Array.isArray(memoTags) ? memoTags : []) {
    const s = String(t ?? "").trim();
    if (!s) continue;
    const eid = expenseIdFromLedgerMemoTag(s);
    if (eid) expenseIds.push(eid);
    else userTags.push(s);
  }
  return { userTags, expenseIds };
}

/** 사용자 메모 태그·투두만 memo_tags에 넣음. 가계부 지출 id는 linkedExpenseIds(서버 컬럼)로 별도 저장 */
function buildLedgerMemoTagsForSubmit(userTags, todoTags) {
  const base = [
    ...(Array.isArray(userTags) ? userTags : []),
    ...(Array.isArray(todoTags) ? todoTags : []),
  ];
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

/** 연결된 지출 id: 필드 + 구버전 memo_tags 내 lp-expense: (로컬만 남은 행 호환) */
function getLedgerLinkedExpenseIds(row) {
  const fromField = Array.isArray(row?.linkedExpenseIds)
    ? row.linkedExpenseIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const fromMemo = splitLedgerMemoTags(row?.memoTags || []).expenseIds;
  return [...new Set([...fromField, ...fromMemo])];
}

function ledgerExpenseAddedItemsFromIds(expenseIds) {
  const ids = Array.isArray(expenseIds) ? expenseIds : [];
  if (ids.length === 0) return [];
  const all = loadExpenseRows();
  const out = [];
  for (const eid of ids) {
    const row = all.find((r) => String(r?.id || "").trim() === String(eid).trim());
    if (!row || row.flowType !== "지출") continue;
    out.push({
      id: row.id,
      name: row.name || "",
      classification: row.classification || "",
      amountFormatted: row.amount || "",
    });
  }
  return out;
}

/** 가계부 지출 행 → 한 줄 표시용 (이름·분류·금액·카테고리) — 테이블·모바일 카드 공통 */
function formatExpenseLineForMobileCard(row) {
  if (!row || typeof row !== "object") return "";
  const name = String(row.name || "").trim();
  const amt = String(row.amount || "").trim();
  const cls = String(row.classification || "").trim();
  const cat = String(row.category || "").trim();
  if (name) return [name, amt].filter(Boolean).join(" | ");
  const clsAmt = [cls, amt].filter(Boolean).join(" | ");
  if (clsAmt) return clsAmt;
  if (cat && amt) return `${cat} | ${amt}`;
  if (amt) return amt;
  if (cls) return cls;
  if (cat) return cat;
  return "";
}

/** 테이블 메모 태그 열: 사용자 태그 + 소비 요약(가계부 행 기준) */
function getMemoTagDisplayTextsForLedgerRow(rowData) {
  const raw =
    rowData?.memoTags?.length > 0
      ? rowData.memoTags
      : parseTagsFromFeedback(rowData?.feedback || "");
  const { userTags } = splitLedgerMemoTags(Array.isArray(raw) ? raw : []);
  const expenseIds = getLedgerLinkedExpenseIds(rowData);
  const texts = [];
  for (const t of userTags) {
    const s = String(t ?? "").trim();
    if (!s) continue;
    const meal = dietNameFromLedgerMemoTag(s);
    if (meal) {
      texts.push(meal);
      continue;
    }
    if (!isWorkScheduleDietLedgerMemoTag(s)) texts.push(s);
  }
  const allExp = loadExpenseRows();
  for (const eid of expenseIds) {
    const row = allExp.find((r) => String(r?.id || "").trim() === eid);
    if (!row) continue;
    const label = formatExpenseLineForMobileCard(row);
    if (label) texts.push(label);
  }
  return texts;
}

/** 모바일 카드: 방해기록과 동일 레이아웃으로 연결된 소비 요약 (lp-expense 태그 기준) */
function buildMobileCardExpenseBlockHtml(rowData) {
  const expenseIds = getLedgerLinkedExpenseIds(rowData);
  if (expenseIds.length === 0) return "";
  const allExp = loadExpenseRows();
  const parts = [];
  for (const eid of expenseIds) {
    const row = allExp.find((r) => String(r?.id || "").trim() === eid);
    if (!row) continue;
    const line = formatExpenseLineForMobileCard(row);
    if (!line) continue;
    const safe = line.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    parts.push(safe);
  }
  if (parts.length === 0) return "";
  const text = parts.join(" · ");
  return `<div class="time-mobile-card-focus time-mobile-card-expense-snippet"><span class="time-mobile-card-focus-label">소비</span><span class="time-mobile-card-focus-text">${text}</span></div>`;
}

/**
 * 가계부 지출이 늦게 메모리에 올 때 카드는 이미 그려져 '소비'만 보이던 문제 → 동기화·탭 복귀 후 소비 줄만 다시 그림
 */
function refreshMobileTimeCardExpenseSnippetsIn(container) {
  if (!container?.querySelectorAll) return;
  container.querySelectorAll(".time-ledger-mobile-card").forEach((card) => {
    const rd = card._rowData;
    if (!rd || getLedgerLinkedExpenseIds(rd).length === 0) return;
    const body = card.querySelector(".time-mobile-card-body");
    if (!body) return;
    body.querySelectorAll(".time-mobile-card-expense-snippet").forEach((n) =>
      n.remove(),
    );
    const html = buildMobileCardExpenseBlockHtml(rd);
    if (html) body.insertAdjacentHTML("beforeend", html);
  });
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
      if (node.classList?.contains("time-memo-tag-chip")) {
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
    containerEl.classList.add("is-empty");
    return;
  }
  containerEl.classList.remove("is-empty");
  const tokens = str.split(/(#[^\s#]+)/g).filter(Boolean);
  tokens.forEach((tok) => {
    if (tok.startsWith("#") && tok.length > 1) {
      const tagName = tok.slice(1).trim();
      if (!tagName) return;
      const chip = document.createElement("span");
      chip.className = "time-memo-tag-chip";
      chip.contentEditable = "false";
      chip.setAttribute("data-tag", tagName);
      chip.innerHTML = `<span class="time-memo-tag-chip-text">${escapeHtml(tagName)}</span><button type="button" class="time-memo-tag-chip-remove" aria-label="태그 삭제">&times;</button>`;
      chip
        .querySelector(".time-memo-tag-chip-remove")
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
    chip.className = "time-memo-tag-chip";
    chip.contentEditable = "false";
    chip.setAttribute("data-tag", tagNameTrim);
    chip.innerHTML = `<span class="time-memo-tag-chip-text">${escapeHtml(tagNameTrim)}</span><button type="button" class="time-memo-tag-chip-remove" aria-label="태그 삭제">&times;</button>`;
    chip
      .querySelector(".time-memo-tag-chip-remove")
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
          n.classList?.contains("time-memo-tag-chip")
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
        n.classList?.contains("time-memo-tag-chip")
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
        n.classList?.contains("time-memo-tag-chip")
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
      containerEl.classList.add("is-empty");
    else containerEl.classList.remove("is-empty");
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
  const taskInput = tr.querySelector(".time-input-task");
  const timeInput = tr.querySelector(".time-input-tracked");
  const startInput = tr.querySelector(".time-input-start");
  const endInput = tr.querySelector(".time-input-end");
  const prodWrap = tr.querySelector(
    ".time-cell-productivity .time-productivity-display-wrap",
  );
  const dateInput = tr.querySelector(".time-cell-date input[type='date']");
  const feedbackInput = tr.querySelector(".time-input-feedback");
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
  container.querySelectorAll(".time-row").forEach((tr) => {
    const row = collectRowFromTR(tr);
    if (!isEmptyTimeRow(row)) rows.push(row);
  });
  container.querySelectorAll(".time-ledger-mobile-card").forEach((card) => {
    if (card._rowData && !isEmptyTimeRow(card._rowData))
      rows.push(card._rowData);
  });
  return rows;
}

/** 모바일 카드용: 데스크탑 time-task-prod-bar와 동일한 생산성별 색상 */
function getProductivityBarColor(prod) {
  if (prod === "productive") return "rgba(232, 164, 184, 0.5)";
  if (prod === "nonproductive") return "rgba(126, 184, 218, 0.5)";
  return "rgba(124, 184, 124, 0.5)"; /* 기타(other) - 데스크탑 prod-bar--other */
}

/** 모바일 시간가계부 카드 생성 */
function createMobileTimeCard(rowData, onEdit, onDelete, viewEl) {
  const prod =
    rowData.productivity || getProductivityFromCategory(rowData.category) || "";
  const color = getProductivityBarColor(prod);
  const tracked = getMobileCardTrackedDisplayForRow(rowData);
  const timeRangeHtml = getMobileCardTimeRangeHtmlForRow(rowData) || "—";
  const hourlyRate =
    parseFloat(
      String(viewEl?.querySelector(".time-hourly-input")?.value || "0").replace(
        /,/g,
        "",
      ),
    ) || 0;
  const priceVal = computeMobileCardPriceValue(rowData, hourlyRate);
  const priceClass =
    priceVal < 0 ? " is-negative" : priceVal > 0 ? " is-positive" : "";
  const taskName = (rowData.taskName || "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const memo = (rowData.feedback || "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const expenseBlock = buildMobileCardExpenseBlockHtml(rowData);

  const card = document.createElement("div");
  card.className =
    "time-ledger-mobile-card" +
    (mobileCardNeedsLiveClock(rowData)
      ? " time-ledger-mobile-card--in-progress"
      : "");
  card._rowData = rowData;
  card._timeLedgerViewEl = viewEl || null;
  card._onRowDelete = onDelete;
  card.innerHTML = `
    <div class="time-mobile-card-leading">
      <div class="time-mobile-card-color-bar" style="background:${color}"></div>
    </div>
    <div class="time-mobile-card-body">
      <div class="time-mobile-card-header">
        <span class="time-mobile-card-task">${taskName}</span>
        <span class="time-mobile-card-tracked">${tracked}</span>
      </div>
      <div class="time-mobile-card-meta">
        <span class="time-mobile-card-time">${timeRangeHtml}</span>
        <span class="time-mobile-card-price${priceClass}">${formatPrice(priceVal)}</span>
      </div>
      ${memo ? `<div class="time-mobile-card-memo">${memo}</div>` : ""}
      ${expenseBlock}
    </div>
  `;
  card.addEventListener("click", (e) => {
    if (e.target.closest(".time-mobile-card-body")) onEdit(card, rowData);
  });
  return card;
}

/** 과제명 열 너비 변경 시 sticky left 위치 동기화 */
function updateStickyLefts(table) {
  if (!table) return;
  const taskEl = table.querySelector(".time-th-task");
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

/** 시간 기록 탭 요약: 데스크톱·숨김 패널용 5칸(마지막: 오늘 하루의 가치) */
const TIME_LEDGER_SUMMARY_FIVE_CELLS_HTML = `
    <div class="time-ledger-summary-cell">
      <div class="time-ledger-summary-label">총 기록 시간</div>
      <div class="time-ledger-summary-value"><span class="time-ledger-summary-num time-ledger-summary-tracked">0</span><span class="time-ledger-summary-unit">h</span><span class="time-ledger-summary-num time-ledger-summary-tracked">0</span><span class="time-ledger-summary-unit">m</span></div>
    </div>
    <div class="time-ledger-summary-cell">
      <div class="time-ledger-summary-label">생산적 시간</div>
      <div class="time-ledger-summary-value"><span class="time-ledger-summary-num time-ledger-summary-productive">0</span><span class="time-ledger-summary-unit">h</span><span class="time-ledger-summary-num time-ledger-summary-productive">0</span><span class="time-ledger-summary-unit">m</span></div>
    </div>
    <div class="time-ledger-summary-cell">
      <div class="time-ledger-summary-label">투자한 시급</div>
      <div class="time-ledger-summary-value time-ledger-summary-value--invested"><span class="time-ledger-summary-num time-ledger-summary-price time-ledger-summary-invested">+0</span><span class="time-ledger-summary-unit">원</span></div>
    </div>
    <div class="time-ledger-summary-cell">
      <div class="time-ledger-summary-label">낭비한 시급</div>
      <div class="time-ledger-summary-value time-ledger-summary-value--spent"><span class="time-ledger-summary-num time-ledger-summary-wasted time-ledger-summary-spent">-0</span><span class="time-ledger-summary-unit">원</span></div>
    </div>
    <div class="time-ledger-summary-cell">
      <div class="time-ledger-summary-label">오늘 하루의 가치</div>
      <div class="time-ledger-summary-value time-ledger-summary-value--day-net"><span class="time-ledger-summary-num time-ledger-summary-day-net">+0</span><span class="time-ledger-summary-unit">원</span></div>
    </div>`;

function createTableHTML() {
  return `
    <colgroup>
      <col class="time-col-task">
      <col class="time-col-start">
      <col class="time-col-end">
      <col class="time-col-tracked">
      <col class="time-col-category">
      <col class="time-col-productivity">
      <col class="time-col-date">
      <col class="time-col-price">
      <col class="time-col-feedback">
      <col class="time-col-memo-tag">
    </colgroup>
    <thead>
      <tr>
        <th class="time-th-task">과제명</th>
        <th class="time-th-start">시작시간</th>
        <th class="time-th-end">마감시간</th>
        <th class="time-th-tracked">사용 시간</th>
        <th class="time-th-category">카테고리</th>
        <th class="time-th-productivity">생산성</th>
        <th class="time-th-date">기록 날짜</th>
        <th class="time-th-price">행동의 가치</th>
        <th class="time-th-feedback">과제 메모</th>
        <th class="time-th-memo-tag">메모 태그</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content time-ledger-view";
  el.dataset.timeContentView = "all";
  const timeTabAbort = new AbortController();
  el._lpTabAbortController = timeTabAbort;
  const signal = timeTabAbort.signal;

  attachTimeLedgerTasksSaveListener();

  const storedRate = (() => {
    try {
      const v = localStorage.getItem(USER_HOURLY_RATE_KEY);
      const n = parseFloat(v);
      return Number.isNaN(n) ? 0 : n;
    } catch (_) {
      return 0;
    }
  })();
  const hourlyInput = document.createElement("input");
  hourlyInput.type = "hidden";
  hourlyInput.className = "time-hourly-input";
  hourlyInput.value = String(storedRate);
  el.appendChild(hourlyInput);

  const hourlyAddSlot = document.createElement("div");
  hourlyAddSlot.className = "time-hourly-add-slot";

  const ledgerTopHeading = document.createElement("div");
  ledgerTopHeading.className = "time-ledger-top-title";
  ledgerTopHeading.textContent = "시간 기록";

  const now = new Date();
  const filterType = "range";
  let filterYear = now.getFullYear();
  let filterMonth = now.getMonth() + 1;
  const {
    rangeStart: filterStartDateInit,
    rangeEnd: filterEndDateInit,
  } = readTimeLedgerSessionFilterRangeYmd();
  let filterStartDate = filterStartDateInit;
  let filterEndDate = filterEndDateInit;

  function persistActiveViewTimeFilterToSession() {
    const start = pickYmdFromFilter(startDateInput.value, filterStartDate);
    const end = pickYmdFromFilter(endDateInput.value, filterEndDate);
    try {
      if (typeof sessionStorage === "undefined") return;
      sessionStorage.setItem("lp_time_filter_start", start);
      sessionStorage.setItem("lp_time_filter_end", end);
    } catch (_) {}
  }
  /** 과제 필터: null = 전체, string[] = 선택한 과제만 표시 (히스토리 기준) */
  let selectedTaskNamesForFilter = null;

  const filterBar = document.createElement("div");
  filterBar.className = "time-filter-bar lp-date-range-host";
  filterBar.innerHTML = `
    <div class="time-filter-nav-cluster lp-date-range-cluster" data-filter-for="all">
      <div class="time-filter-range-wrap" data-filter-wrap="range">
        <div class="time-filter-date-field">
          <input type="date" class="time-filter-start-date" name="time-filter-start" aria-label="시작일" />
          <span class="time-filter-date-label time-filter-date-label--start" aria-hidden="true"></span>
          <img src="/toolbaricons/calendar-alt.svg" alt="" class="time-filter-date-cal-icon" width="14" height="14" aria-hidden="true" />
        </div>
        <span class="time-filter-range-sep" data-audit-range-hidden>~</span>
        <div class="time-filter-date-field">
          <input type="date" class="time-filter-end-date" name="time-filter-end" data-audit-range-hidden aria-label="종료일" />
          <span class="time-filter-date-label time-filter-date-label--end" aria-hidden="true"></span>
          <img src="/toolbaricons/calendar-alt.svg" alt="" class="time-filter-date-cal-icon" width="14" height="14" aria-hidden="true" />
        </div>
      </div>
      <div class="time-filter-day-nav">
        <button type="button" class="time-filter-day-prev" aria-label="이전 날짜">
          <img src="/toolbaricons/caret-left-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
        </button>
        <button type="button" class="time-filter-day-next" aria-label="다음 날짜">
          <img src="/toolbaricons/caret-right-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
        </button>
      </div>
    </div>
  `;

  const startDateInput = filterBar.querySelector(".time-filter-start-date");
  const endDateInput = filterBar.querySelector(".time-filter-end-date");
  const rangeWrap = filterBar.querySelector("[data-filter-wrap='range']");
  const filterNavCluster = filterBar.querySelector(".time-filter-nav-cluster");
  const taskSetupBtn = document.createElement("button");
  taskSetupBtn.type = "button";
  taskSetupBtn.className = "time-task-setup-btn";
  taskSetupBtn.dataset.filterFor = "all";
  taskSetupBtn.title = "과제명, 생산성, 카테고리를 한 번에 설정";
  taskSetupBtn.setAttribute("aria-label", "과제 설정");
  taskSetupBtn.innerHTML = TIME_LEDGER_TOOLBAR_SETTINGS_ICON_SVG;
  taskSetupBtn.classList.add(
    "time-ledger-tabs-settings-btn",
    "time-ledger-toolbar-icon-btn",
    APP_FOOTER_ICON_BTN_CLASS,
  );

  const taskSelectBtn = document.createElement("button");
  taskSelectBtn.type = "button";
  taskSelectBtn.className =
    "time-task-setup-btn time-filter-task-select-btn time-ledger-toolbar-icon-btn";
  taskSelectBtn.id = "time-task-select-btn";
  taskSelectBtn.title = "과제 선택";
  taskSelectBtn.setAttribute("aria-label", "과제 선택");
  taskSelectBtn.innerHTML = TIME_LEDGER_TOOLBAR_FILTER_ICON_SVG;
  taskSelectBtn.classList.add(APP_FOOTER_ICON_BTN_CLASS);

  /** YYYY-MM-DD → "2026. 05. 05(화)" — 필터·목록 일자(모바일·데스크탑 공통) */
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

  function syncTimeFilterDateLabels() {
    /* 모바일: navCluster가 contentWrap 툴바로 옮겨져도 같은 노드 — filterBar로 찾으면 라벨이 끊김 */
    const labelRoot = filterNavCluster || filterBar;
    const startLabel = labelRoot?.querySelector(".time-filter-date-label--start");
    const endLabel = labelRoot?.querySelector(".time-filter-date-label--end");
    const fmt = formatTimeFilterDateDotsWithWeekday;
    if (startLabel) {
      startLabel.textContent = fmt(startDateInput.value || filterStartDate);
    }
    if (endLabel) {
      endLabel.textContent = fmt(endDateInput.value || filterEndDate);
    }
  }

  startDateInput.value = filterStartDate;
  endDateInput.value = filterEndDate;
  syncTimeFilterDateLabels();

  function pickYmdFromFilter(raw, fallback) {
    const a = (raw && String(raw).trim()) || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(a)) return a;
    const b = (fallback && String(fallback).trim()) || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(b)) return b;
    return toDateStr(new Date());
  }

  /** 날짜 피커 구간이 바뀌면 서버에서 그 구간만 다시 받기 */
  function computePickerRangeKeyForPull() {
    const a = pickYmdFromFilter(startDateInput.value, filterStartDate);
    const b = pickYmdFromFilter(endDateInput.value, filterEndDate);
    return a <= b ? `${a}|${b}` : `${b}|${a}`;
  }
  let _pickerRangeKeyAtLastPullIntent = computePickerRangeKeyForPull();
  let _timeLedgerFilterPullTimer = null;

  function schedulePullTimeLedgerForPickerRange() {
    if (_timeLedgerFilterPullTimer) clearTimeout(_timeLedgerFilterPullTimer);
    _timeLedgerFilterPullTimer = setTimeout(async () => {
      _timeLedgerFilterPullTimer = null;
      if (!el.isConnected) return;
      const { rangeStart, rangeEnd } = readTimeLedgerCombinedPullRangeYmd();
      const ok = await pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd);
      if (ok && el.isConnected) refreshTimeLedgerFromRemotePull();
    }, 400);
  }

  function shiftFilterRangeByDays(delta) {
    const s0 = pickYmdFromFilter(startDateInput.value, filterStartDate);
    const e0 = pickYmdFromFilter(endDateInput.value, filterEndDate);
    const sd = new Date(`${s0}T12:00:00`);
    const ed = new Date(`${e0}T12:00:00`);
    if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) return;
    sd.setDate(sd.getDate() + delta);
    ed.setDate(ed.getDate() + delta);
    filterStartDate = toDateStr(sd);
    filterEndDate = toDateStr(ed);
    startDateInput.value = filterStartDate;
    endDateInput.value = filterEndDate;
    persistActiveViewTimeFilterToSession();
  }

  /* 모바일에서 툴바로 DOM만 옮겨지므로, 클러스터에 위임해 < > 탭이 항상 동일하게 동작 */
  filterNavCluster?.addEventListener("click", (e) => {
    const prev = e.target.closest(".time-filter-day-prev");
    const next = e.target.closest(".time-filter-day-next");
    if (!prev && !next) return;
    e.preventDefault();
    shiftFilterRangeByDays(prev ? -1 : 1);
    onFilterChange();
  });

  function openTimeLedgerFilterDateInput(inp) {
    if (!inp) return;
    try {
      inp.focus({ preventScroll: true });
    } catch (_) {
      inp.focus();
    }
    if (typeof inp.showPicker === "function") {
      try {
        inp.showPicker();
        return;
      } catch (_) {}
    }
    inp.click();
  }
  filterNavCluster?.querySelectorAll(".time-filter-date-field").forEach((field) => {
    const inp = field.querySelector('input[type="date"]');
    if (!inp) return;
    field.addEventListener("click", () => {
      openTimeLedgerFilterDateInput(inp);
    });
  });

  startDateInput.addEventListener("change", () => {
    const v = startDateInput.value;
    if (v) filterStartDate = v;
    onFilterChange();
  });
  startDateInput.addEventListener("input", syncTimeFilterDateLabels);
  endDateInput.addEventListener("change", () => {
    const v = endDateInput.value;
    if (v) filterEndDate = v;
    onFilterChange();
  });
  endDateInput.addEventListener("input", syncTimeFilterDateLabels);

  function onFilterChange(skipMerge = false) {
    const type = filterType;
    const rows = getFullRowsForFilter(skipMerge);
    cachedRows = rows;
    const y = filterYear;
    const m = filterMonth;
    const start = startDateInput.value || filterStartDate;
    const end = endDateInput.value || filterEndDate;
    let filtered = filterRowsByFilterType(rows, type, y, m, start, end);
    if (
      selectedTaskNamesForFilter != null &&
      selectedTaskNamesForFilter.length > 0
    ) {
      const set = new Set(selectedTaskNamesForFilter);
      filtered = filtered.filter((r) => set.has((r.taskName || "").trim()));
    }
    renderAll(filtered);
    updateTotal();
    syncTimeFilterDateLabels();
    persistActiveViewTimeFilterToSession();
    const pickerKeyNow = computePickerRangeKeyForPull();
    if (pickerKeyNow !== _pickerRangeKeyAtLastPullIntent) {
      _pickerRangeKeyAtLastPullIntent = pickerKeyNow;
      schedulePullTimeLedgerForPickerRange();
    }
  }

  /* filterBar는 월 드롭다운 패널이 세로로 열리므로 상단 탭 줄(overflow) 밖에 둠 */
  const tabsFilterRow = document.createElement("div");
  tabsFilterRow.className = "time-ledger-tabs-filter-row";
  window.addEventListener("resize", syncTimeFilterDateLabels, { signal });
  const tabsTopMargin = document.createElement("div");
  tabsTopMargin.className = "time-ledger-tabs-top-margin";
  const ledgerTopCenter = document.createElement("div");
  ledgerTopCenter.className = "time-ledger-top-strip__center";
  ledgerTopCenter.appendChild(ledgerTopHeading);

  /** 설정·필터·과제 기록(+) — 앱 푸터 공통: appFooterShell + main.css; 시간가계부 전용 래핑은 time-ledger.css */
  function syncAppFooterLedgerActions() {
    const slot = getAppFooterActionsSlot();
    if (!slot) return;
    const nodes = [taskSetupBtn, taskSelectBtn, hourlyAddSlot];
    for (const node of nodes) {
      if (node && node.parentElement !== slot) slot.appendChild(node);
    }
  }
  syncAppFooterLedgerActions();

  const tabHeaderRow = document.createElement("div");
  tabHeaderRow.className = "time-ledger-tab-header-row";
  tabHeaderRow.appendChild(ledgerTopCenter);
  tabsFilterRow.appendChild(tabsTopMargin);
  tabsFilterRow.appendChild(tabHeaderRow);

  /* 2행: 날짜·필터 */
  const filterAddRow = document.createElement("div");
  filterAddRow.className = "time-ledger-filter-add-row";
  filterAddRow.appendChild(filterBar);

  const mobileFilterTotalRow = document.createElement("div");
  mobileFilterTotalRow.className = "time-ledger-mobile-filter-total";
  mobileFilterTotalRow.setAttribute("hidden", "");
  mobileFilterTotalRow.innerHTML =
    '<span class="time-ledger-mobile-filter-total-inner"><span class="time-ledger-mobile-filter-total-label">전체</span><span class="time-ledger-mobile-filter-total-sep"> : </span><span class="time-ledger-mobile-filter-total-value" aria-label="필터 구간 전체 기록 시간">00:00</span></span>';

  el.appendChild(tabsFilterRow);
  el.appendChild(filterAddRow);
  el.appendChild(mobileFilterTotalRow);

  const taskSetupModal = document.createElement("div");
  taskSetupModal.className = "time-task-setup-modal";
  taskSetupModal.innerHTML = `
    <div class="time-task-setup-backdrop"></div>
    <div class="time-task-setup-panel">
      <div class="time-task-setup-header">
        <h3 class="time-task-setup-title">과제 설정</h3>
        <button type="button" class="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div class="time-task-setup-body">
        <button type="button" class="time-task-add-btn">+ 과제 추가하기</button>
        <div class="time-task-setup-tabs">
          <button type="button" class="time-task-setup-tab active" data-tab="all">전체</button>
          <button type="button" class="time-task-setup-tab" data-tab="productive">생산적</button>
          <button type="button" class="time-task-setup-tab" data-tab="nonproductive">비생산적</button>
          <button type="button" class="time-task-setup-tab" data-tab="other">그 외</button>
        </div>
        <div class="time-task-setup-subcats" data-subcat-bar style="display:none">
          <button type="button" class="time-task-setup-subcat-btn active" data-subcat="">전체</button>
        </div>
        <div class="time-task-setup-list-scroll">
          <div class="time-task-setup-list" data-tab-content="all"></div>
          <div class="time-task-setup-list" data-tab-content="productive" style="display:none"></div>
          <div class="time-task-setup-list" data-tab-content="nonproductive" style="display:none"></div>
          <div class="time-task-setup-list" data-tab-content="other" style="display:none"></div>
        </div>
      </div>
    </div>
  `;
  taskSetupModal.hidden = true;
  el.appendChild(taskSetupModal);

  const taskSelectModal = document.createElement("div");
  taskSelectModal.className = "time-task-setup-modal time-task-select-modal";
  taskSelectModal.innerHTML = `
    <div class="time-task-setup-backdrop"></div>
    <div class="time-task-setup-panel time-task-select-panel">
      <div class="time-task-setup-header">
        <h3 class="time-task-setup-title">과제 선택</h3>
        <button type="button" class="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div class="time-task-setup-body">
        <div class="time-task-select-actions">
          <button type="button" class="time-task-select-all-btn">전체 선택</button>
          <button type="button" class="time-task-select-none-btn">전체 해제</button>
        </div>
        <div class="time-task-select-list" data-task-select-list></div>
        <div class="time-task-select-footer">
          <button type="button" class="time-task-select-apply-btn">적용</button>
          <button type="button" class="time-task-select-clear-btn">필터 해제</button>
        </div>
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
      ".time-task-setup-backdrop",
    );
    const taskSelectClose = taskSelectModal.querySelector(
      ".time-task-setup-header .time-task-setup-close",
    );
    const taskSelectAllBtn = taskSelectModal.querySelector(
      ".time-task-select-all-btn",
    );
    const taskSelectNoneBtn = taskSelectModal.querySelector(
      ".time-task-select-none-btn",
    );
    const taskSelectApplyBtn = taskSelectModal.querySelector(
      ".time-task-select-apply-btn",
    );
    const taskSelectClearBtn = taskSelectModal.querySelector(
      ".time-task-select-clear-btn",
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
              ? '<span class="lp-task-badge lp-task-badge--kpi" title="KPI(맵)에서 연결된 과제입니다">KPI</span>'
              : "";
          const builtinMark = isTimeTaskBuiltinTemplate({ name })
            ? '<span class="lp-task-badge lp-task-badge--builtin" title="앱에서 제공하는 기본 과제입니다. 과제 설정에서 삭제할 수 없습니다.">기본</span>'
            : "";
          return `<label class="time-task-select-item"><input type="checkbox" class="time-task-select-cb" data-task-name="${attrEsc}" ${selectedSet === null || selectedSet.has(name) ? "checked" : ""} /><span class="time-task-select-item-text"><span class="time-task-select-item-name-part">${nameHtml}</span>${builtinMark}${kpiMark}</span></label>`;
        })
        .join("");
      if (names.length === 0)
        taskSelectList.innerHTML =
          '<p class="time-task-select-empty">기록된 과제가 없습니다.</p>';
      taskSelectModal.hidden = false;
    }

    function closeTaskSelectModal() {
      taskSelectModal.hidden = true;
    }

    el.querySelector("#time-task-select-btn")?.addEventListener(
      "click",
      openTaskSelectModal,
    );
    taskSelectClose?.addEventListener("click", closeTaskSelectModal);
    taskSelectAllBtn?.addEventListener("click", () => {
      taskSelectModal.querySelectorAll(".time-task-select-cb").forEach((cb) => {
        cb.checked = true;
      });
    });
    taskSelectNoneBtn?.addEventListener("click", () => {
      taskSelectModal.querySelectorAll(".time-task-select-cb").forEach((cb) => {
        cb.checked = false;
      });
    });
    taskSelectApplyBtn?.addEventListener("click", () => {
      const checked = [
        ...taskSelectModal.querySelectorAll(".time-task-select-cb:checked"),
      ].map((cb) => cb.dataset.taskName || "");
      selectedTaskNamesForFilter = checked.length === 0 ? null : checked;
      closeTaskSelectModal();
      onFilterChange();
      const btn = el.querySelector("#time-task-select-btn");
      if (btn)
        btn.classList.toggle(
          "is-active",
          selectedTaskNamesForFilter != null &&
            selectedTaskNamesForFilter.length > 0,
        );
    });
    taskSelectClearBtn?.addEventListener("click", () => {
      selectedTaskNamesForFilter = null;
      closeTaskSelectModal();
      onFilterChange();
      el.querySelector("#time-task-select-btn")?.classList.remove("is-active");
    });
  })();

  const addTaskModal = document.createElement("div");
  addTaskModal.className = "time-task-setup-modal time-add-task-modal";
  addTaskModal.innerHTML = `
    <div class="time-task-setup-backdrop"></div>
    <div class="time-task-setup-panel time-add-task-panel">
      <div class="time-task-setup-header">
        <h3 class="time-task-setup-title">과제 추가</h3>
        <button type="button" class="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div class="time-task-setup-body">
        <div class="time-add-task-field">
          <label>과제명</label>
          <input type="text" class="time-add-task-name" name="time-add-task-name" placeholder="과제명 입력" />
        </div>
        <div class="time-add-task-field">
          <label>생산성</label>
          <div class="time-add-task-productivity">
            <label class="time-add-task-radio"><input type="radio" name="addProd" value="productive" checked /> 생산적</label>
            <label class="time-add-task-radio"><input type="radio" name="addProd" value="nonproductive" /> 비생산적</label>
          </div>
        </div>
        <div class="time-add-task-field time-add-task-category-wrap">
          <label>카테고리</label>
          <div class="time-add-task-categories lp-choice-chip-row" data-for="productive"></div>
          <div class="time-add-task-categories lp-choice-chip-row" data-for="nonproductive" style="display:none"></div>
        </div>
        <button type="button" class="time-add-task-submit">추가</button>
        <button type="button" class="time-add-task-delete" hidden>과제 삭제</button>
      </div>
    </div>
  `;
  addTaskModal.hidden = true;
  el.appendChild(addTaskModal);

  const taskLogModal = document.createElement("div");
  taskLogModal.className = "time-task-setup-modal time-task-log-modal";
  taskLogModal.innerHTML = `
    <div class="time-task-setup-backdrop"></div>
    <div class="time-task-setup-panel time-task-log-panel">
      <div class="time-datetime-picker-backdrop" hidden></div>
      <div class="time-task-setup-header time-task-log-header">
        <h3 class="time-task-setup-title">과제 기록</h3>
        <button type="button" class="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div class="time-task-setup-body time-task-log-body">
        <div class="time-task-log-scroll-area">
        <div class="time-task-log-datetime-fields-wrap">
          <div class="time-task-log-field">
            <label>이 시간에 할 행동</label>
            <div class="time-task-log-task-wrap"></div>
          </div>
          <div class="time-task-log-field time-task-log-datetime-onerow">
            <div class="time-task-log-datetime-card lp-modal-datetime-card">
              <div class="time-task-log-datetime-input-row time-task-log-datetime-main-row">
                <div class="time-task-log-date-native-wrap">
                  <input type="date" class="time-task-log-date-start" name="time-task-log-date" data-hide-delete-btn="true" data-use-native-mobile="true" aria-label="기록 날짜" />
                  <span class="time-task-log-date-overlay" aria-hidden="true"></span>
                </div>
                <span class="time-task-log-datetime-sep" aria-hidden="true">–</span>
                <input type="text" class="time-task-log-time-start" name="time-task-log-time-start" lang="en" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="--:--" maxlength="5" autocomplete="off" inputmode="numeric" pattern="[0-9]*" aria-label="시작 시각" />
                <span class="time-task-log-datetime-sep" aria-hidden="true">–</span>
                <input type="text" class="time-task-log-time-end" name="time-task-log-time-end" lang="en" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="--:--" maxlength="5" autocomplete="off" inputmode="numeric" pattern="[0-9]*" aria-label="마감 시각" />
              </div>
            </div>
            <p class="time-task-log-time-order-warning" hidden role="alert">마감시간은 시작시간보다 빠를 수 없습니다.</p>
            <div class="time-task-log-quick-block">
            <span class="time-task-log-section-label time-task-log-quick-section-label">빠른 선택</span>
            <div class="time-task-log-time-adjust-btns">
              <button type="button" class="time-task-log-time-adjust-btn time-task-log-time-adjust-now" data-now="true">지금</button>
              <button type="button" class="time-task-log-time-adjust-btn time-task-log-time-adjust-last" data-last="true">마지막</button>
              <button type="button" class="time-task-log-time-adjust-btn" data-delta="-30">−30</button>
              <button type="button" class="time-task-log-time-adjust-btn" data-delta="-15">−15</button>
              <button type="button" class="time-task-log-time-adjust-btn" data-delta="15">+15</button>
              <button type="button" class="time-task-log-time-adjust-btn" data-delta="30">+30</button>
              <button type="button" class="time-task-log-time-adjust-btn" data-day-end="true">하루끝</button>
            </div>
            </div>
            <input type="hidden" class="time-task-log-start" />
            <input type="hidden" class="time-task-log-end" />
          </div>
        </div>
        <div class="time-task-log-kpi-todos-section" hidden>
          <h4 class="time-task-log-kpi-todos-title">할일 목록</h4>
          <div class="time-task-log-kpi-todos-list"></div>
        </div>
        <div class="time-task-log-daily-todos-section" hidden>
          <h4 class="time-task-log-daily-todos-title">매일 할일 목록</h4>
          <div class="time-task-log-daily-todos-list"></div>
        </div>
        <div class="time-task-log-memo-section">
          <span class="time-task-log-section-label time-task-log-memo-section-label">메모</span>
          <div class="time-task-log-memo-fields">
            <div class="time-task-log-field time-task-log-meal-detail-section" hidden>
              <label class="time-task-log-section-label time-task-log-meal-detail-label" for="time-task-log-meal-detail">식단명</label>
              <input type="text" id="time-task-log-meal-detail" class="time-task-log-meal-detail-input time-task-log-memo-input" placeholder="무엇을 드셨는지 한 줄로 적어 주세요" autocomplete="off" />
            </div>
            <div class="time-task-log-field">
              <textarea class="time-task-log-feedback time-task-log-memo-input" rows="3" placeholder="메모를 입력하세요"></textarea>
            </div>
            <div class="time-task-log-field">
              <span class="time-task-log-section-label">태그</span>
              <div class="time-task-log-tags-wrap">
                <input type="text" class="time-task-log-tag-input" placeholder="태그 입력 후 Enter" />
                <div class="time-task-log-tag-list"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="time-task-log-todo-row">
          <div class="time-task-log-link-row-head">
            <span class="time-task-log-todo-label time-task-log-link-strip-label">투두 리스트</span>
            <button type="button" class="time-task-log-todo-add-btn time-task-log-link-strip-add" aria-label="할일 추가">+</button>
          </div>
          <div class="time-task-log-todo-pills"></div>
        </div>
        <div class="time-task-log-expense-row">
          <div class="time-task-log-link-row-head">
            <span class="time-task-log-expense-label time-task-log-link-strip-label">소비 기록</span>
            <button type="button" class="time-task-log-expense-add-btn time-task-log-link-strip-add" aria-label="소비 기록 추가">+</button>
          </div>
          <div class="time-task-log-expense-pills"></div>
        </div>
        </div>
      </div>
      <div class="time-task-log-footer" data-task-log-footer>
        <button type="button" class="time-task-log-submit">기록</button>
        <button type="button" class="time-task-log-delete-btn" hidden>이 시간기록 삭제</button>
      </div>
      <div class="time-datetime-picker-wrap time-datetime-picker-bottom" hidden>
        <div class="time-datetime-picker-buttons-wrap">
          <div class="time-datetime-picker-header">
            <span class="time-datetime-picker-title"></span>
            <button type="button" class="time-datetime-picker-confirm">확인</button>
          </div>
          <div class="time-datetime-picker-buttons time-datetime-picker-offset-btns">
            <button type="button" class="time-datetime-picker-btn" data-offset="-30">-30</button>
            <button type="button" class="time-datetime-picker-btn" data-offset="-15">-15</button>
            <button type="button" class="time-datetime-picker-btn" data-offset="-5">-5</button>
            <button type="button" class="time-datetime-picker-btn" data-offset="5">+5</button>
            <button type="button" class="time-datetime-picker-btn" data-offset="15">+15</button>
            <button type="button" class="time-datetime-picker-btn" data-offset="30">+30</button>
          </div>
          <div class="time-datetime-picker-buttons time-datetime-picker-action-btns">
            <button type="button" class="time-datetime-picker-btn" data-action="last">마지막</button>
            <button type="button" class="time-datetime-picker-btn" data-action="now">지금</button>
            <button type="button" class="time-datetime-picker-btn" data-action="eod">하루의 끝</button>
          </div>
        </div>
        <div class="time-datetime-picker-wheels">
          <div class="time-datetime-picker-column" data-col="date"></div>
          <div class="time-datetime-picker-column" data-col="ampm"></div>
          <div class="time-datetime-picker-column" data-col="hour"></div>
          <div class="time-datetime-picker-column" data-col="minute"></div>
        </div>
      </div>
    </div>
    <div class="time-task-log-todo-inner-modal" hidden>
      <div class="time-task-log-todo-inner-backdrop"></div>
      <div class="time-task-log-todo-inner-panel">
        <div class="time-task-log-todo-inner-header time-task-setup-header time-task-log-header">
          <h3 class="time-task-setup-title time-task-log-todo-inner-header-label">투두리스트</h3>
          <button type="button" class="time-task-setup-close time-task-log-todo-inner-close" aria-label="닫기">&times;</button>
        </div>
        <div class="time-task-log-todo-inner-body">
          <div class="time-task-log-field">
            <label>카테고리</label>
            <div class="time-task-log-todo-category-wrap"></div>
          </div>
          <div class="time-task-log-field">
            <input type="text" class="time-task-log-todo-inner-name" placeholder="할 일 이름 입력" />
          </div>
        </div>
        <div class="time-task-log-todo-inner-footer">
          <button type="button" class="time-task-log-todo-inner-add">추가</button>
        </div>
      </div>
    </div>
    <div class="time-task-log-expense-inner-modal" hidden>
      <div class="time-task-log-expense-inner-backdrop"></div>
      <div class="time-task-log-expense-inner-panel">
        <div class="time-task-log-expense-inner-header time-task-setup-header time-task-log-header">
          <h3 class="time-task-setup-title">소비 기록</h3>
          <button type="button" class="time-task-setup-close time-task-log-expense-inner-close" aria-label="닫기">&times;</button>
        </div>
        <div class="time-task-log-expense-inner-body">
          <div class="time-task-log-expense-inner-fields">
            <div class="time-task-log-expense-amount-name-row">
              <div class="time-task-log-field">
                <label>금액</label>
                <div class="time-task-log-expense-amount-wrap">
                  <input type="text" class="time-task-log-expense-amount" name="time-task-log-expense-amount" placeholder="0" inputmode="numeric" />
                  <span class="time-task-log-expense-amount-unit">원</span>
                </div>
              </div>
              <div class="time-task-log-field">
                <label>소비명</label>
                <input type="text" class="time-task-log-expense-name" name="time-task-log-expense-name" placeholder="스타벅스" />
              </div>
            </div>
            <div class="time-task-log-field">
              <label>소비 분류</label>
              <div class="time-task-log-expense-classification-wrap"></div>
            </div>
            <div class="time-task-log-expense-error" hidden></div>
            <button type="button" class="time-task-log-expense-inner-add-btn">추가</button>
          </div>
          <div class="time-task-log-expense-added-list"></div>
        </div>
      </div>
    </div>
  `;
  taskLogModal.hidden = true;
  el.appendChild(taskLogModal);

  const taskLogPickerWrap = taskLogModal.querySelector(
    ".time-datetime-picker-wrap",
  );
  const taskLogPickerBackdrop = taskLogModal.querySelector(
    ".time-datetime-picker-backdrop",
  );

  function closeDateTimePicker() {
    taskLogPickerWrap.hidden = true;
    taskLogPickerBackdrop.hidden = true;
  }


  const taskLogTitleEl = taskLogModal.querySelector(".time-task-setup-title");
  const taskLogFooterEl = taskLogModal.querySelector("[data-task-log-footer]");
  const taskLogTaskWrap = taskLogModal.querySelector(
    ".time-task-log-task-wrap",
  );
  const taskLogStartInput = taskLogModal.querySelector(".time-task-log-start");
  const taskLogEndInput = taskLogModal.querySelector(".time-task-log-end");
  const taskLogDateStart = taskLogModal.querySelector(
    ".time-task-log-date-start",
  );
  const taskLogTimeStart = taskLogModal.querySelector(
    ".time-task-log-time-start",
  );
  const taskLogTimeEnd = taskLogModal.querySelector(".time-task-log-time-end");
  const taskLogTimeOrderWarning = taskLogModal.querySelector(
    ".time-task-log-time-order-warning",
  );
  let taskLogEditTr = null;
  const taskLogEndWrap = taskLogModal.querySelector(
    ".time-task-log-datetime-wrap-end",
  );
  const taskLogFeedbackInput = taskLogModal.querySelector(
    ".time-task-log-feedback",
  );
  const taskLogMealDetailSection = taskLogModal.querySelector(
    ".time-task-log-meal-detail-section",
  );
  const taskLogMealDetailInput = taskLogModal.querySelector(
    ".time-task-log-meal-detail-input",
  );
  function updateTaskLogMealDetailVisibility(taskName) {
    const show = AUDIT_UNHEALTHY_MEAL_TASK_NAMES.has((taskName || "").trim());
    if (taskLogMealDetailSection) {
      taskLogMealDetailSection.hidden = !show;
      if (!show && taskLogMealDetailInput) taskLogMealDetailInput.value = "";
    }
  }
  const taskLogTagInput = taskLogModal.querySelector(
    ".time-task-log-tag-input",
  );
  const taskLogTagListEl = taskLogModal.querySelector(
    ".time-task-log-tag-list",
  );
  let taskLogMemoTags = [];

  function renderTaskLogTagPills() {
    if (!taskLogTagListEl) return;
    taskLogTagListEl.innerHTML = "";
    taskLogMemoTags.forEach((tag, i) => {
      const pill = document.createElement("span");
      pill.className = "time-memo-tag-chip time-task-log-tag-pill";
      pill.setAttribute("data-tag", tag);
      pill.innerHTML = `<span class="time-memo-tag-chip-text">${escapeHtml(tag)}</span><button type="button" class="time-memo-tag-chip-remove" aria-label="태그 삭제">&times;</button>`;
      pill
        .querySelector(".time-memo-tag-chip-remove")
        ?.addEventListener("click", (e) => {
          e.preventDefault();
          taskLogMemoTags = taskLogMemoTags.filter((_, idx) => idx !== i);
          renderTaskLogTagPills();
        });
      taskLogTagListEl.appendChild(pill);
    });
  }

  taskLogTagInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      if (e.isComposing) return;
      e.preventDefault();
      const val = (taskLogTagInput?.value || "").trim().replace(/^#/, "");
      if (val && !taskLogMemoTags.includes(val)) {
        taskLogMemoTags.push(val);
        renderTaskLogTagPills();
        if (taskLogTagInput) taskLogTagInput.value = "";
      }
    }
  });

  /* 메모 + 버튼 → 내부 모달 (레거시, 미사용) */
  const taskLogMemoAddBtn = taskLogModal.querySelector(
    ".time-task-log-memo-add-btn",
  );
  const taskLogMemoInnerModal = taskLogModal.querySelector(
    ".time-task-log-memo-inner-modal",
  );
  const taskLogMemoInnerBackdrop = taskLogModal.querySelector(
    ".time-task-log-memo-inner-backdrop",
  );
  const taskLogMemoInnerInput = taskLogModal.querySelector(
    ".time-task-log-memo-inner-input",
  );
  const taskLogMemoInnerTagInput = taskLogModal.querySelector(
    ".time-task-log-memo-inner-tag-input",
  );
  const taskLogMemoInnerTagList = taskLogModal.querySelector(
    ".time-task-log-memo-inner-tag-list",
  );
  const taskLogMemoInnerCancel = taskLogModal.querySelector(
    ".time-task-log-memo-inner-cancel",
  );
  const taskLogMemoInnerAdd = taskLogModal.querySelector(
    ".time-task-log-memo-inner-add",
  );

  let taskLogMemoModalTags = [];

  function renderMemoModalTagPills() {
    if (!taskLogMemoInnerTagList) return;
    taskLogMemoInnerTagList.innerHTML = "";
    taskLogMemoModalTags.forEach((tag, i) => {
      const pill = document.createElement("span");
      pill.className = "time-memo-tag-chip time-task-log-tag-pill";
      pill.innerHTML = `<span class="time-memo-tag-chip-text">${escapeHtml(tag)}</span><button type="button" class="time-memo-tag-chip-remove" aria-label="태그 삭제">&times;</button>`;
      pill
        .querySelector(".time-memo-tag-chip-remove")
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
    renderTaskLogTagPills();
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

  /* 메모 & 태그: 태그 입력 후 Enter → pill 추가 */
  taskLogTagInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      if (e.isComposing) return;
      e.preventDefault();
      const val = (taskLogTagInput.value || "").trim().replace(/^#/, "");
      if (val && !taskLogMemoTags.includes(val)) {
        taskLogMemoTags.push(val);
        renderTaskLogTagPills();
        taskLogTagInput.value = "";
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
    taskLogDateStart.classList.toggle("time-task-log-date-has-value", has);
    const wrap = taskLogDateStart.closest(".time-task-log-date-native-wrap");
    if (wrap?.classList) {
      wrap.classList.toggle("time-task-log-date-native-wrap--has-value", has);
    }
    const ov = wrap?.querySelector?.(".time-task-log-date-overlay");
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
      date =
        parseDateFromDateTime(prevHidden) || taskLogDefaultRecordYmd();
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
        !(String(taskLogDateStart.value || "").trim()) &&
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
    taskLogEndWrap?.classList.toggle("has-value", hasValue);
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
    !!ev.relatedTarget?.closest?.(".time-task-log-time-adjust-btns");

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
    taskLogModal.querySelectorAll(".time-task-log-time-adjust-btn").forEach((b) => {
      b.classList.toggle(
        "time-task-log-time-adjust-active",
        !!(btn && b === btn),
      );
    });
  }

  taskLogModal
    .querySelectorAll(".time-task-log-time-adjust-btn")
    .forEach((btn) => {
      /* 데스크탑: 버튼으로 포커스가 빠지며 blur→syncEndToHidden이 먼저 돌아 마감 hidden이 비는 순서 경합 방지 */
      btn.addEventListener("mousedown", (e) => {
        if (e.button === 0) e.preventDefault();
      });
      btn.addEventListener("click", () => {
        const endVal = (taskLogTimeEnd?.value || "").trim();
        const endHasTime = endVal && endVal.match(/\d{1,2}:\d{2}/);
        /* 마감이 비어 있는데 날짜/시작만 포커스된 경우 lastFocused가 "start"로 남음 → 지금/마지막/±가 시작에만 들어가던 문제 방지 */
        const targetIsStart =
          lastFocusedTimeField === "start" && endHasTime;

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

  const taskLogExpenseAddBtn = taskLogModal.querySelector(
    ".time-task-log-expense-add-btn",
  );
  const taskLogExpenseInnerModal = taskLogModal.querySelector(
    ".time-task-log-expense-inner-modal",
  );
  const taskLogExpenseInnerBackdrop = taskLogModal.querySelector(
    ".time-task-log-expense-inner-backdrop",
  );
  const taskLogExpenseNameInput = taskLogModal.querySelector(
    ".time-task-log-expense-name",
  );
  const taskLogExpenseClassificationWrap = taskLogModal.querySelector(
    ".time-task-log-expense-classification-wrap",
  );
  const taskLogExpenseAmountInput = taskLogModal.querySelector(
    ".time-task-log-expense-amount",
  );
  const taskLogExpenseErrorEl = taskLogModal.querySelector(
    ".time-task-log-expense-error",
  );
  const taskLogExpenseInnerList = taskLogModal.querySelector(
    ".time-task-log-expense-added-list",
  );
  const taskLogExpensePills = taskLogModal.querySelector(
    ".time-task-log-expense-pills",
  );
  const taskLogExpenseInnerAdd = taskLogModal.querySelector(
    ".time-task-log-expense-inner-add-btn",
  );
  const taskLogExpenseInnerClose = taskLogModal.querySelector(
    ".time-task-log-expense-inner-close",
  );
  const taskLogTodoAddBtn = taskLogModal.querySelector(
    ".time-task-log-todo-add-btn",
  );
  const taskLogTodoPills = taskLogModal.querySelector(
    ".time-task-log-todo-pills",
  );
  const taskLogTodoInnerModal = taskLogModal.querySelector(
    ".time-task-log-todo-inner-modal",
  );
  const taskLogTodoCategoryWrap = taskLogModal.querySelector(
    ".time-task-log-todo-category-wrap",
  );
  const taskLogTodoInnerName = taskLogModal.querySelector(
    ".time-task-log-todo-inner-name",
  );
  const taskLogTodoInnerClose = taskLogModal.querySelector(
    ".time-task-log-todo-inner-close",
  );
  const taskLogTodoInnerAdd = taskLogModal.querySelector(
    ".time-task-log-todo-inner-add",
  );
  const taskLogTodoInnerBackdrop = taskLogModal.querySelector(
    ".time-task-log-todo-inner-backdrop",
  );
  const taskLogKpiTodosSection = taskLogModal.querySelector(
    ".time-task-log-kpi-todos-section",
  );
  const taskLogKpiTodosList = taskLogModal.querySelector(
    ".time-task-log-kpi-todos-list",
  );
  const taskLogDailyTodosSection = taskLogModal.querySelector(
    ".time-task-log-daily-todos-section",
  );
  const taskLogDailyTodosList = taskLogModal.querySelector(
    ".time-task-log-daily-todos-list",
  );
  const taskLogSubmitBtn = taskLogModal.querySelector(".time-task-log-submit");
  const taskLogCloseBtn = taskLogModal.querySelector(
    ".time-task-setup-panel .time-task-setup-close",
  );

  /* 아코디언: 한 번에 하나만 열림, 열린 걸 다시 누르면 닫힘 */
  taskLogModal
    .querySelectorAll(".time-task-log-accordion-header")
    .forEach((header) => {
      header.addEventListener("click", (e) => {
        if (e.target.closest("label")) return;
        const item = header.closest(".time-task-log-accordion-item");
        if (!item) return;
        const body = item.querySelector(".time-task-log-accordion-body");
        const chevron = item.querySelector(".time-task-log-accordion-chevron");
        const isExpanded = item.classList.contains(
          "time-task-log-accordion-expanded",
        );
        if (isExpanded) {
          item.classList.remove("time-task-log-accordion-expanded");
          header.setAttribute("aria-expanded", "false");
          if (chevron) chevron.textContent = "▶";
          if (body) body.hidden = true;
        } else {
          taskLogModal
            .querySelectorAll(".time-task-log-accordion-item")
            .forEach((other) => {
              if (other === item) return;
              other.classList.remove("time-task-log-accordion-expanded");
              const otherHeader = other.querySelector(
                ".time-task-log-accordion-header",
              );
              const otherBody = other.querySelector(
                ".time-task-log-accordion-body",
              );
              const otherChevron = other.querySelector(
                ".time-task-log-accordion-chevron",
              );
              if (otherHeader)
                otherHeader.setAttribute("aria-expanded", "false");
              if (otherBody) otherBody.hidden = true;
              if (otherChevron) otherChevron.textContent = "▶";
            });
          item.classList.add("time-task-log-accordion-expanded");
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
      ".time-task-log-accordion-item:not(.time-task-log-accordion-expanded) .time-task-log-accordion-body",
    )
    .forEach((body) => {
      body.hidden = true;
    });
  taskLogModal
    .querySelectorAll(
      ".time-task-log-accordion-item:not(.time-task-log-accordion-expanded) .time-task-log-accordion-chevron",
    )
    .forEach((chevron) => {
      chevron.textContent = "▶";
    });

  let taskLogTaskDropdown = null;
  let taskLogAddContext = null;
  let pendingEditStartTime = "";

  function buildTaskDropdown() {
    const LEDGER_BUCKET_CHIPS = [
      { id: "dream", label: "꿈" },
      { id: "happiness", label: "행복" },
      { id: "sideincome", label: "부수입" },
      { id: "health", label: "건강" },
      { id: "nonproductive", label: "비생산" },
      { id: "other", label: "그외" },
    ];

    function timeLedgerTaskLogPickerBucket(t) {
      let prod = String(t?.productivity ?? "").trim().toLowerCase();
      if (!prod) {
        prod = String(
          getProductivityFromCategory(String(t?.category ?? "").trim()) ||
            "",
        ).toLowerCase();
      }
      if (prod === "nonproductive") return "nonproductive";
      if (prod === "other") return "other";
      const cat = String(t?.category ?? "").trim().toLowerCase();
      if (cat === "dream") return "dream";
      if (cat === "happiness") return "happiness";
      if (cat === "sideincome") return "sideincome";
      if (cat === "health") return "health";
      return "other";
    }

    const wrap = document.createElement("div");
    wrap.className = "time-task-log-task-dropdown";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "time-task-log-task-dropdown-trigger";
    trigger.textContent = "과제를 선택하세요";
    const panel = document.createElement("div");
    panel.className =
      "time-task-log-task-dropdown-panel time-task-log-task-dropdown-panel--ledger-buckets";
    panel.hidden = true;
    let value = "";
    let searchQuery = "";
    let pickerBucket = "dream";

    function renderOptions(container, filter) {
      container.innerHTML = "";
      const q = (filter || "").trim().toLowerCase();
      const allTasks = getFullTaskOptions();
      let tasks = allTasks.filter((t) => !(t.name || "").includes(" > "));
      if (!q) {
        tasks = tasks.filter(
          (t) => timeLedgerTaskLogPickerBucket(t) === pickerBucket,
        );
      }
      if (q) {
        tasks = tasks.filter((t) => (t.name || "").toLowerCase().includes(q));
      }
      tasks.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
      tasks.forEach((t) => {
        const row = document.createElement("div");
        row.className = "time-task-log-task-dropdown-option";
        const prod = (
          t.productivity ||
          getProductivityFromCategory(t.category) ||
          "productive"
        ).trim();
        const barClass =
          prod === "productive"
            ? "time-task-prod-bar time-task-prod-bar--productive"
            : prod === "nonproductive"
              ? "time-task-prod-bar time-task-prod-bar--nonproductive"
              : "time-task-prod-bar time-task-prod-bar--other";
        const bar = document.createElement("span");
        bar.className = barClass;
        bar.setAttribute("aria-hidden", "true");
        const textWrap = document.createElement("span");
        textWrap.className = "time-task-log-task-dropdown-option-text";
        const label = document.createElement("span");
        label.className = "time-task-log-task-dropdown-option-label";
        label.textContent = t.name || "";
        textWrap.appendChild(label);
        appendTaskDropdownBadges(textWrap, t);
        row.appendChild(bar);
        row.appendChild(textWrap);
        const closePanelAndSelect = () => {
          value = t.name || "";
          trigger.textContent = value || "과제를 선택하세요";
          panel.hidden = true;
          onTaskSelectedForLog(value);
        };
        row.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          closePanelAndSelect();
        });
        row.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          closePanelAndSelect();
        });
        container.appendChild(row);
      });
    }

    function renderPanel() {
      panel.innerHTML = "";
      let optionsContainer = null;

      const searchWrap = document.createElement("div");
      searchWrap.className = "time-task-log-task-dropdown-search-wrap";
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "과제 검색...";
      searchInput.className = "time-task-log-task-dropdown-search";
      searchInput.value = searchQuery;
      searchInput.setAttribute("autocomplete", "off");
      searchWrap.appendChild(searchInput);
      panel.appendChild(searchWrap);

      const chipsWrap = document.createElement("div");
      chipsWrap.className = "time-task-log-task-dropdown-buckets";
      chipsWrap.setAttribute("role", "tablist");
      chipsWrap.setAttribute("aria-label", "과제 구역");
      LEDGER_BUCKET_CHIPS.forEach(({ id, label: chipLabel }) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "time-task-log-task-dropdown-bucket";
        b.dataset.bucket = id;
        b.textContent = chipLabel;
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", id === pickerBucket ? "true" : "false");
        if (id === pickerBucket) b.classList.add("is-active");
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          pickerBucket = id;
          chipsWrap.querySelectorAll(".time-task-log-task-dropdown-bucket").forEach((x) => {
            const on = x.dataset.bucket === id;
            x.classList.toggle("is-active", on);
            x.setAttribute("aria-selected", on ? "true" : "false");
          });
          if (optionsContainer) {
            renderOptions(optionsContainer, searchQuery);
          }
        });
        chipsWrap.appendChild(b);
      });
      panel.appendChild(chipsWrap);

      optionsContainer = document.createElement("div");
      optionsContainer.className = "time-task-log-task-dropdown-options";
      panel.appendChild(optionsContainer);
      searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value.trim();
        renderOptions(optionsContainer, searchQuery);
      });
      searchInput.addEventListener("click", (e) => e.stopPropagation());
      searchInput.addEventListener("keydown", (e) => e.stopPropagation());
      renderOptions(optionsContainer, searchQuery);
    }

    trigger.addEventListener("click", () => {
      searchQuery = "";
      pickerBucket = "dream";
      renderPanel();
      panel.hidden = !panel.hidden;
      if (!panel.hidden)
        panel.querySelector(".time-task-log-task-dropdown-search")?.focus();
    });
    const closePanelOnOutside = (e) => {
      if (panel.hidden) return;
      if (!wrap.contains(e.target)) panel.hidden = true;
    };
    document.addEventListener("mousedown", closePanelOnOutside, {
      capture: true,
      signal,
    });
    document.addEventListener("touchstart", closePanelOnOutside, {
      capture: true,
      signal,
    });
    wrap.appendChild(trigger);
    wrap.appendChild(panel);
    wrap._getValue = () => value;
    wrap._setValue = (v) => {
      value = v || "";
      trigger.textContent = value || "과제를 선택하세요";
      onTaskSelectedForLog(value);
    };
    return wrap;
  }

  const taskLogPickerTitle = taskLogPickerWrap.querySelector(
    ".time-datetime-picker-title",
  );

  function createDateTimePickerModal(getOtherValue, onConfirm) {
    const wrap = taskLogPickerWrap;
    const colDate = wrap.querySelector('[data-col="date"]');
    const colAmpm = wrap.querySelector('[data-col="ampm"]');
    const colHour = wrap.querySelector('[data-col="hour"]');
    const colMinute = wrap.querySelector('[data-col="minute"]');
    const confirmBtn = wrap.querySelector(".time-datetime-picker-confirm");
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
          spacer.className = "time-datetime-picker-spacer";
          container.appendChild(spacer);
        }
        items.forEach((item) => {
          const div = document.createElement("div");
          div.className = "time-datetime-picker-option";
          div.textContent = typeof format === "function" ? format(item) : item;
          div.dataset.value = String(
            typeof item === "object"
              ? item instanceof Date
                ? item.getTime()
                : item
              : item,
          );
          if (String(selectedVal) === div.dataset.value)
            div.classList.add("selected");
          div.addEventListener("click", () => {
            container
              .querySelectorAll(".time-datetime-picker-option")
              .forEach((o) => o.classList.remove("selected"));
            div.classList.add("selected");
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
          spacer.className = "time-datetime-picker-spacer";
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
            ".time-datetime-picker-option.selected",
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
      const opts = col.querySelectorAll(".time-datetime-picker-option");
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
        .querySelectorAll(".time-datetime-picker-option")
        .forEach((o) => o.classList.remove("selected"));
      centered.classList.add("selected");
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

    wrap.querySelectorAll(".time-datetime-picker-btn").forEach((btn) => {
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
        .closest(".time-task-log-panel")
        ?.querySelector(".time-datetime-picker-backdrop");
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
          .closest(".time-task-log-panel")
          ?.querySelector(".time-datetime-picker-backdrop");
        if (backdrop) backdrop.hidden = false;
        setTimeout(() => {
          skipScrollSync = false;
        }, 150);
      },
    };
  }

  /** 소비 기록 모달 전용: 소비 분류(지출은 글만) + 결제수단 선택 */
  function buildExpenseClassificationByFlowTypeButtons(
    getFlowType,
    initialValue,
    onUpdate,
  ) {
    const wrap = document.createElement("div");
    wrap.className = "time-task-log-expense-classification-btns";
    const hint = document.createElement("span");
    hint.className = "time-task-log-expense-classification-hint";
    hint.textContent = "큰분류(입금/지출)를 먼저 선택해 주세요.";
    const btnsWrap = document.createElement("div");
    btnsWrap.className = "lp-choice-chip-row time-task-log-expense-cls-btns-wrap";
    let value = (initialValue || "").trim();
    let payment = "";
    /** 지출 전용: "all" | "payment" | "done" */
    let expenseStep = "all";

    function renderButtons() {
      const flowType = (getFlowType && getFlowType()) || "";
      btnsWrap.innerHTML = "";
      const isExpense = flowType === "지출";
      const opts = isExpense
        ? EXPENSE_MODAL_CLASSIFICATIONS
        : getClassificationsByFlowType(flowType);
      if (!flowType || opts.length === 0) {
        hint.hidden = false;
        hint.textContent = "큰분류(입금/지출)를 먼저 선택해 주세요.";
        value = "";
        payment = "";
        expenseStep = "all";
        return;
      }
      hint.hidden = true;

      const paymentOptions = getPaymentOptions && getPaymentOptions();

      function makeClsBtn(opt, selected, onClick) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lp-choice-chip";
        if (selected) btn.classList.add("lp-choice-chip--on");
        btn.dataset.label = opt.label;
        const svgInnerPaths =
          isExpense ? "" : (opt.svg || (flowType === "입금" ? BAG_DOLLAR_PATHS_INNER : ""));
        if (svgInnerPaths) {
          btn.classList.add("lp-choice-chip--has-icon");
          btn.innerHTML = `<span class="lp-choice-chip__icon"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${svgInnerPaths}</svg></span><span class="lp-choice-chip__label">${escapeHtml(opt.label)}</span>`;
        } else {
          btn.innerHTML = `<span class="lp-choice-chip__label">${escapeHtml(opt.label)}</span>`;
        }
        btn.addEventListener("click", onClick);
        return btn;
      }

      if (isExpense && (expenseStep === "payment" || expenseStep === "done") && value) {
        const selectedOpt = EXPENSE_MODAL_CLASSIFICATIONS.find((o) => o.label === value);
        if (selectedOpt) {
          const clsBtn = makeClsBtn(selectedOpt, true, () => {
            expenseStep = "all";
            value = "";
            payment = "";
            renderButtons();
            onUpdate?.("");
          });
          clsBtn.title = "다시 누르면 분류 수정";
          btnsWrap.appendChild(clsBtn);
        }
        (paymentOptions || ["현금", "체크카드", "신용카드"]).forEach((opt) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "lp-choice-chip";
          btn.dataset.payment = opt;
          btn.innerHTML = `<span class="lp-choice-chip__label">${escapeHtml(opt)}</span>`;
          if (payment === opt) btn.classList.add("lp-choice-chip--on");
          btn.addEventListener("click", () => {
            payment = opt;
            expenseStep = "done";
            renderButtons();
            onUpdate?.(value);
          });
          btnsWrap.appendChild(btn);
        });
        return;
      }

      const valid = opts.some((o) => o.label === value);
      if (!valid) {
        value = "";
        payment = "";
        expenseStep = "all";
      }
      opts.forEach((opt) => {
        const btn = makeClsBtn(opt, value === opt.label, () => {
          if (isExpense) {
            value = opt.label;
            expenseStep = "payment";
            payment = "";
            renderButtons();
            onUpdate?.(value);
          } else {
            value = value === opt.label ? "" : opt.label;
            btnsWrap
              .querySelectorAll(".lp-choice-chip[data-label]")
              .forEach((b) =>
                b.classList.toggle("lp-choice-chip--on", b.dataset.label === value),
              );
            onUpdate?.(value);
          }
        });
        btnsWrap.appendChild(btn);
      });
    }

    wrap.appendChild(hint);
    wrap.appendChild(btnsWrap);
    wrap._getValue = () => value;
    wrap._getPaymentValue = () => payment;
    wrap._setValue = (v) => {
      value = (v || "").trim();
      payment = "";
      expenseStep = "all";
      renderButtons();
    };
    wrap._setFlowType = () => {
      payment = "";
      expenseStep = "all";
      renderButtons();
    };
    renderButtons();
    return wrap;
  }

  /* 소비 기록 모달: 항상 지출만 기록, 큰분류 선택 없음 */
  const expenseClassificationButtons = buildExpenseClassificationByFlowTypeButtons(
    () => "지출",
    "",
    () => {},
  );

  taskLogExpenseClassificationWrap?.appendChild(expenseClassificationButtons);

  function onTaskSelectedForLog(taskName) {
    refreshKpiTodosInLogModal(taskName);
    updateTaskLogMealDetailVisibility(taskName);
  }

  function refreshKpiTodosInLogModal(taskName) {
    const name = (taskName || "").trim();
    if (taskLogKpiTodosSection) {
      taskLogKpiTodosSection.hidden = true;
      if (taskLogKpiTodosList) taskLogKpiTodosList.innerHTML = "";
    }

    if (!taskLogDailyTodosSection || !taskLogDailyTodosList) return;
    const taskLogDailyTodosTitle = taskLogModal.querySelector(
      ".time-task-log-daily-todos-title",
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
    const dailyInfo = getKpiDailyRepeatInfoByKpiName(name);
    const dietNames = listWorkScheduleDietTypeNamesFromMem();

    if (dailyInfo && dailyInfo.needHabitTracker) {
      if (taskLogDailyTodosTitle)
        taskLogDailyTodosTitle.textContent = DEFAULT_DAILY_TODOS_TITLE;
      taskLogDailyTodosSection.hidden = false;
      taskLogDailyTodosList.innerHTML = "";
      const { storageKey: dailyStorageKey, kpiId: dailyKpiId, dailyTodos } =
        dailyInfo;
      const fromLog =
        dateYmd.length >= 10
          ? getHabitTrackerDailyCompletedForDate(
              dailyStorageKey,
              dailyKpiId,
              dateYmd,
            )
          : [];
      const logCheckedIds = new Set(
        fromLog.map((x) => String(x.id || "").trim()).filter(Boolean),
      );
      dailyTodos.forEach((todo) => {
        const label = document.createElement("label");
        label.className =
          "time-task-log-kpi-todo-row time-task-log-daily-todo-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = logCheckedIds.has(String(todo.id || "").trim());
        checkbox.dataset.todoId = todo.id;
        const span = document.createElement("span");
        span.className = "time-task-log-kpi-todo-text";
        span.textContent = todo.text || "";
        if (checkbox.checked) span.classList.add("is-done");
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
          span.classList.toggle("is-done", checkbox.checked);
        });
        taskLogDailyTodosList.appendChild(label);
      });
      return;
    }

    if (
      WS_DIET_LEDGER_TASK_NAMES.has(name) &&
      dateYmd.length >= 10 &&
      dietNames.length > 0
    ) {
      if (taskLogDailyTodosTitle)
        taskLogDailyTodosTitle.textContent = "등록한 식단";
      taskLogDailyTodosSection.hidden = false;
      taskLogDailyTodosList.innerHTML = "";
      const saved = getMealChecklistState(dateYmd, name);
      dietNames.forEach((dietLabel) => {
        const label = document.createElement("label");
        label.className =
          "time-task-log-kpi-todo-row time-task-log-daily-todo-row";
        label.dataset.mealChecklist = "1";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = !!saved[dietLabel];
        const span = document.createElement("span");
        span.className = "time-task-log-kpi-todo-text";
        span.textContent = dietLabel;
        if (checkbox.checked) span.classList.add("is-done");
        label.appendChild(checkbox);
        label.appendChild(span);
        checkbox.addEventListener("change", () => {
          setMealChecklistItem(dateYmd, name, dietLabel, checkbox.checked);
          span.classList.toggle("is-done", checkbox.checked);
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

  window.addEventListener("work-schedule-saved", () => {
    if (!taskLogModal || taskLogModal.hidden) return;
    const tn = taskLogTaskDropdown?._getValue?.() || "";
    if (tn) refreshKpiTodosInLogModal(tn);
  });

  function setupScoreButtons(container, getValue, setValue) {
    if (!container) return;
    container.querySelectorAll(".time-task-log-score-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.value || "";
        container
          .querySelectorAll(".time-task-log-score-btn")
          .forEach((b) => b.classList.remove("selected"));
        if (getValue() === val) {
          setValue("");
        } else {
          setValue(val);
          btn.classList.add("selected");
        }
      });
    });
  }
  function updateScoreBtnStates(container, value) {
    if (!container) return;
    container.querySelectorAll(".time-task-log-score-btn").forEach((b) => {
      b.classList.toggle("selected", b.dataset.value === value);
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
  /** 할일 일정탭 리스트(todo-section-tasks)에 이름만 추가. KPI 불필요. */
  function addTodoNameToSection(sectionId, name) {
    const todoName = (name || "").trim();
    if (!todoName) return false;
    const VALID_SECTIONS = [
      "dream",
      "sideincome",
      "happy",
      "health",
    ];
    if (!VALID_SECTIONS.includes(sectionId)) return false;
    try {
      const obj = readSectionTasksObject();
      const arr = Array.isArray(obj[sectionId]) ? obj[sectionId] : [];
      const taskId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "";
      if (!taskId) return false;
      arr.push({
        taskId,
        name: todoName,
        startDate: "",
        dueDate: "",
        startTime: "",
        endTime: "",
        eisenhower: "",
        done: false,
        itemType: "todo",
      });
      obj[sectionId] = arr;
      persistSectionTasksAndSchedule(obj);
      document.dispatchEvent(
        new CustomEvent("todo-braindump-added", { detail: {} }),
      );
      return true;
    } catch (_) {}
    return false;
  }

  const TODO_CATEGORIES = [
    { id: "dream", label: "꿈" },
    { id: "sideincome", label: "부수입" },
    { id: "happy", label: "행복" },
    { id: "health", label: "건강" },
  ];
  let taskLogTodoSelectedCategory = "dream";
  /** 과제 기록 시 추가한 할 일: { categoryLabel, todoName } → "리스트 | 할일이름" 태그로 저장 */
  let taskLogTodoAddedItems = [];

  function addTodoToSection(sectionId, name) {
    return addTodoNameToSection(sectionId, name);
  }

  function updateTodoPills() {
    if (!taskLogTodoPills) return;
    taskLogTodoPills.innerHTML = "";
    taskLogTodoAddedItems.forEach((item, idx) => {
      const pill = document.createElement("span");
      pill.className = "time-task-log-todo-pill time-memo-tag-chip";
      const label =
        [item.categoryLabel, item.todoName].filter(Boolean).join(" | ") || "";
      pill.innerHTML = `<span class="time-memo-tag-chip-text">${escapeHtml(label)}</span><button type="button" class="time-memo-tag-chip-remove" aria-label="삭제">&times;</button>`;
      pill
        .querySelector(".time-memo-tag-chip-remove")
        ?.addEventListener("click", (ev) => {
          ev.preventDefault();
          taskLogTodoAddedItems.splice(idx, 1);
          updateTodoPills();
        });
      taskLogTodoPills.appendChild(pill);
    });
  }

  function renderTodoCategoryButtons() {
    if (!taskLogTodoCategoryWrap) return;
    taskLogTodoCategoryWrap.innerHTML = "";
    TODO_CATEGORIES.forEach(({ id, label }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `time-task-log-todo-category-btn${taskLogTodoSelectedCategory === id ? " selected" : ""}`;
      btn.dataset.category = id;
      btn.textContent = label;
      btn.addEventListener("click", () => {
        taskLogTodoSelectedCategory = id;
        taskLogModal
          .querySelectorAll(".time-task-log-todo-category-btn")
          .forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      });
      taskLogTodoCategoryWrap.appendChild(btn);
    });
  }

  function openTodoInnerModal() {
    taskLogTodoSelectedCategory = "dream";
    renderTodoCategoryButtons();
    if (taskLogTodoInnerName) taskLogTodoInnerName.value = "";
    if (taskLogTodoInnerModal) taskLogTodoInnerModal.hidden = false;
    taskLogTodoInnerName?.focus();
  }

  function closeTodoInnerModal() {
    if (taskLogTodoInnerModal) taskLogTodoInnerModal.hidden = true;
  }

  taskLogTodoAddBtn?.addEventListener("click", openTodoInnerModal);
  taskLogTodoInnerClose?.addEventListener("click", closeTodoInnerModal);

  taskLogExpenseAddBtn?.addEventListener("click", openExpenseInnerModal);
  taskLogExpenseInnerClose?.addEventListener("click", closeExpenseInnerModal);

  taskLogTodoInnerAdd?.addEventListener("click", () => {
    const todoName = (taskLogTodoInnerName?.value || "").trim();
    if (!todoName) return;
    const cat = TODO_CATEGORIES.find(
      (c) => c.id === taskLogTodoSelectedCategory,
    );
    const sectionLabel = cat?.label || "";
    if (addTodoToSection(taskLogTodoSelectedCategory, todoName)) {
      taskLogTodoAddedItems.push({ categoryLabel: sectionLabel, todoName });
      updateTodoPills();
      if (taskLogTodoInnerName) taskLogTodoInnerName.value = "";
      closeTodoInnerModal();
    } else {
      showToast("할 일 추가에 실패했습니다.", "warn");
    }
  });

  /** 소비 모달: 추가한 기록 (가계부와 연동, id로 삭제) */
  let taskLogExpenseAddedItems = [];

  function getExpenseModalDate() {
    const startRaw = (taskLogStartInput?.value || "").trim();
    const parsed = parseDateFromDateTime(startRaw) || startRaw.slice(0, 10);
    return (parsed || new Date().toISOString().slice(0, 10)).replace(
      /\//g,
      "-",
    );
  }

  /** 소비 기록을 방해기록·투두처럼 행 아래 태그(분류 | 가격)로만 표시. 모달 내 목록은 사용하지 않음 */
  function updateExpensePills() {
    if (!taskLogExpensePills) return;
    taskLogExpensePills.innerHTML = "";
    taskLogExpenseAddedItems.forEach((item, idx) => {
      const pill = document.createElement("span");
      pill.className = "time-task-log-expense-pill time-memo-tag-chip";
      const label =
        [item.classification || "", item.amountFormatted || ""]
          .filter(Boolean)
          .join(" | ") || "";
      pill.innerHTML = `<span class="time-memo-tag-chip-text">${escapeHtml(label)}</span><button type="button" class="time-memo-tag-chip-remove" aria-label="삭제">&times;</button>`;
      pill
        .querySelector(".time-memo-tag-chip-remove")
        ?.addEventListener("click", (ev) => {
          ev.preventDefault();
          if (item.id) {
            const rows = loadExpenseRows().filter((r) => r.id !== item.id);
            saveExpenseRows(rows);
            grantAssetExpenseTransactionServerWrite(1);
            void deleteAssetExpenseTransactionsFromSupabase([item.id]).catch(() => {});
            window.dispatchEvent(new CustomEvent("asset-expense-transactions-saved"));
          }
          taskLogExpenseAddedItems.splice(idx, 1);
          updateExpensePills();
        });
      taskLogExpensePills.appendChild(pill);
    });
  }

  function updateExpenseInnerList() {
    if (taskLogExpenseInnerList) taskLogExpenseInnerList.innerHTML = "";
    updateExpensePills();
  }

  function openExpenseInnerModal() {
    if (taskLogExpenseInnerModal) taskLogExpenseInnerModal.hidden = false;
    taskLogExpenseNameInput?.focus();
  }

  function closeExpenseInnerModal() {
    if (taskLogExpenseInnerModal) taskLogExpenseInnerModal.hidden = true;
  }

  taskLogExpenseInnerAdd?.addEventListener("click", () => {
    const name = (taskLogExpenseNameInput?.value || "").trim();
    const amountRaw = (taskLogExpenseAmountInput?.value || "")
      .trim()
      .replace(/,/g, "");
    const expenseClassification =
      expenseClassificationButtons._getValue?.() || "";
    const expensePayment =
      expenseClassificationButtons._getPaymentValue?.() || "";
    const classificationToCategory = getClassificationToCategoryMap();
    const expenseCategory = expenseClassification
      ? (classificationToCategory[expenseClassification] || "")
      : "";
    const missing = [];
    if (!expenseClassification) missing.push("소비 분류");
    if (!amountRaw || !parseFloat(amountRaw)) missing.push("금액");
    if (!expensePayment) missing.push("결제수단");
    if (missing.length > 0) {
      if (taskLogExpenseErrorEl) {
        taskLogExpenseErrorEl.textContent =
          "입력 필요: " + missing.join(", ");
        taskLogExpenseErrorEl.hidden = false;
      }
      return;
    }
    if (taskLogExpenseErrorEl) {
      taskLogExpenseErrorEl.textContent = "";
      taskLogExpenseErrorEl.hidden = true;
    }
    const raw = parseFloat(amountRaw) || 0;
    const signed = -Math.abs(raw);
    const amountFormatted = signed.toLocaleString("ko-KR");
    const dateForExpense = getExpenseModalDate();
    const id = newExpenseRowId();
    if (!id) {
      showToast("거래 ID를 만들 수 없습니다. 브라우저를 업데이트해 주세요.", "warn");
      return;
    }
    const row = {
      id,
      name: name || "",
      date: dateForExpense,
      flowType: "지출",
      category: expenseCategory,
      classification: expenseClassification,
      amount: amountFormatted,
      payment: expensePayment,
      memo: "",
    };
    taskLogExpenseAddedItems.push({
      id,
      name: name || "",
      classification: expenseClassification,
      amountFormatted,
    });
    const existingRows = loadExpenseRows();
    existingRows.push(row);
    saveExpenseRows(existingRows);
    lpSaveDebug("방해기록 소비 모달 → 가계부 메모리 추가", {
      expenseId: id,
      date: row.date,
      flowType: row.flowType,
      amount: row.amount,
      memTotal: existingRows.length,
    });
    grantAssetExpenseTransactionServerWrite(1);
    void syncAssetExpenseTransactionsToSupabase().catch(() => {});
    window.dispatchEvent(new CustomEvent("asset-expense-transactions-saved"));
    updateExpenseInnerList();
    taskLogExpenseNameInput.value = "";
    taskLogExpenseAmountInput.value = "";
    expenseClassificationButtons._setValue?.("");
    expenseClassificationButtons._setFlowType?.();
    closeExpenseInnerModal();
  });

  taskLogExpenseAmountInput?.addEventListener("input", () => {
    const v = taskLogExpenseAmountInput.value;
    const digits = v.replace(/\D/g, "");
    const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (v !== formatted) {
      taskLogExpenseAmountInput.value = formatted;
      taskLogExpenseAmountInput.setSelectionRange(
        formatted.length,
        formatted.length,
      );
    }
  });

  /**
   * 신규 과제 기록 모달: 오늘 날짜·오버레이 확정, 시작=해당일 마지막 마감(없으면 늦은 시작), 마감 입력 비움.
   * (type=date/WebKit 이슈 대비 인풋 값·value 속성·오버레이 문구를 모두 맞춤.)
   */
  function applyTaskLogModalDefaultsForNewEntry() {
    const ymd = taskLogDefaultRecordYmd();
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
    const wrap = taskLogDateStart?.closest?.(".time-task-log-date-native-wrap");
    const ov = wrap?.querySelector?.(".time-task-log-date-overlay");
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
      getFullTaskOptions();
      migrateTimeLogRowsTaskIds();
    } catch (_) {}
  }

  /**
   * 과제 기록/수정 모달: KPI 탭 미방문 상태에서도 매일 할일·식단 유형이 비지 않게 서버와 맞춤.
   * (로컬만 보던 `getKpiDailyRepeatInfoByKpiName` / `listWorkScheduleDietTypeNamesFromMem` 선행 조건)
   */
  async function ensureTaskLogModalCloudData() {
    await Promise.all([
      pullTimeLedgerTasksFromSupabase().catch(() => {}),
      pullKpiMapsForTaskLogModalOpen().catch(() => {}),
      pullWorkScheduleFromSupabase({ includeTypes: true }).catch(() => {}),
    ]);
    try {
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
      const mainTasks = getFullTaskOptions().filter(
        (t) => !(t.name || "").includes(" > "),
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
    taskLogModal.style.zIndex = "1002";
    document.body.style.overflow = "hidden";
    closeDateTimePicker();
    const bodyEl = taskLogModal.querySelector(".time-task-setup-body");
    if (bodyEl) bodyEl.scrollTop = 0;
    if (!taskLogTaskDropdown) {
      taskLogTaskDropdown = buildTaskDropdown();
      taskLogTaskWrap.innerHTML = "";
      taskLogTaskWrap.appendChild(taskLogTaskDropdown);
    }
    const taskDropdownPanel = taskLogTaskDropdown?.querySelector(
      ".time-task-log-task-dropdown-panel",
    );
    if (taskDropdownPanel) taskDropdownPanel.hidden = true;
    const mainTasks = getFullTaskOptions().filter(
      (t) => !(t.name || "").includes(" > "),
    );
    const firstTask = mainTasks[0]?.name || "";
    if (taskLogFeedbackInput) taskLogFeedbackInput.value = "";
    if (taskLogMealDetailInput) taskLogMealDetailInput.value = "";
    taskLogMemoTags = [];
    renderTaskLogTagPills();
    taskLogExpenseNameInput.value = "";
    expenseClassificationButtons._setValue?.("");
    expenseClassificationButtons._setFlowType?.();
    taskLogExpenseAmountInput.value = "";
    if (taskLogExpenseErrorEl) {
      taskLogExpenseErrorEl.textContent = "";
      taskLogExpenseErrorEl.hidden = true;
    }
    taskLogModal
      .querySelectorAll(".time-task-log-accordion-item")
      .forEach((item) => {
        if (
          !item.classList.contains("time-task-log-accordion-expanded") ||
          item.dataset?.accordion === "expense"
        )
          return;
        item.classList.remove("time-task-log-accordion-expanded");
        const body = item.querySelector(".time-task-log-accordion-body");
        const chevron = item.querySelector(".time-task-log-accordion-chevron");
        const header = item.querySelector(".time-task-log-accordion-header");
        if (body) body.hidden = true;
        if (chevron) chevron.textContent = "▶";
        if (header) header.setAttribute("aria-expanded", "false");
      });
    if (taskLogTodoInnerName) taskLogTodoInnerName.value = "";
    taskLogTodoAddedItems = [];
    if (taskLogTodoPills) taskLogTodoPills.innerHTML = "";
    taskLogExpenseAddedItems = [];
    if (taskLogExpenseInnerList) taskLogExpenseInnerList.innerHTML = "";
    updateExpensePills();
    if (taskLogExpenseInnerModal) taskLogExpenseInnerModal.hidden = true;
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
      taskLogModal.querySelector(".time-task-log-time-adjust-last"),
    );
  }

  function openTaskLogModalForEdit(tr, rowData) {
    const data =
      tr?._rowData && typeof tr._rowData === "object" ? tr._rowData : rowData;
    let startTime = data.startTime || "";
    let endTime = data.endTime || "";
    const rowDateEl = tr?.querySelector(".time-display-date");
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
    taskLogModal.hidden = false;
    taskLogModal.style.zIndex = "1002";
    document.body.style.overflow = "hidden";
    closeDateTimePicker();
    const bodyEl = taskLogModal.querySelector(".time-task-setup-body");
    if (bodyEl) bodyEl.scrollTop = 0;
    if (!taskLogTaskDropdown) {
      taskLogTaskDropdown = buildTaskDropdown();
      taskLogTaskWrap.innerHTML = "";
      taskLogTaskWrap.appendChild(taskLogTaskDropdown);
    }
    taskLogTaskDropdown._setValue?.(data.taskName || "");
    setStartFromDatetime(startTime || "");
    setEndFromDatetime(endTime || "");
    updateEndTimeClearVisibility();
    let mealDetailVal = String(data.mealDetail || "").trim();
    let feedbackRaw = String(data.feedback || "").trim();
    const tnForMemo = (data.taskName || "").trim();
    if (AUDIT_UNHEALTHY_MEAL_TASK_NAMES.has(tnForMemo)) {
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
    const splitEdit = splitLedgerMemoTags(rawMemoTagsForEdit);
    const mealNamesFromRow = [];
    taskLogMemoTags = splitEdit.userTags.filter((t) => {
      const s = String(t ?? "").trim();
      if (isWorkScheduleDietLedgerMemoTag(s)) {
        const n = dietNameFromLedgerMemoTag(s);
        if (n) mealNamesFromRow.push(n);
        return false;
      }
      return true;
    });
    renderTaskLogTagPills();
    const fromLinkedField = Array.isArray(data.linkedExpenseIds) ? data.linkedExpenseIds : [];
    const mergedExpenseIds = [
      ...new Set([...splitEdit.expenseIds, ...fromLinkedField].map((id) => String(id || "").trim())),
    ].filter(Boolean);
    taskLogExpenseAddedItems = ledgerExpenseAddedItemsFromIds(mergedExpenseIds);
    updateExpensePills();
    taskLogTodoAddedItems = [];
    if (typeof updateTodoPills === "function") updateTodoPills();
    if (taskLogTagInput) taskLogTagInput.value = "";
    taskLogExpenseNameInput.value = "";
    expenseClassificationButtons._setValue?.("");
    expenseClassificationButtons._setFlowType?.();
    taskLogExpenseAmountInput.value = "";
    const ymdEdit = String(recKey || "")
      .trim()
      .replace(/\//g, "-")
      .slice(0, 10);
    const tnSync = (data.taskName || "").trim();
    if (WS_DIET_LEDGER_TASK_NAMES.has((tnSync || "").trim()) && ymdEdit.length >= 10) {
      const dietList = listWorkScheduleDietTypeNamesFromMem();
      const picked = new Set(mealNamesFromRow);
      for (const d of dietList) {
        setMealChecklistItem(ymdEdit, tnSync, d, picked.has(d));
      }
    }
    refreshKpiTodosInLogModal(tnSync);
    const lockedName = (data.taskName || "").trim();
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
        const tnPost = (data.taskName || "").trim();
        if (WS_DIET_LEDGER_TASK_NAMES.has((tnPost || "").trim()) && ymdEdit.length >= 10) {
          const dietList = listWorkScheduleDietTypeNamesFromMem();
          const picked = new Set(mealNamesFromRow);
          for (const d of dietList) {
            setMealChecklistItem(ymdEdit, tnPost, d, picked.has(d));
          }
        }
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
      ".time-task-log-task-dropdown-panel",
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
    /** 메인 폼에서 만든 지출 id → linkedExpenseIds에 합침 (memo_tags와 분리) */
    let mainFormExpenseId = null;
    let submittedLedgerRowForExpenseLink = null;
    let didAddMainFormExpense = false;

    const taskName = (taskLogTaskDropdown?._getValue?.() || "").trim();
    const startRaw = (taskLogStartInput.value || "").trim();
    let endRaw = (taskLogEndInput.value || "").trim();
    const endVisibleGuard =
      normalizeHhMm((taskLogTimeEnd?.value || "").trim()) || "";
    if (
      !endRaw &&
      endVisibleGuard &&
      /^\d{1,2}:\d{2}$/.test(endVisibleGuard)
    ) {
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
    const mealDetailForRow = AUDIT_UNHEALTHY_MEAL_TASK_NAMES.has(taskName)
      ? (taskLogMealDetailInput?.value || "").trim()
      : "";
    const feedback = feedbackBody;
    const todoTags = taskLogTodoAddedItems
      .map((t) => [t.categoryLabel, t.todoName].filter(Boolean).join(" | "))
      .filter(Boolean);
    const linkedFromModal = taskLogExpenseAddedItems
      .map((it) => String(it?.id || "").trim())
      .filter(Boolean);
    const userTagsNoMeal = (Array.isArray(taskLogMemoTags) ? taskLogMemoTags : [])
      .map((t) => String(t ?? "").trim())
      .filter((t) => t && !isWorkScheduleDietLedgerMemoTag(t));
    const mealMemoTags = [];
    if (WS_DIET_LEDGER_TASK_NAMES.has((taskName || "").trim()) && taskLogDailyTodosList) {
      taskLogDailyTodosList
        .querySelectorAll("label[data-meal-checklist='1']")
        .forEach((lab) => {
          const cb = lab.querySelector('input[type="checkbox"]');
          const span = lab.querySelector(".time-task-log-kpi-todo-text");
          const dietName = (span?.textContent || "").trim();
          if (cb?.checked && dietName) {
            const tag = makeWorkScheduleDietLedgerMemoTag(dietName);
            if (tag) mealMemoTags.push(tag);
          }
        });
    }
    const memoTags = buildLedgerMemoTagsForSubmit(
      [...userTagsNoMeal, ...mealMemoTags],
      todoTags,
    );
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
    const expenseName = (taskLogExpenseNameInput.value || "").trim();
    const expenseAmount = (taskLogExpenseAmountInput.value || "")
      .trim()
      .replace(/,/g, "");
    const expenseClassification =
      expenseClassificationButtons._getValue?.() || "";
    const expensePayment =
      expenseClassificationButtons._getPaymentValue?.() || "";
    const classificationToCategory = getClassificationToCategoryMap();
    const expenseCategory = expenseClassification
      ? (classificationToCategory[expenseClassification] || "")
      : "";

    const focusValue = "";

    const hasExpenseContent =
      expenseName || expenseClassification || expenseAmount;
    if (hasExpenseContent) {
      const missing = [];
      if (!expenseClassification) missing.push("소비 분류");
      if (!expenseAmount || !parseFloat(expenseAmount)) missing.push("금액");
      if (!expensePayment) missing.push("결제수단");
      if (missing.length > 0) {
        console.warn("[lp-task-log]", "submit_abort", {
          reason: "expense_form_incomplete",
          missing,
        });
        if (taskLogExpenseErrorEl) {
          taskLogExpenseErrorEl.textContent =
            "입력 필요: " + missing.join(", ");
          taskLogExpenseErrorEl.hidden = false;
        }
        return;
      }
    }
    if (taskLogExpenseErrorEl) {
      taskLogExpenseErrorEl.textContent = "";
      taskLogExpenseErrorEl.hidden = true;
    }

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
        linkedExpenseIds: [...linkedFromModal],
        focus: focusValue,
      };
      editTr._rowData = newRowData;
      submittedLedgerRowForExpenseLink = newRowData;
      const isMobileCard = editTr.classList?.contains(
        "time-ledger-mobile-card",
      );
      if (!isMobileCard) {
        editTr.querySelector(".time-display-task").textContent = taskName;
        const prodBarEl = editTr.querySelector(".time-task-prod-bar");
        if (prodBarEl) {
          prodBarEl.classList.remove(
            "time-task-prod-bar--productive",
            "time-task-prod-bar--nonproductive",
            "time-task-prod-bar--other",
          );
          prodBarEl.classList.add(
            productivity === "productive"
              ? "time-task-prod-bar--productive"
              : productivity === "nonproductive"
                ? "time-task-prod-bar--nonproductive"
                : "time-task-prod-bar--other",
          );
        }
        editTr.querySelector(".time-display-start").textContent = startTime
          ? toDisplayTimeOnly(startTime) || startTime
          : "";
        editTr.querySelector(".time-display-end").textContent =
          formatTimeLedgerEndCellDisplay(startTime, endTime);
        editTr.querySelector(".time-display-tracked").textContent = timeTracked;
        editTr.querySelector(".time-display-feedback").textContent = feedback;
        const memoTagCell = editTr.querySelector(
          ".time-cell-memo-tag .time-display-memo-tags",
        );
        if (memoTagCell) {
          memoTagCell.innerHTML = "";
          getMemoTagDisplayTextsForLedgerRow(newRowData).forEach((tag) => {
            const pill = document.createElement("span");
            pill.className = "time-memo-tag-pill";
            pill.textContent = tag;
            memoTagCell.appendChild(pill);
          });
        }
        editTr.querySelector(".time-cell-category .time-tag-pill").textContent =
          getCategoryLabel(category) || "—";
        editTr.querySelector(".time-cell-category .time-tag-pill").className =
          "time-tag-pill cat " + getCategoryColor(category);
        const prodOpt = PRODUCTIVITY_OPTIONS.find(
          (o) => o.value === productivity,
        );
        editTr.querySelector(
          ".time-cell-productivity .time-tag-pill",
        ).textContent = prodOpt ? prodOpt.label : "";
        editTr.querySelector(
          ".time-cell-productivity .time-tag-pill",
        ).className = "time-tag-pill prod " + (prodOpt ? prodOpt.color : "");
        editTr.querySelector(".time-display-date").textContent = dateStr
          ? formatDateDisplay(dateStr)
          : "";
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
        linkedExpenseIds: [...linkedFromModal],
        focus: focusValue,
      };
      const tr = createRow(
        newRowData,
        ctx.onRowUpdate,
        ctx.viewEl,
        ctx.handleRowDelete,
        ctx.handleRowEdit,
      );
      addLedgerTr = tr;
      submittedLedgerRowForExpenseLink = tr._rowData;
      if (ctx.addRow) ctx.tbody.insertBefore(tr, ctx.addRow);
      else ctx.tbody.appendChild(tr);
      /* DOM과 동일 객체를 캐시에 둠(createRow가 정규화한 행 = 저장·서버 push 기준) */
      allRowsCache.push(tr._rowData);
      ctx.onRowUpdate?.();
    }

    if (
      expenseCategory &&
      expenseClassification &&
      expenseAmount &&
      parseFloat(expenseAmount) &&
      expensePayment
    ) {
      const raw = parseFloat(String(expenseAmount).replace(/,/g, "")) || 0;
      const signed = -Math.abs(raw);
      const amountFormatted = signed.toLocaleString("ko-KR");
      const existingRows = loadExpenseRows();
      const dateForExpense = (
        dateStr || new Date().toISOString().slice(0, 10)
      ).replace(/\//g, "-");
      const expId = newExpenseRowId();
      if (expId) {
        mainFormExpenseId = expId;
        existingRows.push({
          id: expId,
          name: expenseName || "",
          date: dateForExpense,
          flowType: "지출",
          category: expenseCategory,
          classification: expenseClassification,
          amount: amountFormatted,
          payment: expensePayment,
          memo: "",
        });
        saveExpenseRows(existingRows);
        lpSaveDebug("과제모달 메인폼 소비 → 가계부 메모리 추가", {
          expenseId: expId,
          date: dateForExpense,
          amount: amountFormatted,
          memTotal: existingRows.length,
        });
        didAddMainFormExpense = true;
      } else if (hasExpenseContent) {
        lpSaveDebug("메인폼 소비 스킵(expId 없음)", { hasExpenseContent, expId: expId || null });
      }
    }

    if (mainFormExpenseId && submittedLedgerRowForExpenseLink) {
      const cur = new Set(
        Array.isArray(submittedLedgerRowForExpenseLink.linkedExpenseIds)
          ? submittedLedgerRowForExpenseLink.linkedExpenseIds.map(String)
          : [],
      );
      cur.add(mainFormExpenseId);
      submittedLedgerRowForExpenseLink.linkedExpenseIds = [...cur];
      lpSaveDebug("시간행에 linkedExpenseIds 반영", {
        ids: submittedLedgerRowForExpenseLink.linkedExpenseIds,
        rowId: String(submittedLedgerRowForExpenseLink.id || "").slice(0, 8),
      });
      const syncTr = editTr || addLedgerTr;
      if (syncTr?._rowData) {
        syncTr._rowData.linkedExpenseIds =
          submittedLedgerRowForExpenseLink.linkedExpenseIds;
      }
      if (syncTr && !syncTr.classList?.contains("time-ledger-mobile-card")) {
        const memoTagCell = syncTr.querySelector(
          ".time-cell-memo-tag .time-display-memo-tags",
        );
        if (memoTagCell) {
          memoTagCell.innerHTML = "";
          getMemoTagDisplayTextsForLedgerRow(
            submittedLedgerRowForExpenseLink,
          ).forEach((tag) => {
            const pill = document.createElement("span");
            pill.className = "time-memo-tag-pill";
            pill.textContent = tag;
            memoTagCell.appendChild(pill);
          });
        }
      }
    }

    if (didAddMainFormExpense) {
      grantAssetExpenseTransactionServerWrite(1);
      void syncAssetExpenseTransactionsToSupabase().catch(() => {});
      window.dispatchEvent(new CustomEvent("asset-expense-transactions-saved"));
    }

    /* 투두는 + 버튼 모달에서 카테고리 선택 후 추가 시 저장됨 */

    if (editTr || addCtx) {
      if (editTr && oldRowDataToRemove) {
        const { next } = removeTimeLedgerRowFromRows(
          allRowsCache,
          oldRowDataToRemove,
        );
        allRowsCache = next;
        const isMobileCardEdit = editTr.classList?.contains(
          "time-ledger-mobile-card",
        );
        if (isMobileCardEdit && editTr._rowData) {
          allRowsCache.push(editTr._rowData);
        }
      }
      const dailyInfoSubmit = getKpiDailyRepeatInfoByKpiName(taskName);
      if (
        dailyInfoSubmit?.needHabitTracker &&
        taskLogDailyTodosList &&
        ((timeTracked || "").trim() || taskLogDailyTodosList.querySelector(
          'label.time-task-log-daily-todo-row input[type="checkbox"]:checked',
        ))
      ) {
        const completed = [];
        taskLogDailyTodosList
          .querySelectorAll("label.time-task-log-daily-todo-row")
          .forEach((label) => {
            const cb = label.querySelector('input[type="checkbox"]');
            const span = label.querySelector(".time-task-log-kpi-todo-text");
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
        const m = dateRawStr.match(
          /(\d{4})[.\-\s]*(\d{1,2})[.\-\s]*(\d{1,2})/,
        );
        const normalizedDateRaw = m
          ? `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`
          : dateRawStr.slice(0, 10);
        if (normalizedDateRaw.length >= 10) {
          const habitLedgerId = String(
            (editTr?._rowData?.id || addLedgerTr?._rowData?.id || "").trim(),
          );
          upsertHabitTrackerLogWithDailyState(
            dailyInfoSubmit.storageKey,
            dailyInfoSubmit.kpiId,
            normalizedDateRaw,
            { completed },
            isUuid(habitLedgerId) ? habitLedgerId : undefined,
          );
        }
      }
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
    ".time-task-log-delete-btn",
  );
  taskLogDeleteBtn?.addEventListener("click", () => {
    const tr = taskLogEditTr;
    if (!tr) return;
    const rowData = tr._rowData || collectRowFromTR(tr);
    if (tr._onRowDelete) tr._onRowDelete(tr, rowData);
    closeTaskLogModal();
  });

  const closeBtn = taskSetupModal.querySelector(".time-task-setup-close");
  const addTaskBtn = taskSetupModal.querySelector(".time-task-add-btn");
  const setupTabs = taskSetupModal.querySelectorAll(".time-task-setup-tab");
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

  const addTaskCloseBtn = addTaskModal.querySelector(".time-task-setup-close");
  const addTaskNameInput = addTaskModal.querySelector(".time-add-task-name");
  const addTaskProdRadios = addTaskModal.querySelectorAll(
    'input[name="addProd"]',
  );
  const addTaskCatProd = addTaskModal.querySelector(
    '.time-add-task-categories[data-for="productive"]',
  );
  const addTaskCatNonProd = addTaskModal.querySelector(
    '.time-add-task-categories[data-for="nonproductive"]',
  );
  const addTaskSubmitBtn = addTaskModal.querySelector(".time-add-task-submit");
  const addTaskModalTitle = addTaskModal.querySelector(".time-task-setup-title");
  const addTaskDeleteBtn = addTaskModal.querySelector(".time-add-task-delete");

  function renderCategoryButtons(container, categories) {
    container.innerHTML = "";
    categories.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lp-choice-chip";
      btn.textContent = c.label;
      btn.dataset.value = c.value;
      container.appendChild(btn);
    });
  }
  renderCategoryButtons(addTaskCatProd, PRODUCTIVE_CATEGORIES);
  renderCategoryButtons(addTaskCatNonProd, NONPRODUCTIVE_CATEGORIES);

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
      btn.className =
        "time-task-setup-subcat-btn" +
        (c.value === selectedSubcat ? " active" : "");
      btn.textContent = c.label;
      btn.dataset.subcat = c.value;
      if (c.color) btn.classList.add(c.color);
      btn.addEventListener("click", () => {
        selectedSubcat = c.value;
        setupSubcatBar
          .querySelectorAll(".time-task-setup-subcat-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
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
        row.className =
          "time-task-setup-item" +
          (isLocked
            ? " time-task-setup-item--locked"
            : " time-task-setup-item--editable") +
          (isRowSelected ? " time-task-setup-item--selected" : "");
        const nameEsc = (t.name || "").replace(/</g, "&lt;");
        const builtinBadge = isTimeTaskBuiltinTemplate(t)
          ? `<span class="lp-task-badge lp-task-badge--builtin" title="앱에서 제공하는 기본 과제입니다. 과제 설정에서 삭제할 수 없습니다.">기본</span>`
          : "";
        const kpiBadge = fromKpi
          ? `<span class="lp-task-badge lp-task-badge--kpi" title="KPI(맵)에서 연결된 과제입니다">KPI</span>`
          : "";
        row.innerHTML = `
          <span class="time-task-setup-item-title">
            <span class="time-task-setup-item-name">${nameEsc}</span>
            ${builtinBadge}${kpiBadge}
          </span>
          <span class="time-task-setup-item-cat">${catLabel}</span>
        `;
        if (!isLocked) {
          row.setAttribute("role", "button");
          row.tabIndex = 0;
          row.addEventListener("click", () => {
            if (getLockedTaskNames().has(t.name) || isTimeTaskKpiLinked(t)) {
              alert(MSG_TIME_TASK_KPI_LINKED);
              return;
            }
            void openAddTaskModal(t);
          });
          row.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              row.click();
            }
          });
        }
        container.appendChild(row);
      });
      if (list.length === 0) {
        const empty = document.createElement("div");
        empty.className = "time-task-setup-empty";
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
    addTaskSubmitBtn.disabled = !(name && selectedCategory);
  }
  function openAddTaskModal(editTask) {
    if (!el.isConnected) return;
    addTaskModal.hidden = false;
    setupListSelectedTaskName = editTask ? editTask.name : "";
    const isEdit = Boolean(editTask);
    if (addTaskModalTitle) {
      addTaskModalTitle.textContent = isEdit ? "과제 수정" : "과제 추가";
    }
    addTaskSubmitBtn.textContent = isEdit ? "저장" : "추가";
    if (addTaskDeleteBtn) {
      const lockedEdit =
        editTask &&
        (getLockedTaskNames().has((editTask.name || "").trim()) ||
          isTimeTaskKpiLinked(editTask));
      addTaskDeleteBtn.hidden = !isEdit || lockedEdit;
    }
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
    addTaskCatNonProd.style.display =
      prod === "nonproductive" ? "" : "none";
    addTaskCatProd
      .querySelectorAll(".lp-choice-chip")
      .forEach((b) =>
        b.classList.toggle(
          "lp-choice-chip--on",
          b.dataset.value === selectedCategory,
        ),
      );
    addTaskCatNonProd
      .querySelectorAll(".lp-choice-chip")
      .forEach((b) =>
        b.classList.toggle(
          "lp-choice-chip--on",
          b.dataset.value === selectedCategory,
        ),
      );
    syncAddTaskSubmitState();
    renderTaskSetupList();
    addTaskNameInput.focus();
  }

  function closeAddTaskModal() {
    addTaskModal.hidden = true;
    setupListSelectedTaskName = "";
    renderTaskSetupList();
  }

  addTaskNameInput.addEventListener("input", syncAddTaskSubmitState);

  addTaskProdRadios.forEach((r) => {
    r.addEventListener("change", () => {
      const prod = r.value;
      addTaskCatProd.style.display = prod === "productive" ? "" : "none";
      addTaskCatNonProd.style.display =
        prod === "nonproductive" ? "" : "none";
      selectedCategory = "";
      addTaskCatProd
        .querySelectorAll(".lp-choice-chip")
        .forEach((b) => b.classList.remove("lp-choice-chip--on"));
      addTaskCatNonProd
        .querySelectorAll(".lp-choice-chip")
        .forEach((b) => b.classList.remove("lp-choice-chip--on"));
      syncAddTaskSubmitState();
    });
  });
  addTaskCatProd.querySelectorAll(".lp-choice-chip").forEach((b) => {
    b.addEventListener("click", () => {
      addTaskCatProd
        .querySelectorAll(".lp-choice-chip")
        .forEach((x) => x.classList.remove("lp-choice-chip--on"));
      b.classList.add("lp-choice-chip--on");
      selectedCategory = b.dataset.value;
      syncAddTaskSubmitState();
    });
  });
  addTaskCatNonProd.querySelectorAll(".lp-choice-chip").forEach((b) => {
    b.addEventListener("click", () => {
      addTaskCatNonProd
        .querySelectorAll(".lp-choice-chip")
        .forEach((x) => x.classList.remove("lp-choice-chip--on"));
      b.classList.add("lp-choice-chip--on");
      selectedCategory = b.dataset.value;
      syncAddTaskSubmitState();
    });
  });

  addTaskSubmitBtn.addEventListener("click", () => {
    const name = (addTaskNameInput.value || "").trim();
    if (!name || !selectedCategory) {
      return;
    }
    const prod =
      addTaskModal.querySelector('input[name="addProd"]:checked')?.value ||
      "productive";
    const editName = addTaskNameInput.dataset.editName || "";
    if (editName) {
      updateTaskOption(editName, {
        name,
        category: selectedCategory,
        productivity: prod,
        memo: "",
      });
    } else {
      addTaskOptionFull({
        name,
        category: selectedCategory,
        productivity: prod,
        memo: "",
      });
    }
    closeAddTaskModal();
  });

  addTaskDeleteBtn?.addEventListener("click", async () => {
    const editName = (addTaskNameInput.dataset.editName || "").trim();
    if (!editName) {
      return;
    }
    if (getLockedTaskNames().has(editName)) {
      alert(MSG_TIME_TASK_KPI_LINKED);
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
      setupTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
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
        taskSetupModal.querySelector(".time-task-setup-tab.active")?.dataset
          ?.tab || "all";
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
        if (taskLogExpenseInnerModal && !taskLogExpenseInnerModal.hidden) {
          closeExpenseInnerModal();
          e.preventDefault();
          return;
        }
        if (focusModal && !focusModal.hidden) {
          closeFocusModal();
          e.preventDefault();
          return;
        }
        if (taskLogTodoInnerModal && !taskLogTodoInnerModal.hidden) {
          closeTodoInnerModal();
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
  contentWrap.className = "time-view-content-wrap";
  el.appendChild(contentWrap);

  let allRowsCache = loadTimeRows();
  let cachedRows = [];

  logTabSync("time_tab_hydrate", {});
  void Promise.resolve(pullAssetExpenseTransactionsFromSupabase()).then(() => {
    if (!el.isConnected) return;
    try {
      _pickerRangeKeyAtLastPullIntent = computePickerRangeKeyForPull();
    } catch (_) {}
    allRowsCache = loadTimeRows();
    cachedRows = getFullRowsForFilter(true);
    syncTimeLedgerContent();
    refreshMobileTimeCardExpenseSnippetsIn(contentWrap);
  });

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
    /** 요약 칸: 시 숫자·분 숫자는 크게, H·M 글자만 단위(작게) */
    function fillTimeSummaryHM(valueEl, hours, kind) {
      if (!valueEl) return;
      const role =
        kind === "productive"
          ? "time-ledger-summary-productive"
          : "time-ledger-summary-tracked";
      const num = (n) =>
        `<span class="time-ledger-summary-num ${role}">${n}</span>`;
      const u = (s) => `<span class="time-ledger-summary-unit">${s}</span>`;
      if (hours <= 0 || !isFinite(hours)) {
        valueEl.innerHTML = `${num("0")}${u("h")}${num("0")}${u("m")}`;
        return;
      }
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      if (m === 0) {
        valueEl.innerHTML = `${num(String(h))}${u("h")}`;
        return;
      }
      valueEl.innerHTML = `${num(String(h))}${u("h")}${num(String(m))}${u("m")}`;
    }

    /* 1. 시간기록하기: 요약 패널 + 테이블 행 또는 카드 목록 */
    const allTable = contentWrap.querySelector(
      ".time-ledger-container .time-ledger-table",
    );
    const summaryPanelEl = contentWrap.querySelector(
      ".time-ledger-summary-panel",
    );
    const allTfoot = allTable?.querySelector("tfoot");
    const cardNodes = contentWrap.querySelectorAll(".time-ledger-mobile-card");
    const useCardTotals = summaryPanelEl && !allTable;

    if (summaryPanelEl && (allTable || useCardTotals)) {
      const hourlyRate =
        parseFloat(
          String(el.querySelector(".time-hourly-input")?.value || "0").replace(
            /,/g,
            "",
          ),
        ) || 0;
      let totalHrs = 0;
      let productiveHrs = 0;
      let investedPrice = 0;
      let wastedValue = 0;

      if (allTable) {
        const tbody = allTable.querySelector("tbody");
        tbody?.querySelectorAll(".time-row").forEach((tr) => {
          const timeEl =
            tr.querySelector(".time-input-tracked") ||
            tr.querySelector(".time-display-tracked");
          const val = (timeEl?.value ?? timeEl?.textContent ?? "").trim();
          const hrs = parseTimeToHours(val) || 0;
          totalHrs += hrs;
          const pv = (tr._rowData?.productivity || "").trim();
          if (pv === "productive") {
            productiveHrs += hrs;
            investedPrice += hrs * hourlyRate;
          }
          if (pv === "nonproductive") {
            wastedValue += hrs * hourlyRate;
          }
        });
      } else {
        cardNodes.forEach((card) => {
          const rd = card._rowData;
          if (!rd || isEmptyTimeRow(rd)) return;
          const hrs = getMobileCardEffectiveHoursForPrice(rd);
          totalHrs += hrs;
          const pv = (
            rd.productivity ||
            getProductivityFromCategory(rd.category) ||
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
      }

      const trackedValueEl = summaryPanelEl.querySelector(
        ".time-ledger-summary-cell:nth-child(1) .time-ledger-summary-value",
      );
      fillTimeSummaryHM(trackedValueEl, totalHrs, "tracked");
      const productiveValueEl = summaryPanelEl.querySelector(
        ".time-ledger-summary-cell:nth-child(2) .time-ledger-summary-value",
      );
      fillTimeSummaryHM(productiveValueEl, productiveHrs, "productive");
      const investedNum = summaryPanelEl.querySelector(
        ".time-ledger-summary-invested",
      );
      const investedUnit = investedNum?.nextElementSibling;
      if (investedNum) investedNum.textContent = `+${formatPrice(investedPrice)}`;
      if (investedUnit) investedUnit.textContent = "원";
      const spentNum = summaryPanelEl.querySelector(
        ".time-ledger-summary-spent",
      );
      const spentUnit = spentNum?.nextElementSibling;
      if (spentNum) spentNum.textContent = `-${formatPrice(wastedValue)}`;
      if (spentUnit) spentUnit.textContent = "원";
      const dayNet = investedPrice - wastedValue;
      const dayNetNum = summaryPanelEl.querySelector(".time-ledger-summary-day-net");
      const dayNetUnit = dayNetNum?.nextElementSibling;
      if (dayNetNum) {
        if (dayNet > 0) dayNetNum.textContent = `+${formatPrice(dayNet)}`;
        else if (dayNet < 0)
          dayNetNum.textContent = `-${formatPrice(Math.abs(dayNet))}`;
        else dayNetNum.textContent = `+${formatPrice(0)}`;
      }
      if (dayNetUnit) dayNetUnit.textContent = "원";
      const overHrs = totalHrs > 24 ? totalHrs - 24 : 0;
      if (allTable && allTfoot) {
        const overRow = allTfoot.querySelector(".time-ledger-over-row");
        if (overRow)
          overRow.classList.toggle(
            "time-ledger-over-row-visible",
            overHrs > 0,
          );
        const totalOverEl = allTfoot.querySelector(".time-ledger-total-over");
        if (totalOverEl) {
          totalOverEl.textContent =
            overHrs > 0 ? formatHoursDisplay(overHrs) : "";
          totalOverEl.classList.toggle("has-over", overHrs > 0);
        }
      }
    }

    contentWrap.querySelectorAll(".time-section").forEach((section) => {
      const tbody = section.querySelector("tbody");
      const tfoot = section.querySelector("tfoot");
      const summaryTracked = tfoot?.querySelector(
        ".time-section-summary-tracked",
      );
      const summaryPrice = tfoot?.querySelector(".time-section-summary-price");
      if (!tbody || !summaryTracked || !summaryPrice) return;
      const prod = section.dataset.productivity || "";
      const hourlyRate =
        parseFloat(
          String(el.querySelector(".time-hourly-input")?.value || "0").replace(
            /,/g,
            "",
          ),
        ) || 0;
      let totalHrs = 0;
      let totalPrice = 0;
      tbody.querySelectorAll(".time-row").forEach((tr) => {
        const timeEl =
          tr.querySelector(".time-input-tracked") ||
          tr.querySelector(".time-display-tracked");
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
      summaryPrice.textContent = formatPrice(totalPrice);
      summaryPrice.className =
        "time-section-summary-price" +
        (totalPrice < 0
          ? " is-negative"
          : totalPrice > 0
            ? " is-positive"
            : "");
    });

    const mobileRow = el.querySelector(".time-ledger-mobile-filter-total");
    const mobileVal = mobileRow?.querySelector(
      ".time-ledger-mobile-filter-total-value",
    );
    if (mobileRow && mobileVal) {
      const viewOk = (el.dataset.timeContentView || "all") === "all";
      const cardsHost = contentWrap.querySelector(".time-ledger-mobile-cards");
      const show = viewOk && !!cardsHost;
      mobileRow.toggleAttribute("hidden", !show);
      if (show) {
        let totalHrsMob = 0;
        contentWrap.querySelectorAll(".time-ledger-mobile-card").forEach((card) => {
          const rd = card._rowData;
          if (!rd || isEmptyTimeRow(rd)) return;
          totalHrsMob += getMobileCardEffectiveHoursForPrice(rd);
        });
        mobileVal.textContent = formatTotalRecordedHoursAsHhMm(totalHrsMob);
      }
    }
  }
  el._updateTotal = updateTotal;

  const tableWrap = document.createElement("div");
  tableWrap.className = "time-ledger-table-wrap";

  const table = document.createElement("table");
  table.className = "time-ledger-table";
  table.innerHTML = createTableHTML();

  const taskTh = table.querySelector(".time-th-task");
  const taskCol = table.querySelector(".time-col-task");

  if (taskTh && taskCol) {
    const resizer = document.createElement("div");
    resizer.className = "time-col-resizer";
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

  /** 모바일 툴바에 붙였던 날짜·네비·필터 묶음을 비우기 전 filterBar로 되돌림 (DOM 유실 방지) */
  function rescueTimeFilterControlsToFilterBar() {
    if (filterNavCluster && !filterBar.contains(filterNavCluster)) {
      filterBar.appendChild(filterNavCluster);
    }
  }

  /** 시간 기록(전체) 카드 목록: 행 기준일 YYYY-MM-DD */
  function timeLedgerRowYmd(r) {
    const y = normalizeDateForCompare(r?.date || "");
    if (y) return y;
    const raw = String(r?.date || "")
      .trim()
      .replace(/\//g, "-")
      .slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
  }

  function timeLedgerFilterSpansMultipleDays() {
    const a = pickYmdFromFilter(startDateInput.value, filterStartDate);
    const b = pickYmdFromFilter(endDateInput.value, filterEndDate);
    return !!(a && b && a !== b);
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

  function renderAll(rows = []) {
    clearTimeLedgerMobileElapsedTimer(el);
    rescueTimeFilterControlsToFilterBar();
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
    hiddenTableWrap.className = "time-ledger-mobile-hidden-table";
    hiddenTableWrap.style.cssText =
      "position:absolute;left:-62.5rem;width:0.0625rem;height:0.0625rem;overflow:hidden;";
    const hiddenTable = document.createElement("table");
    hiddenTable.className = "time-ledger-table";
    hiddenTable.innerHTML = createTableHTML();
    const hiddenTbody = hiddenTable.querySelector("tbody");
    hiddenTableWrap.appendChild(hiddenTable);
    contentWrap.appendChild(hiddenTableWrap);

    const cardsWrap = document.createElement("div");
    cardsWrap.className = "time-ledger-mobile-cards";

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
      let stack = cardsWrap.querySelector(
        ".time-ledger-day-card-stack:last-of-type",
      );
      if (!stack) {
        stack = document.createElement("div");
        stack.className = "time-ledger-day-card-stack";
        cardsWrap.appendChild(stack);
      }
      stack.appendChild(card);
    }

    if (showDayGroups) {
      const groups = timeLedgerGroupRowsByDay(rows);
      for (const g of groups) {
        if (g.key !== "_nodate") {
          const header = document.createElement("div");
          header.className = "time-ledger-day-group-header";
          header.setAttribute("role", "presentation");
          const label = document.createElement("span");
          label.className = "time-ledger-day-group-date";
          label.textContent = formatTimeFilterDateDotsWithWeekday(g.key);
          const totalEl = document.createElement("span");
          totalEl.className = "time-ledger-day-group-total";
          totalEl.textContent = formatHoursDisplay(
            sumTimeLedgerDayHours(g.rows),
          );
          header.appendChild(label);
          header.appendChild(totalEl);
          cardsWrap.appendChild(header);
        }
        const cardParent =
          g.rows.length > 0
            ? (() => {
                const stack = document.createElement("div");
                stack.className = "time-ledger-day-card-stack";
                cardsWrap.appendChild(stack);
                return stack;
              })()
            : cardsWrap;
        for (const d of g.rows) appendCardTo(cardParent, d);
      }
    } else {
      const cardParent =
        rows.length > 0
          ? (() => {
              const stack = document.createElement("div");
              stack.className = "time-ledger-day-card-stack";
              cardsWrap.appendChild(stack);
              return stack;
            })()
          : cardsWrap;
      rows.forEach((d) => appendCardTo(cardParent, d));
    }

    const openAdd = () => {
      if (openTaskLogModal) {
        openTaskLogModal({
          productivity: null,
          tbody: hiddenTbody,
          addRow: null,
          onRowUpdate: () => {
            updateTotal();
            onFilterChange();
          },
          viewEl: el,
          createRow,
          handleRowDelete: handleCardDelete,
          handleRowEdit: handleCardEdit,
        });
      } else {
        const dateStr = startDateInput.value || filterStartDate;
        const card = createMobileTimeCard(
          { date: dateStr },
          handleCardEdit,
          handleCardDelete,
          el,
        );
        card._onRowDelete = handleCardDelete;
        appendNewCardToLedgerCardsWrap(card);
        updateTotal();
      }
    };

    const summaryPanel = document.createElement("div");
    summaryPanel.className = "time-ledger-summary-panel";
    summaryPanel.innerHTML = TIME_LEDGER_SUMMARY_FIVE_CELLS_HTML;

    const ledgerContainer = document.createElement("div");
    ledgerContainer.className = "time-ledger-container";
    ledgerContainer.appendChild(summaryPanel);
    ledgerContainer.appendChild(cardsWrap);
    contentWrap.appendChild(ledgerContainer);

    {
      if (hourlyAddSlot) {
        hourlyAddSlot.innerHTML = "";
        const addInner = document.createElement("div");
        addInner.className =
          "time-hourly-add-inner time-ledger-add-inner--icon-only";
        const addBtnEl = document.createElement("button");
        addBtnEl.type = "button";
        addBtnEl.className =
          `todo-add-btn time-ledger-add-plus-btn ${APP_FOOTER_ICON_BTN_CLASS}`;
        addBtnEl.title = "과제 기록";
        addBtnEl.setAttribute("aria-label", "과제 기록");
        addBtnEl.innerHTML = TIME_LEDGER_ADD_PLUS_ICON_SVG;
        addInner.appendChild(addBtnEl);
        hourlyAddSlot.appendChild(addInner);
        addInner.addEventListener("click", openAdd);
      }
    }

    const refreshCardLiveFields = () => {
      cardsWrap
        .querySelectorAll(".time-ledger-mobile-card")
        .forEach(updateMobileTimeCardLiveFields);
      updateTotal();
    };
    if (rows.some((d) => mobileCardNeedsLiveClock(d))) {
      refreshCardLiveFields();
      el._timeLedgerMobileElapsedIntervalId = setInterval(
        refreshCardLiveFields,
        10000,
      );
    }
    updateTotal();
  }

  function updateFilterBarVisibility() {
    /* 모바일에서 navCluster가 contentWrap 툴바로 붙으면 버튼이 filterBar 밖에 있음 */
    const taskSelectBtn = el.querySelector("#time-task-select-btn");
    if (filterNavCluster) filterNavCluster.style.display = "";
    if (taskSetupBtn) taskSetupBtn.style.display = "";
    if (taskSelectBtn) taskSelectBtn.style.display = "";
    filterBar.querySelectorAll("[data-audit-range-hidden]").forEach((node) => {
      node.style.display = "";
    });
    if (startDateInput) delete startDateInput.dataset.hideDeleteBtn;
    syncTimeFilterDateLabels();
  }

  function getFilteredRows(rows) {
    const type = filterType;
    const y = filterYear;
    const m = filterMonth;
    const start = startDateInput.value || filterStartDate;
    const end = endDateInput.value || filterEndDate;
    return filterRowsByFilterType(rows, type, y, m, start, end);
  }

  function syncTimeLedgerContent(opts = {}) {
    const userSubTabClick = !!opts.userSubTabClick;
    el.dataset.timeContentView = "all";
    if (userSubTabClick) {
      void pullAssetExpenseTransactionsFromSupabase();
    }
    mergeRowsIntoCache();
    cachedRows = getFullRowsForFilter(true);
    const rowsToUse = getFilteredRows(cachedRows);
    renderAll(rowsToUse);
    updateTotal();
    syncTimeFilterDateLabels();
    updateFilterBarVisibility();
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
  ledgerContainer.className = "time-ledger-container";
  ledgerContainer.appendChild(tableWrap);
  contentWrap.appendChild(ledgerContainer);

  onFilterChange(true);

  function refreshTimeLedgerFromRemotePull() {
    if (!el.isConnected) return;
    /* App 탭 진입 pull 직후 session 만 오늘 등으로 바뀌고 DOM 날짜는 옛값일 수 있음 → 통째로 renderMain 하지 않고 갱신할 때 맞춤 */
    try {
      const { rangeStart, rangeEnd } =
        readTimeLedgerSessionFilterRangeYmd();
      filterStartDate = rangeStart;
      filterEndDate = rangeEnd;
      if (startDateInput) startDateInput.value = rangeStart;
      if (endDateInput) endDateInput.value = rangeEnd;
      syncTimeFilterDateLabels();
      _pickerRangeKeyAtLastPullIntent = computePickerRangeKeyForPull();
    } catch (_) {}
    allRowsCache = loadTimeRows();
    cachedRows = getFullRowsForFilter(true);
    syncTimeLedgerContent();
  }

  /** App.setActiveTab 에서 pull 후 두 번째 renderMain 대신 호출 — 패널 통째 교체 없이 위 갱신만 */
  window.__lpTimeLedgerSoftRefresh = refreshTimeLedgerFromRemotePull;
  signal.addEventListener(
    "abort",
    () => {
      clearAppFooterActions();
      if (window.__lpTimeLedgerSoftRefresh === refreshTimeLedgerFromRemotePull) {
        delete window.__lpTimeLedgerSoftRefresh;
      }
    },
    { once: true },
  );

  document.addEventListener(
    "lp-time-ledger-remote-updated",
    refreshTimeLedgerFromRemotePull,
    { signal },
  );

  /* 가계부 지출 메모리가 늦게 채워져도 모바일 카드 소비 줄이 실제 명·금액으로 갱신되게 */
  function scheduleRefreshMobileExpenseSnippets() {
    queueMicrotask(() => {
      if (!el.isConnected) return;
      refreshMobileTimeCardExpenseSnippetsIn(contentWrap);
    });
  }
  window.addEventListener("asset-expense-transactions-saved", scheduleRefreshMobileExpenseSnippets, {
    signal,
  });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") scheduleRefreshMobileExpenseSnippets();
    },
    { signal },
  );

  return el;
}


if (typeof document !== "undefined") {
  document.addEventListener("app-hourly-rate-changed", (e) => {
    const rate = Number(e.detail?.rate ?? 0);
    const root = document.querySelector(".app-tab-panel-content.time-ledger-view");
    if (!root) return;
    const inp = root.querySelector(".time-hourly-input");
    if (inp) inp.value = String(rate);
  });
}
