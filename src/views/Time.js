/**
 * 시간가계부 - 데일리 시간 입력용
 * 과제명, 사용시간, 생산성, 카테고리, 날짜
 */

import {
  loadExpenseRows,
  saveExpenseRows,
  getExpenseCategoryOptions,
  getExpenseClassificationOptions,
} from "./Asset.js";
import {
  loadDiaryEntries,
  saveDiaryEntries,
  getEmotionList,
  addEmotionEntry,
  TAB3_EMOTION_TEMPLATE,
} from "../diaryData.js";
import {
  getKpiSyncedTaskNames,
  syncHabitTrackerLogs,
} from "../utils/timeKpiSync.js";

const PRODUCTIVITY_OPTIONS = [
  { value: "productive", label: "생산적", color: "prod-pink" },
  { value: "nonproductive", label: "비생산적", color: "prod-blue" },
  { value: "other", label: "그 외", color: "prod-green" },
];

const TASK_OPTIONS_KEY = "time_task_options";
const BUDGET_GOALS_KEY = "time_daily_budget_goals";
const BUDGET_EXCLUDED_KEY = "time_budget_excluded";
const USER_HOURLY_RATE_KEY = "user_hourly_rate";
const TIME_ROWS_KEY = "time_task_log_rows";
const FIXED_OTHER_TASKS = [
  { name: "수면하기", category: "sleep", productivity: "other" },
  { name: "근무하기", category: "work", productivity: "other" },
];
/** 생산적 > 행복 고정 과제 (과제설정에서 수정·삭제 불가) */
const FIXED_PRODUCTIVE_TASKS = [
  {
    name: "감정적이기(긍정적)",
    category: "happiness",
    productivity: "productive",
  },
  {
    name: "생산적 소비",
    category: "productive_consumption",
    productivity: "productive",
  },
];
/** 비생산적 > 불행 고정 과제 (과제설정에서 수정·삭제 불가) - 비생산적 소비: 돈을 잃는 일 */
const FIXED_NONPRODUCTIVE_TASKS = [
  {
    name: "감정적이기(부정적)",
    category: "unhappiness",
    productivity: "nonproductive",
  },
  {
    name: "비생산적 소비",
    category: "moneylosing",
    productivity: "nonproductive",
  },
];
/** 구버전 과제명 (목록에서 제거 후 신규 고정 과제로 대체) */
const REPLACED_TASK_NAMES = ["감정적이기"];
/** 수정/삭제 불가 과제 (특수 로직 적용) */
const TASKS_LOCKED_FOR_EDIT = ["낮잠"];

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

function getLockedTaskNames() {
  return new Set([
    ...FIXED_OTHER_TASKS.map((t) => t.name),
    ...FIXED_PRODUCTIVE_TASKS.map((t) => t.name),
    ...FIXED_NONPRODUCTIVE_TASKS.map((t) => t.name),
    ...TASKS_LOCKED_FOR_EDIT,
    ...getKpiSyncedTaskNames(),
  ]);
}

/** 과제 설정 모달에서 수정/삭제 버튼 숨김 대상 (고정 과제 + KPI 연동) */
function getLockedForSetupDisplay() {
  return new Set([
    ...FIXED_OTHER_TASKS.map((t) => t.name),
    ...FIXED_PRODUCTIVE_TASKS.map((t) => t.name),
    ...FIXED_NONPRODUCTIVE_TASKS.map((t) => t.name),
    ...TASKS_LOCKED_FOR_EDIT,
    ...getKpiSyncedTaskNames(),
  ]);
}

const DEFAULT_TASK_OPTIONS = [
  ...FIXED_OTHER_TASKS,
  ...FIXED_PRODUCTIVE_TASKS,
  ...FIXED_NONPRODUCTIVE_TASKS,
  { name: "전화통화", category: "dream", productivity: "productive" },
  { name: "영상편집", category: "sideincome", productivity: "productive" },
  { name: "시간기록 점검", category: "dream", productivity: "productive" },
  { name: "러닝하기", category: "health", productivity: "productive" },
];

const PRODUCTIVE_CATEGORIES = [
  { value: "dream", label: "꿈", color: "cat-dream" },
  { value: "sideincome", label: "부수입", color: "cat-sideincome" },
  { value: "happiness", label: "행복", color: "cat-happiness" },
  { value: "health", label: "건강", color: "cat-health" },
  {
    value: "productive_consumption",
    label: "생산적 소비",
    color: "cat-prod-cons",
  },
];

const NONPRODUCTIVE_CATEGORIES = [
  { value: "pleasure", label: "쾌락충족", color: "cat-pleasure" },
  {
    value: "dreamblocking",
    label: "꿈을 방해하는 일",
    color: "cat-dreamblocking",
  },
  { value: "unhappiness", label: "불행", color: "cat-unhappiness" },
  { value: "unhealthy", label: "비건강", color: "cat-unhealthy" },
  { value: "moneylosing", label: "돈을 잃는 일", color: "cat-moneylosing" },
];

function getFullTaskOptions() {
  let arr = [];
  try {
    const raw = localStorage.getItem(TASK_OPTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        arr = parsed.map((o) =>
          typeof o === "string"
            ? { name: o, category: "", productivity: "productive", memo: "" }
            : {
                name: o.name || "",
                category: o.category || "",
                productivity: o.productivity || "productive",
                memo: o.memo || "",
              },
        );
      }
    }
  } catch (_) {}
  if (arr.length === 0) return [...DEFAULT_TASK_OPTIONS];
  const fixedOtherNames = new Set(FIXED_OTHER_TASKS.map((t) => t.name));
  const fixedProdNames = new Set(FIXED_PRODUCTIVE_TASKS.map((t) => t.name));
  const fixedNonProdNames = new Set(
    FIXED_NONPRODUCTIVE_TASKS.map((t) => t.name),
  );
  const replacedNames = new Set(REPLACED_TASK_NAMES);
  const others = arr.filter(
    (o) =>
      !fixedOtherNames.has(o.name) &&
      !fixedProdNames.has(o.name) &&
      !fixedNonProdNames.has(o.name) &&
      !replacedNames.has(o.name),
  );
  return [
    ...FIXED_OTHER_TASKS,
    ...FIXED_PRODUCTIVE_TASKS,
    ...FIXED_NONPRODUCTIVE_TASKS,
    ...others,
  ];
}

function getTaskOptions() {
  return getFullTaskOptions().map((o) => o.name);
}

function addTaskOption(name) {
  const opts = getFullTaskOptions();
  const trimmed = (name || "").trim();
  if (!trimmed || opts.some((o) => o.name === trimmed)) return opts;
  opts.unshift({ name: trimmed, category: "", productivity: "productive" });
  try {
    localStorage.setItem(TASK_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
  return opts;
}

function addTaskOptionFull(task) {
  const opts = getFullTaskOptions();
  const name = (task?.name || "").trim();
  if (!name || opts.some((o) => o.name === name)) return opts;
  opts.unshift({
    name,
    category: task.category || "",
    productivity: task.productivity || "productive",
    memo: task.memo || "",
  });
  try {
    localStorage.setItem(TASK_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
  return opts;
}

function updateTaskOption(oldName, task) {
  if (getLockedTaskNames().has(oldName)) return getFullTaskOptions();
  const opts = getFullTaskOptions();
  const idx = opts.findIndex((o) => o.name === oldName);
  if (idx < 0) return opts;
  const name = (task?.name || "").trim();
  if (!name) return opts;
  opts[idx] = {
    name,
    category: task.category || "",
    productivity: task.productivity || "productive",
    memo: task.memo || "",
  };
  if (name !== oldName && opts.some((o, i) => i !== idx && o.name === name)) {
    opts.splice(idx, 1);
  }
  try {
    localStorage.setItem(TASK_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
  return opts;
}

function removeTaskOption(name) {
  if (getLockedTaskNames().has(name)) return getFullTaskOptions();
  const opts = getFullTaskOptions().filter((o) => o.name !== name);
  try {
    localStorage.setItem(TASK_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
  return opts;
}

export function getTaskOptionByName(name) {
  return getFullTaskOptions().find((o) => o.name === name) || null;
}

/** 일간시간예산 목표 시간 저장/불러오기 - { "YYYY-MM-DD": { "과제명": { goalTime: "08:00", scheduledTime: "hh:mm-hh:mm", isInvest: true } } } */
export function getBudgetGoals(dateStr) {
  try {
    const raw = localStorage.getItem(BUDGET_GOALS_KEY);
    if (raw) {
      const all = JSON.parse(raw);
      const result = all[dateStr] || {};
      if (typeof result !== "object" || result === null || Array.isArray(result)) return {};
      return result;
    }
  } catch (_) {}
  return {};
}

function saveBudgetGoal(dateStr, taskName, goalTime, isInvest) {
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
  } catch (_) {}
}

/** 새 행 플레이스홀더 (재렌더 시 행 유지용) */
const BUDGET_PLACEHOLDER_PREFIX = "(과제 선택)·";
function isBudgetPlaceholder(key) {
  return (key || "").startsWith(BUDGET_PLACEHOLDER_PREFIX);
}
function createBudgetPlaceholder() {
  return BUDGET_PLACEHOLDER_PREFIX + Date.now();
}

/** 캘린더 1일뷰 - 과제 행 전체 삭제 (목표+예상시간 제거, 해당 날짜에서 제외) */
function deleteBudgetGoalEntry(dateStr, taskName) {
  const key = (taskName || "").trim();
  if (!key) return;
  try {
    const raw = localStorage.getItem(BUDGET_GOALS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    if (all[dateStr]) {
      delete all[dateStr][key];
      localStorage.setItem(BUDGET_GOALS_KEY, JSON.stringify(all));
    }
    const exclRaw = localStorage.getItem(BUDGET_EXCLUDED_KEY);
    const excl = exclRaw ? JSON.parse(exclRaw) : {};
    if (!excl[dateStr]) excl[dateStr] = [];
    if (!excl[dateStr].includes(key)) excl[dateStr].push(key);
    localStorage.setItem(BUDGET_EXCLUDED_KEY, JSON.stringify(excl));
  } catch (_) {}
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
    }
  } catch (_) {}
}

/** scheduledTimes 배열 반환 (하위 호환: scheduledTime 문자열 → 배열) */
function getScheduledTimesArray(data) {
  if (!data) return [];
  if (Array.isArray(data.scheduledTimes)) return data.scheduledTimes.filter((s) => s && String(s).trim());
  if (data.scheduledTime && String(data.scheduledTime).trim()) return [String(data.scheduledTime).trim()];
  return [];
}

/** 캘린더 1일뷰 예정 시간 저장 - scheduledTimes 배열 지원 (같은 과제 여러 구간) */
function saveBudgetScheduledTimes(dateStr, taskName, scheduledTimes, isInvest) {
  if (!(taskName || "").trim()) return;
  try {
    removeFromBudgetExcluded(dateStr, taskName);
    const raw = localStorage.getItem(BUDGET_GOALS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const dateData = all[dateStr];
    if (!dateData || typeof dateData !== "object" || Array.isArray(dateData)) all[dateStr] = {};
    const key = String(taskName).trim();
    const existing = all[dateStr][key] || {};
    const arr = Array.isArray(scheduledTimes)
      ? scheduledTimes.map((s) => String(s || "").trim()).filter(Boolean)
      : [];
    if (arr.length > 0) {
      all[dateStr][key] = { ...existing, scheduledTimes: arr, isInvest };
    } else {
      const { scheduledTime: _st, scheduledTimes: _sts, ...rest } = existing;
      all[dateStr][key] = Object.keys(rest).length ? rest : undefined;
      if (!all[dateStr][key]) delete all[dateStr][key];
    }
    localStorage.setItem(BUDGET_GOALS_KEY, JSON.stringify(all));
  } catch (_) {}
}

/** @deprecated 단일 구간 저장 - saveBudgetScheduledTimes 사용 권장 */
function saveBudgetScheduledTime(dateStr, taskName, scheduledTime, isInvest) {
  saveBudgetScheduledTimes(dateStr, taskName, scheduledTime ? [scheduledTime] : [], isInvest);
}

/** 과제 기록 로컬 저장 (백엔드 개발 전 임시) */
export function loadTimeRows() {
  try {
    const raw = localStorage.getItem(TIME_ROWS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }
  } catch (_) {}
  return [];
}

function saveTimeRows(rows) {
  try {
    const arr = Array.isArray(rows) ? rows : [];
    localStorage.setItem(TIME_ROWS_KEY, JSON.stringify(arr));
    syncHabitTrackerLogs();
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
  {
    value: "productive_consumption",
    label: "생산적 소비",
    color: "cat-prod-cons",
  },
  { value: "pleasure", label: "쾌락충족", color: "cat-pleasure" },
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

/** 카테고리에 따른 생산성 자동 매핑 */
function getProductivityFromCategory(categoryValue) {
  if (!categoryValue) return "";
  const productive = [
    "dream",
    "sideincome",
    "happiness",
    "health",
    "productive_consumption",
  ];
  const nonproductive = [
    "unhappiness",
    "unhealthy",
    "moneylosing",
    "dreamblocking",
    "pleasure",
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
function parseTimeToHours(str) {
  if (!str || typeof str !== "string") return 0;
  const trimmed = str.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h + m / 60;
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

/** 방해 빈도 곡선용: 시간대별(0~23시) 방해횟수 집계 */
function aggregateFocusByHour(rows) {
  const byHour = {};
  for (let h = 0; h <= 23; h++) byHour[h] = 0;
  rows.forEach((r) => {
    const focus = parseInt(String(r.focus || "0").replace(/\D/g, ""), 10) || 0;
    if (focus <= 0) return;
    const startH = parseDateTimeToHours(r.startTime);
    const endH = parseDateTimeToHours(r.endTime);
    if (startH == null || endH == null) return;
    for (let h = 0; h <= 23; h++) {
      if (startH < h + 1 && endH > h) byHour[h] += focus;
    }
  });
  return byHour;
}

/** 시간(소수)을 "Xh Ym" 형식으로 표시 */
function formatHoursDisplay(hours) {
  if (hours < 0 || !isFinite(hours)) return "0h 0m";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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

/** 성취능력 값(-50~+50)을 표시용 퍼센트 문자열로 변환 */
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
    return { start, end };
  }
  return { start: null, end: null };
}

/** 필터 타입에 따른 표시 라벨 */
function getFilterPeriodLabel(type, year, month, start, end) {
  if (type === "month" && year && month) return `${year}년 ${month}월`;
  if (type === "week") return "최근 7일";
  if (type === "day")
    return formatDateForDayFilter(start || toDateStr(new Date())) || "오늘";
  if (type === "range" && start && end) return `${start} ~ ${end}`;
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

/** 날짜·시작시간 기준 시간 흐름 순 정렬 (00:00→23:59) */
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

/** 일별 수익 집계 (날짜별 가치 합계) */
function aggregateDailyRevenue(rows, period, hourlyRate) {
  const filtered = filterRowsByPeriod(rows, period);
  return aggregateDailyRevenueFromFiltered(filtered, hourlyRate);
}

function aggregateDailyRevenueFromFiltered(filtered, hourlyRate) {
  const byDate = {};
  filtered.forEach((r) => {
    const d = (r.date || "").trim();
    if (!d) return;
    const hrs = parseTimeToHours(r.timeTracked);
    const pv = (
      r.productivity ||
      getProductivityFromCategory(r.category) ||
      ""
    ).trim();
    let price = hrs * hourlyRate;
    if (pv === "nonproductive") price *= -1;
    else if (pv === "other" || pv === "그 외" || !pv) price = 0;
    byDate[d] = (byDate[d] || 0) + price;
  });
  return byDate;
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

/** 카테고리 라벨 조회 */
function getCategoryLabel(value) {
  const opt = CATEGORY_OPTIONS.find((o) => o.value === value);
  return opt ? opt.label : value || "그 외";
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

/** 차트용 가격 표시 (k 단위) */
function formatPriceK(n) {
  if (n === 0) return "0";
  const k = Math.round(n / 1000);
  return n < 0 ? `-${Math.abs(k)}k` : `${k}k`;
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

function createTagDropdown(options, initialValue, optionClass, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "time-tag-dropdown-wrap";
  let value =
    initialValue !== undefined && initialValue !== null
      ? initialValue
      : (options[0]?.value ?? "");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "time-tag-trigger";
  function updateTrigger() {
    const opt = options.find((o) => o.value === value);
    const label = opt ? opt.label : value || "—";
    const colorClass = opt ? opt.color : "";
    trigger.innerHTML = `<span class="time-tag-pill ${optionClass} ${colorClass}">${label}</span>`;
  }
  updateTrigger();

  const panel = document.createElement("div");
  panel.className = "time-tag-panel";
  panel.hidden = true;
  options.forEach((o) => {
    const opt = document.createElement("div");
    opt.className =
      "time-tag-option" + (o.value === value ? " is-selected" : "");
    opt.innerHTML = `<span class="time-tag-pill ${o.color || ""}">${o.label}</span>`;
    opt.addEventListener("click", () => {
      value = o.value;
      updateTrigger();
      closePanel();
      onSelect?.(value);
    });
    panel.appendChild(opt);
  });

  function closePanel() {
    panel.hidden = true;
    if (panel.parentElement === document.body) {
      document.body.removeChild(panel);
      wrap.appendChild(panel);
    }
  }

  function openPanel() {
    const rect = trigger.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 140)}px`;
    panel.style.zIndex = "999999";
    if (panel.parentElement !== document.body) {
      wrap.removeChild(panel);
      document.body.appendChild(panel);
    }
    panel.hidden = false;
  }

  trigger.addEventListener("click", () => {
    if (panel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target) && !panel.contains(e.target)) {
      closePanel();
    }
  });

  wrap.appendChild(trigger);
  wrap.appendChild(panel);
  wrap._getValue = () => value;
  wrap._setValue = (v) => {
    value = v;
    updateTrigger();
    panel.querySelectorAll(".time-tag-option").forEach((opt, i) => {
      opt.classList.toggle("is-selected", options[i]?.value === value);
    });
  };
  return { wrap, getValue: () => value };
}

const DELETE_ICON =
  '<svg class="time-task-delete-icon" viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

/** 과제명 입력: 포커스 시 목록 표시, 목록에 없으면 Create 옵션 */
function createTaskNameInput(initialValue, onTaskSelect) {
  const wrap = document.createElement("div");
  wrap.className = "time-task-name-wrap";

  const inputWrap = document.createElement("div");
  inputWrap.className = "time-task-input-wrap";

  const input = document.createElement("input");
  input.type = "text";
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
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          removeTaskOption(name);
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

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) closePanel();
  });

  wrap.appendChild(inputWrap);
  wrap.appendChild(panel);
  return { wrap, input, getValue: () => input.value };
}

function createRow(initialData, onUpdate, viewEl, onRowDelete, onRowEdit) {
  const tr = document.createElement("tr");
  tr.className = "time-row";

  const rowData = {
    taskName: initialData?.taskName || "",
    startTime: (initialData?.startTime || "").trim(),
    endTime: (initialData?.endTime || "").trim(),
    timeTracked: initialData?.timeTracked || "",
    productivity:
      initialData?.productivity ??
      (initialData?.category
        ? getProductivityFromCategory(initialData.category)
        : initialData?.taskName
          ? getTaskOptionByName(initialData.taskName)?.productivity
          : ""),
    category:
      initialData?.category ??
      (initialData?.taskName
        ? getTaskOptionByName(initialData.taskName)?.category
        : ""),
    date: initialData?.date || "",
    feedback: initialData?.feedback || "",
    focus: String(initialData?.focus || "").trim(),
    energy: String(initialData?.energy || "").trim(),
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
  endTimeSpan.textContent = rowData.endTime
    ? toDisplayTimeOnly(rowData.endTime) || rowData.endTime
    : "";
  endTimeTd.appendChild(endTimeSpan);

  const timeTd = document.createElement("td");
  timeTd.className = "time-cell time-cell-tracked";
  const timeSpan = document.createElement("span");
  timeSpan.className = "time-display-tracked";
  timeSpan.textContent = rowData.timeTracked || "";
  timeTd.appendChild(timeSpan);

  function updatePrice() {
    const data = tr._rowData || rowData;
    const hourlyInput = viewEl?.querySelector(".time-hourly-input");
    const hourlyRate =
      parseFloat(String(hourlyInput?.value || "0").replace(/,/g, "")) || 0;
    const hours = parseTimeToHours(data.timeTracked);
    const pv = (data.productivity || "").trim();
    let price = hours * hourlyRate;
    if (pv === "nonproductive") price *= -1;
    else if (pv === "other" || pv === "그 외" || !pv) price = 0;
    priceDisplay.textContent = formatPrice(price);
    priceDisplay.classList.toggle("is-negative", price < 0);
    priceDisplay.classList.toggle("is-positive", price > 0);
    viewEl?._updateTotal?.();
  }

  const catTd = document.createElement("td");
  catTd.className = "time-cell time-cell-category";
  const catDisplay = document.createElement("span");
  catDisplay.className = "time-tag-pill cat cat-empty";
  const catOpt = CATEGORY_OPTIONS.find((o) => o.value === rowData.category);
  catDisplay.textContent = catOpt ? catOpt.label : "—";
  catDisplay.className =
    "time-tag-pill cat " + (catOpt ? catOpt.color : "cat-empty");
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

  const focusTd = document.createElement("td");
  focusTd.className = "time-cell time-cell-focus";
  const focusSpan = document.createElement("span");
  focusSpan.className = "time-display-focus";
  focusSpan.textContent = rowData.focus || "";
  focusTd.appendChild(focusSpan);
  tr.appendChild(focusTd);

  const energyTd = document.createElement("td");
  energyTd.className = "time-cell time-cell-energy";
  const energySpan = document.createElement("span");
  energySpan.className = "time-display-energy";
  energySpan.textContent = formatEnergyForDisplay(rowData.energy);
  energyTd.appendChild(energySpan);
  tr.appendChild(energyTd);

  const feedbackTd = document.createElement("td");
  feedbackTd.className = "time-cell time-cell-feedback";
  const feedbackSpan = document.createElement("span");
  feedbackSpan.className = "time-display-feedback";
  feedbackSpan.textContent = rowData.feedback || "";
  feedbackTd.appendChild(feedbackSpan);
  tr.appendChild(feedbackTd);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "time-btn-delete";
  delBtn.textContent = "삭제";
  delBtn.title = "삭제";
  const actionsTd = document.createElement("td");
  actionsTd.className = "time-cell time-cell-actions";
  actionsTd.appendChild(delBtn);
  tr.appendChild(actionsTd);

  tr._updatePrice = updatePrice;
  updatePrice();

  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (onRowDelete) {
      onRowDelete(tr, tr._rowData || rowData);
    } else {
      tr.remove();
      onUpdate?.();
    }
  });

  if (onRowEdit) {
    tr.classList.add("time-row-clickable");
    tr.title = "클릭하여 수정";
    tr.addEventListener("click", (e) => {
      if (e.target.closest(".time-cell-actions")) return;
      onRowEdit(tr, collectRowFromTR(tr));
    });
  }

  return tr;
}

const PRODUCTIVITY_VIEW_ORDER = [
  { value: "productive", label: "생산적" },
  { value: "nonproductive", label: "비생산적" },
  { value: "other", label: "그 외" },
];

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
  const startVal = (startInput?.value || "").trim();
  const endVal = (endInput?.value || "").trim();
  return {
    taskName,
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
    focus: (tr.querySelector(".time-display-focus")?.textContent || "").trim(),
    energy: (
      tr.querySelector(".time-display-energy")?.textContent || ""
    ).trim(),
  };
}

function collectRowsFromDOM(container) {
  const rows = [];
  container.querySelectorAll(".time-row").forEach((tr) => {
    const row = collectRowFromTR(tr);
    if (!isEmptyTimeRow(row)) rows.push(row);
  });
  return rows;
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
      <col class="time-col-focus">
      <col class="time-col-energy">
      <col class="time-col-feedback">
      <col class="time-col-actions">
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
        <th class="time-th-focus">방해 횟수(회)</th>
        <th class="time-th-energy">성취능력</th>
        <th class="time-th-feedback">과제 메모</th>
        <th class="time-th-actions"></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
}

function createProductivitySection(
  prod,
  rows,
  viewEl,
  updateTotal,
  onRowDelete,
  openTaskLogModal,
  openTaskLogModalForEdit,
) {
  const section = document.createElement("section");
  section.className = "time-section";
  section.dataset.productivity = prod.value;

  const header = document.createElement("div");
  header.className = "time-section-header";
  const title = document.createElement("span");
  title.className = "time-section-title";
  title.textContent = prod.label;
  const countSpan = document.createElement("span");
  countSpan.className = "time-section-count";
  countSpan.textContent = "0";
  header.appendChild(title);
  header.appendChild(countSpan);
  section.appendChild(header);

  const tableWrap = document.createElement("div");
  tableWrap.className = "time-ledger-table-wrap";
  const table = document.createElement("table");
  table.className = "time-ledger-table";
  table.innerHTML = createTableHTML();
  const tbody = table.querySelector("tbody");

  function updateCount() {
    const n = tbody.querySelectorAll(".time-row").length;
    countSpan.textContent = n;
  }

  const onRowUpdate = () => {
    updateTotal();
    updateCount();
  };

  const handleRowDelete = (tr, rowData) => {
    tr.remove();
    onRowUpdate();
  };

  const handleRowEdit = (tr, rowData) => {
    openTaskLogModalForEdit?.(tr, rowData);
  };

  rows.forEach((d) => {
    const tr = createRow(
      { ...d, productivity: prod.value },
      onRowUpdate,
      viewEl,
      onRowDelete ?? handleRowDelete,
      openTaskLogModalForEdit ?? handleRowEdit,
    );
    tbody.appendChild(tr);
  });
  updateCount();

  const taskTh = table.querySelector(".time-th-task");
  const taskCol = table.querySelector(".time-col-task");
  if (taskTh && taskCol) {
    const resizer = document.createElement("div");
    resizer.className = "time-col-resizer";
    resizer.title = "드래그하여 너비 조절";
    taskTh.appendChild(resizer);
    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = taskTh.getBoundingClientRect().width;
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

  tableWrap.appendChild(table);
  section.appendChild(tableWrap);
  return section;
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content time-ledger-view";

  const header = document.createElement("div");
  header.className = "time-ledger-header";
  const title = document.createElement("h2");
  title.className = "time-ledger-title";
  title.textContent = "데일리 시간 입력용";
  header.appendChild(title);
  el.appendChild(header);

  const hourlyWrap = document.createElement("div");
  hourlyWrap.className = "time-hourly-wrap";
  const hourlyLabel = document.createElement("span");
  hourlyLabel.className = "time-hourly-label";
  hourlyLabel.textContent = "내 시급: ";
  const hourlyDisplay = document.createElement("span");
  hourlyDisplay.className = "time-hourly-display";
  const storedRate = (() => {
    try {
      const v = localStorage.getItem(USER_HOURLY_RATE_KEY);
      const n = parseFloat(v);
      return Number.isNaN(n) ? 0 : n;
    } catch (_) {
      return 0;
    }
  })();
  hourlyDisplay.textContent =
    storedRate > 0
      ? new Intl.NumberFormat("ko-KR").format(Math.round(storedRate)) + "원"
      : "—";
  if (storedRate <= 0) {
    const setupLink = document.createElement("button");
    setupLink.type = "button";
    setupLink.className = "time-hourly-setup-link";
    setupLink.textContent = "My account에서 설정";
    setupLink.addEventListener("click", () => {
      document.dispatchEvent(
        new CustomEvent("app-switch-tab", { detail: { tabId: "idea" } }),
      );
    });
    hourlyWrap.appendChild(setupLink);
  }
  const hourlyInput = document.createElement("input");
  hourlyInput.type = "hidden";
  hourlyInput.className = "time-hourly-input";
  hourlyInput.value = String(storedRate);
  const hourlyHint = document.createElement("span");
  hourlyHint.className = "time-hourly-hint";
  hourlyHint.textContent = "My account에서 시급을 설정하면 금액이 계산됩니다";
  hourlyWrap.appendChild(hourlyLabel);
  hourlyWrap.appendChild(hourlyDisplay);
  hourlyWrap.appendChild(hourlyInput);
  hourlyWrap.appendChild(hourlyHint);
  el.appendChild(hourlyWrap);

  function updateHourlyHint() {
    const hasTime = Array.from(
      contentWrap.querySelectorAll(".time-input-tracked"),
    ).some((inp) => (inp?.value || "").trim().length > 0);
    const hasHourly =
      parseFloat(String(hourlyInput?.value || "0").replace(/,/g, "")) > 0;
    hourlyHint.classList.toggle("is-visible", hasTime && !hasHourly);
  }

  const viewTabs = document.createElement("div");
  viewTabs.className = "time-view-tabs";
  viewTabs.innerHTML = `
    <button type="button" class="time-view-tab active" data-view="all">시간 기록</button>
    <button type="button" class="time-view-tab" data-view="productivity">생산성별</button>
    <button type="button" class="time-view-tab" data-view="dashboard">대시보드</button>
    <button type="button" class="time-view-tab" data-view="newtab">일간시간예산</button>
  `;

  const now = new Date();
  let filterType = "day";
  let filterYear = now.getFullYear();
  let filterMonth = now.getMonth() + 1;
  let filterStartDate = toDateStr(now);
  let filterEndDate = toDateStr(now);

  const filterBar = document.createElement("div");
  filterBar.className = "time-filter-bar";
  filterBar.innerHTML = `
    <button type="button" class="time-task-setup-btn" data-filter-for="all" title="과제명, 생산성, 카테고리를 한 번에 설정"><img src="/toolbaricons/settings.svg" alt="" class="time-btn-icon" width="18" height="18"> 과제 설정</button>
    <div class="time-filter-tabs" data-filter-for="all">
      <button type="button" class="time-filter-btn" data-filter="month">월별</button>
      <button type="button" class="time-filter-btn" data-filter="week">일주일</button>
      <button type="button" class="time-filter-btn active" data-filter="day">하루</button>
      <button type="button" class="time-filter-btn" data-filter="range">날짜 선택</button>
    </div>
    <div class="time-filter-day-wrap" data-filter-wrap="day">
      <span class="time-filter-day-display">${formatDateForDayFilter(filterStartDate)}</span>
      <div class="time-filter-day-nav">
        <button type="button" class="time-filter-day-prev" aria-label="이전 날짜">&lt;</button>
        <button type="button" class="time-filter-day-next" aria-label="다음 날짜">&gt;</button>
      </div>
    </div>
    <div class="time-filter-month-wrap" data-filter-wrap="month" style="display:none">
      <div class="asset-cashflow-dropdown-wrap">
        <button type="button" class="time-period-trigger asset-cashflow-trigger" id="time-month-trigger">${filterMonth}월</button>
        <div class="time-period-panel asset-cashflow-panel" id="time-month-panel">
          ${Array.from({ length: 12 }, (_, i) => {
            const m = i + 1;
            return `<div class="time-period-option" data-value="${m}">${m}월</div>`;
          }).join("")}
        </div>
      </div>
      <div class="asset-cashflow-year-nav">
        <button type="button" class="asset-cashflow-year-btn" aria-label="이전 연도">&lt;</button>
        <span class="asset-cashflow-year-display">${filterYear}</span>
        <button type="button" class="asset-cashflow-year-btn" aria-label="다음 연도">&gt;</button>
      </div>
    </div>
    <div class="time-filter-range-wrap" data-filter-wrap="range" style="display:none">
      <input type="date" class="time-filter-start-date" />
      <span>~</span>
      <input type="date" class="time-filter-end-date" />
    </div>
    <div class="time-filter-budget-date-wrap" data-filter-for="newtab" style="display:none">
      <label class="time-filter-budget-date-label">날짜</label>
      <input type="date" class="time-filter-budget-date" />
    </div>
  `;

  const startDateInput = filterBar.querySelector(".time-filter-start-date");
  const endDateInput = filterBar.querySelector(".time-filter-end-date");
  const dayWrap = filterBar.querySelector("[data-filter-wrap='day']");
  const monthWrap = filterBar.querySelector("[data-filter-wrap='month']");
  const rangeWrap = filterBar.querySelector("[data-filter-wrap='range']");
  const dayDisplay = filterBar.querySelector(".time-filter-day-display");
  const dayPrevBtn = filterBar.querySelector(".time-filter-day-prev");
  const dayNextBtn = filterBar.querySelector(".time-filter-day-next");
  const filterTabs = filterBar.querySelector(".time-filter-tabs");
  const taskSetupBtn = filterBar.querySelector(".time-task-setup-btn");
  const budgetDateWrap = filterBar.querySelector("[data-filter-for='newtab']");
  const budgetDateInput = filterBar.querySelector(".time-filter-budget-date");
  budgetDateInput.value = filterStartDate;

  const monthTrigger = filterBar.querySelector("#time-month-trigger");
  const monthPanel = filterBar.querySelector("#time-month-panel");
  const monthDropdownWrap = filterBar.querySelector(
    ".time-filter-month-wrap .asset-cashflow-dropdown-wrap",
  );
  const yearDisplay = filterBar.querySelector(".asset-cashflow-year-display");
  const yearPrevBtn = filterBar.querySelector(
    ".time-filter-month-wrap .asset-cashflow-year-btn:first-child",
  );
  const yearNextBtn = filterBar.querySelector(
    ".time-filter-month-wrap .asset-cashflow-year-btn:last-child",
  );

  monthPanel.querySelectorAll(".time-period-option").forEach((o) => {
    o.classList.toggle("is-selected", o.dataset.value === String(filterMonth));
  });

  monthTrigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    monthPanel.classList.toggle("is-open");
    monthDropdownWrap.classList.toggle("is-open");
  });
  monthPanel.querySelectorAll(".time-period-option").forEach((o) => {
    o.addEventListener("click", (e) => {
      e.stopPropagation();
      filterMonth = parseInt(o.dataset.value, 10);
      monthTrigger.textContent = `${filterMonth}월`;
      monthPanel.classList.remove("is-open");
      monthDropdownWrap.classList.remove("is-open");
      monthPanel.querySelectorAll(".time-period-option").forEach((opt) => {
        opt.classList.toggle(
          "is-selected",
          opt.dataset.value === String(filterMonth),
        );
      });
      onFilterChange();
    });
  });
  yearPrevBtn.addEventListener("click", () => {
    filterYear -= 1;
    yearDisplay.textContent = filterYear;
    onFilterChange();
  });
  yearNextBtn.addEventListener("click", () => {
    filterYear += 1;
    yearDisplay.textContent = filterYear;
    onFilterChange();
  });
  document.addEventListener("click", (e) => {
    if (!monthDropdownWrap?.contains(e.target)) {
      monthPanel?.classList.remove("is-open");
      monthDropdownWrap?.classList.remove("is-open");
    }
  });

  startDateInput.value = filterStartDate;
  endDateInput.value = filterEndDate;

  function updateDayDisplay() {
    if (dayDisplay)
      dayDisplay.textContent = formatDateForDayFilter(filterStartDate);
  }

  dayPrevBtn?.addEventListener("click", () => {
    const d = new Date(filterStartDate + "T12:00:00");
    d.setDate(d.getDate() - 1);
    filterStartDate = filterEndDate = toDateStr(d);
    startDateInput.value = filterStartDate;
    endDateInput.value = filterEndDate;
    updateDayDisplay();
    onFilterChange();
  });
  dayNextBtn?.addEventListener("click", () => {
    const d = new Date(filterStartDate + "T12:00:00");
    d.setDate(d.getDate() + 1);
    filterStartDate = filterEndDate = toDateStr(d);
    startDateInput.value = filterStartDate;
    endDateInput.value = filterEndDate;
    updateDayDisplay();
    onFilterChange();
  });

  filterBar.querySelectorAll(".time-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterType = btn.dataset.filter;
      filterBar
        .querySelectorAll(".time-filter-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      dayWrap.style.display = filterType === "day" ? "" : "none";
      monthWrap.style.display = filterType === "month" ? "" : "none";
      rangeWrap.style.display = filterType === "range" ? "" : "none";
      if (filterType === "day") updateDayDisplay();
      onFilterChange();
    });
  });
  startDateInput.addEventListener("change", onFilterChange);
  endDateInput.addEventListener("change", onFilterChange);

  function onFilterChange(skipMerge = false) {
    const view = viewTabs.querySelector(".time-view-tab.active")?.dataset?.view;
    const rows =
      view === "dashboard"
        ? getFullRowsForFilter(skipMerge)
        : getFullRowsForFilter(skipMerge);
    cachedRows = rows;
    const type = filterType;
    const y = filterYear;
    const m = filterMonth;
    const start = startDateInput.value || filterStartDate;
    const end = endDateInput.value || filterEndDate;
    const filtered = filterRowsByFilterType(rows, type, y, m, start, end);
    if (view === "all") {
      renderAll(filtered);
    } else if (view === "blank") {
      contentWrap.innerHTML = "";
    } else if (view === "productivity") {
      renderByProductivity(filtered);
    } else if (view === "dashboard") {
      renderDashboard(rows);
    }
  }

  viewTabs.appendChild(filterBar);
  el.appendChild(viewTabs);

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
          <button type="button" class="time-task-setup-tab" data-tab="other">그외</button>
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
          <input type="text" class="time-add-task-name" placeholder="과제명 입력" />
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
          <div class="time-add-task-categories" data-for="productive"></div>
          <div class="time-add-task-categories" data-for="nonproductive" style="display:none"></div>
        </div>
        <div class="time-add-task-field">
          <label>과제 메모</label>
          <input type="text" class="time-add-task-memo" placeholder="과제 메모 입력" />
        </div>
        <button type="button" class="time-add-task-submit">추가</button>
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
        <button type="button" class="time-task-setup-close" aria-label="닫기">&times;</button>
        <h3 class="time-task-setup-title">과제 기록</h3>
        <button type="button" class="time-task-log-submit">기록</button>
      </div>
      <div class="time-task-setup-body time-task-log-body">
        <div class="time-task-log-fixed-top">
          <div class="time-task-log-datetime-fields-wrap">
            <div class="time-task-log-field">
              <label>과제 선택</label>
              <div class="time-task-log-task-wrap"></div>
            </div>
            <div class="time-task-log-field">
              <label>시작시간</label>
              <div class="time-task-log-datetime-input-wrap">
                <input type="date" class="time-task-log-date-start" data-hide-delete-btn="true" />
                <input type="text" class="time-task-log-time-start" placeholder="hh:mm" maxlength="5" />
              </div>
              <input type="hidden" class="time-task-log-start" />
            </div>
            <div class="time-task-log-field">
              <label>마감시간</label>
              <div class="time-task-log-datetime-wrap time-task-log-datetime-wrap-end">
                <div class="time-task-log-datetime-input-wrap">
                  <input type="date" class="time-task-log-date-end" />
                  <input type="text" class="time-task-log-time-end" placeholder="hh:mm" maxlength="5" />
                </div>
                <button type="button" class="time-task-log-datetime-clear" data-for="end" title="마감시간 지우기" aria-label="마감시간 지우기">×</button>
              </div>
              <input type="hidden" class="time-task-log-end" />
            </div>
          </div>
        </div>
        <div class="time-task-log-scroll-area">
        <div class="time-task-log-field">
          <label>과제 메모</label>
          <textarea class="time-task-log-feedback" placeholder="과제 메모 입력" rows="3"></textarea>
        </div>
        <div class="time-task-log-energy-section">
          <div class="time-task-log-energy-header">
            <h4 class="time-task-log-energy-title">성취능력</h4>
            <label class="time-task-log-energy-toggle">
              <input type="checkbox" class="time-task-log-energy-toggle-input" />
              <span class="time-task-log-energy-toggle-slider"></span>
            </label>
          </div>
          <div class="time-task-log-energy-fields" hidden>
            <div class="time-task-log-energy-slider-wrap">
              <div class="time-task-log-energy-track">
                <div class="time-task-log-energy-fill" style="width:50%"></div>
                <input type="range" class="time-task-log-energy-slider" min="-50" max="50" value="0" />
              </div>
              <span class="time-task-log-energy-value">0%</span>
            </div>
          </div>
        </div>
        <div class="time-task-log-focus-section">
          <div class="time-task-log-focus-header">
            <h4 class="time-task-log-focus-title">방해 횟수(회)</h4>
            <label class="time-task-log-focus-toggle">
              <input type="checkbox" class="time-task-log-focus-toggle-input" />
              <span class="time-task-log-focus-toggle-slider"></span>
            </label>
          </div>
          <div class="time-task-log-focus-fields" hidden>
            <div class="time-task-log-stepper">
              <button type="button" class="time-task-log-stepper-btn" data-action="minus" aria-label="감소">−</button>
              <span class="time-task-log-stepper-value">0</span>
              <button type="button" class="time-task-log-stepper-btn" data-action="plus" aria-label="증가">+</button>
            </div>
          </div>
        </div>
        <div class="time-task-log-expense-section">
          <div class="time-task-log-expense-header">
            <h4 class="time-task-log-expense-title">소비 기록</h4>
            <label class="time-task-log-expense-toggle">
              <input type="checkbox" class="time-task-log-expense-toggle-input" />
              <span class="time-task-log-expense-toggle-slider"></span>
            </label>
          </div>
          <div class="time-task-log-expense-fields" hidden>
            <div class="time-task-log-field">
              <label>소비/수입명</label>
              <input type="text" class="time-task-log-expense-name" placeholder="소비/수입명" />
            </div>
            <div class="time-task-log-field">
              <label>카테고리</label>
              <div class="time-task-log-expense-category-wrap"></div>
            </div>
            <div class="time-task-log-field">
              <label>소비/수입 분류</label>
              <div class="time-task-log-expense-classification-wrap"></div>
            </div>
            <div class="time-task-log-field">
              <label>금액</label>
              <input type="text" class="time-task-log-expense-amount" placeholder="금액" inputmode="numeric" />
            </div>
            <div class="time-task-log-expense-error" hidden></div>
          </div>
        </div>
        <div class="time-task-log-emotion-section">
          <div class="time-task-log-emotion-header">
            <h4 class="time-task-log-emotion-title">감정 기록</h4>
            <label class="time-task-log-emotion-toggle">
              <input type="checkbox" class="time-task-log-emotion-toggle-input" />
              <span class="time-task-log-emotion-toggle-slider"></span>
            </label>
          </div>
          <div class="time-task-log-emotion-fields" hidden>
            <div class="time-task-log-field">
              <label>감정</label>
              <div class="time-task-log-emotion-dropdown-wrap"></div>
            </div>
            <div class="time-task-log-field">
              <label>${TAB3_EMOTION_TEMPLATE[0]}</label>
              <textarea class="time-task-log-emotion-q1" placeholder="상황을 적어주세요" rows="2"></textarea>
            </div>
            <div class="time-task-log-field">
              <label>${TAB3_EMOTION_TEMPLATE[1]}</label>
              <textarea class="time-task-log-emotion-q2" placeholder="생각을 적어주세요" rows="2"></textarea>
            </div>
            <div class="time-task-log-field">
              <label>${TAB3_EMOTION_TEMPLATE[2]}</label>
              <textarea class="time-task-log-emotion-q3" placeholder="메모" rows="2"></textarea>
            </div>
          </div>
        </div>
        </div>
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

  taskLogPickerBackdrop?.addEventListener("click", closeDateTimePicker);

  const taskLogTitleEl = taskLogModal.querySelector(".time-task-setup-title");
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
  const taskLogDateEnd = taskLogModal.querySelector(".time-task-log-date-end");
  const taskLogTimeEnd = taskLogModal.querySelector(".time-task-log-time-end");
  const taskLogEndWrap = taskLogModal.querySelector(
    ".time-task-log-datetime-wrap-end",
  );
  const taskLogEndClearBtn = taskLogModal.querySelector(
    '.time-task-log-datetime-clear[data-for="end"]',
  );
  const taskLogFeedbackInput = taskLogModal.querySelector(
    ".time-task-log-feedback",
  );

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

  function syncStartToHidden() {
    const date = (taskLogDateStart?.value || "").trim();
    const time = normalizeHhMm(taskLogTimeStart?.value || "");
    if (date && time) {
      taskLogStartInput.value = `${date}T${time}`;
    } else if (date) {
      taskLogStartInput.value = `${date}T00:00`;
    } else {
      taskLogStartInput.value = "";
    }
  }

  function syncEndToHidden() {
    const date = (taskLogDateEnd?.value || "").trim();
    const time = normalizeHhMm(taskLogTimeEnd?.value || "");
    if (date && time) {
      taskLogEndInput.value = `${date}T${time}`;
    } else if (date) {
      taskLogEndInput.value = `${date}T23:59`;
    } else {
      taskLogEndInput.value = "";
    }
    updateEndTimeClearVisibility();
  }

  function setStartFromDatetime(dtStr) {
    if (!dtStr || typeof dtStr !== "string") {
      taskLogDateStart.value = "";
      taskLogTimeStart.value = "";
      return;
    }
    const m = dtStr.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})/);
    if (m) {
      taskLogDateStart.value = `${m[1]}-${m[2]}-${m[3]}`;
      taskLogTimeStart.value = `${String(parseInt(m[4], 10)).padStart(2, "0")}:${m[5]}`;
    } else {
      const m2 = dtStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m2) {
        taskLogDateStart.value = `${m2[1]}-${m2[2]}-${m2[3]}`;
        taskLogTimeStart.value = "";
      } else {
        taskLogDateStart.value = "";
        taskLogTimeStart.value = "";
      }
    }
    syncStartToHidden();
  }

  function setEndFromDatetime(dtStr) {
    if (!dtStr || typeof dtStr !== "string") {
      taskLogDateEnd.value = "";
      taskLogTimeEnd.value = "";
      return;
    }
    const m = dtStr.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})/);
    if (m) {
      taskLogDateEnd.value = `${m[1]}-${m[2]}-${m[3]}`;
      taskLogTimeEnd.value = `${String(parseInt(m[4], 10)).padStart(2, "0")}:${m[5]}`;
    } else {
      const m2 = dtStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m2) {
        taskLogDateEnd.value = `${m2[1]}-${m2[2]}-${m2[3]}`;
        taskLogTimeEnd.value = "";
      } else {
        taskLogDateEnd.value = "";
        taskLogTimeEnd.value = "";
      }
    }
    syncEndToHidden();
  }

  function updateEndTimeClearVisibility() {
    const hasValue = (taskLogEndInput.value || "").trim().length > 0;
    taskLogEndWrap?.classList.toggle("has-value", hasValue);
  }

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
    if (e.key === ":" && e.target.value.includes(":")) {
      e.preventDefault();
      return;
    }
    if (!/^[\d:]$/.test(e.key)) e.preventDefault();
  };

  const filterPastedTime = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData?.getData("text") || "").replace(
      /[^\d:]/g,
      "",
    );
    const input = e.target;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const current = input.value;
    const newVal = current.slice(0, start) + pasted + current.slice(end);
    input.value = newVal;
    input.setSelectionRange(start + pasted.length, start + pasted.length);
  };

  [taskLogDateStart, taskLogTimeStart].forEach((el) => {
    el?.addEventListener("change", syncStartToHidden);
    el?.addEventListener("blur", () => {
      if (el === taskLogTimeStart) {
        const preformatted =
          autoFormatDigitsToHhMm(taskLogTimeStart.value) ||
          taskLogTimeStart.value;
        taskLogTimeStart.value = normalizeHhMm(preformatted) || preformatted;
      }
      syncStartToHidden();
    });
  });
  taskLogTimeStart?.addEventListener("keydown", restrictToTimeChars);
  taskLogTimeStart?.addEventListener("paste", filterPastedTime);

  [taskLogDateEnd, taskLogTimeEnd].forEach((el) => {
    el?.addEventListener("change", syncEndToHidden);
    el?.addEventListener("blur", () => {
      if (el === taskLogTimeEnd) {
        const preformatted =
          autoFormatDigitsToHhMm(taskLogTimeEnd.value) || taskLogTimeEnd.value;
        taskLogTimeEnd.value = normalizeHhMm(preformatted) || preformatted;
      }
      syncEndToHidden();
    });
  });
  taskLogTimeEnd?.addEventListener("keydown", restrictToTimeChars);
  taskLogTimeEnd?.addEventListener("paste", filterPastedTime);
  const taskLogEnergySection = taskLogModal.querySelector(
    ".time-task-log-energy-section",
  );
  const taskLogEnergyToggleInput = taskLogModal.querySelector(
    ".time-task-log-energy-toggle-input",
  );
  const taskLogEnergyFields = taskLogModal.querySelector(
    ".time-task-log-energy-fields",
  );
  const taskLogFocusSection = taskLogModal.querySelector(
    ".time-task-log-focus-section",
  );
  const taskLogFocusToggleInput = taskLogModal.querySelector(
    ".time-task-log-focus-toggle-input",
  );
  const taskLogFocusFields = taskLogModal.querySelector(
    ".time-task-log-focus-fields",
  );
  const taskLogExpenseSection = taskLogModal.querySelector(
    ".time-task-log-expense-section",
  );
  const taskLogExpenseToggleInput = taskLogModal.querySelector(
    ".time-task-log-expense-toggle-input",
  );
  const taskLogExpenseFields = taskLogModal.querySelector(
    ".time-task-log-expense-fields",
  );
  const taskLogExpenseNameInput = taskLogModal.querySelector(
    ".time-task-log-expense-name",
  );
  const taskLogExpenseCategoryWrap = taskLogModal.querySelector(
    ".time-task-log-expense-category-wrap",
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
  const taskLogEmotionSection = taskLogModal.querySelector(
    ".time-task-log-emotion-section",
  );
  const taskLogEmotionToggleInput = taskLogModal.querySelector(
    ".time-task-log-emotion-toggle-input",
  );
  const taskLogEmotionFields = taskLogModal.querySelector(
    ".time-task-log-emotion-fields",
  );
  const taskLogEmotionDropdownWrap = taskLogModal.querySelector(
    ".time-task-log-emotion-dropdown-wrap",
  );
  const taskLogEmotionQ1 = taskLogModal.querySelector(
    ".time-task-log-emotion-q1",
  );
  const taskLogEmotionQ2 = taskLogModal.querySelector(
    ".time-task-log-emotion-q2",
  );
  const taskLogEmotionQ3 = taskLogModal.querySelector(
    ".time-task-log-emotion-q3",
  );
  const taskLogSubmitBtn = taskLogModal.querySelector(".time-task-log-submit");
  const taskLogBackdrop = taskLogModal.querySelector(
    ".time-task-setup-backdrop",
  );
  const taskLogCloseBtn = taskLogModal.querySelector(
    ".time-task-setup-panel .time-task-setup-close",
  );

  let taskLogTaskDropdown = null;
  let taskLogAddContext = null;
  let taskLogEditTr = null;
  let pendingEditStartTime = "";

  function buildTaskDropdown() {
    const wrap = document.createElement("div");
    wrap.className = "time-task-log-task-dropdown";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "time-task-log-task-dropdown-trigger";
    trigger.textContent = "과제를 선택하세요";
    const panel = document.createElement("div");
    panel.className = "time-task-log-task-dropdown-panel";
    panel.hidden = true;
    let value = "";
    function renderPanel() {
      panel.innerHTML = "";
      const allTasks = getFullTaskOptions();
      const tasks = allTasks
        .filter((t) => !(t.name || "").includes(" > "))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
      tasks.forEach((t) => {
        const row = document.createElement("div");
        row.className = "time-task-log-task-dropdown-option";
        row.textContent = t.name || "";
        row.addEventListener("click", () => {
          value = t.name || "";
          trigger.textContent = value || "과제를 선택하세요";
          panel.hidden = true;
          onEmotionTaskSelected(value);
        });
        panel.appendChild(row);
      });
    }
    trigger.addEventListener("click", () => {
      renderPanel();
      panel.hidden = !panel.hidden;
    });
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) panel.hidden = true;
    });
    wrap.appendChild(trigger);
    wrap.appendChild(panel);
    wrap._getValue = () => value;
    wrap._setValue = (v) => {
      value = v || "";
      trigger.textContent = value || "과제를 선택하세요";
      onEmotionTaskSelected(value);
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

  taskLogEndClearBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    taskLogDateEnd.value = "";
    taskLogTimeEnd.value = "";
    taskLogEndInput.value = "";
    syncEndToHidden();
    updateEndTimeClearVisibility();
  });

  function buildExpenseCategoryDropdown(initialValue, onUpdate) {
    const wrap = document.createElement("div");
    wrap.className = "time-task-log-expense-category-dropdown";
    const display = document.createElement("span");
    display.className = "time-task-log-expense-dropdown-display";
    display.textContent = initialValue || "선택";
    const panel = document.createElement("div");
    panel.className = "time-task-log-expense-dropdown-panel";
    panel.hidden = true;
    let value = initialValue || "";
    getExpenseCategoryOptions().forEach((opt) => {
      const row = document.createElement("div");
      row.className = "time-task-log-expense-dropdown-option";
      row.textContent = opt.label;
      row.addEventListener("click", () => {
        value = opt.label;
        display.textContent = value || "선택";
        panel.hidden = true;
        onUpdate?.(value);
      });
      panel.appendChild(row);
    });
    display.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
    });
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) panel.hidden = true;
    });
    wrap.appendChild(display);
    wrap.appendChild(panel);
    wrap._getValue = () => value;
    wrap._setValue = (v) => {
      value = v || "";
      display.textContent = value || "선택";
    };
    return wrap;
  }

  function buildExpenseClassificationDropdown(
    initialCategory,
    initialValue,
    onUpdate,
  ) {
    const wrap = document.createElement("div");
    wrap.className = "time-task-log-expense-classification-dropdown";
    const display = document.createElement("span");
    display.className = "time-task-log-expense-dropdown-display";
    const panel = document.createElement("div");
    panel.className = "time-task-log-expense-dropdown-panel";
    panel.hidden = true;
    let value = initialValue || "";
    let category = initialCategory || "";
    function refresh() {
      const opts = getExpenseClassificationOptions(category);
      panel.innerHTML = "";
      opts.forEach((opt) => {
        const row = document.createElement("div");
        row.className = "time-task-log-expense-dropdown-option";
        row.textContent = opt.label;
        row.addEventListener("click", () => {
          value = opt.label;
          display.textContent = value || "선택";
          panel.hidden = true;
          onUpdate?.(value);
        });
        panel.appendChild(row);
      });
      const valid = opts.some((o) => o.label === value);
      if (!valid) value = "";
      display.textContent = value || (category ? "선택" : "카테고리 먼저 선택");
    }
    display.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!category) return;
      panel.hidden = !panel.hidden;
    });
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) panel.hidden = true;
    });
    wrap.appendChild(display);
    wrap.appendChild(panel);
    wrap._getValue = () => value;
    wrap._setValue = (v) => {
      value = v || "";
      display.textContent = value || "선택";
    };
    wrap._setCategory = (c) => {
      category = c || "";
      refresh();
    };
    refresh();
    return wrap;
  }

  const expenseClassificationDropdown = buildExpenseClassificationDropdown(
    "",
    "",
    () => {},
  );
  const expenseCategoryDropdown = buildExpenseCategoryDropdown("", (cat) => {
    expenseClassificationDropdown._setCategory?.(cat);
    expenseClassificationDropdown._setValue?.("");
  });
  taskLogExpenseCategoryWrap.appendChild(expenseCategoryDropdown);
  taskLogExpenseClassificationWrap.appendChild(expenseClassificationDropdown);

  function buildEmotionDropdown() {
    const wrap = document.createElement("div");
    wrap.className = "time-task-log-emotion-dropdown";
    const display = document.createElement("span");
    display.className = "time-task-log-expense-dropdown-display";
    display.textContent = "선택";
    display.setAttribute("role", "button");
    display.setAttribute("tabindex", "0");
    const panel = document.createElement("div");
    panel.className = "time-task-log-expense-dropdown-panel";
    panel.hidden = true;
    let value = "";
    let currentTaskName = "";
    function getEmotionsForTask(taskName) {
      if (taskName === EMOTION_TASK_POSITIVE) return EMOTION_LIST_POSITIVE;
      if (taskName === EMOTION_TASK_NEGATIVE) return EMOTION_LIST_NEGATIVE;
      const entries = loadDiaryEntries();
      return getEmotionList(entries);
    }
    function refresh() {
      const emotions = getEmotionsForTask(currentTaskName);
      panel.innerHTML = "";
      emotions.forEach((em) => {
        const row = document.createElement("div");
        row.className = "time-task-log-expense-dropdown-option";
        row.textContent = em;
        row.addEventListener("click", () => {
          value = em;
          display.textContent = value || "선택";
          panel.hidden = true;
        });
        panel.appendChild(row);
      });
    }
    display.addEventListener("click", (e) => {
      e.stopPropagation();
      refresh();
      panel.hidden = !panel.hidden;
    });
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) panel.hidden = true;
    });
    wrap.appendChild(display);
    wrap.appendChild(panel);
    wrap._getValue = () => value;
    wrap._setValue = (v) => {
      value = v || "";
      display.textContent = value || "선택";
    };
    wrap._setTaskName = (taskName) => {
      currentTaskName = (taskName || "").trim();
    };
    return wrap;
  }
  const emotionDropdown = buildEmotionDropdown();
  taskLogEmotionDropdownWrap?.appendChild(emotionDropdown);

  function onEmotionTaskSelected(taskName) {
    const isEmotionTask =
      taskName === EMOTION_TASK_POSITIVE || taskName === EMOTION_TASK_NEGATIVE;
    if (isEmotionTask) {
      emotionDropdown._setTaskName?.(taskName);
      emotionDropdown._setValue?.("");
      if (taskLogEmotionToggleInput) {
        taskLogEmotionToggleInput.checked = true;
        if (taskLogEmotionFields) taskLogEmotionFields.hidden = false;
      }
      requestAnimationFrame(() => {
        taskLogEmotionSection?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } else {
      emotionDropdown._setTaskName?.("");
    }
  }

  taskLogEnergyToggleInput?.addEventListener("change", () => {
    if (taskLogEnergyFields)
      taskLogEnergyFields.hidden = !taskLogEnergyToggleInput.checked;
  });
  taskLogFocusToggleInput?.addEventListener("change", () => {
    if (taskLogFocusFields)
      taskLogFocusFields.hidden = !taskLogFocusToggleInput.checked;
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
  let taskLogEnergyValue = "";
  let taskLogFocusValue = "0";
  const taskLogEnergySlider = taskLogModal.querySelector(
    ".time-task-log-energy-slider",
  );
  const taskLogEnergyValueEl = taskLogModal.querySelector(
    ".time-task-log-energy-value",
  );
  const taskLogEnergyFill = taskLogModal.querySelector(
    ".time-task-log-energy-fill",
  );
  const focusStepperValueEl = taskLogModal.querySelector(
    ".time-task-log-stepper-value",
  );
  const focusStepperMinus = taskLogModal.querySelector(
    '.time-task-log-stepper-btn[data-action="minus"]',
  );
  const focusStepperPlus = taskLogModal.querySelector(
    '.time-task-log-stepper-btn[data-action="plus"]',
  );
  function updateFocusStepper(value) {
    const n = Math.max(0, parseInt(String(value || "0"), 10) || 0);
    taskLogFocusValue = String(n);
    if (focusStepperValueEl) focusStepperValueEl.textContent = n;
  }
  focusStepperMinus?.addEventListener("click", () => {
    const n = Math.max(0, (parseInt(taskLogFocusValue, 10) || 0) - 1);
    updateFocusStepper(n);
  });
  focusStepperPlus?.addEventListener("click", () => {
    const n = (parseInt(taskLogFocusValue, 10) || 0) + 1;
    updateFocusStepper(n);
  });
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
  function updateEnergySlider(value) {
    const v = parseEnergyToValue(value);
    if (taskLogEnergySlider && taskLogEnergyValueEl) {
      const val = v != null ? v : 0;
      taskLogEnergySlider.value = val;
      taskLogEnergyValueEl.textContent = val > 0 ? `+${val}%` : val + "%";
      taskLogEnergyValue = String(val);
      if (taskLogEnergyFill) taskLogEnergyFill.style.width = val + 50 + "%";
    }
  }
  if (taskLogEnergySlider && taskLogEnergyValueEl) {
    taskLogEnergySlider.addEventListener("input", () => {
      const v = parseInt(taskLogEnergySlider.value, 10);
      taskLogEnergyValueEl.textContent = v > 0 ? `+${v}%` : v + "%";
      taskLogEnergyValue = String(v);
      if (taskLogEnergyFill) taskLogEnergyFill.style.width = v + 50 + "%";
    });
  }

  taskLogExpenseToggleInput?.addEventListener("change", () => {
    if (taskLogExpenseFields)
      taskLogExpenseFields.hidden = !taskLogExpenseToggleInput.checked;
  });

  taskLogEmotionToggleInput?.addEventListener("change", () => {
    if (taskLogEmotionFields)
      taskLogEmotionFields.hidden = !taskLogEmotionToggleInput.checked;
  });

  taskLogExpenseAmountInput?.addEventListener("input", () => {
    const v = taskLogExpenseAmountInput.value;
    const filtered = v.replace(/[^\d,]/g, "");
    if (v !== filtered) taskLogExpenseAmountInput.value = filtered;
  });

  function getDefaultStartTime(addContext) {
    const dateStr =
      filterType === "day"
        ? filterStartDate
        : (() => {
            const y = new Date();
            y.setDate(y.getDate() - 1);
            return y.toISOString().slice(0, 10);
          })();
    let allRows = [];
    if (addContext?.viewEl) {
      allRows = Array.from(addContext.viewEl.querySelectorAll("tr.time-row"));
    } else if (addContext?.tbody) {
      allRows = Array.from(addContext.tbody.querySelectorAll("tr.time-row"));
    }
    const rowsForDate = allRows.filter((r) => {
      const rd = r._rowData;
      if (!rd) return false;
      const rowDate = (rd.date || "")
        .toString()
        .replace(/\//g, "-")
        .slice(0, 10);
      return rowDate === dateStr;
    });
    if (rowsForDate.length === 0) {
      const todayStr = toDateStr(new Date());
      return todayStr + "T00:00";
    }
    let latestEnd = null;
    rowsForDate.forEach((r) => {
      const et = r._rowData?.endTime;
      if (!et) return;
      const normalized = (et || "").trim().replace(/\s+/, "T");
      const d = new Date(normalized);
      if (!isNaN(d.getTime()) && (!latestEnd || d > latestEnd)) latestEnd = d;
    });
    if (!latestEnd) return dateStr + "T00:00";
    const y = latestEnd.getFullYear();
    const m = String(latestEnd.getMonth() + 1).padStart(2, "0");
    const day = String(latestEnd.getDate()).padStart(2, "0");
    const h = String(latestEnd.getHours()).padStart(2, "0");
    const min = String(latestEnd.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}T${h}:${min}`;
  }

  function openTaskLogModal(addContext) {
    taskLogAddContext = addContext;
    taskLogEditTr = null;
    pendingEditStartTime = "";
    taskLogTitleEl.textContent = "과제 기록";
    taskLogSubmitBtn.textContent = "기록";
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
    const mainTasks = getFullTaskOptions().filter(
      (t) => !(t.name || "").includes(" > "),
    );
    const firstTask = mainTasks[0]?.name || "";
    taskLogTaskDropdown._setValue?.(firstTask);
    const defaultStart = getDefaultStartTime(addContext);
    setStartFromDatetime(defaultStart || "");
    setEndFromDatetime("");
    updateEndTimeClearVisibility();
    taskLogFeedbackInput.value = "";
    taskLogExpenseNameInput.value = "";
    expenseCategoryDropdown._setValue?.("");
    expenseClassificationDropdown._setValue?.("");
    expenseClassificationDropdown._setCategory?.("");
    taskLogExpenseAmountInput.value = "";
    if (taskLogExpenseToggleInput) taskLogExpenseToggleInput.checked = false;
    if (taskLogExpenseFields) taskLogExpenseFields.hidden = true;
    if (taskLogExpenseErrorEl) {
      taskLogExpenseErrorEl.textContent = "";
      taskLogExpenseErrorEl.hidden = true;
    }
    emotionDropdown._setValue?.("");
    if (taskLogEmotionQ1) taskLogEmotionQ1.value = "";
    if (taskLogEmotionQ2) taskLogEmotionQ2.value = "";
    if (taskLogEmotionQ3) taskLogEmotionQ3.value = "";
    if (taskLogEmotionToggleInput) taskLogEmotionToggleInput.checked = false;
    if (taskLogEmotionFields) taskLogEmotionFields.hidden = true;
    taskLogEnergyValue = "50";
    taskLogFocusValue = "0";
    if (taskLogEnergyToggleInput) taskLogEnergyToggleInput.checked = false;
    if (taskLogEnergyFields) taskLogEnergyFields.hidden = true;
    if (taskLogFocusToggleInput) taskLogFocusToggleInput.checked = false;
    if (taskLogFocusFields) taskLogFocusFields.hidden = true;
    updateEnergySlider("50");
    updateFocusStepper("0");
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
    pendingEditStartTime = startTime || "";
    taskLogTitleEl.textContent = "과제 수정";
    taskLogSubmitBtn.textContent = "수정";
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
    taskLogFeedbackInput.value = data.feedback || "";
    taskLogExpenseNameInput.value = "";
    expenseCategoryDropdown._setValue?.("");
    expenseClassificationDropdown._setValue?.("");
    expenseClassificationDropdown._setCategory?.("");
    taskLogExpenseAmountInput.value = "";
    if (taskLogExpenseToggleInput) taskLogExpenseToggleInput.checked = false;
    if (taskLogExpenseFields) taskLogExpenseFields.hidden = true;
    emotionDropdown._setValue?.("");
    if (taskLogEmotionQ1) taskLogEmotionQ1.value = "";
    if (taskLogEmotionQ2) taskLogEmotionQ2.value = "";
    if (taskLogEmotionQ3) taskLogEmotionQ3.value = "";
    if (taskLogEmotionToggleInput) taskLogEmotionToggleInput.checked = false;
    if (taskLogEmotionFields) taskLogEmotionFields.hidden = true;
    taskLogEnergyValue = String(data.energy || "").trim();
    taskLogFocusValue = String(data.focus || "0").trim() || "0";
    if (taskLogEnergyToggleInput) {
      taskLogEnergyToggleInput.checked = !!taskLogEnergyValue;
      if (taskLogEnergyFields)
        taskLogEnergyFields.hidden = !taskLogEnergyToggleInput.checked;
    }
    if (taskLogFocusToggleInput) {
      taskLogFocusToggleInput.checked = String(data.focus || "").trim() !== "";
      if (taskLogFocusFields)
        taskLogFocusFields.hidden = !taskLogFocusToggleInput.checked;
    }
    updateEnergySlider(taskLogEnergyValue || "0");
    updateFocusStepper(taskLogFocusValue || "0");
  }

  function closeTaskLogModal() {
    taskLogModal.hidden = true;
    closeDateTimePicker();
    taskLogModal.style.zIndex = "";
    document.body.style.overflow = "";
    taskLogAddContext = null;
    taskLogEditTr = null;
    pendingEditStartTime = "";
  }

  taskLogSubmitBtn.addEventListener("click", () => {
    syncStartToHidden();
    syncEndToHidden();

    const editTr = taskLogEditTr;
    const addCtx = taskLogAddContext;
    let oldRowDataToRemove = null;

    const taskName = (taskLogTaskDropdown?._getValue?.() || "").trim();
    const startRaw = (taskLogStartInput.value || "").trim();
    const endRaw = (taskLogEndInput.value || "").trim();
    if (!taskName || !startRaw) {
      alert("과제 선택과 시작시간을 입력해주세요.");
      return;
    }
    let startTime = formatDateTimeInput(startRaw) || startRaw;
    let endTime = formatDateTimeInput(endRaw) || endRaw;
    if (startTime && endTime) {
      endTime = mergeEndTimeWithStartDate(startTime, endTime) || endTime;
    }
    const feedback = (taskLogFeedbackInput.value || "").trim();
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
    if ((taskName || "").trim() === "낮잠" && timeTracked) {
      const nap = getNapCategoryProductivity(timeTracked);
      category = nap.category;
      productivity = nap.productivity;
    }
    const dateStr = parseDateFromDateTime(startTime) || toDateStr(new Date());
    const expenseName = (taskLogExpenseNameInput.value || "").trim();
    const expenseAmount = (taskLogExpenseAmountInput.value || "")
      .trim()
      .replace(/,/g, "");
    const expenseCategory = expenseCategoryDropdown._getValue?.() || "";
    const expenseClassification =
      expenseClassificationDropdown._getValue?.() || "";

    const energyToggleOn = taskLogEnergyToggleInput?.checked;
    const focusToggleOn = taskLogFocusToggleInput?.checked;
    const energyValue = energyToggleOn ? taskLogEnergyValue : "";
    const focusValue = focusToggleOn ? taskLogFocusValue : "";

    const expenseToggleOn = taskLogExpenseToggleInput?.checked;
    if (expenseToggleOn) {
      const missing = [];
      if (!expenseName) missing.push("소비/수입명");
      if (!expenseCategory) missing.push("카테고리");
      if (!expenseClassification) missing.push("소비/수입 분류");
      if (!expenseAmount || !parseFloat(expenseAmount)) missing.push("금액");
      if (missing.length > 0) {
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
      const newRowData = {
        taskName,
        startTime,
        endTime,
        timeTracked,
        productivity,
        category,
        date: dateStr,
        feedback,
        energy: energyValue,
        focus: focusValue,
      };
      editTr._rowData = newRowData;
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
      editTr.querySelector(".time-display-end").textContent = endTime
        ? toDisplayTimeOnly(endTime) || endTime
        : "";
      editTr.querySelector(".time-display-tracked").textContent = timeTracked;
      editTr.querySelector(".time-display-feedback").textContent = feedback;
      const catOpt = CATEGORY_OPTIONS.find((o) => o.value === category);
      editTr.querySelector(".time-cell-category .time-tag-pill").textContent =
        catOpt ? catOpt.label : "—";
      editTr.querySelector(".time-cell-category .time-tag-pill").className =
        "time-tag-pill cat " + (catOpt ? catOpt.color : "cat-empty");
      const prodOpt = PRODUCTIVITY_OPTIONS.find(
        (o) => o.value === productivity,
      );
      editTr.querySelector(
        ".time-cell-productivity .time-tag-pill",
      ).textContent = prodOpt ? prodOpt.label : "";
      editTr.querySelector(".time-cell-productivity .time-tag-pill").className =
        "time-tag-pill prod " + (prodOpt ? prodOpt.color : "");
      editTr.querySelector(".time-display-date").textContent = dateStr
        ? formatDateDisplay(dateStr)
        : "";
      const focusDisplay = editTr.querySelector(
        ".time-cell-focus .time-display-focus",
      );
      const energyDisplay = editTr.querySelector(
        ".time-cell-energy .time-display-energy",
      );
      if (focusDisplay) focusDisplay.textContent = focusValue || "";
      if (energyDisplay)
        energyDisplay.textContent = formatEnergyForDisplay(energyValue);
      editTr._updatePrice?.();
    } else if (addCtx) {
      const ctx = addCtx;
      const newRowData = {
        taskName,
        startTime,
        endTime,
        timeTracked,
        productivity: ctx.productivity || productivity,
        category,
        date: dateStr,
        feedback,
        energy: energyValue,
        focus: focusValue,
      };
      const tr = createRow(
        newRowData,
        ctx.onRowUpdate,
        ctx.viewEl,
        ctx.handleRowDelete,
        ctx.handleRowEdit,
      );
      if (ctx.addRow) ctx.tbody.insertBefore(tr, ctx.addRow);
      else ctx.tbody.appendChild(tr);
      ctx.onRowUpdate?.();
    }

    if (
      expenseToggleOn &&
      expenseName &&
      expenseCategory &&
      expenseClassification &&
      expenseAmount &&
      parseFloat(expenseAmount)
    ) {
      const raw = parseFloat(String(expenseAmount).replace(/,/g, "")) || 0;
      const signed =
        expenseCategory === "수입" ? Math.abs(raw) : -Math.abs(raw);
      const amountFormatted = signed.toLocaleString("ko-KR");
      const existingRows = loadExpenseRows();
      const dateForExpense = (
        dateStr || new Date().toISOString().slice(0, 10)
      ).replace(/\//g, "-");
      existingRows.push({
        name: expenseName,
        date: dateForExpense,
        category: expenseCategory,
        classification: expenseClassification,
        amount: amountFormatted,
        payment: "",
        memo: "",
      });
      saveExpenseRows(existingRows);
    }

    const emotionToggleOn = taskLogEmotionToggleInput?.checked;
    const emotionValue = emotionDropdown._getValue?.() || "";
    const emotionQ1 = (taskLogEmotionQ1?.value || "").trim();
    const emotionQ2 = (taskLogEmotionQ2?.value || "").trim();
    const emotionQ3 = (taskLogEmotionQ3?.value || "").trim();
    const hasEmotionContent = emotionQ1 || emotionQ2 || emotionQ3;
    if (emotionToggleOn && emotionValue && hasEmotionContent) {
      const entries = loadDiaryEntries();
      addEmotionEntry(
        entries,
        emotionValue,
        dateStr,
        emotionQ1,
        emotionQ2,
        emotionQ3,
      );
      saveDiaryEntries(entries);
    }

    if (editTr || addCtx) {
      if (editTr && oldRowDataToRemove) {
        const oldKey = `${oldRowDataToRemove.date}|${oldRowDataToRemove.taskName}|${oldRowDataToRemove.startTime}`;
        allRowsCache = allRowsCache.filter(
          (c) => `${c.date}|${c.taskName}|${c.startTime}` !== oldKey,
        );
      }
      onFilterChange();
      saveTimeRows(getFullRowsForFilter(true));
    }
    closeTaskLogModal();
    el._updateTotal?.();
  });

  taskLogBackdrop?.addEventListener("click", closeTaskLogModal);
  taskLogCloseBtn?.addEventListener("click", closeTaskLogModal);

  const backdrop = taskSetupModal.querySelector(".time-task-setup-backdrop");
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

  const addTaskBackdrop = addTaskModal.querySelector(
    ".time-task-setup-backdrop",
  );
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
  const addTaskMemoInput = addTaskModal.querySelector(".time-add-task-memo");
  const addTaskSubmitBtn = addTaskModal.querySelector(".time-add-task-submit");

  function renderCategoryButtons(container, categories) {
    container.innerHTML = "";
    categories.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `time-add-task-cat-btn ${c.color || ""}`;
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
        const isLocked = lockedForDisplay.has(t.name);
        const catLabel = getCatLabel(t.category);
        const row = document.createElement("div");
        row.className = "time-task-setup-item";
        row.innerHTML = `
          <span class="time-task-setup-item-name">${(t.name || "").replace(/</g, "&lt;")}</span>
          <span class="time-task-setup-item-cat">${catLabel}</span>
          ${
            isLocked
              ? ""
              : `<div class="time-task-setup-item-actions">
            <button type="button" class="time-task-setup-edit" title="수정">수정</button>
            <button type="button" class="time-task-setup-del" title="삭제">삭제</button>
          </div>`
          }
        `;
        if (!isLocked) {
          row
            .querySelector(".time-task-setup-edit")
            .addEventListener("click", () => {
              if (getLockedTaskNames().has(t.name)) {
                alert(
                  "이 과제는 KPI와 연동되어 있어 과제 설정에서 수정할 수 없습니다.",
                );
                return;
              }
              openAddTaskModal(t);
            });
          row
            .querySelector(".time-task-setup-del")
            .addEventListener("click", () => {
              if (getLockedTaskNames().has(t.name)) {
                alert(
                  "이 과제는 KPI와 연동되어 있어 과제 설정에서 삭제할 수 없습니다. 해당 메뉴에서 수정해주세요.",
                );
                return;
              }
              removeTaskOption(t.name);
              renderTaskSetupList();
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
  function openAddTaskModal(editTask) {
    addTaskModal.hidden = false;
    addTaskModal.style.zIndex = "1001";
    addTaskNameInput.value = editTask ? editTask.name : "";
    addTaskNameInput.dataset.editName = editTask ? editTask.name : "";
    if (addTaskMemoInput) addTaskMemoInput.value = editTask?.memo || "";
    const prod = editTask ? editTask.productivity : "productive";
    addTaskModal.querySelector(
      `input[name="addProd"][value="${prod}"]`,
    ).checked = true;
    selectedCategory = editTask ? editTask.category : "";
    addTaskCatProd.style.display = prod === "productive" ? "flex" : "none";
    addTaskCatNonProd.style.display =
      prod === "nonproductive" ? "flex" : "none";
    addTaskCatProd
      .querySelectorAll(".time-add-task-cat-btn")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.value === selectedCategory),
      );
    addTaskCatNonProd
      .querySelectorAll(".time-add-task-cat-btn")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.value === selectedCategory),
      );
    addTaskNameInput.focus();
  }

  function closeAddTaskModal() {
    addTaskModal.hidden = true;
    addTaskModal.style.zIndex = "";
  }

  addTaskProdRadios.forEach((r) => {
    r.addEventListener("change", () => {
      const prod = r.value;
      addTaskCatProd.style.display = prod === "productive" ? "flex" : "none";
      addTaskCatNonProd.style.display =
        prod === "nonproductive" ? "flex" : "none";
      selectedCategory = "";
      addTaskCatProd
        .querySelectorAll(".time-add-task-cat-btn")
        .forEach((b) => b.classList.remove("active"));
      addTaskCatNonProd
        .querySelectorAll(".time-add-task-cat-btn")
        .forEach((b) => b.classList.remove("active"));
    });
  });
  addTaskCatProd.querySelectorAll(".time-add-task-cat-btn").forEach((b) => {
    b.addEventListener("click", () => {
      addTaskCatProd
        .querySelectorAll(".time-add-task-cat-btn")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      selectedCategory = b.dataset.value;
    });
  });
  addTaskCatNonProd.querySelectorAll(".time-add-task-cat-btn").forEach((b) => {
    b.addEventListener("click", () => {
      addTaskCatNonProd
        .querySelectorAll(".time-add-task-cat-btn")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      selectedCategory = b.dataset.value;
    });
  });

  addTaskSubmitBtn.addEventListener("click", () => {
    const name = (addTaskNameInput.value || "").trim();
    if (!name) return;
    const prod =
      addTaskModal.querySelector('input[name="addProd"]:checked')?.value ||
      "productive";
    const memo = (addTaskMemoInput?.value || "").trim();
    const editName = addTaskNameInput.dataset.editName || "";
    if (editName) {
      updateTaskOption(editName, {
        name,
        category: selectedCategory,
        productivity: prod,
        memo,
      });
    } else {
      addTaskOptionFull({
        name,
        category: selectedCategory,
        productivity: prod,
        memo,
      });
    }
    renderTaskSetupList();
    closeAddTaskModal();
  });

  addTaskBtn?.addEventListener("click", () => openAddTaskModal(null));
  addTaskBackdrop?.addEventListener("click", closeAddTaskModal);
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
    taskSetupModal.hidden = false;
    document.body.style.overflow = "hidden";
    activeSetupTab =
      taskSetupModal.querySelector(".time-task-setup-tab.active")?.dataset
        ?.tab || "all";
    selectedSubcat = "";
    renderSubcatButtons(activeSetupTab);
    renderTaskSetupList();
  });
  function closeTaskSetupModal() {
    taskSetupModal.hidden = true;
    document.body.style.overflow = "";
    closeAddTaskModal();
  }
  backdrop?.addEventListener("click", closeTaskSetupModal);
  closeBtn?.addEventListener("click", closeTaskSetupModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!taskLogPickerWrap.hidden) {
        closeDateTimePicker();
      } else if (!taskLogModal.hidden) {
        closeTaskLogModal();
      } else if (!addTaskModal.hidden) closeAddTaskModal();
      else if (!taskSetupModal.hidden) closeTaskSetupModal();
    }
  });

  const contentWrap = document.createElement("div");
  contentWrap.className = "time-view-content-wrap";
  el.appendChild(contentWrap);

  let allRowsCache = loadTimeRows();
  let cachedRows = [];

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

  const totalFooter = document.createElement("div");
  totalFooter.className = "time-total-footer";
  const totalDisplay = document.createElement("span");
  totalDisplay.className = "time-total-display";
  totalFooter.appendChild(totalDisplay);
  el.appendChild(totalFooter);

  function updateTotal() {
    let sum = 0;
    contentWrap
      .querySelectorAll(".time-row .time-price-display")
      .forEach((el) => {
        sum += parsePriceFromDisplay(el.textContent || "");
      });
    totalDisplay.textContent = formatPrice(sum) + "원";
    totalDisplay.classList.toggle("is-negative", sum < 0);
    totalDisplay.classList.toggle("is-positive", sum > 0);
    updateHourlyHint();
  }
  el._updateTotal = updateTotal;

  const tableWrap = document.createElement("div");
  tableWrap.className = "time-ledger-table-wrap";

  const table = document.createElement("table");
  table.className = "time-ledger-table";
  table.innerHTML = createTableHTML();

  const tbody = table.querySelector("tbody");
  const theadRow = table.querySelector("thead tr");
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

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "time-btn-add";
  addBtn.innerHTML =
    '<img src="/toolbaricons/add-square.svg" alt="" class="time-add-icon" width="18" height="18"> 과제 기록';

  const initialHandleRowDelete = (tr, rowData) => {
    if (rowData) {
      const k = `${rowData.date}|${rowData.taskName}|${rowData.startTime}`;
      allRowsCache = allRowsCache.filter(
        (c) => `${c.date}|${c.taskName}|${c.startTime}` !== k,
      );
      saveTimeRows(allRowsCache);
    }
    tr.remove();
    updateTotal();
  };
  const initialHandleRowEdit = (tr, rowData) => {
    openTaskLogModalForEdit(tr, rowData);
  };

  addBtn.addEventListener("click", () => {
    if (openTaskLogModal) {
      openTaskLogModal({
        productivity: null,
        tbody,
        addRow: null,
        onRowUpdate: updateTotal,
        viewEl: el,
        createRow,
        handleRowDelete: initialHandleRowDelete,
        handleRowEdit: initialHandleRowEdit,
      });
    } else {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      const tr = createRow(
        { date: yesterdayStr },
        updateTotal,
        el,
        initialHandleRowDelete,
        initialHandleRowEdit,
      );
      tbody.appendChild(tr);
      updateTotal();
    }
  });

  updateTotal();

  function renderAll(rows = []) {
    contentWrap.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "time-ledger-table-wrap";
    const tbl = document.createElement("table");
    tbl.className = "time-ledger-table";
    tbl.innerHTML = createTableHTML();
    const tbodyEl = tbl.querySelector("tbody");
    const addBtnEl = document.createElement("button");
    addBtnEl.type = "button";
    addBtnEl.className = "time-btn-add";
    addBtnEl.innerHTML =
      '<img src="/toolbaricons/add-square.svg" alt="" class="time-add-icon" width="18" height="18"> 과제 기록';

    const handleRowDelete = (tr, rowData) => {
      if (rowData) {
        const k = `${rowData.date}|${rowData.taskName}|${rowData.startTime}`;
        allRowsCache = allRowsCache.filter(
          (c) => `${c.date}|${c.taskName}|${c.startTime}` !== k,
        );
        saveTimeRows(allRowsCache);
      }
      tr.remove();
      updateTotal();
    };
    const handleRowEdit = (tr, rowData) => {
      openTaskLogModalForEdit(tr, rowData);
    };

    rows.forEach((d) => {
      const tr = createRow(d, updateTotal, el, handleRowDelete, handleRowEdit);
      tbodyEl.appendChild(tr);
    });

    addBtnEl.addEventListener("click", () => {
      if (openTaskLogModal) {
        openTaskLogModal({
          productivity: null,
          tbody: tbodyEl,
          addRow: null,
          onRowUpdate: updateTotal,
          viewEl: el,
          createRow,
          handleRowDelete,
          handleRowEdit,
        });
      } else {
        const dateStr =
          filterType === "day"
            ? filterStartDate
            : (() => {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                return yesterday.toISOString().slice(0, 10);
              })();
        const tr = createRow(
          { date: dateStr },
          updateTotal,
          el,
          handleRowDelete,
          handleRowEdit,
        );
        tbodyEl.appendChild(tr);
        updateTotal();
      }
    });

    const taskThEl = tbl.querySelector(".time-th-task");
    const taskColEl = tbl.querySelector(".time-col-task");
    if (taskThEl && taskColEl) {
      const resizerEl = document.createElement("div");
      resizerEl.className = "time-col-resizer";
      resizerEl.title = "드래그하여 너비 조절";
      taskThEl.appendChild(resizerEl);
      resizerEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = taskThEl.getBoundingClientRect().width;
        const onMove = (moveE) => {
          const dx = moveE.clientX - startX;
          const newWidth = Math.max(80, Math.min(500, startWidth + dx));
          taskColEl.style.width = `${newWidth}px`;
          taskColEl.style.minWidth = `${newWidth}px`;
          updateStickyLefts(tbl);
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          updateStickyLefts(tbl);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      });
      requestAnimationFrame(() => updateStickyLefts(tbl));
    }

    wrap.appendChild(tbl);
    const ledgerContainer = document.createElement("div");
    ledgerContainer.className = "time-ledger-container";
    ledgerContainer.appendChild(wrap);
    const addButtonWrap = document.createElement("div");
    addButtonWrap.className = "time-add-button-wrap";
    addButtonWrap.appendChild(addBtnEl);
    ledgerContainer.appendChild(addButtonWrap);
    contentWrap.appendChild(ledgerContainer);
  }

  function renderByProductivity(rows = []) {
    contentWrap.innerHTML = "";
    const handleRowDelete = (tr, rowData) => {
      if (rowData) {
        const k = `${rowData.date}|${rowData.taskName}|${rowData.startTime}`;
        allRowsCache = allRowsCache.filter(
          (c) => `${c.date}|${c.taskName}|${c.startTime}` !== k,
        );
        saveTimeRows(allRowsCache);
      }
      tr.remove();
      updateTotal();
    };
    PRODUCTIVITY_VIEW_ORDER.forEach((prod) => {
      const sectionRows =
        prod.value === "other"
          ? rows.filter((r) => !r.productivity || r.productivity === "other")
          : rows.filter((r) => r.productivity === prod.value);
      contentWrap.appendChild(
        createProductivitySection(
          prod,
          sectionRows,
          el,
          updateTotal,
          handleRowDelete,
          openTaskLogModal,
          openTaskLogModalForEdit,
        ),
      );
    });
    updateTotal();
  }

  function renderDashboard(rows = []) {
    contentWrap.innerHTML = "";
    const dash = document.createElement("div");
    dash.className = "time-dashboard-view";

    const type = filterType;
    const y = filterYear;
    const m = filterMonth;
    const start = startDateInput.value || filterStartDate;
    const end = endDateInput.value || filterEndDate;
    const periodLabel = getFilterPeriodLabel(type, y, m, start, end);
    const filtered = filterRowsByFilterType(rows, type, y, m, start, end);
    const hourlyRate =
      parseFloat(
        String(el.querySelector(".time-hourly-input")?.value || "0").replace(
          /,/g,
          "",
        ),
      ) || 0;

    // 1. 하루 평균 가용시간
    const widgetAvailable = document.createElement("div");
    widgetAvailable.className =
      "time-dashboard-widget time-dashboard-widget-available";
    const avg = calcAvgAvailableHoursFromFiltered(filtered);
    widgetAvailable.innerHTML = `
      <div class="time-dashboard-widget-title">하루 평균 가용시간</div>
      <div class="time-dashboard-widget-value">${avg != null ? formatHoursDisplay(avg) : "—"}</div>
      <div class="time-dashboard-widget-desc">${avg != null ? `${periodLabel} 기준 · 24시간 - 근무 - 수면` : `${periodLabel}에 근무/수면 기록이 없습니다`}</div>
    `;

    // 4. 하루의 가치 (먼저 생성 - 최근 7일일 때 가용시간 옆에 배치)
    const dayValue = calcPeriodValueFromFiltered(filtered, hourlyRate);
    const widgetValue = document.createElement("div");
    widgetValue.className =
      "time-dashboard-widget time-dashboard-widget-day-value";
    widgetValue.innerHTML = `
      <div class="time-dashboard-widget-title">${periodLabel} 하루의 가치</div>
      <div class="time-dashboard-widget-value ${dayValue < 0 ? "is-negative" : dayValue > 0 ? "is-positive" : ""}">${formatPrice(dayValue)}원</div>
    `;

    let widgetTop7;
    try {
      const filteredExcludingWorkSleep = filtered.filter(
        (r) =>
          (r.category || "").trim() !== "work" &&
          (r.category || "").trim() !== "sleep",
      );
      const byTask = aggregateHoursByTask(filteredExcludingWorkSleep);
      const top7Tasks = Object.entries(byTask)
        .map(([task, hrs]) => ({ task: String(task || ""), hrs }))
        .sort((a, b) => b.hrs - a.hrs)
        .slice(0, 3);
      const maxTaskHrs = top7Tasks.length
        ? Math.max(...top7Tasks.map((x) => x.hrs))
        : 1;
      const TOP7_COLORS = [
        "#e8a4b8",
        "#a78bfa",
        "#60a5fa",
        "#7eb8da",
        "#34d399",
        "#fbbf24",
        "#94a3b8",
      ];
      const esc = (s) =>
        String(s ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      widgetTop7 = document.createElement("div");
      widgetTop7.className = "time-dashboard-widget time-dashboard-widget-top7";
      const top7Html =
        top7Tasks.length > 0
          ? top7Tasks
              .map(
                (x, i) =>
                  `<div class="time-dash-top7-row">
  <span class="time-dash-top7-num">${String(i + 1).padStart(2, "0")}</span>
  <span class="time-dash-top7-task">${esc(x.task)}</span>
  <div class="time-dash-top7-track">
    <div class="time-dash-top7-fill" style="width:${(x.hrs / maxTaskHrs) * 100}%;background:${TOP7_COLORS[i % 7]}"></div>
  </div>
  <span class="time-dash-top7-value">${formatHoursDisplay(x.hrs)}</span>
</div>`,
              )
              .join("")
          : '<div class="time-dash-empty">기록이 없습니다</div>';
      widgetTop7.innerHTML = `<div class="time-dashboard-widget-title">시간 TOP 3 활동</div><div class="time-dash-top7-exclude">근무/수면 제외</div><div class="time-dash-top7-list">${top7Html}</div>`;
    } catch (e) {
      console.error("TOP 7 위젯 오류:", e);
      widgetTop7 = document.createElement("div");
      widgetTop7.className = "time-dashboard-widget time-dashboard-widget-top7";
      widgetTop7.innerHTML =
        '<div class="time-dashboard-widget-title">시간 TOP 3 활동</div><div class="time-dash-top7-exclude">근무/수면 제외</div><div class="time-dash-empty">표시할 수 없습니다</div>';
    }

    const rowTop = document.createElement("div");
    rowTop.className = "time-dashboard-row-top";
    rowTop.appendChild(widgetAvailable);
    rowTop.appendChild(widgetValue);
    rowTop.appendChild(widgetTop7);
    dash.appendChild(rowTop);

    // 2. 전일 카테고리별 시간 사용 현황 (세로 막대)
    const byCategory = aggregateHoursByCategory(filtered);
    const catEntries = Object.entries(byCategory)
      .map(([k, v]) => ({
        cat: k,
        label: getCategoryLabel(k),
        hrs: v,
        color:
          CATEGORY_OPTIONS.find((o) => o.value === k)?.color || "cat-empty",
      }))
      .sort((a, b) => b.hrs - a.hrs);
    const maxCatHrs = Math.max(...catEntries.map((x) => x.hrs), 0.01);

    const widgetCategoryBar = document.createElement("div");
    widgetCategoryBar.className =
      "time-dashboard-widget time-dashboard-widget-category-bar";
    const catBarHtml = catEntries
      .map(
        (x) => `
      <div class="time-dash-bar-row">
        <span class="time-dash-bar-label">${x.label}</span>
        <div class="time-dash-bar-track">
          <div class="time-dash-bar-fill ${x.color}" style="width:${(x.hrs / maxCatHrs) * 100}%"></div>
        </div>
        <span class="time-dash-bar-value">${formatHoursDisplay(x.hrs)}</span>
      </div>
    `,
      )
      .join("");
    widgetCategoryBar.innerHTML = `
      <div class="time-dashboard-widget-title">${periodLabel} 카테고리별 시간 사용 현황</div>
      <div class="time-dash-bar-list">${catEntries.length ? catBarHtml : '<div class="time-dash-empty">기록이 없습니다</div>'}</div>
    `;
    dash.appendChild(widgetCategoryBar);

    // 일별 수익 차트 (이번달/지난달/최근 7일일 때 표시, 하루 필터일 때는 미표시)
    let widgetDailyRev = null;
    const { start: rangeStart, end: rangeEnd } = getDateRangeForFilterType(
      type,
      y,
      m,
      start,
      end,
    );
    if (type !== "day" && rangeStart && rangeEnd) {
      const dailyRev = aggregateDailyRevenueFromFiltered(filtered, hourlyRate);
      const dailyData = [];
      {
        const cur = new Date(rangeStart + "T00:00:00");
        const endDate = new Date(rangeEnd + "T00:00:00");
        while (cur <= endDate) {
          const dateStr = toDateStr(cur);
          const day = cur.getDate();
          const month = cur.getMonth();
          dailyData.push({
            date: dateStr,
            day,
            month,
            price: dailyRev[dateStr] || 0,
          });
          cur.setDate(cur.getDate() + 1);
        }
      }
      const daysCount = dailyData.length;
      if (daysCount === 0) {
        widgetDailyRev = null;
      } else {
        const allPrices = dailyData.map((x) => x.price).filter((v) => v !== 0);
        const dataMin = allPrices.length ? Math.min(...allPrices) : 0;
        const dataMax = allPrices.length ? Math.max(...allPrices) : 0;
        const pad = 0.12;
        let yMin = 0;
        let yMax = 100000;
        if (dataMin < 0 && dataMax > 0) {
          yMin = dataMin * (1 + pad);
          yMax = dataMax * (1 + pad);
        } else if (dataMin < 0) {
          yMin = dataMin * (1 + pad);
          yMax = 0;
        } else if (dataMax > 0) {
          yMin = 0;
          yMax = dataMax * (1 + pad);
        }
        if (yMax - yMin < 50000) {
          const mid = (yMin + yMax) / 2;
          yMin = mid - 25000;
          yMax = mid + 25000;
        }
        const yRange = yMax - yMin;
        const chartH = 200;
        const chartW = 700;
        const padLeft = 40;
        const padRight = 14;
        const padTop = 22;
        const padBottom = 34;
        const plotH = chartH - padTop - padBottom;
        const plotW = chartW - padLeft - padRight;
        const barGap = 10;
        const barTotalW = plotW / daysCount;
        const barW = Math.max(4, barTotalW - barGap);
        const zeroY = padTop + plotH - ((0 - yMin) / yRange) * plotH;
        const monthNames = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];

        const yTicks = [];
        const step =
          yRange <= 0 ? 100000 : Math.ceil(yRange / 7 / 10000) * 10000 || 10000;
        for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
          yTicks.push(v);
        }
        if (yTicks.length === 0) yTicks.push(0);

        widgetDailyRev = document.createElement("div");
        widgetDailyRev.className =
          "time-dashboard-widget time-dashboard-widget-daily-revenue";
        const barsSvg = dailyData
          .map((item, i) => {
            if (item.price === 0) return "";
            const x = padLeft + i * barTotalW + (barTotalW - barW) / 2;
            const barH =
              yRange > 0
                ? Math.max(1, (Math.abs(item.price) / yRange) * plotH)
                : 0;
            const isNeg = item.price < 0;
            const y = isNeg ? zeroY : zeroY - barH;
            const fill = isNeg
              ? "#8b7355"
              : [
                  "#4a5568",
                  "#718096",
                  "#a0aec0",
                  "#2b6cb0",
                  "#3182ce",
                  "#63b3ed",
                ][i % 6];
            const rx = 3;
            return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="${rx}" ry="${rx}" fill="${fill}" class="time-dash-vbar"/>`;
          })
          .filter(Boolean)
          .join("");
        const priceLabel = `<text x="${padLeft - 5}" y="14" text-anchor="end" font-size="6" fill="#9ca3af">Price</text>`;
        const yLabels = yTicks
          .map((v) => {
            const y = padTop + plotH - ((v - yMin) / yRange) * plotH;
            return `<text x="${padLeft - 5}" y="${y + 4}" text-anchor="end" font-size="6" fill="#6b7280">${formatPriceK(v)}</text>`;
          })
          .join("");
        const xLabels = dailyData
          .map((item, idx) => {
            const x = padLeft + (idx + 0.5) * barTotalW;
            const y = chartH - 6;
            return `<text x="${x}" y="${y}" text-anchor="middle" font-size="6" fill="#6b7280" transform="rotate(-45, ${x}, ${y})">${String(item.day).padStart(2, "0")} ${monthNames[item.month]}</text>`;
          })
          .join("");
        const hGridLines = yTicks
          .map((v) => {
            const y = padTop + plotH - ((v - yMin) / yRange) * plotH;
            return `<line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="#e8eaed" stroke-width="0.5"/>`;
          })
          .join("");
        const vGridLines = Array.from({ length: daysCount + 1 }, (_, i) => {
          const x = padLeft + i * barTotalW;
          return `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + plotH}" stroke="#e8eaed" stroke-width="0.5"/>`;
        }).join("");
        const gridLines = vGridLines + hGridLines;

        const valueLabels = dailyData
          .map((item, i) => {
            if (item.price === 0) return "";
            const x = padLeft + (i + 0.5) * barTotalW;
            const isNeg = item.price < 0;
            const barH =
              yRange > 0 ? (Math.abs(item.price) / yRange) * plotH : 0;
            const barTop = isNeg ? zeroY : zeroY - barH;
            const barBottom = isNeg ? zeroY + barH : zeroY;
            const labelGap = 8;
            const y = isNeg ? barBottom + labelGap + 6 : barTop - labelGap;
            return `<text x="${x}" y="${y}" text-anchor="middle" font-size="7" fill="#374151" font-weight="500">${formatPrice(item.price)}</text>`;
          })
          .filter(Boolean)
          .join("");

        widgetDailyRev.innerHTML = `
        <div class="time-dashboard-widget-title">${periodLabel} 일별 수익</div>
        <div class="time-dash-daily-chart-wrap">
          <svg class="time-dash-daily-chart" viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="xMidYMid meet" style="overflow:visible">
            ${priceLabel}
            ${gridLines}
            ${barsSvg}
            ${yLabels}
            ${xLabels}
            ${valueLabels}
          </svg>
        </div>
      `;
      }
    }

    // 3. 생산성 (도넛)
    const { productive, nonproductive } =
      aggregateHoursByProductivity(filtered);
    const totalProd = productive + nonproductive || 1;
    const prodPct = totalProd > 0 ? (productive / totalProd) * 100 : 0;
    const nonProdPct = totalProd > 0 ? (nonproductive / totalProd) * 100 : 0;
    const circ = 2 * Math.PI * 40;
    const offset = circ / 4;
    const prodLen = (prodPct / 100) * circ;
    const nonProdLen = (nonProdPct / 100) * circ;

    const widgetProductivity = document.createElement("div");
    widgetProductivity.className =
      "time-dashboard-widget time-dashboard-widget-productivity";
    widgetProductivity.innerHTML = `
      <div class="time-dashboard-widget-title">${periodLabel} 생산성</div>
      <div class="time-dash-donut-wrap">
        <svg class="time-dash-donut" viewBox="0 0 100 100">
          <circle class="time-dash-donut-bg" cx="50" cy="50" r="40"/>
          <circle class="time-dash-donut-seg prod-pink" cx="50" cy="50" r="40" stroke-dasharray="${prodLen} ${circ - prodLen}" stroke-dashoffset="${-offset}"/>
          <circle class="time-dash-donut-seg prod-blue" cx="50" cy="50" r="40" stroke-dasharray="${nonProdLen} ${circ - nonProdLen}" stroke-dashoffset="${-offset - prodLen}"/>
        </svg>
        <div class="time-dash-donut-center">
          <span class="time-dash-donut-total">${formatHoursDisplay(totalProd === 1 && productive === 0 && nonproductive === 0 ? 0 : totalProd)}</span>
          <span class="time-dash-donut-label">Total</span>
        </div>
      </div>
      <div class="time-dash-legend">
        <span class="time-dash-legend-item"><i class="prod-pink"></i>생산적 ${prodPct.toFixed(1)}%</span>
        <span class="time-dash-legend-item"><i class="prod-blue"></i>비생산적 ${nonProdPct.toFixed(1)}%</span>
      </div>
    `;
    dash.appendChild(widgetProductivity);

    // 5. 전일 비생산적 시간 사용 현황 (도넛 - 활동명/태스크별)
    const nonProdRows = filtered.filter((r) => {
      const p = r.productivity || getProductivityFromCategory(r.category);
      return p === "nonproductive";
    });
    const nonProdByTask = aggregateHoursByTask(nonProdRows);
    const nonProdEntries = Object.entries(nonProdByTask)
      .filter(([, v]) => v > 0)
      .map(([task, hrs], i) => ({
        label: task,
        hrs,
        stroke: TASK_BAR_COLORS[i % TASK_BAR_COLORS.length],
      }))
      .sort((a, b) => b.hrs - a.hrs);
    const nonProdTotal = nonProdEntries.reduce((s, x) => s + x.hrs, 0);
    const nonProdCirc = 2 * Math.PI * 40;
    const nonProdOffset = nonProdCirc / 4;
    let nonProdCum = 0;
    const nonProdSegs = nonProdEntries.map((x) => {
      const len = nonProdTotal > 0 ? (x.hrs / nonProdTotal) * nonProdCirc : 0;
      const seg = { ...x, len, dashOffset: -nonProdOffset - nonProdCum };
      nonProdCum += len;
      return seg;
    });

    const widgetNonProd = document.createElement("div");
    widgetNonProd.className =
      "time-dashboard-widget time-dashboard-widget-time-bar time-dashboard-widget-donut";
    widgetNonProd.innerHTML = nonProdEntries.length
      ? `
      <div class="time-dashboard-widget-title">${periodLabel} 비생산적 시간 사용 현황</div>
      <div class="time-dash-donut-wrap">
        <svg class="time-dash-donut" viewBox="0 0 100 100">
          <circle class="time-dash-donut-bg" cx="50" cy="50" r="40"/>
          ${nonProdSegs.map((s) => `<circle class="time-dash-donut-seg" cx="50" cy="50" r="40" stroke="${s.stroke}" stroke-dasharray="${s.len} ${nonProdCirc - s.len}" stroke-dashoffset="${s.dashOffset}"/>`).join("")}
        </svg>
        <div class="time-dash-donut-center">
          <span class="time-dash-donut-total">${formatHoursDisplay(nonProdTotal)}</span>
          <span class="time-dash-donut-label">Total</span>
        </div>
      </div>
      <div class="time-dash-legend">
        ${nonProdEntries
          .map((x) => {
            const pct =
              nonProdTotal > 0 ? ((x.hrs / nonProdTotal) * 100).toFixed(1) : 0;
            return `<span class="time-dash-legend-item"><i style="background:${x.stroke}"></i>${x.label} ${formatHoursDisplay(x.hrs)} (${pct}%)</span>`;
          })
          .join("")}
      </div>
    `
      : `
      <div class="time-dashboard-widget-title">${periodLabel} 비생산적 시간 사용 현황</div>
      <div class="time-dash-empty">기록이 없습니다</div>
    `;

    // 6. 전일 생산적 시간 사용 현황 (도넛 - 활동명/태스크별)
    const prodRows = filtered.filter((r) => {
      const p = r.productivity || getProductivityFromCategory(r.category);
      return p === "productive";
    });
    const prodByTask = aggregateHoursByTask(prodRows);
    const prodEntries = Object.entries(prodByTask)
      .filter(([, v]) => v > 0)
      .map(([task, hrs], i) => ({
        label: task,
        hrs,
        stroke: TASK_BAR_COLORS[i % TASK_BAR_COLORS.length],
      }))
      .sort((a, b) => b.hrs - a.hrs);
    const prodTotal = prodEntries.reduce((s, x) => s + x.hrs, 0);
    const prodCirc = 2 * Math.PI * 40;
    const prodOffset = prodCirc / 4;
    let prodCum = 0;
    const prodSegs = prodEntries.map((x) => {
      const len = prodTotal > 0 ? (x.hrs / prodTotal) * prodCirc : 0;
      const seg = { ...x, len, dashOffset: -prodOffset - prodCum };
      prodCum += len;
      return seg;
    });

    const widgetProd = document.createElement("div");
    widgetProd.className =
      "time-dashboard-widget time-dashboard-widget-time-bar time-dashboard-widget-donut";
    widgetProd.innerHTML = prodEntries.length
      ? `
      <div class="time-dashboard-widget-title">${periodLabel} 생산적 시간 사용 현황</div>
      <div class="time-dash-donut-wrap">
        <svg class="time-dash-donut" viewBox="0 0 100 100">
          <circle class="time-dash-donut-bg" cx="50" cy="50" r="40"/>
          ${prodSegs.map((s) => `<circle class="time-dash-donut-seg" cx="50" cy="50" r="40" stroke="${s.stroke}" stroke-dasharray="${s.len} ${prodCirc - s.len}" stroke-dashoffset="${s.dashOffset}"/>`).join("")}
        </svg>
        <div class="time-dash-donut-center">
          <span class="time-dash-donut-total">${formatHoursDisplay(prodTotal)}</span>
          <span class="time-dash-donut-label">Total</span>
        </div>
      </div>
      <div class="time-dash-legend">
        ${prodEntries
          .map((x) => {
            const pct =
              prodTotal > 0 ? ((x.hrs / prodTotal) * 100).toFixed(1) : 0;
            return `<span class="time-dash-legend-item"><i style="background:${x.stroke}"></i>${x.label} ${formatHoursDisplay(x.hrs)} (${pct}%)</span>`;
          })
          .join("")}
      </div>
    `
      : `
      <div class="time-dashboard-widget-title">${periodLabel} 생산적 시간 사용 현황</div>
      <div class="time-dash-empty">기록이 없습니다</div>
    `;

    dash.appendChild(widgetProd);
    dash.appendChild(widgetNonProd);

    // 7. 과제별 시간 사용 현황 (가로 막대 차트)
    const byTask = aggregateHoursByTask(filtered);
    const taskEntries = Object.entries(byTask)
      .map(([task, hrs], i) => ({
        task,
        hrs,
        color: TASK_BAR_COLORS[i % TASK_BAR_COLORS.length],
      }))
      .sort((a, b) => b.hrs - a.hrs);
    const maxTaskHrs = Math.max(...taskEntries.map((x) => x.hrs), 0.01);
    const totalTaskHrs = taskEntries.reduce((s, x) => s + x.hrs, 0);

    const widgetTaskBar = document.createElement("div");
    widgetTaskBar.className =
      "time-dashboard-widget time-dashboard-widget-task-bar";
    const taskBarHtml = taskEntries
      .map(
        (x) => `
      <div class="time-dash-bar-row">
        <span class="time-dash-bar-label">${x.task}</span>
        <div class="time-dash-bar-track">
          <div class="time-dash-bar-fill time-dash-task-fill" style="width:${(x.hrs / maxTaskHrs) * 100}%; background:${x.color}"></div>
        </div>
        <span class="time-dash-bar-value">${formatHoursDisplay(x.hrs)}</span>
      </div>
    `,
      )
      .join("");
    widgetTaskBar.innerHTML = `
      <div class="time-dashboard-widget-title">${periodLabel} 과제별 시간 사용 현황</div>
      <div class="time-dash-bar-total">총 ${formatHoursDisplay(totalTaskHrs)}</div>
      <div class="time-dash-bar-subtitle">Time Tracked</div>
      <div class="time-dash-bar-list time-dash-task-bar-list">${taskEntries.length ? taskBarHtml : '<div class="time-dash-empty">기록이 없습니다</div>'}</div>
    `;
    dash.appendChild(widgetTaskBar);

    // 방해 빈도 곡선 (0~24시, 부드러운 곡선, Y축 눈금)
    const focusByHour = aggregateFocusByHour(filtered);
    const focusData = [];
    for (let h = 0; h <= 23; h++)
      focusData.push({ hour: h, value: focusByHour[h] || 0 });
    const totalFocus = focusData.reduce((s, x) => s + x.value, 0);
    const maxFocus = Math.max(...focusData.map((x) => x.value), 1);
    const chartH = 220;
    const chartW = 900;
    const padLeft = 48;
    const padRight = 16;
    const padTop = 32;
    const padBottom = 56;
    const plotH = chartH - padTop - padBottom;
    const plotW = chartW - padLeft - padRight;
    const hours = focusData.map((x) => x.hour);
    const values = focusData.map((x) => x.value);
    const linePoints = values.map((v, i) => {
      const x = padLeft + (i / Math.max(1, hours.length - 1)) * plotW;
      const y = padTop + plotH - (v / maxFocus) * plotH;
      return { x, y };
    });
    /** Catmull-Rom 스플라인 → 부드러운 베지어 곡선 path 생성 */
    function pointsToSmoothCurve(pts, tension = 1) {
      if (pts.length < 2) return "";
      const t = tension;
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        const cp1x = p1.x + ((p2.x - p0.x) / 6) * t;
        const cp1y = p1.y + ((p2.y - p0.y) / 6) * t;
        const cp2x = p2.x - ((p3.x - p1.x) / 6) * t;
        const cp2y = p2.y - ((p3.y - p1.y) / 6) * t;
        d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
      }
      return d;
    }
    const linePathD =
      linePoints.length >= 2
        ? pointsToSmoothCurve(linePoints)
        : linePoints.length === 1
          ? `M ${linePoints[0].x} ${linePoints[0].y}`
          : "";
    const widgetFocusCurve = document.createElement("div");
    widgetFocusCurve.className =
      "time-dashboard-widget time-dashboard-widget-focus-curve";
    const gridIndices = hours
      .map((_, i) => i)
      .filter((i) => i % 3 === 0 || i === hours.length - 1);
    const gridLines = gridIndices
      .map((i) => {
        const x = padLeft + (i / Math.max(1, hours.length - 1)) * plotW;
        return `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + plotH}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="2,2"/>`;
      })
      .join("");
    const hGridLines = [0.25, 0.5, 0.75, 1]
      .map((rat) => {
        const y = padTop + plotH - rat * plotH;
        return `<line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="2,2"/>`;
      })
      .join("");
    const yTickCount = 5;
    const yTicks = [];
    for (let i = 0; i <= yTickCount; i++) {
      const rat = i / yTickCount;
      const val = Math.round(rat * maxFocus);
      if (i > 0 && val === yTicks[yTicks.length - 1]?.val) continue;
      yTicks.push({ val, y: padTop + plotH - rat * plotH });
    }
    const yLabels = yTicks
      .map(
        (t) =>
          `<text x="${padLeft - 8}" y="${t.y + 4}" text-anchor="end" font-size="10" fill="#6b7280">${t.val}</text>`,
      )
      .join("");
    const xNumY = chartH - 24;
    const xTitleY = chartH - 4;
    const xLabels = gridIndices
      .map((i) => {
        const x = padLeft + (i / Math.max(1, hours.length - 1)) * plotW;
        return `<text x="${x}" y="${xNumY}" text-anchor="middle" font-size="10" fill="#6b7280">${hours[i]}</text>`;
      })
      .join("");
    widgetFocusCurve.innerHTML =
      totalFocus > 0
        ? `
      <div class="time-dashboard-widget-title">방해 빈도 곡선</div>
      <div class="time-dash-focus-curve-desc">${periodLabel} · 시각별 방해횟수</div>
      <div class="time-dash-focus-curve-svg-wrap">
        <svg class="time-dash-focus-curve-svg" viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="xMidYMid meet">
          <text x="${padLeft - 4}" y="14" text-anchor="end" font-size="9" fill="#9ca3af">방해 빈도</text>
          ${yLabels}
          ${gridLines}
          ${hGridLines}
          <path d="${linePathD}" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          ${xLabels}
          <text x="${padLeft + plotW / 2}" y="${xTitleY}" text-anchor="middle" font-size="9" fill="#9ca3af">시각</text>
        </svg>
      </div>
    `
        : `
      <div class="time-dashboard-widget-title">방해 빈도 곡선</div>
      <div class="time-dash-focus-curve-desc">${periodLabel} · 시각별 방해횟수</div>
      <div class="time-dash-empty">방해 기록이 없습니다</div>
    `;
    dash.appendChild(widgetFocusCurve);

    // 성취능력 곡선 (방해 빈도와 동일한 방식, Y축 -50~+50%)
    const energyByHour = aggregateEnergyByHour(filtered);
    const energyData = [];
    for (let h = 0; h <= 23; h++) {
      const v = energyByHour[h];
      energyData.push({ hour: h, value: v != null ? v : 0 });
    }
    const hasEnergyData = filtered.some(
      (r) => parseEnergyToNumber(r.energy) != null,
    );
    const energyLinePoints = energyData.map((v, i) => {
      const x = padLeft + (i / Math.max(1, energyData.length - 1)) * plotW;
      const yVal = Math.max(-50, Math.min(50, v.value));
      const y = padTop + plotH - ((yVal + 50) / 100) * plotH;
      return { x, y };
    });
    const energyPathD =
      energyLinePoints.length >= 2
        ? pointsToSmoothCurve(energyLinePoints)
        : energyLinePoints.length === 1
          ? `M ${energyLinePoints[0].x} ${energyLinePoints[0].y}`
          : "";
    const energyYTicks = [-50, -25, 0, 25, 50].map((val) => ({
      val: val > 0 ? `+${val}` : String(val),
      y: padTop + plotH - ((val + 50) / 100) * plotH,
    }));
    const energyYLabels = energyYTicks
      .map(
        (t) =>
          `<text x="${padLeft - 8}" y="${t.y + 4}" text-anchor="end" font-size="10" fill="#6b7280">${t.val}%</text>`,
      )
      .join("");
    const energyHGridLines = energyYTicks
      .map((t) => {
        const y = t.y;
        return `<line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="2,2"/>`;
      })
      .join("");
    const widgetEnergyCurve = document.createElement("div");
    widgetEnergyCurve.className =
      "time-dashboard-widget time-dashboard-widget-focus-curve time-dashboard-widget-energy-curve";
    widgetEnergyCurve.innerHTML = hasEnergyData
      ? `
      <div class="time-dashboard-widget-title">성취능력 곡선</div>
      <div class="time-dash-focus-curve-desc">${periodLabel} · 시각별 성취능력 평균</div>
      <div class="time-dash-focus-curve-svg-wrap">
        <svg class="time-dash-focus-curve-svg" viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="xMidYMid meet">
          <text x="${padLeft - 4}" y="14" text-anchor="end" font-size="9" fill="#9ca3af">성취능력</text>
          ${energyYLabels}
          ${gridLines}
          ${energyHGridLines}
          <line x1="${padLeft}" y1="${padTop + plotH / 2}" x2="${padLeft + plotW}" y2="${padTop + plotH / 2}" stroke="#d1d5db" stroke-width="0.5" stroke-dasharray="4,2"/>
          <path d="${energyPathD}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          ${xLabels}
          <text x="${padLeft + plotW / 2}" y="${xTitleY}" text-anchor="middle" font-size="9" fill="#9ca3af">시각</text>
        </svg>
      </div>
    `
      : `
      <div class="time-dashboard-widget-title">성취능력 곡선</div>
      <div class="time-dash-focus-curve-desc">${periodLabel} · 시각별 성취능력 평균</div>
      <div class="time-dash-empty">성취능력 기록이 없습니다</div>
    `;
    dash.appendChild(widgetEnergyCurve);

    if (widgetDailyRev) dash.appendChild(widgetDailyRev);

    contentWrap.appendChild(dash);
  }

  function renderDailyTimeBudget(container, rows, viewEl, dateStr) {
    container.innerHTML = "";
    const targetDateStr = dateStr || toDateStr(new Date());
    const todayRows = rows.filter(
      (r) => (r.date || "").trim() === targetDateStr,
    );
    const wrap = document.createElement("div");
    wrap.className = "time-daily-budget";
    wrap.innerHTML = `
      <div class="time-daily-budget-header time-dashboard-view">
        <div class="time-dashboard-row-top time-daily-budget-row-top">
          <div class="time-dashboard-widget time-daily-budget-widget-remaining">
            <div class="time-dashboard-widget-title">남은시간</div>
            <div class="time-dashboard-widget-value time-daily-budget-remaining-scheduled">00:00</div>
          </div>
          <div class="time-dashboard-widget time-daily-budget-widget-productivity">
            <div class="time-dashboard-widget-title">투자/소비 시간 (예정 vs 실제)</div>
            <table class="time-daily-budget-compare-table">
              <thead>
                <tr>
                  <th></th>
                  <th>예정</th>
                  <th>실제</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="time-budget-compare-label">생산적(투자)</td>
                  <td class="time-budget-compare-planned time-daily-budget-prod-planned">—</td>
                  <td class="time-budget-compare-actual time-daily-budget-prod-actual">—</td>
                </tr>
                <tr>
                  <td class="time-budget-compare-label">비생산적(소비)</td>
                  <td class="time-budget-compare-planned time-daily-budget-nonprod-planned">—</td>
                  <td class="time-budget-compare-actual time-daily-budget-nonprod-actual">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    container.appendChild(wrap);

    const taskOptions = getTaskOptions();
    const tasksFromToday = getTasksFromTodayRows();
    const taskOptionsSet = new Set(taskOptions);
    const taskDropdownOptions = [
      { value: "", label: "—", color: "cat-empty" },
      ...taskOptions.map((name) => ({
        value: name,
        label: name,
        color: "cat-empty",
      })),
    ];
    tasksFromToday.forEach((t) => {
      if (!taskOptionsSet.has(t.task)) {
        taskDropdownOptions.push({
          value: t.task,
          label: t.task,
          color: "cat-empty",
        });
      }
    });

    /** 해당 날짜·과제명에 해당하는 전체 탭 실제 사용시간 합계 */
    function getActualTimeForTask(taskName) {
      if (!(taskName || "").trim()) return 0;
      const name = String(taskName).trim();
      return todayRows
        .filter((r) => (r.taskName || "").trim() === name)
        .reduce((sum, r) => sum + parseTimeToHours(r.timeTracked), 0);
    }

    /** 전체 탭 데이터에서 과제별 집계 (과제명, 총시간, 비생산적 여부) - 비생산적이면 소비, 그외 투자 */
    function getTasksFromTodayRows() {
      const byTask = {};
      todayRows.forEach((r) => {
        const task = (r.taskName || "").trim();
        if (!task) return;
        const p = r.productivity || getProductivityFromCategory(r.category);
        const hrs = parseTimeToHours(r.timeTracked);
        if (hrs <= 0) return;
        if (!byTask[task])
          byTask[task] = { task, hrs: 0, isNonproductive: false };
        byTask[task].hrs += hrs;
        if (p === "nonproductive") byTask[task].isNonproductive = true;
      });
      return Object.values(byTask);
    }

    function createBudgetTimeInput() {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "time-budget-time-input";
      input.placeholder = "hh:mm";
      input.maxLength = 5;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          input.blur();
          return;
        }
        if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
      });
      input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "");
      });
      input.addEventListener("blur", () => {
        const digits = input.value.replace(/\D/g, "");
        if (digits.length === 0 || digits.length <= 2) {
          input.value = "";
          return;
        }
        const pad = (s) => String(s || "").padStart(2, "0");
        const h = Math.min(23, parseInt(digits.slice(0, 2), 10) || 0);
        const m = Math.min(59, parseInt(digits.slice(2, 4), 10) || 0);
        input.value = `${pad(h)}:${pad(m)}`;
      });
      return input;
    }

    const storedGoals = getBudgetGoals(targetDateStr);
    const onHeaderUpdateRef = { current: null };

    function createBudgetTableRow(
      taskName,
      actualHours,
      initialGoalTime,
      isInvest,
    ) {
      const tr = document.createElement("tr");
      const taskTd = document.createElement("td");
      const actualTimeSpan = document.createElement("span");
      actualTimeSpan.className = "time-budget-actual-display";

      const goalInput = createBudgetTimeInput();
      if (initialGoalTime) goalInput.value = initialGoalTime;

      const evalDisplay = document.createElement("span");
      evalDisplay.className = "time-budget-eval-display";

      function updateEvalDisplay() {
        const name = taskDropdown.getValue();
        const goalHrs = parseTimeToHours(goalInput.value);
        const actualHrs = getActualTimeForTask(name);
        if (!name || goalHrs <= 0) {
          evalDisplay.textContent = "";
          evalDisplay.className = "time-budget-eval-display";
          return;
        }
        if (isInvest) {
          if (actualHrs >= goalHrs) {
            evalDisplay.textContent = "시간 투자 성공!";
            evalDisplay.className =
              "time-budget-eval-display time-budget-eval-success";
          } else {
            const diff = goalHrs - actualHrs;
            evalDisplay.textContent = `${formatHoursToReadable(diff)}을 더 투자하지 못한 이유가 뭘까요?`;
            evalDisplay.className =
              "time-budget-eval-display time-budget-eval-fail";
          }
        } else {
          if (actualHrs <= goalHrs) {
            evalDisplay.textContent = "시간 아끼기 성공";
            evalDisplay.className =
              "time-budget-eval-display time-budget-eval-success";
          } else {
            const diff = actualHrs - goalHrs;
            evalDisplay.textContent = `${formatHoursToReadable(diff)}만큼 시간을 낭비한 이유가 뭘까요?`;
            evalDisplay.className =
              "time-budget-eval-display time-budget-eval-fail";
          }
        }
      }

      function updateActualTimeDisplay() {
        const name = taskDropdown.getValue();
        const hrs = getActualTimeForTask(name);
        actualTimeSpan.textContent = hrs > 0 ? formatHoursToHHMM(hrs) : "";
        updateEvalDisplay();
      }
      function saveCurrentGoal() {
        const name = taskDropdown.getValue();
        if (name)
          saveBudgetGoal(targetDateStr, name, goalInput.value, isInvest);
      }

      goalInput.addEventListener("input", () => {
        saveCurrentGoal();
        updateEvalDisplay();
      });
      goalInput.addEventListener("blur", saveCurrentGoal);

      const taskDropdown = createTagDropdown(
        taskDropdownOptions,
        taskName || "",
        "cat",
        () => {
          updateActualTimeDisplay();
          saveCurrentGoal();
          onHeaderUpdateRef.current?.();
        },
      );
      taskTd.appendChild(taskDropdown.wrap);
      tr.appendChild(taskTd);

      const goalTimeTd = document.createElement("td");
      goalTimeTd.appendChild(goalInput);
      tr.appendChild(goalTimeTd);
      const actualTimeTd = document.createElement("td");
      actualTimeSpan.textContent =
        actualHours > 0 ? formatHoursToHHMM(actualHours) : "";
      actualTimeTd.appendChild(actualTimeSpan);
      tr.appendChild(actualTimeTd);
      const evalTd = document.createElement("td");
      evalTd.className = "time-budget-eval-cell";
      evalTd.appendChild(evalDisplay);
      tr.appendChild(evalTd);

      updateEvalDisplay();
      return tr;
    }

    /** todayRows + 저장된 목표(실제 기록 없는 과제) 병합 */
    const investTasks = [];
    const consumeTasks = [];
    const seenInvest = new Set();
    const seenConsume = new Set();
    tasksFromToday.forEach((t) => {
      if (t.isNonproductive) {
        consumeTasks.push(t);
        seenConsume.add(t.task);
      } else {
        investTasks.push(t);
        seenInvest.add(t.task);
      }
    });
    Object.entries(storedGoals).forEach(([task, data]) => {
      if (data.isInvest && !seenInvest.has(task)) {
        investTasks.push({ task, hrs: 0, isNonproductive: false });
        seenInvest.add(task);
      } else if (!data.isInvest && !seenConsume.has(task)) {
        consumeTasks.push({ task, hrs: 0, isNonproductive: true });
        seenConsume.add(task);
      }
    });

    const tablesWrap = document.createElement("div");
    tablesWrap.className = "time-daily-budget-tables-wrap";

    const investBlock = document.createElement("div");
    investBlock.className = "time-daily-budget-table-block";
    investBlock.innerHTML = `<div class="time-daily-budget-table-title">시간 투자 내역</div>`;
    const investTable = document.createElement("table");
    investTable.className = "time-daily-budget-table";
    investTable.innerHTML = `
      <thead>
        <tr>
          <th>과제명</th>
          <th class="time-budget-col-goal">목표 시간</th>
          <th>실제 보낸 시간</th>
          <th>시간평가</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const investAddRow = document.createElement("tr");
    investAddRow.className = "time-row-add";
    const investAddCell = document.createElement("td");
    investAddCell.colSpan = 4;
    investAddCell.className = "time-cell-add";
    const investAddBtn = document.createElement("button");
    investAddBtn.type = "button";
    investAddBtn.className = "time-btn-add";
    investAddBtn.innerHTML =
      '<img src="/toolbaricons/add-square.svg" alt="" class="time-add-icon" width="18" height="18"> 과제 기록';
    investAddCell.appendChild(investAddBtn);
    investAddRow.appendChild(investAddCell);

    const investTbody = investTable.querySelector("tbody");
    investTasks.forEach((t) => {
      const goal = storedGoals[t.task];
      const goalTime = goal?.goalTime || "";
      investTbody.appendChild(
        createBudgetTableRow(t.task, t.hrs, goalTime, true),
      );
    });
    investTbody.appendChild(investAddRow);
    investAddBtn.addEventListener("click", () => {
      const tr = createBudgetTableRow("", 0, "", true);
      investTbody.insertBefore(tr, investAddRow);
    });
    investBlock.appendChild(investTable);
    tablesWrap.appendChild(investBlock);

    const consumeAddRow = document.createElement("tr");
    consumeAddRow.className = "time-row-add";
    const consumeAddCell = document.createElement("td");
    consumeAddCell.colSpan = 4;
    consumeAddCell.className = "time-cell-add";
    const consumeAddBtn = document.createElement("button");
    consumeAddBtn.type = "button";
    consumeAddBtn.className = "time-btn-add";
    consumeAddBtn.innerHTML =
      '<img src="/toolbaricons/add-square.svg" alt="" class="time-add-icon" width="18" height="18"> 과제 기록';
    consumeAddCell.appendChild(consumeAddBtn);
    consumeAddRow.appendChild(consumeAddCell);

    const consumeBlock = document.createElement("div");
    consumeBlock.className = "time-daily-budget-table-block";
    consumeBlock.innerHTML = `<div class="time-daily-budget-table-title">시간 소비 내역</div>`;
    const consumeTable = document.createElement("table");
    consumeTable.className = "time-daily-budget-table";
    consumeTable.innerHTML = `
      <thead>
        <tr>
          <th>과제명</th>
          <th class="time-budget-col-goal">목표 시간</th>
          <th>실제 보낸 시간</th>
          <th>시간평가</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const consumeTbody = consumeTable.querySelector("tbody");
    consumeTasks.forEach((t) => {
      const goal = storedGoals[t.task];
      const goalTime = goal?.goalTime || "";
      consumeTbody.appendChild(
        createBudgetTableRow(t.task, t.hrs, goalTime, false),
      );
    });
    consumeTbody.appendChild(consumeAddRow);
    consumeAddBtn.addEventListener("click", () => {
      const tr = createBudgetTableRow("", 0, "", false);
      consumeTbody.insertBefore(tr, consumeAddRow);
    });
    consumeBlock.appendChild(consumeTable);
    tablesWrap.appendChild(consumeBlock);

    const remainingScheduledEl = wrap.querySelector(
      ".time-daily-budget-remaining-scheduled",
    );
    const prodPlannedEl = wrap.querySelector(".time-daily-budget-prod-planned");
    const nonprodPlannedEl = wrap.querySelector(
      ".time-daily-budget-nonprod-planned",
    );

    /** 테이블 행에서 실제 보낸 시간 합계 (과제별 중복 제거 후 합산) */
    function sumActualFromTable(block) {
      const seen = new Set();
      let sum = 0;
      block.querySelectorAll("tbody tr:not(.time-row-add)").forEach((tr) => {
        const dropdownWrap = tr.querySelector(".time-tag-dropdown-wrap");
        if (!dropdownWrap?._getValue) return;
        const task = String(dropdownWrap._getValue() || "").trim();
        if (task && !seen.has(task)) {
          seen.add(task);
          sum += getActualTimeForTask(task);
        }
      });
      return sum;
    }

    function updateRemainingScheduled() {
      let investGoalSum = 0;
      let consumeGoalSum = 0;
      investBlock.querySelectorAll(".time-budget-time-input").forEach((inp) => {
        investGoalSum += parseTimeToHours(inp.value);
      });
      consumeBlock
        .querySelectorAll(".time-budget-time-input")
        .forEach((inp) => {
          consumeGoalSum += parseTimeToHours(inp.value);
        });
      const investActualSum = sumActualFromTable(investBlock);
      const consumeActualSum = sumActualFromTable(consumeBlock);

      const goalSum = investGoalSum + consumeGoalSum;
      const remaining = Math.max(0, 24 - goalSum);
      if (remainingScheduledEl)
        remainingScheduledEl.textContent = formatHoursToHHMM(remaining);
      if (prodPlannedEl)
        prodPlannedEl.textContent =
          investGoalSum > 0 ? formatHoursToHHMM(investGoalSum) : "—";
      if (nonprodPlannedEl)
        nonprodPlannedEl.textContent =
          consumeGoalSum > 0 ? formatHoursToHHMM(consumeGoalSum) : "—";
      const prodActualEl = wrap.querySelector(".time-daily-budget-prod-actual");
      const nonprodActualEl = wrap.querySelector(
        ".time-daily-budget-nonprod-actual",
      );
      if (prodActualEl)
        prodActualEl.textContent =
          investActualSum > 0 ? formatHoursToHHMM(investActualSum) : "—";
      if (nonprodActualEl)
        nonprodActualEl.textContent =
          consumeActualSum > 0 ? formatHoursToHHMM(consumeActualSum) : "—";
    }

    onHeaderUpdateRef.current = updateRemainingScheduled;
    updateRemainingScheduled();
    const onGoalTimeChange = (e) => {
      if (e.target.classList.contains("time-budget-time-input"))
        updateRemainingScheduled();
    };
    container.addEventListener("input", onGoalTimeChange);
    container.addEventListener("blur", onGoalTimeChange);

    container.appendChild(tablesWrap);
  }

  function updateFilterBarVisibility(view) {
    if (view === "blank") {
      filterTabs.style.display = "none";
      if (taskSetupBtn) taskSetupBtn.style.display = "none";
      dayWrap.style.display = "none";
      monthWrap.style.display = "none";
      rangeWrap.style.display = "none";
      budgetDateWrap.style.display = "none";
    } else if (view === "newtab") {
      filterTabs.style.display = "none";
      if (taskSetupBtn) taskSetupBtn.style.display = "none";
      dayWrap.style.display = "none";
      monthWrap.style.display = "none";
      rangeWrap.style.display = "none";
      budgetDateWrap.style.display = "";
    } else {
      filterTabs.style.display = "";
      if (taskSetupBtn)
        taskSetupBtn.style.display = view === "all" ? "" : "none";
      budgetDateWrap.style.display = "none";
      dayWrap.style.display = filterType === "day" ? "" : "none";
      monthWrap.style.display = filterType === "month" ? "" : "none";
      rangeWrap.style.display = filterType === "range" ? "" : "none";
    }
  }

  function getFilteredRows(rows) {
    const type = filterType;
    const y = filterYear;
    const m = filterMonth;
    const start = startDateInput.value || filterStartDate;
    const end = endDateInput.value || filterEndDate;
    return filterRowsByFilterType(rows, type, y, m, start, end);
  }

  function switchView(view) {
    const currentView = viewTabs.querySelector(".time-view-tab.active")?.dataset
      ?.view;
    if (currentView === "all" || currentView === "productivity") {
      mergeRowsIntoCache();
      cachedRows = getFullRowsForFilter(true);
    }
    const rowsToUse =
      view === "dashboard" || view === "newtab" || view === "blank"
        ? cachedRows
        : getFilteredRows(cachedRows);
    viewTabs.querySelectorAll(".time-view-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    updateFilterBarVisibility(view);
    if (view === "all") {
      renderAll(rowsToUse);
    } else if (view === "blank") {
      contentWrap.innerHTML = "";
    } else if (view === "productivity") {
      renderByProductivity(rowsToUse);
    } else if (view === "dashboard") {
      renderDashboard(cachedRows);
    } else if (view === "newtab") {
      renderDailyTimeBudget(
        contentWrap,
        rowsToUse,
        el,
        budgetDateInput.value || toDateStr(new Date()),
      );
    }
    totalFooter.style.display =
      view === "dashboard" || view === "newtab" || view === "blank"
        ? "none"
        : "";
    updateTotal();
  }

  budgetDateInput.addEventListener("change", () => {
    if (
      viewTabs.querySelector(".time-view-tab.active")?.dataset?.view ===
      "newtab"
    ) {
      renderDailyTimeBudget(
        contentWrap,
        cachedRows,
        el,
        budgetDateInput.value || toDateStr(new Date()),
      );
    }
  });

  viewTabs.querySelectorAll(".time-view-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  tableWrap.appendChild(table);
  const ledgerContainer = document.createElement("div");
  ledgerContainer.className = "time-ledger-container";
  ledgerContainer.appendChild(tableWrap);
  const addButtonWrap = document.createElement("div");
  addButtonWrap.className = "time-add-button-wrap";
  addButtonWrap.appendChild(addBtn);
  ledgerContainer.appendChild(addButtonWrap);
  contentWrap.appendChild(ledgerContainer);

  onFilterChange(true);

  return el;
}

/** 캘린더 1일뷰용: 시간 투자/소비 내역 테이블만 렌더 (일간시간예산에서 사용) */
export function renderTimeBudgetTablesForCalendar(
  container,
  dateStr,
  todoSectionEl,
  onScheduledUpdate,
) {
  const rows = loadTimeRows();
  const targetDateStr = dateStr || toDateStr(new Date());
  const todayRows = rows.filter((r) => (r.date || "").trim() === targetDateStr);

  function getTasksFromTodayRows() {
    const byTask = {};
    todayRows.forEach((r) => {
      const task = (r.taskName || "").trim();
      if (!task) return;
      const p = r.productivity || getProductivityFromCategory(r.category);
      const hrs = parseTimeToHours(r.timeTracked);
      if (hrs <= 0) return;
      if (!byTask[task])
        byTask[task] = { task, hrs: 0, isNonproductive: false };
      byTask[task].hrs += hrs;
      if (p === "nonproductive") byTask[task].isNonproductive = true;
    });
    return Object.values(byTask);
  }

  const taskOptions = getTaskOptions();
  const storedGoals = getBudgetGoals(targetDateStr);
  /* 캘린더 1일뷰: 과제설정 목록만 표시, 여기서 추가 불가 */
  const taskDropdownOptions = [
    { value: "", label: "—", color: "cat-empty" },
    ...taskOptions.map((name) => ({
      value: name,
      label: name,
      color: "cat-empty",
    })),
  ];

  /** 목표 시간 - 문자만 막고, 숫자+백스페이스 자유, Enter로 입력완료 */
  function createBudgetTimeInput() {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "time-budget-time-input";
    input.placeholder = "hh:mm";
    input.maxLength = 5;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        input.blur();
        return;
      }
      if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
    });
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "");
    });
    input.addEventListener("blur", () => {
      const digits = input.value.replace(/\D/g, "");
      if (digits.length === 0 || digits.length <= 2) {
        input.value = "";
        return;
      }
      const pad = (s) => String(s || "").padStart(2, "0");
      const h = Math.min(23, parseInt(digits.slice(0, 2), 10) || 0);
      const m = Math.min(59, parseInt(digits.slice(2, 4), 10) || 0);
      input.value = `${pad(h)}:${pad(m)}`;
    });
    return input;
  }

  /** 예상 시작/마감 시간 - 문자만 막고, 숫자+백스페이스 자유, Enter로 입력완료 */
  function createBudgetTimeRangeInput(placeholder) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "time-budget-scheduled-input";
    input.placeholder = placeholder || "hh:mm";
    input.maxLength = 5;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        input.blur();
        return;
      }
      if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
    });
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "");
    });
    input.addEventListener("blur", () => {
      const digits = input.value.replace(/\D/g, "");
      if (digits.length === 0 || digits.length <= 2) {
        input.value = "";
        return;
      }
      const pad = (s) => String(s || "").padStart(2, "0");
      const h = Math.min(23, parseInt(digits.slice(0, 2), 10) || 0);
      const m = Math.min(59, parseInt(digits.slice(2, 4), 10) || 0);
      input.value = `${pad(h)}:${pad(m)}`;
    });
    return input;
  }

  function parseScheduledTime(scheduledTime) {
    if (!scheduledTime || !scheduledTime.trim()) return { start: "", end: "" };
    const s = String(scheduledTime).trim();
    const m = s.match(/^(\d{1,2}:\d{0,2})-(\d{1,2}:\d{0,2})$/);
    if (m) return { start: m[1], end: m[2] };
    const single = s.match(/^(\d{1,2}:\d{0,2})$/);
    if (single) return { start: single[1], end: "" };
    return { start: "", end: "" };
  }

  /** scheduled "start-end" 배열을 합산 시간(시간 단위)으로 변환 */
  function sumScheduledHours(times) {
    if (!Array.isArray(times) || times.length === 0) return 0;
    let total = 0;
    times.forEach((s) => {
      const { start, end } = parseScheduledTime(s);
      if (!start || !end) return;
      let startH = parseTimeToHours(start);
      let endH = parseTimeToHours(end);
      if (endH <= startH) endH += 24;
      total += endH - startH;
    });
    return total;
  }

  /** 목표 대비 배치 차이 포맷: (-1h) / (+1h25m) / (-30m) / "" */
  function formatGoalDiff(diffHours) {
    if (diffHours === 0 || !isFinite(diffHours) || Math.abs(diffHours) < 1 / 60) return "";
    const sign = diffHours > 0 ? "+" : "";
    const absH = Math.abs(diffHours);
    const h = Math.floor(absH);
    const m = Math.round((absH - h) * 60);
    if (h === 0 && m === 0) return "";
    if (h === 0) return `(${sign}${m}m)`;
    if (m === 0) return `(${sign}${h}h)`;
    return `(${sign}${h}h${m}m)`;
  }

  function updateGoalDiffDisplays(block) {
    if (!block) return;
    const tbody = block.querySelector("tbody");
    const addRow = block.querySelector(".time-row-add");
    if (!tbody || !addRow) return;
    const byTask = collectScheduledTimesByTask(tbody, addRow);
    const counted = new Set();
    tbody.querySelectorAll("tr:not(.time-row-add)").forEach((row) => {
      const taskName = (row.dataset.taskName || "").trim();
      if (!taskName || counted.has(taskName)) return;
      counted.add(taskName);
      const goalInp = row.querySelector(".time-budget-time-input");
      const diffSpan = row.querySelector(".time-budget-goal-diff");
      if (!goalInp || !diffSpan) return;
      if (goalInp.disabled) return;
      const goalHrs = parseTimeToHours(goalInp.value);
      const scheduledHrs = sumScheduledHours(byTask[taskName] || []);
      const diff = scheduledHrs - goalHrs;
      const text = formatGoalDiff(diff);
      diffSpan.textContent = text;
      diffSpan.className = "time-budget-goal-diff";
      if (diff > 0) diffSpan.classList.add("time-budget-goal-diff--over");
      else if (diff < 0) diffSpan.classList.add("time-budget-goal-diff--short");
      else diffSpan.classList.remove("time-budget-goal-diff--over", "time-budget-goal-diff--short");
    });
  }

  /** tbody에서 과제별 scheduledTimes 수집 (addRow 제외, tr.dataset 사용) */
  function collectScheduledTimesByTask(tbody, addRow) {
    const byTask = {};
    tbody.querySelectorAll("tr").forEach((row) => {
      if (row === addRow) return;
      const name = (row.dataset.taskName || "").trim();
      if (!name || isBudgetPlaceholder(name)) return;
      const start = (row.dataset.scheduledStart || "").trim();
      const end = (row.dataset.scheduledEnd || "").trim();
      const st = start && end ? `${start}-${end}` : start || end || "";
      if (st) {
        if (!byTask[name]) byTask[name] = [];
        byTask[name].push(st);
      }
    });
    return byTask;
  }

  /** 같은 과제명 중 첫 행만 목표시간 편집 가능, 2번째부터 비활성화+빈값 */
  function isFirstRowForTask(taskName, currentRow, tbodyEl) {
    if (!taskName || !tbodyEl) return true;
    const rows = tbodyEl.querySelectorAll("tr:not(.time-row-add)");
    for (const row of rows) {
      const n = (row.dataset.taskName || "").trim();
      if (n === taskName) {
        return row === currentRow;
      }
    }
    return true;
  }

  function applyGoalInputState(goalInp, taskName, currentRow, tbodyEl) {
    const disable = !isFirstRowForTask(taskName, currentRow, tbodyEl);
    goalInp.disabled = disable;
    goalInp.title = disable ? "이미 같은 과제의 목표 시간이 설정되어 있습니다." : "";
    goalInp.placeholder = disable ? "" : "hh:mm";
    if (disable) {
      goalInp.value = "";
    }
  }

  function refreshAllGoalInputStates(tbodyEl) {
    if (!tbodyEl) return;
    tbodyEl.querySelectorAll("tr:not(.time-row-add)").forEach((row) => {
      const inp = row.querySelector(".time-budget-time-input");
      const task = (row.dataset.taskName || "").trim();
      if (inp && task) applyGoalInputState(inp, task, row, tbodyEl);
    });
  }

  function createBudgetTableRow(
    taskName,
    initialGoalTime,
    initialScheduledTime,
    isInvest,
    tbodyAndAddRow,
  ) {
    const tr = document.createElement("tr");
    const { tbody, addRow } = tbodyAndAddRow || {};
    const taskTd = document.createElement("td");
    const goalInput = createBudgetTimeInput();
    if (initialGoalTime) goalInput.value = initialGoalTime;

    const { start: initialStart, end: initialEnd } =
      parseScheduledTime(initialScheduledTime);
    const startInput = createBudgetTimeRangeInput("hh:mm");
    const endInput = createBudgetTimeRangeInput("hh:mm");
    if (initialStart) startInput.value = initialStart;
    if (initialEnd) endInput.value = initialEnd;

    function updateRowDataset() {
      const name = (taskDropdown.getValue() || "").trim();
      const start = startInput.value.trim();
      const end = endInput.value.trim();
      tr.dataset.taskName = name;
      tr.dataset.scheduledStart = start;
      tr.dataset.scheduledEnd = end;
    }
    function saveAllScheduledTimesForTimetable() {
      if (!tbody || !addRow) return;
      const byTask = collectScheduledTimesByTask(tbody, addRow);
      Object.entries(byTask).forEach(([task, times]) => {
        saveBudgetScheduledTimes(targetDateStr, task, times, isInvest);
      });
    }

    let previousKey = (taskName || "").trim();
    let lastSavedScheduledTime =
      initialStart && initialEnd ? `${initialStart}-${initialEnd}` : (initialStart || initialEnd || "");
    function saveCurrentGoal(skipReRender, shouldDispatchForTimetable = false) {
      const name = (taskDropdown.getValue() || "").trim();
      if (name) {
        if (previousKey && previousKey !== name && isBudgetPlaceholder(previousKey)) {
          deleteBudgetGoalEntry(targetDateStr, previousKey);
        }
        previousKey = name;
        saveBudgetGoal(targetDateStr, name, goalInput.value, isInvest);
        updateRowDataset();
        const start = startInput.value.trim();
        const end = endInput.value.trim();
        const scheduledTime =
          start && end ? `${start}-${end}` : start || end || "";
        if (tbody && addRow) {
          saveAllScheduledTimesForTimetable();
        } else {
          saveBudgetScheduledTimes(targetDateStr, name, scheduledTime ? [scheduledTime] : [], isInvest);
        }
        const scheduledChanged = scheduledTime !== lastSavedScheduledTime;
        lastSavedScheduledTime = scheduledTime;
        /* 예상 시간 변경 시 timetable 오버레이 직접 갱신 (콜백으로 확실히 전달) */
        if (shouldDispatchForTimetable && (scheduledChanged || (start && end))) {
          if (typeof onScheduledUpdate === "function") {
            onScheduledUpdate(targetDateStr);
          } else {
            document.dispatchEvent(
              new CustomEvent("calendar-budget-scheduled-updated", {
                detail: { dateStr: targetDateStr },
              }),
            );
          }
        }
        if (skipReRender && typeof updateRemaining === "function") {
          updateRemaining();
        }
        if (tbody && addRow) {
          const block = tr.closest(".time-daily-budget-table-block");
          if (block) updateGoalDiffDisplays(block);
        }
      }
    }

    goalInput.addEventListener("blur", () => saveCurrentGoal(true, false));
    startInput.addEventListener("blur", () => saveCurrentGoal(true, true));
    endInput.addEventListener("blur", () => saveCurrentGoal(true, true));
    const scheduleTimetableUpdate = () => {
      const name = (taskDropdown.getValue() || "").trim();
      if (!name) return;
      updateRowDataset();
      if (tbody && addRow) {
        saveAllScheduledTimesForTimetable();
        const block = tr.closest(".time-daily-budget-table-block");
        if (block) updateGoalDiffDisplays(block);
      } else {
        const start = startInput.value.trim();
        const end = endInput.value.trim();
        const scheduledTime = start && end ? `${start}-${end}` : start || end || "";
        if (scheduledTime) {
          saveBudgetScheduledTimes(targetDateStr, name, [scheduledTime], isInvest);
        }
      }
      if (typeof onScheduledUpdate === "function") onScheduledUpdate(targetDateStr);
    };
    startInput.addEventListener("input", scheduleTimetableUpdate);
    endInput.addEventListener("input", scheduleTimetableUpdate);

    const taskDropdown = createTagDropdown(
      taskDropdownOptions,
      taskName || "",
      "cat",
      () => {
        saveCurrentGoal(true);
        if (tbody) refreshAllGoalInputStates(tbody);
        const block = tr.closest(".time-daily-budget-table-block");
        if (block) updateGoalDiffDisplays(block);
      },
    );
    taskDropdown.wrap._getValue = taskDropdown.getValue;
    taskTd.appendChild(taskDropdown.wrap);
    tr.appendChild(taskTd);
    tr.dataset.taskName = (taskName || "").trim();
    tr.dataset.scheduledStart = initialStart || "";
    tr.dataset.scheduledEnd = initialEnd || "";

    applyGoalInputState(goalInput, (taskName || "").trim(), tr, tbody);

    const goalTimeTd = document.createElement("td");
    const goalWrap = document.createElement("span");
    goalWrap.className = "time-budget-goal-wrap";
    goalWrap.appendChild(goalInput);
    const diffSpan = document.createElement("span");
    diffSpan.className = "time-budget-goal-diff";
    goalWrap.appendChild(diffSpan);
    goalTimeTd.appendChild(goalWrap);
    tr.appendChild(goalTimeTd);
    const startTimeTd = document.createElement("td");
    startTimeTd.appendChild(startInput);
    tr.appendChild(startTimeTd);
    const endTimeTd = document.createElement("td");
    endTimeTd.appendChild(endInput);
    tr.appendChild(endTimeTd);

    const deleteTd = document.createElement("td");
    deleteTd.className = "time-budget-cell-delete";
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "time-budget-btn-delete";
    deleteBtn.title = "행 삭제";
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", () => {
      const name = (taskDropdown.getValue() || "").trim();
      tr.remove();
      if (name) {
        deleteBudgetGoalEntry(targetDateStr, name);
      }
      if (tbody && addRow) {
        const byTask = collectScheduledTimesByTask(tbody, addRow);
        Object.entries(byTask).forEach(([task, times]) => {
          saveBudgetScheduledTimes(targetDateStr, task, times, isInvest);
        });
        tbody.querySelectorAll("tr:not(.time-row-add)").forEach((row) => {
          const inp = row.querySelector(".time-budget-time-input");
          const task = (row.dataset.taskName || "").trim();
          if (inp && task) applyGoalInputState(inp, task, row, tbody);
        });
        const block = tbody.closest(".time-daily-budget-table-block");
        if (block) updateGoalDiffDisplays(block);
      }
      if (typeof onScheduledUpdate === "function") {
        onScheduledUpdate(targetDateStr);
      } else {
        document.dispatchEvent(
          new CustomEvent("calendar-budget-scheduled-updated", {
            detail: { dateStr: targetDateStr },
          }),
        );
      }
    });
    deleteTd.appendChild(deleteBtn);
    tr.appendChild(deleteTd);

    return tr;
  }

  const tasksFromToday = getTasksFromTodayRows();
  const excluded = getBudgetExcluded(targetDateStr);
  const investTasks = [];
  const consumeTasks = [];
  const seenInvest = new Set();
  const seenConsume = new Set();
  function expandByScheduledTimes(task, data, isInvest, hrs = 0) {
    const times = getScheduledTimesArray(data);
    const entries = times.length > 0 ? times : [""];
    return entries.map((scheduledTime) => ({
      task,
      hrs,
      isNonproductive: !isInvest,
      scheduledTime,
    }));
  }
  tasksFromToday.forEach((t) => {
    if (excluded.has(t.task)) return;
    if (isBudgetPlaceholder(t.task)) return;
    const data = storedGoals[t.task];
    const entries = expandByScheduledTimes(t.task, data, !t.isNonproductive, t.hrs);
    const target = t.isNonproductive ? consumeTasks : investTasks;
    const seen = t.isNonproductive ? seenConsume : seenInvest;
    entries.forEach((e) => {
      target.push(e);
      seen.add(t.task);
    });
  });
  Object.entries(storedGoals).forEach(([task, data]) => {
    if (excluded.has(task)) return;
    if (isBudgetPlaceholder(task)) return;
    if (data.isInvest && !seenInvest.has(task)) {
      expandByScheduledTimes(task, data, true).forEach((e) => investTasks.push(e));
      seenInvest.add(task);
    } else if (!data.isInvest && !seenConsume.has(task)) {
      expandByScheduledTimes(task, data, false).forEach((e) => consumeTasks.push(e));
      seenConsume.add(task);
    }
  });

  const remainingHeader = document.createElement("div");
  remainingHeader.className = "time-budget-calendar-remaining";
  remainingHeader.innerHTML = `
    <div class="time-budget-calendar-remaining-title">남은 시간</div>
    <div class="time-budget-calendar-remaining-value">24:00</div>
  `;

  const investBlock = document.createElement("div");
  investBlock.className =
    "time-daily-budget-table-block time-daily-budget-table-block--invest";
  const investTableWrap = document.createElement("div");
  investTableWrap.className = "time-daily-budget-table-scroll-wrap";
  const investTable = document.createElement("table");
  investTable.className = "time-daily-budget-table";
  investTable.innerHTML = `
    <colgroup>
      <col class="time-budget-col-task">
      <col class="time-budget-col-goal">
      <col class="time-budget-col-start">
      <col class="time-budget-col-end">
      <col class="time-budget-col-delete">
    </colgroup>
    <thead>
      <tr>
        <th>과제명</th>
        <th class="time-budget-col-goal">목표 시간</th>
        <th>예상 시작 시간</th>
        <th>예상 마감 시간</th>
        <th class="time-budget-col-delete"></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const investAddRow = document.createElement("tr");
  investAddRow.className = "time-row-add time-row-add--placeholder";
  investAddRow.innerHTML = "<td colspan=\"5\"></td>";

  const investTbody = investTable.querySelector("tbody");
  const investCtx = { tbody: investTbody, addRow: investAddRow };
  investTasks.forEach((t) => {
    const goal = storedGoals[t.task];
    const goalTime = goal?.goalTime || "";
    const scheduledTime = t.scheduledTime ?? goal?.scheduledTime ?? "";
    investTbody.appendChild(
      createBudgetTableRow(t.task, goalTime, scheduledTime, true, investCtx),
    );
  });
  investTbody.appendChild(investAddRow);
  investTableWrap.appendChild(investTable);
  investBlock.appendChild(investTableWrap);
  updateGoalDiffDisplays(investBlock);

  const consumeAddRow = document.createElement("tr");
  consumeAddRow.className = "time-row-add time-row-add--placeholder";
  consumeAddRow.innerHTML = "<td colspan=\"5\"></td>";

  const consumeBlock = document.createElement("div");
  consumeBlock.className =
    "time-daily-budget-table-block time-daily-budget-table-block--consume";
  const consumeTableWrap = document.createElement("div");
  consumeTableWrap.className = "time-daily-budget-table-scroll-wrap";
  const consumeTable = document.createElement("table");
  consumeTable.className = "time-daily-budget-table";
  consumeTable.innerHTML = `
    <colgroup>
      <col class="time-budget-col-task">
      <col class="time-budget-col-goal">
      <col class="time-budget-col-start">
      <col class="time-budget-col-end">
      <col class="time-budget-col-delete">
    </colgroup>
    <thead>
      <tr>
        <th>과제명</th>
        <th class="time-budget-col-goal">목표 시간</th>
        <th>예상 시작 시간</th>
        <th>예상 마감 시간</th>
        <th class="time-budget-col-delete"></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const consumeTbody = consumeTable.querySelector("tbody");
  const consumeCtx = { tbody: consumeTbody, addRow: consumeAddRow };
  consumeTasks.forEach((t) => {
    const goal = storedGoals[t.task];
    const goalTime = goal?.goalTime || "";
    const scheduledTime = t.scheduledTime ?? goal?.scheduledTime ?? "";
    consumeTbody.appendChild(
      createBudgetTableRow(t.task, goalTime, scheduledTime, false, consumeCtx),
    );
  });
  consumeTbody.appendChild(consumeAddRow);
  consumeTableWrap.appendChild(consumeTable);
  consumeBlock.appendChild(consumeTableWrap);
  updateGoalDiffDisplays(consumeBlock);

  const tabsBar = document.createElement("div");
  tabsBar.className = "time-daily-budget-tabs";
  tabsBar.innerHTML = `
    <div class="time-daily-budget-tabs-left">
      <button type="button" class="time-daily-budget-tab active" data-tab="invest">투자내역</button>
      <button type="button" class="time-daily-budget-tab" data-tab="consume">소비내역</button>
    </div>
    <button type="button" class="time-daily-budget-add-btn time-btn-add" title="과제 기록">
      <img src="/toolbaricons/add-square.svg" alt="" class="time-add-icon" width="18" height="18"> 과제 기록
    </button>
  `;
  const addBtnEl = tabsBar.querySelector(".time-daily-budget-add-btn");
  addBtnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    const activeTab = tabsBar.querySelector(".time-daily-budget-tab.active")?.dataset?.tab;
    const isInvest = activeTab !== "consume";
    /* 과제설정 목록에서만 선택, 여기서 새 과제 추가 불가 */
    if (activeTab === "consume") {
      const tr = createBudgetTableRow("", "", "", false, consumeCtx);
      consumeTbody.insertBefore(tr, consumeAddRow);
      updateGoalDiffDisplays(consumeBlock);
    } else {
      const tr = createBudgetTableRow("", "", "", true, investCtx);
      investTbody.insertBefore(tr, investAddRow);
      updateGoalDiffDisplays(investBlock);
    }
    updateRemaining();
  });
  const tabPanels = document.createElement("div");
  tabPanels.className = "time-daily-budget-tab-panels";
  investBlock.style.display = "";
  consumeBlock.style.display = "none";
  tabPanels.appendChild(investBlock);
  tabPanels.appendChild(consumeBlock);

  tabsBar.querySelectorAll(".time-daily-budget-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      tabsBar
        .querySelectorAll(".time-daily-budget-tab")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      investBlock.style.display = tab === "invest" ? "" : "none";
      consumeBlock.style.display = tab === "consume" ? "" : "none";
    });
  });

  const remainingValueEl = remainingHeader.querySelector(
    ".time-budget-calendar-remaining-value",
  );

  function updateRemaining() {
    let goalSum = 0;
    [investBlock, consumeBlock].forEach((block) => {
      block.querySelectorAll(".time-budget-time-input").forEach((inp) => {
        goalSum += parseTimeToHours(inp.value);
      });
    });
    const remaining = Math.max(0, 24 - goalSum);
    if (remainingValueEl)
      remainingValueEl.textContent = formatHoursToHHMM(remaining);
  }

  [investBlock, consumeBlock].forEach((block) => {
    block.addEventListener("input", (e) => {
      if (e.target.classList.contains("time-budget-time-input"))
        updateRemaining();
    });
    block.addEventListener("blur", (e) => {
      if (e.target.classList.contains("time-budget-time-input"))
        updateRemaining();
    });
  });
  updateRemaining();

  const topRow = document.createElement("div");
  topRow.className = "calendar-1day-budget-top-row";
  topRow.appendChild(remainingHeader);

  const stickyHeader = document.createElement("div");
  stickyHeader.className = "calendar-1day-budget-sticky-header";
  stickyHeader.appendChild(topRow);
  stickyHeader.appendChild(tabsBar);

  container.innerHTML = "";
  container.appendChild(stickyHeader);
  const budgetTablesScroll = document.createElement("div");
  budgetTablesScroll.className = "calendar-1day-budget-tables-scroll";
  budgetTablesScroll.appendChild(tabPanels);
  container.appendChild(budgetTablesScroll);
  if (todoSectionEl) {
    container.appendChild(todoSectionEl);
  }
}
