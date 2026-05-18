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
  TAB3_EMOTION_TEMPLATE,
  TAB3_EMOTION_PLACEHOLDERS,
} from "../diaryData.js";
import { hydrateDiaryFromCloud, deleteDiaryEntryFromSupabase } from "../utils/diarySupabase.js";
import {
  pullTimeLedgerEntriesForDateRange,
  readTimeLedgerPullRangeForKpiTabsYmd,
} from "../utils/timeLedgerEntriesSupabase.js";
import { getAppFooterActionsSlot, APP_FOOTER_ICON_BTN_CLASS } from "../utils/appFooterShell.js";
import {
  formatIntegerMinutesDurationKo,
  formatInvestReclaimWonDisplay,
  formatLedgerLossKrwDisplay,
  formatYmdDotsWithWeekdayKo,
  getDailyInvestReclaimSnapshot,
  getDailyProductiveCategoryInvestBarsSnapshot,
  getDailyTimeReportDonutSnapshot,
  getDailyTimeReportSummaryGrid,
  getMonthlyInvestReclaimSnapshot,
  getMonthlyProductiveCategoryInvestBarsSnapshot,
  getMonthlyTimeReportDonutSnapshot,
  getMonthlyTimeReportSummaryGrid,
  getTimeReportMonthInclusiveRange,
} from "./Time.js";

/** 요약 카드 아이콘 자리 — 파스텔(실제 아이콘은 사용자가 채움) */
const SUMMARY_ICON_PASTELS = [
  "#C7E2FF",
  "#CDE8F7",
  "#FBCFE8",
  "#FDE68A",
  "#BBF7D0",
  "#DDD6FE",
  "#FECACA",
];

/** 시간 레포트 일별 도넛 — 파스텔 순환 */
const REPORT_DONUT_PASTELS = [
  "#93C5FD",
  "#FCA5A5",
  "#86EFAC",
  "#C4B5FD",
  "#FCD34D",
  "#5EEAD4",
  "#F9A8D4",
  "#A5B4FC",
  "#FDBA74",
  "#DDD6FE",
];

/** 투자 탭 레포트 — 생산 카테고리 막대 채색(소비 도넛과 같은 톤) */
const DIARY_PROD_CAT_BAR_FILL = {
  dream: "#93C5FD",
  happiness: "#FCA5A5",
  sideincome: "#86EFAC",
  health: "#C4B5FD",
  other_prod: "#CBD5E1",
};

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
  if (tabId === "3") return "소비";
  if (tabId === "2") return "투자";
  if (tabId === "4") return "예산";
  return "메모";
}

/** 모달 제목 등 긴 표기 */
function diaryTabModalTitle(tabId) {
  if (tabId === "3") return "소비";
  if (tabId === "2") return "투자";
  if (tabId === "4") return "예산";
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

/** 투자 탭 레포트 — 바이백 카드 기준 줄(일·월) */
function timeReportInvestPeriodCaption(ymdTen, granularity) {
  const ten = normalizeDiaryDateStr(ymdTen);
  if (granularity === "month") {
    const ym = ten.length >= 7 ? ten.slice(0, 7) : "";
    const today = toDateStr(new Date());
    const disp = formatMonthSlashFromYmd(ten);
    if (!disp) return "조회 기간";
    if (ym && ym === today.slice(0, 7)) return `이번 달 · ${disp}`;
    return disp;
  }
  return (
    formatYmdDotsWithWeekdayKo(ten) ||
    (ten.length >= 10 ? formatDateDisplay(ten) : "") ||
    "조회일"
  );
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
    granularityBar.setAttribute("aria-label", "데이·먼스 보기 단위");
  const granularityDayBtn = document.createElement("button");
  granularityDayBtn.type = "button";
  granularityDayBtn.className = "diary-report-granularity__seg";
  granularityDayBtn.textContent = "데이";
  granularityDayBtn.title = "일 단위";
  granularityDayBtn.setAttribute("aria-pressed", "true");
  const granularityMonthBtn = document.createElement("button");
  granularityMonthBtn.type = "button";
  granularityMonthBtn.className = "diary-report-granularity__seg";
  granularityMonthBtn.textContent = "먼스";
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

  let currentTabId = "2";
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
  const LP_TAB3_REPORT_DATE_KEY = "lp_tab3_report_anchor_date";
  let tab3ReportAnchorDateStr = (() => {
    try {
      const raw = sessionStorage.getItem(LP_TAB3_REPORT_DATE_KEY);
      if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    } catch (_) {}
    return toDateStr(new Date());
  })();

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
    if (tabId === "3") {
      ensureTab3Entries(entries);
      const list = entries["3"].entries || [];
      return [...list].sort(compareDiaryEntriesNewestFirst);
    }
    if (tabId === "4" && !entries["4"]) {
      entries["4"] = { entries: [] };
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

  /** 소비 · 투자 · 메모 · 예산(메모 옆, 우선 빈 화면) */
  const DIARY_FOOTER_TAB_ORDER = ["3", "2", "1", "4"];

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

  /** 도넛 범례용 정수 % (합 100 근사) */
  function legendIntegerPercents(hoursList, totalHrs) {
    if (!Array.isArray(hoursList) || totalHrs <= 0 || !hoursList.length) {
      return hoursList.map(() => 0);
    }
    const exact = hoursList.map((h) => (h / totalHrs) * 100);
    const out = exact.map((x) => Math.floor(x));
    let rem = 100 - out.reduce((a, b) => a + b, 0);
    const idxs = exact
      .map((x, i) => ({ i, f: x - out[i] }))
      .sort((a, b) => b.f - a.f);
    if (idxs.length === 0) return out;
    for (let k = 0; k < rem; k++) out[idxs[k % idxs.length].i] += 1;
    return out;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";

  /** 도넛 윗점(-90°) 기준 반시계향 호 조각(path d). 전체 원(≈360°)은 두 번으로 나눔 */
  function annularSectorPath(cx, cy, rOut, rIn, a0, a1) {
    const span = a1 - a0;
    if (span <= 1e-9) return "";
    const twoPi = Math.PI * 2;
    if (span >= twoPi - 1e-5) {
      const h = annularSectorPath(cx, cy, rOut, rIn, a0, a0 + Math.PI);
      const h2 = annularSectorPath(cx, cy, rOut, rIn, a0 + Math.PI, a0 + twoPi);
      return `${h} ${h2}`;
    }
    const large = span > Math.PI ? 1 : 0;
    const x1 = cx + rOut * Math.cos(a0);
    const y1 = cy + rOut * Math.sin(a0);
    const x2 = cx + rOut * Math.cos(a1);
    const y2 = cy + rOut * Math.sin(a1);
    const x3 = cx + rIn * Math.cos(a1);
    const y3 = cy + rIn * Math.sin(a1);
    const x4 = cx + rIn * Math.cos(a0);
    const y4 = cy + rIn * Math.sin(a0);
    return [
      "M",
      x1,
      y1,
      "A",
      rOut,
      rOut,
      0,
      large,
      1,
      x2,
      y2,
      "L",
      x3,
      y3,
      "A",
      rIn,
      rIn,
      0,
      large,
      0,
      x4,
      y4,
      "Z",
    ].join(" ");
  }

  /** 투자 탭: 가계부와 동일 바이백(다시 받을 금액) + 집계 시간 */
  function mountTimeReportInvestBank(scrollWrap, ymdTen, granularity) {
    const snap =
      granularity === "month"
        ? getMonthlyInvestReclaimSnapshot(ymdTen)
        : getDailyInvestReclaimSnapshot(ymdTen);

    const section = document.createElement("section");
    section.className = "diary-tr-invest-shell";
    section.setAttribute("aria-label", "투자 바이백 요약");

    const card = document.createElement("div");
    card.className = "diary-tr-invest-card";

    const eyebrow = document.createElement("p");
    eyebrow.className = "diary-tr-invest-eyebrow";
    eyebrow.textContent = "시간 가계부 · 투자(바이백)";

    const period = document.createElement("p");
    period.className = "diary-tr-invest-period";
    period.textContent = timeReportInvestPeriodCaption(ymdTen, granularity);

    const reclaimLbl = document.createElement("p");
    reclaimLbl.className = "diary-tr-invest-reclaim-caption";
    reclaimLbl.textContent = "다시 받을 금액";

    const reclaimAmt = document.createElement("p");
    reclaimAmt.className = "diary-tr-invest-reclaim-amount";
    reclaimAmt.textContent = formatInvestReclaimWonDisplay(snap.reclaimWon);

    const timeStrip = document.createElement("div");
    timeStrip.className = "diary-tr-invest-time-strip";
    const tsl = document.createElement("span");
    tsl.className = "diary-tr-invest-time-strip-label";
    tsl.textContent = "투자로 집계된 시간 합계";
    const tsv = document.createElement("span");
    tsv.className = "diary-tr-invest-time-strip-value";
    tsv.textContent = formatIntegerMinutesDurationKo(snap.reclaimMinutesRounded);
    timeStrip.appendChild(tsl);
    timeStrip.appendChild(tsv);

    card.appendChild(eyebrow);
    card.appendChild(period);
    card.appendChild(reclaimLbl);
    card.appendChild(reclaimAmt);
    card.appendChild(timeStrip);
    if (!(snap.hourlyRate > 0)) {
      const hint = document.createElement("p");
      hint.className = "diary-tr-invest-hint";
      hint.textContent = "시급을 입력하면 원화가 계산됩니다.";
      card.appendChild(hint);
    }
    section.appendChild(card);
    scrollWrap.appendChild(section);
  }

  /** 투자 탭: 생산 과제 카테고리별 비중(가로 막대) */
  function mountTimeReportProductiveBars(scrollWrap, ymdTen, granularity) {
    const snap =
      granularity === "month"
        ? getMonthlyProductiveCategoryInvestBarsSnapshot(ymdTen)
        : getDailyProductiveCategoryInvestBarsSnapshot(ymdTen);

    const section = document.createElement("section");
    section.className = "diary-tr-prod-bars-shell";
    section.setAttribute("aria-label", "생산 과제 카테고리별 투자 비중");

    const h2 = document.createElement("h2");
    h2.className = "diary-tr-prod-bars-heading";
    h2.textContent = "생산 과제 · 카테고리별 투자 비중";

    const card = document.createElement("div");
    card.className = "diary-tr-prod-bars-card";
    if (!snap.totalProductiveHours || snap.totalProductiveHours <= 0) {
      const empty = document.createElement("p");
      empty.className = "diary-tr-prod-bars-empty";
      empty.textContent = "표시할 생산 과제 기록이 없습니다.";
      card.appendChild(empty);
    } else {
      snap.segments.forEach((seg) => {
        const row = document.createElement("div");
        row.className = "diary-tr-prod-bar-row";
        const meta = document.createElement("div");
        meta.className = "diary-tr-prod-bar-meta";
        const lab = document.createElement("span");
        lab.className = "diary-tr-prod-bar-label";
        lab.textContent = seg.label;
        const pct = document.createElement("span");
        pct.className = "diary-tr-prod-bar-pct";
        pct.textContent = `${seg.pctRounded}%`;
        meta.appendChild(lab);
        meta.appendChild(pct);
        const track = document.createElement("div");
        track.className = "diary-tr-prod-bar-track";
        track.setAttribute("aria-hidden", "true");
        const fill = document.createElement("div");
        fill.className = "diary-tr-prod-bar-fill";
        const wPct = Math.min(100, Math.max(0, seg.pct));
        fill.style.width = `${wPct}%`;
        fill.style.background =
          DIARY_PROD_CAT_BAR_FILL[seg.categoryKey] || DIARY_PROD_CAT_BAR_FILL.other_prod;
        track.appendChild(fill);
        row.appendChild(meta);
        row.appendChild(track);
        card.appendChild(row);
      });
    }

    section.appendChild(h2);
    section.appendChild(card);
    scrollWrap.appendChild(section);
  }

  /** 소비 탭 일·월 공통: 아이콘 자리(파스텔) + 제목 + 시간·(원) 요약 카드 그리드 */
  function mountTimeReportSummaryGrid(scrollWrap, ymdTen, granularity) {
    const g =
      granularity === "month"
        ? getMonthlyTimeReportSummaryGrid(ymdTen)
        : getDailyTimeReportSummaryGrid(ymdTen);
    const section = document.createElement("section");
    section.className = "diary-tr-summary-shell";
    section.setAttribute(
      "aria-label",
      granularity === "month" ? "선택한 달의 시간·행동 요약" : "선택한 날의 시간·행동 요약",
    );

    const grid = document.createElement("div");
    grid.className = "diary-tr-summary-grid";

    const showMoney = g.hourlyRate > 0;
    /** @type {Array<{ title: string, minutes: number, lossWon?: number | null, meals?: string[] }>} */
    const specs = [
      { title: "근무시간", minutes: g.workMinutes },
      { title: "수면시간", minutes: g.sleepMinutes },
      {
        title: "미디어 시청시간",
        minutes: g.mediaMinutes,
        lossWon: showMoney ? g.mediaLossWon : null,
      },
      { title: "쾌락만 쫓은 시간", minutes: g.pleasureMinutes },
      {
        title: "건강을 해치는데 쓴 시간",
        minutes: g.unhealthyMinutes,
        meals: g.unhealthyMealDetails.length ? g.unhealthyMealDetails : undefined,
      },
      {
        title: "시간도 잃고, 돈도 잃고",
        minutes: g.moneylosingMinutes,
        lossWon: showMoney ? g.moneylosingLossWon : null,
      },
      {
        title: "도파민 충전료",
        minutes: g.pleasureMinutes,
        lossWon: showMoney ? g.pleasureLossWon : null,
      },
    ];

    specs.forEach((c, i) => {
      const art = document.createElement("article");
      art.className = "diary-tr-summary-card";

      const iconSlot = document.createElement("div");
      iconSlot.className = "diary-tr-summary-icon-slot";
      iconSlot.style.backgroundColor = SUMMARY_ICON_PASTELS[i % SUMMARY_ICON_PASTELS.length];
      iconSlot.setAttribute("aria-hidden", "true");

      const h = document.createElement("h3");
      h.className = "diary-tr-summary-title";
      h.textContent = c.title;

      const timeEl = document.createElement("p");
      timeEl.className = "diary-tr-summary-time";
      timeEl.textContent = formatIntegerMinutesDurationKo(c.minutes);

      art.appendChild(iconSlot);
      art.appendChild(h);
      art.appendChild(timeEl);

      if (c.lossWon != null) {
        const moneyEl = document.createElement("p");
        moneyEl.className = "diary-tr-summary-money";
        moneyEl.textContent = formatLedgerLossKrwDisplay(c.lossWon);
        art.appendChild(moneyEl);
      }

      if (Array.isArray(c.meals) && c.meals.length > 0) {
        const ul = document.createElement("ul");
        ul.className = "diary-tr-summary-meals";
        c.meals.forEach((line) => {
          const li = document.createElement("li");
          li.textContent = line;
          ul.appendChild(li);
        });
        art.appendChild(ul);
      }

      grid.appendChild(art);
    });

    section.appendChild(grid);
    scrollWrap.appendChild(section);
  }

  /** 도넛 카드 아래 · 요약 그리드 위 — 구분선 + 소제목 */
  function mountTimeReportConsumptionSectionHeader(scrollWrap) {
    const block = document.createElement("div");
    block.className = "diary-tr-consumption-section-header";

    const rule = document.createElement("hr");
    rule.className = "diary-tr-consumption-section-rule";
    rule.setAttribute("aria-hidden", "true");

    const h2 = document.createElement("h2");
    h2.className = "diary-tr-consumption-section-title";
    h2.textContent = "시간 소비 리포트";

    block.appendChild(rule);
    block.appendChild(h2);
    scrollWrap.appendChild(block);
  }

  /** 소비 탭 일·월 공통 본문: 수면·근무 제외 세부 카테고리 도넛 */
  function mountTimeReportDonut(scrollWrap, ymdTen, granularity) {
    const snap =
      granularity === "month"
        ? getMonthlyTimeReportDonutSnapshot(ymdTen)
        : getDailyTimeReportDonutSnapshot(ymdTen);
    const section = document.createElement("section");
    section.className = "diary-tr-donut-shell";

    const headingId =
      granularity === "month"
        ? "diary-time-report-month-donut-heading"
        : "diary-time-report-day-donut-heading";
    const blockTitle = document.createElement("h2");
    blockTitle.className = "diary-tr-donut-block-heading";
    blockTitle.id = headingId;
    blockTitle.textContent =
      granularity === "month"
        ? timeReportMonthDonutBlockTitle(ymdTen)
        : timeReportDayDonutBlockTitle(ymdTen);
    section.setAttribute("aria-labelledby", headingId);

    const card = document.createElement("div");
    card.className = "diary-tr-donut-card";

    const viz = document.createElement("div");
    viz.className = "diary-tr-donut-viz";

    const host = document.createElement("div");
    host.className = "diary-tr-donut-ring-host";

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 200 200");
    svg.classList.add("diary-tr-donut-svg");
    svg.setAttribute("aria-hidden", "true");

    const center = document.createElement("div");
    center.className = "diary-tr-donut-center";

    const cap = document.createElement("span");
    cap.className = "diary-tr-donut-center-caption";
    cap.textContent = "전체";

    const strong = document.createElement("strong");
    strong.className = "diary-tr-donut-center-value";

    center.appendChild(cap);
    center.appendChild(strong);

    host.appendChild(svg);
    host.appendChild(center);
    viz.appendChild(host);

    const legend = document.createElement("ul");
    legend.className = "diary-tr-donut-legend";

    const totalH = snap.totalHours;
    if (!totalH || totalH <= 0) {
      strong.textContent = "—";
      const circ = document.createElementNS(SVG_NS, "circle");
      circ.setAttribute("cx", "100");
      circ.setAttribute("cy", "100");
      circ.setAttribute("r", "71");
      circ.setAttribute("fill", "none");
      circ.setAttribute("stroke", "#e2e8f0");
      circ.setAttribute("stroke-width", "42");
      svg.appendChild(circ);
      const li = document.createElement("li");
      li.className = "diary-tr-donut-legend-empty";
      li.textContent =
        granularity === "month"
          ? "수면·근무를 뺀 뒤 집계할 생산·비생산 카테고리 시간이 없습니다. 시간가계부에서 해당 달 기록을 모아 두면 여기 표시됩니다."
          : "수면·근무를 뺀 뒤 집계할 생산·비생산 카테고리 시간이 없습니다. 시간가계부에서 해당 날짜를 기록해 보세요.";
      legend.appendChild(li);
    } else {
      strong.textContent = formatIntegerMinutesDurationKo(snap.totalMinutesRounded);
      const segs = snap.segments;
      const colors = segs.map((_, i) => REPORT_DONUT_PASTELS[i % REPORT_DONUT_PASTELS.length]);
      const pcts = legendIntegerPercents(
        segs.map((s) => s.hours),
        totalH,
      );

      const rOut = 92;
      const rIn = 48;
      let angle = -Math.PI / 2;

      segs.forEach((s, i) => {
        const span = (s.hours / totalH) * 2 * Math.PI;
        const a0 = angle;
        const a1 = angle + span;
        const d = annularSectorPath(100, 100, rOut, rIn, a0, a1);
        if (d) {
          const path = document.createElementNS(SVG_NS, "path");
          path.setAttribute("d", d);
          path.setAttribute("fill", colors[i]);
          svg.appendChild(path);

          const showPct =
            span >= 0.18 && (pcts[i] >= 5 || (segs.length <= 3 && pcts[i] >= 1));
          if (showPct) {
            const mid = (a0 + a1) / 2;
            const tr = (rOut + rIn) / 2;
            const tx = 100 + tr * Math.cos(mid);
            const ty = 100 + tr * Math.sin(mid);
            const t = document.createElementNS(SVG_NS, "text");
            t.setAttribute("x", String(tx));
            t.setAttribute("y", String(ty));
            t.setAttribute("text-anchor", "middle");
            t.setAttribute("dominant-baseline", "middle");
            t.classList.add("diary-tr-donut-slice-pct");
            t.textContent = `${pcts[i]}%`;
            svg.appendChild(t);
          }
        }
        angle = a1;
      });

      segs.forEach((s, i) => {
        const li = document.createElement("li");
        li.className = "diary-tr-donut-legend-item";
        const dot = document.createElement("span");
        dot.className = "diary-tr-donut-legend-dot";
        dot.style.background = colors[i];
        const lbl = document.createElement("span");
        lbl.className = "diary-tr-donut-legend-label";
        lbl.textContent = s.label;
        li.appendChild(dot);
        li.appendChild(lbl);
        legend.appendChild(li);
      });
    }

    card.appendChild(viz);
    card.appendChild(legend);
    section.appendChild(blockTitle);
    section.appendChild(card);
    scrollWrap.appendChild(section);
  }

  /** 투자·소비 공통: 데이 time-task-log-date-native-wrap · 먼스 ‹ › (현재 탭별 앵커) */
  function buildTimeReportDateBar() {
    const bar = document.createElement("div");
    bar.className = "diary-time-report-date-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "보고서 기준 날짜");

    const useTab2 = currentTabId === "2";
    let anchor = normalizeDiaryDateStr(
      useTab2 ? tab2ReportAnchorDateStr : tab3ReportAnchorDateStr,
    );
    if (!anchor || anchor.length < 10) {
      anchor = toDateStr(new Date());
      if (useTab2) {
        tab2ReportAnchorDateStr = anchor;
        persistTab2ReportAnchorDate();
      } else {
        tab3ReportAnchorDateStr = anchor;
        persistTab3ReportAnchorDate();
      }
    } else {
      if (useTab2) tab2ReportAnchorDateStr = anchor;
      else tab3ReportAnchorDateStr = anchor;
    }

    const isMonth = useTab2
      ? tab2ViewGranularity === "month"
      : tab3ViewGranularity === "month";

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
        if (useTab2) {
          tab2ReportAnchorDateStr = v;
          persistTab2ReportAnchorDate();
        } else {
          tab3ReportAnchorDateStr = v;
          persistTab3ReportAnchorDate();
        }
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
      if (useTab2) {
        tab2ReportAnchorDateStr = next;
        persistTab2ReportAnchorDate();
      } else {
        tab3ReportAnchorDateStr = next;
        persistTab3ReportAnchorDate();
      }
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

  function renderLayout() {
    layoutWrap.dataset.diaryTab = currentTabId;
    layoutWrap.innerHTML = "";
    const showReportChrome = currentTabId === "2" || currentTabId === "3";
    const isConsumptionTab = currentTabId === "3";
    topTools.classList.toggle("diary-top-tools--time-report-mode", showReportChrome);
    searchBar.hidden = showReportChrome;
    reportChrome.hidden = !showReportChrome;
    topToolsNavControls.hidden = isConsumptionTab;
    /* 예산(탭4): 우선 빈 화면 — 새 글 + 숨김 */
    topAddBtn.hidden = isConsumptionTab || currentTabId === "4";

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
    }
    granularityDayBtn.classList.toggle("is-active", gNow === "day");
    granularityMonthBtn.classList.toggle("is-active", gNow === "month");
    granularityDayBtn.setAttribute("aria-pressed", gNow === "day" ? "true" : "false");
    granularityMonthBtn.setAttribute("aria-pressed", gNow === "month" ? "true" : "false");

    delete layoutWrap.dataset.tab2Granularity;
    delete layoutWrap.dataset.tab2SelectedDate;
    delete layoutWrap.dataset.tab3Granularity;
    delete layoutWrap.dataset.tab3SelectedDate;

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

    if (currentTabId === "3") {
      ensureTab3Entries(entries);
    }

    if (!DIARY_FOOTER_TAB_ORDER.includes(currentTabId)) {
      currentTabId = "2";
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
    const showTab3ConsumptionReport =
      currentTabId === "3" &&
      (tab3ViewGranularity === "day" || tab3ViewGranularity === "month");
    const showTab2InvestReport =
      currentTabId === "2" &&
      (tab2ViewGranularity === "day" || tab2ViewGranularity === "month");

    if (showTab3ConsumptionReport || showTab2InvestReport) {
      scrollWrap.setAttribute("data-lp-time-report-body", "");
    }
    contentArea.appendChild(scrollWrap);

    if (showTab2InvestReport) {
      const ymd = layoutWrap.dataset.tab2SelectedDate || tab2ReportAnchorDateStr;
      const g = tab2ViewGranularity === "month" ? "month" : "day";
      mountTimeReportInvestBank(scrollWrap, ymd, g);
      mountTimeReportProductiveBars(scrollWrap, ymd, g);

      if (!reportLedgerRefreshFromPull) {
        const k = readTimeLedgerPullRangeForKpiTabsYmd();
        let rs = k.rangeStart;
        let re = k.rangeEnd;
        const yTen = normalizeDiaryDateStr(ymd);
        if (g === "day") {
          if (/^\d{4}-\d{2}-\d{2}$/.test(yTen)) {
            if (yTen < rs) rs = yTen;
            if (yTen > re) re = yTen;
          }
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(yTen)) {
          const monthRng = getTimeReportMonthInclusiveRange(yTen);
          if (monthRng) {
            if (monthRng.start < rs) rs = monthRng.start;
            if (monthRng.end > re) re = monthRng.end;
          }
        }
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

    if (showTab3ConsumptionReport) {
      const ymd = layoutWrap.dataset.tab3SelectedDate || tab3ReportAnchorDateStr;
      const g = tab3ViewGranularity === "month" ? "month" : "day";
      mountTimeReportDonut(scrollWrap, ymd, g);
      mountTimeReportConsumptionSectionHeader(scrollWrap);
      mountTimeReportSummaryGrid(scrollWrap, ymd, g);

      if (!reportLedgerRefreshFromPull) {
        const k = readTimeLedgerPullRangeForKpiTabsYmd();
        let rs = k.rangeStart;
        let re = k.rangeEnd;
        const yTen = normalizeDiaryDateStr(ymd);
        if (g === "day") {
          if (/^\d{4}-\d{2}-\d{2}$/.test(yTen)) {
            if (yTen < rs) rs = yTen;
            if (yTen > re) re = yTen;
          }
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(yTen)) {
          const monthRng = getTimeReportMonthInclusiveRange(yTen);
          if (monthRng) {
            if (monthRng.start < rs) rs = monthRng.start;
            if (monthRng.end > re) re = monthRng.end;
          }
        }
        const anchorsAtStart = {
          tabId: currentTabId,
          granularity: tab3ViewGranularity,
          ymd: yTen,
          monthYm:
            g === "month" && /^\d{4}-\d{2}-\d{2}$/.test(yTen) ? yTen.slice(0, 7) : null,
        };
        void pullTimeLedgerEntriesForDateRange(rs, re).finally(() => {
          if (
            anchorsAtStart.tabId !== currentTabId ||
            anchorsAtStart.granularity !== tab3ViewGranularity
          ) {
            return;
          }
          if (anchorsAtStart.monthYm) {
            const curYm = normalizeDiaryDateStr(tab3ReportAnchorDateStr).slice(0, 7);
            if (curYm !== anchorsAtStart.monthYm) return;
          } else if (
            anchorsAtStart.ymd &&
            /^\d{4}-\d{2}-\d{2}$/.test(normalizeDiaryDateStr(tab3ReportAnchorDateStr)) &&
            anchorsAtStart.ymd !== normalizeDiaryDateStr(tab3ReportAnchorDateStr)
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
  }

    granularityDayBtn.addEventListener("click", () => {
      if (currentTabId === "2") tab2ViewGranularity = "day";
      else tab3ViewGranularity = "day";
      renderLayout();
    });
    granularityMonthBtn.addEventListener("click", () => {
      if (currentTabId === "2") tab2ViewGranularity = "month";
      else tab3ViewGranularity = "month";
      renderLayout();
    });

    mountDiaryFooterSubtabs();
    const initialList = ensureTabEntries(currentTabId);
    currentEntryId = initialList.length > 0 ? initialList[0].id : null;
    renderLayout();

    void hydrateDiaryFromCloud()
      .catch(() => {})
      .finally(() => {
        entries = loadDiaryEntries();
        const alist = ensureTabEntries(currentTabId);
        if (currentEntryId && !alist.some((e) => e.id === currentEntryId)) {
          currentEntryId = alist.length > 0 ? alist[0].id : null;
        }
        renderLayout();
      });
  })();

  return el;
}
