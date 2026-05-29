/**
 * 시간 레포트 - 탭별 날짜 단위 기록(본문 피드는 보고서용으로 비워 둠)
 * - 사이드바·본문 헤더에는 날짜만 표시, 제목 입력 없음
 * - 같은 날짜에 여러 페이지(항목) 가능
 */

import {
  loadDiaryEntries,
  saveDiaryEntries,
  ensureTab3Entries,
  newDiaryEntryId,
  isDiaryEntryUuid,
  snapshotDiarySessionForRefresh,
  TAB3_EMOTION_TEMPLATE,
  TAB3_EMOTION_PLACEHOLDERS,
} from "../diaryData.js";
import {
  attachDiarySaveListener,
  deleteDiaryEntryFromSupabase,
} from "../utils/diarySupabase.js";
import {
  pullTimeLedgerEntriesForDateRange,
  timeLedgerLocalTodayYmd,
} from "../utils/timeLedgerEntriesSupabase.js";
import {
  TIME_LEDGER_ENTRIES_KEY,
} from "../utils/timeLedgerEntriesModel.js";
import { readTimeDailyBudgetGoalsRaw } from "../utils/timeDailyBudgetModel.js";
import { getScopedLocalStorageItem } from "../utils/clientStorageScope.js";
import { mountUnifiedTimeReport } from "../utils/timeUnifiedReportMount.js";
import { getAppFooterActionsSlot, APP_FOOTER_ICON_BTN_CLASS } from "../utils/appFooterShell.js";
import { bindLpHorizontalPanNavigate } from "../utils/lpHorizontalPanNavigate.js";
import { getTimeReportMonthInclusiveRange } from "./Time.js";
/** 탭 2 통제일기 Q&A 템플릿 */
const TAB2_QA_TEMPLATE = [
  "오늘 내가 자제하지 못한 나쁜 습관은 무엇인가?",
  "어떻게 해야 더 나아질 수 있는가?",
  "지금 내 행동은 좋은 것인가?",
  "어떻게 스스로를 향상시킬 것인가?",
  "지금 이 순간에 대한 명확한 판단은?",
  "지금 이 순간에 맞는 상식적 행동은?",
  "일이 잘 되어갈 때의 감사한 태도",
  "통제할 수 없는 것",
  "통제할 수 있는 것",
];

/** 푸터·짧은 표기 */
function diaryTabLabel(tabId) {
  if (tabId === "2") return "레포트";
  return "메모";
}

/** 모달 제목 등 긴 표기 */
function diaryTabModalTitle(tabId) {
  if (tabId === "2") return "레포트";
  return "메모";
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr || dateStr.length < 10) return "";
  const [y, m, d] = dateStr.split("-");
  return `${y}/${m}/${d}`;
}

/** YYYY-MM-DD 또는 앞 7자 → YYYY/MM (먼스 모드 표시용) */
function formatMonthSlashFromYmd(ymd) {
  const n = normalizeDiaryDateStr(ymd);
  if (!n || n.length < 7) return "";
  return `${n.slice(0, 4)}/${n.slice(5, 7)}`;
}

function normalizeDiaryDateStr(dateVal) {
  if (!dateVal) return "";
  return String(dateVal).replace(/\//g, "-").slice(0, 10);
}

/** 시간 리포트 — 화면에 보이는 날/월 구간만 서버에서 pull */
function diaryReportLedgerPullRange(ymd, granularity) {
  const yTen = normalizeDiaryDateStr(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yTen)) {
    const t = timeLedgerLocalTodayYmd();
    return { rangeStart: t, rangeEnd: t };
  }
  if (granularity === "month") {
    const monthRng = getTimeReportMonthInclusiveRange(yTen);
    if (monthRng) return monthRng;
  }
  return { rangeStart: yTen, rangeEnd: yTen };
}

/** 소비 탭 일별 도넛 위 제목 — 오늘이면 「오늘」, 아니면 날짜표기 포함 */
function timeReportDayDonutBlockTitle(ymdTen) {
  const ten = normalizeDiaryDateStr(ymdTen);
  if (!ten || ten.length < 10) return "하루 시간 사용";
  if (ten === toDateStr(new Date())) return "오늘 하루 시간 사용";
  const disp = formatDateDisplay(ten);
  return disp ? `${disp} 하루 시간 사용` : "하루 시간 사용";
}

/** 소비 탭 월별 도넛 위 제목 — 이번 달이면 「이번 달」, 아니면 YYYY/MM */
function timeReportMonthDonutBlockTitle(ymdTen) {
  const ten = normalizeDiaryDateStr(ymdTen);
  if (!ten || ten.length < 10) return "월별 시간 사용";
  const ymAnchor = ten.slice(0, 7);
  const today = toDateStr(new Date());
  if (ymAnchor === today.slice(0, 7)) return "이번 달 시간 사용";
  const disp = formatMonthSlashFromYmd(ten);
  return disp ? `${disp} 시간 사용` : "월별 시간 사용";
}

/** 「시간 소비 리포트」 아래 — 비생산 합 시간 문구 타이틀 */
function timeReportWasteMiniTitle(ymdTen, granularity) {
  const ten = normalizeDiaryDateStr(ymdTen);
  if (granularity === "month") {
    const ym = ten.length >= 7 ? ten.slice(0, 7) : "";
    const today = toDateStr(new Date());
    const disp = formatMonthSlashFromYmd(ten);
    if (!disp) return "내가 낭비한 시간";
    if (ym && ym === today.slice(0, 7)) return "이번 달 내가 낭비한 시간";
    return `${disp} 내가 낭비한 시간`;
  }
  if (!ten || ten.length < 10) return "내가 낭비한 시간";
  if (ten === toDateStr(new Date())) return "오늘 내가 낭비한 시간";
  const disp = formatDateDisplay(ten);
  return disp ? `${disp} 내가 낭비한 시간` : "그날 내가 낭비한 시간";
}

/** 「시간 투자 리포트」 아래 — 투자 집계 시간 문구 타이틀(소비 낭비 미니와 동형) */
function timeReportInvestMiniTitle(ymdTen, granularity) {
  const ten = normalizeDiaryDateStr(ymdTen);
  if (granularity === "month") {
    const ym = ten.length >= 7 ? ten.slice(0, 7) : "";
    const today = toDateStr(new Date());
    const disp = formatMonthSlashFromYmd(ten);
    if (!disp) return "내가 투자한 시간";
    if (ym && ym === today.slice(0, 7)) return "이번 달 내가 투자한 시간";
    return `${disp} 내가 투자한 시간`;
  }
  if (!ten || ten.length < 10) return "내가 투자한 시간";
  if (ten === toDateStr(new Date())) return "내가 오늘 투자한 시간";
  const disp = formatDateDisplay(ten);
  return disp ? `${disp} 내가 투자한 시간` : "그날 내가 투자한 시간";
}

/** 앵커 날짜에서 ±N달(일은 해당 월 말일에 맞춤) */
function shiftCalendarMonthBy(ymdTen, deltaMonths) {
  const n = normalizeDiaryDateStr(ymdTen);
  if (!n || n.length < 10) return toDateStr(new Date());
  const y = parseInt(n.slice(0, 4), 10);
  const mo = parseInt(n.slice(5, 7), 10) - 1;
  const d = parseInt(n.slice(8, 10), 10);
  const first = new Date(y, mo + deltaMonths, 1);
  const y2 = first.getFullYear();
  const m2 = first.getMonth();
  const lastDay = new Date(y2, m2 + 1, 0).getDate();
  const dayClamped = Math.min(Number.isFinite(d) ? d : 1, lastDay);
  return toDateStr(new Date(y2, m2, dayClamped));
}

/** 앵커 날짜에서 ±N일 */
function shiftCalendarDayBy(ymdTen, deltaDays) {
  const n = normalizeDiaryDateStr(ymdTen);
  if (!n || n.length < 10) return toDateStr(new Date());
  const y = parseInt(n.slice(0, 4), 10);
  const mo = parseInt(n.slice(5, 7), 10) - 1;
  const d = parseInt(n.slice(8, 10), 10);
  const dt = new Date(y, mo, d);
  dt.setDate(dt.getDate() + deltaDays);
  return toDateStr(dt);
}

/** 일기 날짜 내림차순, 같은 날짜면 id 내림차순 */
function compareDiaryEntriesNewestFirst(a, b) {
  const byDate = (b.date || "").localeCompare(a.date || "");
  if (byDate !== 0) return byDate;
  return (b.id || "").localeCompare(a.id || "");
}

/** Q&A 답 영역: 폭 변경 시 autosize 재실행(내부 스크롤 없을 때 잘림 방지) */
function attachDiaryQaAnswerResizeSync(ansEl, adjustHeight) {
  if (!ansEl || typeof ResizeObserver === "undefined") return;
  const block =
    ansEl.closest(".diary-qa-block") ||
    ansEl.closest(".time-task-log-field") ||
    ansEl.closest("[data-lp-diary-qa-block]");
  if (!block) return;
  const ro = new ResizeObserver(() => {
    if (!ansEl.isConnected) {
      ro.disconnect();
      return;
    }
    adjustHeight();
  });
  ro.observe(block);
}

/** 기존 날짜 기반 데이터를 entry 배열로 마이그레이션 */
function migrateToEntries(tabData) {
  if (Array.isArray(tabData)) return tabData;
  if (tabData && typeof tabData === "object" && !tabData.entries) {
    return Object.entries(tabData).map(([date, v]) => ({
      id: date,
      date,
      title: "제목없음",
      content: v?.content || "",
    }));
  }
  return tabData?.entries || [];
}

function getTabEntriesList(tabId, all) {
  const tab = all[tabId];
  const list = migrateToEntries(tab);
  return list.sort(compareDiaryEntriesNewestFirst);
}

export function render() {
  attachDiarySaveListener();
  /** 레포트 — 메모 탭(1)은 메뉴에서 제외 */
  const DIARY_FOOTER_TAB_ORDER = ["2"];
  const DIARY_DEFAULT_REPORT_TAB = "2";

  const el = document.createElement("div");
  el.className = "app-tab-panel-content diary-view";
  const mobileViewport =
    typeof window !== "undefined" && window.matchMedia("(max-width: 48rem)").matches;
  if (mobileViewport) {
    el.classList.add("diary-view--mobile");
  }

  const inner = document.createElement("div");
  inner.className = "diary-view-inner";
  el.appendChild(inner);

  /** 상단 한 줄: 전역 lp-search-bar + 새 일기(+) — 탭 전환은 앱 푸터 */
  const topTools = document.createElement("div");
  topTools.className = "diary-top-tools";
  const searchBar = document.createElement("div");
  searchBar.className = "lp-search-bar diary-top-inline-search";
  const searchBarRow = document.createElement("div");
  searchBarRow.className = "lp-search-bar__row";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "lp-search-bar__input";
  searchInput.autocomplete = "off";
  searchInput.setAttribute("aria-label", "날짜·내용 검색");
  searchBarRow.appendChild(searchInput);
  searchBar.appendChild(searchBarRow);

  /** 시간사용 레포트(탭3): 검색 대신 DAY / MONTH 단위 토글 */
  const granularityBar = document.createElement("div");
  granularityBar.className = "diary-report-granularity";
  granularityBar.setAttribute("role", "toolbar");
    granularityBar.setAttribute("aria-label", "DAY · MONTH 보기 단위");
  const granularityDayBtn = document.createElement("button");
  granularityDayBtn.type = "button";
  granularityDayBtn.className = "diary-report-granularity__seg";
  granularityDayBtn.textContent = "DAY";
  granularityDayBtn.title = "일 단위";
  granularityDayBtn.setAttribute("aria-pressed", "true");
  const granularityMonthBtn = document.createElement("button");
  granularityMonthBtn.type = "button";
  granularityMonthBtn.className = "diary-report-granularity__seg";
  granularityMonthBtn.textContent = "MONTH";
  granularityMonthBtn.title = "월 단위";
  granularityMonthBtn.setAttribute("aria-pressed", "false");
  granularityBar.appendChild(granularityDayBtn);
  granularityBar.appendChild(granularityMonthBtn);

  /** 탭3: 데이/먼스 토글 직 아래 날짜·캘린더 줄을 넣는 상단 블록 */
  const reportChrome = document.createElement("div");
  reportChrome.className = "diary-report-chrome";
  reportChrome.setAttribute("hidden", "");
  const reportChromeToggleRow = document.createElement("div");
  reportChromeToggleRow.className = "diary-report-chrome__toggle-row";
  reportChromeToggleRow.appendChild(granularityBar);
  const reportChromeDateRow = document.createElement("div");
  reportChromeDateRow.className = "diary-report-chrome__date-row";
  reportChrome.appendChild(reportChromeToggleRow);
  reportChrome.appendChild(reportChromeDateRow);

  /** 캘린더 일간 네비(.calendar-nav-controls .calendar-1day-nav-add)와 동일 클래스 */
  const topToolsNavControls = document.createElement("div");
  topToolsNavControls.className = "calendar-nav-controls";
  const topAddBtn = document.createElement("button");
  topAddBtn.type = "button";
  topAddBtn.className = "calendar-1day-nav-add";
  topAddBtn.title = "새 일기 작성";
  topAddBtn.setAttribute("aria-label", "새 일기 작성");
  topAddBtn.textContent = "+";
  topToolsNavControls.appendChild(topAddBtn);
  topTools.appendChild(searchBar);
  topTools.appendChild(reportChrome);
  topTools.appendChild(topToolsNavControls);

  inner.appendChild(topTools);

  const layoutWrap = document.createElement("div");
  layoutWrap.className = "diary-layout-wrap";
  inner.appendChild(layoutWrap);

  let currentTabId = DIARY_DEFAULT_REPORT_TAB;
  let currentEntryId = null;
  let searchQuery = "";
  let isComposing = false;
  /** 탭 3 소비 보기 단위 */
  let tab3ViewGranularity = "day"; // "day" | "month"
  /** 탭 2 투자 — 데이/먼스·날짜 앵커(소비와 동일 UI, 별도 저장) */
  let tab2ViewGranularity = "day";
  const LP_TAB2_REPORT_DATE_KEY = "lp_tab2_report_anchor_date";
  let tab2ReportAnchorDateStr = (() => {
    try {
      const raw = sessionStorage.getItem(LP_TAB2_REPORT_DATE_KEY);
      if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    } catch (_) {}
    return toDateStr(new Date());
  })();

  /** pull 완료 후 renderLayout 한 번 — 동기화 루프 방지 */
  let reportLedgerRefreshFromPull = false;
  /** 탭 pull 직후: 로컬 지문이 같으면 renderLayout 생략(아이콘·본문 이중 그림 방지) */
  let lastTimeReportDataSignature = "";
  const LP_TAB3_REPORT_DATE_KEY = "lp_tab3_report_anchor_date";
  let tab3ReportAnchorDateStr = (() => {
    try {
      const raw = sessionStorage.getItem(LP_TAB3_REPORT_DATE_KEY);
      if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    } catch (_) {}
    return toDateStr(new Date());
  })();

  /** 탭 5 로그 — 데이/먼스·날짜 앵커(소비·투자와 동일 UI, 별도 저장) */
  let tab5ViewGranularity = "day";
  const LP_TAB5_REPORT_DATE_KEY = "lp_tab5_report_anchor_date";
  let tab5ReportAnchorDateStr = (() => {
    try {
      const raw = sessionStorage.getItem(LP_TAB5_REPORT_DATE_KEY);
      if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    } catch (_) {}
    return toDateStr(new Date());
  })();

  function persistTab5ReportAnchorDate() {
    try {
      sessionStorage.setItem(LP_TAB5_REPORT_DATE_KEY, tab5ReportAnchorDateStr);
    } catch (_) {}
  }

  function persistTab3ReportAnchorDate() {
    try {
      sessionStorage.setItem(LP_TAB3_REPORT_DATE_KEY, tab3ReportAnchorDateStr);
    } catch (_) {}
  }

  function persistTab2ReportAnchorDate() {
    try {
      sessionStorage.setItem(LP_TAB2_REPORT_DATE_KEY, tab2ReportAnchorDateStr);
    } catch (_) {}
  }

  let lastTimeReportAnchorShiftMs = 0;
  /** mountDiary 안에서 할당 — 스와이프 핸들러는 그보다 위에 둠 */
  let renderLayout = () => {};

  /** 레포트: step +1=다음(왼쪽 스와이프), -1=이전(오른쪽 스와이프) */
  function shiftActiveTimeReportAnchor(step) {
    if (step !== 1 && step !== -1) return;
    const now = Date.now();
    if (now - lastTimeReportAnchorShiftMs < 400) return;
    if (currentTabId !== "2") return;
    lastTimeReportAnchorShiftMs = now;

    const isMonth = tab2ViewGranularity === "month";
    let anchor = tab2ReportAnchorDateStr || toDateStr(new Date());
    const next = isMonth
      ? shiftCalendarMonthBy(anchor, step)
      : shiftCalendarDayBy(anchor, step);

    tab2ReportAnchorDateStr = next;
    persistTab2ReportAnchorDate();
    renderLayout();
  }

  function isDiaryTimeReportFooterTab() {
    return currentTabId === "2";
  }

  bindLpHorizontalPanNavigate(inner, {
    isActive: isDiaryTimeReportFooterTab,
    shouldIgnoreTarget: (target) =>
      !!target?.closest?.(
        "input, textarea, select, [role='dialog'], .time-task-setup-modal, .diary-tr-invest-detail-modal",
      ),
    onNext: () => shiftActiveTimeReportAnchor(1),
    onPrev: () => shiftActiveTimeReportAnchor(-1),
    lockMs: 400,
  });

  let entries = loadDiaryEntries();

  (function mountDiary() {
    searchInput.addEventListener("compositionstart", () => {
      isComposing = true;
    });
    searchInput.addEventListener("compositionend", (e) => {
      isComposing = false;
      searchQuery = e.target.value;
      renderLayout();
    });
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value;
      if (!isComposing) renderLayout();
    });

  function notifyServerDeletedEntry(entryId) {
    if (isDiaryEntryUuid(entryId)) {
      void deleteDiaryEntryFromSupabase(entryId).catch(() => {});
    }
  }

  function ensureTabEntries(tabId) {
    if (tabId === "5") {
      if (!entries["5"]) entries["5"] = { entries: [] };
      return [];
    }
    if (tabId === "3") {
      ensureTab3Entries(entries);
      const list = entries["3"].entries || [];
      return [...list].sort(compareDiaryEntriesNewestFirst);
    }
    const tab = entries[tabId];
    const needsMigration = !tab || !Array.isArray(tab) && !tab.entries;
    const list = getTabEntriesList(tabId, entries);
    if (!entries[tabId] || !entries[tabId].entries) {
      entries[tabId] = { entries: list };
      if (needsMigration) saveDiaryEntries(entries, { skipCloud: true });
    }
    const raw = entries[tabId].entries;
    return [...raw].sort(compareDiaryEntriesNewestFirst);
  }

  function getTabEntriesRaw(tabId) {
    if (tabId === "5") {
      if (!entries["5"]) entries["5"] = { entries: [] };
      return [];
    }
    if (tabId === "3") {
      ensureTab3Entries(entries);
      return entries["3"].entries || [];
    }
    ensureTabEntries(tabId);
    return entries[tabId]?.entries || [];
  }

  function getEntryById(tabId, id) {
    const list = ensureTabEntries(tabId);
    return list.find((e) => e.id === id) || null;
  }

  function getDisplayLabel(entry) {
    if (!entry) return "";
    const d = normalizeDiaryDateStr(entry.date);
    return d ? formatDateDisplay(d) : formatDateDisplay(entry.date) || "";
  }

  /** 날짜 표시 + 숨김 date 입력 + 달력 버튼(데스크톱·모바일 공통) */
  function createDiaryDateEditor(entry, tabId, variant, styleOpts = {}) {
    const lpModal = styleOpts.lpModal === true;
    const bareEmotion = tabId === "3";
    const row = document.createElement("div");
    if (!lpModal) {
      row.className = bareEmotion ? "" : "diary-date-edit-row";
    } else {
      row.className = "diary-date-edit-row diary-date-edit-row--lp-modal";
    }
    const norm = (s) => normalizeDiaryDateStr(s) || toDateStr(new Date());
    const inp = document.createElement("input");
    inp.type = "date";
    inp.className =
      lpModal ? "diary-date-edit-input-native" : bareEmotion ? "" : "diary-date-edit-input-native";
    inp.setAttribute("aria-hidden", "true");
    inp.tabIndex = -1;
    inp.value = norm(entry.date);
    const display = document.createElement("span");
    display.className = bareEmotion ? "" : "diary-date-edit-display";
    if (!bareEmotion) {
      if (variant === "qa-header") {
        display.classList.add("diary-paper-meta", "diary-paper-qa-header-title");
      } else if (variant === "feed") {
        display.classList.add("diary-feed-card-title");
        display.setAttribute("aria-label", "일기 날짜");
      } else if (variant === "free") {
        display.classList.add("diary-paper-date");
        display.setAttribute("aria-label", "일기 날짜");
        display.style.marginBottom = "0";
      } else if (variant === "step") {
        display.classList.add("diary-step-modal-date-display");
      }
    } else if (variant === "qa-header" || variant === "free") {
      display.setAttribute("aria-label", "일기 날짜");
    }
    display.textContent = formatDateDisplay(inp.value);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = bareEmotion ? "" : "diary-date-cal-btn";
    btn.title = "날짜 변경";
    btn.setAttribute("aria-label", "날짜 선택");
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
    btn.addEventListener("click", () => {
      try {
        if (typeof inp.showPicker === "function") inp.showPicker();
        else inp.click();
      } catch (_) {
        inp.click();
      }
    });
    inp.addEventListener("change", () => {
      const v = inp.value;
      if (!v) return;
      display.textContent = formatDateDisplay(v);
      if (norm(entry.date) === v) return;
      entry.date = v;
      saveDiaryEntries(entries, { skipCloud: true });
      renderLayout();
    });
    row.appendChild(display);
    row.appendChild(btn);
    row.appendChild(inp);

    if (lpModal) {
      const field = document.createElement("div");
      field.className = "time-task-log-field";
      const lab = document.createElement("label");
      lab.textContent = "날짜";
      const card = document.createElement("div");
      card.className = "lp-modal-datetime-card";
      card.appendChild(row);
      field.appendChild(lab);
      field.appendChild(card);
      return field;
    }

    return row;
  }

  function diaryDateLabelText(entry) {
    const d = normalizeDiaryDateStr(entry.date) || entry.date;
    return formatDateDisplay(d) || formatDateDisplay(toDateStr(new Date()));
  }

  function createDiaryEditButton(onClick, bareMainCss = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = bareMainCss ? "" : "diary-paper-edit-btn";
    btn.title = "수정";
    btn.setAttribute("aria-label", "일기 수정");
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="m16.5 3.5 4.5 4.5-12 12H4v-4.5l12-12Z"/></svg>';
    btn.addEventListener("click", onClick);
    return btn;
  }

  function isDiaryMobileViewport() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 48rem)").matches;
  }

  /** 모바일: readonly 쓰지 않음 — iOS 등에서 readonly 입력창 탭 시 자판이 안 뜨므로, 항상 편집 가능하게 두어 첫 탭에 자판이 뜨도록 함 */
  function attachMobileTapToEdit(textEl) {
    if (!isDiaryMobileViewport() || !textEl) return;
  }

  /** 본문·피드·작성/편집 모달: 날짜·Q&A·자유일기 (readOnly 시 미리보기 + 연필) */
  function mountDiaryPaperForm(paper, entry, tabId, opts = {}) {
    const {
      onDelete,
      showDelete = true,
      readOnly = false,
      onEdit,
      feedCard = false,
      lpModalForm = false,
    } = opts;
    const lpForm = lpModalForm && !readOnly;
    if (feedCard && entry && entry.id) paper.dataset.entryId = String(entry.id);
    if (tabId === "3") {
      if (lpForm) {
        paper.className = "diary-modal-paper-root";
      } else if (feedCard) {
        paper.className = "diary-feed-card";
      } else {
        paper.className = "";
      }
      if (!entry.q1 && entry.q1 !== "") entry.q1 = "";
      if (!entry.q2 && entry.q2 !== "") entry.q2 = "";
      if (!entry.q3 && entry.q3 !== "") entry.q3 = "";
      if (!entry.q4 && entry.q4 !== "") entry.q4 = "";
      const qaHeader = document.createElement("div");
      if (readOnly) {
        /* 통제일기와 동일: 피드·본문 모두 .diary-paper-edit-btn 계열로 스타일 적용 */
        qaHeader.className = "diary-paper-qa-header";
        const dateSpan = document.createElement("span");
        dateSpan.className = feedCard
          ? "diary-paper-meta diary-feed-card-title"
          : "diary-paper-meta diary-paper-qa-header-title";
        dateSpan.setAttribute("aria-label", "일기 날짜");
        dateSpan.textContent = diaryDateLabelText(entry);
        qaHeader.appendChild(dateSpan);
        if (typeof onEdit === "function") {
          const eb = createDiaryEditButton(onEdit);
          eb.classList.add("diary-paper-edit-btn-qa");
          qaHeader.appendChild(eb);
        }
      } else {
        qaHeader.className = lpForm ? "diary-modal-paper-header-row" : "";
        const dateRow = createDiaryDateEditor(entry, tabId, "qa-header", { lpModal: lpForm });
        qaHeader.appendChild(dateRow);
        if (showDelete && typeof onDelete === "function" && !lpForm) {
          const deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = lpForm ? "time-task-log-delete-btn" : "";
          deleteBtn.title = "해당 기록 삭제";
          deleteBtn.setAttribute("aria-label", "해당 기록 삭제");
          deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
          deleteBtn.addEventListener("click", onDelete);
          qaHeader.appendChild(deleteBtn);
        }
      }
      paper.appendChild(qaHeader);
      TAB3_EMOTION_TEMPLATE.forEach((label, i) => {
        const key = "q" + (i + 1);
        const block = document.createElement("div");
        block.className = lpForm ? "time-task-log-field" : "";
        block.setAttribute("data-lp-diary-qa-block", "");
        const qHead = document.createElement(lpForm ? "label" : "div");
        qHead.className = "";
        qHead.textContent = label;
        block.appendChild(qHead);
        if (readOnly) {
          const ansEl = document.createElement("textarea");
          ansEl.className = lpForm ? "time-task-log-feedback" : "";
          ansEl.readOnly = true;
          ansEl.tabIndex = -1;
          ansEl.setAttribute("aria-label", "답변");
          ansEl.value = entry[key] != null ? entry[key] : "";
          const adjustRo = () => {
            ansEl.style.height = "auto";
            ansEl.style.height = Math.max(60, ansEl.scrollHeight) + "px";
          };
          block.appendChild(ansEl);
          paper.appendChild(block);
          adjustRo();
          attachDiaryQaAnswerResizeSync(ansEl, adjustRo);
        } else {
          const ansArea = document.createElement("textarea");
          ansArea.className = lpForm ? "time-task-log-feedback" : "";
          ansArea.placeholder = TAB3_EMOTION_PLACEHOLDERS[i] || "";
          ansArea.value = entry[key] != null ? entry[key] : "";
          const adjustHeight = () => {
            ansArea.style.height = "auto";
            ansArea.style.height = Math.max(60, ansArea.scrollHeight) + "px";
          };
          ansArea.addEventListener("input", () => {
            entry[key] = ansArea.value;
            saveDiaryEntries(entries, { skipCloud: true });
            adjustHeight();
          });
          block.appendChild(ansArea);
          paper.appendChild(block);
          adjustHeight();
          attachDiaryQaAnswerResizeSync(ansArea, adjustHeight);
          attachMobileTapToEdit(ansArea);
        }
      });
      return;
    }
    if (tabId === "2") {
      if (!entry.qa || typeof entry.qa !== "object") {
        entry.qa = Object.fromEntries(TAB2_QA_TEMPLATE.map((_, i) => [String(i), ""]));
        saveDiaryEntries(entries, { skipCloud: true });
      }
      paper.className =
        (lpForm ? "diary-paper diary-modal-paper-root diary-paper-qa" : "diary-paper diary-paper-qa") +
        (feedCard ? " diary-feed-card" : "");
      const qaHeader = document.createElement("div");
      qaHeader.className = lpForm ? "diary-modal-paper-header-row diary-paper-qa-header" : "diary-paper-qa-header";
      if (readOnly) {
        const dateSpan = document.createElement("span");
        dateSpan.className = feedCard
          ? "diary-paper-meta diary-feed-card-title"
          : "diary-paper-meta diary-paper-qa-header-title";
        dateSpan.setAttribute("aria-label", "일기 날짜");
        dateSpan.textContent = diaryDateLabelText(entry);
        qaHeader.appendChild(dateSpan);
        if (typeof onEdit === "function") {
          const eb = createDiaryEditButton(onEdit);
          eb.classList.add("diary-paper-edit-btn-qa");
          qaHeader.appendChild(eb);
        }
      } else {
        const dateRow = createDiaryDateEditor(entry, tabId, "qa-header", { lpModal: lpForm });
        qaHeader.appendChild(dateRow);
        if (showDelete && typeof onDelete === "function" && !lpForm) {
          const deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = lpForm ? "time-task-log-delete-btn" : "diary-paper-delete-btn diary-paper-delete-btn-qa";
          deleteBtn.title = "해당 기록 삭제";
          deleteBtn.setAttribute("aria-label", "해당 기록 삭제");
          deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
          deleteBtn.addEventListener("click", onDelete);
          qaHeader.appendChild(deleteBtn);
        }
      }
      paper.appendChild(qaHeader);
      TAB2_QA_TEMPLATE.forEach((question, i) => {
        const block = document.createElement("div");
        block.className = lpForm ? "time-task-log-field" : "diary-qa-block";
        const qHead = document.createElement(lpForm ? "label" : "div");
        qHead.className = lpForm ? "" : "diary-qa-question";
        qHead.textContent = question;
        block.appendChild(qHead);
        if (readOnly) {
          const ansEl = document.createElement("textarea");
          ansEl.className = lpForm ? "time-task-log-feedback" : "diary-qa-answer diary-qa-answer-readonly";
          ansEl.readOnly = true;
          ansEl.tabIndex = -1;
          ansEl.setAttribute("aria-label", "답변");
          ansEl.value = (entry.qa && entry.qa[String(i)]) || "";
          const adjustRo = () => {
            ansEl.style.height = "auto";
            ansEl.style.height = Math.max(60, ansEl.scrollHeight) + "px";
          };
          block.appendChild(ansEl);
          paper.appendChild(block);
          adjustRo();
          attachDiaryQaAnswerResizeSync(ansEl, adjustRo);
        } else {
          const ansArea = document.createElement("textarea");
          ansArea.className = lpForm ? "time-task-log-feedback" : "diary-qa-answer";
          ansArea.placeholder = "";
          ansArea.value = (entry.qa && entry.qa[String(i)]) || "";
          const adjustHeight = () => {
            ansArea.style.height = "auto";
            ansArea.style.height = Math.max(60, ansArea.scrollHeight) + "px";
          };
          ansArea.addEventListener("input", () => {
            if (!entry.qa) entry.qa = {};
            entry.qa[String(i)] = ansArea.value;
            saveDiaryEntries(entries, { skipCloud: true });
            adjustHeight();
          });
          block.appendChild(ansArea);
          paper.appendChild(block);
          adjustHeight();
          attachDiaryQaAnswerResizeSync(ansArea, adjustHeight);
          attachMobileTapToEdit(ansArea);
        }
      });
      return;
    }
    if (tabId === "1" || tabId === "4") {
      paper.className =
        (lpForm ? "diary-paper diary-modal-paper-root" : "diary-paper") + (feedCard ? " diary-feed-card" : "");
      const titleRow = document.createElement("div");
      titleRow.className = lpForm ? "diary-modal-paper-header-row diary-paper-title-row" : "diary-paper-title-row";
      if (readOnly) {
        const dateSpan = document.createElement("span");
        if (feedCard) {
          dateSpan.className = "diary-paper-meta diary-feed-card-title";
          dateSpan.setAttribute("aria-label", "일기 날짜");
        } else {
          dateSpan.className = "diary-paper-date";
          dateSpan.setAttribute("aria-label", "일기 날짜");
          dateSpan.style.marginBottom = "0";
        }
        dateSpan.textContent = diaryDateLabelText(entry);
        titleRow.appendChild(dateSpan);
        if (typeof onEdit === "function") {
          const eb = createDiaryEditButton(onEdit);
          if (feedCard) eb.classList.add("diary-paper-edit-btn-qa");
          titleRow.appendChild(eb);
        }
      } else {
        const dateRow = createDiaryDateEditor(entry, tabId, "free", { lpModal: lpForm });
        titleRow.appendChild(dateRow);
        if (showDelete && typeof onDelete === "function" && !lpForm) {
          const deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = lpForm ? "time-task-log-delete-btn" : "diary-paper-delete-btn";
          deleteBtn.title = "해당 기록 삭제";
          deleteBtn.setAttribute("aria-label", "해당 기록 삭제");
          deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
          deleteBtn.addEventListener("click", onDelete);
          titleRow.appendChild(deleteBtn);
        }
      }
      paper.appendChild(titleRow);
      if (readOnly) {
        const body = document.createElement("div");
        body.className = "diary-paper-text diary-paper-text-readonly";
        body.textContent = entry.content || "";
        paper.appendChild(body);
      } else {
        const textarea = document.createElement("textarea");
        textarea.className = lpForm ? "time-task-log-feedback" : "diary-paper-text";
        textarea.placeholder = "start writing";
        textarea.value = entry.content || "";
        textarea.addEventListener("input", () => {
          entry.content = textarea.value;
          saveDiaryEntries(entries, { skipCloud: true });
        });
        attachMobileTapToEdit(textarea);
        paper.appendChild(textarea);
      }
    }
  }

  /** opts.draft: 목록에 아직 없는 새 일기 — 「추가」에서만 push·저장, X·배경은 취소 */
  function openDiaryComposeModal(entryOrId, tabId, opts = {}) {
    const draft = opts.draft === true;
    let entry;
    let entryId;
    if (draft) {
      entry = entryOrId;
      if (!entry || entry.id == null) return;
      entryId = entry.id;
    } else {
      entryId = entryOrId;
      entry = getTabEntriesRaw(tabId).find((e) => e.id === entryId);
    }
    if (!entry) return;
    document.querySelectorAll(".diary-desktop-compose-modal").forEach((m) => m.remove());
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal diary-desktop-compose-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const backdrop = document.createElement("div");
    backdrop.className = "diary-desktop-compose-modal-backdrop";
    const panel = document.createElement("div");
    panel.className = "diary-desktop-compose-modal-panel";
    panel.addEventListener("click", (e) => e.stopPropagation());
    const modalHeader = document.createElement("div");
    modalHeader.className = "time-task-setup-header diary-desktop-compose-modal-header";
    const modalTitle = document.createElement("h3");
    modalTitle.className = "time-task-setup-title";
    modalTitle.textContent = diaryTabModalTitle(tabId);
    const closeModalOnly = () => {
      modal.remove();
      renderLayout();
    };
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "time-task-setup-close diary-desktop-compose-modal-close";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.title = "닫기";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeModalOnly);
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeBtn);
    const scroll = document.createElement("div");
    scroll.className = "diary-desktop-compose-modal-scroll";
    const paper = document.createElement("div");
    mountDiaryPaperForm(paper, entry, tabId, { showDelete: false, lpModalForm: true });
    scroll.appendChild(paper);
    const footer = document.createElement("div");
    footer.className = "diary-desktop-compose-modal-footer";
    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "time-task-log-submit diary-desktop-compose-modal-confirm";
    confirmBtn.textContent = "추가";
    confirmBtn.addEventListener("click", () => {
      if (draft) {
        const rawList = getTabEntriesRaw(tabId);
        rawList.push(entry);
        saveDiaryEntries(entries);
      }
      currentEntryId = entryId;
      currentTabId = tabId;
      modal.remove();
      renderLayout();
      requestAnimationFrame(() => {
        const hit = layoutWrap.querySelector(`[data-entry-id="${entryId}"]`);
        if (hit) hit.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    });
    footer.appendChild(confirmBtn);
    panel.appendChild(modalHeader);
    panel.appendChild(scroll);
    panel.appendChild(footer);
    modal.appendChild(backdrop);
    modal.appendChild(panel);
    document.body.appendChild(modal);
  }

  function openDiaryEditModal(entryId, tabId) {
    const entry = getTabEntriesRaw(tabId).find((e) => e.id === entryId);
    if (!entry) return;
    document.querySelectorAll(".diary-desktop-compose-modal").forEach((m) => m.remove());
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal diary-desktop-compose-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const backdrop = document.createElement("div");
    backdrop.className = "diary-desktop-compose-modal-backdrop";
    const panel = document.createElement("div");
    panel.className = "diary-desktop-compose-modal-panel";
    panel.addEventListener("click", (e) => e.stopPropagation());
    const modalHeader = document.createElement("div");
    modalHeader.className = "time-task-setup-header diary-desktop-compose-modal-header";
    const modalTitle = document.createElement("h3");
    modalTitle.className = "time-task-setup-title";
    modalTitle.textContent = diaryTabModalTitle(tabId);
    const closeModalOnly = () => {
      modal.remove();
      renderLayout();
    };
    const handleEditModalDelete = () => {
      const list = getTabEntriesRaw(tabId);
      const idx = list.findIndex((x) => x.id === entry.id);
      if (idx >= 0) {
        list.splice(idx, 1);
        saveDiaryEntries(entries, { skipCloud: true });
        notifyServerDeletedEntry(entry.id);
        currentEntryId = list.length > 0 ? list[0].id : null;
      }
      modal.remove();
      renderLayout();
    };
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "time-task-setup-close diary-desktop-compose-modal-close";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.title = "닫기";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeModalOnly);
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeBtn);
    const scroll = document.createElement("div");
    scroll.className = "diary-desktop-compose-modal-scroll";
    const paper = document.createElement("div");
    mountDiaryPaperForm(paper, entry, tabId, {
      showDelete: false,
      lpModalForm: true,
    });
    scroll.appendChild(paper);
    const footer = document.createElement("div");
    footer.className = "diary-desktop-compose-modal-footer";
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "time-task-log-delete-btn";
    deleteBtn.title = "해당 기록 삭제";
    deleteBtn.setAttribute("aria-label", "해당 기록 삭제");
    deleteBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
    deleteBtn.addEventListener("click", handleEditModalDelete);
    footer.appendChild(deleteBtn);
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "time-task-log-submit diary-desktop-compose-modal-confirm";
    saveBtn.textContent = "수정";
    saveBtn.addEventListener("click", () => {
      saveDiaryEntries(entries);
      currentEntryId = entryId;
      currentTabId = tabId;
      modal.remove();
      renderLayout();
      requestAnimationFrame(() => {
        const hit = layoutWrap.querySelector(`[data-entry-id="${entryId}"]`);
        if (hit) hit.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    });
    footer.appendChild(saveBtn);
    panel.appendChild(modalHeader);
    panel.appendChild(scroll);
    panel.appendChild(footer);
    modal.appendChild(backdrop);
    modal.appendChild(panel);
    document.body.appendChild(modal);
  }

  function syncDiaryFooterSubtabs() {
    document.querySelectorAll("[data-diary-subtab]").forEach((b) => {
      const id = b.getAttribute("data-diary-subtab");
      b.setAttribute("aria-pressed", id === currentTabId ? "true" : "false");
    });
  }

  function mountDiaryFooterSubtabs() {
    const slot = getAppFooterActionsSlot();
    if (!slot) return;
    for (const id of DIARY_FOOTER_TAB_ORDER) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = APP_FOOTER_ICON_BTN_CLASS;
      b.setAttribute("data-diary-subtab", id);
      b.textContent = diaryTabLabel(id);
      b.title = diaryTabModalTitle(id);
      b.setAttribute("aria-label", diaryTabModalTitle(id));
      b.addEventListener("click", () => {
        currentTabId = id;
        const list = ensureTabEntries(currentTabId);
        currentEntryId = list.length > 0 ? list[0].id : null;
        renderLayout();
      });
      slot.appendChild(b);
    }
  }

  /** 레포트·로그 공통: 데이 time-task-log-date-native-wrap · 먼스 ‹ › (현재 탭별 앵커) */
  function buildTimeReportDateBar() {
    const bar = document.createElement("div");
    bar.className = "diary-time-report-date-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "보고서 기준 날짜");

    let anchor = "";
    if (currentTabId === "2") {
      anchor = normalizeDiaryDateStr(tab2ReportAnchorDateStr);
    } else if (currentTabId === "3") {
      anchor = normalizeDiaryDateStr(tab3ReportAnchorDateStr);
    } else if (currentTabId === "5") {
      anchor = normalizeDiaryDateStr(tab5ReportAnchorDateStr);
    }
    if (!anchor || anchor.length < 10) {
      anchor = toDateStr(new Date());
      if (currentTabId === "2") {
        tab2ReportAnchorDateStr = anchor;
        persistTab2ReportAnchorDate();
      } else if (currentTabId === "3") {
        tab3ReportAnchorDateStr = anchor;
        persistTab3ReportAnchorDate();
      } else if (currentTabId === "5") {
        tab5ReportAnchorDateStr = anchor;
        persistTab5ReportAnchorDate();
      }
    } else {
      if (currentTabId === "2") tab2ReportAnchorDateStr = anchor;
      else if (currentTabId === "3") tab3ReportAnchorDateStr = anchor;
      else if (currentTabId === "5") tab5ReportAnchorDateStr = anchor;
    }

    const isMonth =
      currentTabId === "2"
        ? tab2ViewGranularity === "month"
        : currentTabId === "3"
          ? tab3ViewGranularity === "month"
          : currentTabId === "5"
            ? tab5ViewGranularity === "month"
            : false;

    function persistAnchorFromInput(v) {
      if (!v) return;
      if (currentTabId === "2") {
        tab2ReportAnchorDateStr = v;
        persistTab2ReportAnchorDate();
      } else if (currentTabId === "3") {
        tab3ReportAnchorDateStr = v;
        persistTab3ReportAnchorDate();
      } else if (currentTabId === "5") {
        tab5ReportAnchorDateStr = v;
        persistTab5ReportAnchorDate();
      }
    }

    if (!isMonth) {
      const card = document.createElement("div");
      card.className = "lp-modal-datetime-card diary-time-report-date-picker-card";
      card.setAttribute("data-legacy", "lp-modal-datetime-card");

      const row = document.createElement("div");
      row.className = "time-task-log-datetime-main-row diary-time-report-date-picker-row";
      row.setAttribute("data-legacy", "time-task-log-datetime-main-row");

      const wrap = document.createElement("div");
      wrap.className = "time-task-log-date-native-wrap";
      wrap.setAttribute("data-legacy", "time-task-log-date-native-wrap");

      const dateInp = document.createElement("input");
      dateInp.type = "date";
      dateInp.value = anchor;
      dateInp.setAttribute("aria-label", "보고서 날짜 선택");
      dateInp.setAttribute("data-legacy", "time-task-log-date-start");

      const overlay = document.createElement("span");
      overlay.className = "time-task-log-date-overlay";
      overlay.setAttribute("data-legacy", "time-task-log-date-overlay");
      overlay.textContent = formatDateDisplay(anchor);

      const syncOverlay = () => {
        if (dateInp.value) overlay.textContent = formatDateDisplay(dateInp.value);
      };

      dateInp.addEventListener("input", syncOverlay);
      dateInp.addEventListener("change", () => {
        const v = dateInp.value;
        if (!v) return;
        persistAnchorFromInput(v);
        syncOverlay();
        renderLayout();
      });

      wrap.appendChild(dateInp);
      wrap.appendChild(overlay);
      row.appendChild(wrap);
      card.appendChild(row);
      bar.appendChild(card);
      return bar;
    }

    const card = document.createElement("div");
    card.className = "lp-modal-datetime-card diary-time-report-month-nav-card";
    card.setAttribute("data-legacy", "lp-modal-datetime-card");

    const row = document.createElement("div");
    row.className = "diary-time-report-month-nav-row";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "diary-time-report-month-nav-btn";
    prevBtn.setAttribute("aria-label", "이전 달");
    prevBtn.textContent = "‹";

    const monthLabel = document.createElement("span");
    monthLabel.className = "diary-time-report-month-nav-label";
    monthLabel.setAttribute("aria-live", "polite");
    monthLabel.textContent = formatMonthSlashFromYmd(anchor);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "diary-time-report-month-nav-btn";
    nextBtn.setAttribute("aria-label", "다음 달");
    nextBtn.textContent = "›";

    const shift = (delta) => {
      const next = shiftCalendarMonthBy(anchor, delta);
      persistAnchorFromInput(next);
      renderLayout();
    };

    prevBtn.addEventListener("click", () => shift(-1));
    nextBtn.addEventListener("click", () => shift(1));

    row.appendChild(prevBtn);
    row.appendChild(monthLabel);
    row.appendChild(nextBtn);
    card.appendChild(row);
    bar.appendChild(card);
    return bar;
  }

  function snapshotTimeReportDataSignature() {
    let ledger = "";
    try {
      ledger = [
        getScopedLocalStorageItem(TIME_LEDGER_ENTRIES_KEY) ?? "",
        readTimeDailyBudgetGoalsRaw() ?? "",
      ].join("\n");
    } catch (_) {}
    let diary = "";
    try {
      diary = snapshotDiarySessionForRefresh();
    } catch (_) {}
    return [
      currentTabId,
      tab2ViewGranularity,
      tab3ViewGranularity,
      tab5ViewGranularity,
      tab2ReportAnchorDateStr,
      tab3ReportAnchorDateStr,
      tab5ReportAnchorDateStr,
      layoutWrap.dataset.tab2SelectedDate ?? "",
      layoutWrap.dataset.tab3SelectedDate ?? "",
      layoutWrap.dataset.tab5SelectedDate ?? "",
      diary,
      ledger,
    ].join("\x1e");
  }

  function rememberTimeReportDataSignature() {
    lastTimeReportDataSignature = snapshotTimeReportDataSignature();
  }

  renderLayout = function renderLayout(opts = {}) {
    const force = !!opts.force;
    if (currentTabId === "3") currentTabId = "2";
    if (currentTabId === "4") currentTabId = "2";
    if (!force && !reportLedgerRefreshFromPull) {
      const sigNow = snapshotTimeReportDataSignature();
      if (sigNow === lastTimeReportDataSignature) {
        syncDiaryFooterSubtabs();
        return;
      }
    }
    /* 앱 탭 진입 시 이미 시간기록 범위 pull 예정·진행 중이면 본문에서 같은 pull 을 또 걸지 않음(연속 깜빡임 방지) */
    const skipDupLedgerPull =
      typeof window !== "undefined" &&
      !!window.__lpDiaryLedgerPrefetchedForTabSwitch &&
      !reportLedgerRefreshFromPull;

    layoutWrap.dataset.diaryTab = currentTabId;
    layoutWrap.innerHTML = "";
    const showReportChrome = currentTabId === "2" || currentTabId === "5";
    const isUnifiedReportTab = currentTabId === "2";
    topTools.classList.toggle("diary-top-tools--time-report-mode", showReportChrome);
    inner.classList.toggle("diary-view-inner--time-report-pan", showReportChrome);
    searchBar.hidden = showReportChrome;
    reportChrome.hidden = !showReportChrome;
    topToolsNavControls.hidden = isUnifiedReportTab || currentTabId === "5";
    topAddBtn.hidden = isUnifiedReportTab || currentTabId === "5";
    reportChromeToggleRow.hidden = false;

    reportChromeDateRow.replaceChildren();
    if (showReportChrome) {
      reportChromeDateRow.appendChild(buildTimeReportDateBar());
    }
    if (!showReportChrome) {
      searchInput.value = searchQuery;
      searchInput.placeholder = "날짜·내용 검색...";
    }
    let gNow = "day";
    if (currentTabId === "2") {
      gNow = tab2ViewGranularity === "month" ? "month" : "day";
    } else if (currentTabId === "3") {
      gNow = tab3ViewGranularity === "month" ? "month" : "day";
    } else if (currentTabId === "5") {
      gNow = tab5ViewGranularity === "month" ? "month" : "day";
    }
    granularityDayBtn.classList.toggle("is-active", gNow === "day");
    granularityMonthBtn.classList.toggle("is-active", gNow === "month");
    granularityDayBtn.setAttribute("aria-pressed", gNow === "day" ? "true" : "false");
    granularityMonthBtn.setAttribute("aria-pressed", gNow === "month" ? "true" : "false");

    delete layoutWrap.dataset.tab2Granularity;
    delete layoutWrap.dataset.tab2SelectedDate;
    delete layoutWrap.dataset.tab3Granularity;
    delete layoutWrap.dataset.tab3SelectedDate;
    delete layoutWrap.dataset.tab5Granularity;
    delete layoutWrap.dataset.tab5SelectedDate;

    if (currentTabId === "2") {
      layoutWrap.dataset.tab2Granularity = gNow;
      let da2 = normalizeDiaryDateStr(tab2ReportAnchorDateStr);
      if (!da2 || da2.length < 10) {
        da2 = toDateStr(new Date());
        tab2ReportAnchorDateStr = da2;
        persistTab2ReportAnchorDate();
      }
      layoutWrap.dataset.tab2SelectedDate = da2;
    } else if (currentTabId === "3") {
      layoutWrap.dataset.tab3Granularity = gNow;
      let da3 = normalizeDiaryDateStr(tab3ReportAnchorDateStr);
      if (!da3 || da3.length < 10) {
        da3 = toDateStr(new Date());
        tab3ReportAnchorDateStr = da3;
        persistTab3ReportAnchorDate();
      }
      layoutWrap.dataset.tab3SelectedDate = da3;
    } else if (currentTabId === "5") {
      layoutWrap.dataset.tab5Granularity = gNow;
      let da5 = normalizeDiaryDateStr(tab5ReportAnchorDateStr);
      if (!da5 || da5.length < 10) {
        da5 = toDateStr(new Date());
        tab5ReportAnchorDateStr = da5;
        persistTab5ReportAnchorDate();
      }
      layoutWrap.dataset.tab5SelectedDate = da5;
    }

    const mobile = isDiaryMobileViewport();
    /* 데스크톱·모바일 동일: 날짜 사이드바 없이 카드 피드만 스크롤 */
    inner.classList.remove("diary-view-inner--desktop-mac-diary");
    el.classList.remove("diary-view--desktop-mac-diary");
    const layout = document.createElement("div");
    layout.className =
      "diary-layout diary-layout--feed-only" +
      (!mobile ? " diary-layout--no-sidebar" : "") +
      (mobile ? " diary-layout--mobile" : "");

    if (!DIARY_FOOTER_TAB_ORDER.includes(currentTabId)) {
      currentTabId = DIARY_DEFAULT_REPORT_TAB;
    }

    const fullEntryList = ensureTabEntries(currentTabId);
    if (fullEntryList.length > 0 && (!currentEntryId || !fullEntryList.some((e) => e.id === currentEntryId))) {
      currentEntryId = fullEntryList[0].id;
    }

    const addPageHandler = () => {
      const today = toDateStr(new Date());
      const tab2PickDate =
        currentTabId === "2"
          ? (() => {
              const y = normalizeDiaryDateStr(tab2ReportAnchorDateStr);
              return y && y.length >= 10 ? y : today;
            })()
          : null;
      ensureTabEntries(currentTabId);
      const rawList = getTabEntriesRaw(currentTabId);
      const id = newDiaryEntryId();
      const newEntry =
        currentTabId === "3"
          ? { id, date: today, title: "제목없음", q1: "", q2: "", q3: "", q4: "" }
          : {
              id,
              date: currentTabId === "2" && tab2PickDate ? tab2PickDate : today,
              title: "제목없음",
              content: "",
              qa:
                currentTabId === "2"
                  ? Object.fromEntries(TAB2_QA_TEMPLATE.map((_, i) => [String(i), ""]))
                  : undefined,
            };
      openDiaryComposeModal(newEntry, currentTabId, { draft: true });
    };

    topAddBtn.onclick = () => {
      addPageHandler();
    };

    // ----- 본문: 스크롤 영역 — 일기 카드·본문 미리보기 없음(보고서로 채울 빈 영역)
    const contentArea = document.createElement("div");
    contentArea.className = "diary-content-area";
    const scrollWrap = document.createElement("div");
    scrollWrap.className = "diary-content-scroll";
    const showUnifiedTimeReport =
      currentTabId === "2" &&
      (tab2ViewGranularity === "day" || tab2ViewGranularity === "month");

    if (showUnifiedTimeReport) {
      scrollWrap.setAttribute("data-lp-time-report-body", "");
      scrollWrap.classList.add("diary-content-scroll--time-report-swipe");
      scrollWrap.setAttribute("data-lp-time-report-vertical-start", "");
    }
    contentArea.appendChild(scrollWrap);

    if (showUnifiedTimeReport) {
      const ymd = layoutWrap.dataset.tab2SelectedDate || tab2ReportAnchorDateStr;
      const g = tab2ViewGranularity === "month" ? "month" : "day";
      mountUnifiedTimeReport(scrollWrap, ymd, g);

      if (!reportLedgerRefreshFromPull && !skipDupLedgerPull) {
        const { rangeStart: rs, rangeEnd: re } = diaryReportLedgerPullRange(ymd, g);
        const yTen = normalizeDiaryDateStr(ymd);
        const anchorsAtStart = {
          tabId: currentTabId,
          granularity: tab2ViewGranularity,
          ymd: yTen,
          monthYm:
            g === "month" && /^\d{4}-\d{2}-\d{2}$/.test(yTen) ? yTen.slice(0, 7) : null,
        };
        void pullTimeLedgerEntriesForDateRange(rs, re).finally(() => {
          if (
            anchorsAtStart.tabId !== currentTabId ||
            anchorsAtStart.granularity !== tab2ViewGranularity
          ) {
            return;
          }
          if (anchorsAtStart.monthYm) {
            const curYm = normalizeDiaryDateStr(tab2ReportAnchorDateStr).slice(0, 7);
            if (curYm !== anchorsAtStart.monthYm) return;
          } else if (
            anchorsAtStart.ymd &&
            /^\d{4}-\d{2}-\d{2}$/.test(normalizeDiaryDateStr(tab2ReportAnchorDateStr)) &&
            anchorsAtStart.ymd !== normalizeDiaryDateStr(tab2ReportAnchorDateStr)
          ) {
            return;
          }
          try {
            reportLedgerRefreshFromPull = true;
            renderLayout();
          } finally {
            reportLedgerRefreshFromPull = false;
          }
        });
      }
    }

    layout.appendChild(contentArea);
    layoutWrap.appendChild(layout);

    syncDiaryFooterSubtabs();
    if (currentTabId === "2" || currentTabId === "3") {
      rememberTimeReportDataSignature();
    }
  }

    function diarySoftRefreshAfterTabPull() {
      try {
        entries = loadDiaryEntries();
        const alist = ensureTabEntries(currentTabId);
        if (currentEntryId && !alist.some((e) => e.id === currentEntryId)) {
          currentEntryId = alist.length > 0 ? alist[0].id : null;
        }
        const sig = snapshotTimeReportDataSignature();
        if (sig === lastTimeReportDataSignature) return;
        reportLedgerRefreshFromPull = true;
        try {
          renderLayout();
        } finally {
          reportLedgerRefreshFromPull = false;
        }
      } catch (_) {}
    }
    window.__lpDiarySoftRefresh = diarySoftRefreshAfterTabPull;

    granularityDayBtn.addEventListener("click", () => {
      if (currentTabId === "2") tab2ViewGranularity = "day";
      else if (currentTabId === "3") tab3ViewGranularity = "day";
      renderLayout();
    });
    granularityMonthBtn.addEventListener("click", () => {
      if (currentTabId === "2") tab2ViewGranularity = "month";
      else if (currentTabId === "3") tab3ViewGranularity = "month";
      renderLayout();
    });

    mountDiaryFooterSubtabs();
    const initialList = ensureTabEntries(currentTabId);
    currentEntryId = initialList.length > 0 ? initialList[0].id : null;
    renderLayout();
  })();

  return el;
}
