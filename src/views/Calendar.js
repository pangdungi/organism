/**
 * 캘린더 - 월별/1주/1일 뷰
 * (할 일 본문은 일정 탭의「할 일」서브뷰·TodoList.)
 */

import {
  render as renderTodoList,
  saveTodoListBeforeUnmount,
  DRAG_TYPE_TODO_TO_CALENDAR,
  openTodoTaskEditFromCalendarBarModel,
} from "./TodoList.js";
import { openCalendarTaskEditFromBarModel } from "../utils/calendarTaskEditModal.js";
import {
  renderCalendarMonthlyDayIcons,
  mountCalendarDayExpandIconBtn,
  CALENDAR_MONTHLY_DAY_ICONS_STRIP_REM,
  calendarDayHasIcon,
  calendarDayIconDragAllowsDrop,
  readCalendarDayIconDragPayload,
} from "../utils/calendarDayIconsEditor.js";
import {
  pullCalendarDayIconsFromSupabase,
  syncCalendarDayIconMove,
} from "../utils/calendarDayIconsSupabase.js";
import {
  moveCalendarDayIconOnDate,
  readCalendarDayIconsSnapshot,
} from "../utils/calendarDayIconsModel.js";
import {
  isPastCalendarTask,
} from "../utils/calendarTaskDisplayRules.js";
import {
  getSectionColor,
  getCustomSections,
  getTimeCategoryColorsForTimetableExpected,
} from "../utils/todoSettings.js";
import {
  getBudgetGoals,
  getTaskOptionByName,
  loadTimeRows,
  formatGoalDiff,
  parseTimeToHours,
  isTimeLedgerRowLiveRecording,
  formatIntegerMinutesDurationKo,
  resolveBudgetScheduleSlotIndex,
  updateBudgetScheduleBlockAtIndex,
  getRowStartInstantForMobileCard,
  getRowEndInstantForMobileCard,
  rowHasEndTimeForMobileCard,
  getMobileCardEffectiveHoursForPrice,
  ensureDetachedTimeLedgerTaskLogBridge,
} from "./Time.js";
import {
  ledgerRowDisplayTaskName,
  buildTimeLedgerCardMemoText,
  fillTimeLedgerCardMemoElement,
} from "../utils/timeLedgerCardKpiMemo.js";
import { applyCalendarNavMonthLabel, formatMonthNameEn } from "../utils/lpDateDisplay.js";
import { showToast } from "../utils/showToast.js";
import { showAlertModal } from "../utils/confirmModal.js";
import { initModalStandardDateFields } from "../utils/modalNativeDateField.js";
import {
  buildCalendarEventNameEmojiQuickMarkup,
  wireCalendarEventNameEmojiQuick,
} from "../utils/calendarEventNameEmojiQuick.js";
import {
  allowModalInputFocus,
  wireModalEnterToConfirm,
  closeDuplicateTodoAddModals,
} from "../utils/modalNoAutoFocus.js";
import {
  resolveLpModalStackZIndex,
  syncBodyOverflowAfterModalClose,
} from "../utils/lpModalStack.js";
import {
  calendar1WeekDiagLog,
  calendar1WeekDiagSnapshot,
} from "../utils/calendar1WeekDiag.js";
import {
  bindLpHorizontalPanNavigate,
  lpHorizontalPanNavigateRecentlyFired,
} from "../utils/lpHorizontalPanNavigate.js";
import {
  slotMinToHhMm,
  minutesOfDayToHhMm,
  createCalendar1DaySlotGridScroll,
  paintCalendar1DaySlotGridFromSpans,
  findCalendarSlotSpanAtMin,
  wireCalendar1DaySlotGridDrag,
} from "../utils/calendar1DaySlotGrid.js";
import { supabase } from "../supabase.js";
import {
  persistSectionTasksAndSchedule,
  persistCustomSectionTasksAndSchedule,
  pullCalendarSectionTasksFromSupabase,
  upsertCalendarSectionTaskDirectFromModal,
  upsertCalendarSectionTaskRowFromSessionMemory,
} from "../utils/todoSectionTasksSupabase.js";
import {
  calendarDiaryToggleMarkup,
  filterCalendarTasksForDisplay,
  wireCalendarDiaryToggle,
  applyCalendarDiaryVisibilityToRoot,
  softReflowCalendarAfterDiaryToggle,
  taskIsCalendarDiary,
} from "../utils/calendarDiaryVisibility.js";
import {
  readSectionTasksObject,
  readCustomSectionTasksObject,
  CALENDAR_FIXED_SECTION_IDS,
  TODO_UNIFIED_SECTION_KEY,
  isCalendarFixedSectionKey,
  newTaskId,
} from "../utils/todoSectionTasksModel.js";
import { stripTimeLedgerSyncMetaForCompare } from "../utils/timeLedgerEntriesModel.js";
import {
  pullTimeLedgerEntriesForDateRange,
  timeLedgerLocalTodayYmd,
  timeLedgerLocalYesterdayYmd,
} from "../utils/timeLedgerEntriesSupabase.js";
import { markTodoAddPendingServerLog } from "../utils/lpTabDataSourceLog.js";
import {
  flushAllPendingTimeDailyBudgetSync,
  pullTimeDailyBudgetForDateRange,
} from "../utils/timeDailyBudgetSupabase.js";
import { pullTaskListForCalendar1DayEnter } from "../utils/kpiTabCloudRefresh.js";
import {
  dismissOpenCalendarExpectedScheduleModals,
  openCalendarExpectedScheduleModal,
} from "../utils/calendarExpectedScheduleModal.js";
import { lpRefreshAllVisibleCalendarLayoutsFromLocalData } from "../utils/lpCalendarLocalRefresh.js";
import { takeDisplayIconImg } from "../utils/reuseDisplayIconImg.js";
import {
  calendarPullRangeForSubView,
  calendarPullRangeYmdForMonth,
  calendarPullRangeYmdForMonthGrid,
  calendarPullRangeYmdForWeekDates,
  calendarSectionTaskOverlapsYmdRange,
} from "../utils/calendarSectionTasksPullRange.js";
import {
  openApplyBudgetTemplateModal,
  openSaveBudgetTemplateModal,
} from "../utils/calendarBudgetTemplateModal.js";
import {
  expectedSpanCardMemoLines,
  expectedSpanDisplayTaskName,
} from "../utils/expectedScheduleDetail.js";
import { resolveTimeTaskDisplayIconSrc } from "../utils/timeTaskIconUrls.js";
import {
  todoQualifiesCalendarShortSpanBarAccent,
  CALENDAR_SHORT_SPAN_BAR_HEX,
} from "../utils/calendarShortSpanBar.js";
import { logLpRender } from "../utils/lpRenderDebugLog.js";
import {
  APP_FOOTER_ICON_BTN_CLASS,
  getAppFooterActionsSlot,
} from "../utils/appFooterShell.js";
function isStoredCalendarSectionId(sectionId) {
  const sid = String(sectionId || "").trim();
  return isCalendarFixedSectionKey(sid) || sid.startsWith("custom-");
}

/** 모바일 일정 탭: 푸터 서브뷰 전환 버튼(탭 이탈 시 clearAppFooterActions로 제거) */
const LP_SCHEDULE_CAL_SUBVIEW_FOOTER_ATTR = "data-lp-schedule-cal-subview";

const LP_SCHEDULE_SUBVIEW_FOOTER_ICONS = {
  monthly: "/toolbaricons/calendar-alt.png",
  "1week": "/toolbaricons/list.png",
  annual: "/toolbaricons/dashboard.png",
  "1day": "/toolbaricons/timer.png",
};

/** 할일/일정 패널은 할일만 표시 — 저장값으로 빈 화면·탭 초기화 방지 */
const CALENDAR_MAIN_VIEW_STORAGE_KEY = "lp-calendar-main-subview";
const VALID_CALENDAR_MAIN_VIEWS = new Set(["todo"]);

function persistCalendarMainViewIfValid(view) {
  if (!view || !VALID_CALENDAR_MAIN_VIEWS.has(view)) return;
  try {
    localStorage.setItem(CALENDAR_MAIN_VIEW_STORAGE_KEY, view);
  } catch (_) {}
}

/** 일간(예상 일정) 뷰 — 과제목록·KPI 과제 강제 pull */
async function pullCalendar1DayExpectedTaskListFromCloud() {
  await pullTaskListForCalendar1DayEnter();
}

/** 네비 조작 시 서브 레이아웃 안에서 동일 셀렉터로 요소를 찾기 위한 보조(구 lifted 클러스터 흔적 포함) */
function lpCalendarNavQ(localNav, calendarInnerWrap, selector) {
  try {
    const lifted =
      calendarInnerWrap && calendarInnerWrap._lpCalendarNavQueryRoot;
    if (lifted) {
      if (lifted.isConnected) {
        const hit = lifted.querySelector(selector);
        if (hit) return hit;
      } else {
        try {
          delete calendarInnerWrap._lpCalendarNavQueryRoot;
        } catch (_) {}
      }
    }
  } catch (_) {}
  if (localNav) {
    const fromLocal = localNav.querySelector(selector);
    if (fromLocal) return fromLocal;
  }
  try {
    const calView = calendarInnerWrap?.closest?.(".calendar-view");
    if (calView) {
      const cluster = calView.querySelector(".calendar-sub-tabs-nav-cluster");
      const hit = cluster?.querySelector(selector);
      if (hit) return hit;
    }
  } catch (_) {}
  return null;
}

function lpOpenNativeDateInput(inp) {
  if (!inp) return;
  allowModalInputFocus(inp);
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

/** `yyyy-mm-dd` 와 오늘(로컬 자정 기준) 사이의 일 수 차이 — `dayOffset` 과 동일 의미 */
function lpCalendarDayOffsetFromYmd(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, mo, d] = ymd.split("-").map(Number);
  const pick = new Date(y, mo - 1, d);
  if (
    pick.getFullYear() !== y ||
    pick.getMonth() !== mo - 1 ||
    pick.getDate() !== d
  ) {
    return null;
  }
  const now = new Date();
  const pickNorm = new Date(
    pick.getFullYear(),
    pick.getMonth(),
    pick.getDate(),
  );
  const todayNorm = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((pickNorm - todayNorm) / 86400000);
}

/** 할일 사이드바에서 날짜·마감 수정 시: 같은 화면 월/주 그리드도 로컬 데이터로 즉시 다시 그림(탭 재클릭·풀 없이) */
let _lpTodoDatesChangedListenerAttached = false;
function lpEnsureTodoDatesChangedListener() {
  if (_lpTodoDatesChangedListenerAttached) return;
  _lpTodoDatesChangedListenerAttached = true;
  document.addEventListener("lp-todo-dates-changed", (ev) => {
    const detail = ev.detail || {};
    if (detail.kind === "done-only" && detail.taskId) {
      lpPatchCalendarTaskDoneInLayouts(detail.taskId, !!detail.done);
      return;
    }
    const refreshOpts = {
      softLocal: true,
      ...(Array.isArray(detail.patchDateKeys) && detail.patchDateKeys.length > 0
        ? { patchDateKeys: detail.patchDateKeys }
        : {}),
    };
    const t = ev.target;
    if (!t || typeof t.closest !== "function") return;
    let layoutNode = t.closest(".calendar-monthly-layout");
    while (layoutNode) {
      if (typeof layoutNode._lpRefreshCalendarView === "function") {
        try {
          layoutNode._lpRefreshCalendarView(refreshOpts);
        } catch (_) {}
        break;
      }
      layoutNode =
        layoutNode.parentElement?.closest?.(".calendar-monthly-layout") ?? null;
    }
  });
}
lpEnsureTodoDatesChangedListener();

/** 목록·달력 통합 색 변경 시 그리드·사이드바 바 다시 칠함 */
let _lpAppColorsCalendarListenerAttached = false;
function lpEnsureAppColorsCalendarListener() {
  if (_lpAppColorsCalendarListenerAttached) return;
  _lpAppColorsCalendarListenerAttached = true;
  window.addEventListener("app-colors-changed", () => {
    document.querySelectorAll(".calendar-monthly-layout").forEach((layout) => {
      try {
        layout._lpRefreshCalendarView?.();
      } catch (_) {}
    });
  });
}
lpEnsureAppColorsCalendarListener();

const CALENDAR_DATE_DEBUG = false;
function dateDebug(_tag, ..._args) {
  void CALENDAR_DATE_DEBUG;
}

/** 타임블록·1주(구글) 시간격자 공통: 1시간 슬롯 하루 24칸 — 예상/실제/주간 블록·DOM 행과 동일 */
const CAL_1DAY_TIMETABLE_SLOTS_PER_DAY = 24;
const CAL_1DAY_TIMETABLE_MIN_PER_SLOT = 60;
/** 일간 타임라인 프로그레스: 예상 시작과 실제 기록 시작 허용 차(분) */
const CAL_1DAY_TIMELINE_PROGRESS_START_TOLERANCE_MIN = 30;
/** 타임블록: 칼럼 좌우 안쪽 여백·상하·반열(동시 일정) 사이 간격(px) */
const CAL_1DAY_TIMEBLOCK_INSET_X = 3;
const CAL_1DAY_TIMEBLOCK_INSET_Y = 2;
const CAL_1DAY_TIMEBLOCK_LANE_GAP_PX = 3;
/** 1일 타임표: 해당 시 행 높이만 조정 대상으로 보는 과제 길이(분) 상한 — 막대는 시간만 반영, 행(px) 역산 공식만 적용 */
const CAL_EXPECTED_ROW_BOOST_SHORT_MAX_MINUTES = 30;
const CAL_EXPECTED_ROW_BASE_PX = 44;
/** 짧은 과제 때문에 가변(px) 줄 때 부스트 안 된 시행 줄 높이(긴 과제 연속 시간대 등) — BASE 미만 값 */
const CAL_EXPECTED_ROW_IDLE_COMPACT_PX = 22;
/** 해당 시 행 안에서 짧은 덩어리 한 줄에 맞추려는 목표(px) — 값이 크면 같은 시 행 전체가 비대해짐 */
const CAL_EXPECTED_ROW_ONE_LINE_SLICE_PX = 22;
/** 한 시간 행 px 상한 — 22×60÷5=264 */
const CAL_EXPECTED_ROW_SHORT_SLOT_CEIL_PX = 264;
/** 월간·1주 막대 스택: 레이아웃의 CSS 변수와 동기 (모바일/데스크톱 동일 수치) */
/** 월간 주 행 — 날짜 아이콘 스트립 높이(rem). 아이콘은 셀 너비(정사각)만큼 표시 */
function lpCalendarMonthlyDayCellAtIndex(weekRow, dayIdx) {
  if (!(weekRow instanceof HTMLElement)) return null;
  const cells = weekRow.querySelectorAll(".calendar-monthly-day:not(.empty)");
  return cells[dayIdx] || null;
}

function lpCalendarMonthlyDayHasVisibleIcon(weekRow, dayIdx) {
  const cell = lpCalendarMonthlyDayCellAtIndex(weekRow, dayIdx);
  if (!cell) return false;
  const icons = cell.querySelector(".calendar-monthly-day-icons");
  return !!icons && !icons.hidden;
}

/** 스탬프 시각 상한(rem) — CSS `--cal-day-icon-max` 와 맞춤(축소 말고 과대만 막음) */
const CALENDAR_MONTHLY_DAY_ICON_MAX_REM = 6;

function lpCalendarMonthlyDayIconsStripRemForCell(cell) {
  if (!(cell instanceof HTMLElement)) return 0;
  const icons = cell.querySelector(".calendar-monthly-day-icons:not([hidden])");
  if (!icons) return 0;
  try {
    const rootFs = parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    if (Number.isFinite(rootFs) && rootFs > 0) {
      const hPx = icons.getBoundingClientRect().height;
      if (hPx > 4) {
        return Math.min(hPx / rootFs, CALENDAR_MONTHLY_DAY_ICON_MAX_REM);
      }
      /* 아직 높이 없으면 칸 너비 추정 — 상한까지만 */
      const wPx = cell.getBoundingClientRect().width;
      if (wPx > 0) {
        return Math.min(wPx / rootFs, CALENDAR_MONTHLY_DAY_ICON_MAX_REM);
      }
    }
  } catch (_) {}
  return CALENDAR_MONTHLY_DAY_ICONS_STRIP_REM;
}

function lpCalendarMonthlyDayIconsStripRemAtIndex(weekRow, dayIdx) {
  if (!lpCalendarMonthlyDayHasVisibleIcon(weekRow, dayIdx)) return 0;
  return lpCalendarMonthlyDayIconsStripRemForCell(
    lpCalendarMonthlyDayCellAtIndex(weekRow, dayIdx),
  );
}

/** 단일일 막대 — 해당 날짜 스탬프 아래부터 쌓음 */
function lpCalendarMonthlyDayStampStackOffsetRem(weekRow, dayIdx) {
  const stampRem = lpCalendarMonthlyDayIconsStripRemAtIndex(weekRow, dayIdx);
  return stampRem > 0 ? stampRem + 0.08 : 0;
}

/** 해당 날짜에 겹치는 기간 막대 스택 하단(rem) — 없으면 baseTop */
function lpCalendarMonthlyRangeStackBottomRemOnDay(
  rangeBars,
  dayIdx,
  baseTop,
  rowTopRem,
  rowSlotRem,
) {
  let maxRow = -1;
  for (const b of rangeBars) {
    const s = b.startIdx;
    const e = b.endIdx;
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    if (dayIdx >= s && dayIdx <= e) maxRow = Math.max(maxRow, b.row);
  }
  if (maxRow < 0) return baseTop;
  return rowTopRem[maxRow] + rowSlotRem[maxRow];
}

/**
 * 월간 세로 순서: ① 여러 날 일정 ② 스탬프(있을 때) ③ 할일·일정
 * @returns {number} 스탬프 absolute top (rem)
 */
function lpCalendarMonthlyDayStampTopRem(
  rangeBars,
  dayIdx,
  baseTop,
  gap,
  rowTopRem,
  rowSlotRem,
) {
  if (lpCalendarMonthlyRangeRowCountOnDay(rangeBars, dayIdx) <= 0) {
    return baseTop;
  }
  return (
    lpCalendarMonthlyRangeStackBottomRemOnDay(
      rangeBars,
      dayIdx,
      baseTop,
      rowTopRem,
      rowSlotRem,
    ) + gap
  );
}

/** 기간 막대 아래(또는 baseTop)에 스탬프 배치 — DOM 흐름 대신 주행 기준 absolute */
function lpCalendarApplyMonthlyDayStampPositions(
  weekRow,
  rangeBars,
  baseTop,
  gap,
  rowTopRem,
  rowSlotRem,
) {
  if (!(weekRow instanceof HTMLElement)) return;
  weekRow
    .querySelectorAll(".calendar-monthly-day:not(.empty)")
    .forEach((cell, dayIdx) => {
      const icons = cell.querySelector(
        ".calendar-monthly-day-icons:not([hidden])",
      );
      if (!(icons instanceof HTMLElement)) return;
      const topRem = lpCalendarMonthlyDayStampTopRem(
        rangeBars,
        dayIdx,
        baseTop,
        gap,
        rowTopRem,
        rowSlotRem,
      );
      icons.style.position = "absolute";
      icons.style.top = `${topRem}rem`;
      icons.style.left = "0";
      icons.style.right = "0";
      icons.style.width = "100%";
      icons.style.maxWidth = "100%";
      icons.style.display = "flex";
      icons.style.justifyContent = "center";
      icons.style.marginTop = "0";
      icons.style.marginBottom = "0";
      icons.style.marginLeft = "0";
      icons.style.marginRight = "0";
      icons.style.zIndex = "2";
    });
}

function lpCalendarWeeklyDayIconsStripRem(weekRow) {
  if (!(weekRow instanceof HTMLElement)) return 0;
  const keys = [...weekRow.querySelectorAll(".calendar-monthly-day[data-date]")]
    .map((el) => String(el.dataset.date || "").trim())
    .filter(Boolean);
  if (!keys.some((k) => calendarDayHasIcon(k))) return 0;
  try {
    const rootFs = parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    if (Number.isFinite(rootFs) && rootFs > 0) {
      let maxRem = 0;
      weekRow
        .querySelectorAll(".calendar-monthly-day-icons:not([hidden])")
        .forEach((icons) => {
          const hPx = icons.getBoundingClientRect().height;
          if (hPx > 4) maxRem = Math.max(maxRem, hPx / rootFs);
        });
      if (maxRem > 0) {
        return Math.min(maxRem, CALENDAR_MONTHLY_DAY_ICON_MAX_REM);
      }
      const dayEl = weekRow.querySelector(".calendar-monthly-day[data-date]");
      const wPx = dayEl?.getBoundingClientRect?.().width || 0;
      if (wPx > 0) {
        return Math.min(wPx / rootFs, CALENDAR_MONTHLY_DAY_ICON_MAX_REM);
      }
    }
  } catch (_) {}
  return CALENDAR_MONTHLY_DAY_ICONS_STRIP_REM;
}

function lpCalendarWeekHasVisibleDayIcons(weekRow) {
  return !!weekRow?.querySelector?.(
    ".calendar-monthly-day-icons:not([hidden])",
  );
}

/** partialWeekPatch — 제거한 주 행을 맨 아래가 아니라 날짜 순서 위치에 다시 넣기 */
function lpFindMonthlyWeekWrapInsertBefore(calendarGrid, firstDayKey) {
  const key = String(firstDayKey || "").trim().slice(0, 10);
  if (!key || !(calendarGrid instanceof HTMLElement)) return null;
  for (const wrap of calendarGrid.querySelectorAll(
    ".calendar-monthly-week-wrap",
  )) {
    const cell = wrap.querySelector(".calendar-monthly-day[data-date]");
    const wrapFirst = String(cell?.dataset?.date || "").trim().slice(0, 10);
    if (wrapFirst && wrapFirst > key) return wrap;
  }
  return null;
}

/** 스탬프 영역 — 셀 너비 기준 클래스만(높이는 CSS auto, JS에서 실측) */
function lpCalendarApplyWeekStampStripLayout(weekRow) {
  if (!(weekRow instanceof HTMLElement)) return 0;
  weekRow.classList.remove("calendar-monthly-week--has-stamps");
  weekRow.style.removeProperty("--lp-cal-stamp-strip-rem");
  if (!lpCalendarWeekHasVisibleDayIcons(weekRow)) return 0;
  if (!weekRow.isConnected) {
    weekRow.classList.add("calendar-monthly-week--has-stamps");
    return CALENDAR_MONTHLY_DAY_ICONS_STRIP_REM;
  }
  void weekRow.offsetHeight;
  const strip = lpCalendarWeeklyDayIconsStripRem(weekRow);
  if (!(strip > 0)) return 0;
  weekRow.style.setProperty("--lp-cal-stamp-strip-rem", `${strip}rem`);
  weekRow.classList.add("calendar-monthly-week--has-stamps");
  return strip;
}

function lpCalendarWeekBarBaseTopRem(weekRow, barsTopFromMetrics) {
  const top = Number(barsTopFromMetrics);
  const safe = Number.isFinite(top) && top >= 0 ? top : 2.35;
  if (weekRow?.classList?.contains("calendar-monthly-week--has-stamps")) {
    return safe;
  }
  return safe + 0.1;
}

function lpCalendarWeekBarLayoutMetrics(weekRow) {
  const fallback = {
    BARS_TOP: 2.35,
    BAR_HEIGHT: 1.32,
    BOTTOM_PAD: 0.36,
    ROW_GAP: 0.18,
    WEEK_ROW_MIN: 4.75,
  };
  let el = weekRow?.closest?.(".calendar-monthly-layout") ?? null;
  if (!el && typeof document !== "undefined") {
    el = document.querySelector(".calendar-monthly-layout");
  }
  if (!el || typeof getComputedStyle === "undefined") return fallback;
  const csLayout = getComputedStyle(el);
  const n = (cs, prop, def) => {
    const v = parseFloat(cs.getPropertyValue(prop));
    return Number.isFinite(v) && v >= 0 ? v : def;
  };
  const barsTop = n(csLayout, "--cal-bar-stack-offset", fallback.BARS_TOP);
  return {
    BARS_TOP: barsTop,
    BAR_HEIGHT: n(csLayout, "--cal-bar-row-min", fallback.BAR_HEIGHT),
    BOTTOM_PAD: n(csLayout, "--cal-bar-bottom-pad", fallback.BOTTOM_PAD),
    ROW_GAP: n(csLayout, "--cal-bar-row-gap", fallback.ROW_GAP),
    WEEK_ROW_MIN: n(csLayout, "--cal-week-row-min", fallback.WEEK_ROW_MIN),
  };
}

/** 월간 주 행 목표 min-height(rem): 막대 줄 수만큼만 확장(빈 주는 --cal-week-row-min). */
function lpCalendarMonthlyWeekRowTargetMinHeightRem(
  baseBarTop,
  rowsNeeded,
  BAR_HEIGHT,
  ROW_GAP,
  BOTTOM_PAD,
  weekRowMinRem,
) {
  const floor =
    Number.isFinite(weekRowMinRem) && weekRowMinRem > 0 ? weekRowMinRem : 4.75;
  const safeRows = Math.max(0, rowsNeeded);
  if (safeRows <= 0) return floor;
  const barGaps = safeRows > 1 ? (safeRows - 1) * ROW_GAP : 0;
  const stackHeight = baseBarTop + safeRows * BAR_HEIGHT + barGaps + BOTTOM_PAD;
  return Math.max(floor, stackHeight);
}

/** 월간 여러 날 막대: 가로 구간이 겹치면 다른 줄 */
function calendarMonthlyRangeBarsOverlap(a, b) {
  return a.left < b.left + b.width && b.left < a.left + a.width;
}

function lpCalendarAssignMonthlyRangeBarRows(rangeBars) {
  const rowBars = [];
  rangeBars.forEach((b) => {
    let row = 0;
    while (
      rowBars[row] &&
      rowBars[row].some((r) => calendarMonthlyRangeBarsOverlap(r, b))
    ) {
      row += 1;
    }
    if (!rowBars[row]) rowBars[row] = [];
    rowBars[row].push(b);
    b.row = row;
  });
}

/** 단일일 막대: 날짜 칸마다 0부터 추가 순서대로 쌓음(주 전역 row와 분리) */
function lpCalendarAssignMonthlySingleDayLocalRows(singleDayBars) {
  const perDay = [];
  singleDayBars.forEach((b) => {
    const d = b.dayIdx;
    if (!Number.isFinite(d) || d < 0) return;
    b.localRow = perDay[d] != null ? perDay[d] : 0;
    perDay[d] = b.localRow + 1;
  });
}

function lpCalendarAssignMonthlyBarLayout(allBars) {
  const rangeBars = [];
  const singleBars = [];
  allBars.forEach((b) => {
    if (b.isSingleDay) singleBars.push(b);
    else rangeBars.push(b);
  });
  lpCalendarAssignMonthlyRangeBarRows(rangeBars);
  lpCalendarAssignMonthlySingleDayLocalRows(singleBars);
}

function lpCalendarMonthlyRangeRowCountOnDay(rangeBars, dayIdx) {
  let maxRow = -1;
  for (const b of rangeBars) {
    const s = b.startIdx;
    const e = b.endIdx;
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    if (dayIdx >= s && dayIdx <= e) maxRow = Math.max(maxRow, b.row);
  }
  return maxRow + 1;
}

function lpCalendarMonthlyEstimateSingleDayBarTopRem(
  baseBarTop,
  rangeBars,
  dayIdx,
  localRow,
  BAR_HEIGHT,
  ROW_GAP,
  stampStackOffsetRem = 0,
) {
  const rangeRows = lpCalendarMonthlyRangeRowCountOnDay(rangeBars, dayIdx);
  const gap = Number.isFinite(ROW_GAP) ? Math.max(0, ROW_GAP) : 0;
  const singleSlot = BAR_HEIGHT + gap;
  let offset = 0;
  if (rangeRows > 0) {
    offset = rangeRows * BAR_HEIGHT + (rangeRows - 1) * gap + gap;
  }
  const stampPad =
    Number.isFinite(stampStackOffsetRem) && stampStackOffsetRem > 0
      ? stampStackOffsetRem
      : 0;
  return baseBarTop + offset + stampPad + localRow * singleSlot;
}

function lpCalendarMonthlyWeekStackSlotCount(allBars, dayCount = 7) {
  const rangeBars = allBars.filter((b) => !b.isSingleDay);
  let maxSlots = 0;
  for (let d = 0; d < dayCount; d++) {
    const rangeRows = lpCalendarMonthlyRangeRowCountOnDay(rangeBars, d);
    const singleCount = allBars.filter(
      (b) => b.isSingleDay && b.dayIdx === d,
    ).length;
    maxSlots = Math.max(maxSlots, rangeRows + singleCount);
  }
  return maxSlots;
}

function lpCalendarMeasureMonthlySpanBarHeightPx(el) {
  if (!el || !el.isConnected) return 0;
  const prevMin = el.style.minHeight;
  const prevHeight = el.style.height;
  el.style.height = "auto";
  el.style.minHeight = "0";
  let h = 0;
  try {
    h = el.scrollHeight || el.offsetHeight || 0;
    if (!(h > 0.5)) {
      h = el.getBoundingClientRect().height || 0;
    }
  } catch (_) {}
  el.style.minHeight = prevMin;
  el.style.height = prevHeight;
  return h;
}

/** 화면 너비·줄바꿈·스탬프 로드 시 막대 top·주 행 높이 재계산 */
function lpAttachCalendarMonthlyWeekBarLayoutSync(weekRow, barsWithRow, layoutMetrics) {
  if (!(weekRow instanceof HTMLElement)) return;
  const hasBars = barsWithRow?.length > 0;
  const hasStamps = lpCalendarWeekHasVisibleDayIcons(weekRow);
  if (!hasBars && !hasStamps) return;
  try {
    weekRow._lpMonthlyBarLayoutRo?.disconnect();
  } catch (_) {}
  weekRow._lpMonthlyBarLayoutRo = null;
  const { BAR_HEIGHT, BARS_TOP, BOTTOM_PAD, ROW_GAP } = layoutMetrics;
  const rerun = () => {
    if (!weekRow.isConnected) return;
    lpCalendarFinalizeBarRowLayout(
      barsWithRow || [],
      weekRow,
      BAR_HEIGHT,
      BARS_TOP,
      BOTTOM_PAD,
      ROW_GAP,
    );
  };
  weekRow._lpMonthlyBarLayoutRerun = rerun;
  if (typeof ResizeObserver === "undefined") return;
  let roRaf = null;
  const ro = new ResizeObserver(() => {
    if (roRaf != null) return;
    roRaf = requestAnimationFrame(() => {
      roRaf = null;
      rerun();
    });
  });
  ro.observe(weekRow);
  (barsWithRow || []).forEach((b) => {
    if (b._barEl?.isConnected) ro.observe(b._barEl);
  });
  weekRow
    .querySelectorAll(".calendar-monthly-day-icons:not([hidden]) img")
    .forEach((img) => {
      ro.observe(img);
    });
  weekRow._lpMonthlyBarLayoutRo = ro;
}

function snapshotCalendarDayIconsSemanticForCompare() {
  try {
    const snap = readCalendarDayIconsSnapshot();
    return Object.keys(snap)
      .sort()
      .map((ymd) => `${ymd}:${snap[ymd]?.iconKey || ""}`)
      .join("|");
  } catch (_) {
    return "";
  }
}

/** 월·주 격자 재그림 여부 — 완료(done)만 바뀐 경우는 막대 클래스 패치로 충분 */
function snapshotSectionTasksForCalendarGridPaintCompare() {
  function stripContainer(container) {
    const out = {};
    for (const k of Object.keys(container || {})) {
      const arr = container[k];
      out[k] = Array.isArray(arr)
        ? arr.map((t) => {
            if (!t || typeof t !== "object") return t;
            const { done, serverUpdatedAt, ...rest } = t;
            return rest;
          })
        : arr;
    }
    return out;
  }
  try {
    const fixed = stripContainer(readSectionTasksObject());
    const custom = stripContainer(readCustomSectionTasksObject());
    return `${JSON.stringify(fixed)}\n${JSON.stringify(custom)}`;
  } catch (_) {
    return "";
  }
}

function snapshotCalendarGridPaintSignature(viewContext = "", opts = {}) {
  const includeLedger = opts.includeLedger !== false;
  let ledgerPart = "";
  if (includeLedger) {
    try {
      const rows = loadTimeRows();
      ledgerPart = JSON.stringify(
        (Array.isArray(rows) ? rows : []).map((r) =>
          stripTimeLedgerSyncMetaForCompare(r),
        ),
      );
    } catch (_) {}
  }
  return `${snapshotSectionTasksForCalendarGridPaintCompare()}\x1e${ledgerPart}\x1e${snapshotCalendarDayIconsSemanticForCompare()}\x1e${viewContext}`;
}

/** pull·소프트 갱신: 화면에 쓰는 데이터가 같으면 renderCalendar 생략 */
function lpAttachCalendarGridRefreshGuard(
  wrap,
  runRender,
  viewContextFn = () => "",
  opts = {},
) {
  const signatureOpts = { includeLedger: opts.includeLedger !== false };
  wrap._lpRefreshCalendarView = (refreshOpts = {}) => {
    const opts =
      refreshOpts && typeof refreshOpts === "object" ? refreshOpts : {};
    const hasPartialPatch =
      Array.isArray(opts.patchDateKeys) && opts.patchDateKeys.length > 0;
    const softLocal = !!opts.softLocal || hasPartialPatch;
    if (!hasPartialPatch) {
      const sig = snapshotCalendarGridPaintSignature(
        viewContextFn(),
        signatureOpts,
      );
      if (sig === wrap._lpLastCalendarGridPaintSig) {
        calendar1WeekDiagLog("refreshGuard.skipSameSig", {
          ctx: viewContextFn(),
        });
        return;
      }
    }
    calendar1WeekDiagLog("refreshGuard.runRender", {
      ctx: viewContextFn(),
      softLocal,
      partial: hasPartialPatch,
    });
    if (softLocal || hasPartialPatch) {
      runRender({
        ...opts,
        softLocal: true,
        patchDateKeys: hasPartialPatch ? opts.patchDateKeys : undefined,
      });
    } else {
      runRender(opts);
    }
  };
  wrap._lpRememberCalendarGridPaintSig = () => {
    wrap._lpLastCalendarGridPaintSig = snapshotCalendarGridPaintSignature(
      viewContextFn(),
      signatureOpts,
    );
  };
}

/** 로컬 저장 직후 — 시그니처 가드 있는 _lpRefreshCalendarView 우선(중복 전체 재그림 방지) */
function lpRunCalendarLayoutRefresh(
  layoutWrap,
  fallbackRender,
  refreshOpts = {},
) {
  if (layoutWrap && typeof layoutWrap._lpRefreshCalendarView === "function") {
    layoutWrap._lpRefreshCalendarView(refreshOpts);
    return;
  }
  try {
    fallbackRender?.();
  } catch (_) {}
}

/** layout-pending → layout-ready (막대 재측정 후 표시) */
function lpRevealCalendarGridLayout(calendarGrid, reason) {
  if (!calendarGrid) return;
  if (!calendarGrid.classList.contains("calendar-monthly-grid--layout-pending")) {
    return;
  }
  calendarGrid.classList.remove("calendar-monthly-grid--layout-pending");
  calendarGrid.classList.add("calendar-monthly-grid--layout-ready");
  lpRestoreCalendarGridScrollTopIfPending(calendarGrid);
  const afterReveal = calendarGrid._lpAfterLayoutReveal;
  if (typeof afterReveal === "function") {
    delete calendarGrid._lpAfterLayoutReveal;
    try {
      afterReveal();
    } catch (_) {}
  }
  calendar1WeekDiagLog("layoutPass.reveal", {
    reason,
    connected: !!calendarGrid.isConnected,
  });
  calendar1WeekDiagSnapshot(calendarGrid, reason);
}

function lpRestoreCalendarGridScrollTopIfPending(calendarGrid) {
  if (!calendarGrid) return;
  const savedTop = calendarGrid._lpPendingScrollRestore;
  if (!Number.isFinite(savedTop) || savedTop <= 0) return;
  delete calendarGrid._lpPendingScrollRestore;
  const apply = () => {
    if (!calendarGrid.isConnected) return;
    calendarGrid.scrollTop = savedTop;
  };
  apply();
  requestAnimationFrame(apply);
  requestAnimationFrame(() => requestAnimationFrame(apply));
}

function lpRememberCalendarGridScrollTop(calendarGrid, resetScroll = false) {
  if (!calendarGrid) return;
  if (resetScroll) {
    delete calendarGrid._lpPendingScrollRestore;
    return;
  }
  const top = calendarGrid.scrollTop || 0;
  if (top > 0) calendarGrid._lpPendingScrollRestore = top;
  else delete calendarGrid._lpPendingScrollRestore;
}

/** finishWeek가 DOM 붙기 전에 호출될 때(1주 첫 mount) rAF로 재시도 */
function lpScheduleRevealCalendarGridLayout(calendarGrid, reason) {
  if (!calendarGrid) return;
  const tryReveal = (attempt) => {
    if (calendarGrid.isConnected) {
      lpRevealCalendarGridLayout(calendarGrid, reason);
      return;
    }
    if (attempt >= 24) {
      calendar1WeekDiagLog("layoutPass.reveal.gaveUp", { reason, attempt });
      return;
    }
    requestAnimationFrame(() => tryReveal(attempt + 1));
  };
  tryReveal(0);
}

/** 막대 top·주 행 높이 재측정이 끝날 때까지 격자 깜빡임(큰 갭→좁아짐) 완화 */
function lpBeginCalendarGridLayoutPass(calendarGrid, opts = {}) {
  if (!calendarGrid) {
    return { trackWeek: () => () => {} };
  }
  if (!opts.keepVisible) {
    calendarGrid.classList.add("calendar-monthly-grid--layout-pending");
    calendarGrid.classList.remove("calendar-monthly-grid--layout-ready");
  }
  let pending = 0;
  const finishWeek = () => {
    pending -= 1;
    calendar1WeekDiagLog("layoutPass.finishWeek", {
      pending,
      connected: !!calendarGrid?.isConnected,
      classes: calendarGrid?.className || "",
    });
    if (pending > 0) return;
    lpScheduleRevealCalendarGridLayout(calendarGrid, "finishWeek");
  };
  return {
    trackWeek() {
      pending += 1;
      return finishWeek;
    },
  };
}

/** 월간 막대: 줄바꿈 반영 후 행별 실제 높이로 top·주 행 minHeight 맞춤(행 겹침 방지). */
function lpCalendarFinalizeBarRowLayout(
  barsWithRow,
  weekRow,
  BAR_HEIGHT,
  BARS_TOP,
  BOTTOM_PAD,
  ROW_GAP,
  onSettled,
) {
  const gap = Number.isFinite(ROW_GAP) ? Math.max(0, ROW_GAP) : 0;
  const bars = Array.isArray(barsWithRow) ? barsWithRow : [];
  const hasBars = bars.length > 0;
  const hasStamps = lpCalendarWeekHasVisibleDayIcons(weekRow);
  if (!weekRow || (!hasBars && !hasStamps)) {
    calendar1WeekDiagLog("finalizeBarRow.skip", {
      bars: bars.length,
      hasWeekRow: !!weekRow,
      hasStamps,
    });
    onSettled?.();
    return;
  }
  const { WEEK_ROW_MIN } = lpCalendarWeekBarLayoutMetrics(weekRow);
  const rangeBars = bars.filter((b) => !b.isSingleDay);
  const singleBars = bars.filter((b) => b.isSingleDay);
  const maxRangeRow = rangeBars.length
    ? Math.max(...rangeBars.map((b) => b.row), 0)
    : -1;

  const run = () => {
    if (!weekRow.isConnected) return;
    lpCalendarApplyWeekStampStripLayout(weekRow);
    const { BARS_TOP, BOTTOM_PAD: bottomPad } =
      lpCalendarWeekBarLayoutMetrics(weekRow);
    const baseTop = lpCalendarWeekBarBaseTopRem(weekRow, BARS_TOP);
    const rootFont =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const pxToRem = (px) => px / rootFont;
    const subPxSlackRem = 0.12;
    const emptyRowTop = [];
    const emptyRowSlot = [];

    if (!hasBars && hasStamps) {
      lpCalendarApplyMonthlyDayStampPositions(
        weekRow,
        [],
        baseTop,
        gap,
        emptyRowTop,
        emptyRowSlot,
      );
      let maxBottomRem = baseTop;
      weekRow
        .querySelectorAll(".calendar-monthly-day:not(.empty)")
        .forEach((_cell, dayIdx) => {
          const stampOff = lpCalendarMonthlyDayStampStackOffsetRem(
            weekRow,
            dayIdx,
          );
          if (stampOff <= 0) return;
          const stampTop = lpCalendarMonthlyDayStampTopRem(
            [],
            dayIdx,
            baseTop,
            gap,
            emptyRowTop,
            emptyRowSlot,
          );
          maxBottomRem = Math.max(maxBottomRem, stampTop + stampOff);
        });
      const requiredHeight = maxBottomRem + bottomPad + subPxSlackRem;
      weekRow.style.minHeight = `${Math.max(WEEK_ROW_MIN, requiredHeight)}rem`;
      return;
    }

    const rowMaxPx = [];
    for (const b of rangeBars) {
      const el = b._barEl;
      if (!el || !el.isConnected) continue;
      const h = lpCalendarMeasureMonthlySpanBarHeightPx(el);
      const r = b.row;
      rowMaxPx[r] = Math.max(rowMaxPx[r] || 0, h);
    }
    let topAcc = baseTop;
    const rowTopRem = [];
    const rowSlotRem = [];
    for (let r = 0; r <= maxRangeRow; r++) {
      rowTopRem[r] = topAcc;
      const slotRem = Math.max(
        BAR_HEIGHT,
        rowMaxPx[r] != null ? pxToRem(rowMaxPx[r]) : BAR_HEIGHT,
      );
      rowSlotRem[r] = slotRem;
      topAcc += slotRem;
      if (r < maxRangeRow) topAcc += gap;
    }
    const rangeStackBottomOnDay = (dayIdx) =>
      lpCalendarMonthlyRangeStackBottomRemOnDay(
        rangeBars,
        dayIdx,
        baseTop,
        rowTopRem,
        rowSlotRem,
      );
    for (const b of rangeBars) {
      if (b._barEl?.isConnected) {
        b._barEl.style.top = `${rowTopRem[b.row]}rem`;
        b._barEl.style.minHeight = `${rowSlotRem[b.row]}rem`;
        b._barEl.style.height = "auto";
      }
    }
    lpCalendarApplyMonthlyDayStampPositions(
      weekRow,
      rangeBars,
      baseTop,
      gap,
      rowTopRem,
      rowSlotRem,
    );
    const singleByDay = {};
    for (const b of singleBars) {
      const d = b.dayIdx;
      if (!Number.isFinite(d) || d < 0) continue;
      if (!singleByDay[d]) singleByDay[d] = [];
      singleByDay[d].push(b);
    }
    let maxBottomRem = baseTop;
    Object.keys(singleByDay).forEach((dKey) => {
      const dayIdx = Number(dKey);
      const list = singleByDay[dayIdx].sort(
        (a, b) => (a.localRow || 0) - (b.localRow || 0),
      );
      const hasRange = lpCalendarMonthlyRangeRowCountOnDay(rangeBars, dayIdx) > 0;
      let acc = hasRange ? rangeStackBottomOnDay(dayIdx) + gap : baseTop;
      acc += lpCalendarMonthlyDayStampStackOffsetRem(weekRow, dayIdx);
      list.forEach((b, i) => {
        if (!b._barEl?.isConnected) return;
        b._barEl.style.top = `${acc}rem`;
        const h = lpCalendarMeasureMonthlySpanBarHeightPx(b._barEl);
        const slotRem = Math.max(BAR_HEIGHT, pxToRem(h));
        b._barEl.style.minHeight = `${slotRem}rem`;
        b._barEl.style.height = "auto";
        acc += slotRem;
        if (i < list.length - 1) acc += gap;
      });
      maxBottomRem = Math.max(maxBottomRem, acc);
    });
    if (rangeBars.length) {
      maxBottomRem = Math.max(maxBottomRem, topAcc);
    }
    weekRow
      .querySelectorAll(".calendar-monthly-day:not(.empty)")
      .forEach((_cell, dayIdx) => {
        const stampOff = lpCalendarMonthlyDayStampStackOffsetRem(
          weekRow,
          dayIdx,
        );
        if (stampOff <= 0) return;
        const stampTop = lpCalendarMonthlyDayStampTopRem(
          rangeBars,
          dayIdx,
          baseTop,
          gap,
          rowTopRem,
          rowSlotRem,
        );
        maxBottomRem = Math.max(maxBottomRem, stampTop + stampOff);
      });
    const requiredHeight = maxBottomRem + bottomPad + subPxSlackRem;
    weekRow.style.minHeight = `${Math.max(WEEK_ROW_MIN, requiredHeight)}rem`;
  };

  let pass = 0;
  const maxPasses = 8;
  const step = () => {
    run();
    pass += 1;
    const needsRetry =
      pass < maxPasses &&
      (hasStamps ||
        bars.some((b) => b._barEl?.isConnected));
    if (needsRetry) {
      requestAnimationFrame(step);
    } else {
      calendar1WeekDiagLog("finalizeBarRow.settled", {
        pass,
        maxPasses,
        bars: bars.length,
        hasStamps,
        weekRowConnected: !!weekRow?.isConnected,
      });
      onSettled?.();
    }
  };
  requestAnimationFrame(step);
}

/** 1일 뷰: document 리스너는 한 번만 — 탭 전환·재진입 시 핸들러만 교체 (누적 방지) */
let oneDayTimetableRefreshHandler = null;
function ensureOneDayTimetableDocumentListeners() {
  if (ensureOneDayTimetableDocumentListeners._bound) return;
  ensureOneDayTimetableDocumentListeners._bound = true;
  const run = (e) => {
    oneDayTimetableRefreshHandler?.(e);
  };
  document.addEventListener("calendar-time-rows-updated", run);
  window.addEventListener("time-ledger-tasks-saved", run);
}

/** 같은 마감일·같은 섹션: 세션 배열 순서 그대로(뒤에 push된 할 일이 캘린더에서도 아래행). */
function tasksForCalendarSameDayInStorageOrder(arr, dateKey) {
  return arr.filter(
    (t) =>
      (t.name || "").trim() !== "" &&
      (t.dueDate || "").slice(0, 10) === dateKey,
  );
}

/**
 * 같은 날 단일일 할일·일정 — 섹션 저장 배열 순서(추가한 순) 그대로.
 * 여러 날짜에 걸친 일정(기간 막대)은 이 함수 대상이 아님.
 */
function orderSingleDayTasksForMonthlyBarStack(tasks) {
  return Array.isArray(tasks) ? tasks.slice() : [];
}

function getSectionTasksForDate(dateKey) {
  const out = [];
  try {
    const obj = readSectionTasksObject();
    CALENDAR_FIXED_SECTION_IDS.forEach((sectionId) => {
      const arr = obj[sectionId];
      if (!Array.isArray(arr)) return;
      const sectionLabel = "";
      tasksForCalendarSameDayInStorageOrder(arr, dateKey).forEach((t) =>
        out.push({
          name: t.name,
          startDate: (t.startDate || "").slice(0, 10),
          dueDate: (t.dueDate || "").slice(0, 10),
          startTime: t.startTime || "",
          endTime: t.endTime || "",
          sectionId,
          sectionLabel,
          itemType: t.itemType || "todo",
          done: !!t.done,
          isCalendarDiary: !!t.isCalendarDiary,
          taskId: t.taskId || "",
          eisenhower: (t.eisenhower || "").trim() || "",
          classification: "",
          _calPrevStart: (t._calPrevStart || "").toString().slice(0, 10) || "",
          _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
          serverUpdatedAt: String(t.serverUpdatedAt || "").trim(),
          ...(Number.isFinite(Number(t._calCellTouchMs))
            ? { _calCellTouchMs: Number(t._calCellTouchMs) }
            : {}),
        }),
      );
    });
  } catch (_) {}
  return out;
}

/** 시작·마감 날짜가 모두 있고 서로 다른 날 → 월간 가로 여러 칸 기간 막대. 같은 날·마감만 등은 단일 칸 점선 테두리 막대 */
function calendarTaskIsMultiDayDateSpan(t) {
  const s = (t?.startDate || "").trim().slice(0, 10);
  const d = (t?.dueDate || "").trim().slice(0, 10);
  return !!(s && d && s !== d);
}

function getSectionTasksWithDateRange() {
  const out = [];
  try {
    const obj = readSectionTasksObject();
    CALENDAR_FIXED_SECTION_IDS.forEach((sectionId) => {
      const arr = obj[sectionId];
      if (!Array.isArray(arr)) return;
      const sectionLabel = "";
      arr
        .filter(
          (t) =>
            (t.name || "").trim() !== "" &&
            (t.startDate || "").slice(0, 10) &&
            (t.dueDate || "").slice(0, 10) &&
            calendarTaskIsMultiDayDateSpan(t),
        )
        .forEach((t) =>
          out.push({
            name: t.name,
            startDate: (t.startDate || "").slice(0, 10),
            dueDate: (t.dueDate || "").slice(0, 10),
            startTime: t.startTime || "",
            endTime: t.endTime || "",
            sectionId,
            sectionLabel,
            itemType: t.itemType || "todo",
            done: !!t.done,
            isCalendarDiary: !!t.isCalendarDiary,
            taskId: t.taskId || "",
            eisenhower: (t.eisenhower || "").trim() || "",
            classification: "",
            _calPrevStart:
              (t._calPrevStart || "").toString().slice(0, 10) || "",
            _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
          }),
        );
    });
  } catch (_) {}
  return out;
}

function updateSectionTaskDates(
  sectionId,
  taskId,
  startDate,
  dueDate,
  opts = {},
) {
  const { recordCalendarSidebarRevert = false } = opts;
  dateDebug("updateSectionTaskDates IN", {
    sectionId,
    taskId,
    startDate,
    dueDate,
  });
  try {
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) {
      dateDebug("updateSectionTaskDates: no arr for", sectionId);
      return false;
    }
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (!t) {
      dateDebug("updateSectionTaskDates: task not found", {
        sectionId,
        taskId,
        taskIds: arr.map((x) => x.taskId),
      });
      return false;
    }
    if (recordCalendarSidebarRevert) {
      t._calPrevStart = (t.startDate || "").slice(0, 10) || "";
      t._calPrevDue = (t.dueDate || "").slice(0, 10) || "";
    }
    t.startDate = (startDate || "").slice(0, 10) || "";
    t.dueDate = (dueDate || "").slice(0, 10) || "";
    persistSectionTasksAndSchedule(obj);
    dateDebug("updateSectionTaskDates OK", {
      sectionId,
      taskId,
      savedDueDate: t.dueDate,
    });
    return true;
  } catch (err) {
    dateDebug("updateSectionTaskDates catch", err);
    return false;
  }
}

function updateSectionTaskTimes(sectionId, taskId, startTime, endTime) {
  try {
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.startTime = (startTime || "").trim() || "";
      t.endTime = (endTime || "").trim() || "";
      persistSectionTasksAndSchedule(obj);
      return true;
    }
  } catch (_) {}
  return false;
}

function updateSectionTaskDone(sectionId, taskId, done) {
  try {
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.done = !!done;
      persistSectionTasksAndSchedule(obj);
      upsertCalendarSectionTaskRowFromSessionMemory(sectionId, taskId, null);
      return true;
    }
  } catch (_) {}
  return false;
}

function syncCalendarSectionTaskRowToSupabase(sectionId, taskId, listRootEl) {
  upsertCalendarSectionTaskRowFromSessionMemory(sectionId, taskId, listRootEl);
}

/**
 * 날짜 셀·주 행 드롭 후 `calendar_section_tasks` 등 서버 반영
 */
function syncCalendarSectionTaskToServerAfterCalendarDateDrop(payload, ok) {
  if (!ok || !payload) return;
  syncCalendarSectionTaskRowToSupabase(payload.sectionId, payload.taskId, null);
}

function addSectionTaskToCalendar(sectionId, taskData) {
  try {
    const obj = readSectionTasksObject();
    if (!obj[sectionId]) obj[sectionId] = [];
    const arr = obj[sectionId];
    const taskId =
      taskData.taskId ||
      `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    arr.push({
      taskId,
      name: (taskData.name || "").trim(),
      startDate: (taskData.startDate || "").slice(0, 10) || "",
      dueDate: (taskData.dueDate || "").slice(0, 10),
      startTime: taskData.startTime || "",
      endTime: taskData.endTime || "",
      done: !!taskData.done,
      itemType: taskData.itemType || "todo",
      _calPrevStart:
        (taskData._calPrevStart || "").toString().slice(0, 10) || "",
      _calPrevDue: (taskData._calPrevDue || "").toString().slice(0, 10) || "",
    });
    persistSectionTasksAndSchedule(obj);
    return true;
  } catch (_) {}
  return false;
}

/** rgba 색상의 투명도를 높임 (alpha 낮춤) — 막대 배경용(월간 기간 막대 --bar-bg) */
function withMoreTransparency(color, alpha = 0.82) {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
  return color;
}

/** 타임테이블 블록 라벨 글자색 — 세로 강조선(border)과 동일 RGB 톤의 불투명 색 */
function timetableAccentTextColor(accentRgba) {
  if (!accentRgba || typeof accentRgba !== "string") return "";
  const m = accentRgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return "";
  return `rgb(${m[1]}, ${m[2]}, ${m[3]})`;
}

/** 여러 날 spanning 막대: 섹션색과 무관하게 한 색( --cal-range-span-bar-bg ) */
function lpApplyCalendarMultiDaySpanBarBackground(bar, b) {
  if (!bar || !b || b.isSingleDay) return;
  try {
    bar.style.setProperty(
      "background",
      "var(--cal-range-span-bar-bg, #d6e8f4)",
      "important",
    );
  } catch (_) {}
}

/** 1일·1주 타임블록 면: 격자가 비쳐 어둡게 보이지 않도록 채움 알파 하한(너무 옅은 값만 올림) */
function timetableFillFaceBg(bgRgba, minAlpha = 0.82) {
  const m = String(bgRgba || "").match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i,
  );
  if (!m) return bgRgba;
  const prev = m[4] !== undefined ? parseFloat(m[4]) : 1;
  const a = Math.min(1, Math.max(prev, minAlpha));
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`;
}

/** 타임블록 생산성 면색이 디자인 시트(hex)인지 — 면·테두리·진한 글자 적용 */
function timetableUsesHexSurface(c) {
  return !!(
    c &&
    c.accentText &&
    typeof c.bg === "string" &&
    c.bg.startsWith("#")
  );
}

const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];
function formatCalendarMonthLabel(monthIndex) {
  return formatMonthNameEn(monthIndex);
}

/** 월요일 시작 (0=월, 6=일) */
function getMondayBasedDow(date) {
  return (date.getDay() + 6) % 7;
}

function getCalendarGrid(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = getMondayBasedDow(first);
  const totalDays = last.getDate();

  const grid = [];
  let week = [];
  for (let i = 0; i < startDow; i++) {
    week.push(new Date(year, month, 1 - startDow + i));
  }
  for (let d = 1; d <= totalDays; d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) {
      grid.push(week);
      week = [];
    }
  }
  let nextMonthDay = 1;
  while (week.length > 0 && week.length < 7) {
    week.push(new Date(year, month + 1, nextMonthDay++));
  }
  if (week.length === 7) {
    grid.push(week);
  }
  return grid;
}

/** 선택일 1일만 (1행 x 1열) - dayOffset: 0=오늘, 1=내일, -1=어제 */
function getCalendarGridFor1Day(dayOffset = 0) {
  const today = new Date();
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + dayOffset);
  return [[targetDate]];
}

/** 1주 (월~일 7일) - weekOffset: 0=이번 주, 1=다음 주, -1=지난 주 */
function getCalendarGridFor1Week(weekOffset = 0) {
  const today = new Date();
  const mondayDow = getMondayBasedDow(today);
  const firstMonday = new Date(today);
  firstMonday.setDate(today.getDate() - mondayDow + weekOffset * 7);
  const week = [];
  for (let d = 0; d < 7; d++) {
    const date = new Date(firstMonday);
    date.setDate(firstMonday.getDate() + d);
    week.push(date);
  }
  return week;
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 캘린더 막대 왼쪽 기한초과 강조 — UI에서 쓰지 않음 */
function calendarBarTaskIsOverdueTodo(_task) {
  return false;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/** KPI 할일은 TodoList 경로, 일반 할일/일정은 캘린더 전용 수정 모달 */
function lpOpenCalendarTaskEdit(barModel, options = {}) {
  const b = barModel || {};
  if (String(b.kpiTodoId || "").trim() && String(b.storageKey || "").trim()) {
    openTodoTaskEditFromCalendarBarModel(b, options);
    return;
  }
  openCalendarTaskEditFromBarModel(b, options);
}

function lpBuildCalendarSpanBarInnerHtml(name, _done) {
  const raw = String(name || "");
  return `<span class="calendar-monthly-span-bar-text">${escapeHtml(raw)}</span>`;
}

function lpApplyCalendarSpanBarDonePastClasses(bar, b, todayYmd) {
  if (b.done) bar.classList.add("is-completed");
  else bar.classList.remove("is-completed");
  if (isPastCalendarTask(b, todayYmd)) bar.classList.add("is-past");
}

/** 완료 토글만 반영 — renderCalendar 전체 재구성 없이 막대 is-completed만 갱신 */
function lpPatchCalendarTaskDoneInLayouts(taskId, done) {
  const tid = String(taskId || "").trim();
  if (!tid) return;
  document.querySelectorAll(".calendar-monthly-layout").forEach((layout) => {
    layout
      .querySelectorAll(".calendar-monthly-span-bar[data-task-id]")
      .forEach((bar) => {
        if ((bar.dataset.taskId || "").trim() !== tid) return;
        bar.classList.toggle("is-completed", !!done);
      });
    try {
      layout._lpRememberCalendarGridPaintSig?.();
    } catch (_) {}
  });
}

/** 수정 모달 저장 후 — 완료만 바뀌었으면 막대만, 아니면 전체 갱신 콜백 */
function lpCalendarHandleTaskEditAfterApply(applyMeta, onStructuralChange) {
  if (applyMeta?.doneOnly && applyMeta.taskId) {
    lpPatchCalendarTaskDoneInLayouts(applyMeta.taskId, !!applyMeta.done);
    return;
  }
  let refreshMeta = applyMeta;
  if (
    applyMeta &&
    !Array.isArray(applyMeta.patchDateKeys) &&
    (applyMeta.prevStart || applyMeta.startDate || applyMeta.prevDue || applyMeta.dueDate)
  ) {
    refreshMeta = {
      patchDateKeys: lpCollectCalendarTaskMoveDateKeys(
        applyMeta.prevStart,
        applyMeta.prevDue,
        applyMeta.startDate,
        applyMeta.dueDate,
      ),
    };
  }
  try {
    onStructuralChange?.(refreshMeta);
  } catch (_) {}
}

let _lpTimeBlockHoverTipHideTimer = null;
let _lpTimeBlockTipScrollBound = false;

function lpEnsureTimeBlockHoverTip() {
  let tip = document.getElementById("lp-time-block-hover-tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "lp-time-block-hover-tip";
    tip.className = "lp-time-block-hover-tip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
    if (!_lpTimeBlockTipScrollBound) {
      _lpTimeBlockTipScrollBound = true;
      window.addEventListener(
        "scroll",
        () => {
          lpHideTimeBlockHoverTip();
        },
        true,
      );
    }
  }
  return tip;
}

function lpHideTimeBlockHoverTip() {
  clearTimeout(_lpTimeBlockHoverTipHideTimer);
  const tip = document.getElementById("lp-time-block-hover-tip");
  if (tip) tip.classList.remove("lp-time-block-hover-tip--visible");
}

function lpShowTimeBlockHoverTipFromRect() {
  /* 전역 툴팁 금지 */
  lpHideTimeBlockHoverTip();
}

/** 호버 툴팁 사용 안 함 */
function lpAttachColoredTimeBlockTooltip(_el, _opts) {}

function updateCustomSectionTaskDone(sectionId, taskId, done) {
  try {
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.done = !!done;
      persistCustomSectionTasksAndSchedule(obj);
      upsertCalendarSectionTaskRowFromSessionMemory(sectionId, taskId, null);
    }
  } catch (_) {}
}

function updateCustomSectionTaskDates(
  sectionId,
  taskId,
  startDate,
  dueDate,
  opts = {},
) {
  const { recordCalendarSidebarRevert = false } = opts;
  try {
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      if (recordCalendarSidebarRevert) {
        t._calPrevStart = (t.startDate || "").slice(0, 10) || "";
        t._calPrevDue = (t.dueDate || "").slice(0, 10) || "";
      }
      t.startDate = (startDate || "").slice(0, 10) || "";
      t.dueDate = (dueDate || "").slice(0, 10) || "";
      persistCustomSectionTasksAndSchedule(obj);
      return true;
    }
  } catch (_) {}
  return false;
}

function updateCustomSectionTaskTimes(sectionId, taskId, startTime, endTime) {
  try {
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.startTime = (startTime || "").trim() || "";
      t.endTime = (endTime || "").trim() || "";
      persistCustomSectionTasksAndSchedule(obj);
      return true;
    }
  } catch (_) {}
  return false;
}

function addCalendarTodoToCustomSection(sectionId, taskData) {
  try {
    const obj = readCustomSectionTasksObject();
    if (!obj[sectionId]) obj[sectionId] = [];
    const arr = obj[sectionId];
    const taskId =
      taskData.taskId ||
      `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    arr.push({
      taskId,
      name: (taskData.name || "").trim(),
      startDate: (taskData.startDate || "").slice(0, 10) || "",
      dueDate: (taskData.dueDate || "").slice(0, 10) || "",
      startTime: taskData.startTime || "",
      endTime: taskData.endTime || "",
      done: !!taskData.done,
      itemType: taskData.itemType || "todo",
      _calPrevStart:
        (taskData._calPrevStart || "").toString().slice(0, 10) || "",
      _calPrevDue: (taskData._calPrevDue || "").toString().slice(0, 10) || "",
    });
    persistCustomSectionTasksAndSchedule(obj);
    return true;
  } catch (_) {}
  return false;
}

function addDaysToDateKey(dateKey, days) {
  const d = new Date(dateKey + "T12:00:00");
  d.setDate(d.getDate() + days);
  return formatDateKey(d);
}

/** 할일·일정 날짜 이동 시 영향 받는 날짜 키(이전·새 구간) */
function lpCollectCalendarTaskMoveDateKeys(oldStart, oldDue, newStart, newDue) {
  const out = new Set();
  const addRange = (start, due) => {
    const s = String(start || "")
      .trim()
      .slice(0, 10);
    const d = String(due || start || "")
      .trim()
      .slice(0, 10);
    if (!s) return;
    const end = d || s;
    let cur = s;
    let guard = 0;
    while (cur && guard < 400) {
      out.add(cur);
      if (cur === end) break;
      cur = addDaysToDateKey(cur, 1);
      guard += 1;
    }
  };
  addRange(oldStart, oldDue);
  addRange(newStart, newDue);
  return [...out];
}

function lpResolveCalendarTaskDropDates(targetDate, payload) {
  const oldStart = (payload?.startDate || "").slice(0, 10);
  const oldDue = (payload?.dueDate || "").slice(0, 10);
  let newStart = "";
  let newDue = String(targetDate || "")
    .trim()
    .slice(0, 10);
  if (oldStart && oldDue && oldStart !== oldDue) {
    const startD = new Date(oldStart + "T12:00:00");
    const dueD = new Date(oldDue + "T12:00:00");
    const daysDiff = Math.round((dueD - startD) / 86400000);
    newStart = newDue;
    newDue = addDaysToDateKey(newDue, daysDiff);
  } else if (oldStart && oldDue) {
    newStart = newDue;
  }
  return { oldStart, oldDue, newStart, newDue };
}

function lpApplyCalendarSectionTaskDateMove(payload, newStart, newDue) {
  const oldStart = (payload?.startDate || "").slice(0, 10);
  const oldDue = (payload?.dueDate || "").slice(0, 10);
  if (payload?.sectionId && payload.sectionId.startsWith("custom-")) {
    let ok = updateCustomSectionTaskDates(
      payload.sectionId,
      payload.taskId,
      newStart,
      newDue,
      { recordCalendarSidebarRevert: true },
    );
    if (!ok && (payload.name || "").trim()) {
      ok = addCalendarTodoToCustomSection(payload.sectionId, {
        taskId: payload.taskId,
        name: payload.name,
        startDate: newStart,
        dueDate: newDue,
        done: !!payload.done,
        itemType: payload.itemType || "todo",
        _calPrevStart: oldStart,
        _calPrevDue: oldDue,
      });
    }
    return ok;
  }
  if (
    isCalendarFixedSectionKey(payload?.sectionId) &&
    ((payload?.taskId || "").trim() || (payload?.name || "").trim())
  ) {
    return (
      updateSectionTaskDates(
        payload.sectionId,
        payload.taskId,
        newStart,
        newDue,
        { recordCalendarSidebarRevert: true },
      ) ||
      addSectionTaskToCalendar(payload.sectionId, {
        taskId: payload.taskId,
        name: payload.name,
        startDate: newStart,
        dueDate: newDue,
        done: !!payload.done,
        itemType: payload.itemType || "todo",
        _calPrevStart: oldStart,
        _calPrevDue: oldDue,
      })
    );
  }
  return false;
}

function lpHandleCalendarTaskDropOnDate(targetDate, payload, onAfterLocalSave) {
  const { oldStart, oldDue, newStart, newDue } =
    lpResolveCalendarTaskDropDates(targetDate, payload);
  const ok = lpApplyCalendarSectionTaskDateMove(payload, newStart, newDue);
  if (!ok) return false;
  syncCalendarSectionTaskToServerAfterCalendarDateDrop(payload, ok);
  try {
    onAfterLocalSave?.({
      patchDateKeys: lpCollectCalendarTaskMoveDateKeys(
        oldStart,
        oldDue,
        newStart,
        newDue,
      ),
    });
  } catch (_) {}
  return true;
}

function clearSectionTaskCalendarRevertSnapshot(sectionId, taskId) {
  try {
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    const t = arr?.find((x) => (x.taskId || "") === taskId);
    if (!t) return;
    delete t._calPrevStart;
    delete t._calPrevDue;
    persistSectionTasksAndSchedule(obj);
  } catch (_) {}
}

function clearCustomSectionTaskCalendarRevertSnapshot(sectionId, taskId) {
  try {
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    const t = arr?.find((x) => (x.taskId || "") === taskId);
    if (!t) return;
    delete t._calPrevStart;
    delete t._calPrevDue;
    persistCustomSectionTasksAndSchedule(obj);
  } catch (_) {}
}

/**
 * 캘린더 막대 → 사이드바: 캘린더에 올리기 직전 스냅샷이 있으면 그때 날짜로 복구,
 * 없으면 시작·마감 비움(날짜 미배정).
 */
function revertTaskToTodoList(barData) {
  const revS =
    (barData.revertStartDate || barData._calPrevStart || "")
      .toString()
      .trim()
      .slice(0, 10) || "";
  const revD =
    (barData.revertDueDate || barData._calPrevDue || "")
      .toString()
      .trim()
      .slice(0, 10) || "";
  let ok = false;
  if (isCalendarFixedSectionKey(barData.sectionId) && barData.taskId) {
    ok = updateSectionTaskDates(barData.sectionId, barData.taskId, revS, revD);
    if (ok) {
      clearSectionTaskCalendarRevertSnapshot(barData.sectionId, barData.taskId);
    }
  } else if (barData.sectionId?.startsWith("custom-")) {
    ok = updateCustomSectionTaskDates(
      barData.sectionId,
      barData.taskId,
      revS,
      revD,
    );
    if (ok) {
      clearCustomSectionTaskCalendarRevertSnapshot(
        barData.sectionId,
        barData.taskId,
      );
    }
  }
  return ok;
}

/** 캘린더 막대 → 사이드바 드롭 시 날짜 제거(dataTransfer 식별용) */
const DRAG_TYPE_CALENDAR_SPAN = "application/x-lp-calendar-span";

function dataTransferHasType(dataTransfer, type) {
  const types = dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes(type);
}

/** 날짜 셀 dragover: 브라우저별 types 차이·막대 이동(application/json) 포함 */
function calendarDragTransferTypesAllowDrop(dataTransfer) {
  return (
    calendarDayIconDragAllowsDrop(dataTransfer) ||
    dataTransferHasType(dataTransfer, DRAG_TYPE_TODO_TO_CALENDAR) ||
    dataTransferHasType(dataTransfer, DRAG_TYPE_CALENDAR_SPAN) ||
    dataTransferHasType(dataTransfer, "application/json") ||
    dataTransferHasType(dataTransfer, "text/plain")
  );
}

/** 연간 뷰 — 해당 날짜 칸의 할일 점만 갱신(12개월 전체 renderYear 생략) */
function lpPatchAnnualDayCell(table, dateKey) {
  const key = String(dateKey || "").trim().slice(0, 10);
  if (!key || !(table instanceof HTMLElement)) return;
  const cell = table.querySelector(
    `.calendar-annual-cell[data-date-key="${key}"]:not(.calendar-annual-cell--pad)`,
  );
  if (!cell) return;
  const hasTasks = filterCalendarTasksForDisplay(getTasksForDate(key)).length > 0;
  let dot = cell.querySelector(".calendar-annual-cell-dot");
  if (hasTasks && !dot) {
    dot = document.createElement("span");
    dot.className = "calendar-annual-cell-dot";
    cell.appendChild(dot);
  } else if (!hasTasks && dot) {
    dot.remove();
  }
}

/** 월간 격자 — 스탬프만 바뀐 날짜 셀만 갱신(전체 renderCalendar 깜빡임 방지) */
function lpPatchCalendarMonthlyDayStamp(calendarGrid, dateKey, onAfterChange) {
  const key = String(dateKey || "").trim().slice(0, 10);
  if (!key || !(calendarGrid instanceof HTMLElement)) return;
  const cell = calendarGrid.querySelector(
    `.calendar-monthly-day[data-date="${key}"]`,
  );
  if (!cell) return;
  let dayIconsEl = cell.querySelector(".calendar-monthly-day-icons");
  if (!dayIconsEl) {
    dayIconsEl = document.createElement("div");
    dayIconsEl.className = "calendar-monthly-day-icons";
    dayIconsEl.setAttribute("aria-hidden", "true");
    const dayNum = cell.querySelector(".calendar-monthly-day-num");
    if (dayNum?.nextSibling) {
      cell.insertBefore(dayIconsEl, dayNum.nextSibling);
    } else {
      cell.appendChild(dayIconsEl);
    }
  }
  renderCalendarMonthlyDayIcons(dayIconsEl, key, {
    onAfterChange,
  });
  cell.classList.toggle("calendar-monthly-day--has-stamp", !dayIconsEl.hidden);
  const weekRow = cell.closest(".calendar-monthly-week");
  if (weekRow) {
    lpCalendarApplyWeekStampStripLayout(weekRow);
    weekRow._lpMonthlyBarLayoutRerun?.();
  }
}

function lpApplyCalendarDayIconDrop(
  e,
  targetDateKey,
  calendarGrid,
  patchDayStamp,
  refreshTodoList,
) {
  const payload = readCalendarDayIconDragPayload(e.dataTransfer);
  if (!payload) return false;
  e.preventDefault();
  e.stopPropagation();
  const from = payload.fromDateKey;
  const to = String(targetDateKey || "").trim().slice(0, 10);
  if (!from || !to || !payload.iconKey) return false;
  if (from === to) return true;
  if (!moveCalendarDayIconOnDate(from, to)) return false;
  try {
    patchDayStamp?.(from);
    patchDayStamp?.(to);
  } catch (_) {}
  try {
    refreshTodoList?.();
  } catch (_) {}
  void syncCalendarDayIconMove(from, to, payload.iconKey);
  return true;
}

/** drop: 사이드바 할일·캘린더 막대(DnD MIME이 다름) 동일 페이로드로 처리 */
function readCalendarDropPayloadJson(dataTransfer) {
  if (!dataTransfer) return "";
  return (
    dataTransfer.getData(DRAG_TYPE_TODO_TO_CALENDAR) ||
    dataTransfer.getData(DRAG_TYPE_CALENDAR_SPAN) ||
    dataTransfer.getData("application/json") ||
    ""
  );
}

function calendarSpanBarPayloadJson(b) {
  const revS = (b._calPrevStart || "").toString().slice(0, 10) || "";
  const revD = (b._calPrevDue || "").toString().slice(0, 10) || "";
  return JSON.stringify({
    name: b.name,
    dueDate: b.dueDate,
    startDate: b.startDate || "",
    taskId: b.taskId,
    sectionId: b.sectionId,
    done: !!b.done,
    itemType: b.itemType || "todo",
    revertStartDate: revS,
    revertDueDate: revD,
  });
}

/** 할일·일정 막대 클릭 → 할 일 목록과 동일 수정 모달(셀 빈 곳 클릭 추가 모달과 구분: stopPropagation) */
function lpCalendarClickHitsMonthlySpanBar(e) {
  return !!e.target?.closest?.(
    ".calendar-monthly-span-bar, .calendar-monthly-day-icon-btn",
  );
}

/** 날짜 칸 클릭이 막대 위면 할 일 추가 모달 대신 막대 수정으로 처리 */
function lpCalendarGuardCellClickFromMonthlyBar(e) {
  return lpCalendarClickHitsMonthlySpanBar(e);
}

function lpCalendarFindMonthlyDayCell(dateKey, barEl) {
  const key = String(dateKey || "").trim().slice(0, 10);
  if (!key) return null;
  const scope =
    barEl?.closest?.(".calendar-monthly-grid") ||
    barEl?.closest?.(".calendar-view") ||
    document;
  const cell = scope.querySelector(`.calendar-monthly-day[data-date="${key}"]`);
  return cell instanceof HTMLElement ? cell : null;
}

/** 여러 날짜 막대 클릭 — 터치/클릭 X 위치가 가리키는 요일 칸 */
function lpCalendarDayKeyFromSpanBarClick(bar, b, e) {
  if (b?.isSingleDay) {
    return String(b.dateKey || b.dueDate || "").slice(0, 10);
  }
  const weekRow = bar
    ?.closest?.(".calendar-monthly-week-wrap")
    ?.querySelector?.(".calendar-monthly-week");
  if (weekRow && e && Number.isFinite(e.clientX)) {
    const rowRect = weekRow.getBoundingClientRect();
    if (rowRect.width > 0) {
      const frac = (e.clientX - rowRect.left) / rowRect.width;
      const dayIdx = Math.min(6, Math.max(0, Math.floor(frac * 7)));
      const cell = weekRow.querySelectorAll(".calendar-monthly-day")[dayIdx];
      const dk = String(cell?.dataset?.date || "").slice(0, 10);
      if (dk) return dk;
    }
  }
  return String(b?.startDate || b?.dueDate || "").slice(0, 10);
}

function lpAttachCalendarBarOpenTodoEdit(
  bar,
  b,
  renderCalendar,
  refreshTodoList,
  patchDayStamp = null,
) {
  const sid = String(b.sectionId || "").trim();
  const tid = String(b.taskId || "").trim();
  if (!tid || !sid) return;
  bar.setAttribute("role", "button");
  bar.tabIndex = 0;
  let suppressClickAfterDrag = false;
  bar.addEventListener("dragstart", () => {
    suppressClickAfterDrag = true;
  });
  bar.addEventListener("dragend", () => {
    requestAnimationFrame(() => {
      suppressClickAfterDrag = false;
    });
  });
  const openEdit = (e) => {
    if (suppressClickAfterDrag) return;
    e.preventDefault();
    e.stopPropagation();
    /* 모바일·데스크탑·3분할 공통: 날짜 목록 모달 먼저 → 항목 클릭 시 수정 */
    const dateKey = lpCalendarDayKeyFromSpanBarClick(bar, b, e);
    const cell = lpCalendarFindMonthlyDayCell(dateKey, bar);
    if (cell && dateKey) {
      lpOpenCalendarMonthlyDayActionBubble(
        cell,
        dateKey,
        (meta) => {
          try {
            renderCalendar?.(meta);
          } catch (_) {}
          try {
            refreshTodoList?.();
          } catch (_) {}
        },
        {
          onAfterStampChange: () => {
            try {
              patchDayStamp?.(dateKey);
            } catch (_) {}
            try {
              refreshTodoList?.();
            } catch (_) {}
          },
        },
      );
      return;
    }
    lpOpenCalendarTaskEdit(b, {
      selectionEl: bar,
      onAfterApply: (applyMeta) => {
        lpCalendarHandleTaskEditAfterApply(applyMeta, (meta) => {
          try {
            renderCalendar?.(meta);
          } catch (_) {}
          try {
            refreshTodoList?.();
          } catch (_) {}
        });
      },
    });
  };
  bar.addEventListener("click", openEdit);
  bar.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      openEdit(e);
    }
  });
}

function bindCalendarSpanBarDragHandlers(bar, b) {
  const canDrag =
    (b.isSingleDay && b.dueDate) ||
    (!b.isSingleDay && b.startDate && b.dueDate);
  if (!canDrag) return;
  bar.draggable = true;
  bar.classList.add("calendar-monthly-span-bar--draggable");
  bar.addEventListener("dragstart", (e) => {
    e.dataTransfer.effectAllowed = "move";
    const json = calendarSpanBarPayloadJson(b);
    e.dataTransfer.setData(DRAG_TYPE_CALENDAR_SPAN, json);
    e.dataTransfer.setData("application/json", json);
    e.dataTransfer.setData("text/plain", b.name || "");
    bar.classList.add("calendar-monthly-span-bar--dragging");
  });
  bar.addEventListener("dragend", () => {
    bar.classList.remove("calendar-monthly-span-bar--dragging");
  });
}

function getCustomSectionTasksForDate(dateKey) {
  const out = [];
  try {
    const obj = readCustomSectionTasksObject();
    getCustomSections().forEach((sec) => {
      const arr = obj[sec.id];
      if (!Array.isArray(arr)) return;
      tasksForCalendarSameDayInStorageOrder(arr, dateKey).forEach((t) =>
        out.push({
          name: t.name,
          startDate: (t.startDate || "").slice(0, 10),
          dueDate: (t.dueDate || "").slice(0, 10),
          startTime: t.startTime || "",
          endTime: t.endTime || "",
          sectionId: sec.id,
          sectionLabel: sec.label || sec.id,
          itemType: t.itemType || "todo",
          done: !!t.done,
          isCalendarDiary: !!t.isCalendarDiary,
          taskId: t.taskId || "",
          eisenhower: (t.eisenhower || "").trim() || "",
          classification: "",
          _calPrevStart: (t._calPrevStart || "").toString().slice(0, 10) || "",
          _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
          serverUpdatedAt: String(t.serverUpdatedAt || "").trim(),
          ...(Number.isFinite(Number(t._calCellTouchMs))
            ? { _calCellTouchMs: Number(t._calCellTouchMs) }
            : {}),
        }),
      );
    });
  } catch (_) {}
  return out;
}

function getTasksForDate(dateKey, excludeSpanningTasks = false) {
  const sectionTasks = getSectionTasksForDate(dateKey);
  const customTasks = getCustomSectionTasksForDate(dateKey);
  let tasks = [...sectionTasks, ...customTasks];
  if (excludeSpanningTasks) {
    tasks = tasks.filter((t) => !calendarTaskIsMultiDayDateSpan(t));
  }
  /* 캘린더 그리드에는 일기 포함(표시는 CSS). 목록 모달은 getAllTasksForDateDisplay 에서 필터 */
  return tasks;
}

function getAllTasksForDateDisplay(dateKey) {
  const singleDay = orderSingleDayTasksForMonthlyBarStack(
    getTasksForDate(dateKey, false).filter(
      (t) => !calendarTaskIsMultiDayDateSpan(t),
    ),
  );
  const rangeTasks = getAllTasksWithDateRange().filter((t) => {
    const s = (t.startDate || "").slice(0, 10);
    const d = (t.dueDate || "").slice(0, 10);
    return s && d && s <= dateKey && dateKey <= d;
  });
  const seen = new Set();
  const merged = [...singleDay, ...rangeTasks].filter((t) => {
    const id =
      (t.taskId || t.name || "") + (t.startDate || "") + (t.dueDate || "");
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return filterCalendarTasksForDisplay(merged);
}

function getAllTasksWithDateRange() {
  const sectionRange = getSectionTasksWithDateRange();
  const customRange = [];
  try {
    const obj = readCustomSectionTasksObject();
    getCustomSections().forEach((sec) => {
      const arr = obj[sec.id];
      if (!Array.isArray(arr)) return;
      arr
        .filter(
          (t) =>
            (t.name || "").trim() !== "" &&
            (t.startDate || "").slice(0, 10) &&
            (t.dueDate || "").slice(0, 10) &&
            calendarTaskIsMultiDayDateSpan(t),
        )
        .forEach((t) =>
          customRange.push({
            name: t.name,
            startDate: (t.startDate || "").slice(0, 10),
            dueDate: (t.dueDate || "").slice(0, 10),
            startTime: t.startTime || "",
            endTime: t.endTime || "",
            sectionId: sec.id,
            sectionLabel: sec.label || sec.id,
            itemType: t.itemType || "todo",
            done: !!t.done,
            isCalendarDiary: !!t.isCalendarDiary,
            taskId: t.taskId || "",
            eisenhower: (t.eisenhower || "").trim() || "",
            classification: "",
            _calPrevStart:
              (t._calPrevStart || "").toString().slice(0, 10) || "",
            _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
          }),
        );
    });
  } catch (_) {}
  return [...sectionRange, ...customRange];
}

/**
 * 세션 섹션 할일 + `calendar_section_tasks` upsert (날짜 칸 버블 전용).
 */
function addSectionTodoFromCalendarBubble(
  startYmd,
  dueYmd,
  name,
  opts = {},
) {
  const sid = TODO_UNIFIED_SECTION_KEY;
  const start = String(startYmd || "")
    .trim()
    .slice(0, 10);
  const due = String(dueYmd || "")
    .trim()
    .slice(0, 10);
  const todoName = String(name || "").trim();
  const isCalendarDiary = !!opts.isCalendarDiary;
  if (!due || !todoName || !isCalendarFixedSectionKey(sid)) return false;
  if (start && start > due) return false;
  const it = "todo";
  const taskId = newTaskId();
  if (!taskId) return false;
  try {
    const obj = readSectionTasksObject();
    if (!obj[sid]) obj[sid] = [];
    const arr = obj[sid];
    const sortOrder = arr.length;
    const touch = Date.now();
    arr.push({
      taskId,
      name: todoName,
      startDate: start,
      dueDate: due,
      startTime: "",
      endTime: "",
      done: false,
      itemType: it,
      isCalendarDiary,
      serverUpdatedAt: new Date(touch).toISOString(),
      _calCellTouchMs: touch,
    });
    persistSectionTasksAndSchedule(obj);
    const task = {
      taskId,
      name: todoName,
      startDate: start,
      dueDate: due,
      startTime: "",
      endTime: "",
      eisenhower: "",
      done: false,
      itemType: it,
      isCalendarDiary,
      reminderDate: "",
      reminderTime: "",
    };
    markTodoAddPendingServerLog({ taskId, sectionId: sid });
    void upsertCalendarSectionTaskDirectFromModal({
      task,
      sectionKey: sid,
      isCustom: false,
      sortOrder,
    });
    return true;
  } catch (_) {}
  return false;
}

/** 할일 추가 버블(날짜 칸 클릭): document 바깥 클릭 시 닫기 — 리스너 정리용 */
let _calendarEventBubbleOutsideHandler = null;

function detachCalendarEventBubbleOutsideListener() {
  if (!_calendarEventBubbleOutsideHandler) return;
  try {
    document.removeEventListener(
      "pointerdown",
      _calendarEventBubbleOutsideHandler,
    );
  } catch (_) {}
  _calendarEventBubbleOutsideHandler = null;
}

function createCalendarEventBubble(cellRect, dateKey, onSave, onClose) {
  void cellRect;
  const initialYmd = String(dateKey || "")
    .trim()
    .slice(0, 10);
  const dateLabel = initialYmd.replace(/-/g, ". ");
  detachCalendarEventBubbleOutsideListener();
  closeDuplicateTodoAddModals();
  document
    .querySelectorAll(
      ".calendar-event-bubble, .calendar-event-add-modal, .calendar-day-expand-overlay",
    )
    .forEach((el) => el.remove());

  const modal = document.createElement("div");
  modal.className =
    "time-task-setup-modal time-add-task-modal calendar-event-add-modal";
  modal.innerHTML = `
    <div class="time-task-setup-backdrop"></div>
    <div class="time-task-setup-panel time-add-task-panel">
      <div class="time-task-setup-header">
        <h3 class="time-task-setup-title">${dateLabel}</h3>
        <button type="button" class="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div class="time-task-setup-body">
        <div class="time-task-log-field">
          <div class="calendar-event-name-emoji-label-row">
            <label for="calendar-event-name-input">할일 / 일정 이름</label>
            ${buildCalendarEventNameEmojiQuickMarkup()}
          </div>
          <input
            type="text"
            id="calendar-event-name-input"
            name="calendar-event-name"
            class="time-add-task-name"
            placeholder="할일/일정 입력"
            maxlength="500"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </div>
        <div class="time-task-log-field calendar-diary-check-field">
          <label class="calendar-diary-check-label">
            <input type="checkbox" class="calendar-diary-check" data-calendar-diary-check />
            <span>캘린더일기</span>
          </label>
        </div>
        <div class="time-task-log-field">
          <label>시작일</label>
          <div class="time-task-log-date-native-wrap">
            <input type="date" class="todo-task-edit-start" aria-label="시작일" value="${initialYmd}" />
            <span class="time-task-log-date-overlay" aria-hidden="true"></span>
          </div>
        </div>
        <div class="time-task-log-field">
          <label>마감일</label>
          <div class="time-task-log-date-native-wrap">
            <input type="date" class="todo-task-edit-due" aria-label="마감일" value="${initialYmd}" />
            <span class="time-task-log-date-overlay" aria-hidden="true"></span>
          </div>
        </div>
      </div>
      <div class="time-task-log-footer">
        <button type="button" class="time-add-task-submit">추가</button>
      </div>
    </div>
  `;

  const closeBtn = modal.querySelector(".time-task-setup-close");
  const backdrop = modal.querySelector(".time-task-setup-backdrop");
  const confirmBtn = modal.querySelector(".time-add-task-submit");
  const nameInput = modal.querySelector(".time-add-task-name");
  const diaryCheck = modal.querySelector("[data-calendar-diary-check]");
  const startInput = modal.querySelector(".todo-task-edit-start");
  const dueInput = modal.querySelector(".todo-task-edit-due");
  initModalStandardDateFields(modal);
  wireCalendarEventNameEmojiQuick(modal, nameInput);

  function close() {
    detachCalendarEventBubbleOutsideListener();
    modal.remove();
    syncBodyOverflowAfterModalClose();
    onClose?.();
  }

  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  let saving = false;
  function runSave() {
    if (saving) return;
    const name = (nameInput?.value || "").trim();
    const startDate = (startInput?.value || "").trim().slice(0, 10);
    const dueDate = (dueInput?.value || "").trim().slice(0, 10);
    if (!name) {
      void showAlertModal({ message: "할일/일정 이름을 입력해 주세요." });
      return;
    }
    if (!dueDate) {
      void showAlertModal({ message: "마감일을 입력해 주세요." });
      return;
    }
    if (startDate && startDate > dueDate) {
      void showAlertModal({
        message: "시작일은 마감일보다 이전이어야 합니다.",
      });
      return;
    }
    saving = true;
    try {
      if (
        !addSectionTodoFromCalendarBubble(startDate, dueDate, name, {
          isCalendarDiary: !!diaryCheck?.checked,
        })
      ) {
        void showAlertModal({
        message: "할 일을 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      });
        return;
      }
      onSave?.({
        name,
        startDate,
        dueDate,
        sectionId: TODO_UNIFIED_SECTION_KEY,
        itemType: "todo",
        patchDateKeys: lpCollectCalendarTaskMoveDateKeys(
          "",
          "",
          startDate,
          dueDate,
        ),
      });
      close();
    } finally {
      saving = false;
    }
  }

  confirmBtn?.addEventListener("click", runSave);

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
  wireModalEnterToConfirm(modal, confirmBtn);

  return modal;
}

/** 기본 행 높이는 이 개수(3개) 분량, 그 이상이면 행을 늘려 전부 표시 */
const MAX_VISIBLE_BARS_PER_DAY = 3;

/** 이전 날짜 확대 버블의 document 클릭 리스너 제거(연간 연속 호버 등으로 close 미경유 DOM 제거 시 누수 방지) */
let _calendarDayExpandOutsideHandler = null;

/** 월간·1주 날짜 칸 클릭 — 할일/아이콘 버튼 패널(빈 칸·할일 목록) */
function lpOpenCalendarMonthlyDayActionBubble(
  cell,
  dateKey,
  onAfterChange,
  opts = {},
) {
  const key = String(dateKey || "").trim().slice(0, 10);
  if (!key || !(cell instanceof HTMLElement)) return;
  const rect = cell.getBoundingClientRect();
  const tasks = getAllTasksForDateDisplay(key);
  const refresh = (meta) => {
    try {
      onAfterChange?.(meta);
    } catch (_) {}
  };
  createCalendarDayExpandBubble(rect, key, tasks, () => {}, {
    positionBelow: true,
    onAfterTaskEdit: refresh,
    onAfterStampChange: opts.onAfterStampChange ?? null,
    onAdd: () => {
      createCalendarEventBubble(rect, key, refresh, () => {});
    },
  });
}

function createCalendarDayExpandBubble(
  cellRect,
  dateKey,
  tasks,
  onClose,
  options = {},
) {
  const {
    positionBelow = false,
    onAdd = null,
    /** 할일·일정 항목에서 수정 모달 저장/삭제 후 그리드 갱신 */
    onAfterTaskEdit = null,
    /** 스탬프만 추가·변경·삭제 — 해당 날짜 셀만 갱신(전체 renderCalendar 생략) */
    onAfterStampChange = null,
    /** 연간 뷰 등: × 숨김 */
    hideCloseButton = false,
    /** false면 바깥 클릭으로 닫지 않음(호버 전용) */
    dismissOnOutsideClick = false,
    /** 연간 호버 시 모바일 전체 오버레이 생략 */
    useMobileOverlay = true,
  } = options;
  const isMobile = window.matchMedia("(max-width: 46rem)").matches;
  const todayYmd = timeLedgerLocalTodayYmd();
  if (_calendarDayExpandOutsideHandler) {
    document.removeEventListener("click", _calendarDayExpandOutsideHandler);
    _calendarDayExpandOutsideHandler = null;
  }
  detachCalendarEventBubbleOutsideListener();
  document
    .querySelectorAll(
      ".calendar-event-bubble, .calendar-event-add-modal, .calendar-day-expand-overlay",
    )
    .forEach((el) => el.remove());
  let overlayEl = null;
  if (isMobile && useMobileOverlay) {
    overlayEl = document.createElement("div");
    overlayEl.className = "calendar-day-expand-overlay";
    document.body.appendChild(overlayEl);
  }
  const bubble = document.createElement("div");
  bubble.className =
    "calendar-event-bubble calendar-day-expand-bubble" +
    (isMobile ? " calendar-day-expand-bubble--mobile" : "") +
    (hideCloseButton ? " calendar-day-expand-bubble--no-close" : "");
  const taskItems = tasks
    .map((t) => {
      const isPast = isPastCalendarTask(t, todayYmd);
      const pastCls = isPast ? " is-past" : "";
      const doneCls = t.done ? " is-completed" : "";
      const nameHtml = escapeHtml(t.name || "");
      return `
    <div class="calendar-day-expand-item${doneCls}${pastCls}" data-done="${!!t.done}">
      <div class="calendar-day-expand-main">
        <span class="calendar-day-expand-text">${nameHtml}</span>
        ${t.startTime || t.endTime ? `<span class="calendar-day-expand-time">${[t.startTime, t.endTime].filter(Boolean).join(" ~ ")}</span>` : ""}
      </div>
    </div>
  `;
    })
    .join("");
  const addActionsHtml =
    onAdd || dateKey
      ? `<div class="calendar-day-expand-actions">${
          onAdd
            ? '<button type="button" class="calendar-day-expand-add-btn">할일/일정 추가</button>'
            : ""
        }${
          dateKey
            ? `<div class="calendar-day-expand-actions-side"><span class="calendar-day-expand-icon-mount" data-calendar-day-icon-mount></span></div>`
            : ""
        }</div>`
      : "";
  const closeBtnHtml = hideCloseButton
    ? ""
    : '<button type="button" class="calendar-event-bubble-close" title="닫기">×</button>';
  bubble.innerHTML = `
    <div class="calendar-event-bubble-body">
      <div class="calendar-event-bubble-header">
        <span class="calendar-event-bubble-date">${dateKey.replace(/-/g, ". ")}</span>
        ${closeBtnHtml}
      </div>
      <div class="calendar-day-expand-list">${taskItems || "<div class='calendar-day-expand-empty'>할일 / 일정 없음</div>"}</div>
      ${addActionsHtml}
    </div>
  `;

  tasks.forEach((t, i) => {
    const itemEl = bubble.querySelectorAll(".calendar-day-expand-item")[i];
    if (!itemEl) return;
    const tid = String(t.taskId || "").trim();
    const sid = String(t.sectionId || "").trim();
    if (!tid || !sid) return;
    itemEl.addEventListener("click", (e) => {
      if (
        e.target.closest(".calendar-event-bubble-close") ||
        e.target.closest(".calendar-day-expand-add-btn") ||
        e.target.closest(".calendar-day-expand-icon-btn")
      )
        return;
      e.stopPropagation();
      try {
        close();
      } catch (_) {}
      lpOpenCalendarTaskEdit(t, {
        selectionEl: itemEl,
        onAfterApply: (applyMeta) => {
          lpCalendarHandleTaskEditAfterApply(applyMeta, onAfterTaskEdit);
        },
      });
    });
  });

  let outsideClickHandler = null;
  const close = () => {
    if (outsideClickHandler) {
      document.removeEventListener("click", outsideClickHandler);
      outsideClickHandler = null;
      _calendarDayExpandOutsideHandler = null;
    }
    bubble.remove();
    if (overlayEl) overlayEl.remove();
    onClose?.();
  };

  if (!hideCloseButton) {
    bubble
      .querySelector(".calendar-event-bubble-close")
      ?.addEventListener("click", close);
  }
  if (onAdd) {
    bubble
      .querySelector(".calendar-day-expand-add-btn")
      ?.addEventListener("click", () => {
        close();
        onAdd();
      });
  }
  const dayIconMount = bubble.querySelector("[data-calendar-day-icon-mount]");
  if (dayIconMount && dateKey) {
    mountCalendarDayExpandIconBtn(dayIconMount, dateKey, {
      onClose: close,
      onAfterChange: () => {
        try {
          if (onAfterStampChange) {
            onAfterStampChange();
          } else {
            onAfterTaskEdit?.();
          }
        } catch (_) {}
      },
    });
  }
  if (dismissOnOutsideClick) {
    setTimeout(() => {
      outsideClickHandler = function outside(e) {
        if (
          !bubble.contains(e.target) &&
          !(overlayEl && overlayEl.contains(e.target))
        ) {
          document.removeEventListener("click", outsideClickHandler);
          outsideClickHandler = null;
          _calendarDayExpandOutsideHandler = null;
          close();
        }
      };
      _calendarDayExpandOutsideHandler = outsideClickHandler;
      document.addEventListener("click", outsideClickHandler);
    }, 0);
  }
  if (overlayEl && dismissOnOutsideClick) {
    overlayEl.addEventListener("click", () => {
      close();
    });
  }

  const BUBBLE_PADDING = 16;
  const BUBBLE_MIN_W = 280;
  let top = positionBelow
    ? cellRect.bottom + 4
    : Math.min(cellRect.top, window.innerHeight - 320);
  if (isMobile) {
    Object.assign(bubble.style, {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: "min(22rem, calc(100vw - 1.25rem))",
      maxHeight: "min(85vh, 520px)",
      overflowY: "auto",
      zIndex: "1002",
    });
  } else {
    const left = Math.max(
      BUBBLE_PADDING,
      Math.min(cellRect.left, window.innerWidth - BUBBLE_MIN_W - BUBBLE_PADDING),
    );
    Object.assign(bubble.style, {
      position: "fixed",
      left: `${left}px`,
      top: `${Math.max(BUBBLE_PADDING, top)}px`,
      maxHeight: `min(70vh, ${Math.max(180, window.innerHeight - BUBBLE_PADDING * 2)}px)`,
      overflowY: "auto",
      zIndex: "1002",
    });
  }

  document.body.appendChild(bubble);

  if (!isMobile) {
    const br = bubble.getBoundingClientRect();
    const bubbleHeight = br.height;
    const bubbleWidth = br.width || BUBBLE_MIN_W;
    let nextTop = positionBelow ? cellRect.bottom + 4 : top;
    if (
      positionBelow &&
      nextTop + bubbleHeight > window.innerHeight - BUBBLE_PADDING
    ) {
      nextTop = cellRect.top - bubbleHeight - 4;
    }
    if (nextTop < BUBBLE_PADDING) {
      nextTop = BUBBLE_PADDING;
    }
    if (nextTop + bubbleHeight > window.innerHeight - BUBBLE_PADDING) {
      nextTop = Math.max(
        BUBBLE_PADDING,
        window.innerHeight - bubbleHeight - BUBBLE_PADDING,
      );
    }
    let nextLeft = Math.max(
      BUBBLE_PADDING,
      Math.min(
        cellRect.left,
        window.innerWidth - bubbleWidth - BUBBLE_PADDING,
      ),
    );
    bubble.style.top = `${nextTop}px`;
    bubble.style.left = `${nextLeft}px`;
    bubble.style.maxHeight = `${Math.max(
      160,
      window.innerHeight - nextTop - BUBBLE_PADDING,
    )}px`;
  }

  return { bubble, close };
}

function createCalendarBarRevertBubble(
  clientX,
  clientY,
  barData,
  onSave,
  onClose,
) {
  detachCalendarEventBubbleOutsideListener();
  document
    .querySelectorAll(".calendar-event-bubble")
    .forEach((el) => el.remove());
  const bubble = document.createElement("div");
  bubble.className = "calendar-event-bubble";
  bubble.innerHTML = `
    <div class="calendar-event-bubble-body">
      <div class="calendar-event-bubble-header">
        <span class="calendar-event-bubble-date">${escapeHtml(barData.name || "")}</span>
        <button type="button" class="calendar-event-bubble-close" title="닫기">×</button>
      </div>
      <p class="calendar-bar-revert-desc">캘린더에 올리기 전 날짜로 되돌리거나, 이전에 날짜가 없었으면 미배정으로 돌아갑니다.</p>
      <button type="button" class="calendar-event-bubble-revert calendar-bar-revert-btn">되돌려놓기</button>
    </div>
  `;

  const close = () => {
    bubble.remove();
    onClose?.();
  };

  bubble
    .querySelector(".calendar-event-bubble-close")
    .addEventListener("click", close);

  bubble
    .querySelector(".calendar-bar-revert-btn")
    .addEventListener("click", () => {
      if (revertTaskToTodoList(barData)) {
        onSave?.({
          patchDateKeys: lpCollectCalendarTaskMoveDateKeys(
            barData.startDate,
            barData.dueDate,
            "",
            "",
          ),
        });
        close();
      }
    });

  Object.assign(bubble.style, {
    position: "fixed",
    left: `${Math.min(clientX, window.innerWidth - 260)}px`,
    top: `${Math.min(clientY, window.innerHeight - 180)}px`,
    zIndex: 1001,
  });

  document.body.appendChild(bubble);
  return bubble;
}

function createCalendarBarDateEditBubble(
  clientX,
  clientY,
  barData,
  onSave,
  onClose,
) {
  detachCalendarEventBubbleOutsideListener();
  document
    .querySelectorAll(".calendar-event-bubble")
    .forEach((el) => el.remove());
  const bubble = document.createElement("div");
  bubble.className = "calendar-event-bubble";
  const startVal = (barData.startDate || "").slice(0, 10);
  const dueVal = (barData.dueDate || "").slice(0, 10);
  const hasRange = startVal && dueVal && startVal !== dueVal;
  bubble.innerHTML = `
    <div class="calendar-event-bubble-body">
      <div class="calendar-event-bubble-header">
        <span class="calendar-event-bubble-date">${escapeHtml(barData.name || "")}</span>
        <button type="button" class="calendar-event-bubble-close" title="닫기">×</button>
      </div>
      <div class="calendar-bar-date-edit-row">
        <label class="calendar-event-bubble-label">시작일</label>
        <div class="calendar-bar-date-edit-input-wrap">
          <input type="date" class="calendar-bar-date-edit-input" name="calendar-bar-date-start" data-field="start" value="${startVal}" />
          <button type="button" class="calendar-bar-date-edit-clear" title="시작일 제거 (단일일로 변경)">×</button>
        </div>
      </div>
      <div class="calendar-bar-date-edit-row">
        <label class="calendar-event-bubble-label">마감일</label>
        <input type="date" class="calendar-bar-date-edit-input" name="calendar-bar-date-due" data-field="due" value="${dueVal}" />
      </div>
      <button type="button" class="calendar-event-bubble-save">저장</button>
      ${hasRange ? '<button type="button" class="calendar-event-bubble-revert calendar-bar-revert-btn">되돌려놓기</button>' : ""}
    </div>
  `;

  const close = () => {
    bubble.remove();
    onClose?.();
  };

  bubble
    .querySelector(".calendar-event-bubble-close")
    .addEventListener("click", close);

  const startInput = bubble.querySelector('input[data-field="start"]');
  const dueInput = bubble.querySelector('input[data-field="due"]');
  bubble
    .querySelector(".calendar-bar-date-edit-clear")
    ?.addEventListener("click", () => {
      if (startInput) {
        startInput.value = "";
        if (dueInput) dueInput.min = "";
      }
    });
  startInput?.addEventListener("change", () => {
    if (dueInput && startInput.value) dueInput.min = startInput.value;
  });
  dueInput?.addEventListener("change", () => {
    if (startInput && dueInput.value) startInput.max = dueInput.value;
  });
  if (startVal && dueInput) dueInput.min = startVal;
  if (dueVal && startInput) startInput.max = dueVal;

  bubble
    .querySelector(".calendar-event-bubble-save")
    .addEventListener("click", () => {
      const newStart = (startInput?.value || "").trim().slice(0, 10);
      const newDue = (dueInput?.value || "").trim().slice(0, 10);
      if (!newDue) {
        void showAlertModal({ message: "마감일을 입력해 주세요." });
        return;
      }
      if (newStart && newStart > newDue) {
        void showAlertModal({
        message: "시작일은 마감일보다 이전이어야 합니다.",
      });
        return;
      }
      let ok = false;
      if (isCalendarFixedSectionKey(barData.sectionId) && barData.taskId) {
        ok = updateSectionTaskDates(
          barData.sectionId,
          barData.taskId,
          newStart,
          newDue,
        );
      } else if (barData.sectionId?.startsWith("custom-")) {
        ok = updateCustomSectionTaskDates(
          barData.sectionId,
          barData.taskId,
          newStart,
          newDue,
        );
        if (!ok && (barData.name || "").trim()) {
          ok = addCalendarTodoToCustomSection(barData.sectionId, {
            taskId: barData.taskId,
            name: barData.name,
            startDate: newStart,
            dueDate: newDue,
            done: !!barData.done,
            itemType: barData.itemType || "todo",
          });
        }
      }
      if (ok) {
        onSave?.({
          patchDateKeys: lpCollectCalendarTaskMoveDateKeys(
            barData.startDate,
            barData.dueDate,
            newStart,
            newDue,
          ),
        });
        close();
      }
    });

  const revertBtn = bubble.querySelector(".calendar-bar-revert-btn");
  if (revertBtn) {
    revertBtn.addEventListener("click", () => {
      if (revertTaskToTodoList(barData)) {
        onSave?.({
          patchDateKeys: lpCollectCalendarTaskMoveDateKeys(
            barData.startDate,
            barData.dueDate,
            "",
            "",
          ),
        });
        close();
      }
    });
  }

  Object.assign(bubble.style, {
    position: "fixed",
    left: `${Math.min(clientX, window.innerWidth - 260)}px`,
    top: `${Math.min(clientY, window.innerHeight - 220)}px`,
    zIndex: 1001,
  });

  document.body.appendChild(bubble);
  return bubble;
}

function renderMonthlyView(tabsElement) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-subview-monthly";

  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth();

  const calendarSection = document.createElement("div");
  calendarSection.className = "calendar-monthly-main";

  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    calendarSection.appendChild(tabsWrapper);
  }

  const nav = document.createElement("div");
  nav.className = "calendar-monthly-nav";
  nav.innerHTML = `
    <span class="calendar-nav-date">
      <span class="calendar-nav-month"></span>
      <span class="calendar-nav-year"></span>
    </span>
    <div class="calendar-nav-controls">
      <button type="button" class="calendar-nav-prev" title="이전 달">&lt;</button>
      <button type="button" class="calendar-nav-today" title="오늘">오늘</button>
      ${calendarDiaryToggleMarkup()}
      <button type="button" class="calendar-nav-next" title="다음 달">&gt;</button>
    </div>
  `;

  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar-monthly-grid";

  function refreshTodoList() {}

  function pullTasksForVisibleMonth() {
    const { rangeStart, rangeEnd } = calendarPullRangeYmdForMonth(
      currentYear,
      currentMonth,
      21,
    );
    return pullCalendarSectionTasksFromSupabase({
      reason: "calendar_month_nav",
      subView: "calendar",
      rangeStart,
      rangeEnd,
    });
  }

  function schedulePullTasksForVisibleMonth() {
    void pullTasksForVisibleMonth().then((res) => {
      if (!res?.ok || res.skipped || !wrap.isConnected) return;
      try {
        refreshCalendarLocal();
      } catch (_) {}
    });
  }

  /** 할일·일정 추가·수정·삭제·드래그 직후 — pull 없이 로컬만 다시 그림(전체 깜빡임 완화) */
  function refreshCalendarLocal(opts = {}) {
    refreshTodoList();
    const refreshOpts = {
      softLocal: true,
      patchDateKeys: Array.isArray(opts.patchDateKeys)
        ? opts.patchDateKeys
        : undefined,
    };
    lpRunCalendarLayoutRefresh(
      wrap,
      () => {
        renderCalendar(refreshOpts);
        wrap._lpRememberCalendarGridPaintSig?.();
      },
      refreshOpts,
    );
  }

  function patchDayStamp(dateKey) {
    lpPatchCalendarMonthlyDayStamp(calendarGrid, dateKey, patchDayStamp);
    wrap._lpRememberCalendarGridPaintSig?.();
  }

  function renderCalendar(opts = {}) {
    lpRememberCalendarGridScrollTop(calendarGrid, !!opts.resetScroll);
    const softLocal = !!opts.softLocal;
    const patchDateKeys = Array.isArray(opts.patchDateKeys)
      ? opts.patchDateKeys
          .map((k) => String(k || "").trim().slice(0, 10))
          .filter(Boolean)
      : null;
    const patchKeySet =
      patchDateKeys && patchDateKeys.length > 0
        ? new Set(patchDateKeys)
        : null;
    const partialWeekPatch = !!patchKeySet;
    const grid = getCalendarGrid(currentYear, currentMonth);
    applyCalendarNavMonthLabel(
      lpCalendarNavQ(nav, wrap, ".calendar-nav-month"),
      currentMonth,
    );
    lpCalendarNavQ(nav, wrap, ".calendar-nav-year").textContent =
      String(currentYear);

    let layoutPass;
    if (partialWeekPatch) {
      calendarGrid
        .querySelectorAll(".calendar-monthly-week-wrap")
        .forEach((weekWrap) => {
          const dates = [
            ...weekWrap.querySelectorAll(".calendar-monthly-day[data-date]"),
          ]
            .map((cell) => String(cell.dataset.date || "").slice(0, 10))
            .filter(Boolean);
          if (dates.some((d) => patchKeySet.has(d))) weekWrap.remove();
        });
      layoutPass = lpBeginCalendarGridLayoutPass(calendarGrid, {
        keepVisible: true,
      });
    } else if (softLocal) {
      calendarGrid
        .querySelector(".calendar-monthly-weekdays")
        ?.remove();
      calendarGrid
        .querySelectorAll(".calendar-monthly-week-wrap")
        .forEach((weekWrap) => weekWrap.remove());
      layoutPass = lpBeginCalendarGridLayoutPass(calendarGrid, {
        keepVisible: true,
      });
    } else {
      calendarGrid.innerHTML = "";
      layoutPass = lpBeginCalendarGridLayoutPass(calendarGrid);
    }

    if (!partialWeekPatch) {
      const dayHeader = document.createElement("div");
      dayHeader.className = "calendar-monthly-weekdays";
      DAY_NAMES.forEach((name) => {
        const cell = document.createElement("div");
        cell.className = "calendar-monthly-weekday";
        cell.textContent = name;
        dayHeader.appendChild(cell);
      });
      calendarGrid.appendChild(dayHeader);
    }

    const todayKey = formatDateKey(new Date());
    const gridSpan = calendarPullRangeYmdForMonthGrid(grid, 0);
    const rangeTasks = getAllTasksWithDateRange().filter((t) =>
      calendarSectionTaskOverlapsYmdRange(
        t,
        gridSpan.rangeStart,
        gridSpan.rangeEnd,
      ),
    );

    grid.forEach((week) => {
      const weekDateKeys = week
        .map((d) => (d ? formatDateKey(d) : ""))
        .filter(Boolean);
      if (
        patchKeySet &&
        !weekDateKeys.some((dateKey) => patchKeySet.has(dateKey))
      ) {
        return;
      }
      const weekWrap = document.createElement("div");
      weekWrap.className = "calendar-monthly-week-wrap";
      const weekRow = document.createElement("div");
      weekRow.className = "calendar-monthly-week";
      const firstDayKey = weekDateKeys[0] || "";
      const lastDayKey = weekDateKeys[weekDateKeys.length - 1] || "";

      week.forEach((date) => {
        const cell = document.createElement("div");
        cell.className = "calendar-monthly-day";
        if (!date) {
          cell.classList.add("empty");
          weekRow.appendChild(cell);
          return;
        }
        const key = formatDateKey(date);
        cell.dataset.date = key;
        const dayNum = document.createElement("div");
        dayNum.className = "calendar-monthly-day-num";
        dayNum.textContent = date.getDate();

        const isCurrentMonth = date.getMonth() === currentMonth;
        if (!isCurrentMonth) cell.classList.add("other-month");
        if (key === todayKey) cell.classList.add("today");
        if (date.getDay() === 0) cell.classList.add("sun");
        if (date.getDay() === 6) cell.classList.add("sat");

        cell.appendChild(dayNum);
        const dayIconsEl = document.createElement("div");
        dayIconsEl.className = "calendar-monthly-day-icons";
        dayIconsEl.setAttribute("aria-hidden", "true");
        renderCalendarMonthlyDayIcons(dayIconsEl, key, {
          onAfterChange: () => {
            patchDayStamp(key);
            refreshTodoList();
          },
        });
        cell.classList.toggle("calendar-monthly-day--has-stamp", !dayIconsEl.hidden);
        cell.appendChild(dayIconsEl);
        const entriesEl = document.createElement("div");
        entriesEl.className = "calendar-monthly-day-entries";
        cell.appendChild(entriesEl);

        cell.style.cursor = "pointer";
        cell.addEventListener("click", (e) => {
          if (
            e.target.closest(
              ".calendar-event-bubble, .calendar-event-add-modal, .calendar-day-expand-overlay",
            )
          ) {
            return;
          }
          if (lpCalendarGuardCellClickFromMonthlyBar(e)) return;
          e.stopPropagation();
          e.preventDefault();
          lpOpenCalendarMonthlyDayActionBubble(cell, key, refreshCalendarLocal, {
            onAfterStampChange: () => {
              patchDayStamp(key);
              refreshTodoList();
            },
          });
        });
        cell.addEventListener("dragover", (e) => {
          if (calendarDragTransferTypesAllowDrop(e.dataTransfer)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            cell.classList.add("calendar-day-drag-over");
          }
        });
        cell.addEventListener("dragleave", () => {
          cell.classList.remove("calendar-day-drag-over");
        });
        cell.addEventListener("drop", (e) => {
          cell.classList.remove("calendar-day-drag-over");
          if (
            lpApplyCalendarDayIconDrop(
              e,
              key,
              calendarGrid,
              patchDayStamp,
              refreshTodoList,
            )
          ) {
            return;
          }
          const json = readCalendarDropPayloadJson(e.dataTransfer);
          if (!json) return;
          let payload;
          try {
            payload = JSON.parse(json);
          } catch (_) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          dateDebug("drop on day", {
            targetDate: key,
            name: payload?.name,
            sectionId: payload?.sectionId,
            taskId: payload?.taskId,
          });
          lpHandleCalendarTaskDropOnDate(key, payload, (meta) => {
            refreshCalendarLocal(meta);
          });
        });
        weekRow.appendChild(cell);
      });

      const barsEl = document.createElement("div");
      barsEl.className = "calendar-monthly-bars";
      const { BARS_TOP, BAR_HEIGHT, BOTTOM_PAD, ROW_GAP, WEEK_ROW_MIN } =
        lpCalendarWeekBarLayoutMetrics(weekRow);
      const baseBarTop = lpCalendarWeekBarBaseTopRem(weekRow, BARS_TOP);
      const allBars = [];
      const CELL_GAP = 3.5;
      orderSingleDayTasksForMonthlyBarStack(rangeTasks).forEach((t) => {
        const barStart = t.startDate > firstDayKey ? t.startDate : firstDayKey;
        const barEnd = t.dueDate < lastDayKey ? t.dueDate : lastDayKey;
        if (barStart > barEnd) return;
        const startIdx = weekDateKeys.indexOf(barStart);
        const endIdx = weekDateKeys.indexOf(barEnd);
        if (startIdx < 0 || endIdx < 0) return;
        const left = (startIdx / 7) * 100 + CELL_GAP / 7;
        const width = ((endIdx - startIdx + 1) / 7) * 100 - (CELL_GAP * 2) / 7;
        const baseColor = getSectionColor(t.sectionId);
        const color = withMoreTransparency(baseColor);
        const isFirstSegment = barStart === t.startDate;
        allBars.push({
          left,
          width,
          startIdx,
          endIdx,
          name: t.name,
          color,
          isSingleDay: false,
          isFirstSegment,
          itemType: t.itemType || "todo",
          done: !!t.done,
          taskId: t.taskId,
          sectionId: t.sectionId,
          startDate: t.startDate,
          dueDate: t.dueDate,
          isOverdueBar: calendarBarTaskIsOverdueTodo(t),
          isCalendarDiary: taskIsCalendarDiary(t),
          _calPrevStart: (t._calPrevStart || "").toString().slice(0, 10) || "",
          _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
        });
      });
      weekDateKeys.forEach((dateKey, dayIdx) => {
        orderSingleDayTasksForMonthlyBarStack(
          getTasksForDate(dateKey, true),
        ).forEach((t) => {
          const left = (dayIdx / 7) * 100 + CELL_GAP / 7;
          const width = (1 / 7) * 100 - (CELL_GAP * 2) / 7;
          const baseColor = getSectionColor(t.sectionId);
          const borderColor = todoQualifiesCalendarShortSpanBarAccent(
            t.startDate,
            t.dueDate || dateKey,
          )
            ? CALENDAR_SHORT_SPAN_BAR_HEX
            : timetableAccentTextColor(baseColor) || baseColor;
          allBars.push({
            left,
            width,
            name: t.name,
            borderColor,
            isSingleDay: true,
            dayIdx,
            dateKey,
            itemType: t.itemType || "todo",
            done: !!t.done,
            taskId: t.taskId,
            sectionId: t.sectionId,
            startDate: t.startDate || "",
            dueDate: t.dueDate || dateKey,
            isOverdueBar: calendarBarTaskIsOverdueTodo(t),
            isCalendarDiary: taskIsCalendarDiary(t),
            _calPrevStart:
              (t._calPrevStart || "").toString().slice(0, 10) || "",
            _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
          });
        });
      });
      lpCalendarAssignMonthlyBarLayout(allBars);
      const rangeBarsOnly = allBars.filter((b) => !b.isSingleDay);
      /* 막대 줄 수에 맞춰 해당 주 행만 높이 확장(빈 주는 최소 높이만) */
      allBars.forEach((b) => {
        b.isOverflow = false;
      });
      const rowsNeeded = lpCalendarMonthlyWeekStackSlotCount(
        allBars,
        weekDateKeys.length,
      );
      weekRow.style.minHeight = `${lpCalendarMonthlyWeekRowTargetMinHeightRem(
        baseBarTop,
        rowsNeeded,
        BAR_HEIGHT,
        ROW_GAP,
        BOTTOM_PAD,
        WEEK_ROW_MIN,
      )}rem`;
      const barsWithRow = allBars;
      const calendarBarTodayYmd = timeLedgerLocalTodayYmd();
      barsWithRow.forEach((b) => {
        const bar = document.createElement("div");
        bar.className =
          "calendar-monthly-span-bar" +
          (b.isSingleDay
            ? " calendar-monthly-span-bar--todo"
            : " calendar-monthly-span-bar--range") +
          (b.isOverflow ? " calendar-monthly-span-bar--overflow" : "") +
          (b.isOverdueBar ? " calendar-monthly-span-bar--overdue" : "") +
          ((b.itemType || "todo").toLowerCase() !== "todo"
            ? " calendar-monthly-span-bar--schedule-strip"
            : "");
        bar.title = b.name;
        const barStyleVars = b.isSingleDay
          ? `--bar-border:${b.borderColor || CALENDAR_SHORT_SPAN_BAR_HEX}`
          : `--bar-bg:${b.color || ""}`;
        const topRem = b.isSingleDay
          ? lpCalendarMonthlyEstimateSingleDayBarTopRem(
              baseBarTop,
              rangeBarsOnly,
              b.dayIdx,
              b.localRow || 0,
              BAR_HEIGHT,
              ROW_GAP,
              lpCalendarMonthlyDayStampStackOffsetRem(weekRow, b.dayIdx),
            )
          : baseBarTop + b.row * (BAR_HEIGHT + ROW_GAP);
        bar.style.cssText = `left:${b.left}%;width:${b.width}%;${barStyleVars};top:${topRem}rem;min-height:${BAR_HEIGHT}rem`;
        if (b.taskId) bar.dataset.taskId = String(b.taskId).trim();
        if (b.isCalendarDiary) bar.dataset.lpCalendarDiary = "1";
        lpApplyCalendarMultiDaySpanBarBackground(bar, b);
        bar.innerHTML = lpBuildCalendarSpanBarInnerHtml(b.name, !!b.done);
        lpApplyCalendarSpanBarDonePastClasses(bar, b, calendarBarTodayYmd);
        lpAttachCalendarBarOpenTodoEdit(
          bar,
          b,
          refreshCalendarLocal,
          refreshTodoList,
          patchDayStamp,
        );
        if (!b.isSingleDay && b.startDate && b.dueDate) {
          bar.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            createCalendarBarDateEditBubble(
              e.clientX,
              e.clientY,
              b,
              refreshCalendarLocal,
              () => {},
            );
          });
        }
        bindCalendarSpanBarDragHandlers(bar, b);
        if (b.isSingleDay && b.dueDate) {
          bar.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            createCalendarBarRevertBubble(
              e.clientX,
              e.clientY,
              b,
              refreshCalendarLocal,
              () => {},
            );
          });
        }
        b._barEl = bar;
        barsEl.appendChild(bar);
      });
      const moreEl = document.createElement("div");
      moreEl.className = "calendar-day-more-overlay";
      moreEl.style.cssText =
        "display:grid;grid-template-columns:repeat(7,1fr);position:absolute;inset:0;pointer-events:none;align-content:flex-end;padding:0.2rem 0;";
      weekDateKeys.forEach((dateKey) => {
        const slot = document.createElement("div");
        slot.style.cssText =
          "display:flex;justify-content:center;align-items:flex-end;padding:0 0.15rem;";
        moreEl.appendChild(slot);
      });
      weekWrap.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (calendarDragTransferTypesAllowDrop(e.dataTransfer)) {
          e.dataTransfer.dropEffect = "move";
          let cell = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest(".calendar-monthly-day:not(.empty)");
          if (!cell) {
            const cells = weekRow.querySelectorAll(
              ".calendar-monthly-day:not(.empty)",
            );
            for (const c of cells) {
              const r = c.getBoundingClientRect();
              if (
                e.clientX >= r.left &&
                e.clientX <= r.right &&
                e.clientY >= r.top &&
                e.clientY <= r.bottom
              ) {
                cell = c;
                break;
              }
            }
          }
          weekWrap
            .querySelectorAll(".calendar-day-drag-over")
            .forEach((el) => el.classList.remove("calendar-day-drag-over"));
          if (cell) cell.classList.add("calendar-day-drag-over");
        }
      });
      weekWrap.addEventListener("dragleave", (e) => {
        if (!weekWrap.contains(e.relatedTarget)) {
          weekWrap
            .querySelectorAll(".calendar-day-drag-over")
            .forEach((el) => el.classList.remove("calendar-day-drag-over"));
        }
      });
      weekWrap.addEventListener("drop", (e) => {
        weekWrap
          .querySelectorAll(".calendar-day-drag-over")
          .forEach((el) => el.classList.remove("calendar-day-drag-over"));
        e.preventDefault();
        let cell = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest(".calendar-monthly-day:not(.empty)");
        if (!cell) {
          const cells = weekRow.querySelectorAll(
            ".calendar-monthly-day:not(.empty)",
          );
          for (const c of cells) {
            const r = c.getBoundingClientRect();
            if (
              e.clientX >= r.left &&
              e.clientX <= r.right &&
              e.clientY >= r.top &&
              e.clientY <= r.bottom
            ) {
              cell = c;
              break;
            }
          }
        }
        if (!cell?.dataset?.date) return;
        const targetDate = cell.dataset.date;
        if (
          lpApplyCalendarDayIconDrop(
            e,
            targetDate,
            calendarGrid,
            patchDayStamp,
            refreshTodoList,
          )
        ) {
          return;
        }
        let json = readCalendarDropPayloadJson(e.dataTransfer);
        if (!json) return;
        let payload;
        try {
          payload = JSON.parse(json);
        } catch (_) {
          return;
        }
        lpHandleCalendarTaskDropOnDate(targetDate, payload, (meta) => {
          refreshCalendarLocal(meta);
        });
      });
      weekWrap.appendChild(weekRow);
      weekWrap.appendChild(barsEl);
      weekWrap.appendChild(moreEl);
      const insertBefore = partialWeekPatch
        ? lpFindMonthlyWeekWrapInsertBefore(calendarGrid, firstDayKey)
        : null;
      if (insertBefore) {
        calendarGrid.insertBefore(weekWrap, insertBefore);
      } else {
        calendarGrid.appendChild(weekWrap);
      }
      lpCalendarApplyWeekStampStripLayout(weekRow);
      const weekLayoutDone = layoutPass.trackWeek();
      if (
        barsWithRow.length > 0 ||
        lpCalendarWeekHasVisibleDayIcons(weekRow)
      ) {
        lpCalendarFinalizeBarRowLayout(
          barsWithRow,
          weekRow,
          BAR_HEIGHT,
          BARS_TOP,
          BOTTOM_PAD,
          ROW_GAP,
          weekLayoutDone,
        );
      } else {
        weekLayoutDone();
      }
      lpAttachCalendarMonthlyWeekBarLayoutSync(weekRow, barsWithRow, {
        BAR_HEIGHT,
        BARS_TOP,
        BOTTOM_PAD,
        ROW_GAP,
      });
    });
    wrap._lpRememberCalendarGridPaintSig?.();
    applyCalendarDiaryVisibilityToRoot(wrap);
    requestAnimationFrame(() => softReflowCalendarAfterDiaryToggle(wrap));
  }

  function goPrevMonth() {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar({ resetScroll: true });
    schedulePullTasksForVisibleMonth();
  }

  function goNextMonth() {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar({ resetScroll: true });
    schedulePullTasksForVisibleMonth();
  }

  lpCalendarNavQ(nav, wrap, ".calendar-nav-today").addEventListener(
    "click",
    () => {
      const now = new Date();
      currentYear = now.getFullYear();
      currentMonth = now.getMonth();
      renderCalendar({ resetScroll: true });
      schedulePullTasksForVisibleMonth();
    },
  );
  lpCalendarNavQ(nav, wrap, ".calendar-nav-prev").addEventListener(
    "click",
    goPrevMonth,
  );
  lpCalendarNavQ(nav, wrap, ".calendar-nav-next").addEventListener(
    "click",
    goNextMonth,
  );
  wireCalendarDiaryToggle(nav);

  /* 월 그리드: 왼쪽=다음 달, 오른쪽=이전 달 (터치·마우스·트랙패드 가로) */
  bindLpHorizontalPanNavigate(calendarGrid, {
    onNext: goNextMonth,
    onPrev: goPrevMonth,
    minDx: 40,
    touchMinDx: 28,
    dominance: 1.15,
    touchDominance: 1.04,
    lockDetectPx: 5,
    earlyCommitDx: 44,
    lockMs: 380,
    shouldIgnoreTarget: (target) =>
      !!target?.closest?.(
        "input, textarea, select, button, a, [role='dialog'], .calendar-monthly-span-bar",
      ),
  });

  calendarSection.appendChild(nav);
  calendarSection.appendChild(calendarGrid);
  wrap.appendChild(calendarSection);

  wrap.addEventListener("dragend", () => {
    wrap
      .querySelectorAll(".calendar-day-drag-over")
      .forEach((el) => el.classList.remove("calendar-day-drag-over"));
  });

  lpAttachCalendarGridRefreshGuard(
    wrap,
    renderCalendar,
    () => `${currentYear}-${currentMonth}`,
    { includeLedger: false },
  );
  renderCalendar();

  return wrap;
}

/** dateStr(YYYY-MM-DD) 기준 전날 키 반환 */
function getYesterdayKey(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "";
  const parts = dateStr
    .trim()
    .split(/[\/\-]/)
    .map(Number);
  if (parts.length < 3) return "";
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  dt.setDate(dt.getDate() - 1);
  return formatDateKey(dt);
}

/** [s,e) 각 조각에서 [rs,re) 겹침을 뺀 뒤 남는 구간들 */
function subtractOpenIntervalsFromPieces(pieces, rs, re) {
  const out = [];
  for (const [s, e] of pieces) {
    if (e <= s) continue;
    if (e <= rs || s >= re) {
      out.push([s, e]);
      continue;
    }
    if (s < rs) {
      const hi = Math.min(e, rs);
      if (hi > s) out.push([s, hi]);
    }
    if (re < e) {
      const lo = Math.max(s, re);
      if (e > lo) out.push([lo, e]);
    }
  }
  return out;
}

function clipPiecesByReservedRects(pieces, reserved) {
  let cur = pieces.slice();
  for (const [rs, re] of reserved) {
    const next = [];
    for (const p of cur) {
      next.push(...subtractOpenIntervalsFromPieces([p], rs, re));
    }
    cur = next;
  }
  return cur;
}

/**
 * 캘린더 일간 예상(일간예산 scheduledTimes)끼리 겹치면 savedAt 최신이 우선.
 * 낮은 우선순위는 잘리거나 둘로 나뉘어 표시된다.
 */
function clipBudgetExpectedSpansBySavedAt(
  rawSpans,
  fmt,
  MIN_PER_SLOT,
  SLOTS_PER_DAY,
) {
  const sorted = [...rawSpans].sort((a, b) => {
    const sa = Number(a._budgetSavedAt) || 0;
    const sb = Number(b._budgetSavedAt) || 0;
    if (sb !== sa) return sb - sa;
    const ea = Number(a._budgetEnumSeq) || 0;
    const eb = Number(b._budgetEnumSeq) || 0;
    if (eb !== ea) return eb - ea;
    const ta = String(a.taskName || "");
    const tb = String(b.taskName || "");
    const c = tb.localeCompare(ta);
    if (c !== 0) return c;
    return (Number(b._timeIdx) || 0) - (Number(a._timeIdx) || 0);
  });
  const reserved = [];
  const out = [];
  for (const s of sorted) {
    const sm = Number(s.startMin);
    const em = Number(s.endMin);
    if (!Number.isFinite(sm) || !Number.isFinite(em) || em <= sm) continue;
    const pieces = clipPiecesByReservedRects([[sm, em]], reserved);
    reserved.push([sm, em]);
    for (const [p0, p1] of pieces) {
      if (p1 <= p0) continue;
      const startMin = p0;
      const endMin = p1;
      const startSlot = Math.floor(startMin / MIN_PER_SLOT);
      const endSlot = Math.min(
        SLOTS_PER_DAY - 1,
        Math.floor((endMin - 1) / MIN_PER_SLOT),
      );
      const clipped = { ...s };
      delete clipped._budgetSavedAt;
      delete clipped._budgetEnumSeq;
      out.push({
        ...clipped,
        _budgetStoredStartMin: sm,
        _budgetStoredEndMin: em,
        startMin,
        endMin,
        startSlot,
        endSlot: Math.max(endSlot, startSlot),
        startDisplay: fmt(startMin),
        endDisplay: fmt(endMin),
      });
    }
  }
  return out;
}

/**
 * dateKey 기준: 저장된 일간예산 scheduledTimes + 해당 날 할일 시작·종료 → 예상 블록(겹침 레인 포함).
 * 오늘 해치우기 예산 DOM에만 있는 미저장 입력은 반영하지 않음.
 */
export function buildExpectedScheduleSpansForDateKey(dateKey) {
  const budgetGoals = getBudgetGoals(dateKey);
  const tasks = getAllTasksForDateDisplay(dateKey);
  const SLOTS_PER_DAY = CAL_1DAY_TIMETABLE_SLOTS_PER_DAY;
  const MIN_PER_SLOT = CAL_1DAY_TIMETABLE_MIN_PER_SLOT;
  const fmt = (m) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const parseHhMmToMinutes = (s) => {
    if (!s || !s.trim()) return null;
    const str = String(s).trim();
    const m = str.match(/^(\d{1,2}):?(\d{0,2})$/);
    if (m) return (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
    const m4 = str.match(/^(\d{3,4})$/);
    if (m4) {
      const digits = m4[1];
      const h =
        digits.length === 4
          ? parseInt(digits.slice(0, 2), 10)
          : parseInt(digits.slice(0, 1), 10);
      const min = parseInt(digits.slice(-2), 10) || 0;
      return (h || 0) * 60 + Math.min(59, min);
    }
    return null;
  };
  const getScheduledTimesForTask = (data) => {
    if (!data) return [];
    if (Array.isArray(data.scheduledTimes))
      return data.scheduledTimes.filter((x) => x && String(x).trim());
    if (data.scheduledTime && String(data.scheduledTime).trim())
      return [String(data.scheduledTime).trim()];
    return [];
  };
  const overlapMinutesBetween = (a, b) => {
    const sa = Number(a?.startMin);
    const ea = Number(a?.endMin);
    const sb = Number(b?.startMin);
    const eb = Number(b?.endMin);
    if (![sa, ea, sb, eb].every((n) => Number.isFinite(n))) return 0;
    const o = Math.min(ea, eb) - Math.max(sa, sb);
    return o > 0 ? o : 0;
  };
  const assignLanesToSpans = (spans) => {
    const laneOccupants = [];
    let maxLane = 0;
    for (const span of spans) {
      let lane = 0;
      while (lane < laneOccupants.length) {
        const inLane = laneOccupants[lane];
        const conflicts = inLane.some(
          (x) => overlapMinutesBetween(span, x) > 0,
        );
        if (!conflicts) break;
        lane++;
      }
      if (lane >= laneOccupants.length) laneOccupants.push([]);
      laneOccupants[lane].push(span);
      span.lane = lane;
      maxLane = Math.max(maxLane, lane);
    }
    return { spans, maxLane };
  };
  const mergeOverlappingSameNameSpans = (spans) => {
    let arr = spans.map((s) => ({ ...s }));
    let changed = true;
    while (changed) {
      changed = false;
      outer: for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i];
          const b = arr[j];
          if (
            String(a.taskName || "").trim() !== String(b.taskName || "").trim()
          )
            continue;
          if (overlapMinutesBetween(a, b) <= 0) continue;
          const startMin = Math.min(a.startMin, b.startMin);
          const endMin = Math.max(a.endMin, b.endMin);
          const startSlot = Math.floor(startMin / MIN_PER_SLOT);
          const endSlot = Math.min(
            SLOTS_PER_DAY - 1,
            Math.floor((endMin - 1) / MIN_PER_SLOT),
          );
          const memoJoin = [a.scheduleMemo, b.scheduleMemo]
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .join(" · ");
          const detailJoin = [a.scheduleDetail, b.scheduleDetail]
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .join(" · ");
          const merged = {
            ...a,
            startMin,
            endMin,
            startSlot,
            endSlot: Math.max(endSlot, startSlot),
            startDisplay: fmt(startMin),
            endDisplay: fmt(endMin),
          };
          if (memoJoin) merged.scheduleMemo = memoJoin;
          else delete merged.scheduleMemo;
          if (detailJoin) merged.scheduleDetail = detailJoin;
          else delete merged.scheduleDetail;
          arr = arr.filter((_, k) => k !== i && k !== j);
          arr.push(merged);
          changed = true;
          break outer;
        }
      }
    }
    return arr;
  };

  const budgetPlaceholderPrefix = "(과제 선택)·";
  const budgetRawSpans = [];
  let budgetEnumSeq = 0;
  const taskOptByName = new Map();

  for (const [taskName, data] of Object.entries(budgetGoals)) {
    if (taskName.startsWith(budgetPlaceholderPrefix)) continue;
    const times = getScheduledTimesForTask(data);
    const memos = Array.isArray(data?.scheduleMemos) ? data.scheduleMemos : [];
    const details = Array.isArray(data?.scheduleDetails)
      ? data.scheduleDetails
      : [];
    const plannedIdsArr = Array.isArray(data?.schedulePlannedTodoIds)
      ? data.schedulePlannedTodoIds
      : [];
    const savedAts = Array.isArray(data?.scheduledSavedAts)
      ? data.scheduledSavedAts
      : [];
    const taskFromList = tasks.find((t) => (t.name || "").trim() === taskName);
    times.forEach((st, timeIdx) => {
      if (!st.trim()) return;
      const parts = st.trim().split("-");
      const startMin = parseHhMmToMinutes(parts[0]);
      const endMin = parts[1] ? parseHhMmToMinutes(parts[1]) : null;
      if (startMin == null || endMin == null) return;
      const startSlot = Math.floor(startMin / MIN_PER_SLOT);
      const endSlot = Math.min(
        SLOTS_PER_DAY - 1,
        Math.floor((endMin - 1) / MIN_PER_SLOT),
      );
      let opt = taskOptByName.get(taskName);
      if (opt === undefined) {
        opt = getTaskOptionByName(taskName);
        taskOptByName.set(taskName, opt);
      }
      const prod = opt?.productivity || "other";
      const scheduleMemo = String(memos[timeIdx] || "").trim();
      const scheduleDetail = String(details[timeIdx] || "").trim();
      const plannedTodoIds = Array.isArray(plannedIdsArr[timeIdx])
        ? plannedIdsArr[timeIdx]
            .map((x) => String(x || "").trim())
            .filter(Boolean)
        : [];
      const span = {
        startSlot,
        endSlot: Math.max(endSlot, startSlot),
        startMin,
        endMin,
        taskName,
        prod,
        startDisplay: fmt(startMin),
        endDisplay: fmt(endMin),
        _budgetSavedAt: Number(savedAts[timeIdx]) || 0,
        _budgetEnumSeq: budgetEnumSeq++,
        _timeIdx: timeIdx,
      };
      if (scheduleMemo) span.scheduleMemo = scheduleMemo;
      if (scheduleDetail) span.scheduleDetail = scheduleDetail;
      if (plannedTodoIds.length) span.plannedTodoIds = plannedTodoIds;
      if (taskFromList) {
        span.sectionId = taskFromList.sectionId;
        span._task = taskFromList;
        span._taskKey = taskFromList.taskId || taskFromList.name;
      }
      budgetRawSpans.push(span);
    });
  }

  const budgetSpansClipped = clipBudgetExpectedSpansBySavedAt(
    budgetRawSpans,
    fmt,
    MIN_PER_SLOT,
    SLOTS_PER_DAY,
  );

  const spans = [...budgetSpansClipped];
  for (const t of tasks) {
    const st = (t.startTime || "").trim();
    const et = (t.endTime || "").trim();
    if (!st || !et) continue;
    const startMin = parseHhMmToMinutes(st);
    const endMin = parseHhMmToMinutes(et);
    if (startMin == null || endMin == null) continue;
    const startSlot = Math.floor(startMin / MIN_PER_SLOT);
    const endSlot = Math.min(
      SLOTS_PER_DAY - 1,
      Math.floor((endMin - 1) / MIN_PER_SLOT),
    );
    const prod = getTaskOptionByName(t.name)?.productivity || "other";
    spans.push({
      startSlot,
      endSlot: Math.max(endSlot, startSlot),
      startMin,
      endMin,
      taskName: t.name,
      prod,
      sectionId: t.sectionId,
      startDisplay: fmt(startMin),
      endDisplay: fmt(endMin),
      _task: t,
      _taskKey: t.taskId || t.name,
    });
  }

  const spanDedupeKey = (s) =>
    `${String(s.taskName || "").trim()}\0${s.startMin}\0${s.endMin}`;
  const seenSpanKeys = new Set();
  const dedupedSpans = [];
  for (const s of spans) {
    const k = spanDedupeKey(s);
    if (seenSpanKeys.has(k)) continue;
    seenSpanKeys.add(k);
    dedupedSpans.push(s);
  }
  const mergedSameName = mergeOverlappingSameNameSpans(dedupedSpans);
  const sorted = mergedSameName.sort((a, b) => a.startMin - b.startMin);
  const clamped = sorted
    .map((s) => {
      const sm = Number(s.startMin);
      const em = Number(s.endMin);
      if (!Number.isFinite(sm) || !Number.isFinite(em) || em <= sm) return null;
      const startMin = Math.max(0, sm);
      const endMin = Math.min(24 * 60, em);
      if (endMin <= startMin) return null;
      const startSlot = Math.floor(startMin / MIN_PER_SLOT);
      const endSlot = Math.min(
        SLOTS_PER_DAY - 1,
        Math.floor((endMin - 1) / MIN_PER_SLOT),
      );
      return {
        ...s,
        startMin,
        endMin,
        startSlot,
        endSlot: Math.max(endSlot, startSlot),
        startDisplay: fmt(startMin),
        endDisplay: fmt(endMin),
      };
    })
    .filter(Boolean);
  const withLanes = assignLanesToSpans(clamped);
  const normalized = withLanes.spans.map((s) => ({
    ...s,
    startDisplay: fmt(s.startMin),
    endDisplay: fmt(s.endMin),
  }));
  return { spans: normalized, maxLane: withLanes.maxLane };
}

/** 하루 길이(분) — 0:00~23:59. 24:00(1440)으로 세면 하루끝 23:59에도 1분이 남음 */
const CALENDAR_1DAY_LENGTH_MINUTES = 23 * 60 + 59;

/** 하루(0:00~23:59) 안에서 예상 일정 구간 겹침을 합쳐 실제로 덮인 분(합집합 길이) */
function minutesCoveredByExpectedSpansUnion(spans) {
  if (!Array.isArray(spans) || spans.length === 0) return 0;
  const dayCap = CALENDAR_1DAY_LENGTH_MINUTES;
  const iv = spans
    .map((s) => {
      const a = Math.max(0, Number(s.startMin));
      const b = Math.min(dayCap, Number(s.endMin));
      return [a, b];
    })
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  if (iv.length === 0) return 0;
  let sum = 0;
  let curS = iv[0][0];
  let curE = iv[0][1];
  for (let i = 1; i < iv.length; i++) {
    const [s, e] = iv[i];
    if (s <= curE) curE = Math.max(curE, e);
    else {
      sum += curE - curS;
      curS = s;
      curE = e;
    }
  }
  sum += curE - curS;
  return sum;
}

/**
 * 하루(0:00~23:59)에서 예상 일정 합집합을 뺀 빈 구간.
 * @param {unknown[]} spans
 * @param {{ minGapMin?: number }} [opts]
 * @returns {{ startMin: number, endMin: number }[]}
 */
function freeGapsFromExpectedSpans(spans, opts = {}) {
  const minGap = Math.max(0, Math.floor(Number(opts.minGapMin) || 15));
  const dayCap = CALENDAR_1DAY_LENGTH_MINUTES;
  const iv = (Array.isArray(spans) ? spans : [])
    .map((s) => {
      const a = Math.max(0, Number(s?.startMin));
      const b = Math.min(dayCap, Number(s?.endMin));
      return [a, b];
    })
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);

  /* 예상 일정이 아예 없으면 하루 통째 여유(00:00–23:59) 줄은 넣지 않음 */
  if (iv.length === 0) return [];

  /** @type {[number, number][]} */
  const merged = [];
  for (const [s, e] of iv) {
    if (!merged.length || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    }
  }

  /** @type {{ startMin: number, endMin: number }[]} */
  const gaps = [];
  let cursor = 0;
  for (const [s, e] of merged) {
    if (s - cursor >= minGap) {
      gaps.push({ startMin: cursor, endMin: s });
    }
    cursor = Math.max(cursor, e);
  }
  if (dayCap - cursor >= minGap) {
    gaps.push({ startMin: cursor, endMin: dayCap });
  }
  return gaps;
}

function formatWeekFlowClockFromMin(minOfDay) {
  const n = Math.max(0, Math.floor(Number(minOfDay) || 0));
  try {
    const hhmm = minutesOfDayToHhMm(n);
    if (hhmm) return hhmm;
  } catch (_) {}
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 일간 남은 시간 표기 (예: 17h 15m, 45m, 2h) */
function formatMinutesAsCompactHm(totalMin) {
  const m = Math.max(0, Math.floor(Number(totalMin) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

function prodKeyForWeekExpectedSpan(span) {
  const pk = String(span?.prod || "other").toLowerCase();
  if (pk === "productive" || pk === "nonproductive") return pk;
  return "other";
}

/** 예상 span — 과제 마스터(생산성·아이콘)를 렌더 시점에 다시 조회 */
function resolveExpectedSpanProdKey(span) {
  const taskName = String(span?.taskName || "").trim();
  const fromOpt = getTaskOptionByName(taskName)?.productivity;
  if (fromOpt) return fromOpt;
  const fromTask = String(span?._task?.productivity || "").trim();
  if (fromTask) return fromTask;
  return span?.prod || "other";
}

function resolveExpectedSpanCategory(span) {
  const taskName = String(span?.taskName || "").trim();
  const fromOpt = getTaskOptionByName(taskName)?.category;
  if (fromOpt) return fromOpt;
  const fromTask = String(span?._task?.category || "").trim();
  if (fromTask) return fromTask;
  return String(span?.category || "").trim();
}

function expectedSpansWithFreshProd(spans) {
  return (spans || []).map((span) => ({
    ...span,
    prod: resolveExpectedSpanProdKey(span),
    category: resolveExpectedSpanCategory(span),
  }));
}

function normLedgerRowDateYmd(s) {
  return String(s || "")
    .replace(/\//g, "-")
    .trim()
    .slice(0, 10);
}

function parseYmdFromLedgerTimeStr(str) {
  if (!str || typeof str !== "string") return "";
  const m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  return m
    ? `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`
    : "";
}

function ledgerRowsForCalendarYmd(allRows, ymd) {
  if (!ymd || !Array.isArray(allRows)) return [];
  return allRows.filter((r) => {
    const d = normLedgerRowDateYmd(
      r?.date || parseYmdFromLedgerTimeStr(r?.startTime),
    );
    return d === ymd;
  });
}

function normTaskNameForWeekFlowMatch(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** 예상 일정과 같은 과제명(또는 taskId)인 실제 기록인지 */
function ledgerRowMatchesExpectedSpanTask(r, span) {
  if (!r || !span) return false;
  const expName = normTaskNameForWeekFlowMatch(span.taskName);
  const expTid = String(span._task?.taskId || "").trim();
  const rtid = String(r?.taskId || "").trim();
  const rn = normTaskNameForWeekFlowMatch(r?.taskName);
  return (
    (expTid && rtid && expTid === rtid) ||
    !!(expName && rn && expName === rn)
  );
}

/**
 * 일간 타임라인 프로그레스 — 과제 일치 + 예상 시작±허용분 이내 실제 기록만.
 * 채움 = 해당 기록 유효 소요(분) 합 / 예상 블록 분.
 */
function sumLedgerEffectiveMinutesForExpectedSpanProgress(
  dayRows,
  span,
  targetKeyYmd,
  startToleranceMin = CAL_1DAY_TIMELINE_PROGRESS_START_TOLERANCE_MIN,
) {
  if (!Array.isArray(dayRows) || !span || !targetKeyYmd) return 0;
  const expStart = Number(span.startMin);
  if (!Number.isFinite(expStart)) return 0;
  const parts = String(targetKeyYmd).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return 0;
  const [yy, mo, dd] = parts;
  const dayBaseMs = new Date(yy, mo - 1, dd, 0, 0, 0, 0).getTime();
  const spanStartMs = dayBaseMs + expStart * 60000;
  const tolMs = Math.max(0, Number(startToleranceMin) || 0) * 60000;
  let sumMin = 0;
  for (const r of dayRows) {
    if (!ledgerRowMatchesExpectedSpanTask(r, span)) continue;
    const startMs = getRowStartInstantForMobileCard(r)?.getTime();
    if (!Number.isFinite(startMs)) continue;
    if (Math.abs(startMs - spanStartMs) > tolMs) continue;
    sumMin += Math.max(0, getMobileCardEffectiveHoursForPrice(r) * 60);
  }
  return sumMin;
}

/** 같은 날 실제 과제 기록에 예상 행동과제명(또는 할일 taskId)이 있으면 true */
function weekFlowExpectedSpanHasLedgerMatch(dayRows, span) {
  if (!Array.isArray(dayRows) || dayRows.length === 0 || !span) return false;
  for (const r of dayRows) {
    if (ledgerRowMatchesExpectedSpanTask(r, span)) return true;
  }
  return false;
}

/** 예상 과제와 같은 이름·taskId로, 지금 마감 없이 짜고 있는 실제 기록이 있는지 */
function weekFlowSpanHasMatchingLiveRecording(dayRows, span) {
  if (!Array.isArray(dayRows) || dayRows.length === 0 || !span) return false;
  for (const r of dayRows) {
    if (!isTimeLedgerRowLiveRecording(r)) continue;
    if (ledgerRowMatchesExpectedSpanTask(r, span)) return true;
  }
  return false;
}

/** 예상 블록 종료 시각이 지났거나(당일) 날짜가 지났는데 실제 기록이 없을 때만 미이행 표시 */
function weekFlowExpectedSpanLedgerMissed(
  dayKeyYmd,
  todayYmd,
  nowMinuteClock,
  span,
) {
  if (!span || !dayKeyYmd || !todayYmd) return false;
  if (dayKeyYmdCompare(dayKeyYmd, todayYmd) < 0) return true;
  if (dayKeyYmdCompare(dayKeyYmd, todayYmd) > 0) return false;
  const end = Number(span.endMin);
  if (!Number.isFinite(end)) return false;
  return nowMinuteClock > end;
}

function dayKeyYmdCompare(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function formatWeekFlowClockFromInst(inst) {
  if (!inst || !(inst instanceof Date) || Number.isNaN(inst.getTime())) {
    return "—";
  }
  return `${String(inst.getHours()).padStart(2, "0")}:${String(
    inst.getMinutes(),
  ).padStart(2, "0")}`;
}

function openWeekFlowLedgerRowEditor(rowData) {
  const row =
    rowData && typeof rowData === "object" ? { ...rowData } : null;
  if (!row) return;
  try {
    ensureDetachedTimeLedgerTaskLogBridge();
    window.__lpOpenTimeTaskLog?.({ editRowData: row });
  } catch (_) {}
}

/**
 * 오늘보다 과거 날짜는 예상 일정 모달 대신 과제 기록(시간기록)으로 연다.
 * (주간·일간에서 과거를 예상 일정으로 고치면 화면과 안 맞음)
 * opts.span 이 있으면 과거일 때 시간·과제 프리셋에 쓰고, 오늘·미래는 예산 슬롯 인덱스를 여기서 맞춘다.
 */
function openCalendarExpectedScheduleModalGuarded(opts = {}) {
  const dk = String(opts.dateKey || "")
    .replace(/\//g, "-")
    .trim()
    .slice(0, 10);
  const todayYmd = timeLedgerLocalTodayYmd();
  const span = opts.span && typeof opts.span === "object" ? opts.span : null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dk) && dayKeyYmdCompare(dk, todayYmd) < 0) {
    const editName = String(
      span?.taskName || opts.edit?.taskName || "",
    ).trim();
    try {
      ensureDetachedTimeLedgerTaskLogBridge();
      const dayRows = ledgerRowsForCalendarYmd(loadTimeRows(), dk);
      let match = null;
      if (span) {
        match = dayRows.find((r) => ledgerRowMatchesExpectedSpanTask(r, span));
      } else if (editName) {
        match = dayRows.find((r) =>
          ledgerRowMatchesExpectedSpanTask(r, { taskName: editName }),
        );
      }
      if (match) {
        window.__lpOpenTimeTaskLog?.({ editRowData: match });
        return;
      }
      const startFromSpan =
        (span?.startDisplay && String(span.startDisplay).trim()) ||
        (Number.isFinite(span?.startMin)
          ? minutesOfDayToHhMm(span.startMin)
          : "");
      const endFromSpan =
        (span?.endDisplay && String(span.endDisplay).trim()) ||
        (Number.isFinite(span?.endMin) ? minutesOfDayToHhMm(span.endMin) : "");
      const startHhMm = String(
        startFromSpan || opts.defaultStartHhMm || "",
      ).trim();
      const endHhMm = String(endFromSpan || "").trim();
      const memo = span ? expectedSpanCardMemoLines(span).join("\n") : "";
      window.__lpOpenTimeTaskLog?.({
        recordDateKey: dk,
        presetTaskName: editName,
        presetMemo: memo,
        presetStartHhMm: startHhMm || undefined,
        presetEndHhMm: endHhMm || undefined,
      });
    } catch (_) {}
    return;
  }
  const { span: _drop, ...modalOpts } = opts;
  if (span && modalOpts.edit && typeof modalOpts.edit === "object") {
    let slotIdx = Number(modalOpts.edit.timeIdx);
    if (!Number.isFinite(slotIdx) || slotIdx < 0) {
      slotIdx = resolveBudgetScheduleSlotIndex(dk, span);
    }
    if (slotIdx < 0) {
      showToast(
        "일간 예산에서 추가한 예상 일정만 여기서 수정할 수 있습니다.",
      );
      return;
    }
    modalOpts.edit = {
      ...modalOpts.edit,
      taskName: modalOpts.edit.taskName || span.taskName,
      timeIdx: slotIdx,
    };
  }
  openCalendarExpectedScheduleModal(modalOpts);
}

function paintCalendar1DaySlotGrid(root, dateKey) {
  if (!root || !dateKey) return;
  const { spans } = buildExpectedScheduleSpansForDateKey(dateKey);
  paintCalendar1DaySlotGridFromSpans(root, expectedSpansWithFreshProd(spans));
}

function findExpectedSpanAtSlotMin(dateKey, slotMin) {
  const { spans } = buildExpectedScheduleSpansForDateKey(dateKey);
  return findCalendarSlotSpanAtMin(slotMin, spans);
}

function wireCalendar1DaySlotGridCells(root, dateKey, onSaved) {
  if (!root || !dateKey) return;
  root.querySelectorAll(".calendar-1day-slot-grid-cell").forEach((cell) => {
    cell.setAttribute("role", "button");
    cell.tabIndex = 0;
    cell.addEventListener("click", () => {
      const slotMin = Number(cell.dataset.slotMin);
      const refresh = () => {
        paintCalendar1DaySlotGrid(root, dateKey);
        if (typeof onSaved === "function") onSaved();
      };
      const span = findExpectedSpanAtSlotMin(dateKey, slotMin);
      if (span) {
        openCalendarExpectedScheduleModalGuarded({
          dateKey,
          span,
          edit: { taskName: span.taskName },
          title: "예상 일정 수정",
          submitLabel: "저장",
          onSaved: refresh,
        });
        return;
      }
      openCalendarExpectedScheduleModalGuarded({
        dateKey,
        defaultStartHhMm: slotMinToHhMm(slotMin),
        onSaved: refresh,
      });
    });
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cell.click();
      }
    });
  });
}

function wireCalendar1DaySlotGridDragMove(scroll, dateKey, onSaved) {
  const refreshGridNow = () => {
    paintCalendar1DaySlotGrid(scroll, dateKey);
  };
  const scheduleHeavyRefresh = () => {
    if (typeof onSaved !== "function") return;
    requestAnimationFrame(() => onSaved());
  };
  wireCalendar1DaySlotGridDrag(scroll, {
    getSpans: () => buildExpectedScheduleSpansForDateKey(dateKey).spans,
    getBudgetSlotIndex: (span) => resolveBudgetScheduleSlotIndex(dateKey, span),
    onMoveSpan: (span, newStartMin, newEndMin) => {
      const slotIdx = resolveBudgetScheduleSlotIndex(dateKey, span);
      if (slotIdx < 0) {
        return {
          ok: false,
          error: "일간 예산에서 추가한 예상 일정만 옮길 수 있습니다.",
        };
      }
      const r = updateBudgetScheduleBlockAtIndex(
        dateKey,
        span.taskName,
        slotIdx,
        span.taskName,
        slotMinToHhMm(newStartMin),
        minutesOfDayToHhMm(newEndMin),
        String(span.scheduleMemo || "").trim(),
        String(span.scheduleDetail || "").trim(),
        {
          plannedTodoIds: Array.isArray(span.plannedTodoIds)
            ? span.plannedTodoIds
            : undefined,
        },
      );
      if (!r.ok) return r;
      /* 로컬 저장 직후 notifyTimeDailyBudgetSaved → 서버는 백그라운드 동기화 */
      return { ok: true };
    },
    onComplete: () => {
      refreshGridNow();
      scheduleHeavyRefresh();
    },
  });
}

/** 캘린더 일간뷰 — 24행×12열(5분 칸) + 「타임박스」헤더 */
function createCalendar1DayTimeboxPanel(dateKey, onSaved) {
  const section = document.createElement("div");
  section.className = "calendar-1day-timebox-section";
  const head = document.createElement("div");
  head.className = "calendar-1day-pane-section-head";
  head.textContent = "타임박스";
  section.appendChild(head);
  section.appendChild(createCalendar1DaySlotGrid(dateKey, onSaved));
  return section;
}

/** YYYY-MM-DD → "8.03 (월)" */
function formatCalendar1DayShortLabel(dateKey) {
  const key = String(dateKey || "")
    .replace(/\//g, "-")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")} (${weekdays[d.getDay()]})`;
}

/** 예상 일정란에 넣을 전일 타임박스(읽기 전용 · 오른쪽 타임박스와 같은 격자) */
function createPrevDayTimeboxInline(viewedDateKey) {
  const viewed = String(viewedDateKey || "")
    .replace(/\//g, "-")
    .trim()
    .slice(0, 10);
  const prevKey = /^\d{4}-\d{2}-\d{2}$/.test(viewed)
    ? addDaysToDateKey(viewed, -1)
    : "";
  const wrap = document.createElement("div");
  wrap.className = "calendar-1day-expected-prev-timebox";
  if (!prevKey) {
    const empty = document.createElement("p");
    empty.className = "calendar-1day-expected-cards-empty";
    empty.textContent = "전일 날짜를 확인할 수 없습니다.";
    wrap.appendChild(empty);
    return { wrap, prevKey: "", prevLabel: "" };
  }
  const prevLabel = formatCalendar1DayShortLabel(prevKey);
  const scroll = createCalendar1DaySlotGridScroll();
  scroll.classList.add("calendar-1day-expected-prev-timebox-scroll");
  scroll.setAttribute(
    "aria-label",
    `전일 타임박스 ${prevLabel || prevKey}`,
  );
  paintCalendar1DaySlotGrid(scroll, prevKey);
  wrap.appendChild(scroll);
  return { wrap, prevKey, prevLabel };
}

/** 캘린더 일간뷰 — 24행×12열(5분 칸) */
function createCalendar1DaySlotGrid(dateKey, onSaved) {
  const scroll = createCalendar1DaySlotGridScroll();
  wireCalendar1DaySlotGridCells(scroll, dateKey, onSaved);
  wireCalendar1DaySlotGridDragMove(scroll, dateKey, onSaved);
  paintCalendar1DaySlotGrid(scroll, dateKey);
  return scroll;
}

/** 캘린더 일간뷰(슬롯 그리드 모드) — 예상 일정 카드 · 헤더로 전일 타임박스 토글 */
function createCalendar1DayExpectedCardsPanel(dateKey, spans, onSaved) {
  const section = document.createElement("div");
  section.className = "calendar-1day-expected-cards-section";

  const head = document.createElement("button");
  head.type = "button";
  head.className =
    "calendar-1day-pane-section-head calendar-1day-pane-section-head--action";
  head.textContent = "예상 일정";
  head.title = "전일 타임박스 보기";
  head.setAttribute("aria-label", "예상 일정 · 전일 타임박스 보기");
  section.appendChild(head);

  const scroll = document.createElement("div");
  scroll.className = "calendar-1day-expected-cards-scroll";

  const list = document.createElement("div");
  list.className = "calendar-1day-expected-cards-list";

  const sorted = [...(spans || [])].sort(
    (a, b) =>
      a.startMin - b.startMin ||
      String(a.taskName || "").localeCompare(String(b.taskName || ""), "ko"),
  );

  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "calendar-1day-expected-cards-empty";
    empty.textContent = "예상 일정이 없습니다.";
    list.appendChild(empty);
  } else {
    for (const span of sorted) {
      const taskLabel = expectedSpanDisplayTaskName(span);
      const memoText = expectedSpanCardMemoLines(span).join("\n");
      const pk = prodKeyForWeekExpectedSpan({
        prod: resolveExpectedSpanProdKey(span),
      });

      const card = document.createElement("button");
      card.type = "button";
      card.className = `calendar-1day-expected-card calendar-1day-expected-card--${pk}`;

      const startDisplay = String(span.startDisplay || "").trim();
      const endDisplay = String(span.endDisplay || "").trim();
      const timeEl = document.createElement("div");
      timeEl.className = "calendar-1day-expected-card-time";
      if (startDisplay && endDisplay) {
        const startEl = document.createElement("span");
        startEl.className = "calendar-1day-expected-card-time-start";
        startEl.textContent = startDisplay;
        const dashEl = document.createElement("span");
        dashEl.className = "calendar-1day-expected-card-time-dash";
        dashEl.textContent = "–";
        dashEl.setAttribute("aria-hidden", "true");
        const endEl = document.createElement("span");
        endEl.className = "calendar-1day-expected-card-time-end";
        endEl.textContent = endDisplay;
        timeEl.append(startEl, dashEl, endEl);
      } else {
        timeEl.textContent = startDisplay || endDisplay || "—";
      }

      const main = document.createElement("div");
      main.className = "calendar-1day-expected-card-main";

      const titleEl = document.createElement("div");
      titleEl.className = "calendar-1day-expected-card-title";
      titleEl.textContent = taskLabel || "—";
      main.appendChild(titleEl);

      if (memoText) {
        const memoEl = document.createElement("div");
        memoEl.className = "calendar-1day-expected-card-memo";
        memoEl.textContent = memoText;
        main.appendChild(memoEl);
      }

      card.appendChild(timeEl);
      card.appendChild(main);

      card.title = memoText
        ? `${taskLabel} (${span.startDisplay} ~ ${span.endDisplay})\n${memoText}`
        : `${taskLabel} (${span.startDisplay} ~ ${span.endDisplay})`;

      card.addEventListener("click", () => {
        if (lpHorizontalPanNavigateRecentlyFired()) return;
        openCalendarExpectedScheduleModalGuarded({
          dateKey,
          span,
          edit: { taskName: span.taskName },
          title: "예상 일정 수정",
          submitLabel: "저장",
          onSaved: () => {
            if (typeof onSaved === "function") onSaved();
          },
        });
      });

      list.appendChild(card);
    }
  }

  scroll.appendChild(list);
  section.appendChild(scroll);

  const footer = document.createElement("div");
  footer.className = "calendar-1day-expected-cards-footer";

  const applyTemplateBtn = document.createElement("button");
  applyTemplateBtn.type = "button";
  applyTemplateBtn.className = "calendar-1day-expected-template-apply";
  applyTemplateBtn.textContent = "템플릿 적용";
  applyTemplateBtn.title =
    "저장해 둔 템플릿을 적용합니다. 기존 예상 일정은 사라집니다.";
  applyTemplateBtn.setAttribute("aria-label", "예상 일정 템플릿 적용");
  applyTemplateBtn.addEventListener("click", () => {
    openApplyBudgetTemplateModal({
      dateKey,
      onApplied: () => {
        if (typeof onSaved === "function") onSaved();
      },
    });
  });

  const saveTemplateBtn = document.createElement("button");
  saveTemplateBtn.type = "button";
  saveTemplateBtn.className = "calendar-1day-expected-template-save";
  saveTemplateBtn.textContent = "템플릿 저장";
  saveTemplateBtn.title = "이 날짜 예상 일정 전체를 템플릿 저장";
  saveTemplateBtn.setAttribute("aria-label", "이 날 예상 일정을 템플릿 저장");
  saveTemplateBtn.addEventListener("click", () => {
    openSaveBudgetTemplateModal({
      dateKey,
      onSaved: () => {
        if (typeof onSaved === "function") onSaved();
      },
    });
  });

  footer.appendChild(applyTemplateBtn);
  footer.appendChild(saveTemplateBtn);
  section.appendChild(footer);

  const {
    wrap: prevTimebox,
    prevLabel,
  } = createPrevDayTimeboxInline(dateKey);
  prevTimebox.hidden = true;
  section.appendChild(prevTimebox);

  let showingPrevTimebox = false;
  const setShowingPrevTimebox = (on) => {
    showingPrevTimebox = !!on;
    scroll.hidden = showingPrevTimebox;
    footer.hidden = showingPrevTimebox;
    prevTimebox.hidden = !showingPrevTimebox;
    section.classList.toggle(
      "calendar-1day-expected-cards-section--prev",
      showingPrevTimebox,
    );
    if (showingPrevTimebox) {
      head.textContent = prevLabel
        ? `전일 타임박스 · ${prevLabel}`
        : "전일 타임박스";
      head.title = "예상 일정 목록으로 돌아가기";
      head.setAttribute("aria-label", "전일 타임박스 · 예상 일정으로 돌아가기");
    } else {
      head.textContent = "예상 일정";
      head.title = "전일 타임박스 보기";
      head.setAttribute("aria-label", "예상 일정 · 전일 타임박스 보기");
    }
  };
  head.addEventListener("click", () => {
    if (lpHorizontalPanNavigateRecentlyFired()) return;
    setShowingPrevTimebox(!showingPrevTimebox);
  });

  return section;
}

function render1DayView(tabsElement = null, viewOpts = {}) {
  const hideTimelineCards = !!viewOpts.hideTimelineCards;
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-1day-view";
  if (hideTimelineCards) {
    wrap.classList.add("calendar-1day-view--slot-grid");
  }
  wrap.dataset.lpHomeTodayTimeline = "1";

  let dayOffset = Number.isFinite(viewOpts.initialDayOffset)
    ? Math.trunc(viewOpts.initialDayOffset)
    : 0;
  /** Date#getDay() 용 (0=일) — 네비 날짜 옆 요일 표기 */
  const NAV_WEEKDAYS_SUN0 = ["일", "월", "화", "수", "목", "금", "토"];

  /* 1번 레이아웃: 탭을 최상단 전체 영역에 배치 */
  const topRow = document.createElement("div");
  topRow.className = "calendar-view-top-row calendar-view-top-row--1day";
  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    topRow.appendChild(tabsWrapper);
  }
  wrap.appendChild(topRow);

  const contentRow = document.createElement("div");
  contentRow.className = "calendar-view-1day-content-row";

  const calendarSection = document.createElement("div");
  calendarSection.className = "calendar-monthly-main";

  const nav = document.createElement("div");
  nav.className = "calendar-1day-nav";
  nav.innerHTML = `
    <div class="calendar-nav-controls">
      <button type="button" class="calendar-nav-prev" title="전날">&lt;</button>
      <button type="button" class="calendar-nav-today" title="오늘">오늘</button>
      ${calendarDiaryToggleMarkup()}
      <button type="button" class="calendar-nav-next" title="다음날">&gt;</button>
    </div>
  `;
  nav.classList.add("calendar-monthly-nav");

  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar-monthly-grid";

  function refreshTodoList() {}

  function renderCalendar() {
    document
      .querySelectorAll(".calendar-1day-drag-drop-line")
      .forEach((el) => el.remove());
    document
      .querySelectorAll(".calendar-1day-resize-preview-line")
      .forEach((el) => el.remove());
    const grid = getCalendarGridFor1Day(dayOffset);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dayOffset);
    const y = targetDate.getFullYear();
    const m = targetDate.getMonth() + 1;
    const d = targetDate.getDate();
    const wKo = NAV_WEEKDAYS_SUN0[targetDate.getDay()] || "";
    const mdPart = `${m}.${String(d).padStart(2, "0")}`;
    const dowPart = wKo ? `(${wKo})` : "";

    topBarLeft.replaceChildren();
    const dateHeading = document.createElement("div");
    dateHeading.className = "calendar-monthly-top-bar-date";
    const hn = document.createElement("span");
    hn.className = "calendar-monthly-top-bar-date-num";
    hn.textContent = mdPart;
    const hw = document.createElement("span");
    hw.className = "calendar-monthly-top-bar-date-dow";
    hw.textContent = dowPart;
    dateHeading.appendChild(hn);
    dateHeading.appendChild(hw);
    dateHeading.setAttribute("aria-label", `${y}년 ${m}월 ${d}일 ${wKo}요일`);
    topBarLeft.appendChild(dateHeading);

    if (topBar.parentNode) topBar.parentNode.removeChild(topBar);

    calendarGrid.innerHTML = "";
    calendarGrid.className = "calendar-1day-split-layout";

    const targetKey = formatDateKey(targetDate);

    const timeColumn = document.createElement("div");
    timeColumn.className = "calendar-1day-time-column";
    timeColumn.appendChild(topBar);

    calendarGrid.appendChild(timeColumn);

    /* 구분선 */
    const divider = document.createElement("div");
    divider.className = "calendar-1day-divider";
    timeColumn.appendChild(divider);

    const { spans: daySpansTl } =
      buildExpectedScheduleSpansForDateKey(targetKey);
    const plannedMinutes = minutesCoveredByExpectedSpansUnion(daySpansTl);
    const remainingMinutes = Math.max(
      0,
      CALENDAR_1DAY_LENGTH_MINUTES - plannedMinutes,
    );

    const remainingBar = document.createElement("div");
    remainingBar.className = "calendar-1day-timeline-remaining";
    const remainingMain = document.createElement("div");
    remainingMain.className = "calendar-1day-timeline-remaining-main";
    const remainingLabel = document.createElement("span");
    remainingLabel.textContent = "남은 시간:";
    const remainingValue = document.createElement("span");
    remainingValue.textContent = formatMinutesAsCompactHm(remainingMinutes);
    remainingValue.title = `이 날 0:00~23:59 중 예상 일정으로 덮인 시간: ${formatMinutesAsCompactHm(plannedMinutes)}`;
    remainingLabel.title =
      "같은 날짜 예상 시간(합쳐서 겹침은 한 번만 계산)을 모두 쓰고도 남은 분입니다.";
    remainingMain.appendChild(remainingLabel);
    remainingMain.appendChild(remainingValue);
    remainingBar.appendChild(remainingMain);

    timeColumn.appendChild(remainingBar);

    if (hideTimelineCards) {
      const dualPane = document.createElement("div");
      dualPane.className = "calendar-1day-dual-pane";

      const gridPane = document.createElement("div");
      gridPane.className = "calendar-1day-dual-pane__grid";
      gridPane.appendChild(
        createCalendar1DayTimeboxPanel(targetKey, () => renderCalendar()),
      );

      const cardsPane = document.createElement("div");
      cardsPane.className = "calendar-1day-dual-pane__cards";
      cardsPane.appendChild(
        createCalendar1DayExpectedCardsPanel(
          targetKey,
          expectedSpansWithFreshProd(daySpansTl),
          () => renderCalendar(),
        ),
      );

      dualPane.appendChild(cardsPane);
      dualPane.appendChild(gridPane);
      timeColumn.appendChild(dualPane);
    } else {
    const nowForTimeline = new Date();
    const nowMinuteClockTL =
      nowForTimeline.getHours() * 60 + nowForTimeline.getMinutes();
    const todayYmdForTimeline = timeLedgerLocalTodayYmd();
    const dayLedgerRowsTL = ledgerRowsForCalendarYmd(loadTimeRows(), targetKey);
    const prodColorsTL = getTimeCategoryColorsForTimetableExpected();
    const TL_SECTION_LABELS = {
      sideincome: "시급 상승",
      health: "건강",
      happy: "행복",
    };

    const timelineWrap = document.createElement("div");
    timelineWrap.className = "calendar-1day-timeline-wrap";

    const timelineList = document.createElement("div");
    timelineList.className = "calendar-1day-timeline-list";

    const spansSortedTl = [...daySpansTl].sort(
      (a, b) =>
        a.startMin - b.startMin ||
        (a.lane ?? 0) - (b.lane ?? 0) ||
        String(a.taskName || "").localeCompare(String(b.taskName || ""), "ko"),
    );

    if (spansSortedTl.length === 0) {
      const emptyTl = document.createElement("p");
      emptyTl.className = "calendar-1day-timeline-empty";
      emptyTl.textContent = "예정된 일정이 없습니다.";
      timelineList.appendChild(emptyTl);
    } else {
      spansSortedTl.forEach((span) => {
        const pk = prodKeyForWeekExpectedSpan(span);
        const c = prodColorsTL[pk] || prodColorsTL.other;
        const taskStorageName = String(span.taskName || "").trim();
        const taskLabel = expectedSpanDisplayTaskName(span);
        const memoTextStored = expectedSpanCardMemoLines(span).join("\n");
        const durMin = Math.max(0, span.endMin - span.startMin);
        const ledgerMatched = weekFlowExpectedSpanHasLedgerMatch(
          dayLedgerRowsTL,
          span,
        );
        const hasLiveRecordingForSpanTL = weekFlowSpanHasMatchingLiveRecording(
          dayLedgerRowsTL,
          span,
        );
        const inExpectedWindow =
          targetKey === todayYmdForTimeline &&
          span.startMin <= nowMinuteClockTL &&
          nowMinuteClockTL < span.endMin;
        const liveRecordingThisSpan =
          inExpectedWindow && hasLiveRecordingForSpanTL;
        const ledgerMissed =
          !ledgerMatched &&
          !hasLiveRecordingForSpanTL &&
          weekFlowExpectedSpanLedgerMissed(
            targetKey,
            todayYmdForTimeline,
            nowMinuteClockTL,
            span,
          );

        const actualMinutesRaw = sumLedgerEffectiveMinutesForExpectedSpanProgress(
          dayLedgerRowsTL,
          span,
          targetKey,
        );
        const expectedMinProg = durMin;
        const progressRatio =
          expectedMinProg > 0 ? actualMinutesRaw / expectedMinProg : 0;
        const progressPctFill = Math.min(100, Math.max(0, progressRatio * 100));
        const progressOverExpected = progressRatio > 1.0001;

        const sidRaw = String(span.sectionId || "").trim();
        let sectionAccent = "";
        if (sidRaw && !sidRaw.startsWith("custom-")) {
          try {
            sectionAccent = getSectionColor(sidRaw) || "";
          } catch (_) {
            sectionAccent = "";
          }
        }

        const item = document.createElement("div");
        item.className = "calendar-1day-timeline-item";

        const card = document.createElement("div");
        card.className = "calendar-1day-timeline-card";
        const titleBase = memoTextStored
          ? `${taskLabel} (${span.startDisplay} ~ ${span.endDisplay})\n${memoTextStored}`
          : `${taskLabel} (${span.startDisplay} ~ ${span.endDisplay})`;
        if (ledgerMissed) {
          card.classList.add("calendar-1day-timeline-card--ledger-missed");
          card.title = `${titleBase}\n예정 종료 시간이 지났는데 아직 기록이 없습니다`;
        } else {
          card.title = ledgerMatched
            ? `${titleBase}\n실제 과제 기록에 반영됨`
            : titleBase;
        }
        if (liveRecordingThisSpan) {
          card.classList.add("calendar-1day-timeline-card--in-progress");
        }
        if (inExpectedWindow && !liveRecordingThisSpan && !ledgerMatched) {
          card.classList.add("calendar-1day-timeline-card--expected-now");
        }
        if (progressOverExpected && !ledgerMissed) {
          card.classList.add("calendar-1day-timeline-card--progress-over");
        }

        const startEl = document.createElement("span");
        startEl.className = "calendar-1day-timeline-card-start";
        startEl.textContent = span.startDisplay;

        const headBarCell = document.createElement("div");
        headBarCell.className = "calendar-1day-timeline-card-head-bar";
        const trackEl = document.createElement("div");
        trackEl.className = "calendar-1day-timeline-card-bar-track";
        trackEl.setAttribute("aria-hidden", "true");
        const fillEl = document.createElement("div");
        fillEl.className = "calendar-1day-timeline-card-head-bar-fill";
        fillEl.style.width = `${progressPctFill}%`;
        trackEl.appendChild(fillEl);
        headBarCell.appendChild(trackEl);

        const timeConnector = document.createElement("span");
        timeConnector.className = "calendar-1day-timeline-card-time-connector";
        timeConnector.setAttribute("aria-hidden", "true");

        const endEl = document.createElement("span");
        endEl.className = "calendar-1day-timeline-card-end";
        endEl.textContent = span.endDisplay;

        card.appendChild(startEl);
        card.appendChild(headBarCell);
        card.appendChild(timeConnector);

        const body = document.createElement("div");
        body.className = "calendar-1day-timeline-card-body";

        const durRow = document.createElement("span");
        durRow.className = "calendar-1day-timeline-card-duration";
        durRow.textContent = formatIntegerMinutesDurationKo(durMin);

        const taskOptForIcon = getTaskOptionByName(taskStorageName);
        const iconSrc = resolveTimeTaskDisplayIconSrc(taskStorageName, {
          category: taskOptForIcon?.category,
          productivity: taskOptForIcon?.productivity,
          iconKey: taskOptForIcon?.iconKey || "",
        });
        const iconCell = document.createElement("div");
        iconCell.className = "time-ledger-usage-icon-cell";
        if (iconSrc) {
          iconCell.appendChild(takeDisplayIconImg(iconSrc, { decoding: "sync" }));
        }

        const titleRow = document.createElement("div");
        titleRow.className =
          "time-ledger-usage-title-row calendar-1day-timeline-card-title-row";
        const titleEl = document.createElement("div");
        titleEl.className = "calendar-1day-timeline-card-title";
        titleEl.textContent = taskLabel;
        titleRow.appendChild(iconCell);
        titleRow.appendChild(titleEl);
        titleRow.appendChild(durRow);
        body.appendChild(titleRow);

        let badgeText = "";
        if (sidRaw && TL_SECTION_LABELS[sidRaw]) {
          badgeText = TL_SECTION_LABELS[sidRaw];
        } else if (sidRaw.startsWith("custom-")) {
          badgeText = "커스텀";
        }

        const meta = document.createElement("div");
        meta.className = "calendar-1day-timeline-card-meta";
        if (badgeText) {
          const badge = document.createElement("span");
          badge.className = "calendar-1day-timeline-card-badge";
          badge.textContent = badgeText;
          if (sectionAccent) {
            badge.style.backgroundColor = withMoreTransparency(
              sectionAccent,
              0.22,
            );
            badge.style.color =
              timetableAccentTextColor(sectionAccent) || sectionAccent;
          } else {
            badge.style.backgroundColor = withMoreTransparency(c.border, 0.18);
            badge.style.color = c.accentText;
          }
          meta.appendChild(badge);
        }
        if (liveRecordingThisSpan) {
          const prog = document.createElement("span");
          prog.className = "calendar-1day-timeline-card-progress";
          prog.textContent = "진행 중";
          meta.appendChild(prog);
        }
        if (meta.childNodes.length) {
          body.appendChild(meta);
        }

        if (memoTextStored) {
          const memoEl = document.createElement("div");
          memoEl.className = "calendar-1day-timeline-card-memo";
          memoEl.textContent = memoTextStored;
          body.appendChild(memoEl);
        }

        card.appendChild(body);

        card.appendChild(endEl);

        if (expectedMinProg > 0) {
          card.title = `${card.title}\n실제 소요 / 예상: ${formatIntegerMinutesDurationKo(Math.round(actualMinutesRaw))} / ${formatIntegerMinutesDurationKo(expectedMinProg)}`;
        }

        card.setAttribute("role", "button");
        card.tabIndex = 0;
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            card.click();
          }
        });
        card.addEventListener("click", () => {
          if (lpHorizontalPanNavigateRecentlyFired()) return;
          openCalendarExpectedScheduleModalGuarded({
            dateKey: targetKey,
            span,
            edit: { taskName: span.taskName },
            title: "예상 일정 수정",
            submitLabel: "저장",
            onSaved: () => renderCalendar(),
          });
        });

        item.appendChild(card);
        timelineList.appendChild(item);
      });
    }

    timelineWrap.appendChild(timelineList);
    timeColumn.appendChild(timelineWrap);

    const timeTableInnerStub = document.createElement("div");
    timeTableInnerStub.className =
      "calendar-1day-time-table-inner calendar-1day-time-table-inner--timeline-only";
    timeTableInnerStub.setAttribute("aria-hidden", "true");
    timeColumn.appendChild(timeTableInnerStub);
    }

    wrap.dataset.dateStr = targetKey;
    /* 날짜 이동 등 renderCalendar만 다시 돌 때도 1일 열 레이아웃이 깨지지 않게 모바일 일정 탭에서 재스탬프 */
    const scheduleMob = wrap.closest(".calendar-view--mobile-schedule");
    if (
      scheduleMob &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 46rem)").matches
    ) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const split = wrap.querySelector(".calendar-1day-split-layout");
          if (split) {
            try {
              split.style.setProperty("flex-direction", "column", "important");
              split.style.setProperty("width", "100%", "important");
              split.style.setProperty("max-width", "100%", "important");
              split.style.setProperty("min-width", "0", "important");
              split.style.setProperty("align-items", "stretch", "important");
              split.style.setProperty("box-sizing", "border-box", "important");
            } catch (_) {}
          }
          const el = split?.querySelector(".calendar-1day-time-column");
          if (el) {
            try {
              el.style.setProperty("width", "100%", "important");
              el.style.setProperty("max-width", "100%", "important");
              el.style.setProperty("min-width", "0", "important");
              el.style.setProperty("box-sizing", "border-box", "important");
              if (hideTimelineCards) {
                el.style.setProperty("flex", "1 1 auto", "important");
                el.style.setProperty("min-height", "0", "important");
                el.style.setProperty("max-height", "none", "important");
                el.style.setProperty("overflow", "hidden", "important");
                el.style.setProperty("display", "flex", "important");
                el.style.setProperty("flex-direction", "column", "important");
                const dualPaneEl = el.querySelector(".calendar-1day-dual-pane");
                if (dualPaneEl) {
                  dualPaneEl.style.setProperty("flex", "1 1 auto", "important");
                  dualPaneEl.style.setProperty("min-height", "0", "important");
                  dualPaneEl.style.setProperty("overflow", "hidden", "important");
                }
                const scrollEl = el.querySelector(
                  ".calendar-1day-slot-grid-scroll",
                );
                if (scrollEl) {
                  scrollEl.style.setProperty("flex", "1 1 auto", "important");
                  scrollEl.style.setProperty("min-height", "0", "important");
                  scrollEl.style.setProperty("overflow-y", "auto", "important");
                  scrollEl.style.setProperty(
                    "-webkit-overflow-scrolling",
                    "touch",
                    "important",
                  );
                  scrollEl.style.setProperty("touch-action", "pan-y", "important");
                }
                const cardsScrollEl = el.querySelector(
                  ".calendar-1day-expected-cards-scroll",
                );
                if (cardsScrollEl) {
                  cardsScrollEl.style.setProperty(
                    "flex",
                    "1 1 auto",
                    "important",
                  );
                  cardsScrollEl.style.setProperty("min-height", "0", "important");
                  cardsScrollEl.style.setProperty(
                    "overflow-y",
                    "auto",
                    "important",
                  );
                  cardsScrollEl.style.setProperty(
                    "-webkit-overflow-scrolling",
                    "touch",
                    "important",
                  );
                  cardsScrollEl.style.setProperty(
                    "touch-action",
                    "pan-y",
                    "important",
                  );
                }
              } else {
                el.style.setProperty("flex", "0 0 auto", "important");
                el.style.setProperty("min-height", "min-content", "important");
                el.style.setProperty("max-height", "none", "important");
                el.style.setProperty("overflow", "visible", "important");
                el.style.setProperty("overflow-x", "hidden", "important");
              }
            } catch (_) {}
          }
        });
      });
    }
  }

  function goPrevDay() {
    dayOffset -= 1;
    renderCalendar();
  }

  function goNextDay() {
    dayOffset += 1;
    renderCalendar();
  }

  lpCalendarNavQ(nav, wrap, ".calendar-nav-today")?.addEventListener(
    "click",
    () => {
      dayOffset = 0;
      renderCalendar();
    },
  );
  lpCalendarNavQ(nav, wrap, ".calendar-nav-prev")?.addEventListener(
    "click",
    goPrevDay,
  );
  lpCalendarNavQ(nav, wrap, ".calendar-nav-next")?.addEventListener(
    "click",
    goNextDay,
  );
  wireCalendarDiaryToggle(nav);

  const topBar = document.createElement("div");
  topBar.className = "calendar-monthly-top-bar";
  const topBarLeft = document.createElement("div");
  topBarLeft.className = "calendar-monthly-top-bar-left";
  const topBarRight = document.createElement("div");
  topBarRight.className = "calendar-monthly-top-bar-right";
  topBarRight.appendChild(nav);
  topBar.appendChild(topBarLeft);
  topBar.appendChild(topBarRight);

  calendarSection.appendChild(calendarGrid);
  contentRow.appendChild(calendarSection);
  wrap.appendChild(contentRow);

  wrap.addEventListener("dragend", () => {
    window.__calendarDragDuration = 60;
    wrap
      .querySelectorAll(".calendar-day-drag-over")
      .forEach((el) => el.classList.remove("calendar-day-drag-over"));
    wrap
      .querySelectorAll(".calendar-1day-slot-drag-over")
      .forEach((el) => el.classList.remove("calendar-1day-slot-drag-over"));
    wrap
      .querySelector(".calendar-1day-time-fill-overlay--expected")
      ?.classList.remove("calendar-1day-overlay-drag-over");
    document
      .querySelectorAll(".calendar-1day-drag-drop-line")
      .forEach((el) => el.remove());
  });

  const refreshTimetableOverlays = (e) => {
    if (e?.detail?.rebuildBudgetTables) {
      renderCalendar();
      return;
    }
    const source = e?.type || "unknown";
    const wrapInDoc = document.contains(wrap);
    const dateStr = e?.detail?.dateStr || wrap.dataset?.dateStr;
    const timeTableInner = wrap.querySelector(
      ".calendar-1day-time-table-inner",
    );
    void source;
    if (!wrapInDoc) return;
    /* getFullTaskOptions → assignIds UUID 부여 시 bumpPullSkip 이벤트 — 전체 재빌드 시 동기 무한 루프 */
    if (e?.type === "time-ledger-tasks-saved") {
      if (e?.detail?.bumpPullSkip) return;
      renderCalendar();
      return;
    }
    if (hideTimelineCards) {
      renderCalendar();
      return;
    }
    if (
      timeTableInner?.classList.contains(
        "calendar-1day-time-table-inner--timeline-only",
      )
    ) {
      renderCalendar();
      return;
    }
    if (timeTableInner && dateStr) {
      const actualDateKey =
        wrap.dataset.actualShowsYesterday === "true"
          ? getYesterdayKey(dateStr)
          : undefined;
      const { expected, actual, stampHourRows } = build1DayTimetableOverlays(
        dateStr,
        actualDateKey,
      );
      const oldExpected = timeTableInner.querySelector(
        ".calendar-1day-time-fill-overlay--expected",
      );
      const oldActual = timeTableInner.querySelector(
        ".calendar-1day-time-fill-overlay--actual",
      );
      if (oldExpected) oldExpected.replaceWith(expected);
      else timeTableInner.appendChild(expected);
      if (oldActual) oldActual.replaceWith(actual);
      else timeTableInner.appendChild(actual);
      stampHourRows?.(timeTableInner);
    } else if (!timeTableInner || !dateStr) {
      renderCalendar();
    }
  };

  ensureOneDayTimetableDocumentListeners();
  oneDayTimetableRefreshHandler = (e) => refreshTimetableOverlays(e);

  renderCalendar();

  wrap._lpRefreshCalendarView = () => {
    renderCalendar();
  };

  /* 일간 뷰: 왼쪽 스와이프=다음 날, 오른쪽=이전 날 (손가락·마우스 드래그·트랙패드 가로) */
  bindLpHorizontalPanNavigate(wrap, {
    onNext: goNextDay,
    onPrev: goPrevDay,
    lockMs: 400,
    shouldIgnoreTarget: (target) =>
      !!target?.closest?.(
        "input, textarea, select, [role='dialog'], .time-task-setup-modal, .lp-calendar-budget-add-modal, .calendar-1day-slot-grid-scroll",
      ),
  });

  return wrap;
}

function renderTodoView(tabsElement) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-view-todo";

  if (tabsElement) {
    const topRow = document.createElement("div");
    topRow.className =
      "calendar-view-top-row calendar-view-top-row--todo calendar-view-top-row--with-settings";
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    topRow.appendChild(tabsWrapper);
    wrap.appendChild(topRow);
  }

  const todoMain = document.createElement("div");
  todoMain.className = "calendar-monthly-main calendar-todo-main";

  const todoContent = document.createElement("div");
  todoContent.className = "calendar-todo-content";
  const todoListEl = renderTodoList({
    hideHeader: true,
    categoryToolbarRightActions: true,
  });
  todoContent.appendChild(todoListEl);
  todoMain.appendChild(todoContent);

  wrap.appendChild(todoMain);

  return wrap;
}


function render1WeekView(tabsElement, weekOpts = {}) {
  calendar1WeekDiagLog("render1WeekView.mount");
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout";
  const onOpenDayView =
    typeof weekOpts.onOpenDayView === "function" ? weekOpts.onOpenDayView : null;

  let weekOffset = 0;
  let _1weekRenderGen = 0;
  let _1weekRenderSeq = 0;

  const calendarSection = document.createElement("div");
  calendarSection.className = "calendar-monthly-main";

  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    calendarSection.appendChild(tabsWrapper);
  }

  const nav = document.createElement("div");
  nav.className = "calendar-nav";
  nav.innerHTML = `
    <span class="calendar-nav-date">
      <span class="calendar-nav-month"></span>
      <span class="calendar-nav-year"></span>
    </span>
    <div class="calendar-nav-controls">
      <button type="button" class="calendar-nav-prev" title="이전 주">&lt;</button>
      <button type="button" class="calendar-nav-today" title="오늘">오늘</button>
      ${calendarDiaryToggleMarkup()}
      <button type="button" class="calendar-nav-next" title="다음 주">&gt;</button>
    </div>
  `;
  nav.classList.add("calendar-monthly-nav");

  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar-monthly-grid";

  function refreshTodoList() {}

  /** 로컬 저장·편집 직후 — 방금 반영한 데이터로만 다시 그림(중복 pull·깜빡임 완화) */
  function refreshCalendar1WeekLocal(opts = {}) {
    const refreshOpts = { skipWeekPull: true, softLocal: true, ...opts };
    lpRunCalendarLayoutRefresh(
      wrap,
      () => {
        void renderCalendar(refreshOpts);
      },
      refreshOpts,
    );
  }

  function patchDayStamp(dateKey) {
    lpPatchCalendarMonthlyDayStamp(calendarGrid, dateKey, patchDayStamp);
    wrap._lpRememberCalendarGridPaintSig?.();
  }

  async function renderCalendar(opts = {}) {
    const skipWeekPull = !!opts.skipWeekPull;
    const renderSeq = ++_1weekRenderSeq;
    calendar1WeekDiagLog("renderCalendar.start", {
      skipWeekPull,
      renderSeq,
      weekOffset,
    });
    const week = getCalendarGridFor1Week(weekOffset);
    const weekKeysForPull = week
      .map((d) => (d ? formatDateKey(d) : ""))
      .filter(Boolean);
    const firstPullKey = weekKeysForPull[0] || "";
    const lastPullKey = weekKeysForPull[weekKeysForPull.length - 1] || "";
    if (!skipWeekPull && firstPullKey && lastPullKey) {
      const pullGen = ++_1weekRenderGen;
      calendar1WeekDiagLog("renderCalendar.pull.start", {
        pullGen,
        renderSeq,
        firstPullKey,
        lastPullKey,
      });
      try {
        await Promise.all([
          pullTimeLedgerEntriesForDateRange(firstPullKey, lastPullKey, {
            force: true,
          }),
          pullTimeDailyBudgetForDateRange(firstPullKey, lastPullKey),
        ]);
      } catch (_) {}
      if (pullGen !== _1weekRenderGen) {
        calendar1WeekDiagLog("renderCalendar.pull.aborted", {
          pullGen,
          currentGen: _1weekRenderGen,
          renderSeq,
        });
        return;
      }
      calendar1WeekDiagLog("renderCalendar.pull.done", { pullGen, renderSeq });
    }

    const monthIndex = week[0] ? week[0].getMonth() : new Date().getMonth();
    const navMonth = lpCalendarNavQ(nav, wrap, ".calendar-nav-month");
    const navYear = lpCalendarNavQ(nav, wrap, ".calendar-nav-year");
    if (navMonth) applyCalendarNavMonthLabel(navMonth, monthIndex);
    if (navYear)
      navYear.textContent = week[0] ? String(week[0].getFullYear()) : "";

    const softLocal = !!opts.softLocal;
    if (softLocal) {
      calendarGrid.replaceChildren();
    } else {
      calendarGrid.innerHTML = "";
    }
    calendarGrid.className =
      "calendar-monthly-grid calendar-monthly-grid--1week-timegrid";
    const layoutPass = lpBeginCalendarGridLayoutPass(calendarGrid, {
      keepVisible: softLocal,
    });
    calendar1WeekDiagLog("renderCalendar.layoutPass.begin", {
      renderSeq,
      classes: calendarGrid.className,
    });

    const todayYmd = timeLedgerLocalTodayYmd();
    const prodColorsExpected = getTimeCategoryColorsForTimetableExpected();
    const WEEK_FLOW_SECTION_LABELS = {
      sideincome: "시급 상승",
      health: "건강",
      happy: "행복",
    };

    const allLedgerRowsForWeek = loadTimeRows();

    function applyWeekDropToDate(targetDate, payload) {
      lpHandleCalendarTaskDropOnDate(targetDate, payload, (meta) => {
        refreshCalendar1WeekLocal(meta);
        refreshTodoList();
      });
    }

    const outer = document.createElement("div");
    outer.className =
      "calendar-1week-time-grid-google calendar-1week-time-grid-google--flow";

    const weekDateKeys = week
      .map((d) => (d ? formatDateKey(d) : ""))
      .filter(Boolean);
    const firstDayKey = weekDateKeys[0] || "";
    const lastDayKey = weekDateKeys[weekDateKeys.length - 1] || "";
    const weekSpan = calendarPullRangeYmdForWeekDates(
      week.filter(Boolean),
      0,
    );
    const rangeTasks = getAllTasksWithDateRange().filter((t) =>
      calendarSectionTaskOverlapsYmdRange(
        t,
        weekSpan.rangeStart,
        weekSpan.rangeEnd,
      ),
    );

    const stripHeader = document.createElement("div");
    stripHeader.className = "calendar-1week-strip-header";

    const dayHeader = document.createElement("div");
    dayHeader.className = "calendar-monthly-weekdays";
    DAY_NAMES.forEach((name) => {
      const cell = document.createElement("div");
      cell.className = "calendar-monthly-weekday";
      cell.textContent = name;
      dayHeader.appendChild(cell);
    });
    stripHeader.appendChild(dayHeader);

    const weekWrap = document.createElement("div");
    weekWrap.className = "calendar-monthly-week-wrap";
    const weekRow = document.createElement("div");
    weekRow.className = "calendar-monthly-week";
    const currentMonth = week[0] ? week[0].getMonth() : new Date().getMonth();

    week.forEach((date) => {
      if (!date) return;
      const cell = document.createElement("div");
      cell.className = "calendar-monthly-day";
      const key = formatDateKey(date);
      cell.dataset.date = key;
      const dayNum = document.createElement("div");
      dayNum.className = "calendar-monthly-day-num calendar-1week-day-num--goto-day";
      dayNum.textContent = date.getDate();
      dayNum.setAttribute("role", "button");
      dayNum.setAttribute("tabindex", "0");
      dayNum.setAttribute("aria-label", `${key} 일간 보기`);
      const goDay = (e) => {
        e.stopPropagation();
        e.preventDefault();
        onOpenDayView?.(key);
      };
      dayNum.addEventListener("click", goDay);
      dayNum.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") goDay(e);
      });

      const isCurrentMonth = date.getMonth() === currentMonth;
      if (!isCurrentMonth) cell.classList.add("other-month");
      if (key === todayYmd) cell.classList.add("today");
      if (date.getDay() === 0) cell.classList.add("sun");
      if (date.getDay() === 6) cell.classList.add("sat");

      cell.appendChild(dayNum);
      /* 주간뷰 상단 스트립 — 스탬프 미표시 (월간만 표시) */
      const entriesEl = document.createElement("div");
      entriesEl.className = "calendar-monthly-day-entries";
      cell.appendChild(entriesEl);

      cell.style.cursor = "pointer";
      cell.addEventListener("click", (e) => {
        if (
          e.target.closest(
            ".calendar-event-bubble, .calendar-event-add-modal, .calendar-day-expand-overlay",
          )
        ) {
          return;
        }
        if (lpCalendarGuardCellClickFromMonthlyBar(e)) return;
        e.stopPropagation();
        e.preventDefault();
        lpOpenCalendarMonthlyDayActionBubble(
          cell,
          key,
          (meta) => {
            refreshCalendar1WeekLocal(meta);
            refreshTodoList();
          },
          {
            onAfterStampChange: () => {
              refreshTodoList();
            },
          },
        );
      });
      cell.addEventListener("dragover", (e) => {
        if (calendarDragTransferTypesAllowDrop(e.dataTransfer)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          cell.classList.add("calendar-day-drag-over");
        }
      });
      cell.addEventListener("dragleave", () => {
        cell.classList.remove("calendar-day-drag-over");
      });
      cell.addEventListener("drop", (e) => {
        cell.classList.remove("calendar-day-drag-over");
        const json = readCalendarDropPayloadJson(e.dataTransfer);
        if (!json) return;
        e.preventDefault();
        e.stopPropagation();
        let payload;
        try {
          payload = JSON.parse(json);
        } catch (_) {
          return;
        }
        applyWeekDropToDate(key, payload);
      });
      weekRow.appendChild(cell);
    });

    const barsEl = document.createElement("div");
    barsEl.className = "calendar-monthly-bars";
    const { BARS_TOP, BAR_HEIGHT, BOTTOM_PAD, ROW_GAP, WEEK_ROW_MIN } =
      lpCalendarWeekBarLayoutMetrics(weekRow);
    const baseBarTop = BARS_TOP + 0.1;
    const allBars = [];
    const CELL_GAP = 3.5;
    orderSingleDayTasksForMonthlyBarStack(rangeTasks).forEach((t) => {
      const barStart = t.startDate > firstDayKey ? t.startDate : firstDayKey;
      const barEnd = t.dueDate < lastDayKey ? t.dueDate : lastDayKey;
      if (barStart > barEnd) return;
      const startIdx = weekDateKeys.indexOf(barStart);
      const endIdx = weekDateKeys.indexOf(barEnd);
      if (startIdx < 0 || endIdx < 0) return;
      const left = (startIdx / 7) * 100 + CELL_GAP / 7;
      const width = ((endIdx - startIdx + 1) / 7) * 100 - (CELL_GAP * 2) / 7;
      const baseColor = getSectionColor(t.sectionId);
      const color = withMoreTransparency(baseColor);
      const isFirstSegment = barStart === t.startDate;
      allBars.push({
        left,
        width,
        startIdx,
        endIdx,
        name: t.name,
        color,
        isSingleDay: false,
        isFirstSegment,
        itemType: t.itemType || "todo",
        done: !!t.done,
        taskId: t.taskId,
        sectionId: t.sectionId,
        startDate: t.startDate,
        dueDate: t.dueDate,
        isOverdueBar: calendarBarTaskIsOverdueTodo(t),
        isCalendarDiary: taskIsCalendarDiary(t),
        _calPrevStart: (t._calPrevStart || "").toString().slice(0, 10) || "",
        _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
      });
    });
    weekDateKeys.forEach((dateKey, dayIdx) => {
      orderSingleDayTasksForMonthlyBarStack(
        getTasksForDate(dateKey, true),
      ).forEach((t) => {
        const left = (dayIdx / 7) * 100 + CELL_GAP / 7;
        const width = (1 / 7) * 100 - (CELL_GAP * 2) / 7;
        const baseColor = getSectionColor(t.sectionId);
        const borderColor = todoQualifiesCalendarShortSpanBarAccent(
          t.startDate,
          t.dueDate || dateKey,
        )
          ? CALENDAR_SHORT_SPAN_BAR_HEX
          : timetableAccentTextColor(baseColor) || baseColor;
        allBars.push({
          left,
          width,
          name: t.name,
          borderColor,
          isSingleDay: true,
          dayIdx,
          dateKey,
          itemType: t.itemType || "todo",
          done: !!t.done,
          taskId: t.taskId,
          sectionId: t.sectionId,
          startDate: t.startDate || "",
          dueDate: t.dueDate || dateKey,
          isOverdueBar: calendarBarTaskIsOverdueTodo(t),
          isCalendarDiary: taskIsCalendarDiary(t),
          _calPrevStart: (t._calPrevStart || "").toString().slice(0, 10) || "",
          _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
        });
      });
    });
    lpCalendarAssignMonthlyBarLayout(allBars);
    const rangeBarsOnly = allBars.filter((b) => !b.isSingleDay);
    allBars.forEach((b) => {
      b.isOverflow = false;
    });
    const rowsNeeded = lpCalendarMonthlyWeekStackSlotCount(
      allBars,
      weekDateKeys.length,
    );
    weekRow.style.minHeight = `${lpCalendarMonthlyWeekRowTargetMinHeightRem(
      baseBarTop,
      rowsNeeded,
      BAR_HEIGHT,
      ROW_GAP,
      BOTTOM_PAD,
      WEEK_ROW_MIN,
    )}rem`;
    const barsWithRow = allBars;
    const calendarBarTodayYmd = timeLedgerLocalTodayYmd();
    barsWithRow.forEach((b) => {
      const bar = document.createElement("div");
      bar.className =
        "calendar-monthly-span-bar" +
        (b.isSingleDay
          ? " calendar-monthly-span-bar--todo"
          : " calendar-monthly-span-bar--range") +
        (b.isOverflow ? " calendar-monthly-span-bar--overflow" : "") +
        (b.isOverdueBar ? " calendar-monthly-span-bar--overdue" : "") +
        ((b.itemType || "todo").toLowerCase() !== "todo"
          ? " calendar-monthly-span-bar--schedule-strip"
          : "");
      bar.title = b.name;
      const barStyleVars = b.isSingleDay
        ? `--bar-border:${b.borderColor || CALENDAR_SHORT_SPAN_BAR_HEX}`
        : `--bar-bg:${b.color || ""}`;
      const topRem = b.isSingleDay
        ? lpCalendarMonthlyEstimateSingleDayBarTopRem(
            baseBarTop,
            rangeBarsOnly,
            b.dayIdx,
            b.localRow || 0,
            BAR_HEIGHT,
            ROW_GAP,
          )
        : baseBarTop + b.row * (BAR_HEIGHT + ROW_GAP);
      bar.style.cssText = `left:${b.left}%;width:${b.width}%;${barStyleVars};top:${topRem}rem;min-height:${BAR_HEIGHT}rem`;
      if (b.taskId) bar.dataset.taskId = String(b.taskId).trim();
      if (b.isCalendarDiary) bar.dataset.lpCalendarDiary = "1";
      lpApplyCalendarMultiDaySpanBarBackground(bar, b);
      bar.innerHTML = lpBuildCalendarSpanBarInnerHtml(b.name, !!b.done);
      lpApplyCalendarSpanBarDonePastClasses(bar, b, calendarBarTodayYmd);
      lpAttachCalendarBarOpenTodoEdit(
        bar,
        b,
        refreshCalendar1WeekLocal,
        refreshTodoList,
        patchDayStamp,
      );
      if (!b.isSingleDay && b.startDate && b.dueDate) {
        bar.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          createCalendarBarDateEditBubble(
            e.clientX,
            e.clientY,
            b,
            (meta) => {
              refreshCalendar1WeekLocal(meta);
              refreshTodoList();
            },
            () => {},
          );
        });
      }
      bindCalendarSpanBarDragHandlers(bar, b);
      if (b.isSingleDay && b.dueDate) {
        bar.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          createCalendarBarRevertBubble(
            e.clientX,
            e.clientY,
            b,
            (meta) => {
              refreshCalendar1WeekLocal(meta);
              refreshTodoList();
            },
            () => {},
          );
        });
      }
      b._barEl = bar;
      barsEl.appendChild(bar);
    });
    const weekLayoutDone = layoutPass.trackWeek();
    lpCalendarFinalizeBarRowLayout(
      barsWithRow,
      weekRow,
      BAR_HEIGHT,
      BARS_TOP,
      BOTTOM_PAD,
      ROW_GAP,
      weekLayoutDone,
    );
    lpAttachCalendarMonthlyWeekBarLayoutSync(weekRow, barsWithRow, {
      BAR_HEIGHT,
      BARS_TOP,
      BOTTOM_PAD,
      ROW_GAP,
    });
    const moreEl = document.createElement("div");
    moreEl.className = "calendar-day-more-overlay";
    moreEl.style.cssText =
      "display:grid;grid-template-columns:repeat(7,1fr);position:absolute;inset:0;pointer-events:none;align-content:flex-end;padding:0.2rem 0;";
    weekDateKeys.forEach((_dateKey) => {
      const slot = document.createElement("div");
      slot.style.cssText =
        "display:flex;justify-content:center;align-items:flex-end;padding:0 0.15rem;";
      moreEl.appendChild(slot);
    });
    weekWrap.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (calendarDragTransferTypesAllowDrop(e.dataTransfer)) {
        e.dataTransfer.dropEffect = "move";
        let cell = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest(".calendar-monthly-day:not(.empty)");
        if (!cell) {
          const cells = weekRow.querySelectorAll(
            ".calendar-monthly-day:not(.empty)",
          );
          for (const c of cells) {
            const r = c.getBoundingClientRect();
            if (
              e.clientX >= r.left &&
              e.clientX <= r.right &&
              e.clientY >= r.top &&
              e.clientY <= r.bottom
            ) {
              cell = c;
              break;
            }
          }
        }
        weekWrap
          .querySelectorAll(".calendar-day-drag-over")
          .forEach((el) => el.classList.remove("calendar-day-drag-over"));
        if (cell) cell.classList.add("calendar-day-drag-over");
      }
    });
    weekWrap.addEventListener("dragleave", (e) => {
      if (!weekWrap.contains(e.relatedTarget)) {
        weekWrap
          .querySelectorAll(".calendar-day-drag-over")
          .forEach((el) => el.classList.remove("calendar-day-drag-over"));
      }
    });
    weekWrap.addEventListener("drop", (e) => {
      weekWrap
        .querySelectorAll(".calendar-day-drag-over")
        .forEach((el) => el.classList.remove("calendar-day-drag-over"));
      e.preventDefault();
      let json = readCalendarDropPayloadJson(e.dataTransfer);
      if (!json) return;
      let payload;
      try {
        payload = JSON.parse(json);
      } catch (_) {
        return;
      }
      let cell = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest(".calendar-monthly-day:not(.empty)");
      if (!cell) {
        const cells = weekRow.querySelectorAll(
          ".calendar-monthly-day:not(.empty)",
        );
        for (const c of cells) {
          const r = c.getBoundingClientRect();
          if (
            e.clientX >= r.left &&
            e.clientX <= r.right &&
            e.clientY >= r.top &&
            e.clientY <= r.bottom
          ) {
            cell = c;
            break;
          }
        }
      }
      if (!cell?.dataset?.date) return;
      applyWeekDropToDate(cell.dataset.date, payload);
    });
    weekWrap.appendChild(weekRow);
    weekWrap.appendChild(barsEl);
    weekWrap.appendChild(moreEl);
    stripHeader.appendChild(weekWrap);

    const flowHScrollOuter = document.createElement("div");
    flowHScrollOuter.className = "calendar-1week-flow-hscroll-outer";
    const flowHScrollInner = document.createElement("div");
    flowHScrollInner.className = "calendar-1week-flow-hscroll-inner";

    const scrollArea = document.createElement("div");
    scrollArea.className = "calendar-1week-google-scroll";

    const bodyGrid = document.createElement("div");
    bodyGrid.className = "calendar-1week-google-body";

    const colsWrap = document.createElement("div");
    colsWrap.className = "calendar-1week-google-cols";

    week.forEach((date) => {
      if (!date) return;
      const key = formatDateKey(date);
      const dayLedgerRows = ledgerRowsForCalendarYmd(allLedgerRowsForWeek, key);
      const col = document.createElement("div");
      col.className = "calendar-1week-google-col";
      col.dataset.date = key;
      if (key === todayYmd) col.classList.add("is-today");

      const stack = document.createElement("div");
      stack.className = "calendar-1week-flow-stack";

      const prodColors = prodColorsExpected;
      /* 과거: 실제 시간기록만 / 오늘·미래: 예상 일정(계획)만 (✓·✕ 매칭 없음) */
      const showActualOnly = dayKeyYmdCompare(key, todayYmd) < 0;

      if (showActualOnly) {
        const rowsSorted = [...dayLedgerRows].sort((a, b) => {
          const as = getRowStartInstantForMobileCard(a)?.getTime() ?? 0;
          const bs = getRowStartInstantForMobileCard(b)?.getTime() ?? 0;
          return as - bs;
        });
        rowsSorted.forEach((row) => {
          const taskLabel = ledgerRowDisplayTaskName(row) || "(제목 없음)";
          const kpiId = String(
            getTaskOptionByName(row?.taskName)?.kpiId || "",
          ).trim();
          const memoTextStored = buildTimeLedgerCardMemoText(row, kpiId);
          const startInst = getRowStartInstantForMobileCard(row);
          const startClock = formatWeekFlowClockFromInst(startInst);
          const live = isTimeLedgerRowLiveRecording(row);
          const endClock = live
            ? ""
            : rowHasEndTimeForMobileCard(row)
              ? formatWeekFlowClockFromInst(getRowEndInstantForMobileCard(row))
              : "—";
          const rangeHuman = endClock
            ? `${startClock} - ${endClock}`
            : `${startClock} -`;

          const card = document.createElement("button");
          card.type = "button";
          card.className =
            "calendar-1week-flow-card calendar-1week-flow-card--actual";
          card.title = memoTextStored
            ? `${taskLabel} (${startClock} ~ ${endClock || "진행 중"})\n${memoTextStored}`
            : `${taskLabel} (${startClock} ~ ${endClock || "진행 중"})`;

          const titleRow = document.createElement("div");
          titleRow.className = "calendar-1week-flow-card-title-row";
          const titleEl = document.createElement("span");
          titleEl.className = "calendar-1week-flow-card-title";
          titleEl.textContent = taskLabel;
          titleRow.appendChild(titleEl);

          const meta = document.createElement("div");
          meta.className = "calendar-1week-flow-card-meta";
          const timeSpan = document.createElement("span");
          timeSpan.className = "calendar-1week-flow-card-time";
          timeSpan.textContent = rangeHuman;
          meta.appendChild(timeSpan);

          if (live) {
            card.classList.add("calendar-1week-flow-card--in-progress");
            const prog = document.createElement("span");
            prog.className = "calendar-1week-flow-card-progress";
            prog.textContent = "진행 중";
            meta.appendChild(prog);
          }

          card.appendChild(titleRow);
          card.appendChild(meta);
          {
            const memoEl = document.createElement("div");
            memoEl.className = "calendar-1week-flow-card-memo";
            if (fillTimeLedgerCardMemoElement(memoEl, row, kpiId)) {
              card.appendChild(memoEl);
            }
          }
          card.addEventListener("click", () => {
            if (lpHorizontalPanNavigateRecentlyFired()) return;
            openWeekFlowLedgerRowEditor(row);
          });
          stack.appendChild(card);
        });
      } else {
        const { spans: daySpans } = buildExpectedScheduleSpansForDateKey(key);
        const spansSorted = [...daySpans]
          .sort(
            (a, b) =>
              a.startMin - b.startMin ||
              (a.lane ?? 0) - (b.lane ?? 0) ||
              String(a.taskName || "").localeCompare(
                String(b.taskName || ""),
                "ko",
              ),
          );
        const freeGaps = freeGapsFromExpectedSpans(daySpans, { minGapMin: 20 });

        /** @type {{ kind: "gap"|"card", startMin: number, gap?: { startMin: number, endMin: number }, span?: object }[]} */
        const flowItems = [
          ...freeGaps.map((gap) => ({
            kind: "gap",
            startMin: gap.startMin,
            gap,
          })),
          ...spansSorted.map((span) => ({
            kind: "card",
            startMin: Number(span.startMin) || 0,
            span,
          })),
        ].sort(
          (a, b) =>
            a.startMin - b.startMin ||
            (a.kind === "gap" ? -1 : 1) - (b.kind === "gap" ? -1 : 1),
        );

        flowItems.forEach((item) => {
          if (item.kind === "gap" && item.gap) {
            const g = item.gap;
            const startClock = formatWeekFlowClockFromMin(g.startMin);
            const endClock = formatWeekFlowClockFromMin(g.endMin);
            const durLabel = formatMinutesAsCompactHm(g.endMin - g.startMin);
            const gapEl = document.createElement("div");
            gapEl.className = "calendar-1week-flow-free-gap";
            gapEl.setAttribute("role", "note");
            gapEl.title = `여유 ${startClock}–${endClock} (${durLabel})`;
            const gapLabel = document.createElement("span");
            gapLabel.className = "calendar-1week-flow-free-gap-label";
            gapLabel.textContent = "여유";
            const gapTime = document.createElement("span");
            gapTime.className = "calendar-1week-flow-free-gap-time";
            gapTime.textContent = `${startClock}–${endClock}`;
            gapEl.appendChild(gapLabel);
            gapEl.appendChild(gapTime);
            stack.appendChild(gapEl);
            return;
          }

          const span = item.span;
          if (!span) return;
          const pk = prodKeyForWeekExpectedSpan(span);
          const c = prodColors[pk] || prodColors.other;
          const taskLabel = expectedSpanDisplayTaskName(span);
          const memoTextStored = expectedSpanCardMemoLines(span).join("\n");
          const rangeHuman = `${span.startDisplay} - ${span.endDisplay}`;

          const card = document.createElement("button");
          card.type = "button";
          card.className = "calendar-1week-flow-card";
          card.title = memoTextStored
            ? `${taskLabel} (${span.startDisplay} ~ ${span.endDisplay})\n${memoTextStored}`
            : `${taskLabel} (${span.startDisplay} ~ ${span.endDisplay})`;

          const sidRaw = String(span.sectionId || "").trim();
          let badgeAccent = "";
          if (sidRaw && !sidRaw.startsWith("custom-")) {
            try {
              badgeAccent = getSectionColor(sidRaw) || "";
            } catch (_) {
              badgeAccent = "";
            }
          }
          if (!badgeAccent && c.border) badgeAccent = c.border;

          const titleRow = document.createElement("div");
          titleRow.className = "calendar-1week-flow-card-title-row";
          const titleEl = document.createElement("span");
          titleEl.className = "calendar-1week-flow-card-title";
          titleEl.textContent = taskLabel;
          titleRow.appendChild(titleEl);

          const meta = document.createElement("div");
          meta.className = "calendar-1week-flow-card-meta";

          const timeSpan = document.createElement("span");
          timeSpan.className = "calendar-1week-flow-card-time";
          timeSpan.textContent = rangeHuman;
          meta.appendChild(timeSpan);

          let badgeText = "";
          if (sidRaw && WEEK_FLOW_SECTION_LABELS[sidRaw]) {
            badgeText = WEEK_FLOW_SECTION_LABELS[sidRaw];
          } else if (sidRaw.startsWith("custom-")) {
            badgeText = "커스텀";
          }
          if (badgeText) {
            const badge = document.createElement("span");
            badge.className = "calendar-1week-flow-card-badge";
            badge.textContent = badgeText;
            if (badgeAccent) {
              badge.style.backgroundColor = withMoreTransparency(
                badgeAccent,
                0.22,
              );
              badge.style.color =
                timetableAccentTextColor(badgeAccent) || badgeAccent;
            }
            meta.appendChild(badge);
          }

          card.appendChild(titleRow);
          card.appendChild(meta);
          if (memoTextStored) {
            const memoEl = document.createElement("div");
            memoEl.className = "calendar-1week-flow-card-memo";
            memoEl.textContent = memoTextStored;
            card.appendChild(memoEl);
          }
          card.addEventListener("click", () => {
            if (lpHorizontalPanNavigateRecentlyFired()) return;
            openCalendarExpectedScheduleModalGuarded({
              dateKey: key,
              span,
              edit: { taskName: span.taskName },
              title: "예상 일정 수정",
              submitLabel: "저장",
              onSaved: () => refreshCalendar1WeekLocal(),
            });
          });
          stack.appendChild(card);
        });
      }

      col.appendChild(stack);
      colsWrap.appendChild(col);
    });

    bodyGrid.appendChild(colsWrap);
    scrollArea.appendChild(bodyGrid);

    scrollArea.addEventListener("dragover", (e) => {
      if (!calendarDragTransferTypesAllowDrop(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      let col = e.target.closest(".calendar-1week-google-col");
      if (!col) {
        col = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest(".calendar-1week-google-col");
      }
      scrollArea
        .querySelectorAll(".calendar-day-drag-over")
        .forEach((el) => el.classList.remove("calendar-day-drag-over"));
      if (col) col.classList.add("calendar-day-drag-over");
    });
    scrollArea.addEventListener("dragleave", (e) => {
      if (!scrollArea.contains(e.relatedTarget)) {
        scrollArea
          .querySelectorAll(".calendar-day-drag-over")
          .forEach((el) => el.classList.remove("calendar-day-drag-over"));
      }
    });
    scrollArea.addEventListener("drop", (e) => {
      scrollArea
        .querySelectorAll(".calendar-day-drag-over")
        .forEach((el) => el.classList.remove("calendar-day-drag-over"));
      const json = readCalendarDropPayloadJson(e.dataTransfer);
      if (!json) return;
      e.preventDefault();
      let payload;
      try {
        payload = JSON.parse(json);
      } catch (_) {
        return;
      }
      let col = e.target.closest(".calendar-1week-google-col");
      if (!col) {
        col = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest(".calendar-1week-google-col");
      }
      if (!col) return;
      const targetDate = col.dataset.date || "";
      if (!targetDate) return;
      applyWeekDropToDate(targetDate, payload);
    });

    outer.appendChild(flowHScrollOuter);
    flowHScrollOuter.appendChild(flowHScrollInner);
    flowHScrollInner.appendChild(stripHeader);
    flowHScrollInner.appendChild(scrollArea);
    calendarGrid.appendChild(outer);

    wrap._lpRememberCalendarGridPaintSig?.();
    applyCalendarDiaryVisibilityToRoot(wrap);
    requestAnimationFrame(() => softReflowCalendarAfterDiaryToggle(wrap));
    calendar1WeekDiagLog("renderCalendar.domBuilt", {
      renderSeq,
      bars: allBars.length,
      cards: outer.querySelectorAll(".calendar-1week-flow-card").length,
      layoutPending: calendarGrid.classList.contains(
        "calendar-monthly-grid--layout-pending",
      ),
      layoutReady: calendarGrid.classList.contains(
        "calendar-monthly-grid--layout-ready",
      ),
    });
    calendar1WeekDiagSnapshot(wrap, `domBuilt-${renderSeq}`);
    lpScheduleRevealCalendarGridLayout(calendarGrid, "domBuilt-fallback");
    requestAnimationFrame(() => {
      calendar1WeekDiagSnapshot(wrap, `rAF-after-domBuilt-${renderSeq}`);
    });
  }

  lpCalendarNavQ(nav, wrap, ".calendar-nav-today").addEventListener(
    "click",
    () => {
      weekOffset = 0;
      void renderCalendar();
    },
  );
  lpCalendarNavQ(nav, wrap, ".calendar-nav-prev").addEventListener(
    "click",
    () => {
      weekOffset--;
      void renderCalendar();
    },
  );
  lpCalendarNavQ(nav, wrap, ".calendar-nav-next").addEventListener(
    "click",
    () => {
      weekOffset++;
      void renderCalendar();
    },
  );
  wireCalendarDiaryToggle(nav);

  calendarSection.appendChild(nav);
  calendarSection.appendChild(calendarGrid);
  wrap.appendChild(calendarSection);

  wrap.addEventListener("dragend", () => {
    wrap
      .querySelectorAll(".calendar-day-drag-over")
      .forEach((el) => el.classList.remove("calendar-day-drag-over"));
  });

  /* 상위 renderSubView 가 같은 주간에 이미 시간·예산을 pull 한 뒤 호출함 — 여기서 또 pull 하면 전체 격자가 연달아 다시 그려져 줄이 여러 번 튐 */
  lpAttachCalendarGridRefreshGuard(
    wrap,
    (opts = {}) => {
      void renderCalendar({ skipWeekPull: true, ...opts });
    },
    () => `1week-${weekOffset}`,
  );
  void renderCalendar({ skipWeekPull: true });

  return wrap;
}

/** 연간 뷰: 날짜 칸 호버 버블 — 칸 간 이동 시 닫힘 타이머 충돌 방지 */
let _annualDayExpandHideTimer = null;
let _annualDayExpandClose = null;
function cancelAnnualDayExpandHideTimer() {
  if (_annualDayExpandHideTimer != null) {
    clearTimeout(_annualDayExpandHideTimer);
    _annualDayExpandHideTimer = null;
  }
}
function scheduleAnnualDayExpandHide() {
  cancelAnnualDayExpandHideTimer();
  _annualDayExpandHideTimer = window.setTimeout(() => {
    _annualDayExpandHideTimer = null;
    try {
      _annualDayExpandClose?.();
    } finally {
      _annualDayExpandClose = null;
    }
  }, 220);
}

/** body에 붙은 캘린더 떠있는 UI(할일 추가 버블·날짜 확장·반투명 오버레이·일정추가 모달) — 탭·서브뷰 전환 시 정리 */
export function dismissCalendarDayExpandUI() {
  cancelAnnualDayExpandHideTimer();
  try {
    _annualDayExpandClose?.();
  } catch (_) {}
  _annualDayExpandClose = null;
  if (_calendarDayExpandOutsideHandler) {
    try {
      document.removeEventListener("click", _calendarDayExpandOutsideHandler);
    } catch (_) {}
    _calendarDayExpandOutsideHandler = null;
  }
  detachCalendarEventBubbleOutsideListener();
  document
    .querySelectorAll(".calendar-event-bubble")
    .forEach((el) => el.remove());
  document
    .querySelectorAll(".calendar-day-expand-overlay")
    .forEach((el) => el.remove());
  try {
    dismissOpenCalendarExpectedScheduleModals();
  } catch (_) {}
  try {
    closeDuplicateTodoAddModals();
  } catch (_) {}
}

/** 연간 뷰: 왼쪽 월 라벨, 오른쪽 해당 월 날짜 셀 한 행 (Year Planner 구조), 요일 미표시.
 *  (hover: hover) 기기: 호버로 목록 버블, 클릭으로 빠른 추가.
 *  터치 기기: 탭으로 목록 패널(오버레이+닫기+할일 추가), 빠른 추가는 패널 안 버튼. */
function renderAnnualView(tabsElement) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-annual-view";

  let currentYear = new Date().getFullYear();
  const todayKey = formatDateKey(new Date());

  function refreshTodoList() {}

  const calendarSection = document.createElement("div");
  calendarSection.className = "calendar-monthly-main";
  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    calendarSection.appendChild(tabsWrapper);
  }

  const nav = document.createElement("div");
  nav.className = "calendar-monthly-nav";
  nav.innerHTML = `
    <div class="calendar-nav-controls">
      <button type="button" class="calendar-nav-prev" title="이전 해">&lt;</button>
      <button type="button" class="calendar-nav-today" title="올해로 이동">${currentYear}</button>
      <button type="button" class="calendar-nav-next" title="다음 해">&gt;</button>
    </div>
  `;
  calendarSection.appendChild(nav);

  const gridWrap = document.createElement("div");
  gridWrap.className = "calendar-annual-grid-wrap";
  const table = document.createElement("div");
  table.className = "calendar-annual-table";

  /** 현재 표시 연도가 올해면 가로 스크롤을 오늘 날짜 셀이 보이도록 (첫 진입 시 스와이프 불필요) */
  function scrollAnnualGridToTodayIfNeeded() {
    if (currentYear !== new Date().getFullYear()) return;
    const tk = formatDateKey(new Date());
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!gridWrap.isConnected) return;
        const cell =
          table.querySelector(".calendar-annual-cell.today") ||
          table.querySelector(`.calendar-annual-cell[data-date-key="${tk}"]`);
        if (!cell) return;
        try {
          cell.scrollIntoView({
            block: "nearest",
            inline: "center",
            behavior: "auto",
          });
        } catch (_) {
          cell.scrollIntoView(false);
        }
      });
    });
  }

  function refreshAnnualLocal(meta = {}) {
    refreshTodoList();
    const keys = Array.isArray(meta.patchDateKeys)
      ? meta.patchDateKeys
          .map((k) => String(k || "").trim().slice(0, 10))
          .filter(Boolean)
      : [];
    if (keys.length > 0) {
      keys.forEach((k) => lpPatchAnnualDayCell(table, k));
      return;
    }
    renderYear();
  }

  function renderYear() {
    cancelAnnualDayExpandHideTimer();
    try {
      _annualDayExpandClose?.();
    } catch (_) {}
    _annualDayExpandClose = null;
    const yearJumpBtn = lpCalendarNavQ(nav, wrap, ".calendar-nav-today");
    if (yearJumpBtn) yearJumpBtn.textContent = String(currentYear);
    table.innerHTML = "";

    for (let month = 0; month < 12; month++) {
      const lastDay = new Date(currentYear, month + 1, 0).getDate();
      const row = document.createElement("div");
      row.className = "calendar-annual-row";

      const monthLabel = document.createElement("div");
      monthLabel.className = "calendar-annual-row-month";
      monthLabel.textContent = formatCalendarMonthLabel(month);
      row.appendChild(monthLabel);

      const daysRow = document.createElement("div");
      daysRow.className = "calendar-annual-row-days";

      const MAX_DAYS = 31;
      const prefersHover =
        typeof window.matchMedia !== "undefined" &&
        window.matchMedia("(hover: hover)").matches;

      for (let d = 1; d <= MAX_DAYS; d++) {
        if (d > lastDay) {
          const padCell = document.createElement("div");
          padCell.className = "calendar-annual-cell calendar-annual-cell--pad";
          padCell.setAttribute("aria-hidden", "true");
          daysRow.appendChild(padCell);
          continue;
        }

        const date = new Date(currentYear, month, d);
        const key = formatDateKey(date);
        const dow = date.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const cell = document.createElement("div");
        cell.className = "calendar-annual-cell";
        cell.dataset.dateKey = key;
        if (key === todayKey) cell.classList.add("today");
        if (isWeekend) cell.classList.add("weekend");
        const dayNum = document.createElement("span");
        dayNum.className = "calendar-annual-cell-num";
        dayNum.textContent = d;
        cell.appendChild(dayNum);
        if (filterCalendarTasksForDisplay(getTasksForDate(key)).length > 0) {
          const dot = document.createElement("span");
          dot.className = "calendar-annual-cell-dot";
          cell.appendChild(dot);
        }

        const openAnnualDayBubble = () => {
          cancelAnnualDayExpandHideTimer();
          const rect = cell.getBoundingClientRect();
          const tasks = getAllTasksForDateDisplay(key);
          const { bubble, close } = createCalendarDayExpandBubble(
            rect,
            key,
            tasks,
            () => {
              _annualDayExpandClose = null;
            },
            {
              hideCloseButton: true,
              dismissOnOutsideClick: false,
              useMobileOverlay: false,
              positionBelow: true,
              onAdd: () => {
                createCalendarEventBubble(
                  rect,
                  key,
                  (meta) => refreshAnnualLocal(meta),
                  () => {},
                );
              },
              onAfterTaskEdit: (meta) => refreshAnnualLocal(meta),
              onAfterStampChange: () => {},
            },
          );
          _annualDayExpandClose = close;
          bubble.addEventListener("mouseenter", cancelAnnualDayExpandHideTimer);
          bubble.addEventListener("mouseleave", scheduleAnnualDayExpandHide);
        };

        const openAnnualQuickAddModal = (e) => {
          if (e.target.closest(".calendar-event-bubble, .calendar-event-add-modal")) return;
          e.stopPropagation();
          cancelAnnualDayExpandHideTimer();
          try {
            _annualDayExpandClose?.();
          } catch (_) {}
          _annualDayExpandClose = null;
          const rect = cell.getBoundingClientRect();
          createCalendarEventBubble(
            rect,
            key,
            (meta) => refreshAnnualLocal(meta),
            () => {},
          );
        };

        cell.style.cursor = "pointer";
        if (prefersHover) {
          cell.addEventListener("mouseenter", openAnnualDayBubble);
          cell.addEventListener("mouseleave", scheduleAnnualDayExpandHide);
          cell.addEventListener("click", openAnnualQuickAddModal);
        } else {
          const openAnnualDayTouchPanel = (e) => {
            if (e.target.closest(".calendar-event-bubble, .calendar-event-add-modal")) return;
            e.stopPropagation();
            cancelAnnualDayExpandHideTimer();
            try {
              _annualDayExpandClose?.();
            } catch (_) {}
            _annualDayExpandClose = null;
            const rect = cell.getBoundingClientRect();
            const tasksTouch = getAllTasksForDateDisplay(key);
            const { close: closeTouch } = createCalendarDayExpandBubble(
              rect,
              key,
              tasksTouch,
              () => {
                _annualDayExpandClose = null;
              },
              {
                hideCloseButton: false,
                dismissOnOutsideClick: true,
                useMobileOverlay: true,
                positionBelow: true,
                onAdd: () => {
                  const r = cell.getBoundingClientRect();
                  createCalendarEventBubble(
                    r,
                    key,
                    (meta) => refreshAnnualLocal(meta),
                    () => {},
                  );
                },
                onAfterTaskEdit: (meta) => refreshAnnualLocal(meta),
                onAfterStampChange: () => {},
              },
            );
            _annualDayExpandClose = closeTouch;
          };
          cell.addEventListener("click", openAnnualDayTouchPanel);
        }
        daysRow.appendChild(cell);
      }
      row.appendChild(daysRow);
      table.appendChild(row);
    }
    scrollAnnualGridToTodayIfNeeded();
  }

  gridWrap.appendChild(table);
  calendarSection.appendChild(gridWrap);
  wrap.appendChild(calendarSection);
  renderYear();

  lpCalendarNavQ(nav, wrap, ".calendar-nav-today").addEventListener(
    "click",
    () => {
      currentYear = new Date().getFullYear();
      renderYear();
    },
  );
  lpCalendarNavQ(nav, wrap, ".calendar-nav-prev").addEventListener(
    "click",
    () => {
      currentYear--;
      renderYear();
    },
  );
  lpCalendarNavQ(nav, wrap, ".calendar-nav-next").addEventListener(
    "click",
    () => {
      currentYear++;
      renderYear();
    },
  );

  wrap._lpRefreshCalendarView = () => {
    renderYear();
  };

  return wrap;
}

const CALENDAR_SUB_VIEWS = [
  { id: "monthly", label: "월별" },
  { id: "1week", label: "1주" },
  { id: "1day", label: "타임블록" },
  { id: "annual", label: "연간" },
];

const MOBILE_SCHEDULE_CAL_SUB_VIEWS = [
  { id: "monthly", label: "Month", footerShortLabel: "Month" },
  { id: "1week", label: "Week", footerShortLabel: "Week" },
  { id: "1day", label: "Day", footerShortLabel: "Day" },
  { id: "annual", label: "Year", footerShortLabel: "Year" },
];

/**
 * 캘린더 탭 하위 뷰(월별·1주·연간·타임블록) 공통 셸
 * @param {HTMLElement|null} tabsElement 상단에 붙일 외부 탭 행(없으면 null)
 * @param {{ subViewsList?: {id:string,label:string}[], storageKey?: string, forceInitialMonthlyOnMobile?: boolean, scheduleSubViewsInFooter?: boolean, footerActionsSlot?: HTMLElement | null }} opts
 * scheduleSubViewsInFooter: true면 서브뷰 전환을 네비가 아닌 앱 푸터(`app-footer-icon-btn`)에 둡니다.
 */
function createCalendarSubViewRoot(tabsElement, opts = {}) {
  const isMobile = window.matchMedia("(max-width: 46rem)").matches;
  const subViewsList = opts.subViewsList || CALENDAR_SUB_VIEWS;
  const storageKey = opts.storageKey || "calendar-sub-view";
  const forceInitialMonthlyOnMobile = !!opts.forceInitialMonthlyOnMobile;
  const dashboardEmbedMode = !!opts.dashboardEmbedMode;
  const scheduleSubViewsInFooter = !!opts.scheduleSubViewsInFooter;
  const footerActionsSlot = opts.footerActionsSlot || null;

  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-view-with-subtabs";

  const topRow = document.createElement("div");
  topRow.className = "calendar-view-top-row";
  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    topRow.appendChild(tabsWrapper);
  }

  /** @type {HTMLElement | null} */
  let subTabsMountOuter = null;
  /** @type {HTMLElement | null} */
  let subTabsControlRoot = null;
  /** @type {Array<{ id: string, btn: HTMLButtonElement }>} */
  const footerSubViewSwitchers = [];

  function appendSubTabButtons() {
    if (!subTabsControlRoot) return;
    subViewsList.forEach((v, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "time-view-tab calendar-sub-tab" + (i === 0 ? " active" : "");
      btn.dataset.subView = v.id;
      const labelSpan = document.createElement("span");
      labelSpan.className = "calendar-sub-tab-label";
      labelSpan.textContent = v.label;
      btn.appendChild(labelSpan);
      subTabsControlRoot.appendChild(btn);
    });
  }

  if (!scheduleSubViewsInFooter) {
    subTabsControlRoot = document.createElement("div");
    subTabsControlRoot.className = "calendar-sub-tabs";
    appendSubTabButtons();
    subTabsMountOuter = subTabsControlRoot;
  }

  function mountScheduleSubViewFooterActions() {
    if (!scheduleSubViewsInFooter) return;
    const slot = footerActionsSlot || getAppFooterActionsSlot();
    if (!slot) return;
    try {
      slot
        .querySelectorAll(`[${LP_SCHEDULE_CAL_SUBVIEW_FOOTER_ATTR}]`)
        .forEach((n) => n.remove());
    } catch (_) {}
    footerSubViewSwitchers.length = 0;
    for (const v of subViewsList) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = APP_FOOTER_ICON_BTN_CLASS;
      btn.title = v.label;
      btn.setAttribute("aria-label", v.label);
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute(LP_SCHEDULE_CAL_SUBVIEW_FOOTER_ATTR, v.id);
      const short =
        typeof v.footerShortLabel === "string" ? v.footerShortLabel.trim() : "";
      if (short) {
        btn.textContent = short;
      } else {
        const iconSrc =
          LP_SCHEDULE_SUBVIEW_FOOTER_ICONS[v.id] ||
          "/toolbaricons/calendar-alt.png";
        btn.innerHTML = `<img src="${iconSrc}" alt="" width="22" height="22" aria-hidden="true" />`;
      }
      btn.addEventListener("click", () => void renderSubView(v.id));
      slot.appendChild(btn);
      footerSubViewSwitchers.push({ id: v.id, btn });
    }
  }

  function syncScheduleSubViewFooterActive(subViewId) {
    if (!scheduleSubViewsInFooter) return;
    for (const { id, btn } of footerSubViewSwitchers) {
      const on = id === subViewId;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  wrap.appendChild(topRow);

  const contentArea = document.createElement("div");
  contentArea.className = "calendar-view-content-area";
  wrap.appendChild(contentArea);

  const savedSubView = localStorage.getItem(storageKey) || "monthly";
  const inList = subViewsList.some((v) => v.id === savedSubView);
  const initialSubView = dashboardEmbedMode
    ? "monthly"
    : forceInitialMonthlyOnMobile && isMobile
      ? "monthly"
      : inList
        ? savedSubView
        : subViewsList[0]?.id || "monthly";

  function placeSubTabsInNav() {
    if (scheduleSubViewsInFooter || !subTabsControlRoot) return;
    const nav = contentArea.querySelector(".calendar-monthly-nav");
    const controls = contentArea.querySelector(".calendar-nav-controls");
    if (nav && controls && subTabsControlRoot.parentNode !== nav) {
      subTabsControlRoot.remove();
      nav.insertBefore(subTabsControlRoot, controls);
    }
  }

  let _nestedSubViewGen = 0;
  let activeSubViewId = initialSubView;

  /**
   * 서브탭 전환: 뷰는 즉시 마운트. skipPull 아닐 때만 서버 pull 후 `_lpRefreshCalendarView`로 반영.
   * (1주도 동일 — 빈 화면 대기 없음; 과제 기록은 짧은 뒤 갱신)
   */
  function renderSubView(subViewId, subOpts = {}) {
    const skipPull = !!subOpts.skipPull;
    if (activeSubViewId === "1day" && subViewId !== "1day") {
      flushAllPendingTimeDailyBudgetSync();
    }
    activeSubViewId = subViewId;
    dismissCalendarDayExpandUI();
    const gen = ++_nestedSubViewGen;
    if (subViewId === "1week") {
      calendar1WeekDiagLog("renderSubView.start", {
        gen,
        skipPull,
        prefetch: !!window.__lpCalendarGridPrefetchedForTabSwitch,
      });
    }
    dateDebug("renderSubView: saving before switch", {
      subViewId,
      hasSidebar: false,
    });
    saveTodoListBeforeUnmount(contentArea);

    if (gen !== _nestedSubViewGen) return;
    if (subTabsMountOuter?.parentNode) subTabsMountOuter.remove();
    contentArea.innerHTML = "";

    if (subViewId === "monthly") {
      const monthlyLayout = renderMonthlyView(null);
      contentArea.appendChild(monthlyLayout);
    } else if (subViewId === "1week") {
      contentArea.appendChild(
        render1WeekView(null, {
          onOpenDayView: (dateKey) => {
            const offset = lpCalendarDayOffsetFromYmd(dateKey);
            if (offset == null) return;
            void renderSubView("1day", { initialDayOffset: offset });
          },
        }),
      );
      calendar1WeekDiagSnapshot(contentArea, "renderSubView.afterMount1week");
    } else if (subViewId === "annual") {
      contentArea.appendChild(renderAnnualView(null));
    } else if (subViewId === "1day") {
      const initialDayOffset = Number.isFinite(subOpts.initialDayOffset)
        ? Math.trunc(subOpts.initialDayOffset)
        : 0;
      contentArea.appendChild(
        render1DayView(null, {
          hideTimelineCards: true,
          initialDayOffset,
        }),
      );
    }
    if (subTabsControlRoot) {
      subTabsControlRoot.querySelectorAll(".calendar-sub-tab").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.subView === subViewId);
      });
    }
    if (scheduleSubViewsInFooter) {
      syncScheduleSubViewFooterActive(subViewId);
    } else {
      placeSubTabsInNav();
    }
    localStorage.setItem(storageKey, subViewId);

    if (skipPull) {
      if (gen !== _nestedSubViewGen) return;
      const layout = contentArea.querySelector(".calendar-monthly-layout");
      try {
        layout?._lpRefreshCalendarView?.();
      } catch (_) {}
      return;
    }

    void (async () => {
      if (
        typeof window !== "undefined" &&
        window.__lpCalendarGridPrefetchedForTabSwitch
      ) {
        calendar1WeekDiagLog("renderSubView.async.prefetchSkip", {
          gen,
          subViewId,
        });
        try {
          window.__lpCalendarGridPrefetchedForTabSwitch = false;
        } catch (_) {}
        /* App pull 은 어제~오늘만 — 1주 뷰는 해당 주 구간을 여기서 당김(생략하지 않음) */
        if (subViewId === "1week") {
          try {
            const wk = getCalendarGridFor1Week(0);
            const ks = wk
              .map((d) => (d ? formatDateKey(d) : ""))
              .filter(Boolean);
            const rs0 = ks[0];
            const re0 = ks[ks.length - 1];
            if (rs0 && re0) {
              await Promise.all([
                pullTimeLedgerEntriesForDateRange(rs0, re0, { force: true }),
                pullTimeDailyBudgetForDateRange(rs0, re0),
              ]);
            }
          } catch (_) {}
        } else if (subViewId === "1day") {
          try {
            const yEnd = timeLedgerLocalTodayYmd();
            const yStart = timeLedgerLocalYesterdayYmd();
            await Promise.all([
              pullTimeLedgerEntriesForDateRange(yStart, yEnd, { force: true }),
              pullTimeDailyBudgetForDateRange(yStart, yEnd),
              pullCalendar1DayExpectedTaskListFromCloud(),
            ]);
          } catch (_) {}
        }
        if (gen !== _nestedSubViewGen) return;
        const layoutAfterPrefetch = contentArea.querySelector(
          ".calendar-monthly-layout",
        );
        try {
          layoutAfterPrefetch?._lpRefreshCalendarView?.();
        } catch (_) {}
        calendar1WeekDiagSnapshot(contentArea, "prefetchSkip");
        return;
      }
      try {
        const now = new Date();
        const pullCtx =
          subViewId === "1week"
            ? {
                weekDates: getCalendarGridFor1Week(0).filter(Boolean),
              }
            : subViewId === "1day"
              ? {
                  dayYmd: (() => {
                    const off = Number.isFinite(subOpts.initialDayOffset)
                      ? Math.trunc(subOpts.initialDayOffset)
                      : 0;
                    if (off === 0) return timeLedgerLocalTodayYmd();
                    const d = new Date();
                    d.setHours(0, 0, 0, 0);
                    d.setDate(d.getDate() + off);
                    return formatDateKey(d);
                  })(),
                }
              : subViewId === "annual"
                ? { year: now.getFullYear() }
                : { year: now.getFullYear(), monthIndex: now.getMonth() };
        const taskRange = calendarPullRangeForSubView(subViewId, pullCtx);
        await pullCalendarSectionTasksFromSupabase({
          reason: `calendar_nested_${subViewId}`,
          subView: "calendar",
          rangeStart: taskRange.rangeStart,
          rangeEnd: taskRange.rangeEnd,
          force: true,
        });
        if (subViewId === "monthly") {
          await pullCalendarDayIconsFromSupabase({
            reason: `calendar_nested_${subViewId}`,
          });
        }
      } catch (_) {}
      if (subViewId === "1day") {
        try {
          const off = Number.isFinite(subOpts.initialDayOffset)
            ? Math.trunc(subOpts.initialDayOffset)
            : 0;
          const target = new Date();
          target.setHours(0, 0, 0, 0);
          target.setDate(target.getDate() + off);
          const dayYmd = formatDateKey(target);
          const yEnd = dayYmd;
          const yPrev = new Date(target);
          yPrev.setDate(yPrev.getDate() - 1);
          const yStart = formatDateKey(yPrev);
          await Promise.all([
            pullTimeLedgerEntriesForDateRange(yStart, yEnd, { force: true }),
            pullTimeDailyBudgetForDateRange(yStart, yEnd),
            pullCalendar1DayExpectedTaskListFromCloud(),
          ]);
        } catch (_) {}
      } else if (subViewId === "1week") {
        try {
          const wk = getCalendarGridFor1Week(0);
          const ks = wk.map((d) => (d ? formatDateKey(d) : "")).filter(Boolean);
          const rs0 = ks[0];
          const re0 = ks[ks.length - 1];
          if (rs0 && re0) {
            await Promise.all([
              pullTimeLedgerEntriesForDateRange(rs0, re0, { force: true }),
              pullTimeDailyBudgetForDateRange(rs0, re0),
            ]);
          }
        } catch (_) {}
      }
      if (gen !== _nestedSubViewGen) {
        if (subViewId === "1week") {
          calendar1WeekDiagLog("renderSubView.async.staleGen", {
            gen,
            current: _nestedSubViewGen,
          });
        }
        return;
      }
      const layout = contentArea.querySelector(".calendar-monthly-layout");
      if (subViewId === "1week") {
        calendar1WeekDiagLog("renderSubView.async.refresh", { gen });
        calendar1WeekDiagSnapshot(contentArea, "asyncRefreshBefore");
      }
      try {
        layout?._lpRefreshCalendarView?.();
      } catch (_) {}
      if (subViewId === "1week") {
        calendar1WeekDiagSnapshot(contentArea, "asyncRefreshAfter");
      }
    })();
  }

  if (subTabsControlRoot) {
    subTabsControlRoot.querySelectorAll(".calendar-sub-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        subTabsControlRoot
          .querySelectorAll(".calendar-sub-tab")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        void renderSubView(btn.dataset.subView);
      });
    });

    const activeBtn = subTabsControlRoot.querySelector(
      `[data-sub-view="${initialSubView}"]`,
    );
    if (activeBtn) {
      subTabsControlRoot
        .querySelectorAll(".calendar-sub-tab")
        .forEach((b) => b.classList.remove("active"));
      activeBtn.classList.add("active");
    }
  }
  mountScheduleSubViewFooterActions();
  void renderSubView(initialSubView);

  /** App.setActiveTab 에서 이미 pull 한 뒤 — 격자만 갱신(서브뷰 통째 remount·행 높이 재튐 방지) */
  wrap._lpCalendarSoftPullRefresh = () => {
    void (async () => {
      if (activeSubViewId === "monthly") {
        try {
          await pullCalendarDayIconsFromSupabase({
            reason: "calendar_soft_pull_monthly",
          });
        } catch (_) {}
      }
      const layout = contentArea.querySelector(".calendar-monthly-layout");
      if (layout?._lpRefreshCalendarView) {
        try {
          layout._lpRefreshCalendarView();
        } catch (_) {}
        return;
      }
      void renderSubView(activeSubViewId, { skipPull: true });
    })();
  };

  return wrap;
}

function renderCalendarView(tabsElement) {
  return createCalendarSubViewRoot(tabsElement, {
    subViewsList: CALENDAR_SUB_VIEWS,
    storageKey: "calendar-sub-view",
    forceInitialMonthlyOnMobile: true,
  });
}

/** 모바일 하단 '일정' 탭: 월별·1주·연간·타임블록(앱 푸터 아이콘으로 뷰 전환) */
export function renderMobileScheduleCalendar(opts = {}) {
  const dashboardEmbedMode = !!opts?.dashboardEmbedMode;
  const footerActionsSlot = opts?.footerActionsSlot || null;
  const dashboardHost = opts?.dashboardHost || null;
  const dashboardEmbedKey = String(opts?.dashboardEmbedKey || "").trim();
  const el = document.createElement("div");
  el.className =
    "app-tab-panel-content calendar-view calendar-view--mobile-schedule";

  /* 하단 「일정」탭: 사이드/상단 라벨로 구분 가능 — SCHEDULE·대제목 줄 없음 (태블릿 너비만 보이던 헤더 갭 방지) */

  const contentWrap = document.createElement("div");
  contentWrap.className = "calendar-content-wrap";

  function mountCalendarSubViews() {
    dismissCalendarDayExpandUI();
    contentWrap.innerHTML = "";
    contentWrap.appendChild(
      createCalendarSubViewRoot(null, {
        subViewsList: MOBILE_SCHEDULE_CAL_SUB_VIEWS,
        storageKey: "calendar-mobile-schedule-sub-view",
        forceInitialMonthlyOnMobile: false,
        /* 3분할 embed만 월별 강제 — 확대(전체 탭)는 저장해 둔 1일·1주 등 유지 */
        dashboardEmbedMode,
        scheduleSubViewsInFooter: true,
        footerActionsSlot,
      }),
    );
  }

  el.appendChild(contentWrap);
  mountCalendarSubViews();

  const calendarSoftRefresh = () => {
    if (!el.isConnected) return;
    const wrap = contentWrap.querySelector(".calendar-view-with-subtabs");
    if (wrap && typeof wrap._lpCalendarSoftPullRefresh === "function") {
      wrap._lpCalendarSoftPullRefresh();
      return;
    }
    mountCalendarSubViews();
  };

  if (dashboardEmbedMode && dashboardHost && dashboardEmbedKey) {
    dashboardHost._lpEmbedSoftRefresh = dashboardHost._lpEmbedSoftRefresh || {};
    dashboardHost._lpEmbedSoftRefresh[dashboardEmbedKey] = calendarSoftRefresh;

  } else {
    window.__lpCalendarSoftRefresh = calendarSoftRefresh;
  }

  return el;
}

function renderPlaceholderView(tabsElement, label) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout";

  const main = document.createElement("div");
  main.className = "calendar-monthly-main";

  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    main.appendChild(tabsWrapper);
  }

  const placeholderWrap = document.createElement("div");
  placeholderWrap.className = "calendar-placeholder-wrap";
  const placeholder = document.createElement("p");
  placeholder.className = "calendar-placeholder";
  placeholder.textContent = `${label} (준비 중)`;
  placeholderWrap.appendChild(placeholder);
  main.appendChild(placeholderWrap);

  wrap.appendChild(main);

  return wrap;
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content calendar-view";

  /* 할일 탭: 사이드/하단 메뉴로 구분 — SCHEDULE·대제목 줄 없음 */

  const contentWrap = document.createElement("div");
  contentWrap.className = "calendar-content-wrap";

  let _renderContentGen = 0;
  /* App.setActiveTab(calendar) 에서 이미 pull 했으면 첫 renderContent 의 중복 await 가
   * 빈 본문 한 번 깜빡이는 원인 — 첫 1회만 서브탭 pull 생략 */
  let _calendarMainSubtabPullPrimedByApp = true;

  async function renderContent(opts = {}) {
    const skipSubtabPull = !!opts.skipSubtabPull;
    const view = "todo";

    saveTodoListBeforeUnmount(contentWrap);
    const gen = ++_renderContentGen;

    if (_calendarMainSubtabPullPrimedByApp) {
      _calendarMainSubtabPullPrimedByApp = false;
    } else if (!skipSubtabPull) {
      try {
        await pullCalendarSectionTasksFromSupabase({
          reason: "calendar_main_subtab",
          subView: view,
          forceFull: true,
        });
      } catch (_) {}
      try {
        const yEnd = timeLedgerLocalTodayYmd();
        const yStart = timeLedgerLocalYesterdayYmd();
        await Promise.all([
          pullTimeLedgerEntriesForDateRange(yStart, yEnd, { force: true }),
          pullTimeDailyBudgetForDateRange(yStart, yEnd),
        ]);
      } catch (_) {}
    }
    if (gen !== _renderContentGen) return;

    /* App pull 직후(skipSubtabPull): contentWrap 통째 비우면 상단·설정 줄이 잠깐 사라져 깜빡임 — 할일 뷰는 유지 후 목록만 교체 */
    if (skipSubtabPull && contentWrap.querySelector(".calendar-view-todo")) {
      const existingTodo = contentWrap.querySelector(".calendar-view-todo");
      const reuseBtn = existingTodo?.querySelector(
        "[data-lp-todo-list-settings-btn], .time-ledger-toolbar-icons .todo-list-settings-btn, .todo-list-settings-btn",
      );
      const todoMain = existingTodo.querySelector(".calendar-todo-main");
      const todoListView = todoMain?.querySelector(".todo-list-view");
      const remount = todoListView?._lpRemountTodoSectionsAfterCalendarPull;
      if (typeof remount === "function") {
        remount();
        persistCalendarMainViewIfValid(view);
        return;
      }
      if (existingTodo && todoMain) {
        try {
          todoListView?._lpTabAbortController?.abort?.();
        } catch (_) {}
        todoMain.querySelector(".calendar-todo-content")?.remove();
        const todoContent = document.createElement("div");
        todoContent.className = "calendar-todo-content";
        todoContent.appendChild(
          renderTodoList({
            hideHeader: true,
            categoryToolbarRightActions: true,
            ...(reuseBtn?.isConnected
              ? { reuseSettingsButtonEl: reuseBtn }
              : {}),
          }),
        );
        todoMain.appendChild(todoContent);
        persistCalendarMainViewIfValid(view);
        return;
      }
    }

    contentWrap.innerHTML = "";
    try {
      contentWrap.appendChild(renderTodoView(null));
      persistCalendarMainViewIfValid(view);
    } catch (err) {
      const errBox = document.createElement("div");
      errBox.className = "calendar-render-error";
      errBox.style.cssText =
        "padding:1rem 1.25rem;margin:1rem;color:#b91c1c;font-size:0.875rem;";
      errBox.innerHTML = `<p><strong>이 화면을 그리는 중 오류가 났습니다.</strong></p><p>${String(err?.message || err)}</p>`;
      contentWrap.appendChild(errBox);
    }
  }

  el.appendChild(contentWrap);

  void renderContent();

  /** App.setActiveTab 에서 pull 후 두 번째 renderMain 대신 — 같은 el 안에서만 할일 본문만 갱신 */
  window.__lpCalendarSoftRefresh = () => {
    if (!el.isConnected) return;
    void renderContent({ skipSubtabPull: true });
  };

  return el;
}

/** 홈 등 다른 화면에서 오늘 해치우기 캘린더만 삽입할 때 사용. tabsElement는 null 가능 */
export { render1DayView };
