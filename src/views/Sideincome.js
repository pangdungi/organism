/**
 * 시급 상승 페이지 - 꿈 페이지와 동일 구조
 * 시급 상승 목표 추가 모달 → 확인 시 탭 형성, KPI 카드, 로그, 할일
 * 활성 탭 연필 버튼으로 이름·목표 수정/삭제 모달
 */

import {
  SIDEINCOME_KPI_MAP_STORAGE_KEY,
  applySideincomeKpiTimestampsOnSave,
} from "../utils/sideincomeKpiMapSupabase.js";
import {
  kpiTimeTaskEnsure,
  kpiTimeTaskRemove,
  kpiTimeTaskRename,
  getFullTaskOptions,
} from "../utils/timeTaskOptionsModel.js";
import {
  buildModalNativeDateFieldMarkup,
  initModalNativeDateFieldsIn,
} from "../utils/modalNativeDateField.js";
import {
  afterKpiTodoListMutationScroll,
  captureKpiDetailScroll,
} from "../utils/kpiTodoInputScroll.js";
import { minutesToHhMm, syncHabitTrackerLogs } from "../utils/timeKpiSync.js";
import {
  kpiFormGoalAndTargetSectionHtml,
  readKpiGoalModeFormFields,
  applyKpiFormGoalFieldsToKpi,
  bindKpiGoalModeForm,
  validateKpiActionForm,
  computeKpiProgress,
  buildKpiCardTimePresentation,
  enrichKpiProgressWithHabitStreak,
  formatKpiCardProgressSectionHtml,
} from "../utils/kpiTimeUnitKpi.js";
import {
  resolveKpiDetailLogEntriesPrepared,
  resolveKpiDetailLogEntriesLocal,
  kpiDetailLogsNeedCloudPull,
} from "../utils/kpiTimeLedgerLogs.js";
import { kpiLogSourceBadgeHtml, formatKpiHistoryValueText } from "../utils/kpiLogFields.js";
import {
  wireKpiHistoryBottomTabs,
  getKpiHistoryBottomTab,
  effectiveKpiHistoryBottomTab,
  kpiUsesDailyTodosOnly,
  kpiHistoryFooterShowsAddButton,
  setKpiHistoryBottomTab,
  KPI_DETAIL_LOGS_UI_ENABLED,
  KPI_BOTTOM_TAB_LOG,
  KPI_BOTTOM_TAB_TODO,
  KPI_BOTTOM_TAB_DAILY,
  KPI_BOTTOM_TAB_NOTES,
  SIDEINCOME_KPI_NOTES_UI_ENABLED,
} from "../utils/kpiHistoryBottomTabs.js";
import { showSideincomeKpiNoteModal } from "../utils/kpiSideincomeNotesModal.js";
import {
  getLocalSideincomeKpiNotes,
  getLocalSideincomeKpiNoteTags,
  groupSideincomeKpiNotesByTag,
  pullSideincomeKpiNotesForKpi,
  saveSideincomeKpiNoteFromModal,
  deleteSideincomeKpiNoteOnServer,
} from "../utils/sideincomeKpiNotesSupabase.js";
import {
  applyKpiGridScrollRestore,
  readKpiGridScrollToRestore,
} from "../utils/kpiGridScrollRestore.js";
import {
  KPI_UI_SESSION_KEYS,
  readKpiUiSession,
  restoreKpiTabFromSession,
} from "../utils/kpiViewUiSession.js";
import { showKpiTodoAddModal } from "../utils/kpiTodoAddModal.js";
import {
  appendKpiDailyRepeatTodoAtEnd,
  sortNormalizedKpiTodoRows,
} from "../utils/kpiMapTodoListOrder.js";
import {
  mountKpiSegBarClearCompletedRow,
  confirmAndPurgeCompletedKpiTodos,
} from "../utils/kpiTodoBulkDeleteUi.js";
import { wireKpiDailyTodoListDragReorder } from "../utils/kpiDailyTodoListDragReorder.js";
import {
  createKpiDetailSectionHeader,
  mountKpiDetailStackedSections,
} from "../utils/kpiDetailSectionUi.js";
import { formatKpiCardHeroHtml } from "../utils/kpiViewModal.js";
import { kpiFilterEmptyListMessage } from "../utils/kpiFilterEmptyMessage.js";
import {
  KPI_PROGRESS_STATUS_DEFAULT,
  applyAutoCompleteManualKpiIfNeeded,
  filterKpisByProgressStatus,
  bindKpiProgressStatusField,
  kpiProgressStatusFieldHtml,
  kpiProgressStatusFilterBarHtml,
  normalizeKpiListFilter,
  progressStatusForKpiStartDate,
  readKpiProgressStatusFromForm,
} from "../utils/kpiProgressStatus.js";
import { confirmKpiActionDelete } from "../utils/confirmModal.js";
import { showKpiTodoEditModal } from "../utils/kpiTodoEditModal.js";
import {
  KPI_CARD_EDIT_PENCIL_HTML,
  SIDEINCOME_GOAL_EDIT_PENCIL_HTML,
  bindKpiCardEditButton,
} from "../utils/kpiTabNameEditIcon.js";
import { kpiCardHeadHtml, wireKpiCardIconsIn } from "../utils/kpiCardIcon.js";
import { appendKpiCardToGrid } from "../utils/kpiCardDeadlineFoot.js";
import {
  setupKpiCategoryHeaderIcon,
  setKpiCategoryHeaderIconVisible,
} from "../utils/kpiCategoryHeaderIcon.js";
import { sortKpiLogsNewestFirst } from "../utils/kpiLogsSort.js";
import {
  deletedRefsKpiTodosLen,
  kpiTodoLifecycleLog,
  kpiTodoSnapshotBrief,
  kpiTodosCompletionBrief,
} from "../utils/kpiTodoLifecycleDebug.js";
import {
  readKpiMapLocalStorageSignature,
  readKpiMapScopedStorageRaw,
  writeKpiMapScopedStorageRaw,
} from "../utils/kpiMapLocalStorage.js";
import {
  APP_FOOTER_ICON_BTN_CLASS,
  APP_FOOTER_ADD_BTN_ATTR,
  APP_FOOTER_ADD_BTN_CLASS,
  APP_FOOTER_ADD_SLOT_ATTR,
  APP_FOOTER_HOME_ICON,
  mountAppFooterAddButton,
  appendKpiFooterHomeButton,
  getAppFooterActionsSlot,
} from "../utils/appFooterShell.js";
import {
  renderKpiMapSyncLoadingIfNeeded,
  shouldShowKpiMapSyncLoading,
} from "../utils/kpiMapSyncLoadingUi.js";

const FIXED_TASK_NAMES = new Set(["수면하기", "근무하기"]);

const KPI_FOOTER_ADD_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>';

function defaultDeletedRefs() {
  return {
    categories: [],
    pathLogs: [],
    kpis: [],
    kpiLogs: [],
    kpiTodos: [],
    kpiDailyRepeatTodos: [],
  };
}

function appendDeletedRef(data, kind, id) {
  if (!id) return;
  data.deletedRefs = data.deletedRefs || defaultDeletedRefs();
  const s = String(id);
  const arr = data.deletedRefs[kind] || [];
  if (!arr.includes(s)) arr.push(s);
  data.deletedRefs[kind] = arr;
}

function normalizeSideincomePath(path) {
  if (!path || typeof path !== "object") return path;
  const hasLegacyAmount =
    !!String(path.targetAmount ?? "").trim() || !!String(path.unit ?? "").trim();
  const trackTargetAmount =
    path.trackTargetAmount != null ? !!path.trackTargetAmount : hasLegacyAmount;
  return {
    ...path,
    trackTargetAmount,
    targetAmount: trackTargetAmount ? String(path.targetAmount ?? "").trim() : "",
    unit: trackTargetAmount ? (String(path.unit ?? "").trim() || "원") : "",
  };
}

function loadSideincomeMap() {
  try {
    const raw = readKpiMapScopedStorageRaw(SIDEINCOME_KPI_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const kpis = (parsed.kpis || []).map((k) => ({
        ...k,
        needHabitTracker: !!k.needHabitTracker,
        useTimeAsUnit: !!k.useTimeAsUnit,
        direction: k.direction === "lower" ? "lower" : "higher",
      }));
      return {
        paths: (parsed.paths || []).map(normalizeSideincomePath),
        kpis,
        kpiLogs: parsed.kpiLogs || [],
        kpiTodos: parsed.kpiTodos || [],
        kpiDailyRepeatTodos: parsed.kpiDailyRepeatTodos || [],
        kpiNotes: parsed.kpiNotes || [],
        kpiNoteTags: parsed.kpiNoteTags || [],
        kpiOrder: parsed.kpiOrder || {},
        kpiTaskSync: parsed.kpiTaskSync || {},
        pathLogs: parsed.pathLogs || [],
        deletedRefs: parsed.deletedRefs && typeof parsed.deletedRefs === "object" ? parsed.deletedRefs : defaultDeletedRefs(),
      };
    }
  } catch (_) {}
  return {
    paths: [],
    kpis: [],
    kpiLogs: [],
    kpiTodos: [],
    kpiDailyRepeatTodos: [],
    kpiNotes: [],
    kpiNoteTags: [],
    kpiOrder: {},
    kpiTaskSync: {},
    pathLogs: [],
    deletedRefs: defaultDeletedRefs(),
  };
}

function getTaskName(o) {
  return typeof o === "string" ? o : (o?.name || "");
}

function syncKpiToTimeTask(kpi, action, oldName) {
  const data = loadSideincomeMap();
  data.kpiTaskSync = data.kpiTaskSync || {};
  if (action === "add") {
    const name = (kpi.name || "").trim();
    if (!name) return;
    data.kpiTaskSync[kpi.id] = name;
    saveSideincomeMap(data);
    kpiTimeTaskEnsure(kpi, "sideincome");
  } else if (action === "remove") {
    const syncName = (data.kpiTaskSync[kpi.id] || kpi.name || "").trim();
    delete data.kpiTaskSync[kpi.id];
    saveSideincomeMap(data);
    kpiTimeTaskRemove(kpi, syncName);
  } else if (action === "update" && oldName) {
    const newName = (kpi.name || "").trim();
    const oldNm = (oldName || "").trim();
    if (!newName || oldNm === newName) return;
    kpiTimeTaskRename(kpi, oldNm);
    data.kpiTaskSync[kpi.id] = newName;
    saveSideincomeMap(data);
  }
}

function saveSideincomeMap(data, opts) {
  try {
    let prev = null;
    try {
      const raw = readKpiMapScopedStorageRaw(SIDEINCOME_KPI_MAP_STORAGE_KEY);
      prev = raw ? JSON.parse(raw) : null;
    } catch (_) {
      prev = null;
    }
    const toSave = { ...data };
    if (toSave.kpiTodos && Array.isArray(toSave.kpiTodos)) {
      toSave.kpiTodos = toSave.kpiTodos.filter((t) => (t.text || "").trim() !== "");
    }
    if (toSave.kpiDailyRepeatTodos && Array.isArray(toSave.kpiDailyRepeatTodos)) {
      toSave.kpiDailyRepeatTodos = toSave.kpiDailyRepeatTodos.filter((t) => (t.text || "").trim() !== "");
    }
    const stamped = applySideincomeKpiTimestampsOnSave(prev, toSave);
    writeKpiMapScopedStorageRaw(SIDEINCOME_KPI_MAP_STORAGE_KEY, JSON.stringify(stamped));
    if (opts?.pushServer) {
      try {
        window.dispatchEvent(
          new CustomEvent("sideincome-kpi-map-saved", {
            detail: { pushServer: true, fromLocalWrite: true },
          }),
        );
      } catch (_) {}
    }
  } catch (_) {}
}

function nextId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function sanitizeNumericInput(val) {
  return String(val || "").replace(/[^\d.-]/g, "");
}

function formatIntegerWithCommas(val) {
  const digits = String(val || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function setupWonAmountInput(inp) {
  if (!inp || inp.dataset.sideincomeTargetBound) return;
  inp.dataset.sideincomeTargetBound = "1";
  inp.addEventListener("input", () => {
    const raw = inp.value;
    const sel = inp.selectionStart ?? raw.length;
    const digitsBefore = raw.slice(0, sel).replace(/[^\d]/g, "").length;
    const formatted = formatIntegerWithCommas(raw);
    inp.value = formatted;
    let digitCount = 0;
    let newPos = formatted.length;
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) {
        digitCount += 1;
        if (digitCount >= digitsBefore) {
          newPos = i + 1;
          break;
        }
      }
    }
    inp.setSelectionRange(newPos, newPos);
  });
}

function setupNumericOnlyInput(inp) {
  inp.addEventListener("input", () => {
    const pos = inp.selectionStart;
    const sanitized = sanitizeNumericInput(inp.value);
    if (inp.value !== sanitized) {
      inp.value = sanitized;
      inp.setSelectionRange(Math.min(pos, sanitized.length), Math.min(pos, sanitized.length));
    }
  });
}

function sanitizeTimeInput(val) {
  return String(val || "").replace(/[^\d:]/g, "");
}

function setupTimeOnlyInput(inp) {
  if (!inp) return;
  inp.addEventListener("input", () => {
    const pos = inp.selectionStart;
    const sanitized = sanitizeTimeInput(inp.value);
    if (inp.value !== sanitized) {
      inp.value = sanitized;
      inp.setSelectionRange(Math.min(pos, sanitized.length), Math.min(pos, sanitized.length));
    }
  });
}

function calcDaysBetween(startYmd, endYmd) {
  if (!startYmd || !endYmd || typeof startYmd !== "string" || typeof endYmd !== "string") return 0;
  const start = new Date(startYmd + "T12:00:00");
  const end = new Date(endYmd + "T12:00:00");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(0, days);
}

function setupActionUnitTimeCalc(modal) {
  const unitInput = modal.querySelector('input[name="actionUnitMinutes"]');
  const startInput = modal.querySelector('input[name="targetStartDate"]');
  const deadlineInput = modal.querySelector('input[name="targetDeadline"]');
  const totalInput = modal.querySelector('input[name="targetTimeRequired"]');
  const updateTotal = () => {
    const unitStr = (unitInput?.value || "").trim();
    const startVal = (startInput?.value || "").trim();
    const endVal = (deadlineInput?.value || "").trim();
    const unit = parseInt(unitStr, 10);
    if (!unit || unit <= 0 || !startVal || !endVal) return;
    const days = calcDaysBetween(startVal, endVal);
    if (days <= 0) return;
    const totalMins = unit * days;
    if (totalInput) totalInput.value = minutesToHhMm(totalMins);
  };
  [unitInput, startInput, deadlineInput].forEach((inp) => {
    inp?.addEventListener("input", updateTotal);
    inp?.addEventListener("change", updateTotal);
  });
}

function bindPathTargetAmountMode(form, path = null) {
  if (!form) return;
  const trackCheck = form.querySelector('input[name="trackTargetAmount"]');
  const amountField = form.querySelector(".sideincome-target-amount-field");
  const amountInput = form.querySelector('input[name="targetAmount"]');
  const sync = () => {
    const on = !!trackCheck?.checked;
    if (amountField) amountField.hidden = !on;
    if (amountInput) {
      if (on) amountInput.setAttribute("inputmode", "numeric");
      else amountInput.removeAttribute("inputmode");
    }
  };
  trackCheck?.addEventListener("change", sync);
  sync();
  setupWonAmountInput(amountInput);
  void path;
}

function readPathTargetAmountFields(form) {
  const trackTargetAmount = !!form.querySelector('input[name="trackTargetAmount"]')?.checked;
  if (!trackTargetAmount) {
    return {
      trackTargetAmount: false,
      targetAmount: "",
      unit: "",
    };
  }
  return {
    trackTargetAmount: true,
    targetAmount: sanitizeNumericInput(form.targetAmount?.value) || "",
    unit: "원",
  };
}

function sideincomeLocalYear() {
  return new Date().getFullYear();
}

function sideincomeLocalQuarter() {
  return Math.min(4, Math.max(1, Math.ceil((new Date().getMonth() + 1) / 3)));
}

/** 분기 → 월 구간 안내 (목록 제목용) */
const SIDEINCOME_QUARTER_MONTH_LABELS = {
  1: "1–3월",
  2: "4–6월",
  3: "7–9월",
  4: "10–12월",
};

/** 목록·저장용 — 연도·분기 (없으면 시작일·오늘 기준으로 추정) */
function resolvePathTargetYear(path) {
  const y = Number(path?.targetYear);
  if (Number.isFinite(y) && y >= 2000 && y <= 2100) return Math.floor(y);
  const fromStart = String(path?.targetStartDate || "").trim().slice(0, 4);
  if (/^\d{4}$/.test(fromStart)) return Number(fromStart);
  return sideincomeLocalYear();
}

function resolvePathTargetQuarter(path) {
  const q = Number(path?.targetQuarter);
  if (Number.isFinite(q) && q >= 1 && q <= 4) return Math.floor(q);
  const d = String(path?.targetStartDate || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const m = Number(d.slice(5, 7));
    if (m >= 1 && m <= 12) return Math.min(4, Math.max(1, Math.ceil(m / 3)));
  }
  return sideincomeLocalQuarter();
}

function readPathYearQuarterFields(form) {
  const yearRaw = String(form?.querySelector?.('input[name="targetYear"]')?.value || "")
    .trim()
    .replace(/\D/g, "")
    .slice(0, 4);
  let targetYear = Number(yearRaw);
  if (!Number.isFinite(targetYear) || targetYear < 2000 || targetYear > 2100) {
    targetYear = sideincomeLocalYear();
  }
  const qBtn = form?.querySelector?.(".sideincome-quarter-chip.lp-choice-chip--on");
  let targetQuarter = Number(qBtn?.dataset?.quarter || 0);
  if (!(targetQuarter >= 1 && targetQuarter <= 4)) {
    targetQuarter = sideincomeLocalQuarter();
  }
  return { targetYear: Math.floor(targetYear), targetQuarter: Math.floor(targetQuarter) };
}

function pathYearQuarterFieldsHtml(path = null) {
  const year = resolvePathTargetYear(path);
  const quarter = resolvePathTargetQuarter(path);
  const chips = [1, 2, 3, 4]
    .map((q) => {
      const months = SIDEINCOME_QUARTER_MONTH_LABELS[q] || "";
      return `
                <button type="button" class="lp-choice-chip sideincome-quarter-chip${
                  q === quarter ? " lp-choice-chip--on" : ""
                }" data-quarter="${q}" aria-label="${q}분기 ${months}">
                  <span class="sideincome-quarter-chip-main">${q}분기</span>
                  <span class="sideincome-quarter-chip-months">${months}</span>
                </button>`;
    })
    .join("");
  return `
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>연도</label>
              <input type="text" name="targetYear" value="${year}" placeholder="${sideincomeLocalYear()}" inputmode="numeric" maxlength="4" autocomplete="off" />
            </div>
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>분기</label>
              <div class="sideincome-quarter-chip-row" role="group" aria-label="목표 분기">${chips}</div>
            </div>`;
}

function bindPathYearQuarterFields(form) {
  if (!form) return;
  const yearInput = form.querySelector('input[name="targetYear"]');
  yearInput?.addEventListener("input", () => {
    const digits = String(yearInput.value || "")
      .replace(/\D/g, "")
      .slice(0, 4);
    if (yearInput.value !== digits) yearInput.value = digits;
  });
  form.querySelectorAll(".sideincome-quarter-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      form
        .querySelectorAll(".sideincome-quarter-chip")
        .forEach((b) => b.classList.remove("lp-choice-chip--on"));
      btn.classList.add("lp-choice-chip--on");
    });
  });
}

/** 데스크탑·아이패드 가로 — 목표|KPI|상세 3분할 (세로는 스택 유지) */
const SIDEINCOME_SPLIT_MQ = "(min-width: 64rem) and (orientation: landscape)";

function isSideincomeSplitViewport() {
  try {
    return window.matchMedia(SIDEINCOME_SPLIT_MQ).matches;
  } catch (_) {
    return false;
  }
}

function sideincomeSplitPlaceholderHtml(message) {
  const safe = String(message || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<p class="sideincome-split-placeholder">${safe}</p>`;
}

export function render(opts = {}) {
  const dashboardEmbedMode = !!opts?.dashboardEmbedMode;
  const footerActionsSlot = opts?.footerActionsSlot || null;
  const dashboardHost = opts?.dashboardHost || null;
  const dashboardEmbedKey = String(opts?.dashboardEmbedKey || "").trim();
  const el = document.createElement("div");
  el.className = "app-tab-panel-content sideincome-view dream-view lp-kpi-dream-page";
  if (dashboardEmbedMode) el.classList.add("sideincome-view--dashboard-embed");

  const header = document.createElement("header");
  header.className = "dream-view-header";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "TIME PRICE";
  const titleRow = document.createElement("div");
  titleRow.className = "dream-view-header-title-row";
  const title = document.createElement("h1");
  title.className = "dream-view-title";
  title.textContent = "시급 상승";
  titleRow.appendChild(title);
  setupKpiCategoryHeaderIcon(titleRow, "sideincome");
  header.appendChild(label);
  header.appendChild(titleRow);
  el.appendChild(header);

  const contentWrap = document.createElement("div");
  contentWrap.className = "dream-content-wrap";
  el.appendChild(contentWrap);

  const historyWrap = document.createElement("div");
  historyWrap.className = "dream-kpi-history-wrap";
  historyWrap.hidden = true;
  el.appendChild(historyWrap);

  let layoutIsSplit = false;
  let paneGoals = null;
  let paneKpis = null;
  let paneDetail = null;

  let activePathId = null;
  let selectedKpiId = null;
  let kpiFilter = "active";
  let sideincomeViewScreen = "goals"; // "goals" | "kpis" | "kpiDetail"
  let kpiGridScrollPrevFilter = null;
  let kpiGridScrollPrevScopeId = null;
  let pathAddModalJustClosed = false;

  function wantsSplitLayout() {
    return !dashboardEmbedMode && isSideincomeSplitViewport();
  }

  function ensureSplitDom() {
    if (layoutIsSplit && paneGoals && paneKpis && paneDetail && paneGoals.isConnected) {
      return;
    }
    historyWrap.hidden = true;
    historyWrap.innerHTML = "";
    if (historyWrap.parentNode !== el) el.appendChild(historyWrap);
    contentWrap.hidden = false;
    contentWrap.className = "dream-content-wrap sideincome-split-shell";
    contentWrap.innerHTML = "";
    paneGoals = document.createElement("div");
    paneGoals.className =
      "sideincome-split-pane sideincome-split-pane--goals dream-content-wrap";
    paneKpis = document.createElement("div");
    paneKpis.className =
      "sideincome-split-pane sideincome-split-pane--kpis dream-content-wrap";
    paneDetail = document.createElement("div");
    paneDetail.className =
      "sideincome-split-pane sideincome-split-pane--detail dream-content-wrap";
    contentWrap.appendChild(paneGoals);
    contentWrap.appendChild(paneKpis);
    contentWrap.appendChild(paneDetail);
    layoutIsSplit = true;
    el.classList.add("sideincome-view--split");
  }

  function ensureStackDom() {
    if (!layoutIsSplit && !contentWrap.classList.contains("sideincome-split-shell")) {
      layoutIsSplit = false;
      el.classList.remove("sideincome-view--split");
      return;
    }
    contentWrap.hidden = false;
    contentWrap.className = "dream-content-wrap";
    contentWrap.innerHTML = "";
    paneGoals = null;
    paneKpis = null;
    paneDetail = null;
    layoutIsSplit = false;
    el.classList.remove("sideincome-view--split");
    if (historyWrap.parentNode !== el) el.appendChild(historyWrap);
  }

  function syncLayoutModeFromViewport() {
    const want = wantsSplitLayout();
    if (want === layoutIsSplit && (!want || (paneGoals && paneGoals.isConnected))) {
      return want;
    }
    if (want) {
      if (selectedKpiId) sideincomeViewScreen = "kpiDetail";
      else if (activePathId) sideincomeViewScreen = "kpis";
      else sideincomeViewScreen = "goals";
      ensureSplitDom();
    } else {
      if (selectedKpiId && activePathId) sideincomeViewScreen = "kpiDetail";
      else if (activePathId) sideincomeViewScreen = "kpis";
      else sideincomeViewScreen = "goals";
      ensureStackDom();
    }
    return want;
  }

  function goalsHost() {
    return layoutIsSplit && paneGoals ? paneGoals : contentWrap;
  }

  function kpisHost() {
    return layoutIsSplit && paneKpis ? paneKpis : contentWrap;
  }

  function detailHost() {
    return layoutIsSplit && paneDetail ? paneDetail : contentWrap;
  }

  function paintSplitPlaceholder(container, message) {
    if (!container) return;
    container.innerHTML = sideincomeSplitPlaceholderHtml(message);
  }

  const _sideincomeUiSession = readKpiUiSession(KPI_UI_SESSION_KEYS.sideincome);
  const _sideincomeInitData = loadSideincomeMap();
  const _sideincomeRestored = restoreKpiTabFromSession(_sideincomeUiSession, {
    categoryIds: _sideincomeInitData.paths || [],
    kpis: _sideincomeInitData.kpis || [],
    foreignKey: "pathId",
  });
  /* 목록 필터는 항상 진행중부터 (세션 복원하지 않음) */
  kpiFilter = "active";
  /* 시급 상승 메뉴 진입은 항상 목표 목록 — KPI 화면은 목표 클릭 후에만 */
  sideincomeViewScreen = "goals";
  activePathId = null;
  selectedKpiId = null;

  function persistKpiUiState() {
    try {
      sessionStorage.setItem(
        KPI_UI_SESSION_KEYS.sideincome,
        JSON.stringify({
          tabId: activePathId,
          selectedKpiId,
          kpiFilter,
          sideincomeViewScreen,
        }),
      );
    } catch (_) {}
  }

  function setSideincomeFooterBackVisible(visible) {
    const footerBack = document.querySelector("[data-lp-app-footer-back]");
    if (!footerBack) return;
    if (visible) {
      footerBack.hidden = false;
      footerBack.removeAttribute("aria-hidden");
      footerBack.style.removeProperty("display");
    } else {
      footerBack.hidden = true;
      footerBack.setAttribute("aria-hidden", "true");
      footerBack.style.setProperty("display", "none", "important");
    }
  }

  function syncSideincomeFooterBackLabel() {
    if (!el.isConnected || dashboardEmbedMode) return;
    const footerBack = document.querySelector("[data-lp-app-footer-back]");
    if (!footerBack) return;
    /* 3분할: 홈만 — 뒤로가기는 CSS/style로 강제 숨김 */
    if (wantsSplitLayout() || layoutIsSplit) {
      setSideincomeFooterBackVisible(false);
      return;
    }
    setSideincomeFooterBackVisible(true);
    if (sideincomeViewScreen === "kpiDetail") {
      footerBack.title = "행동 목록으로";
      footerBack.setAttribute("aria-label", "행동 목록으로");
    } else if (sideincomeViewScreen === "kpis") {
      footerBack.title = "시급 상승 목표 목록으로";
      footerBack.setAttribute("aria-label", "시급 상승 목표 목록으로");
    } else {
      footerBack.title = "오늘(메인)으로";
      footerBack.setAttribute("aria-label", "오늘(메인)으로");
    }
  }

  function syncSideincomeHeader() {
    if (wantsSplitLayout() || layoutIsSplit) {
      title.textContent = "시급 상승";
      setKpiCategoryHeaderIconVisible(titleRow, true);
      syncSideincomeFooterBackLabel();
      return;
    }
    const data = loadSideincomeMap();
    const path = data.paths.find((p) => p.id === activePathId);
    if (sideincomeViewScreen === "kpiDetail" && selectedKpiId) {
      const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
      title.textContent = kpi?.name || "행동";
    } else if (sideincomeViewScreen === "kpis" && path) {
      title.textContent = path.name || "시급 상승";
    } else {
      title.textContent = "시급 상승";
    }
    setKpiCategoryHeaderIconVisible(titleRow, sideincomeViewScreen === "goals");
    syncSideincomeFooterBackLabel();
  }

  function enterKpiView(pathId) {
    if (!pathId) return;
    activePathId = pathId;
    selectedKpiId = null;
    sideincomeViewScreen = "kpis";
    syncSideincomeHeader();
    updateSideincomeView();
  }

  function enterKpiDetailView(kpiId) {
    if (!kpiId || !activePathId) return;
    selectedKpiId = kpiId;
    sideincomeViewScreen = "kpiDetail";
    syncSideincomeHeader();
    updateSideincomeView();
  }

  function exitToKpiList() {
    selectedKpiId = null;
    sideincomeViewScreen = "kpis";
    syncSideincomeHeader();
    updateSideincomeView();
    persistKpiUiState();
  }

  function refreshSideincomeAfterKpiDataChange(opts = {}) {
    if (layoutIsSplit || wantsSplitLayout()) {
      syncLayoutModeFromViewport();
      syncSideincomeHeader();
      renderSideincomeGoalsList(paneGoals);
      if (activePathId) renderKpiList(paneKpis);
      else paintSplitPlaceholder(paneKpis, "목표를 선택해 주세요");
      if (selectedKpiId) renderKpiDetailView({ ...opts, target: paneDetail });
      else paintSplitPlaceholder(paneDetail, "행동을 선택해 주세요");
      syncAppFooterSideincomeKpiActions();
      persistKpiUiState();
      return;
    }
    if (sideincomeViewScreen === "kpiDetail") {
      syncSideincomeHeader();
      renderKpiDetailView(opts);
    } else if (sideincomeViewScreen === "kpis") {
      renderKpiList();
    } else {
      updateSideincomeView();
    }
    persistKpiUiState();
  }

  function exitToSideincomeGoalsList() {
    sideincomeViewScreen = "goals";
    activePathId = null;
    selectedKpiId = null;
    syncSideincomeHeader();
    updateSideincomeView();
    persistKpiUiState();
  }

  const kpiTimeFormOpts = {
    unitPlaceholder: "예) 게시물",
    higherPlaceholder: "예) 100",
    lowerPlaceholder: "예) 5",
    timePlaceholder: "1시간 : 01:00 20분 : 00:20",
  };

  function showKpiModal() {
    if (!activePathId) return;
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">새 행동 추가</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>행동 이름</label>
              <input type="text" name="name" placeholder="예) 인스타 게시물 포스팅하기" />
            </div>
            ${kpiFormGoalAndTargetSectionHtml(null, escapeHtml, kpiTimeFormOpts)}
          </div>
          <div data-legacy="time-task-log-footer">
            <button type="submit" data-legacy="time-task-log-submit">저장</button>
          </div>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);
    modal.querySelector(".dream-kpi-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      if (!validateKpiActionForm(form, { sanitizeNumericInput })) return;
      const fields = readKpiGoalModeFormFields(form, sanitizeNumericInput, {
        isNewKpi: true,
      });
      const kpi = {
        id: nextId(),
        pathId: activePathId,
        name: (form.name.value || "").trim(),
        direction: "higher",
        ...fields,
        progressStatus: progressStatusForKpiStartDate(
          fields.targetStartDate,
          KPI_PROGRESS_STATUS_DEFAULT,
        ),
      };
      const data = loadSideincomeMap();
      data.kpis = data.kpis || [];
      const existingOrder = (data.kpiOrder || {})[activePathId] || data.kpis.filter((k) => k.pathId === activePathId).map((k) => k.id);
      data.kpis.push(kpi);
      data.kpiOrder = data.kpiOrder || {};
      data.kpiOrder[activePathId] = [...existingOrder, kpi.id];
      saveSideincomeMap(data, { pushServer: true });
      syncKpiToTimeTask(kpi, "add");
      close();
      refreshSideincomeAfterKpiDataChange();
    });
    document.body.appendChild(modal);
    bindKpiGoalModeForm(modal.querySelector(".dream-kpi-form"), null, kpiTimeFormOpts);
  }

  function showKpiEditModal(kpi) {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">행동 수정</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>행동 이름</label>
              <input type="text" name="name" value="${escapeHtml(kpi.name || "")}" placeholder="예) 인스타 게시물 포스팅하기" />
            </div>
            ${kpiFormGoalAndTargetSectionHtml(kpi, escapeHtml, kpiTimeFormOpts)}
            ${kpiProgressStatusFieldHtml(kpi, getKpiProgress(kpi))}
            <div class="dream-kpi-delete-wrap">
              <button type="button" class="dream-kpi-delete-btn">이 행동 삭제하기</button>
              <p class="dream-kpi-delete-note">삭제 시 복구 불가</p>
            </div>
          </div>
          <div data-legacy="time-task-log-footer">
            <button type="submit" data-legacy="time-task-log-submit">수정</button>
          </div>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);
    modal.querySelector(".dream-kpi-delete-btn").addEventListener("click", () => {
      void confirmKpiActionDelete(kpi.name).then((ok) => {
        if (!ok) return;
        const data = loadSideincomeMap();
        const syncName = String(
          data.kpiTaskSync?.[kpi.id] || kpi.name || "",
        ).trim();
        appendDeletedRef(data, "kpis", kpi.id);
        data.kpis = (data.kpis || []).filter((k) => k.id !== kpi.id);
        data.kpiLogs = (data.kpiLogs || []).filter((l) => l.kpiId !== kpi.id);
        data.kpiTodos = (data.kpiTodos || []).filter((t) => t.kpiId !== kpi.id);
        data.kpiDailyRepeatTodos = (data.kpiDailyRepeatTodos || []).filter(
          (t) => t.kpiId !== kpi.id,
        );
        data.kpiTaskSync = data.kpiTaskSync || {};
        delete data.kpiTaskSync[kpi.id];
        const order = (data.kpiOrder || {})[kpi.pathId] || [];
        data.kpiOrder = {
          ...data.kpiOrder,
          [kpi.pathId]: order.filter((id) => id !== kpi.id),
        };
        saveSideincomeMap(data, { pushServer: true });
        try {
          kpiTimeTaskRemove(kpi, syncName || kpi.name);
        } catch (_) {}
        close();
        exitToKpiList();
      });
    });
    modal.querySelector(".dream-kpi-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      if (!validateKpiActionForm(form, { sanitizeNumericInput })) return;
      const data = loadSideincomeMap();
      const target = data.kpis.find((k) => k.id === kpi.id);
      if (target) {
        const oldName = target.name;
        applyKpiFormGoalFieldsToKpi(target, form, {
          sanitizeNumericInput,
        });
        target.name = (form.name.value || "").trim();
        target.direction = kpi.direction === "lower" ? "lower" : "higher";
        target.progressStatus = progressStatusForKpiStartDate(
          target.targetStartDate,
          readKpiProgressStatusFromForm(form),
        );
        saveSideincomeMap(data, { pushServer: true });
        if (oldName !== target.name) syncKpiToTimeTask(target, "update", oldName);
      }
      close();
      refreshSideincomeAfterKpiDataChange();
    });
    document.body.appendChild(modal);
    bindKpiProgressStatusField(modal);
    bindKpiGoalModeForm(modal.querySelector(".dream-kpi-form"), kpi, kpiTimeFormOpts);
  }

  function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}. ${m}. ${day}.`;
  }

  function toDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }


  function mountPathLogListItems(container, path, onMutate) {
    if (!container) return;
    const data = loadSideincomeMap();
    const pathUnitTrim = (path.unit || "원").trim();
    const pathUnit = pathUnitTrim ? ` ${pathUnitTrim}` : "";
    const pathLogs = (data.pathLogs || []).filter((l) => l.pathId === path.id);
    pathLogs.sort((a, b) =>
      (b.dateRaw || b.date || "").localeCompare(a.dateRaw || a.date || ""),
    );
    container.replaceChildren();
    if (!pathLogs.length) {
      const empty = document.createElement("p");
      empty.className = "dream-kpi-path-logs-modal-empty";
      empty.textContent = "등록된 수입 로그가 없습니다.";
      container.appendChild(empty);
      return;
    }
    pathLogs.forEach((log) => {
      const item = document.createElement("div");
      item.className = "dream-kpi-path-log-item";
      item.innerHTML = `
          <div class="dream-kpi-path-log-body">
            <span class="dream-kpi-path-log-date">${escapeHtml(log.date)}</span>
            <span class="dream-kpi-path-log-value">${escapeHtml(log.value || "—")}${pathUnit}</span>
            ${log.memo ? `<div class="dream-kpi-path-log-memo">${escapeHtml(log.memo)}</div>` : ""}
          </div>
        `;
      item.addEventListener("click", () => {
        showPathLogModal(path, log, {
          onSaved: () => {
            renderKpiList();
            onMutate?.();
          },
        });
      });
      container.appendChild(item);
    });
  }

  function showPathIncomeLogsModal(path) {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal dream-kpi-path-logs-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel time-task-log-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">수입 로그</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <div data-legacy="time-task-setup-body" class="dream-kpi-path-logs-modal-body">
          <div class="dream-kpi-path-logs-modal-list dream-kpi-history-list"></div>
        </div>
      </div>
    `;
    const listEl = modal.querySelector(".dream-kpi-path-logs-modal-list");
    const refresh = () => mountPathLogListItems(listEl, path, refresh);
    const close = () => modal.remove();
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);
    refresh();
    document.body.appendChild(modal);
  }

  function showPathLogModal(path, editLog, opts = {}) {
    const isEdit = !!editLog;
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal time-task-log-modal";
    const today = new Date();
    let dateVal = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    let valueVal = "";
    let memoVal = "";
    if (editLog) {
      if (editLog.dateRaw) {
        dateVal = editLog.dateRaw;
      } else if (editLog.date) {
        const m = editLog.date.match(/(\d{4})\.?\s*(\d{1,2})\.?\s*(\d{1,2})/);
        if (m) dateVal = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      }
      valueVal = sanitizeNumericInput(editLog.value) || "";
      memoVal = editLog.memo || "";
    }
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel time-task-log-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">${isEdit ? "수입 로그 수정" : "수입 로그 추가"}</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-log-form">
          <div data-legacy="time-task-setup-body">
          <div class="dream-kpi-log-section">
            <div class="dream-kpi-log-row">
              <div class="dream-kpi-log-field">
                <label>날짜</label>
                ${buildModalNativeDateFieldMarkup({
                  name: "date",
                  ariaLabel: "날짜",
                  value: dateVal,
                })}
              </div>
              <div class="dream-kpi-log-field">
                <label>경로</label>
                <input type="text" value="${escapeHtml(path.name || "")}${path.trackTargetAmount ? " (원)" : ""}" readonly class="dream-kpi-log-readonly" />
              </div>
            </div>
            <div class="dream-kpi-log-row">
              <div class="dream-kpi-log-field">
                <label>금액</label>
                <input type="text" name="value" placeholder="숫자 입력" value="${escapeHtml(valueVal)}" inputmode="numeric" />
              </div>
            </div>
            <div class="dream-kpi-log-field">
              <label>메모 (선택)</label>
              <textarea name="memo" placeholder="메모 등..." rows="3">${escapeHtml(memoVal)}</textarea>
            </div>
          </div>
          </div>
          <div data-legacy="time-task-log-footer" class="dream-kpi-log-modal-footer">
            ${isEdit ? '<button type="button" class="dream-kpi-log-modal-delete-btn" data-legacy="time-task-log-delete-btn">삭제</button>' : ""}
            <button type="submit" data-legacy="time-task-log-submit">${isEdit ? "수정 저장" : "로그 저장"}</button>
          </div>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);
    modal.querySelector(".dream-kpi-log-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const dateVal = form.date.value;
      const dateStr = dateVal ? `${dateVal.split("-")[0]}. ${dateVal.split("-")[1]}. ${dateVal.split("-")[2]}.` : toDateStr(new Date());
      const data = loadSideincomeMap();
      if (isEdit) {
        const idx = (data.pathLogs || []).findIndex((l) => l.id === editLog.id);
        if (idx >= 0) {
          data.pathLogs = data.pathLogs || [];
          const row = {
            ...data.pathLogs[idx],
            date: dateStr,
            dateRaw: dateVal,
            value: sanitizeNumericInput(form.value.value) || "",
            memo: (form.memo.value || "").trim(),
          };
          delete row.status;
          data.pathLogs[idx] = row;
        }
      } else {
        const log = {
          id: nextId(),
          pathId: path.id,
          date: dateStr,
          dateRaw: dateVal,
          value: sanitizeNumericInput(form.value.value) || "",
          memo: (form.memo.value || "").trim(),
        };
        data.pathLogs = data.pathLogs || [];
        data.pathLogs.push(log);
      }
      saveSideincomeMap(data, { pushServer: true });
      close();
      renderKpiList();
      opts.onSaved?.();
    });
    const pathDelBtn = modal.querySelector(".dream-kpi-log-modal-delete-btn");
    if (pathDelBtn && isEdit) {
      pathDelBtn.addEventListener("click", () => {
        const d = loadSideincomeMap();
        appendDeletedRef(d, "pathLogs", editLog.id);
        d.pathLogs = (d.pathLogs || []).filter((l) => l.id !== editLog.id);
        saveSideincomeMap(d, { pushServer: true });
        close();
        renderKpiList();
        opts.onSaved?.();
      });
    }
    document.body.appendChild(modal);
    setupNumericOnlyInput(modal.querySelector('input[name="value"]'));
    initModalNativeDateFieldsIn(modal);
  }

  function clearSideincomeKpiFooterActions() {
    const slot = footerActionsSlot || getAppFooterActionsSlot();
    if (!slot) return;
    slot.querySelectorAll("[data-lp-dream-kpi-footer-action]").forEach((btn) => {
      const wrap = btn.closest(`[${APP_FOOTER_ADD_SLOT_ATTR}]`);
      if (wrap) wrap.remove();
      else btn.remove();
    });
    slot.querySelectorAll("[data-lp-kpi-footer-home]").forEach((n) => n.remove());
  }

  function sideincomeKpiFooterAddLabel(tab, kpi) {
    const t = effectiveKpiHistoryBottomTab(tab, kpi);
    if (t === KPI_BOTTOM_TAB_NOTES) return "기록 추가";
    if (t === KPI_BOTTOM_TAB_TODO) return "할 일 추가";
    return "매일 할 일 추가";
  }

  async function runSideincomeKpiFooterAddAction() {
    const d = loadSideincomeMap();
    const k = (d.kpis || []).find((x) => x.id === selectedKpiId);
    if (!k) return;
    const tab = effectiveKpiHistoryBottomTab(
      getKpiHistoryBottomTab("sideincome", selectedKpiId),
      k,
    );
    if (tab === KPI_BOTTOM_TAB_TODO) {
      const text = await showKpiTodoAddModal({
        kpiName: k.name,
        linkedLabel: "연결된 행동",
        placeholder: "할 일 입력",
      });
      if (!text) return;
      const d2 = loadSideincomeMap();
      d2.kpiTodos = d2.kpiTodos || [];
      d2.kpiTodos.push({
        id: nextId(),
        kpiId: String(selectedKpiId),
        text,
        completed: false,
      });
      saveSideincomeMap(d2, { pushServer: true });
      renderKpiDetailView({ scrollTodoAfterMutation: true });
      return;
    }
    if (tab === KPI_BOTTOM_TAB_DAILY) {
      const text = await showKpiTodoAddModal({
        kpiName: k.name,
        linkedLabel: "연결된 행동",
        title: "매일 할 일 추가",
        placeholder: "할 일 입력 (매일 반복)",
      });
      if (!text) return;
      const d2 = loadSideincomeMap();
      d2.kpiDailyRepeatTodos = d2.kpiDailyRepeatTodos || [];
      appendKpiDailyRepeatTodoAtEnd(d2.kpiDailyRepeatTodos, {
        id: nextId(),
        kpiId: String(selectedKpiId),
        text,
        completed: false,
      });
      saveSideincomeMap(d2, { pushServer: true });
      renderKpiDetailView({ scrollTodoAfterMutation: true });
      return;
    }
    if (tab === KPI_BOTTOM_TAB_NOTES) {
      const kpiId = String(selectedKpiId);
      const result = await showSideincomeKpiNoteModal({
        mode: "add",
        kpiId,
        kpiName: k.name,
        existingTags: getLocalSideincomeKpiNoteTags(kpiId),
      });
      if (!result || result.action !== "save") return;
      const saved = await saveSideincomeKpiNoteFromModal({
        kpiId,
        tagLabels: result.tagLabels,
        memo: result.memo,
        nextId,
      });
      if (!saved.ok) return;
      renderKpiDetailView();
      return;
    }
  }

  function appendSideincomeFooterHomeOrGoals(slot) {
    if (layoutIsSplit || wantsSplitLayout()) {
      appendKpiFooterHomeButton(slot);
      return;
    }
    if (dashboardEmbedMode) {
      if (sideincomeViewScreen === "goals") return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = APP_FOOTER_ICON_BTN_CLASS;
      btn.setAttribute("data-lp-kpi-footer-home", "");
      btn.title = "목표 목록";
      btn.setAttribute("aria-label", "목표 목록");
      btn.innerHTML = APP_FOOTER_HOME_ICON;
      btn.addEventListener("click", () => exitToSideincomeGoalsList());
      slot.appendChild(btn);
      return;
    }
    appendKpiFooterHomeButton(slot);
  }

  function syncAppFooterSideincomeKpiActions() {
    clearSideincomeKpiFooterActions();
    const slot = footerActionsSlot || getAppFooterActionsSlot();
    if (!slot) return;

    /* 3분할: 하단은 홈만 (뒤로가기 숨김) */
    if (layoutIsSplit || wantsSplitLayout()) {
      setSideincomeFooterBackVisible(false);
      appendKpiFooterHomeButton(slot);
      return;
    }
    setSideincomeFooterBackVisible(true);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = APP_FOOTER_ICON_BTN_CLASS;
    addBtn.setAttribute("data-lp-dream-kpi-footer-action", "");
    addBtn.innerHTML = KPI_FOOTER_ADD_ICON;

    const footerScreen = sideincomeViewScreen;

    if (footerScreen === "goals") {
      const data = loadSideincomeMap();
      if (shouldShowKpiMapSyncLoading("sideincome", !data.paths?.length)) return;
      addBtn.title = "시급 상승 목표 추가";
      addBtn.setAttribute("aria-label", "시급 상승 목표 추가");
      addBtn.addEventListener("click", () => {
        if (pathAddModalJustClosed) return;
        showPathAddModal();
      });
      slot.appendChild(mountAppFooterAddButton(addBtn));
      return;
    }

    if (!activePathId) return;

    if (footerScreen === "kpis") {
      addBtn.title = "행동 추가";
      addBtn.setAttribute("aria-label", "행동 추가");
      addBtn.addEventListener("click", () => {
        if (!activePathId) return;
        showKpiModal();
      });
      appendSideincomeFooterHomeOrGoals(slot);
      slot.appendChild(mountAppFooterAddButton(addBtn));
      return;
    }

    if (footerScreen !== "kpiDetail" || !selectedKpiId) return;

    const data = loadSideincomeMap();
    const kpiNow = (data.kpis || []).find((k) => k.id === selectedKpiId);
    if (!kpiNow || kpiNow.pathId !== activePathId) return;

    const tab = getKpiHistoryBottomTab("sideincome", selectedKpiId);
    if (!kpiHistoryFooterShowsAddButton(tab, kpiNow)) {
      appendSideincomeFooterHomeOrGoals(slot);
      return;
    }
    const addLabel = sideincomeKpiFooterAddLabel(tab, kpiNow);
    addBtn.title = addLabel;
    addBtn.setAttribute("aria-label", addLabel);
    addBtn.addEventListener("click", () => {
      void runSideincomeKpiFooterAddAction();
    });
    appendSideincomeFooterHomeOrGoals(slot);
    slot.appendChild(mountAppFooterAddButton(addBtn));
  }

  function getKpiLogs(kpiId) {
    const data = loadSideincomeMap();
    const kid = String(kpiId || "").trim();
    const logs = (data.kpiLogs || []).filter(
      (l) => String(l.kpiId || "").trim() === kid,
    );
    return sortKpiLogsNewestFirst(logs, data.kpiLogs);
  }

  function parseNum(str) {
    const n = parseFloat(String(str || "").replace(/[^0-9.-]/g, ""));
    return Number.isNaN(n) ? 0 : n;
  }

  function reorderKpis(pathId, orderedKpiIds) {
    const data = loadSideincomeMap();
    data.kpiOrder = data.kpiOrder || {};
    data.kpiOrder[pathId] = orderedKpiIds;
    saveSideincomeMap(data);
  }

  function getAccumulatedKpiValue(kpiId) {
    const logs = getKpiLogs(kpiId);
    return logs.reduce((sum, log) => sum + parseNum(log.value), 0);
  }

  function getKpiProgress(kpi) {
    const result = computeKpiProgress(kpi, {
      toDateKey,
      getAllKpiLogs: () => loadSideincomeMap().kpiLogs || [],
      getAccumulatedKpiValue,
      getKpiTodos: (kpiId) =>
        (loadSideincomeMap().kpiTodos || []).filter((t) => t.kpiId === kpiId),
      parseNum,
    });
    if (!kpi?.needHabitTracker) return result;
    return enrichKpiProgressWithHabitStreak(
      kpi,
      result,
      getKpiLogs(kpi.id),
      toDateKey(new Date()),
    );
  }

  function renderKpiList(host) {
    const container = host || kpisHost();
    if (!container) return;
    const inSplitPane = layoutIsSplit && container !== contentWrap;

    syncHabitTrackerLogs();
    const scopeId = activePathId;
    const savedGridScroll = readKpiGridScrollToRestore(
      container,
      kpiFilter,
      scopeId,
      kpiGridScrollPrevFilter,
      kpiGridScrollPrevScopeId,
    );
    if (!inSplitPane) {
      historyWrap.remove();
      container.innerHTML = "";
      container.className = "dream-content-wrap";
    } else {
      container.innerHTML = "";
      container.className =
        "sideincome-split-pane sideincome-split-pane--kpis dream-content-wrap";
    }
    if (!activePathId) {
      kpiGridScrollPrevFilter = null;
      kpiGridScrollPrevScopeId = null;
      if (inSplitPane) {
        paintSplitPlaceholder(container, "목표를 선택해 주세요");
      } else {
        historyWrap.hidden = true;
        el.appendChild(historyWrap);
      }
      persistKpiUiState();
      syncAppFooterSideincomeKpiActions();
      return;
    }
    const data = loadSideincomeMap();
    let pathKpis = (data.kpis || []).filter((k) => k.pathId === activePathId);
    const order = (data.kpiOrder || {})[activePathId];
    if (order && order.length > 0) {
      const orderMap = new Map(order.map((id, i) => [id, i]));
      pathKpis = [...pathKpis].sort((a, b) => {
        const ia = orderMap.has(a.id) ? orderMap.get(a.id) : 999;
        const ib = orderMap.has(b.id) ? orderMap.get(b.id) : 999;
        return ia - ib;
      });
    }

    if (
      renderKpiMapSyncLoadingIfNeeded({
        tabId: "sideincome",
        container,
        isEmpty: pathKpis.length === 0,
        onLoading: () => {
          if (!inSplitPane) {
            historyWrap.hidden = true;
            el.appendChild(historyWrap);
          }
          syncAppFooterSideincomeKpiActions();
        },
      })
    ) {
      return;
    }

    const path = data.paths.find((p) => p.id === activePathId);
    const pathLogs = (data.pathLogs || []).filter((l) => l.pathId === activePathId);
    const pathCurrentVal = pathLogs.reduce((sum, l) => sum + parseNum(l.value), 0);
    const pathTargetVal = parseNum(path?.targetAmount);
    const pathProgress = pathTargetVal > 0 ? Math.min(100, (pathCurrentVal / pathTargetVal) * 100) : 0;
    const formatNum = (n) => (n == null || Number.isNaN(n) ? "—" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
    if (path && path.trackTargetAmount) {
      const pathUnitTrim = (path.unit || "원").trim();
      const pathUnit = pathUnitTrim ? ` ${pathUnitTrim}` : "";
      const targetDisp = path.targetAmount
        ? escapeHtml(String(path.targetAmount).replace(/\B(?=(\d{3})+(?!\d))/g, ","))
        : "—";
      const pathSummary = document.createElement("div");
      pathSummary.className = "dream-kpi-path-summary";
      pathSummary.innerHTML = `
        <div class="dream-kpi-path-summary-inner">
          <div class="dream-kpi-path-summary-top">
            <h2 class="dream-kpi-path-summary-name">${escapeHtml(path.name || "시급 상승 경로")}</h2>
            <button type="button" class="dream-kpi-path-summary-log-btn dream-kpi-todo-header-add-btn">+ 금액</button>
          </div>
          <div class="dream-kpi-path-summary-hero">
            <span class="dream-kpi-path-summary-hero-current">${formatNum(pathCurrentVal)}</span><span class="dream-kpi-path-summary-hero-slash">/</span><span class="dream-kpi-path-summary-hero-denom">${targetDisp}</span>${pathUnitTrim ? `<span class="dream-kpi-path-summary-hero-unit">${escapeHtml(pathUnitTrim)}</span>` : ""}
          </div>
          <div class="dream-kpi-card-progress">
            <div class="dream-kpi-card-progress-bar"><div class="dream-kpi-card-progress-fill" style="width:${pathProgress}%"></div></div>
            <div class="dream-kpi-card-progress-text">누적 ${formatNum(pathCurrentVal)} / 목표 ${targetDisp}${pathUnit}</div>
          </div>
          <div class="dream-kpi-path-summary-footer">
            <button type="button" class="dream-kpi-path-summary-logs-open">수입 로그${pathLogs.length ? ` (${pathLogs.length})` : ""}</button>
            <button type="button" class="dream-kpi-path-summary-edit-link">수정하기</button>
          </div>
        </div>
      `;
      pathSummary.querySelector(".dream-kpi-path-summary-log-btn").addEventListener("click", () => showPathLogModal(path));
      pathSummary.querySelector(".dream-kpi-path-summary-logs-open").addEventListener("click", () => showPathIncomeLogsModal(path));
      pathSummary.querySelector(".dream-kpi-path-summary-edit-link").addEventListener("click", (e) => {
        e.stopPropagation();
        showPathTargetAmountModal(path);
      });
      container.appendChild(pathSummary);
    }

    const filterBar = document.createElement("div");
    filterBar.className = "dream-kpi-filter-bar";
    filterBar.innerHTML = kpiProgressStatusFilterBarHtml(kpiFilter);
    filterBar.querySelectorAll(".dream-kpi-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        kpiFilter = normalizeKpiListFilter(btn.dataset.filter);
        renderKpiList(container);
      });
    });
    container.appendChild(filterBar);

    const progressByKpiId = new Map();
    const progressFor = (kpi) => {
      const id = String(kpi?.id ?? "");
      if (!progressByKpiId.has(id)) {
        progressByKpiId.set(id, getKpiProgress(kpi));
      }
      return progressByKpiId.get(id);
    };
    let autoCompleted = false;
    for (const k of pathKpis) {
      if (applyAutoCompleteManualKpiIfNeeded(k, progressFor(k))) {
        autoCompleted = true;
      }
    }
    if (autoCompleted) {
      queueMicrotask(() => saveSideincomeMap(data, { pushServer: true }));
    }

    const grid = document.createElement("div");
    grid.className = "dream-kpi-grid";
    const listToShow = filterKpisByProgressStatus(
      pathKpis,
      kpiFilter,
      progressFor,
    );
    if (!listToShow.length) {
      const empty = document.createElement("p");
      empty.className = "dream-goals-empty";
      empty.textContent = kpiFilterEmptyListMessage(kpiFilter, { noun: "행동" });
      grid.appendChild(empty);
    }
    listToShow.forEach((kpi) => {
      const progressResult = progressFor(kpi);
      const { lowerBetter } = progressResult;
      const formatNum = (n) => (n == null || Number.isNaN(n) ? "—" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
      const {
        displayProgress,
        progressText,
        heroStr,
        heroUnit,
        cardExtraClass,
        hideProgressFill,
        hideProgressBar,
        heroPrefix,
        heroStreakAsideHtml,
        habitWeekStripHtml,
        hideHabitHero,
      } = buildKpiCardTimePresentation(kpi, progressResult, formatNum);
      const card = document.createElement("div");
      card.className =
        "dream-kpi-card" +
        (lowerBetter ? " dream-kpi-card--lower-better" : "") +
        cardExtraClass +
        (selectedKpiId === kpi.id ? " is-selected" : "");
      card.dataset.kpiId = kpi.id;
      card.draggable = true;
      const nameHtml = `${escapeHtml(kpi.name)}${lowerBetter ? '<span class="dream-kpi-card-direction-badge" title="낮을수록 좋음 행동">↓낮음</span>' : ""}`;
      const progressHtml = formatKpiCardProgressSectionHtml({
        habitWeekStripHtml,
        hideProgressBar,
        hideProgressFill,
        displayProgress,
        progressText,
        escapeHtml,
      });
      const heroHtml = hideHabitHero
        ? ""
        : `<div class="dream-kpi-card-target-num${heroStreakAsideHtml ? " dream-kpi-card-target-num--habit-unit" : ""}">${formatKpiCardHeroHtml(lowerBetter, heroStr, heroUnit, heroPrefix)}${heroStreakAsideHtml || ""}</div>`;
      card.innerHTML = `
        <div class="dream-kpi-card-inner">
          ${KPI_CARD_EDIT_PENCIL_HTML}
          ${kpiCardHeadHtml(kpi, "sideincome", nameHtml)}
          ${heroHtml}
          ${progressHtml}
        </div>
      `;
      bindKpiCardEditButton(card.querySelector(".dream-kpi-card-edit"), () =>
        showKpiEditModal(kpi),
      );
      card.addEventListener("click", (e) => {
        if (e.target.closest(".dream-kpi-card-edit")) return;
        enterKpiDetailView(kpi.id);
      });
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", kpi.id);
        card.classList.add("dream-kpi-card-dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dream-kpi-card-dragging");
      });
      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (card.dataset.kpiId !== e.dataTransfer.getData("text/plain")) {
          card.classList.add("dream-kpi-card-drag-over");
        }
      });
      card.addEventListener("dragleave", (e) => {
        e.currentTarget.classList.remove("dream-kpi-card-drag-over");
      });
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("dream-kpi-card-drag-over");
        const draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId === kpi.id) return;
        const newOrder = pathKpis.map((k) => k.id);
        const fromIdx = newOrder.indexOf(draggedId);
        const toIdx = newOrder.indexOf(kpi.id);
        if (fromIdx >= 0 && toIdx >= 0) {
          newOrder.splice(fromIdx, 1);
          newOrder.splice(toIdx, 0, draggedId);
          reorderKpis(activePathId, newOrder);
          renderKpiList(container);
        }
      });
      appendKpiCardToGrid(grid, card, kpi, escapeHtml);
    });
    /* 3분할만: 목록 끝 점선 「행동 추가하기」 — 모바일은 푸터 + 유지 */
    if (layoutIsSplit) {
      const addCard = document.createElement("button");
      addCard.type = "button";
      addCard.className = "dream-kpi-add-card";
      addCard.innerHTML =
        '<span class="dream-kpi-add-card-text">+ 행동 추가하기</span>';
      addCard.addEventListener("click", () => {
        if (!activePathId) return;
        showKpiModal();
      });
      grid.appendChild(addCard);
    }
    wireKpiCardIconsIn(grid);
    grid.addEventListener("dragend", () => {
      grid.querySelectorAll(".dream-kpi-card-drag-over").forEach((c) => c.classList.remove("dream-kpi-card-drag-over"));
    });
    container.appendChild(grid);

    if (!inSplitPane) {
      historyWrap.hidden = true;
      el.appendChild(historyWrap);
    }

    applyKpiGridScrollRestore(container, savedGridScroll);
    kpiGridScrollPrevFilter = kpiFilter;
    kpiGridScrollPrevScopeId = scopeId;
    persistKpiUiState();
    syncAppFooterSideincomeKpiActions();
  }


  function renderKpiDetailView(opts = {}) {
    const container = opts.target || detailHost();
    if (!container) return;
    const inSplitPane = layoutIsSplit && container !== contentWrap;

    if (!inSplitPane) {
      contentWrap.hidden = false;
      contentWrap.className = "dream-content-wrap dream-kpi-detail-wrap";
    } else {
      container.className =
        "sideincome-split-pane sideincome-split-pane--detail dream-content-wrap dream-kpi-detail-wrap";
    }
    if (!selectedKpiId) {
      if (inSplitPane) {
        paintSplitPlaceholder(container, "행동을 선택해 주세요");
        syncAppFooterSideincomeKpiActions();
        persistKpiUiState();
        return;
      }
      container.innerHTML = "";
      exitToKpiList();
      return;
    }
    void renderKpiHistory({ ...opts, target: container });
    syncAppFooterSideincomeKpiActions();
    persistKpiUiState();
  }

  async function renderKpiHistory(opts = {}) {
    syncHabitTrackerLogs();
    const { scrollTodoAfterMutation = false, target = historyWrap } = opts;
    const scrollSnap = scrollTodoAfterMutation
      ? captureKpiDetailScroll(target)
      : null;
    target.innerHTML = "";
    if (!selectedKpiId) {
      if (target === historyWrap) historyWrap.hidden = true;
      syncAppFooterSideincomeKpiActions();
      return;
    }
    const data = loadSideincomeMap();
    const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
    if (!kpi) {
      if (target === historyWrap) historyWrap.hidden = true;
      exitToKpiList();
      return;
    }
    const needHabitTracker = !!kpi.needHabitTracker;
    const storedLogs = KPI_DETAIL_LOGS_UI_ENABLED ? getKpiLogs(selectedKpiId) : [];
    const logs = KPI_DETAIL_LOGS_UI_ENABLED
      ? resolveKpiDetailLogEntriesLocal(kpi, storedLogs)
      : [];
    const selKpi = String(selectedKpiId);
    const todos = (data.kpiTodos || []).filter(
      (t) => String(t.kpiId) === selKpi && (t.text || "").trim() !== "",
    );
    if (target === historyWrap) historyWrap.hidden = false;

    const hasDailyTab = needHabitTracker;
    const dailyTodosOnly = kpiUsesDailyTodosOnly(kpi);

    const appendKpiDailyLogBlock = (parentEl, logEntries) => {
      const div = document.createElement("div");
      div.className = "dream-kpi-history-divider";
      parentEl.appendChild(div);
      if (logEntries.length === 0) {
        const empty = document.createElement("p");
        empty.className = "dream-kpi-history-empty";
        empty.textContent = "아직 기록이 없습니다.";
        parentEl.appendChild(empty);
      } else {
        const list = document.createElement("div");
        list.className = "dream-kpi-history-list";
        logEntries.forEach((log) => {
          const item = document.createElement("div");
          item.className = "dream-kpi-history-item";
          const completed = log.dailyCompleted || [];
          const completedNames = completed
            .map((t) => (t.text || "").trim())
            .filter(Boolean);
          const dailyLine =
            completedNames.length > 0 ? completedNames.join(" · ") : "";
          item.innerHTML = `
          <div class="dream-kpi-history-item-body">
            <div class="dream-kpi-history-item-main">
              <span class="dream-kpi-history-date">${escapeHtml(log.date)}</span>
              ${kpiLogSourceBadgeHtml(log)}
              <span class="dream-kpi-history-value">${escapeHtml(formatKpiHistoryValueText(log, kpi))}</span>
            </div>
            ${log.memo ? `<div class="dream-kpi-history-memo">${escapeHtml(log.memo)}</div>` : ""}
            ${dailyLine ? `<div class="dream-kpi-history-daily dream-kpi-history-daily--checked-only">${escapeHtml(dailyLine)}</div>` : ""}
          </div>
        `;
          list.appendChild(item);
        });
        parentEl.appendChild(list);
      }
    };

    const useKpiSegBar =
      KPI_DETAIL_LOGS_UI_ENABLED || SIDEINCOME_KPI_NOTES_UI_ENABLED;
    const todoSegLabel = dailyTodosOnly ? "매일할일" : "할 일";

    const appendSideincomeKpiNotesPanel = (parentEl, kpiIdForNotes, kpiNameForModal) => {
      parentEl.replaceChildren();
      const kid = String(kpiIdForNotes || selectedKpiId || "").trim();
      const tags = getLocalSideincomeKpiNoteTags(kid);
      const notes = getLocalSideincomeKpiNotes(kid);
      const groups = groupSideincomeKpiNotesByTag(kid, notes, tags);
      if (!groups.length) {
        const empty = document.createElement("p");
        empty.className = "dream-kpi-history-empty";
        empty.textContent = "아직 기록이 없습니다.";
        parentEl.appendChild(empty);
        return;
      }
      const list = document.createElement("div");
      list.className = "dream-kpi-notes-list";
      groups.forEach(({ tag, notes: tagNotes }) => {
        const group = document.createElement("section");
        group.className = "dream-kpi-notes-group";

        const head = document.createElement("div");
        head.className = "dream-kpi-notes-group-head";
        const chip = document.createElement("span");
        chip.className = "dream-kpi-notes-tag-chip";
        chip.textContent = String(tag.label || "").trim() || "태그";
        head.appendChild(chip);
        group.appendChild(head);

        const items = document.createElement("div");
        items.className = "dream-kpi-notes-group-items";
        tagNotes.forEach((note) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "dream-kpi-notes-row";
          row.dataset.noteId = note.id;

          const memoCol = document.createElement("div");
          memoCol.className = "dream-kpi-notes-row-memo";
          memoCol.textContent = String(note.memo || "").trim() || "—";
          row.appendChild(memoCol);

          row.addEventListener("click", async () => {
            const result = await showSideincomeKpiNoteModal({
              mode: "edit",
              kpiId: kid,
              kpiName: kpiNameForModal,
              existingTags: getLocalSideincomeKpiNoteTags(kid),
              note: {
                id: note.id,
                tagIds: note.tagIds,
                tagId: note.tagId,
                memo: note.memo,
              },
            });
            if (!result) return;
            if (result.action === "delete") {
              const del = await deleteSideincomeKpiNoteOnServer(note.id, note.kpiId);
              if (!del.ok) return;
              renderKpiDetailView();
              return;
            }
            if (result.action === "save") {
              const saved = await saveSideincomeKpiNoteFromModal({
                kpiId: kid,
                noteId: note.id,
                tagLabels: result.tagLabels,
                memo: result.memo,
                nextId,
              });
              if (!saved.ok) return;
              renderKpiDetailView();
            }
          });

          items.appendChild(row);
        });
        group.appendChild(items);
        list.appendChild(group);
      });
      parentEl.appendChild(list);
    };

    const segBar = useKpiSegBar ? document.createElement("div") : null;
    if (segBar) {
      segBar.className = "dream-kpi-bottom-seg-bar";
      segBar.setAttribute("role", "tablist");
      segBar.setAttribute("aria-label", "할 일·매일 할 일·기록 전환");
    }

    let btnSegLog = null;
    let panelLogSeg = null;
    if (KPI_DETAIL_LOGS_UI_ENABLED) {
      btnSegLog = document.createElement("button");
      btnSegLog.type = "button";
      btnSegLog.className = "dream-kpi-bottom-seg-btn";
      btnSegLog.textContent = "로그";
      btnSegLog.setAttribute("role", "tab");

      panelLogSeg = document.createElement("div");
      panelLogSeg.className =
        "dream-kpi-bottom-seg-panel dream-kpi-bottom-seg-panel--log";
      panelLogSeg.setAttribute("role", "tabpanel");
      appendKpiDailyLogBlock(panelLogSeg, logs);
    }

    let btnSegNotes = null;
    let panelNotesSeg = null;
    if (SIDEINCOME_KPI_NOTES_UI_ENABLED) {
      btnSegNotes = document.createElement("button");
      btnSegNotes.type = "button";
      btnSegNotes.className = "dream-kpi-bottom-seg-btn";
      btnSegNotes.textContent = "기록";
      btnSegNotes.setAttribute("role", "tab");

      panelNotesSeg = document.createElement("div");
      panelNotesSeg.className =
        "dream-kpi-bottom-seg-panel dream-kpi-bottom-seg-panel--notes";
      panelNotesSeg.setAttribute("role", "tabpanel");
      appendSideincomeKpiNotesPanel(
        panelNotesSeg,
        String(selectedKpiId),
        kpi.name,
      );
    }

    const btnSegTodo = useKpiSegBar ? document.createElement("button") : null;
    if (btnSegTodo) {
      btnSegTodo.type = "button";
      btnSegTodo.className = "dream-kpi-bottom-seg-btn";
      btnSegTodo.textContent = todoSegLabel;
      btnSegTodo.setAttribute("role", "tab");
    }

    let btnSegDaily = null;
    if (hasDailyTab && useKpiSegBar && !dailyTodosOnly) {
      btnSegDaily = document.createElement("button");
      btnSegDaily.type = "button";
      btnSegDaily.className = "dream-kpi-bottom-seg-btn";
      btnSegDaily.textContent = "매일할일";
      btnSegDaily.setAttribute("role", "tab");
    }

    if (segBar) {
      if (btnSegTodo) segBar.appendChild(btnSegTodo);
      if (btnSegDaily) segBar.appendChild(btnSegDaily);
      if (btnSegLog) segBar.appendChild(btnSegLog);
      if (btnSegNotes) segBar.appendChild(btnSegNotes);
    }

    let panelTodoSeg = null;
    if (!dailyTodosOnly) {
      panelTodoSeg = document.createElement("div");
    panelTodoSeg.className =
      "dream-kpi-bottom-seg-panel dream-kpi-bottom-seg-panel--todo";
    panelTodoSeg.setAttribute("role", "tabpanel");

    const todoList = document.createElement("div");
    todoList.className = "dream-kpi-todo-list dream-kpi-todo-list--seg-panel";
    todos.forEach((todo) => {
      const item = document.createElement("div");
      const completed = !!todo.completed;
      item.className = "dream-kpi-todo-item" + (completed ? " is-completed" : "");
      item.dataset.todoId = todo.id;

      const label = document.createElement("label");
      label.className = "dream-kpi-todo-check-wrap";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "dream-kpi-todo-check";
      check.checked = completed;
      label.appendChild(check);

      const textPreview = document.createElement("div");
      textPreview.className = "dream-kpi-todo-list-preview";
      textPreview.textContent = todo.text || "";
      textPreview.title = "눌러서 수정·삭제";

      const openTodoEdit = async () => {
        const result = await showKpiTodoEditModal({
          kpiName: kpi.name,
          linkedLabel: "연결된 행동",
          initialText: todo.text || "",
          title: "할 일 수정",
        });
        if (!result) return;
        if (result.action === "delete") {
          const d = loadSideincomeMap();
          kpiTodoLifecycleLog("부수입KPI탭_모달삭제", {
            todoId: String(todo.id),
            삭제전: kpiTodoSnapshotBrief(d),
            삭제전dr: deletedRefsKpiTodosLen(d),
          });
          appendDeletedRef(d, "kpiTodos", todo.id);
          d.kpiTodos = (d.kpiTodos || []).filter((x) => x.id !== todo.id);
          saveSideincomeMap(d, { pushServer: true });
          const after = loadSideincomeMap();
          kpiTodoLifecycleLog("부수입KPI탭_모달삭제_saveSideincomeMap후", {
            todoId: String(todo.id),
            삭제후: kpiTodoSnapshotBrief(after),
            삭제후dr: deletedRefsKpiTodosLen(after),
          });
          renderKpiDetailView({ scrollTodoAfterMutation: true });
          return;
        }
        const d = loadSideincomeMap();
        const row = (d.kpiTodos || []).find((x) => x.id === todo.id);
        if (!row) return;
        row.text = result.text;
        saveSideincomeMap(d, { pushServer: true });
        renderKpiDetailView({ scrollTodoAfterMutation: true });
      };

      item.addEventListener("click", async (e) => {
        if (e.target.closest(".dream-kpi-todo-check-wrap")) return;
        await openTodoEdit();
      });

      check.addEventListener("change", () => {
        const d = loadSideincomeMap();
        const t = d.kpiTodos.find((x) => x.id === todo.id);
        if (t) {
          kpiTodoLifecycleLog("부수입KPI탭_체크_완료토글", {
            todoId: String(todo.id),
            이전완료: !!t.completed,
            요청완료: !!check.checked,
          });
          t.completed = !!check.checked;
          saveSideincomeMap(d, { pushServer: true });
          kpiTodoLifecycleLog("부수입KPI탭_체크_save후", {
            todoId: String(todo.id),
            completion: kpiTodosCompletionBrief(loadSideincomeMap(), 20),
          });
          item.classList.toggle("is-completed", t.completed);
        }
      });

      item.appendChild(label);
      item.appendChild(textPreview);
      todoList.appendChild(item);
    });

    if (layoutIsSplit) {
      const todoAddCard = document.createElement("button");
      todoAddCard.type = "button";
      todoAddCard.className = "dream-kpi-add-card sideincome-split-todo-add-card";
      todoAddCard.innerHTML =
        '<span class="dream-kpi-add-card-text">할 일 추가하기</span>';
      todoAddCard.addEventListener("click", () => {
        setKpiHistoryBottomTab("sideincome", selKpi, KPI_BOTTOM_TAB_TODO);
        void runSideincomeKpiFooterAddAction();
      });
      panelTodoSeg.appendChild(todoAddCard);
    }
    if (todos.length === 0) {
      const emptyTodo = document.createElement("p");
      emptyTodo.className = "dream-kpi-history-empty";
      emptyTodo.textContent = "등록된 할 일이 없습니다.";
      panelTodoSeg.appendChild(emptyTodo);
    } else {
      panelTodoSeg.appendChild(todoList);
    }
    if (layoutIsSplit) {
      const clearLabelBtn = document.createElement("button");
      clearLabelBtn.type = "button";
      clearLabelBtn.className = "sideincome-split-clear-completed-label-btn";
      clearLabelBtn.textContent = "완료목록 모두 삭제하기";
      clearLabelBtn.addEventListener("click", () => {
        void confirmAndPurgeCompletedKpiTodos({
          kpiId: selKpi,
          loadMap: loadSideincomeMap,
          saveMap: saveSideincomeMap,
          appendDeletedRef,
          onAfterDelete: () =>
            renderKpiDetailView({ scrollTodoAfterMutation: true }),
          title: "완료목록 모두 삭제",
          emptyMessage: "삭제할 완료한 할 일이 없습니다.",
        });
      });
      panelTodoSeg.appendChild(clearLabelBtn);
    }
    }

    let panelDailySeg = null;
    if (hasDailyTab) {
      panelDailySeg = document.createElement("div");
      panelDailySeg.className =
        "dream-kpi-bottom-seg-panel dream-kpi-bottom-seg-panel--daily";
      panelDailySeg.setAttribute("role", "tabpanel");

      const dailyHeader = document.createElement("div");
      dailyHeader.className = "dream-kpi-todo-header";
      dailyHeader.innerHTML = `<span class="dream-kpi-todo-title">매일 반복되는 할일 목록</span>`;
      panelDailySeg.appendChild(dailyHeader);
      const dailyDivider = document.createElement("div");
      dailyDivider.className = "dream-kpi-todo-divider";
      panelDailySeg.appendChild(dailyDivider);
      const dailyList = document.createElement("div");
      dailyList.className = "dream-kpi-todo-list dream-kpi-todo-list--seg-panel";
      const dailyTodos = sortNormalizedKpiTodoRows(
        (data.kpiDailyRepeatTodos || []).filter(
          (t) => String(t.kpiId) === selKpi && (t.text || "").trim() !== "",
        ),
      );
      dailyTodos.forEach((todo) => {
        const item = document.createElement("div");
        item.className = "dream-kpi-todo-item dream-kpi-daily-repeat-ref";
        item.dataset.todoId = todo.id;
        const label = document.createElement("label");
        label.className = "dream-kpi-todo-check-wrap";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "dream-kpi-todo-check";
        check.disabled = true;
        check.checked = false;
        check.title =
          "행동 화면에서는 체크 상태를 보여 주지 않습니다. 완료는 시간기록(과제 기록)에서만 체크하세요.";
        label.appendChild(check);
        const textPreview = document.createElement("div");
        textPreview.className = "dream-kpi-todo-list-preview";
        textPreview.textContent = todo.text || "";
        textPreview.title = "눌러서 수정·삭제";

        const openDailyEdit = async () => {
          const result = await showKpiTodoEditModal({
            kpiName: kpi.name,
            linkedLabel: "연결된 행동",
            initialText: todo.text || "",
            title: "매일 할 일 수정",
            placeholder: "매일 반복되는 할 일",
          });
          if (!result) return;
          if (result.action === "delete") {
            const d = loadSideincomeMap();
            appendDeletedRef(d, "kpiDailyRepeatTodos", todo.id);
            d.kpiDailyRepeatTodos = (d.kpiDailyRepeatTodos || []).filter((x) => x.id !== todo.id);
            saveSideincomeMap(d, { pushServer: true });
            renderKpiDetailView({ scrollTodoAfterMutation: true });
            return;
          }
          const d = loadSideincomeMap();
          const row = (d.kpiDailyRepeatTodos || []).find((x) => x.id === todo.id);
          if (!row) return;
          row.text = result.text;
          saveSideincomeMap(d, { pushServer: true });
          renderKpiDetailView({ scrollTodoAfterMutation: true });
        };

        item.addEventListener("click", async (e) => {
          if (e.target.closest(".dream-kpi-todo-check-wrap")) return;
          await openDailyEdit();
        });

        item.appendChild(label);
        item.appendChild(textPreview);
        dailyList.appendChild(item);
      });
      wireKpiDailyTodoListDragReorder(dailyList, {
        kpiId: selKpi,
        loadMap: loadSideincomeMap,
        saveMap: saveSideincomeMap,
      });
      if (layoutIsSplit) {
        const dailyAddCard = document.createElement("button");
        dailyAddCard.type = "button";
        dailyAddCard.className =
          "dream-kpi-add-card sideincome-split-todo-add-card";
        dailyAddCard.innerHTML =
          '<span class="dream-kpi-add-card-text">매일 할 일 추가하기</span>';
        dailyAddCard.addEventListener("click", () => {
          setKpiHistoryBottomTab("sideincome", selKpi, KPI_BOTTOM_TAB_DAILY);
          void runSideincomeKpiFooterAddAction();
        });
        panelDailySeg.appendChild(dailyAddCard);
      }
      if (dailyTodos.length === 0) {
        const emptyDaily = document.createElement("p");
        emptyDaily.className = "dream-kpi-history-empty";
        emptyDaily.textContent = "등록된 매일 할 일이 없습니다.";
        panelDailySeg.appendChild(emptyDaily);
      } else {
        panelDailySeg.appendChild(dailyList);
      }
    }

    const clearCompletedOpts = {
      showClearCompleted: !dailyTodosOnly && !layoutIsSplit,
      kpiId: selKpi,
      loadMap: loadSideincomeMap,
      saveMap: saveSideincomeMap,
      appendDeletedRef,
      onAfterDelete: () => renderKpiDetailView({ scrollTodoAfterMutation: true }),
    };

    if (useKpiSegBar && segBar) {
      /* 3분할: 할 일 추가는 목록 상단 점선 카드, 세그 바에는 휴지통 없음 */
      const segBarMount =
        layoutIsSplit && !dailyTodosOnly
          ? segBar
          : mountKpiSegBarClearCompletedRow(segBar, clearCompletedOpts);
      const clearCompletedTrashBtn =
        segBarMount instanceof HTMLElement
          ? segBarMount.querySelector(".dream-kpi-bottom-seg-clear-completed-btn")
          : null;
      const syncSegClearCompletedTrashVisibility = (tab) => {
        if (!(clearCompletedTrashBtn instanceof HTMLElement)) return;
        clearCompletedTrashBtn.hidden = tab !== KPI_BOTTOM_TAB_TODO;
      };
      target.appendChild(segBarMount);
      if (panelLogSeg) target.appendChild(panelLogSeg);
      if (panelNotesSeg) target.appendChild(panelNotesSeg);
      if (panelTodoSeg) target.appendChild(panelTodoSeg);
      if (panelDailySeg) target.appendChild(panelDailySeg);
      wireKpiHistoryBottomTabs(
        "sideincome",
        selectedKpiId,
        btnSegLog,
        btnSegTodo,
        btnSegDaily,
        panelLogSeg,
        panelTodoSeg,
        panelDailySeg,
        hasDailyTab,
        (tab) => {
          syncAppFooterSideincomeKpiActions();
          syncSegClearCompletedTrashVisibility(tab);
          if (tab === KPI_BOTTOM_TAB_NOTES && selectedKpiId && panelNotesSeg) {
            void pullSideincomeKpiNotesForKpi(String(selectedKpiId)).then(() => {
              if (!panelNotesSeg.isConnected) return;
              appendSideincomeKpiNotesPanel(
                panelNotesSeg,
                String(selectedKpiId),
                kpi.name,
              );
            });
          }
        },
        {
          dailyTodosOnly,
          btnNotes: btnSegNotes,
          panelNotes: panelNotesSeg,
        },
      );
    } else if (layoutIsSplit && !dailyTodosOnly && panelTodoSeg) {
      target.appendChild(createKpiDetailSectionHeader("할 일"));
      target.appendChild(panelTodoSeg);
      setKpiHistoryBottomTab("sideincome", selKpi, KPI_BOTTOM_TAB_TODO);
      if (hasDailyTab && panelDailySeg) {
        panelDailySeg.querySelector(".dream-kpi-todo-header")?.remove();
        panelDailySeg.querySelector(".dream-kpi-todo-divider")?.remove();
        target.appendChild(createKpiDetailSectionHeader("매일할일"));
        target.appendChild(panelDailySeg);
      }
    } else {
      mountKpiDetailStackedSections(target, {
        namespace: "sideincome",
        kpiId: selKpi,
        todoPanel: panelTodoSeg,
        dailyPanel: panelDailySeg,
        dailyTodosOnly,
        hasDailyTab,
        clearCompleted: clearCompletedOpts,
      });
    }
    if (scrollTodoAfterMutation) {
      afterKpiTodoListMutationScroll(target, scrollSnap);
    }
    syncAppFooterSideincomeKpiActions();

    if (KPI_DETAIL_LOGS_UI_ENABLED && panelLogSeg && kpiDetailLogsNeedCloudPull(kpi, storedLogs)) {
      void resolveKpiDetailLogEntriesPrepared(kpi, storedLogs).then((freshLogs) => {
        if (!panelLogSeg.isConnected) return;
        panelLogSeg.replaceChildren();
        appendKpiDailyLogBlock(panelLogSeg, freshLogs);
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function showPathDeleteConfirmModal(pathId) {
    const data = loadSideincomeMap();
    const path = data.paths.find((d) => d.id === pathId);
    const pathName = path?.name || "이 경로";
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal dream-delete-confirm-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel" class="dream-delete-confirm-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">시급 상승 경로 삭제</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <div data-legacy="time-task-setup-body">
          <p class="dream-delete-confirm-msg">"${escapeHtml(pathName)}"을(를) 정말 삭제하시겠습니까?</p>
          <p class="dream-delete-confirm-warn">삭제 시 복구 불가</p>
        </div>
        <div data-legacy="time-task-log-footer" class="dream-delete-confirm-modal-footer">
          <button type="button" class="dream-delete-confirm-cancel" data-legacy="todo-list-modal-cancel">취소</button>
          <button type="button" class="dream-delete-confirm-submit">삭제</button>
        </div>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);
    modal.querySelector(".dream-delete-confirm-cancel").addEventListener("click", close);
    modal.querySelector(".dream-delete-confirm-submit").addEventListener("click", () => {
      close();
      const d = loadSideincomeMap();
      appendDeletedRef(d, "categories", pathId);
      const pathKpis = (d.kpis || []).filter((k) => k.pathId === pathId);
      const kpiIds = pathKpis.map((k) => k.id);
      pathKpis.forEach((k) => {
        appendDeletedRef(d, "kpis", k.id);
        syncKpiToTimeTask(k, "remove");
      });
      d.paths = (d.paths || []).filter((x) => x.id !== pathId);
      d.kpis = (d.kpis || []).filter((k) => k.pathId !== pathId);
      d.kpiLogs = (d.kpiLogs || []).filter((l) => !kpiIds.includes(l.kpiId));
      d.kpiTodos = (d.kpiTodos || []).filter((t) => !kpiIds.includes(t.kpiId));
      d.kpiDailyRepeatTodos = (d.kpiDailyRepeatTodos || []).filter((t) => !kpiIds.includes(t.kpiId));
      d.pathLogs = (d.pathLogs || []).filter((l) => l.pathId !== pathId);
      delete d.kpiOrder?.[pathId];
      d.kpiTaskSync = (d.kpiTaskSync || {});
      kpiIds.forEach((id) => delete d.kpiTaskSync[id]);
      saveSideincomeMap(d, { pushServer: true });
      if (activePathId === pathId) {
        activePathId = d.paths[0]?.id || null;
        selectedKpiId = null;
        if (!activePathId) sideincomeViewScreen = "goals";
      }
      syncSideincomeHeader();
      updateSideincomeView();
    });
    document.body.appendChild(modal);
  }

  function showPathContextModal(path) {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel" class="dream-path-context-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">시급 상승 경로 수정</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form dream-path-edit-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>목표 이름</label>
              <input type="text" name="name" value="${escapeHtml(path.name || "")}" placeholder="시간관리서비스 개발" />
            </div>
            ${pathYearQuarterFieldsHtml(path)}
            <div class="dream-kpi-field dream-kpi-field-checkbox" data-legacy="time-add-task-field">
              <label class="dream-kpi-checkbox-label">
                목표 금액 입력하기
                <input type="checkbox" name="trackTargetAmount"${path.trackTargetAmount ? " checked" : ""} />
              </label>
            </div>
            <div class="dream-kpi-field sideincome-target-amount-field" data-legacy="time-add-task-field"${path.trackTargetAmount ? "" : " hidden"}>
              <label>목표 금액 (원)</label>
              <input type="text" name="targetAmount" value="${escapeHtml(formatIntegerWithCommas(path.targetAmount || ""))}" placeholder="예) 10,000" inputmode="numeric" />
            </div>
            <div class="dream-kpi-delete-wrap">
              <button type="button" class="dream-kpi-delete-btn" data-action="delete">시급 상승 경로 삭제</button>
              <p class="dream-kpi-delete-note">삭제 시 복구 불가</p>
            </div>
          </div>
          <div data-legacy="time-task-log-footer">
            <button type="submit" data-legacy="time-task-log-submit">수정</button>
          </div>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);
    modal.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const val = (e.target.name.value || "").trim() || "새 경로";
      const amountFields = readPathTargetAmountFields(e.target);
      const yq = readPathYearQuarterFields(e.target);
      const d = loadSideincomeMap();
      const target = d.paths.find((x) => x.id === path.id);
      if (target) {
        target.name = val;
        target.trackTargetAmount = amountFields.trackTargetAmount;
        target.targetAmount = amountFields.targetAmount;
        target.unit = amountFields.unit;
        target.targetStartDate = "";
        target.targetDeadline = "";
        target.targetYear = yq.targetYear;
        target.targetQuarter = yq.targetQuarter;
        saveSideincomeMap(d, { pushServer: true });
        goalsListYear = yq.targetYear;
        syncSideincomeHeader();
        updateSideincomeView();
      }
      close();
    });
    const editForm = modal.querySelector("form");
    bindPathTargetAmountMode(editForm, path);
    bindPathYearQuarterFields(editForm);
    modal.querySelector('[data-action="delete"]').addEventListener("click", () => {
      close();
      showPathDeleteConfirmModal(path.id);
    });
    document.body.appendChild(modal);
  }

  function clearPathTargetAmountAndLogs(pathId) {
    const d = loadSideincomeMap();
    const target = d.paths.find((x) => x.id === pathId);
    if (!target) return;
    target.trackTargetAmount = false;
    target.targetAmount = "";
    target.unit = "";
    const removedLogs = (d.pathLogs || []).filter((l) => l.pathId === pathId);
    removedLogs.forEach((l) => appendDeletedRef(d, "pathLogs", l.id));
    d.pathLogs = (d.pathLogs || []).filter((l) => l.pathId !== pathId);
    saveSideincomeMap(d, { pushServer: true });
    syncSideincomeHeader();
    updateSideincomeView();
  }

  function showPathTargetAmountClearConfirmModal(path) {
    const data = loadSideincomeMap();
    const logCount = (data.pathLogs || []).filter((l) => l.pathId === path.id).length;
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal dream-delete-confirm-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel" class="dream-delete-confirm-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">목표 금액 삭제</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <div data-legacy="time-task-setup-body">
          <p class="dream-delete-confirm-msg">목표 금액을 삭제하시겠습니까?</p>
          <p class="dream-delete-confirm-warn">관련 수입 로그${logCount ? ` ${logCount}건` : ""}도 함께 삭제되며 복구할 수 없습니다.</p>
        </div>
        <div data-legacy="time-task-log-footer" class="dream-delete-confirm-modal-footer">
          <button type="button" class="dream-delete-confirm-cancel" data-legacy="todo-list-modal-cancel">취소</button>
          <button type="button" class="dream-delete-confirm-submit">삭제</button>
        </div>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);
    modal.querySelector(".dream-delete-confirm-cancel").addEventListener("click", close);
    modal.querySelector(".dream-delete-confirm-submit").addEventListener("click", () => {
      close();
      clearPathTargetAmountAndLogs(path.id);
    });
    document.body.appendChild(modal);
  }

  function showPathTargetAmountModal(path) {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel" class="dream-path-context-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">목표 금액 수정</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form dream-path-edit-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
            <div class="dream-kpi-field sideincome-target-amount-field" data-legacy="time-add-task-field">
              <label>목표 금액 (원)</label>
              <input type="text" name="targetAmount" value="${escapeHtml(formatIntegerWithCommas(path.targetAmount || ""))}" placeholder="예) 10,000" inputmode="numeric" />
            </div>
          </div>
          <div data-legacy="time-task-log-footer" class="dream-kpi-log-modal-footer">
            <button type="button" class="dream-kpi-log-modal-delete-btn" data-legacy="time-task-log-delete-btn" data-action="clear-target-amount">목표 금액 삭제하기</button>
            <button type="submit" data-legacy="time-task-log-submit">수정</button>
          </div>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);
    modal.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const amount = sanitizeNumericInput(e.target.targetAmount?.value) || "";
      if (!amount) {
        e.target.targetAmount?.focus();
        return;
      }
      const d = loadSideincomeMap();
      const target = d.paths.find((x) => x.id === path.id);
      if (target) {
        target.trackTargetAmount = true;
        target.targetAmount = amount;
        target.unit = "원";
        saveSideincomeMap(d, { pushServer: true });
        syncSideincomeHeader();
        updateSideincomeView();
      }
      close();
    });
    setupWonAmountInput(modal.querySelector('input[name="targetAmount"]'));
    modal.querySelector('[data-action="clear-target-amount"]').addEventListener("click", () => {
      close();
      showPathTargetAmountClearConfirmModal(path);
    });
    document.body.appendChild(modal);
  }

  let goalsListYear = sideincomeLocalYear();

  function renderSideincomeGoalsList(host) {
    const container = host || goalsHost();
    if (!container) return;
    const inSplitPane = layoutIsSplit && container !== contentWrap;

    if (!inSplitPane) {
      historyWrap.hidden = true;
      historyWrap.innerHTML = "";
      contentWrap.hidden = false;
      contentWrap.className = "dream-content-wrap";
      container.innerHTML = "";
    } else {
      container.innerHTML = "";
      container.className =
        "sideincome-split-pane sideincome-split-pane--goals dream-content-wrap";
    }
    syncAppFooterSideincomeKpiActions();

    const data = loadSideincomeMap();

    if (
      renderKpiMapSyncLoadingIfNeeded({
        tabId: "sideincome",
        container,
        isEmpty: !data.paths.length,
        onLoading: () => syncAppFooterSideincomeKpiActions(),
      })
    ) {
      return;
    }

    const shell = document.createElement("div");
    shell.className = "sideincome-goals-year-shell";

    const yearBar = document.createElement("div");
    yearBar.className = "sideincome-goals-year-bar";
    yearBar.innerHTML = `
      <button type="button" class="sideincome-goals-year-nav" data-year-delta="-1" aria-label="이전 연도">‹</button>
      <span class="sideincome-goals-year-label">${goalsListYear}년</span>
      <button type="button" class="sideincome-goals-year-nav" data-year-delta="1" aria-label="다음 연도">›</button>
    `;
    yearBar.querySelectorAll("[data-year-delta]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const d = Number(btn.getAttribute("data-year-delta") || 0);
        goalsListYear = Math.min(2100, Math.max(2000, goalsListYear + d));
        renderSideincomeGoalsList(container);
      });
    });
    shell.appendChild(yearBar);

    /* 3분할: 연도 아래 점선 「목표 추가하기」 */
    if (layoutIsSplit) {
      const goalAddCard = document.createElement("button");
      goalAddCard.type = "button";
      goalAddCard.className = "dream-kpi-add-card sideincome-split-goal-add-card";
      goalAddCard.innerHTML =
        '<span class="dream-kpi-add-card-text">목표 추가하기</span>';
      goalAddCard.addEventListener("click", () => {
        if (pathAddModalJustClosed) return;
        showPathAddModal();
      });
      shell.appendChild(goalAddCard);
    }

    const list = document.createElement("div");
    list.className = "dream-goals-list sideincome-goals-by-quarter";

    const yearPaths = (data.paths || []).filter(
      (p) => resolvePathTargetYear(p) === goalsListYear,
    );

    if (!data.paths.length) {
      const empty = document.createElement("p");
      empty.className = "dream-goals-empty";
      empty.textContent = "시급 상승 목표를 추가해보세요.";
      list.appendChild(empty);
    } else if (!yearPaths.length) {
      const empty = document.createElement("p");
      empty.className = "dream-goals-empty";
      empty.textContent = `${goalsListYear}년 목표가 없습니다. 목표 추가에서 연도·분기를 골라 주세요.`;
      list.appendChild(empty);
    }

    for (let q = 1; q <= 4; q++) {
      const section = document.createElement("section");
      section.className = "sideincome-quarter-section";
      const monthLabel = SIDEINCOME_QUARTER_MONTH_LABELS[q] || "";
      section.setAttribute(
        "aria-label",
        `${goalsListYear}년 ${q}분기${monthLabel ? ` (${monthLabel})` : ""}`,
      );
      const head = document.createElement("h2");
      head.className = "sideincome-quarter-section-title";
      head.innerHTML = `${q}분기 <span class="sideincome-quarter-months">${monthLabel}</span>`;
      section.appendChild(head);

      const qPaths = yearPaths.filter((p) => resolvePathTargetQuarter(p) === q);
      if (!qPaths.length) {
        const emptyQ = document.createElement("p");
        emptyQ.className = "sideincome-quarter-empty";
        emptyQ.textContent = "목표 없음";
        section.appendChild(emptyQ);
      } else {
        qPaths.forEach((path) => {
          const kpiCount = (data.kpis || []).filter((k) => k.pathId === path.id)
            .length;
          const item = document.createElement("div");
          item.className =
            "dream-goals-item dream-kpi-card" +
            (activePathId === path.id ? " is-selected" : "");
          const amountLabel =
            path.trackTargetAmount && path.targetAmount
              ? ` · ${formatIntegerWithCommas(path.targetAmount)}원`
              : "";
          item.innerHTML = `
            <div class="dream-kpi-card-inner">
              ${SIDEINCOME_GOAL_EDIT_PENCIL_HTML}
              <div class="dream-goals-item-name">${escapeHtml(path.name || "새 경로")}</div>
              <div class="dream-goals-item-meta">행동 ${kpiCount}개${amountLabel}</div>
            </div>
          `;
          bindKpiCardEditButton(item.querySelector(".dream-kpi-card-edit"), () =>
            showPathContextModal(path),
          );
          item.addEventListener("click", (e) => {
            if (e.target.closest(".dream-kpi-card-edit")) return;
            enterKpiView(path.id);
          });
          section.appendChild(item);
        });
      }
      list.appendChild(section);
    }

    shell.appendChild(list);
    container.appendChild(shell);
    persistKpiUiState();
  }

  function updateSideincomeView() {
    syncLayoutModeFromViewport();
    syncSideincomeHeader();
    historyWrap.hidden = true;
    historyWrap.innerHTML = "";

    if (layoutIsSplit) {
      const data = loadSideincomeMap();
      if (activePathId && !data.paths.some((p) => p.id === activePathId)) {
        activePathId = null;
        selectedKpiId = null;
        sideincomeViewScreen = "goals";
      }
      if (selectedKpiId) {
        const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
        if (!kpi || kpi.pathId !== activePathId) {
          selectedKpiId = null;
          sideincomeViewScreen = activePathId ? "kpis" : "goals";
        }
      }
      renderSideincomeGoalsList(paneGoals);
      if (activePathId) renderKpiList(paneKpis);
      else paintSplitPlaceholder(paneKpis, "목표를 선택해 주세요");
      if (selectedKpiId) renderKpiDetailView({ target: paneDetail });
      else paintSplitPlaceholder(paneDetail, "행동을 선택해 주세요");
      syncAppFooterSideincomeKpiActions();
      persistKpiUiState();
      return;
    }

    if (sideincomeViewScreen === "goals") {
      renderSideincomeGoalsList();
      return;
    }
    const data = loadSideincomeMap();
    const path = data.paths.find((p) => p.id === activePathId);
    if (path) {
      if (sideincomeViewScreen === "kpiDetail") {
        renderKpiDetailView();
      } else {
        contentWrap.hidden = false;
        contentWrap.className = "dream-content-wrap";
        renderKpiList();
      }
    } else {
      exitToSideincomeGoalsList();
    }
    persistKpiUiState();
  }

  function showPathAddModal() {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">시급 상승 목표 추가</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>목표 이름</label>
              <input type="text" name="name" placeholder="시간관리서비스 개발" />
            </div>
            ${pathYearQuarterFieldsHtml({
              targetYear: goalsListYear,
              targetQuarter: sideincomeLocalQuarter(),
            })}
            <div class="dream-kpi-field dream-kpi-field-checkbox" data-legacy="time-add-task-field">
              <label class="dream-kpi-checkbox-label">
                목표 금액 입력하기
                <input type="checkbox" name="trackTargetAmount" />
              </label>
            </div>
            <div class="dream-kpi-field sideincome-target-amount-field" data-legacy="time-add-task-field" hidden>
              <label>목표 금액 (원)</label>
              <input type="text" name="targetAmount" placeholder="예) 10,000" inputmode="numeric" />
            </div>
          </div>
          <div data-legacy="time-task-log-footer">
            <button type="button" data-legacy="time-task-log-submit" class="dream-add-confirm-btn">확인</button>
          </div>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);
    const form = modal.querySelector("form");
    const confirmBtn = modal.querySelector(".dream-add-confirm-btn");
    const doSubmit = () => {
      const val = (form.name.value || "").trim() || "새 경로";
      const amountFields = readPathTargetAmountFields(form);
      const yq = readPathYearQuarterFields(form);
      const data = loadSideincomeMap();
      const path = {
        id: nextId(),
        name: val,
        trackTargetAmount: amountFields.trackTargetAmount,
        targetAmount: amountFields.targetAmount,
        unit: amountFields.unit,
        targetStartDate: "",
        targetDeadline: "",
        targetYear: yq.targetYear,
        targetQuarter: yq.targetQuarter,
      };
      data.paths.push(path);
      saveSideincomeMap(data, { pushServer: true });
      selectedKpiId = null;
      pathAddModalJustClosed = true;
      goalsListYear = yq.targetYear;
      close();
      sideincomeViewScreen = "goals";
      activePathId = null;
      updateSideincomeView();
      setTimeout(() => {
        pathAddModalJustClosed = false;
      }, 300);
    };
    confirmBtn.addEventListener("click", doSubmit);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      doSubmit();
    });
    document.body.appendChild(modal);
    bindPathTargetAmountMode(form);
    bindPathYearQuarterFields(form);
  }

  function reconcileScopeWithStoredMap(data) {
    const paths = data?.paths || [];
    const kpis = data?.kpis || [];
    const keepSelection =
      wantsSplitLayout() ||
      sideincomeViewScreen === "kpis" ||
      sideincomeViewScreen === "kpiDetail";
    if (keepSelection) {
      if (activePathId && !paths.some((p) => p.id === activePathId)) {
        activePathId = null;
        selectedKpiId = null;
        sideincomeViewScreen = "goals";
      }
    } else {
      activePathId = null;
      selectedKpiId = null;
    }
    if (selectedKpiId && !kpis.some((k) => k.id === selectedKpiId)) {
      selectedKpiId = null;
      if (sideincomeViewScreen === "kpiDetail") {
        sideincomeViewScreen = activePathId ? "kpis" : "goals";
      }
    }
  }

  reconcileScopeWithStoredMap(_sideincomeInitData);
  syncSideincomeHeader();
  updateSideincomeView();
  let lastKpiMapPaintSig = readKpiMapLocalStorageSignature(
    SIDEINCOME_KPI_MAP_STORAGE_KEY,
  );

  function syncSideincomeUiFromStoredMap() {
    if (!el.isConnected) return;
    const nextSig = readKpiMapLocalStorageSignature(
      SIDEINCOME_KPI_MAP_STORAGE_KEY,
    );
    if (nextSig === lastKpiMapPaintSig) return;
    lastKpiMapPaintSig = nextSig;
    const data = loadSideincomeMap();
    const keepSelection =
      wantsSplitLayout() ||
      layoutIsSplit ||
      sideincomeViewScreen === "kpis" ||
      sideincomeViewScreen === "kpiDetail";
    if (keepSelection) {
      if (activePathId && !data.paths.some((p) => p.id === activePathId)) {
        activePathId = null;
        selectedKpiId = null;
        sideincomeViewScreen = "goals";
      }
    } else {
      activePathId = null;
      selectedKpiId = null;
    }
    if (selectedKpiId && !data.kpis.some((k) => k.id === selectedKpiId)) {
      selectedKpiId = null;
      if (sideincomeViewScreen === "kpiDetail") {
        sideincomeViewScreen = activePathId ? "kpis" : "goals";
      }
    }
    syncSideincomeHeader();
    updateSideincomeView();
    persistKpiUiState();
  }

  const onMergedSync = (e) => {
    if (!el.isConnected) return;
    /* push 시에는 화면 갱신 불필요 (로컬 변경을 서버에 올린 것이므로) */
    if (e.detail?.fromPush) return;
    if (!e.detail?.fromServerMerge && !e.detail?.fromLocalWrite) return;
    syncSideincomeUiFromStoredMap();
  };
  window.addEventListener("sideincome-kpi-map-saved", onMergedSync);
  window.addEventListener("lp-kpi-tab-pull-settled", (e) => {
    if (!el.isConnected || e.detail?.tabId !== "sideincome") return;
    updateSideincomeView();
  });

  let splitMql = null;
  const onSplitViewportChange = () => {
    if (!el.isConnected) return;
    updateSideincomeView();
  };
  try {
    splitMql = window.matchMedia(SIDEINCOME_SPLIT_MQ);
    if (splitMql.addEventListener) {
      splitMql.addEventListener("change", onSplitViewportChange);
    } else if (splitMql.addListener) {
      splitMql.addListener(onSplitViewportChange);
    }
  } catch (_) {
    splitMql = null;
  }

  if (dashboardEmbedMode && dashboardHost && dashboardEmbedKey) {
    dashboardHost._lpEmbedSoftRefresh = dashboardHost._lpEmbedSoftRefresh || {};
    dashboardHost._lpEmbedSoftRefresh[dashboardEmbedKey] =
      syncSideincomeUiFromStoredMap;
  } else {
    window.__lpSideincomeSoftRefresh = syncSideincomeUiFromStoredMap;
  }
  if (!dashboardEmbedMode) {
    window.__lpSideincomeFooterBack = () => {
      if (!el.isConnected) return false;
      if (wantsSplitLayout() || layoutIsSplit) return false;
      if (sideincomeViewScreen === "kpiDetail") {
        exitToKpiList();
        return true;
      }
      if (sideincomeViewScreen === "kpis") {
        exitToSideincomeGoalsList();
        return true;
      }
      return false;
    };
  }

  return el;
}
