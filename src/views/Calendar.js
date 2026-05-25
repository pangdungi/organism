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
  findBudgetScheduleSlotIndex,
  getRowStartInstantForMobileCard,
  getMobileCardEffectiveHoursForPrice,
} from "./Time.js";
import { showToast } from "../utils/showToast.js";
import {
  calendar1WeekDiagLog,
  calendar1WeekDiagSnapshot,
} from "../utils/calendar1WeekDiag.js";
import {
  bindLpHorizontalPanNavigate,
  lpHorizontalPanNavigateRecentlyFired,
} from "../utils/lpHorizontalPanNavigate.js";
import { supabase } from "../supabase.js";
import {
  persistSectionTasksAndSchedule,
  persistCustomSectionTasksAndSchedule,
  pullCalendarSectionTasksFromSupabase,
  upsertCalendarSectionTaskDirectFromModal,
  upsertCalendarSectionTaskRowFromSessionMemory,
} from "../utils/todoSectionTasksSupabase.js";
import { snapshotSectionTasksSemanticForCompare } from "../utils/todoSectionTasksModel.js";
import { TIME_LEDGER_ENTRIES_KEY } from "../utils/timeLedgerEntriesModel.js";
import {
  pullTimeLedgerEntriesForDateRange,
  timeLedgerLocalTodayYmd,
  timeLedgerLocalYesterdayYmd,
} from "../utils/timeLedgerEntriesSupabase.js";
import { pullTimeLedgerTasksFromSupabase } from "../utils/timeLedgerTasksSupabase.js";
import {
  readSectionTasksObject,
  readCustomSectionTasksObject,
} from "../utils/todoSectionTasksModel.js";
import { markTodoAddPendingServerLog } from "../utils/lpTabDataSourceLog.js";
import {
  flushAllPendingTimeDailyBudgetSync,
  pullTimeDailyBudgetFromSupabase,
} from "../utils/timeDailyBudgetSupabase.js";
import { openCalendarExpectedScheduleModal } from "../utils/calendarExpectedScheduleModal.js";
import { resolveTimeTaskDisplayIconSrc } from "../utils/timeTaskIconUrls.js";
import {
  todoQualifiesCalendarShortSpanBarAccent,
  CALENDAR_SHORT_SPAN_BAR_HEX,
} from "../utils/calendarShortSpanBar.js";
import { logLpRender } from "../utils/lpRenderDebugLog.js";
import { FIXED_OTHER_TASKS } from "../utils/timeTaskOptionsConstants.js";
import {
  APP_FOOTER_ICON_BTN_CLASS,
  getAppFooterActionsSlot,
} from "../utils/appFooterShell.js";
/** 꿈·부수입·건강·행복 탭 — 섹션 할일(`readSectionTasksObject`) 키. KPI 탭 할일과 별도 */
const KPI_SECTION_IDS = ["dream", "sideincome", "health", "happy"];

/** 모바일 일정 탭: 푸터 서브뷰 전환 버튼(탭 이탈 시 clearAppFooterActions로 제거) */
const LP_SCHEDULE_CAL_SUBVIEW_FOOTER_ATTR = "data-lp-schedule-cal-subview";

const LP_SCHEDULE_SUBVIEW_FOOTER_ICONS = {
  monthly: "/toolbaricons/calendar-alt.svg",
  "1week": "/toolbaricons/list.svg",
  annual: "/toolbaricons/dashboard.svg",
  "1day": "/toolbaricons/timer.svg",
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
    const t = ev.target;
    if (!t || typeof t.closest !== "function") return;
    let layoutNode = t.closest(".calendar-monthly-layout");
    while (layoutNode) {
      if (typeof layoutNode._lpRefreshCalendarView === "function") {
        try {
          layoutNode._lpRefreshCalendarView();
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
const CAL_1DAY_TIMELINE_PROGRESS_START_TOLERANCE_MIN = 10;
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
  const cs = getComputedStyle(el);
  const n = (prop, def) => {
    const v = parseFloat(cs.getPropertyValue(prop));
    return Number.isFinite(v) && v >= 0 ? v : def;
  };
  return {
    BARS_TOP: n("--cal-bar-stack-offset", fallback.BARS_TOP),
    BAR_HEIGHT: n("--cal-bar-row-min", fallback.BAR_HEIGHT),
    BOTTOM_PAD: n("--cal-bar-bottom-pad", fallback.BOTTOM_PAD),
    ROW_GAP: n("--cal-bar-row-gap", fallback.ROW_GAP),
    WEEK_ROW_MIN: n("--cal-week-row-min", fallback.WEEK_ROW_MIN),
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

/** 월간 막대 행 배치: 같은 날 단일 칸 막대는 항상 세로로 쌓음(두 줄 이상일 때 겹침 방지) */
function calendarMonthlyBarsOverlapForRow(a, b) {
  if (
    a.isSingleDay &&
    b.isSingleDay &&
    Number.isFinite(a.dayIdx) &&
    a.dayIdx === b.dayIdx
  ) {
    return true;
  }
  return a.left < b.left + b.width && b.left < a.left + a.width;
}

function lpCalendarAssignMonthlyBarRows(allBars) {
  const rowBars = [];
  allBars.forEach((b) => {
    let row = 0;
    while (
      rowBars[row] &&
      rowBars[row].some((r) => calendarMonthlyBarsOverlapForRow(r, b))
    ) {
      row += 1;
    }
    if (!rowBars[row]) rowBars[row] = [];
    rowBars[row].push(b);
    b.row = row;
  });
}

function lpCalendarMeasureMonthlySpanBarHeightPx(el) {
  if (!el) return 0;
  let h = 0;
  try {
    h = el.getBoundingClientRect().height;
  } catch (_) {}
  if (!(h > 0.5)) {
    h = el.offsetHeight || el.scrollHeight || 0;
  }
  return h;
}

function snapshotCalendarGridPaintSignature(viewContext = "") {
  let ledger = "";
  try {
    ledger = localStorage.getItem(TIME_LEDGER_ENTRIES_KEY) ?? "";
  } catch (_) {}
  return `${snapshotSectionTasksSemanticForCompare()}\x1e${ledger}\x1e${viewContext}`;
}

/** pull·소프트 갱신: 할일 데이터가 같으면 renderCalendar 생략 */
function lpAttachCalendarGridRefreshGuard(wrap, runRender, viewContextFn = () => "") {
  wrap._lpRefreshCalendarView = () => {
    const sig = snapshotCalendarGridPaintSignature(viewContextFn());
    if (sig === wrap._lpLastCalendarGridPaintSig) {
      calendar1WeekDiagLog("refreshGuard.skipSameSig", {
        ctx: viewContextFn(),
      });
      return;
    }
    calendar1WeekDiagLog("refreshGuard.runRender", { ctx: viewContextFn() });
    runRender();
  };
  wrap._lpRememberCalendarGridPaintSig = () => {
    wrap._lpLastCalendarGridPaintSig = snapshotCalendarGridPaintSignature(
      viewContextFn(),
    );
  };
}

/** layout-pending → layout-ready (막대 재측정 후 표시) */
function lpRevealCalendarGridLayout(calendarGrid, reason) {
  if (!calendarGrid) return;
  if (!calendarGrid.classList.contains("calendar-monthly-grid--layout-pending")) {
    return;
  }
  calendarGrid.classList.remove("calendar-monthly-grid--layout-pending");
  calendarGrid.classList.add("calendar-monthly-grid--layout-ready");
  calendar1WeekDiagLog("layoutPass.reveal", {
    reason,
    connected: !!calendarGrid.isConnected,
  });
  calendar1WeekDiagSnapshot(calendarGrid, reason);
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
function lpBeginCalendarGridLayoutPass(calendarGrid) {
  if (!calendarGrid) {
    return { trackWeek: () => () => {} };
  }
  calendarGrid.classList.add("calendar-monthly-grid--layout-pending");
  calendarGrid.classList.remove("calendar-monthly-grid--layout-ready");
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
  if (!barsWithRow.length || !weekRow) {
    calendar1WeekDiagLog("finalizeBarRow.skip", {
      bars: barsWithRow.length,
      hasWeekRow: !!weekRow,
    });
    onSettled?.();
    return;
  }
  const { WEEK_ROW_MIN } = lpCalendarWeekBarLayoutMetrics(weekRow);
  const maxRow = Math.max(...barsWithRow.map((b) => b.row), 0);
  const baseTop = BARS_TOP + 0.1;

  const run = () => {
    if (!weekRow.isConnected) return;
    const rootFont =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const pxToRem = (px) => px / rootFont;
    const rowMaxPx = [];
    for (const b of barsWithRow) {
      const el = b._barEl;
      if (!el || !el.isConnected) continue;
      const h = lpCalendarMeasureMonthlySpanBarHeightPx(el);
      const r = b.row;
      rowMaxPx[r] = Math.max(rowMaxPx[r] || 0, h);
    }
    let topAcc = baseTop;
    const rowTopRem = [];
    for (let r = 0; r <= maxRow; r++) {
      rowTopRem[r] = topAcc;
      const slotRem = Math.max(
        BAR_HEIGHT,
        rowMaxPx[r] != null ? pxToRem(rowMaxPx[r]) : BAR_HEIGHT,
      );
      topAcc += slotRem;
      if (r < maxRow) topAcc += gap;
    }
    for (const b of barsWithRow) {
      if (b._barEl?.isConnected) {
        b._barEl.style.top = `${rowTopRem[b.row]}rem`;
      }
    }
    const subPxSlackRem = 0.12;
    const requiredHeight = topAcc + BOTTOM_PAD + subPxSlackRem;
    weekRow.style.minHeight = `${Math.max(WEEK_ROW_MIN, requiredHeight)}rem`;
  };

  let pass = 0;
  const maxPasses = 5;
  const step = () => {
    run();
    pass += 1;
    if (pass < maxPasses && barsWithRow.some((b) => b._barEl?.isConnected)) {
      requestAnimationFrame(step);
    } else {
      calendar1WeekDiagLog("finalizeBarRow.settled", {
        pass,
        maxPasses,
        bars: barsWithRow.length,
        weekRowConnected: !!weekRow?.isConnected,
      });
      onSettled?.();
    }
  };
  requestAnimationFrame(step);
}

/** 1주 플로우: 본문 최소 높이를 스크롤창·콘텐츠 중 큰 값으로 맞춰 열 세로 구분선이 뷰포트까지 끊기지 않게 */
function lpSync1WeekMobileFlowBodyToScrollViewport(scrollEl, bodyEl) {
  if (!scrollEl || !bodyEl) return;
  try {
    if (!scrollEl.isConnected || !bodyEl.isConnected) return;
  } catch (_) {
    return;
  }
  bodyEl.style.removeProperty("min-height");
  const natural = bodyEl.scrollHeight;
  const ch = scrollEl.clientHeight;
  const h = Math.round(Math.max(ch, natural));
  if (h <= 0) return;
  const last = bodyEl._lpFlowMinHApplied;
  if (last != null && Math.abs(last - h) <= 2) {
    bodyEl.style.minHeight = `${last}px`;
    return;
  }
  bodyEl._lpFlowMinHApplied = h;
  bodyEl.style.minHeight = `${h}px`;
}

function lpAttach1WeekMobileFlowBodyMinSync(wrap, scrollEl, bodyEl) {
  if (!wrap || !scrollEl || !bodyEl) return;
  try {
    wrap._lp1WeekFlowBodyMinRo?.disconnect();
  } catch (_) {}
  wrap._lp1WeekFlowBodyMinRo = null;
  if (typeof ResizeObserver === "undefined") {
    requestAnimationFrame(() => {
      lpSync1WeekMobileFlowBodyToScrollViewport(scrollEl, bodyEl);
    });
    return;
  }
  let roRaf = null;
  const ro = new ResizeObserver(() => {
    if (roRaf != null) return;
    roRaf = requestAnimationFrame(() => {
      roRaf = null;
      lpSync1WeekMobileFlowBodyToScrollViewport(scrollEl, bodyEl);
    });
  });
  ro.observe(scrollEl);
  ro.observe(bodyEl);
  wrap._lp1WeekFlowBodyMinRo = ro;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      lpSync1WeekMobileFlowBodyToScrollViewport(scrollEl, bodyEl);
    });
  });
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
}

/** 같은 마감일·같은 섹션: 세션 배열 순서 그대로(뒤에 push된 할 일이 캘린더에서도 아래행). */
function tasksForCalendarSameDayInStorageOrder(arr, dateKey) {
  return arr.filter(
    (t) =>
      (t.name || "").trim() !== "" &&
      (t.dueDate || "").slice(0, 10) === dateKey,
  );
}

/** 월간 막대: 단일일 항목의 세로 순서(큰 값 = 아래줄). 서버 갱신시각 → 캘린더 칸 전용 터치 ms → 없으면 0 */
function calendarSingleDayStackMs(t) {
  const u = String(t.serverUpdatedAt || "").trim();
  if (u) {
    const ms = Date.parse(u);
    if (!Number.isNaN(ms)) return ms;
  }
  const c = Number(t._calCellTouchMs);
  if (Number.isFinite(c) && c > 0) return c;
  return 0;
}

/**
 * 월간 그리드에서 같은 날 단일일 막대는 이 순서로 쌓음 — 최근 추가/수정이 맨 아래.
 * 시간 정보가 전부 같으면 getTasksForDate가 준 순서 유지(안정 정렬).
 */
function orderSingleDayTasksForMonthlyBarStack(tasks) {
  const list = Array.isArray(tasks) ? tasks.slice() : [];
  const indexed = list.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    const ma = calendarSingleDayStackMs(a.t);
    const mb = calendarSingleDayStackMs(b.t);
    if (ma !== mb) return ma - mb;
    return a.i - b.i;
  });
  return indexed.map(({ t }) => t);
}

function getSectionTasksForDate(dateKey) {
  const out = [];
  try {
    const obj = readSectionTasksObject();
    KPI_SECTION_IDS.forEach((sectionId) => {
      const arr = obj[sectionId];
      if (!Array.isArray(arr)) return;
      const sectionLabel =
        {
          dream: "꿈",
          sideincome: "부수입",
          health: "건강",
          happy: "행복",
        }[sectionId] || sectionId;
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
    KPI_SECTION_IDS.forEach((sectionId) => {
      const arr = obj[sectionId];
      if (!Array.isArray(arr)) return;
      const sectionLabel =
        {
          dream: "꿈",
          sideincome: "부수입",
          health: "건강",
          happy: "행복",
        }[sectionId] || sectionId;
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
const MONTH_NAMES_EN = [
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

function lpShowTimeBlockHoverTipFromRect(
  rect,
  taskName,
  rangeStr,
  bgCss,
  fgCss,
  memoExtra,
) {
  const tip = lpEnsureTimeBlockHoverTip();
  const fg = fgCss || "#ffffff";
  const memoHtml = (memoExtra || "").trim()
    ? `<div class="lp-time-block-hover-tip__memo">${escapeHtml(String(memoExtra).trim())}</div>`
    : "";
  tip.innerHTML = `<div class="lp-time-block-hover-tip__title">${escapeHtml((taskName || "").trim())}</div><div class="lp-time-block-hover-tip__meta">${escapeHtml(rangeStr || "")}</div>${memoHtml}`;
  tip.style.backgroundColor = bgCss || "#4b5563";
  tip.style.color = fg;
  tip.classList.add("lp-time-block-hover-tip--visible");
  requestAnimationFrame(() => {
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = rect.left + rect.width / 2 - tw / 2;
    let top = rect.bottom + pad;
    if (top + th > vh - pad) top = Math.max(pad, rect.top - th - pad);
    if (left < pad) left = pad;
    if (left + tw > vw - pad) left = Math.max(pad, vw - tw - pad);
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  });
}

/** 좁은 타임블록: 본문 대신 호버 시 블록 배경색 맞춤 툴팁(터치는 토스트) */
function lpAttachColoredTimeBlockTooltip(el, opts) {
  if (!el || typeof el.addEventListener !== "function") return;
  const taskName = (opts.taskName || "").trim();
  const rangeStr = opts.rangeStr || "";
  const memoStr = (opts.memo || "").trim();
  const bgCss = opts.bgCss || "";
  const fgCss = opts.accentCss || opts.fgCss || "";
  const show = () => {
    clearTimeout(_lpTimeBlockHoverTipHideTimer);
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    lpShowTimeBlockHoverTipFromRect(
      r,
      taskName,
      rangeStr,
      bgCss,
      fgCss || "#ffffff",
      memoStr,
    );
  };
  const hide = () => {
    _lpTimeBlockHoverTipHideTimer = setTimeout(lpHideTimeBlockHoverTip, 60);
  };
  el.addEventListener("mouseenter", show);
  el.addEventListener("mouseleave", hide);
  el.addEventListener("mousedown", hide);
  try {
    if (window.matchMedia("(hover: none)").matches) {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        showToast(
          [taskName || "일정", rangeStr, memoStr].filter(Boolean).join("\n"),
        );
      });
    }
  } catch (_) {}
}

const CALENDAR_CATEGORIES = [
  { id: "dream", label: "꿈" },
  { id: "sideincome", label: "부수입" },
  { id: "health", label: "건강" },
  { id: "happy", label: "행복" },
];

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
  if (KPI_SECTION_IDS.includes(barData.sectionId) && barData.taskId) {
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
    dataTransferHasType(dataTransfer, DRAG_TYPE_TODO_TO_CALENDAR) ||
    dataTransferHasType(dataTransfer, DRAG_TYPE_CALENDAR_SPAN) ||
    dataTransferHasType(dataTransfer, "application/json") ||
    dataTransferHasType(dataTransfer, "text/plain")
  );
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
function lpAttachCalendarBarOpenTodoEdit(
  bar,
  b,
  renderCalendar,
  refreshTodoList,
) {
  const sid = String(b.sectionId || "").trim();
  const tid = String(b.taskId || "").trim();
  if (!tid || !sid) return;
  bar.addEventListener("click", (e) => {
    e.stopPropagation();
    openTodoTaskEditFromCalendarBarModel(b, {
      selectionEl: bar,
      onAfterApply: () => {
        try {
          renderCalendar?.();
        } catch (_) {}
        try {
          refreshTodoList?.();
        } catch (_) {}
      },
    });
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
  return tasks;
}

function getAllTasksForDateDisplay(dateKey) {
  const singleDay = getTasksForDate(dateKey, false);
  const rangeTasks = getAllTasksWithDateRange().filter((t) => {
    const s = (t.startDate || "").slice(0, 10);
    const d = (t.dueDate || "").slice(0, 10);
    return s && d && s <= dateKey && dateKey <= d;
  });
  const seen = new Set();
  return [...singleDay, ...rangeTasks].filter((t) => {
    const id =
      (t.taskId || t.name || "") + (t.startDate || "") + (t.dueDate || "");
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
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
  sectionId,
  dueYmd,
  name,
  itemType = "todo",
) {
  const sid = String(sectionId || "").trim();
  const due = String(dueYmd || "")
    .trim()
    .slice(0, 10);
  const todoName = String(name || "").trim();
  if (!sid || !due || !todoName || !KPI_SECTION_IDS.includes(sid)) return false;
  const it =
    String(itemType || "todo").toLowerCase() === "schedule"
      ? "schedule"
      : "todo";
  const taskId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "";
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
      startDate: "",
      dueDate: due,
      startTime: "",
      endTime: "",
      done: false,
      itemType: it,
      serverUpdatedAt: new Date(touch).toISOString(),
      _calCellTouchMs: touch,
    });
    persistSectionTasksAndSchedule(obj);
    const task = {
      taskId,
      name: todoName,
      startDate: "",
      dueDate: due,
      startTime: "",
      endTime: "",
      eisenhower: "",
      done: false,
      itemType: it,
      reminderDate: "",
      reminderTime: "",
    };
    markTodoAddPendingServerLog({ taskId, sectionId: sid });
    void upsertCalendarSectionTaskDirectFromModal({
      task,
      sectionKey: sid,
      isCustom: false,
      sortOrder,
    }).catch(() => {});
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
  detachCalendarEventBubbleOutsideListener();
  document
    .querySelectorAll(".calendar-event-bubble, .calendar-day-expand-overlay")
    .forEach((el) => el.remove());
  const overlayEl = document.createElement("div");
  overlayEl.className = "calendar-day-expand-overlay";
  document.body.appendChild(overlayEl);
  const bubble = document.createElement("div");
  bubble.className = "calendar-event-bubble calendar-event-bubble--mobile";
  bubble.innerHTML = `
    <div class="calendar-event-bubble-tail"></div>
    <div class="calendar-event-bubble-body">
      <div class="calendar-event-bubble-header">
        <span class="calendar-event-bubble-date">${dateKey.replace(/-/g, ". ")}</span>
        <button type="button" class="calendar-event-bubble-close" title="닫기">×</button>
      </div>
      <div class="calendar-event-bubble-category">
        <label class="calendar-event-bubble-label">카테고리</label>
        <select class="calendar-event-bubble-select">
          ${CALENDAR_CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join("")}
        </select>
      </div>
      <div class="calendar-event-bubble-name">
        <input type="text" name="calendar-event-name" class="calendar-event-bubble-input" placeholder="할일을 입력하세요" />
        <label class="calendar-event-bubble-schedule-check">
          <input type="checkbox" class="calendar-event-bubble-schedule-checkbox" />
          <span>일정으로 변경</span>
        </label>
      </div>
      <button type="button" class="calendar-event-bubble-save">추가</button>
    </div>
  `;

  const close = () => {
    detachCalendarEventBubbleOutsideListener();
    overlayEl.remove();
    bubble.remove();
    onClose?.();
  };

  bubble
    .querySelector(".calendar-event-bubble-close")
    .addEventListener("click", close);

  const scheduleCheckbox = bubble.querySelector(
    ".calendar-event-bubble-schedule-checkbox",
  );

  bubble
    .querySelector(".calendar-event-bubble-save")
    .addEventListener("click", () => {
      const name = (
        bubble.querySelector(".calendar-event-bubble-input").value || ""
      ).trim();
      const categoryId = bubble.querySelector(
        ".calendar-event-bubble-select",
      ).value;
      if (!name) return;
      const asSchedule = !!scheduleCheckbox?.checked;
      const itemType = asSchedule ? "schedule" : "todo";
      if (
        !addSectionTodoFromCalendarBubble(categoryId, dateKey, name, itemType)
      ) {
        alert("할 일을 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      onSave?.({
        name,
        dueDate: dateKey,
        sectionId: categoryId,
        itemType,
      });
      close();
    });

  bubble
    .querySelector(".calendar-event-bubble-input")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter")
        bubble.querySelector(".calendar-event-bubble-save").click();
    });

  Object.assign(bubble.style, {
    position: "fixed",
    zIndex: "1002",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: "min(22rem, calc(100vw - 1.25rem))",
    maxHeight: "min(85vh, 520px)",
    overflowY: "auto",
  });

  document.body.appendChild(bubble);

  setTimeout(() => {
    _calendarEventBubbleOutsideHandler = (e) => {
      if (bubble.contains(e.target)) return;
      close();
    };
    document.addEventListener(
      "pointerdown",
      _calendarEventBubbleOutsideHandler,
    );
  }, 0);

  bubble.querySelector(".calendar-event-bubble-input").focus();
  return bubble;
}

/** 기본 행 높이는 이 개수(3개) 분량, 그 이상이면 행을 늘려 전부 표시 */
const MAX_VISIBLE_BARS_PER_DAY = 3;

/** 이전 날짜 확대 버블의 document 클릭 리스너 제거(연간 연속 호버 등으로 close 미경유 DOM 제거 시 누수 방지) */
let _calendarDayExpandOutsideHandler = null;

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
    /** 연간 뷰 등: × 숨김 */
    hideCloseButton = false,
    /** false면 바깥 클릭으로 닫지 않음(호버 전용) */
    dismissOnOutsideClick = false,
    /** 연간 호버 시 모바일 전체 오버레이 생략 */
    useMobileOverlay = true,
  } = options;
  const isMobile = window.matchMedia("(max-width: 48rem)").matches;
  if (_calendarDayExpandOutsideHandler) {
    document.removeEventListener("click", _calendarDayExpandOutsideHandler);
    _calendarDayExpandOutsideHandler = null;
  }
  detachCalendarEventBubbleOutsideListener();
  document
    .querySelectorAll(".calendar-event-bubble, .calendar-day-expand-overlay")
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
      const isSchedule =
        String(t.itemType || "todo").toLowerCase() === "schedule";
      return `
    <div class="calendar-day-expand-item${isSchedule ? " calendar-day-expand-item--schedule" : ""}${t.done ? " calendar-day-expand-item--done" : ""}" data-done="${!!t.done}" data-item-type="${isSchedule ? "schedule" : "todo"}">
      <div class="calendar-day-expand-main">
        <span class="calendar-day-expand-text">${escapeHtml(t.name || "")}</span>
        ${t.startTime || t.endTime ? `<span class="calendar-day-expand-time">${[t.startTime, t.endTime].filter(Boolean).join(" ~ ")}</span>` : ""}
      </div>
    </div>
  `;
    })
    .join("");
  const addBtnHtml = onAdd
    ? '<button type="button" class="calendar-day-expand-add-btn">할일 추가</button>'
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
      <div class="calendar-day-expand-list">${taskItems || "<div class='calendar-day-expand-empty'>할일 없음</div>"}</div>
      ${addBtnHtml}
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
        e.target.closest(".calendar-day-expand-add-btn")
      )
        return;
      e.stopPropagation();
      try {
        close();
      } catch (_) {}
      openTodoTaskEditFromCalendarBarModel(t, {
        selectionEl: itemEl,
        onAfterApply: () => {
          try {
            onAfterTaskEdit?.();
          } catch (_) {}
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
    Object.assign(bubble.style, {
      position: "fixed",
      left: `${Math.min(cellRect.left, window.innerWidth - 280)}px`,
      top: `${top}px`,
      zIndex: "1002",
    });
  }

  document.body.appendChild(bubble);

  if (!isMobile && positionBelow) {
    const bubbleHeight = bubble.getBoundingClientRect().height;
    if (
      cellRect.bottom + 4 + bubbleHeight >
      window.innerHeight - BUBBLE_PADDING
    ) {
      bubble.style.top = `${cellRect.top - bubbleHeight - 4}px`;
    }
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
        onSave?.();
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
        alert("마감일을 입력해 주세요.");
        return;
      }
      if (newStart && newStart > newDue) {
        alert("시작일은 마감일보다 이전이어야 합니다.");
        return;
      }
      let ok = false;
      if (KPI_SECTION_IDS.includes(barData.sectionId) && barData.taskId) {
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
        onSave?.();
        close();
      }
    });

  const revertBtn = bubble.querySelector(".calendar-bar-revert-btn");
  if (revertBtn) {
    revertBtn.addEventListener("click", () => {
      if (revertTaskToTodoList(barData)) {
        onSave?.();
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
  bubble.querySelector('input[data-field="start"]')?.focus();
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
      <button type="button" class="calendar-nav-today" title="Today">Today</button>
      <button type="button" class="calendar-nav-next" title="다음 달">&gt;</button>
    </div>
  `;

  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar-monthly-grid";

  function refreshTodoList() {}

  function renderCalendar() {
    const grid = getCalendarGrid(currentYear, currentMonth);
    lpCalendarNavQ(nav, wrap, ".calendar-nav-month").textContent =
      MONTH_NAMES_EN[currentMonth];
    lpCalendarNavQ(nav, wrap, ".calendar-nav-year").textContent =
      String(currentYear);

    calendarGrid.innerHTML = "";
    const layoutPass = lpBeginCalendarGridLayoutPass(calendarGrid);

    const dayHeader = document.createElement("div");
    dayHeader.className = "calendar-monthly-weekdays";
    DAY_NAMES.forEach((name) => {
      const cell = document.createElement("div");
      cell.className = "calendar-monthly-weekday";
      cell.textContent = name;
      dayHeader.appendChild(cell);
    });
    calendarGrid.appendChild(dayHeader);

    const todayKey = formatDateKey(new Date());
    const rangeTasks = getAllTasksWithDateRange();

    grid.forEach((week) => {
      const weekWrap = document.createElement("div");
      weekWrap.className = "calendar-monthly-week-wrap";
      const weekRow = document.createElement("div");
      weekRow.className = "calendar-monthly-week";
      const weekDateKeys = week
        .map((d) => (d ? formatDateKey(d) : ""))
        .filter(Boolean);
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
        const entriesEl = document.createElement("div");
        entriesEl.className = "calendar-monthly-day-entries";
        cell.appendChild(entriesEl);

        cell.style.cursor = "pointer";
        cell.addEventListener(
          "click",
          (e) => {
            if (e.target.closest?.(".calendar-monthly-span-bar")) return;
            if (
              window.matchMedia("(max-width: 48rem)").matches &&
              cell.contains(e.target)
            ) {
              e.stopPropagation();
              e.preventDefault();
              const rect = cell.getBoundingClientRect();
              const tasks = getAllTasksForDateDisplay(key);
              createCalendarDayExpandBubble(rect, key, tasks, () => {}, {
                positionBelow: true,
                onAfterTaskEdit: () => {
                  renderCalendar();
                  refreshTodoList();
                },
                onAdd: () => {
                  createCalendarEventBubble(
                    rect,
                    key,
                    () => {
                      renderCalendar();
                      refreshTodoList();
                    },
                    () => {},
                  );
                },
              });
              return;
            }
          },
          true,
        );
        cell.addEventListener("click", (e) => {
          if (e.target.closest(".calendar-event-bubble")) return;
          e.stopPropagation();
          const rect = cell.getBoundingClientRect();
          const isMobile = window.matchMedia("(max-width: 48rem)").matches;
          if (isMobile) {
            return;
          }
          createCalendarEventBubble(
            rect,
            key,
            () => {
              void renderCalendar();
              refreshTodoList();
            },
            () => {},
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
          const targetDate = key;
          const oldStart = (payload.startDate || "").slice(0, 10);
          const oldDue = (payload.dueDate || "").slice(0, 10);
          let newStart = "";
          let newDue = targetDate;
          if (oldStart && oldDue && oldStart !== oldDue) {
            const startD = new Date(oldStart + "T12:00:00");
            const dueD = new Date(oldDue + "T12:00:00");
            const daysDiff = Math.round((dueD - startD) / 86400000);
            newStart = targetDate;
            newDue = addDaysToDateKey(targetDate, daysDiff);
          } else if (oldStart && oldDue) {
            newStart = targetDate;
          }
          let ok = false;
          if (payload.sectionId && payload.sectionId.startsWith("custom-")) {
            ok = updateCustomSectionTaskDates(
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
          } else if (
            KPI_SECTION_IDS.includes(payload.sectionId) &&
            ((payload.taskId || "").trim() || (payload.name || "").trim())
          ) {
            ok =
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
              });
          }
          dateDebug("drop on day", {
            targetDate: key,
            name: payload?.name,
            sectionId: payload?.sectionId,
            taskId: payload?.taskId,
            newStart,
            newDue,
            ok,
          });
          if (ok) {
            syncCalendarSectionTaskToServerAfterCalendarDateDrop(payload, ok);
            renderCalendar();
            refreshTodoList();
          }
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
      rangeTasks.forEach((t) => {
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
            _calPrevStart:
              (t._calPrevStart || "").toString().slice(0, 10) || "",
            _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
          });
        });
      });
      lpCalendarAssignMonthlyBarRows(allBars);
      const barsPerDay = weekDateKeys.map((_, dayIdx) =>
        allBars
          .filter((b) => b.isSingleDay && b.dayIdx === dayIdx)
          .sort((a, b) => a.row - b.row),
      );
      /* 막대 줄 수에 맞춰 해당 주 행만 높이 확장(빈 주는 최소 높이만) */
      allBars.forEach((b) => {
        b.isOverflow = false;
      });
      const maxRow = allBars.length
        ? Math.max(...allBars.map((b) => b.row), 0)
        : -1;
      const rowsNeeded = allBars.length ? maxRow + 1 : 0;
      weekRow.style.minHeight = `${lpCalendarMonthlyWeekRowTargetMinHeightRem(
        baseBarTop,
        rowsNeeded,
        BAR_HEIGHT,
        ROW_GAP,
        BOTTOM_PAD,
        WEEK_ROW_MIN,
      )}rem`;
      const barsWithRow = allBars;
      barsWithRow.forEach((b) => {
        const isTodo = (b.itemType || "todo").toLowerCase() === "todo";
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
        bar.style.cssText = `left:${b.left}%;width:${b.width}%;${barStyleVars};top:${baseBarTop + b.row * (BAR_HEIGHT + ROW_GAP)}rem`;
        lpApplyCalendarMultiDaySpanBarBackground(bar, b);
        bar.innerHTML = `<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
        if (isTodo && b.done) {
          bar.classList.add("is-completed");
        }
        lpAttachCalendarBarOpenTodoEdit(
          bar,
          b,
          renderCalendar,
          refreshTodoList,
        );
        if (!b.isSingleDay && b.startDate && b.dueDate) {
          bar.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            createCalendarBarDateEditBubble(
              e.clientX,
              e.clientY,
              b,
              () => {
                renderCalendar();
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
              () => {
                renderCalendar();
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
        const targetDate = cell.dataset.date;
        const oldStart = (payload.startDate || "").slice(0, 10);
        const oldDue = (payload.dueDate || "").slice(0, 10);
        let newStart = "";
        let newDue = targetDate;
        if (oldStart && oldDue && oldStart !== oldDue) {
          const startD = new Date(oldStart + "T12:00:00");
          const dueD = new Date(oldDue + "T12:00:00");
          const daysDiff = Math.round((dueD - startD) / 86400000);
          newStart = targetDate;
          newDue = addDaysToDateKey(targetDate, daysDiff);
        } else if (oldStart && oldDue) {
          newStart = targetDate;
        }
        let ok = false;
        if (payload.sectionId && payload.sectionId.startsWith("custom-")) {
          ok = updateCustomSectionTaskDates(
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
        } else if (
          KPI_SECTION_IDS.includes(payload.sectionId) &&
          ((payload.taskId || "").trim() || (payload.name || "").trim())
        ) {
          ok =
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
            });
        }
        if (ok) {
          syncCalendarSectionTaskToServerAfterCalendarDateDrop(payload, ok);
          renderCalendar();
          refreshTodoList();
        }
      });
      weekWrap.appendChild(weekRow);
      weekWrap.appendChild(barsEl);
      weekWrap.appendChild(moreEl);
      calendarGrid.appendChild(weekWrap);
    });
    wrap._lpRememberCalendarGridPaintSig?.();
  }

  function goPrevMonth() {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar();
  }

  function goNextMonth() {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar();
  }

  lpCalendarNavQ(nav, wrap, ".calendar-nav-today").addEventListener(
    "click",
    () => {
      const now = new Date();
      currentYear = now.getFullYear();
      currentMonth = now.getMonth();
      renderCalendar();
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

  /* 월 그리드: 왼쪽=다음 달, 오른쪽=이전 달 (터치·마우스·트랙패드 가로) */
  bindLpHorizontalPanNavigate(calendarGrid, {
    onNext: goNextMonth,
    onPrev: goPrevMonth,
    minDx: 56,
    dominance: 1.25,
    shouldIgnoreTarget: (target) =>
      !!target?.closest?.("input, textarea, select, button, a, [role='dialog']"),
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
      delete clipped._timeIdx;
      out.push({
        ...clipped,
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

  for (const [taskName, data] of Object.entries(budgetGoals)) {
    if (taskName.startsWith(budgetPlaceholderPrefix)) continue;
    const times = getScheduledTimesForTask(data);
    const memos = Array.isArray(data?.scheduleMemos) ? data.scheduleMemos : [];
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
      const opt = getTaskOptionByName(taskName);
      const prod = opt?.productivity || "other";
      const scheduleMemo = String(memos[timeIdx] || "").trim();
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

/** 일간 타임라인과 동일한 스팬 기준: 새 예상 일정의 제안 시작 시각(빈 날이면 00:00) */
function defaultStartHhMmForExpectedModalFromDateKey(dateKey) {
  const { spans } = buildExpectedScheduleSpansForDateKey(dateKey);
  if (!spans.length) return "00:00";
  const maxEnd = Math.max(...spans.map((s) => Number(s.endMin) || 0));
  const h = Math.floor(maxEnd / 60) % 24;
  const mi = maxEnd % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/** 0~24h 안에서 예상 일정 구간 겹침을 합쳐 실제로 덮인 분(합집합 길이) */
function minutesCoveredByExpectedSpansUnion(spans) {
  if (!Array.isArray(spans) || spans.length === 0) return 0;
  const dayCap = 24 * 60;
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

/** 주간 플로우만: 수면하기(sleep) 카드 숨김 — 일간 타임라인은 그대로 표시 */
const WEEK_FLOW_EXCLUDED_TASK_NAMES = new Set(
  FIXED_OTHER_TASKS.filter((t) => t.category === "sleep").map((t) => t.name),
);

function expectedSpanHiddenFromWeekFlowOnly(span) {
  return WEEK_FLOW_EXCLUDED_TASK_NAMES.has(String(span?.taskName || "").trim());
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

function render1DayView(tabsElement = null) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-1day-view";
  wrap.dataset.lpHomeTodayTimeline = "1";

  let dayOffset = 0;
  /** Date#getDay() 용 (0=일) — 네비 날짜 옆 요일 표기 */
  const NAV_WEEKDAYS_EN_SUN0 = [
    "sun",
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
  ];
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
      <div class="time-filter-date-field calendar-1day-nav-date-field" role="button" tabindex="0" aria-label="날짜 선택">
        <input type="date" class="calendar-1day-nav-date-input" aria-label="날짜 선택" />
        <img src="/toolbaricons/calendar-alt.svg" alt="" class="time-filter-date-cal-icon" width="18" height="18" aria-hidden="true" />
      </div>
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
    const wEn = NAV_WEEKDAYS_EN_SUN0[targetDate.getDay()] || "";
    const mdPart = `${m}/${d}`;
    const dowPart = `(${wEn})`;

    const dateFieldEl = lpCalendarNavQ(
      nav,
      wrap,
      ".calendar-1day-nav-date-field",
    );
    const dateInp = lpCalendarNavQ(nav, wrap, ".calendar-1day-nav-date-input");
    if (dateInp) {
      const nextKey = formatDateKey(targetDate);
      if (dateInp.value !== nextKey) dateInp.value = nextKey;
      const label =
        dayOffset === 0
          ? `오늘 · ${y}년 ${m}월 ${d}일. 날짜 선택`
          : `${y}년 ${m}월 ${d}일. 날짜 선택`;
      dateInp.setAttribute("aria-label", label);
      if (dateFieldEl) {
        dateFieldEl.title = label;
        dateFieldEl.setAttribute("aria-label", label);
      }
    }

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
    const remainingMinutes = Math.max(0, 24 * 60 - plannedMinutes);

    const remainingBar = document.createElement("div");
    remainingBar.className = "calendar-1day-timeline-remaining";
    const remainingMain = document.createElement("div");
    remainingMain.className = "calendar-1day-timeline-remaining-main";
    const remainingLabel = document.createElement("span");
    remainingLabel.textContent = "남은 시간:";
    const remainingValue = document.createElement("span");
    remainingValue.textContent = formatMinutesAsCompactHm(remainingMinutes);
    remainingValue.title = `이 날 24시간 중 예상 일정으로 덮인 시간: ${formatMinutesAsCompactHm(plannedMinutes)}`;
    remainingLabel.title =
      "같은 날짜 예상 시간(합쳐서 겹침은 한 번만 계산)을 모두 쓰고도 남은 분입니다.";
    remainingMain.appendChild(remainingLabel);
    remainingMain.appendChild(remainingValue);
    remainingBar.appendChild(remainingMain);

    const addExpectedBtn = document.createElement("button");
    addExpectedBtn.type = "button";
    addExpectedBtn.className = "calendar-1day-nav-add";
    addExpectedBtn.title = "예상 일정(계획) 추가";
    addExpectedBtn.textContent = "+ 계획";
    addExpectedBtn.setAttribute("aria-label", "이 날 예상 일정 추가");
    addExpectedBtn.addEventListener("click", () => {
      const td = new Date();
      td.setDate(td.getDate() + dayOffset);
      const key = formatDateKey(td);
      openCalendarExpectedScheduleModal({
        dateKey: key,
        defaultStartHhMm: defaultStartHhMmForExpectedModalFromDateKey(key),
        onSaved: () => renderCalendar(),
      });
    });
    remainingBar.appendChild(addExpectedBtn);

    timeColumn.appendChild(remainingBar);

    const nowForTimeline = new Date();
    const nowMinuteClockTL =
      nowForTimeline.getHours() * 60 + nowForTimeline.getMinutes();
    const todayYmdForTimeline = timeLedgerLocalTodayYmd();
    const dayLedgerRowsTL = ledgerRowsForCalendarYmd(loadTimeRows(), targetKey);
    const prodColorsTL = getTimeCategoryColorsForTimetableExpected();
    const TL_SECTION_LABELS = {
      dream: "꿈",
      sideincome: "부수입",
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
        const taskLabel = String(span.taskName || "").trim();
        const memoTextStored = String(span.scheduleMemo || "").trim();
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

        const taskOptForIcon = getTaskOptionByName(taskLabel);
        const iconSrc = resolveTimeTaskDisplayIconSrc(taskLabel, {
          category: taskOptForIcon?.category,
          productivity: taskOptForIcon?.productivity,
        });
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
          const slotIdx = findBudgetScheduleSlotIndex(
            targetKey,
            span.taskName,
            span.startMin,
            span.endMin,
          );
          if (slotIdx < 0) {
            showToast(
              "일간 예산에서 추가한 예상 일정만 여기서 수정할 수 있습니다.",
            );
            return;
          }
          openCalendarExpectedScheduleModal({
            dateKey: targetKey,
            edit: { taskName: span.taskName, timeIdx: slotIdx },
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

    wrap.dataset.dateStr = targetKey;
    /* 날짜 이동 등 renderCalendar만 다시 돌 때도 1일 열 레이아웃이 깨지지 않게 모바일 일정 탭에서 재스탬프 */
    const scheduleMob = wrap.closest(".calendar-view--mobile-schedule");
    if (
      scheduleMob &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 48rem)").matches
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
              el.style.setProperty("flex", "0 0 auto", "important");
              el.style.setProperty("min-height", "min-content", "important");
              el.style.setProperty("max-height", "none", "important");
              el.style.setProperty("width", "100%", "important");
              el.style.setProperty("max-width", "100%", "important");
              el.style.setProperty("min-width", "0", "important");
              el.style.setProperty("box-sizing", "border-box", "important");
              el.style.setProperty("overflow", "visible", "important");
              el.style.setProperty("overflow-x", "hidden", "important");
            } catch (_) {}
          }
        });
      });
    }
  }

  {
    const dateFieldOpen = lpCalendarNavQ(
      nav,
      wrap,
      ".calendar-1day-nav-date-field",
    );
    const dateInpOpen = lpCalendarNavQ(
      nav,
      wrap,
      ".calendar-1day-nav-date-input",
    );
    if (dateFieldOpen && dateInpOpen) {
      dateFieldOpen.addEventListener("click", () =>
        lpOpenNativeDateInput(dateInpOpen),
      );
      dateFieldOpen.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          lpOpenNativeDateInput(dateInpOpen);
        }
      });
      dateInpOpen.addEventListener("change", () => {
        const v = dateInpOpen.value;
        if (!v) return;
        const off = lpCalendarDayOffsetFromYmd(v);
        if (off === null) return;
        dayOffset = off;
        renderCalendar();
      });
    }
  }

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

  try {
    renderCalendar();
  } catch (err) {
    throw err;
  }

  wrap._lpRefreshCalendarView = () => {
    renderCalendar();
  };

  function goPrevDay() {
    dayOffset -= 1;
    renderCalendar();
  }

  function goNextDay() {
    dayOffset += 1;
    renderCalendar();
  }

  /* 일간 뷰: 왼쪽 스와이프=다음 날, 오른쪽=이전 날 (손가락·마우스 드래그·트랙패드 가로) */
  bindLpHorizontalPanNavigate(wrap, {
    onNext: goNextDay,
    onPrev: goPrevDay,
    lockMs: 400,
    shouldIgnoreTarget: (target) =>
      !!target?.closest?.(
        "input, textarea, select, [role='dialog'], .time-task-setup-modal, .lp-calendar-budget-add-modal",
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

/** 1주 플로우: 날짜별 예정 시간과제 수 대비 실제 기록 매칭 완료 수 → 실행률(%) */
function computeCalendar1WeekDayExecutionRate(dateKey, allLedgerRows) {
  const dayLedgerRows = ledgerRowsForCalendarYmd(allLedgerRows, dateKey);
  const { spans: daySpans } = buildExpectedScheduleSpansForDateKey(dateKey);
  const spansSorted = [...daySpans]
    .filter((s) => !expectedSpanHiddenFromWeekFlowOnly(s))
    .sort(
      (a, b) =>
        a.startMin - b.startMin ||
        (a.lane ?? 0) - (b.lane ?? 0) ||
        String(a.taskName || "").localeCompare(String(b.taskName || ""), "ko"),
    );
  const expected = spansSorted.length;
  let completed = 0;
  for (const span of spansSorted) {
    if (weekFlowExpectedSpanHasLedgerMatch(dayLedgerRows, span)) completed++;
  }
  const pct = expected > 0 ? Math.round((completed / expected) * 100) : null;
  return { expected, completed, pct };
}

function render1WeekView(tabsElement) {
  calendar1WeekDiagLog("render1WeekView.mount");
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout";

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
      <button type="button" class="calendar-nav-today" title="이번 주">Today</button>
      <button type="button" class="calendar-nav-next" title="다음 주">&gt;</button>
    </div>
  `;
  nav.classList.add("calendar-monthly-nav");

  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar-monthly-grid";

  function refreshTodoList() {}

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
        await pullTimeLedgerEntriesForDateRange(firstPullKey, lastPullKey);
        await pullTimeDailyBudgetFromSupabase();
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
    if (navMonth) navMonth.textContent = MONTH_NAMES_EN[monthIndex];
    if (navYear)
      navYear.textContent = week[0] ? String(week[0].getFullYear()) : "";

    try {
      wrap._lp1WeekFlowBodyMinRo?.disconnect();
    } catch (_) {}
    wrap._lp1WeekFlowBodyMinRo = null;

    calendarGrid.innerHTML = "";
    calendarGrid.className =
      "calendar-monthly-grid calendar-monthly-grid--1week-timegrid";
    const layoutPass = lpBeginCalendarGridLayoutPass(calendarGrid);
    calendar1WeekDiagLog("renderCalendar.layoutPass.begin", {
      renderSeq,
      classes: calendarGrid.className,
    });

    const todayYmd = timeLedgerLocalTodayYmd();
    const prodColorsExpected = getTimeCategoryColorsForTimetableExpected();
    const nowForWeek = new Date();
    const nowMinuteClock = nowForWeek.getHours() * 60 + nowForWeek.getMinutes();
    const WEEK_FLOW_SECTION_LABELS = {
      dream: "꿈",
      sideincome: "부수입",
      health: "건강",
      happy: "행복",
    };

    const allLedgerRowsForWeek = loadTimeRows();

    function applyWeekDropToDate(targetDate, payload) {
      const oldStart = (payload.startDate || "").slice(0, 10);
      const oldDue = (payload.dueDate || "").slice(0, 10);
      let newStart = "";
      let newDue = targetDate;
      if (oldStart && oldDue && oldStart !== oldDue) {
        const startD = new Date(oldStart + "T12:00:00");
        const dueD = new Date(oldDue + "T12:00:00");
        const daysDiff = Math.round((dueD - startD) / 86400000);
        newStart = targetDate;
        newDue = addDaysToDateKey(targetDate, daysDiff);
      } else if (oldStart && oldDue) {
        newStart = targetDate;
      }
      let ok = false;
      if (payload.sectionId && payload.sectionId.startsWith("custom-")) {
        ok = updateCustomSectionTaskDates(
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
      } else if (
        KPI_SECTION_IDS.includes(payload.sectionId) &&
        ((payload.taskId || "").trim() || (payload.name || "").trim())
      ) {
        ok =
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
          });
      }
      if (ok) {
        syncCalendarSectionTaskToServerAfterCalendarDateDrop(payload, ok);
        void renderCalendar({ skipWeekPull: true });
        refreshTodoList();
      }
    }

    const outer = document.createElement("div");
    outer.className =
      "calendar-1week-time-grid-google calendar-1week-time-grid-google--flow";

    const weekDateKeys = week
      .map((d) => (d ? formatDateKey(d) : ""))
      .filter(Boolean);
    const firstDayKey = weekDateKeys[0] || "";
    const lastDayKey = weekDateKeys[weekDateKeys.length - 1] || "";
    const rangeTasks = getAllTasksWithDateRange();

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
      dayNum.className = "calendar-monthly-day-num";
      dayNum.textContent = date.getDate();

      const isCurrentMonth = date.getMonth() === currentMonth;
      if (!isCurrentMonth) cell.classList.add("other-month");
      if (key === todayYmd) cell.classList.add("today");
      if (date.getDay() === 0) cell.classList.add("sun");
      if (date.getDay() === 6) cell.classList.add("sat");

      cell.appendChild(dayNum);
      const entriesEl = document.createElement("div");
      entriesEl.className = "calendar-monthly-day-entries";
      cell.appendChild(entriesEl);

      cell.style.cursor = "pointer";
      cell.addEventListener(
        "click",
        (e) => {
          if (e.target.closest?.(".calendar-monthly-span-bar")) return;
          if (
            window.matchMedia("(max-width: 48rem)").matches &&
            cell.contains(e.target)
          ) {
            e.stopPropagation();
            e.preventDefault();
            const rect = cell.getBoundingClientRect();
            const tasks = getAllTasksForDateDisplay(key);
            createCalendarDayExpandBubble(rect, key, tasks, () => {}, {
              positionBelow: true,
              onAfterTaskEdit: () => {
                void renderCalendar();
                refreshTodoList();
              },
              onAdd: () => {
                createCalendarEventBubble(
                  rect,
                  key,
                  () => {
                    void renderCalendar();
                    refreshTodoList();
                  },
                  () => {},
                );
              },
            });
            return;
          }
        },
        true,
      );
      cell.addEventListener("click", (e) => {
        if (e.target.closest(".calendar-event-bubble")) return;
        e.stopPropagation();
        const rect = cell.getBoundingClientRect();
        const isMobile = window.matchMedia("(max-width: 48rem)").matches;
        if (isMobile) {
          return;
        }
        createCalendarEventBubble(
          rect,
          key,
          () => {
            void renderCalendar();
            refreshTodoList();
          },
          () => {},
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
    rangeTasks.forEach((t) => {
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
          _calPrevStart: (t._calPrevStart || "").toString().slice(0, 10) || "",
          _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
        });
      });
    });
    lpCalendarAssignMonthlyBarRows(allBars);
    allBars.forEach((b) => {
      b.isOverflow = false;
    });
    const maxRow = allBars.length
      ? Math.max(...allBars.map((b) => b.row), 0)
      : -1;
    const rowsNeeded = allBars.length ? maxRow + 1 : 0;
    weekRow.style.minHeight = `${lpCalendarMonthlyWeekRowTargetMinHeightRem(
      baseBarTop,
      rowsNeeded,
      BAR_HEIGHT,
      ROW_GAP,
      BOTTOM_PAD,
      WEEK_ROW_MIN,
    )}rem`;
    const barsWithRow = allBars;
    barsWithRow.forEach((b) => {
      const isTodo = (b.itemType || "todo").toLowerCase() === "todo";
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
      bar.style.cssText = `left:${b.left}%;width:${b.width}%;${barStyleVars};top:${baseBarTop + b.row * (BAR_HEIGHT + ROW_GAP)}rem`;
      lpApplyCalendarMultiDaySpanBarBackground(bar, b);
      bar.innerHTML = `<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
      if (isTodo && b.done) {
        bar.classList.add("is-completed");
      }
      lpAttachCalendarBarOpenTodoEdit(bar, b, renderCalendar, refreshTodoList);
      if (!b.isSingleDay && b.startDate && b.dueDate) {
        bar.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          createCalendarBarDateEditBubble(
            e.clientX,
            e.clientY,
            b,
            () => {
              void renderCalendar();
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
            () => {
              void renderCalendar();
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
      const { spans: daySpans } = buildExpectedScheduleSpansForDateKey(key);
      const spansSorted = [...daySpans]
        .filter((s) => !expectedSpanHiddenFromWeekFlowOnly(s))
        .sort(
          (a, b) =>
            a.startMin - b.startMin ||
            (a.lane ?? 0) - (b.lane ?? 0) ||
            String(a.taskName || "").localeCompare(
              String(b.taskName || ""),
              "ko",
            ),
        );

      spansSorted.forEach((span) => {
        const pk = prodKeyForWeekExpectedSpan(span);
        const c = prodColors[pk] || prodColors.other;
        const taskLabel = String(span.taskName || "").trim();
        const memoTextStored = String(span.scheduleMemo || "").trim();
        const rangeHuman = `${span.startDisplay} - ${span.endDisplay}`;

        const ledgerMatched = weekFlowExpectedSpanHasLedgerMatch(
          dayLedgerRows,
          span,
        );
        const hasLiveRecordingForSpan = weekFlowSpanHasMatchingLiveRecording(
          dayLedgerRows,
          span,
        );
        const ledgerMissed =
          !ledgerMatched &&
          !hasLiveRecordingForSpan &&
          weekFlowExpectedSpanLedgerMissed(key, todayYmd, nowMinuteClock, span);

        const card = document.createElement("div");
        card.className = "calendar-1week-flow-card";
        const titleBase = memoTextStored
          ? `${taskLabel} (${span.startDisplay} ~ ${span.endDisplay})\n${memoTextStored}`
          : `${taskLabel} (${span.startDisplay} ~ ${span.endDisplay})`;
        card.title = ledgerMatched
          ? `${titleBase}\n실제 과제 기록에도 있음`
          : ledgerMissed
            ? `${titleBase}\n예정 종료 시간이 지났는데 아직 기록이 없습니다`
            : titleBase;
        if (ledgerMatched) {
          card.classList.add("calendar-1week-flow-card--ledger-done");
        } else if (ledgerMissed) {
          card.classList.add("calendar-1week-flow-card--ledger-missed");
        }

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
        if (ledgerMatched) {
          const checkEl = document.createElement("span");
          checkEl.className = "calendar-1week-flow-card-done-check";
          checkEl.setAttribute("role", "img");
          checkEl.setAttribute("aria-label", "실제 기록에 반영됨");
          checkEl.textContent = "✓";
          titleRow.appendChild(checkEl);
        } else if (ledgerMissed) {
          const missEl = document.createElement("span");
          missEl.className = "calendar-1week-flow-card-missed-mark";
          missEl.setAttribute("role", "img");
          missEl.setAttribute(
            "aria-label",
            "예정 시간이 지났는데 아직 기록이 없음",
          );
          missEl.textContent = "✕";
          titleRow.appendChild(missEl);
        }
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

        const inExpectedWindow =
          key === todayYmd &&
          span.startMin <= nowMinuteClock &&
          nowMinuteClock < span.endMin;
        const liveRecordingThisSpan =
          inExpectedWindow && hasLiveRecordingForSpan;

        if (liveRecordingThisSpan) {
          card.classList.add("calendar-1week-flow-card--in-progress");
          const prog = document.createElement("span");
          prog.className = "calendar-1week-flow-card-progress";
          prog.textContent = "진행 중";
          meta.appendChild(prog);
        } else if (
          inExpectedWindow &&
          !liveRecordingThisSpan &&
          !ledgerMatched
        ) {
          card.classList.add("calendar-1week-flow-card--expected-now");
        }

        card.appendChild(titleRow);
        card.appendChild(meta);
        if (memoTextStored) {
          const memoEl = document.createElement("div");
          memoEl.className = "calendar-1week-flow-card-memo";
          memoEl.textContent = memoTextStored;
          card.appendChild(memoEl);
        }
        stack.appendChild(card);
      });

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
    lpAttach1WeekMobileFlowBodyMinSync(wrap, scrollArea, bodyGrid);

    calendarSection.querySelector(".calendar-1week-execution-strip")?.remove();
    const execStrip = document.createElement("div");
    execStrip.className = "calendar-1week-execution-strip";
    execStrip.setAttribute("role", "region");
    execStrip.setAttribute(
      "aria-label",
      "요일별 예정 시간과제 대비 실행률(실제 기록 반영 개수)",
    );
    const execRow = document.createElement("div");
    execRow.className = "calendar-1week-execution-strip__row";
    weekDateKeys.forEach((key) => {
      const { expected, completed, pct } = computeCalendar1WeekDayExecutionRate(
        key,
        allLedgerRowsForWeek,
      );
      const cell = document.createElement("div");
      cell.className = "calendar-1week-execution-strip__cell";
      if (expected === 0) {
        cell.textContent = "—";
        cell.title = `${key}\n예정 시간과제 없음`;
      } else {
        cell.textContent = `${pct}%`;
        cell.title = `${key}\n완료 ${completed}개 / 예정 ${expected}개`;
      }
      execRow.appendChild(cell);
    });
    execStrip.appendChild(execRow);
    flowHScrollInner.appendChild(execStrip);
    wrap._lpRememberCalendarGridPaintSig?.();
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
    () => {
      void renderCalendar({ skipWeekPull: true });
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

/** body에 붙은 캘린더 떠있는 UI(할일 추가 버블·날짜 확장·반투명 오버레이) — 탭·서브뷰 전환 시 정리 */
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
      monthLabel.textContent = MONTH_NAMES_EN[month];
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
        if (getTasksForDate(key).length > 0) {
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
              onAfterTaskEdit: () => {
                renderYear();
                refreshTodoList();
              },
            },
          );
          _annualDayExpandClose = close;
          bubble.addEventListener("mouseenter", cancelAnnualDayExpandHideTimer);
          bubble.addEventListener("mouseleave", scheduleAnnualDayExpandHide);
        };

        const openAnnualQuickAddModal = (e) => {
          if (e.target.closest(".calendar-event-bubble")) return;
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
            () => {
              renderYear();
              refreshTodoList();
            },
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
            if (e.target.closest(".calendar-event-bubble")) return;
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
                    () => {
                      renderYear();
                      refreshTodoList();
                    },
                    () => {},
                  );
                },
                onAfterTaskEdit: () => {
                  renderYear();
                  refreshTodoList();
                },
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
  { id: "annual", label: "연간" },
  { id: "1day", label: "타임블록" },
];

const MOBILE_SCHEDULE_CAL_SUB_VIEWS = [
  { id: "monthly", label: "월별", footerShortLabel: "월" },
  { id: "1week", label: "1주", footerShortLabel: "주" },
  { id: "annual", label: "연간", footerShortLabel: "연" },
  { id: "1day", label: "타임블록", footerShortLabel: "일" },
];

/**
 * 캘린더 탭 하위 뷰(월별·1주·연간·타임블록) 공통 셸
 * @param {HTMLElement|null} tabsElement 상단에 붙일 외부 탭 행(없으면 null)
 * @param {{ subViewsList?: {id:string,label:string}[], storageKey?: string, forceInitialMonthlyOnMobile?: boolean, scheduleSubViewsInFooter?: boolean }} opts
 * scheduleSubViewsInFooter: true면 서브뷰 전환을 네비가 아닌 앱 푸터(`app-footer-icon-btn`)에 둡니다.
 */
function createCalendarSubViewRoot(tabsElement, opts = {}) {
  const isMobile = window.matchMedia("(max-width: 48rem)").matches;
  const subViewsList = opts.subViewsList || CALENDAR_SUB_VIEWS;
  const storageKey = opts.storageKey || "calendar-sub-view";
  const forceInitialMonthlyOnMobile = !!opts.forceInitialMonthlyOnMobile;
  const scheduleSubViewsInFooter = !!opts.scheduleSubViewsInFooter;

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
    const slot = getAppFooterActionsSlot();
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
          "/toolbaricons/calendar-alt.svg";
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
  const initialSubView =
    forceInitialMonthlyOnMobile && isMobile
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
      contentArea.appendChild(renderMonthlyView(null));
    } else if (subViewId === "1week") {
      contentArea.appendChild(render1WeekView(null));
      calendar1WeekDiagSnapshot(contentArea, "renderSubView.afterMount1week");
    } else if (subViewId === "annual") {
      contentArea.appendChild(renderAnnualView(null));
    } else if (subViewId === "1day") {
      contentArea.appendChild(render1DayView(null));
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
        calendar1WeekDiagSnapshot(contentArea, "prefetchSkip");
        return;
      }
      if (subViewId === "1day") {
        try {
          await pullTimeLedgerTasksFromSupabase();
        } catch (_) {}
      }
      try {
        await pullCalendarSectionTasksFromSupabase({
          reason: `calendar_nested_${subViewId}`,
          subView: "calendar",
        });
      } catch (_) {}
      if (subViewId === "1day") {
        try {
          const yEnd = timeLedgerLocalTodayYmd();
          const yStart = timeLedgerLocalYesterdayYmd();
          await Promise.all([
            pullTimeLedgerEntriesForDateRange(yStart, yEnd),
            pullTimeDailyBudgetFromSupabase(),
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
              pullTimeLedgerEntriesForDateRange(rs0, re0),
              pullTimeDailyBudgetFromSupabase(),
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
    const layout = contentArea.querySelector(".calendar-monthly-layout");
    if (layout?._lpRefreshCalendarView) {
      try {
        layout._lpRefreshCalendarView();
      } catch (_) {}
      return;
    }
    void renderSubView(activeSubViewId, { skipPull: true });
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
export function renderMobileScheduleCalendar() {
  const el = document.createElement("div");
  el.className =
    "app-tab-panel-content calendar-view calendar-view--mobile-schedule lp-app-font";

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
        scheduleSubViewsInFooter: true,
      }),
    );
  }

  el.appendChild(contentWrap);
  mountCalendarSubViews();

  window.__lpCalendarSoftRefresh = () => {
    if (!el.isConnected) return;
    const wrap = contentWrap.querySelector(".calendar-view-with-subtabs");
    if (wrap && typeof wrap._lpCalendarSoftPullRefresh === "function") {
      wrap._lpCalendarSoftPullRefresh();
      return;
    }
    mountCalendarSubViews();
  };

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
  el.className = "app-tab-panel-content calendar-view lp-app-font";

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
        });
      } catch (_) {}
      try {
        const yEnd = timeLedgerLocalTodayYmd();
        const yStart = timeLedgerLocalYesterdayYmd();
        await Promise.all([
          pullTimeLedgerEntriesForDateRange(yStart, yEnd),
          pullTimeDailyBudgetFromSupabase(),
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
