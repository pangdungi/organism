/**
 * 행복 페이지 - 꿈/부수입과 동일한 KPI 구조
 * 행복 추가 시 탭 형성, KPI 카드, 로그, 할일
 */

import {
  HAPPINESS_KPI_MAP_STORAGE_KEY,
  applyHappinessKpiTimestampsOnSave,
  ensureHappinessMapDefaults,
  HAPPINESS_KPI_GLOBAL_SCOPE_ID,
  isProtectedDefaultHappinessKpiId,
  isDefaultReadingHappinessKpiId,
  DEFAULT_READING_KPI_TODO_LIST_LABEL,
  DEFAULT_READING_KPI_NOTES_TAB_LABEL,
  DEFAULT_READING_KPI_NOTE_FIELD_LABEL,
  READING_KPI_NOTE_MODAL_LABELS,
} from "../utils/happinessKpiMapSupabase.js";
import { ensureHappinessKpiTimeTasksForData } from "../utils/healthKpiTimeTaskSync.js";
import {
  kpiTimeTaskEnsure,
  kpiTimeTaskRemove,
  kpiTimeTaskRename,
  getFullTaskOptions,
} from "../utils/timeTaskOptionsModel.js";
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
  setKpiHistoryBottomTab,
  effectiveKpiHistoryBottomTab,
  kpiUsesDailyTodosOnly,
  kpiHistoryFooterShowsAddButton,
  kpiNotesTabEnabledForKpi,
  KPI_DETAIL_LOGS_UI_ENABLED,
  KPI_BOTTOM_TAB_LOG,
  KPI_BOTTOM_TAB_TODO,
  KPI_BOTTOM_TAB_DAILY,
  KPI_BOTTOM_TAB_NOTES,
} from "../utils/kpiHistoryBottomTabs.js";
import {
  applyKpiGridScrollRestore,
  readKpiGridScrollToRestore,
} from "../utils/kpiGridScrollRestore.js";
import {
  afterKpiTodoListMutationScroll,
  captureKpiDetailScroll,
} from "../utils/kpiTodoInputScroll.js";
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
import { syncKpiTaskCompletionEventOnTodoToggle } from "../utils/kpiTaskCompletionEvents.js";
import { wireKpiDailyTodoListDragReorder } from "../utils/kpiDailyTodoListDragReorder.js";
import {
  mountKpiDetailStackedSections,
  createKpiDetailSectionHeader,
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
import { buildKpiListPaintSignature } from "../utils/kpiListPaintSignature.js";
import { confirmKpiActionDelete } from "../utils/confirmModal.js";
import { showKpiTodoEditModal } from "../utils/kpiTodoEditModal.js";
import { showSideincomeKpiNoteModal } from "../utils/kpiSideincomeNotesModal.js";
import {
  deleteSideincomeKpiNoteOnServer,
  getLocalSideincomeKpiNoteTags,
  getLocalSideincomeKpiNotes,
  groupSideincomeKpiNotesByTag,
  pullSideincomeKpiNotesForKpi,
  saveSideincomeKpiNoteFromModal,
} from "../utils/sideincomeKpiNotesSupabase.js";
import {
  KPI_CARD_EDIT_PENCIL_HTML,
  bindKpiCardEditButton,
} from "../utils/kpiTabNameEditIcon.js";
import { kpiCardHeadHtml, wireKpiCardIconsIn } from "../utils/kpiCardIcon.js";
import { appendKpiCardToGrid } from "../utils/kpiCardDeadlineFoot.js";
import {
  setupKpiCategoryHeaderIcon,
  setKpiCategoryHeaderIconVisible,
} from "../utils/kpiCategoryHeaderIcon.js";
import { sortKpiLogsNewestFirst, getLatestKpiLogWithExplicitValue } from "../utils/kpiLogsSort.js";
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
  mountAppFooterAddButton,
  appendKpiFooterHomeButton,
  clearKpiMapFooterActionButtons,
  getAppFooterActionsSlot,
} from "../utils/appFooterShell.js";
import {
  renderKpiMapSyncLoadingIfNeeded,
  shouldShowKpiMapSyncLoading,
} from "../utils/kpiMapSyncLoadingUi.js";
import {
  KPI_TWOPANE_SPLIT_MQ,
  isKpiTwoPaneSplitViewport,
  kpiTwoPanePlaceholderHtml,
  setKpiFooterBackVisible,
} from "../utils/kpiTwoPaneSplit.js";

const FIXED_TASK_NAMES = new Set(["수면하기", "근무하기"]);

const HAPPINESS_KPI_LIST_SCOPE_ID = HAPPINESS_KPI_GLOBAL_SCOPE_ID;

function happinessKpiInTabScope(kpi) {
  const hid = String(kpi?.happinessId ?? "").trim();
  return !hid || hid === HAPPINESS_KPI_GLOBAL_SCOPE_ID;
}

function getOrderedHappinessTabKpis(data) {
  const all = (data?.kpis || []).filter(happinessKpiInTabScope);
  const order = (data?.kpiOrder || {})[HAPPINESS_KPI_LIST_SCOPE_ID];
  if (!order?.length) return all;
  const orderMap = new Map(order.map((id, i) => [String(id), i]));
  return [...all].sort((a, b) => {
    const ia = orderMap.has(a.id) ? orderMap.get(a.id) : 999;
    const ib = orderMap.has(b.id) ? orderMap.get(b.id) : 999;
    return ia - ib;
  });
}

const KPI_FOOTER_ADD_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>';

function defaultDeletedRefs() {
  return {
    categories: [],
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

function finalizeHappinessMapDefaults(parsed, baseData) {
  const prevKpiIds = new Set((parsed?.kpis || []).map((k) => String(k.id)));
  const data = ensureHappinessMapDefaults(baseData);
  const newKpis = (data.kpis || []).filter((k) => !prevKpiIds.has(String(k.id)));
  const syncChanged = ensureHappinessKpiTimeTasksForData(data);
  const needsSave = newKpis.length > 0 || syncChanged;
  if (needsSave) {
    saveHappinessMap(data, { pushServer: true });
  }
  return data;
}

function loadHappinessMap() {
  const empty = {
    happinesses: [],
    kpis: [],
    kpiLogs: [],
    kpiTodos: [],
    kpiDailyRepeatTodos: [],
    kpiTaskCompletionEvents: [],
    kpiOrder: {},
    kpiTaskSync: {},
    deletedRefs: defaultDeletedRefs(),
  };
  try {
    const raw = readKpiMapScopedStorageRaw(HAPPINESS_KPI_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const kpis = (parsed.kpis || []).map((k) => ({
        ...k,
        needHabitTracker: !!k.needHabitTracker,
        useTimeAsUnit: !!k.useTimeAsUnit,
        direction: k.direction === "lower" ? "lower" : "higher",
      }));
      return finalizeHappinessMapDefaults(parsed, {
        happinesses: parsed.happinesses || [],
        kpis,
        kpiLogs: parsed.kpiLogs || [],
        kpiTodos: parsed.kpiTodos || [],
        kpiDailyRepeatTodos: parsed.kpiDailyRepeatTodos || [],
        kpiTaskCompletionEvents: parsed.kpiTaskCompletionEvents || [],
        kpiOrder: parsed.kpiOrder || {},
        kpiTaskSync: parsed.kpiTaskSync || {},
        deletedRefs:
          parsed.deletedRefs && typeof parsed.deletedRefs === "object"
            ? parsed.deletedRefs
            : defaultDeletedRefs(),
      });
    }
  } catch (_) {}
  return finalizeHappinessMapDefaults(null, empty);
}

function getTaskName(o) {
  return typeof o === "string" ? o : (o?.name || "");
}

function syncKpiToTimeTask(kpi, action, oldName) {
  const data = loadHappinessMap();
  data.kpiTaskSync = data.kpiTaskSync || {};
  if (action === "add") {
    const name = (kpi.name || "").trim();
    if (!name) return;
    data.kpiTaskSync[kpi.id] = name;
    saveHappinessMap(data);
    kpiTimeTaskEnsure(kpi, "happiness");
  } else if (action === "remove") {
    const syncName = (data.kpiTaskSync[kpi.id] || kpi.name || "").trim();
    delete data.kpiTaskSync[kpi.id];
    saveHappinessMap(data);
    kpiTimeTaskRemove(kpi, syncName);
  } else if (action === "update" && oldName) {
    const newName = (kpi.name || "").trim();
    const oldNm = (oldName || "").trim();
    if (!newName || oldNm === newName) return;
    kpiTimeTaskRename(kpi, oldNm);
    data.kpiTaskSync[kpi.id] = newName;
    saveHappinessMap(data);
  }
}

function saveHappinessMap(data, opts) {
  try {
    let prev = null;
    try {
      const raw = readKpiMapScopedStorageRaw(HAPPINESS_KPI_MAP_STORAGE_KEY);
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
    const stamped = applyHappinessKpiTimestampsOnSave(prev, toSave);
    writeKpiMapScopedStorageRaw(HAPPINESS_KPI_MAP_STORAGE_KEY, JSON.stringify(stamped));
    if (opts?.pushServer) {
      try {
        window.dispatchEvent(
          new CustomEvent("happiness-kpi-map-saved", { detail: { pushServer: true } }),
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

export function render() {
  const el = document.createElement("div");
  el.className =
    "app-tab-panel-content dream-view lp-kpi-dream-page happiness-view";

  const header = document.createElement("header");
  header.className = "dream-view-header";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "HAPPINESS";
  const titleRow = document.createElement("div");
  titleRow.className = "dream-view-header-title-row";
  const title = document.createElement("h1");
  title.className = "dream-view-title";
  title.textContent = "행복";
  titleRow.appendChild(title);
  setupKpiCategoryHeaderIcon(titleRow, "happiness");
  header.appendChild(label);
  header.appendChild(titleRow);
  el.appendChild(header);

  const kpiFilterStrip = document.createElement("div");
  kpiFilterStrip.className = "dream-kpi-filter-strip";
  kpiFilterStrip.hidden = true;
  el.appendChild(kpiFilterStrip);

  const contentWrap = document.createElement("div");
  contentWrap.className = "dream-content-wrap";
  el.appendChild(contentWrap);

  const historyWrap = document.createElement("div");
  historyWrap.className = "dream-kpi-history-wrap";
  historyWrap.hidden = true;
  el.appendChild(historyWrap);

  let layoutIsSplit = false;
  /** @type {HTMLElement | null} */
  let paneList = null;
  /** @type {HTMLElement | null} */
  let paneDetail = null;

  let selectedKpiId = null;
  let kpiFilter = "active";
  let happinessViewScreen = "kpis";
  let kpiGridScrollPrevFilter = null;
  let kpiGridScrollPrevScopeId = null;

  function wantsSplitLayout() {
    return isKpiTwoPaneSplitViewport();
  }

  function ensureSplitDom() {
    if (layoutIsSplit && paneList && paneDetail && paneList.isConnected) {
      return;
    }
    historyWrap.hidden = true;
    historyWrap.innerHTML = "";
    if (historyWrap.parentNode !== el) el.appendChild(historyWrap);
    contentWrap.hidden = false;
    contentWrap.className = "dream-content-wrap kpi-twopane-split-shell";
    contentWrap.innerHTML = "";
    paneList = document.createElement("div");
    paneList.className =
      "kpi-twopane-split-pane kpi-twopane-split-pane--list dream-content-wrap";
    paneDetail = document.createElement("div");
    paneDetail.className =
      "kpi-twopane-split-pane kpi-twopane-split-pane--detail dream-content-wrap";
    contentWrap.appendChild(paneList);
    contentWrap.appendChild(paneDetail);
    layoutIsSplit = true;
    el.classList.add("kpi-twopane-view--split");
  }

  function ensureStackDom() {
    if (
      !layoutIsSplit &&
      !contentWrap.classList.contains("kpi-twopane-split-shell")
    ) {
      layoutIsSplit = false;
      el.classList.remove("kpi-twopane-view--split");
      return;
    }
    contentWrap.hidden = false;
    contentWrap.className = "dream-content-wrap";
    contentWrap.innerHTML = "";
    paneList = null;
    paneDetail = null;
    layoutIsSplit = false;
    el.classList.remove("kpi-twopane-view--split");
    if (historyWrap.parentNode !== el) el.appendChild(historyWrap);
  }

  function syncLayoutModeFromViewport() {
    const want = wantsSplitLayout();
    if (
      want === layoutIsSplit &&
      (!want || (paneList && paneList.isConnected))
    ) {
      return want;
    }
    if (want) {
      if (selectedKpiId) happinessViewScreen = "kpiDetail";
      else happinessViewScreen = "kpis";
      ensureSplitDom();
    } else {
      if (selectedKpiId) happinessViewScreen = "kpiDetail";
      else happinessViewScreen = "kpis";
      ensureStackDom();
    }
    return want;
  }

  function listHost() {
    return layoutIsSplit && paneList ? paneList : contentWrap;
  }

  function detailHost() {
    return layoutIsSplit && paneDetail ? paneDetail : contentWrap;
  }

  function paintSplitPlaceholder(container, message) {
    if (!container) return;
    container.innerHTML = kpiTwoPanePlaceholderHtml(message);
  }

  const _happinessUiSession = readKpiUiSession(KPI_UI_SESSION_KEYS.happiness);
  const _happinessInitData = loadHappinessMap();
  const _happinessRestored = restoreKpiTabFromSession(_happinessUiSession, {
    categoryIds: [{ id: HAPPINESS_KPI_LIST_SCOPE_ID }],
    kpis: _happinessInitData.kpis || [],
    foreignKey: "happinessId",
  });
  /* 목록 필터는 항상 진행중부터 (세션 복원하지 않음) */
  kpiFilter = "active";
  selectedKpiId = _happinessRestored.selectedKpiId;
  if (
    _happinessUiSession?.happinessViewScreen === "kpiDetail" &&
    selectedKpiId &&
    (_happinessInitData.kpis || []).some(
      (k) => k.id === selectedKpiId && happinessKpiInTabScope(k),
    )
  ) {
    happinessViewScreen = "kpiDetail";
  } else {
    selectedKpiId = null;
    happinessViewScreen = "kpis";
  }

  function persistKpiUiState() {
    try {
      sessionStorage.setItem(
        KPI_UI_SESSION_KEYS.happiness,
        JSON.stringify({
          tabId: HAPPINESS_KPI_LIST_SCOPE_ID,
          selectedKpiId,
          kpiFilter,
          happinessViewScreen,
        }),
      );
    } catch (_) {}
  }

  function syncHappinessFooterBackLabel() {
    if (!el.isConnected) return;
    const footerBack = document.querySelector("[data-lp-app-footer-back]");
    if (!footerBack) return;
    if (wantsSplitLayout() || layoutIsSplit) {
      setKpiFooterBackVisible(footerBack, false);
      return;
    }
    setKpiFooterBackVisible(footerBack, true);
    if (happinessViewScreen === "kpiDetail") {
      footerBack.title = "행동 목록으로";
      footerBack.setAttribute("aria-label", "행동 목록으로");
    } else {
      footerBack.title = "오늘(메인)으로";
      footerBack.setAttribute("aria-label", "오늘(메인)으로");
    }
  }

  function syncHappinessHeader() {
    if (wantsSplitLayout() || layoutIsSplit) {
      title.textContent = "행복";
      setKpiCategoryHeaderIconVisible(titleRow, true);
      syncHappinessFooterBackLabel();
      return;
    }
    const data = loadHappinessMap();
    if (happinessViewScreen === "kpiDetail" && selectedKpiId) {
      const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
      title.textContent = kpi?.name || "행동";
    } else {
      title.textContent = "행복";
    }
    setKpiCategoryHeaderIconVisible(titleRow, happinessViewScreen !== "kpiDetail");
    syncHappinessFooterBackLabel();
  }

  function enterKpiDetailView(kpiId) {
    if (!kpiId) return;
    selectedKpiId = kpiId;
    happinessViewScreen = "kpiDetail";
    syncHappinessHeader();
    updateHappinessView();
  }

  function exitToKpiList() {
    selectedKpiId = null;
    happinessViewScreen = "kpis";
    syncHappinessHeader();
    updateHappinessView();
    persistKpiUiState();
  }

  function refreshHappinessAfterKpiDataChange(opts = {}) {
    if (happinessViewScreen === "kpiDetail") {
      syncHappinessHeader();
      renderKpiDetailView(opts);
    } else if (happinessViewScreen === "kpis") {
      renderKpiList();
    } else {
      updateHappinessView();
    }
    persistKpiUiState();
  }

  const kpiTimeFormOpts = {
    unitPlaceholder: "권",
    higherPlaceholder: "20",
    lowerPlaceholder: "5",
    timePlaceholder: "1시간 : 01:00 20분 : 00:20",
  };

  function showKpiModal() {
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
              <input type="text" name="name" placeholder="예) 독서하기" />
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
        happinessId: HAPPINESS_KPI_LIST_SCOPE_ID,
        name: (form.name.value || "").trim(),
        direction: "higher",
        ...fields,
        progressStatus: progressStatusForKpiStartDate(
          fields.targetStartDate,
          KPI_PROGRESS_STATUS_DEFAULT,
        ),
      };
      const data = loadHappinessMap();
      data.kpis = data.kpis || [];
      const existingOrder =
        (data.kpiOrder || {})[HAPPINESS_KPI_LIST_SCOPE_ID] ||
        getOrderedHappinessTabKpis(data).map((k) => k.id);
      data.kpis.push(kpi);
      data.kpiOrder = data.kpiOrder || {};
      data.kpiOrder[HAPPINESS_KPI_LIST_SCOPE_ID] = [...existingOrder, kpi.id];
      saveHappinessMap(data, { pushServer: true });
      syncKpiToTimeTask(kpi, "add");
      close();
      refreshHappinessAfterKpiDataChange();
    });
    document.body.appendChild(modal);
    bindKpiGoalModeForm(modal.querySelector(".dream-kpi-form"), null, kpiTimeFormOpts);
  }

  function showKpiEditModal(kpi) {
    const canDeleteKpi = !isProtectedDefaultHappinessKpiId(kpi.id);
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
              <input type="text" name="name" value="${escapeHtml(kpi.name || "")}" placeholder="예) 독서하기" />
            </div>
            ${kpiFormGoalAndTargetSectionHtml(kpi, escapeHtml, kpiTimeFormOpts)}
            ${kpiProgressStatusFieldHtml(kpi, getKpiProgress(kpi))}
            ${
              canDeleteKpi
                ? `<div class="dream-kpi-delete-wrap">
              <button type="button" class="dream-kpi-delete-btn">이 행동 삭제하기</button>
              <p class="dream-kpi-delete-note">삭제 시 복구 불가</p>
            </div>`
                : ""
            }
          </div>
          <div data-legacy="time-task-log-footer">
            <button type="submit" data-legacy="time-task-log-submit">수정</button>
          </div>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);
    modal.querySelector(".dream-kpi-delete-btn")?.addEventListener("click", () => {
      void confirmKpiActionDelete(kpi.name).then((ok) => {
        if (!ok) return;
        syncKpiToTimeTask(kpi, "remove");
        const data = loadHappinessMap();
        appendDeletedRef(data, "kpis", kpi.id);
        data.kpis = (data.kpis || []).filter((k) => k.id !== kpi.id);
        data.kpiLogs = (data.kpiLogs || []).filter((l) => l.kpiId !== kpi.id);
        data.kpiTodos = (data.kpiTodos || []).filter((t) => t.kpiId !== kpi.id);
        data.kpiDailyRepeatTodos = (data.kpiDailyRepeatTodos || []).filter((t) => t.kpiId !== kpi.id);
        const order = (data.kpiOrder || {})[HAPPINESS_KPI_LIST_SCOPE_ID] || [];
        data.kpiOrder = {
          ...data.kpiOrder,
          [HAPPINESS_KPI_LIST_SCOPE_ID]: order.filter((id) => id !== kpi.id),
        };
        saveHappinessMap(data, { pushServer: true });
        close();
        exitToKpiList();
      });
    });
    modal.querySelector(".dream-kpi-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      if (!validateKpiActionForm(form, { sanitizeNumericInput })) return;
      const data = loadHappinessMap();
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
        saveHappinessMap(data, { pushServer: true });
        if (oldName !== target.name) syncKpiToTimeTask(target, "update", oldName);
      }
      close();
      refreshHappinessAfterKpiDataChange();
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


  function clearHappinessKpiFooterActions() {
    clearKpiMapFooterActionButtons();
  }

  function happinessKpiFooterAddLabel(tab, kpi) {
    const t = effectiveKpiHistoryBottomTab(tab, kpi);
    if (t === KPI_BOTTOM_TAB_NOTES) return "위시리스트 추가";
    if (t === KPI_BOTTOM_TAB_TODO) {
      return isDefaultReadingHappinessKpiId(kpi?.id)
        ? "독서 추가"
        : "할 일 추가";
    }
    return "매일 할 일 추가";
  }

  async function runHappinessKpiFooterAddAction() {
    const d = loadHappinessMap();
    const k = (d.kpis || []).find((x) => x.id === selectedKpiId);
    if (!k) return;
    const tab = effectiveKpiHistoryBottomTab(
      getKpiHistoryBottomTab("happiness", selectedKpiId),
      k,
    );
    if (tab === KPI_BOTTOM_TAB_TODO) {
      const readingKpi = isDefaultReadingHappinessKpiId(k.id);
      const text = await showKpiTodoAddModal({
        kpiName: k.name,
        title: readingKpi ? "독서 추가" : undefined,
        inputLabel: readingKpi ? DEFAULT_READING_KPI_TODO_LIST_LABEL : undefined,
        placeholder: readingKpi ? "독서 입력" : "할 일 입력",
        linkedLabel: "연결된 행동",
      });
      if (!text) return;
      const d2 = loadHappinessMap();
      d2.kpiTodos = d2.kpiTodos || [];
      d2.kpiTodos.push({
        id: nextId(),
        kpiId: String(selectedKpiId),
        text,
        completed: false,
      });
      saveHappinessMap(d2, { pushServer: true });
      renderKpiDetailView({ scrollTodoAfterMutation: true });
      return;
    }
    if (tab === KPI_BOTTOM_TAB_DAILY) {
      const text = await showKpiTodoAddModal({
        kpiName: k.name,
        title: "매일 할 일 추가",
        placeholder: "할 일 입력 (매일 반복)",
        linkedLabel: "연결된 행동",
      });
      if (!text) return;
      const d2 = loadHappinessMap();
      d2.kpiDailyRepeatTodos = d2.kpiDailyRepeatTodos || [];
      appendKpiDailyRepeatTodoAtEnd(d2.kpiDailyRepeatTodos, {
        id: nextId(),
        kpiId: String(selectedKpiId),
        text,
        completed: false,
      });
      saveHappinessMap(d2, { pushServer: true });
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
        labels: READING_KPI_NOTE_MODAL_LABELS,
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

  function syncAppFooterHappinessKpiActions() {
    clearHappinessKpiFooterActions();
    const slot = getAppFooterActionsSlot();
    if (!slot) return;

    /* 2분할: 하단은 홈만 (행동·할 일 추가는 목록/상세 안 점선 버튼) */
    if (layoutIsSplit || wantsSplitLayout()) {
      setKpiFooterBackVisible(
        document.querySelector("[data-lp-app-footer-back]"),
        false,
      );
      appendKpiFooterHomeButton(slot);
      return;
    }
    setKpiFooterBackVisible(
      document.querySelector("[data-lp-app-footer-back]"),
      true,
    );

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = APP_FOOTER_ICON_BTN_CLASS;
    addBtn.setAttribute("data-lp-dream-kpi-footer-action", "");
    addBtn.innerHTML = KPI_FOOTER_ADD_ICON;

    if (happinessViewScreen === "kpis") {
      addBtn.title = "행동 추가";
      addBtn.setAttribute("aria-label", "행동 추가");
      addBtn.addEventListener("click", () => {
        showKpiModal();
      });
      appendKpiFooterHomeButton(slot);
      slot.appendChild(mountAppFooterAddButton(addBtn));
      return;
    }

    if (happinessViewScreen !== "kpiDetail" || !selectedKpiId) return;
    const data = loadHappinessMap();
    const kpiNow = (data.kpis || []).find((k) => k.id === selectedKpiId);
    if (!kpiNow || !happinessKpiInTabScope(kpiNow)) return;
    const tab = getKpiHistoryBottomTab("happiness", selectedKpiId);
    if (!kpiHistoryFooterShowsAddButton(tab, kpiNow)) {
      appendKpiFooterHomeButton(slot);
      return;
    }
    const addLabel = happinessKpiFooterAddLabel(tab, kpiNow);
    addBtn.title = addLabel;
    addBtn.setAttribute("aria-label", addLabel);
    addBtn.addEventListener("click", () => {
      void runHappinessKpiFooterAddAction();
    });
    appendKpiFooterHomeButton(slot);
    slot.appendChild(mountAppFooterAddButton(addBtn));
  }

  function getKpiLogs(kpiId) {
    const data = loadHappinessMap();
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

  function reorderKpis(orderedKpiIds) {
    const data = loadHappinessMap();
    data.kpiOrder = data.kpiOrder || {};
    data.kpiOrder[HAPPINESS_KPI_LIST_SCOPE_ID] = orderedKpiIds;
    saveHappinessMap(data);
  }

  function getAccumulatedKpiValue(kpiId) {
    const logs = getKpiLogs(kpiId);
    return logs.reduce((sum, log) => sum + parseNum(log.value), 0);
  }

  function getKpiProgress(kpi) {
    const result = computeKpiProgress(kpi, {
      toDateKey,
      getAllKpiLogs: () => loadHappinessMap().kpiLogs || [],
      getAccumulatedKpiValue,
      getKpiTodos: (kpiId) =>
        (loadHappinessMap().kpiTodos || []).filter((t) => t.kpiId === kpiId),
      getKpiTaskCompletionEvents: (kpiId) =>
        (loadHappinessMap().kpiTaskCompletionEvents || []).filter(
          (e) => String(e.kpiId) === String(kpiId),
        ),
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

  function computeHappinessKpiListPaintSig() {
    const data = loadHappinessMap();
    const happinessKpis = getOrderedHappinessTabKpis(data);
    const progressByKpiId = new Map();
    const progressFor = (kpi) => {
      const id = String(kpi?.id ?? "");
      if (!progressByKpiId.has(id)) {
        progressByKpiId.set(id, getKpiProgress(kpi));
      }
      return progressByKpiId.get(id);
    };
    return buildKpiListPaintSignature(
      happinessKpis,
      kpiFilter,
      progressFor,
      "happiness",
    );
  }

  let lastHappinessKpiListPaintSig = "";
  let lastKpiMapPaintSig = "";

  function hideKpiFilterStrip() {
    kpiFilterStrip.hidden = true;
    kpiFilterStrip.replaceChildren();
  }

  function renderKpiFilterStrip() {
    hideKpiFilterStrip();
    kpiFilterStrip.hidden = false;
    const filterBar = document.createElement("div");
    filterBar.className = "dream-kpi-filter-bar";
    filterBar.innerHTML = kpiProgressStatusFilterBarHtml(kpiFilter);
    filterBar.querySelectorAll('input[name="kpi-filter"]').forEach((input) => {
      input.addEventListener("change", () => {
        kpiFilter = normalizeKpiListFilter(input.dataset.filter);
        renderKpiList();
      });
    });
    kpiFilterStrip.appendChild(filterBar);
  }

  function renderKpiList(host) {
    /* 목록·필터(진행 전/진행중/완료)는 로컬 데이터로 즉시 그림. 습관 연동 sync 는 탭 pull·기록 저장 시에만 */
    const container = host || listHost();
    if (!container) return;
    const inSplitPane = layoutIsSplit && container !== contentWrap;
    const scopeId = HAPPINESS_KPI_LIST_SCOPE_ID;
    const savedGridScroll = readKpiGridScrollToRestore(
      container,
      kpiFilter,
      scopeId,
      kpiGridScrollPrevFilter,
      kpiGridScrollPrevScopeId,
    );
    historyWrap.hidden = true;
    historyWrap.innerHTML = "";
    if (historyWrap.parentNode !== el) el.appendChild(historyWrap);
    if (!inSplitPane) {
      contentWrap.hidden = false;
      contentWrap.className = "dream-content-wrap";
    } else {
      container.className =
        "kpi-twopane-split-pane kpi-twopane-split-pane--list dream-content-wrap";
    }
    container.innerHTML = "";
    hideKpiFilterStrip();
    const data = loadHappinessMap();
    const happinessKpis = getOrderedHappinessTabKpis(data);
    const progressByKpiId = new Map();
    const progressFor = (kpi) => {
      const id = String(kpi?.id ?? "");
      if (!progressByKpiId.has(id)) {
        progressByKpiId.set(id, getKpiProgress(kpi));
      }
      return progressByKpiId.get(id);
    };

    if (
      renderKpiMapSyncLoadingIfNeeded({
        tabId: "happiness",
        container,
        isEmpty: happinessKpis.length === 0,
        onLoading: () => {
          historyWrap.hidden = true;
          el.appendChild(historyWrap);
          syncAppFooterHappinessKpiActions();
        },
      })
    ) {
      return;
    }

    let autoCompleted = false;
    for (const k of happinessKpis) {
      if (applyAutoCompleteManualKpiIfNeeded(k, progressFor(k))) {
        autoCompleted = true;
      }
    }
    if (autoCompleted) {
      queueMicrotask(() => saveHappinessMap(data, { pushServer: true }));
    }

    renderKpiFilterStrip();

    const grid = document.createElement("div");
    grid.className = "dream-kpi-grid";
    const listToShow = filterKpisByProgressStatus(
      happinessKpis,
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
      const { displayProgress, progressText, heroStr, heroUnit, cardExtraClass, hideProgressFill, hideProgressBar, heroPrefix, heroStreakAsideHtml } =
        buildKpiCardTimePresentation(kpi, progressResult, formatNum);
      const card = document.createElement("div");
      card.className =
        "dream-kpi-card" +
        (lowerBetter ? " dream-kpi-card--lower-better" : "") +
        cardExtraClass;
      card.dataset.kpiId = kpi.id;
      card.draggable = true;
      const nameHtml = `${escapeHtml(kpi.name)}${lowerBetter ? '<span class="dream-kpi-card-direction-badge" title="낮을수록 좋음 행동">↓낮음</span>' : ""}`;
      const progressHtml = hideProgressBar
        ? `<div class="dream-kpi-card-progress dream-kpi-card-progress--habit"><div class="dream-kpi-card-progress-text">${escapeHtml(progressText)}</div></div>`
        : `<div class="dream-kpi-card-progress">
            <div class="dream-kpi-card-progress-bar${hideProgressFill ? " dream-kpi-card-progress-bar--empty" : ""}"><div class="dream-kpi-card-progress-fill" style="width:${hideProgressFill ? 0 : displayProgress}%"></div></div>
            <div class="dream-kpi-card-progress-text">${escapeHtml(progressText)}</div>
          </div>`;
      card.innerHTML = `
        <div class="dream-kpi-card-inner">
          ${KPI_CARD_EDIT_PENCIL_HTML}
          ${kpiCardHeadHtml(kpi, "happiness", nameHtml)}
          <div class="dream-kpi-card-target-num${heroStreakAsideHtml ? " dream-kpi-card-target-num--habit-unit" : ""}">${formatKpiCardHeroHtml(lowerBetter, heroStr, heroUnit, heroPrefix)}${heroStreakAsideHtml || ""}</div>
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
        const newOrder = happinessKpis.map((k) => k.id);
        const fromIdx = newOrder.indexOf(draggedId);
        const toIdx = newOrder.indexOf(kpi.id);
        if (fromIdx >= 0 && toIdx >= 0) {
          newOrder.splice(fromIdx, 1);
          newOrder.splice(toIdx, 0, draggedId);
          reorderKpis(newOrder);
          renderKpiList(container);
        }
      });
      appendKpiCardToGrid(grid, card, kpi, escapeHtml);
    });
    /* 2분할만: 목록 끝 점선 「행동 추가하기」 — 시급과 같이 그리드 안(카드와 동일 너비·간격) */
    if (layoutIsSplit) {
      const addCard = document.createElement("button");
      addCard.type = "button";
      addCard.className = "dream-kpi-add-card";
      addCard.innerHTML =
        '<span class="dream-kpi-add-card-text">+ 행동 추가하기</span>';
      addCard.addEventListener("click", () => showKpiModal());
      grid.appendChild(addCard);
    }
    wireKpiCardIconsIn(grid);
    grid.addEventListener("dragend", () => {
      grid.querySelectorAll(".dream-kpi-card-drag-over").forEach((c) => c.classList.remove("dream-kpi-card-drag-over"));
    });
    container.appendChild(grid);

    applyKpiGridScrollRestore(container, savedGridScroll);
    kpiGridScrollPrevFilter = kpiFilter;
    kpiGridScrollPrevScopeId = scopeId;
    persistKpiUiState();
    syncAppFooterHappinessKpiActions();
    lastHappinessKpiListPaintSig = computeHappinessKpiListPaintSig();
  }


  function renderKpiDetailView(opts = {}) {
    const container = opts.target || detailHost();
    if (!container) return;
    const inSplitPane = layoutIsSplit && container !== contentWrap;
    /* 2분할에서는 목록 위 필터를 유지 */
    if (!inSplitPane) hideKpiFilterStrip();

    if (!inSplitPane) {
      contentWrap.hidden = false;
      contentWrap.className = "dream-content-wrap dream-kpi-detail-wrap";
    } else {
      container.className =
        "kpi-twopane-split-pane kpi-twopane-split-pane--detail dream-content-wrap dream-kpi-detail-wrap";
    }
    if (!selectedKpiId) {
      if (inSplitPane) {
        paintSplitPlaceholder(container, "행동을 선택해 주세요");
        syncAppFooterHappinessKpiActions();
        persistKpiUiState();
        return;
      }
      container.innerHTML = "";
      exitToKpiList();
      return;
    }
    void renderKpiHistory({ ...opts, target: container });
    syncAppFooterHappinessKpiActions();
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
      syncAppFooterHappinessKpiActions();
      return;
    }
    const data = loadHappinessMap();
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
    const readingKpi = isDefaultReadingHappinessKpiId(selKpi);
    const todoSegLabel = readingKpi
      ? DEFAULT_READING_KPI_TODO_LIST_LABEL
      : "할 일";
    const readingNotesUi = kpiNotesTabEnabledForKpi("happiness", selKpi);
    const useKpiSegBar = KPI_DETAIL_LOGS_UI_ENABLED || readingNotesUi;

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

    const appendReadingKpiNotesPanel = (parentEl, kpiIdForNotes, kpiNameForModal) => {
      parentEl.replaceChildren();
      const kid = String(kpiIdForNotes || selectedKpiId || "").trim();
      const tags = getLocalSideincomeKpiNoteTags(kid);
      const notes = getLocalSideincomeKpiNotes(kid);
      const groups = groupSideincomeKpiNotesByTag(kid, notes, tags);
      if (!groups.length) {
        const empty = document.createElement("p");
        empty.className = "dream-kpi-history-empty";
        empty.textContent = "아직 위시리스트가 없습니다.";
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
        chip.textContent =
          String(tag.label || "").trim() || DEFAULT_READING_KPI_NOTE_FIELD_LABEL;
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
              labels: READING_KPI_NOTE_MODAL_LABELS,
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
      segBar.setAttribute(
        "aria-label",
        readingNotesUi
          ? "읽을 예정·위시리스트 전환"
          : "할 일·매일 할 일·로그 전환",
      );
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
    if (readingNotesUi) {
      btnSegNotes = document.createElement("button");
      btnSegNotes.type = "button";
      btnSegNotes.className = "dream-kpi-bottom-seg-btn";
      btnSegNotes.textContent = DEFAULT_READING_KPI_NOTES_TAB_LABEL;
      btnSegNotes.setAttribute("role", "tab");

      panelNotesSeg = document.createElement("div");
      panelNotesSeg.className =
        "dream-kpi-bottom-seg-panel dream-kpi-bottom-seg-panel--notes";
      panelNotesSeg.setAttribute("role", "tabpanel");
      appendReadingKpiNotesPanel(
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
          initialText: todo.text || "",
          title: readingKpi ? "독서 수정" : "할 일 수정",
          inputLabel: readingKpi ? DEFAULT_READING_KPI_TODO_LIST_LABEL : undefined,
          placeholder: readingKpi ? "독서 입력" : undefined,
          linkedLabel: "연결된 행동",
        });
        if (!result) return;
        if (result.action === "delete") {
          const d = loadHappinessMap();
          kpiTodoLifecycleLog("행복KPI탭_모달삭제", {
            todoId: String(todo.id),
            삭제전: kpiTodoSnapshotBrief(d),
            삭제전dr: deletedRefsKpiTodosLen(d),
          });
          appendDeletedRef(d, "kpiTodos", todo.id);
          d.kpiTodos = (d.kpiTodos || []).filter((x) => x.id !== todo.id);
          saveHappinessMap(d, { pushServer: true });
          const after = loadHappinessMap();
          kpiTodoLifecycleLog("행복KPI탭_모달삭제_saveHappinessMap후", {
            todoId: String(todo.id),
            삭제후: kpiTodoSnapshotBrief(after),
            삭제후dr: deletedRefsKpiTodosLen(after),
          });
          renderKpiDetailView({ scrollTodoAfterMutation: true });
          return;
        }
        const d = loadHappinessMap();
        const row = (d.kpiTodos || []).find((x) => x.id === todo.id);
        if (!row) return;
        row.text = result.text;
        saveHappinessMap(d, { pushServer: true });
        renderKpiDetailView({ scrollTodoAfterMutation: true });
      };

      item.addEventListener("click", async (e) => {
        if (e.target.closest(".dream-kpi-todo-check-wrap")) return;
        await openTodoEdit();
      });

      check.addEventListener("change", () => {
        const d = loadHappinessMap();
        const t = d.kpiTodos.find((x) => x.id === todo.id);
        if (t) {
          const wasCompleted = !!t.completed;
          kpiTodoLifecycleLog("행복KPI탭_체크_완료토글", {
            todoId: String(todo.id),
            이전완료: wasCompleted,
            요청완료: !!check.checked,
          });
          t.completed = !!check.checked;
          syncKpiTaskCompletionEventOnTodoToggle(
            d,
            kpi,
            String(todo.id),
            !!check.checked,
            wasCompleted,
          );
          saveHappinessMap(d, { pushServer: true });
          kpiTodoLifecycleLog("행복KPI탭_체크_save후", {
            todoId: String(todo.id),
            completion: kpiTodosCompletionBrief(loadHappinessMap(), 20),
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
        setKpiHistoryBottomTab("happiness", selKpi, KPI_BOTTOM_TAB_TODO);
        void runHappinessKpiFooterAddAction();
      });
      panelTodoSeg.appendChild(todoAddCard);
    }
    if (todos.length === 0) {
      const emptyTodo = document.createElement("p");
      emptyTodo.className = "dream-kpi-history-empty";
      emptyTodo.textContent = readingKpi
        ? "등록된 읽을 예정이 없습니다."
        : "등록된 할 일이 없습니다.";
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
          loadMap: loadHappinessMap,
          saveMap: saveHappinessMap,
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
            initialText: todo.text || "",
            title: "매일 할 일 수정",
            placeholder: "매일 반복되는 할 일",
            linkedLabel: "연결된 행동",
          });
          if (!result) return;
          if (result.action === "delete") {
            const d = loadHappinessMap();
            appendDeletedRef(d, "kpiDailyRepeatTodos", todo.id);
            d.kpiDailyRepeatTodos = (d.kpiDailyRepeatTodos || []).filter((x) => x.id !== todo.id);
            saveHappinessMap(d, { pushServer: true });
            renderKpiDetailView({ scrollTodoAfterMutation: true });
            return;
          }
          const d = loadHappinessMap();
          const row = (d.kpiDailyRepeatTodos || []).find((x) => x.id === todo.id);
          if (!row) return;
          row.text = result.text;
          saveHappinessMap(d, { pushServer: true });
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
        loadMap: loadHappinessMap,
        saveMap: saveHappinessMap,
      });
      if (layoutIsSplit) {
        const dailyAddCard = document.createElement("button");
        dailyAddCard.type = "button";
        dailyAddCard.className =
          "dream-kpi-add-card sideincome-split-todo-add-card";
        dailyAddCard.innerHTML =
          '<span class="dream-kpi-add-card-text">매일 할 일 추가하기</span>';
        dailyAddCard.addEventListener("click", () => {
          setKpiHistoryBottomTab("happiness", selKpi, KPI_BOTTOM_TAB_DAILY);
          void runHappinessKpiFooterAddAction();
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
      loadMap: loadHappinessMap,
      saveMap: saveHappinessMap,
      appendDeletedRef,
      onAfterDelete: () => renderKpiDetailView({ scrollTodoAfterMutation: true }),
    };

    if (useKpiSegBar && segBar) {
      /* 2분할: 할 일 추가는 목록 상단 점선 카드, 세그 바에는 휴지통 없음 */
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
        "happiness",
        selectedKpiId,
        btnSegLog,
        dailyTodosOnly ? null : btnSegTodo,
        btnSegDaily,
        panelLogSeg,
        dailyTodosOnly ? null : panelTodoSeg,
        panelDailySeg,
        hasDailyTab,
        (tab) => {
          syncAppFooterHappinessKpiActions();
          syncSegClearCompletedTrashVisibility(tab);
          if (tab === KPI_BOTTOM_TAB_NOTES && selectedKpiId && panelNotesSeg) {
            void pullSideincomeKpiNotesForKpi(String(selectedKpiId)).then(() => {
              if (!panelNotesSeg.isConnected) return;
              appendReadingKpiNotesPanel(
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
      target.appendChild(createKpiDetailSectionHeader(todoSegLabel));
      target.appendChild(panelTodoSeg);
      if (hasDailyTab && panelDailySeg) {
        panelDailySeg.querySelector(".dream-kpi-todo-header")?.remove();
        panelDailySeg.querySelector(".dream-kpi-todo-divider")?.remove();
        target.appendChild(
          createKpiDetailSectionHeader("매일 반복되는 할일 목록"),
        );
        target.appendChild(panelDailySeg);
      }
    } else {
      mountKpiDetailStackedSections(target, {
        namespace: "happiness",
        kpiId: selKpi,
        todoPanel: panelTodoSeg,
        dailyPanel: panelDailySeg,
        dailyTodosOnly,
        hasDailyTab,
        todoTitle: todoSegLabel,
        clearCompleted: clearCompletedOpts,
      });
    }
    if (scrollTodoAfterMutation) {
      afterKpiTodoListMutationScroll(target, scrollSnap);
    }
    syncAppFooterHappinessKpiActions();

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

  function updateHappinessView() {
    syncLayoutModeFromViewport();
    syncHappinessHeader();
    historyWrap.hidden = true;
    historyWrap.innerHTML = "";
    if (layoutIsSplit) {
      renderKpiList(paneList);
      if (selectedKpiId) renderKpiDetailView({ target: paneDetail });
      else paintSplitPlaceholder(paneDetail, "행동을 선택해 주세요");
      syncAppFooterHappinessKpiActions();
      persistKpiUiState();
      return;
    }
    if (happinessViewScreen === "kpiDetail" && selectedKpiId) {
      renderKpiDetailView();
    } else {
      if (happinessViewScreen === "kpiDetail") {
        happinessViewScreen = "kpis";
        selectedKpiId = null;
      }
      contentWrap.hidden = false;
      contentWrap.className = "dream-content-wrap";
      renderKpiList();
    }
    persistKpiUiState();
  }

  function reconcileScopeWithStoredMap(data) {
    const kpis = data?.kpis || [];
    if (selectedKpiId && !kpis.some((k) => k.id === selectedKpiId)) {
      selectedKpiId = null;
      if (happinessViewScreen === "kpiDetail") happinessViewScreen = "kpis";
    }
    if (happinessViewScreen === "goals") happinessViewScreen = "kpis";
  }

  reconcileScopeWithStoredMap(_happinessInitData);
  syncHappinessHeader();
  updateHappinessView();
  if (happinessViewScreen !== "kpis") {
    lastKpiMapPaintSig = readKpiMapLocalStorageSignature(
      HAPPINESS_KPI_MAP_STORAGE_KEY,
    );
  }

  function syncHappinessUiFromStoredMap() {
    if (!el.isConnected) return;
    if (happinessViewScreen === "kpis") {
      const nextPaint = computeHappinessKpiListPaintSig();
      if (nextPaint === lastHappinessKpiListPaintSig) return;
      lastHappinessKpiListPaintSig = nextPaint;
    } else {
      const nextSig = readKpiMapLocalStorageSignature(
        HAPPINESS_KPI_MAP_STORAGE_KEY,
      );
      if (nextSig === lastKpiMapPaintSig) return;
      lastKpiMapPaintSig = nextSig;
    }
    const data = loadHappinessMap();
    if (happinessViewScreen === "goals") happinessViewScreen = "kpis";
    if (selectedKpiId && !data.kpis.some((k) => k.id === selectedKpiId)) {
      selectedKpiId = null;
      if (happinessViewScreen === "kpiDetail") happinessViewScreen = "kpis";
    }
    syncHappinessHeader();
    updateHappinessView();
    persistKpiUiState();
  }

  const onMergedSync = (e) => {
    if (!el.isConnected) return;
    /* push 시에는 화면 갱신 불필요 (로컬 변경을 서버에 올린 것이므로) */
    if (e.detail?.fromPush) return;
    if (!e.detail?.fromServerMerge && !e.detail?.fromLocalWrite) return;
    syncHappinessUiFromStoredMap();
  };
  window.addEventListener("happiness-kpi-map-saved", onMergedSync);
  window.addEventListener("lp-kpi-tab-pull-settled", (e) => {
    if (!el.isConnected || e.detail?.tabId !== "happiness") return;
    syncHappinessUiFromStoredMap();
  });
  window.__lpHappinessSoftRefresh = syncHappinessUiFromStoredMap;
  window.__lpHappinessFooterBack = () => {
    if (!el.isConnected) return false;
    if (wantsSplitLayout() || layoutIsSplit) return false;
    if (happinessViewScreen === "kpiDetail") {
      exitToKpiList();
      return true;
    }
    return false;
  };

  /** @type {MediaQueryList | null} */
  let splitMql = null;
  function onSplitViewportChange() {
    if (!el.isConnected) return;
    updateHappinessView();
  }
  try {
    splitMql = window.matchMedia(KPI_TWOPANE_SPLIT_MQ);
    if (splitMql.addEventListener) {
      splitMql.addEventListener("change", onSplitViewportChange);
    } else if (splitMql.addListener) {
      splitMql.addListener(onSplitViewportChange);
    }
  } catch (_) {
    splitMql = null;
  }

  return el;
}
