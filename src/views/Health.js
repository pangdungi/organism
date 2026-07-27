/**
 * 건강 페이지 — 건강 목표와 KPI를 한 화면에 표시 (KPI는 목표별 귀속 없음)
 */

import {
  HEALTH_KPI_MAP_STORAGE_KEY,
  HEALTH_KPI_GLOBAL_SCOPE_ID,
  applyHealthKpiTimestampsOnSave,
  ensureDefaultHealthMapDefaults,
  DEFAULT_AEROBIC_KPI_ID,
  DEFAULT_CHECKUP_KPI_ID,
  DEFAULT_SUPPLEMENT_KPI_ID,
  DEFAULT_SLEEP_HEALTH_GOAL_ID,
  isProtectedDefaultHealthGoalId,
  isProtectedDefaultHealthKpiId,
} from "../utils/healthKpiMapSupabase.js";
import {
  kpiTimeTaskEnsure,
  kpiTimeTaskRemove,
  kpiTimeTaskRename,
} from "../utils/timeTaskOptionsModel.js";
import { ensureHealthKpiTimeTasksForData } from "../utils/healthKpiTimeTaskSync.js";
import {
  buildModalNativeDateFieldMarkup,
  initModalNativeDateFieldsIn,
} from "../utils/modalNativeDateField.js";
import {
  afterKpiTodoListMutationScroll,
  captureKpiDetailScroll,
} from "../utils/kpiTodoInputScroll.js";
import { minutesToHhMm, syncHabitTrackerLogs } from "../utils/timeKpiSync.js";
import { syncSleepHealthGoalLogsFromTimeLedger } from "../utils/healthSleepGoalTimeLedgerSync.js";
import { ensureTimeLedgerStorageReady } from "../utils/timeLedgerEntriesModel.js";
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
  setKpiHistoryBottomTab,
  effectiveKpiHistoryBottomTab,
  kpiUsesDailyTodosOnly,
  kpiHistoryFooterShowsAddButton,
  KPI_DETAIL_LOGS_UI_ENABLED,
  KPI_BOTTOM_TAB_LOG,
  KPI_BOTTOM_TAB_TODO,
  KPI_BOTTOM_TAB_DAILY,
} from "../utils/kpiHistoryBottomTabs.js";
import {
  applyKpiGridScrollRestore,
  readKpiGridScrollToRestore,
} from "../utils/kpiGridScrollRestore.js";
import {
  KPI_UI_SESSION_KEYS,
  readKpiUiSession,
  writeKpiUiSession,
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
import {
  KPI_CARD_EDIT_PENCIL_HTML,
  HEALTH_GOAL_EDIT_PENCIL_HTML,
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
import { resolveLpModalStackZIndex } from "../utils/lpModalStack.js";
import {
  buildHealthGoalChartPoints,
  buildHealthGoalChartCaption,
  filterHealthGoalChartPoints,
  HEALTH_GOAL_CHART_RANGES,
  renderHealthGoalLineChart,
} from "../utils/healthGoalLogChart.js";
import {
  KPI_TWOPANE_SPLIT_MQ,
  isKpiTwoPaneSplitViewport,
  kpiTwoPanePlaceholderHtml,
  setKpiFooterBackVisible,
} from "../utils/kpiTwoPaneSplit.js";

const FIXED_TASK_NAMES = new Set(["수면하기", "근무하기"]);

const KPI_FOOTER_ADD_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>';

const HEALTH_KPI_LIST_SCOPE_ID = "__all__";

function isHealthCheckupKpi(kpi) {
  return String(kpi?.id ?? "") === DEFAULT_CHECKUP_KPI_ID;
}

function isHealthSupplementKpi(kpi) {
  return String(kpi?.id ?? "") === DEFAULT_SUPPLEMENT_KPI_ID;
}

function healthKpiDailyTabLabel(kpi) {
  if (isHealthSupplementKpi(kpi)) return "보충제 목록";
  return "매일할일";
}

function healthKpiDailyListTitle(kpi) {
  if (isHealthSupplementKpi(kpi)) return "보충제 목록";
  return "매일 반복되는 할일 목록";
}

function isHealthFixedGoalModeKpi(kpi) {
  const id = String(kpi?.id ?? "");
  return id === DEFAULT_SUPPLEMENT_KPI_ID || id === DEFAULT_CHECKUP_KPI_ID;
}

function getOrderedAllHealthKpis(data) {
  const kpis = data.kpis || [];
  const orderKeys = [
    HEALTH_KPI_GLOBAL_SCOPE_ID,
    ...(data.healths || []).map((h) => h.id),
  ];
  const seen = new Set();
  const orderedIds = [];
  for (const key of orderKeys) {
    for (const id of (data.kpiOrder || {})[key] || []) {
      if (seen.has(id)) continue;
      if (kpis.some((k) => k.id === id)) {
        orderedIds.push(id);
        seen.add(id);
      }
    }
  }
  for (const k of kpis) {
    if (!seen.has(k.id)) orderedIds.push(k.id);
  }
  return orderedIds.map((id) => kpis.find((k) => k.id === id)).filter(Boolean);
}

function removeKpiIdFromKpiOrders(data, kpiId) {
  const next = { ...(data.kpiOrder || {}) };
  for (const key of Object.keys(next)) {
    next[key] = (next[key] || []).filter((id) => id !== kpiId);
  }
  data.kpiOrder = next;
}

function normalizeHealthGoal(h) {
  if (!h || typeof h !== "object") return h;
  const hasLegacy =
    !!String(h.targetValue ?? "").trim() || !!String(h.unit ?? "").trim();
  const trackTargetValue =
    h.trackTargetValue != null ? !!h.trackTargetValue : hasLegacy;
  return {
    ...h,
    trackTargetValue,
    targetValue: trackTargetValue ? String(h.targetValue ?? "").trim() : "",
    unit: trackTargetValue ? String(h.unit ?? "").trim() : "",
  };
}

function healthGoalTargetFieldsMarkup(health, escapeHtmlFn) {
  const h = health ? normalizeHealthGoal(health) : null;
  const defaultTrackOnAdd = !h;
  const checked =
    h?.trackTargetValue || defaultTrackOnAdd ? " checked" : "";
  const hidden =
    h?.trackTargetValue || defaultTrackOnAdd ? "" : " hidden";
  const targetVal = escapeHtmlFn(h?.targetValue || "");
  const unitVal = escapeHtmlFn(h?.unit || "");
  return `
    <div class="dream-kpi-field dream-kpi-field-checkbox" data-legacy="time-add-task-field">
      <label class="dream-kpi-checkbox-label">
        목표값·단위 입력하기
        <input type="checkbox" name="trackTargetValue"${checked} />
      </label>
    </div>
    <div class="health-goal-target-fields${hidden}" data-legacy="time-add-task-field">
      <div class="dream-kpi-field">
        <label>목표값</label>
        <input type="text" name="targetValue" value="${targetVal}" placeholder="예) 60" inputmode="decimal" />
      </div>
      <div class="dream-kpi-field">
        <label>단위</label>
        <input type="text" name="unit" value="${unitVal}" placeholder="예) kg" />
      </div>
    </div>
  `;
}

function bindHealthGoalTargetFields(form) {
  if (!form) return;
  const trackCheck = form.querySelector('input[name="trackTargetValue"]');
  const fieldsWrap = form.querySelector(".health-goal-target-fields");
  const valueInput = form.querySelector('input[name="targetValue"]');
  const sync = () => {
    const on = !!trackCheck?.checked;
    if (fieldsWrap) fieldsWrap.hidden = !on;
    if (valueInput) {
      if (on) valueInput.setAttribute("inputmode", "decimal");
      else valueInput.removeAttribute("inputmode");
    }
  };
  trackCheck?.addEventListener("change", sync);
  sync();
  setupNumericOnlyInput(valueInput);
}

function readHealthGoalTargetFields(form) {
  const targetValue = sanitizeNumericInput(form.targetValue?.value) || "";
  const unit = (form.unit?.value || "").trim();
  const trackChecked = !!form.querySelector('input[name="trackTargetValue"]')?.checked;
  const trackTargetValue = trackChecked || !!targetValue || !!unit;
  if (!trackTargetValue) {
    return { trackTargetValue: false, targetValue: "", unit: "" };
  }
  return {
    trackTargetValue: true,
    targetValue,
    unit,
  };
}

function parseHealthGoalNum(str) {
  const n = parseFloat(String(str || "").replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function formatHealthGoalNum(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getLatestHealthGoalLog(logs) {
  const sorted = [...(logs || [])].sort((a, b) =>
    (b.dateRaw || b.date || "").localeCompare(a.dateRaw || a.date || ""),
  );
  return sorted[0] || null;
}

function defaultDeletedRefs() {
  return {
    categories: [],
    healthGoalLogs: [],
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

function finalizeHealthMapDefaults(parsed, baseData) {
  const prevHealthCount = (parsed?.healths || []).length;
  const prevKpiIds = new Set((parsed?.kpis || []).map((k) => String(k.id)));
  const hadAerobic = prevKpiIds.has(DEFAULT_AEROBIC_KPI_ID);
  const prevAerobicSyncName = String(
    parsed?.kpiTaskSync?.[DEFAULT_AEROBIC_KPI_ID] || "유산소 운동",
  ).trim();
  const data = ensureDefaultHealthMapDefaults(baseData);
  const newKpis = (data.kpis || []).filter((k) => !prevKpiIds.has(String(k.id)));
  const aerobicRemoved =
    hadAerobic &&
    !(data.kpis || []).some((k) => String(k.id) === DEFAULT_AEROBIC_KPI_ID);
  const prevDeletedHadAerobic = (
    Array.isArray(parsed?.deletedRefs?.kpis) ? parsed.deletedRefs.kpis : []
  )
    .map(String)
    .includes(DEFAULT_AEROBIC_KPI_ID);
  const aerobicMarkedDeleted =
    (data.deletedRefs?.kpis || []).map(String).includes(DEFAULT_AEROBIC_KPI_ID) &&
    !prevDeletedHadAerobic;
  const syncChanged = ensureHealthKpiTimeTasksForData(data);
  const needsSave =
    (data.healths || []).length > prevHealthCount ||
    newKpis.length > 0 ||
    aerobicRemoved ||
    aerobicMarkedDeleted ||
    syncChanged;
  if (aerobicRemoved) {
    try {
      kpiTimeTaskRemove(
        { id: DEFAULT_AEROBIC_KPI_ID, name: prevAerobicSyncName || "유산소 운동" },
        prevAerobicSyncName || "유산소 운동",
      );
    } catch (_) {}
  }
  if (needsSave) {
    saveHealthMap(data, { pushServer: true });
  }
  return data;
}

function loadHealthMap() {
  const empty = {
    healths: [],
    healthGoalLogs: [],
    kpis: [],
    kpiLogs: [],
    kpiTodos: [],
    kpiDailyRepeatTodos: [],
    kpiOrder: {},
    kpiTaskSync: {},
    deletedRefs: defaultDeletedRefs(),
  };
  try {
    const raw = readKpiMapScopedStorageRaw(HEALTH_KPI_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const kpis = (parsed.kpis || []).map((k) => ({
        ...k,
        needHabitTracker: !!k.needHabitTracker,
        useTimeAsUnit: !!k.useTimeAsUnit,
        useTaskCompletionGoal: !!k.useTaskCompletionGoal,
        direction: k.direction === "lower" ? "lower" : "higher",
      }));
      return finalizeHealthMapDefaults(parsed, {
        healths: (parsed.healths || []).map(normalizeHealthGoal),
        healthGoalLogs: parsed.healthGoalLogs || [],
        kpis,
        kpiLogs: parsed.kpiLogs || [],
        kpiTodos: parsed.kpiTodos || [],
        kpiDailyRepeatTodos: parsed.kpiDailyRepeatTodos || [],
        kpiOrder: parsed.kpiOrder || {},
        kpiTaskSync: parsed.kpiTaskSync || {},
        deletedRefs:
          parsed.deletedRefs && typeof parsed.deletedRefs === "object"
            ? parsed.deletedRefs
            : defaultDeletedRefs(),
      });
    }
  } catch (_) {}
  return finalizeHealthMapDefaults(null, empty);
}

function syncKpiToTimeTask(kpi, action, oldName) {
  const data = loadHealthMap();
  data.kpiTaskSync = data.kpiTaskSync || {};
  if (action === "add") {
    const name = (kpi.name || "").trim();
    if (!name) return;
    data.kpiTaskSync[kpi.id] = name;
    saveHealthMap(data);
    kpiTimeTaskEnsure(kpi, "health");
  } else if (action === "remove") {
    const syncName = (data.kpiTaskSync[kpi.id] || kpi.name || "").trim();
    delete data.kpiTaskSync[kpi.id];
    saveHealthMap(data);
    kpiTimeTaskRemove(kpi, syncName);
  } else if (action === "update" && oldName) {
    const newName = (kpi.name || "").trim();
    const oldNm = (oldName || "").trim();
    if (!newName || oldNm === newName) return;
    kpiTimeTaskRename(kpi, oldNm);
    data.kpiTaskSync[kpi.id] = newName;
    saveHealthMap(data);
  }
}

function saveHealthMap(data, opts) {
  try {
    let prev = null;
    try {
      const raw = readKpiMapScopedStorageRaw(HEALTH_KPI_MAP_STORAGE_KEY);
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
    const stamped = applyHealthKpiTimestampsOnSave(prev, toSave);
    writeKpiMapScopedStorageRaw(HEALTH_KPI_MAP_STORAGE_KEY, JSON.stringify(stamped));
    if (opts?.pushServer) {
      try {
        window.dispatchEvent(
          new CustomEvent("health-kpi-map-saved", {
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

export function render() {
  const el = document.createElement("div");
  el.className =
    "app-tab-panel-content dream-view lp-kpi-dream-page health-view";

  const header = document.createElement("header");
  header.className = "dream-view-header";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "HEALTH";
  const titleRow = document.createElement("div");
  titleRow.className = "dream-view-header-title-row";
  const title = document.createElement("h1");
  title.className = "dream-view-title";
  title.textContent = "건강";
  titleRow.appendChild(title);
  setupKpiCategoryHeaderIcon(titleRow, "health");
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
  /** @type {HTMLElement | null} */
  let paneList = null;
  /** @type {HTMLElement | null} */
  let paneDetail = null;

  let selectedKpiId = null;
  let kpiFilter = "active";
  let healthViewScreen = "main"; // "main" | "kpiDetail"
  let kpiGridScrollPrevFilter = null;
  let kpiGridScrollPrevScopeId = null;
  let healthAddModalJustClosed = false;

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
      "kpi-twopane-split-pane kpi-twopane-split-pane--list dream-content-wrap health-main-view";
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
      if (selectedKpiId) healthViewScreen = "kpiDetail";
      else healthViewScreen = "main";
      ensureSplitDom();
    } else {
      if (selectedKpiId) healthViewScreen = "kpiDetail";
      else healthViewScreen = "main";
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

  void ensureTimeLedgerStorageReady()
    .then(() => {
      try {
        syncSleepHealthGoalLogsFromTimeLedger();
      } catch (_) {}
    })
    .catch(() => {});

  const _healthUiSession = readKpiUiSession(KPI_UI_SESSION_KEYS.health);
  const _healthInitData = loadHealthMap();
  const _healthRestored = restoreKpiTabFromSession(_healthUiSession, {
    categoryIds: _healthInitData.healths || [],
    kpis: _healthInitData.kpis || [],
    foreignKey: "healthId",
  });
  /* 목록 필터는 항상 진행중부터 (세션 복원하지 않음) */
  kpiFilter = "active";
  const _sessScreen = _healthUiSession?.healthViewScreen;
  const _sessKpiId =
    _healthUiSession?.selectedKpiId != null
      ? String(_healthUiSession.selectedKpiId)
      : null;
  const _sessKpiExists =
    !!_sessKpiId &&
    (_healthInitData.kpis || []).some((k) => String(k.id) === _sessKpiId);
  if (
    (_sessScreen === "kpiDetail" || _sessScreen === "kpis") &&
    _sessKpiExists
  ) {
    healthViewScreen = "kpiDetail";
    selectedKpiId = _sessKpiId;
  } else {
    healthViewScreen = "main";
    selectedKpiId = null;
  }

  function persistKpiUiState() {
    writeKpiUiSession(KPI_UI_SESSION_KEYS.health, {
      tabId: null,
      selectedKpiId,
      kpiFilter,
      healthViewScreen,
    });
  }

  function syncHealthFooterBackLabel() {
    if (!el.isConnected) return;
    const footerBack = document.querySelector("[data-lp-app-footer-back]");
    if (!footerBack) return;
    if (wantsSplitLayout() || layoutIsSplit) {
      setKpiFooterBackVisible(footerBack, false);
      return;
    }
    setKpiFooterBackVisible(footerBack, true);
    if (healthViewScreen === "kpiDetail") {
      footerBack.title = "건강 목록으로";
      footerBack.setAttribute("aria-label", "건강 목록으로");
    } else {
      footerBack.title = "오늘(메인)으로";
      footerBack.setAttribute("aria-label", "오늘(메인)으로");
    }
  }

  function syncHealthHeader() {
    if (wantsSplitLayout() || layoutIsSplit) {
      title.textContent = "건강";
      setKpiCategoryHeaderIconVisible(titleRow, true);
      syncHealthFooterBackLabel();
      return;
    }
    const data = loadHealthMap();
    if (healthViewScreen === "kpiDetail" && selectedKpiId) {
      const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
      title.textContent = kpi?.name || "행동";
    } else {
      title.textContent = "건강";
    }
    setKpiCategoryHeaderIconVisible(titleRow, healthViewScreen === "main");
    syncHealthFooterBackLabel();
  }

  function enterKpiDetailView(kpiId) {
    if (!kpiId) return;
    selectedKpiId = kpiId;
    healthViewScreen = "kpiDetail";
    syncHealthHeader();
    updateHealthView();
  }

  function exitToHealthMain() {
    selectedKpiId = null;
    healthViewScreen = "main";
    syncHealthHeader();
    updateHealthView();
    persistKpiUiState();
  }

  function refreshHealthAfterKpiDataChange(opts = {}) {
    if (healthViewScreen === "kpiDetail") {
      syncHealthHeader();
      renderKpiDetailView(opts);
    } else {
      updateHealthView();
    }
    persistKpiUiState();
  }

  const kpiTimeFormOpts = {
    unitPlaceholder: "km",
    higherPlaceholder: "30",
    lowerPlaceholder: "5",
    habitTargetPlaceholder: "5",
    habitUnitPlaceholder: "km",
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
              <input type="text" name="name" placeholder="예) 30분이상의 유산소 운동하기" />
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
        healthId: HEALTH_KPI_GLOBAL_SCOPE_ID,
        name: (form.name.value || "").trim(),
        direction: "higher",
        ...fields,
        progressStatus: progressStatusForKpiStartDate(
          fields.targetStartDate,
          KPI_PROGRESS_STATUS_DEFAULT,
        ),
      };
      const data = loadHealthMap();
      data.kpis = data.kpis || [];
      const existingOrder =
        (data.kpiOrder || {})[HEALTH_KPI_GLOBAL_SCOPE_ID] ||
        getOrderedAllHealthKpis(data).map((k) => k.id);
      data.kpis.push(kpi);
      data.kpiOrder = data.kpiOrder || {};
      data.kpiOrder[HEALTH_KPI_GLOBAL_SCOPE_ID] = [...existingOrder, kpi.id];
      saveHealthMap(data, { pushServer: true });
      syncKpiToTimeTask(kpi, "add");
      close();
      refreshHealthAfterKpiDataChange();
    });
    document.body.appendChild(modal);
    bindKpiGoalModeForm(modal.querySelector(".dream-kpi-form"), null, kpiTimeFormOpts);
  }

  function showKpiEditModal(kpi) {
    const canDeleteKpi = !isProtectedDefaultHealthKpiId(kpi.id);
    const nameOnlyEdit = isHealthFixedGoalModeKpi(kpi);
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
              <input type="text" name="name" value="${escapeHtml(kpi.name || "")}" placeholder="예) 30분이상의 유산소 운동하기" />
            </div>
            ${
              nameOnlyEdit
                ? ""
                : kpiFormGoalAndTargetSectionHtml(kpi, escapeHtml, kpiTimeFormOpts)
            }
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
        const data = loadHealthMap();
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
        removeKpiIdFromKpiOrders(data, kpi.id);
        saveHealthMap(data, { pushServer: true });
        try {
          kpiTimeTaskRemove(kpi, syncName || kpi.name);
        } catch (_) {}
        close();
        if (selectedKpiId === kpi.id) exitToHealthMain();
        else refreshHealthAfterKpiDataChange();
      });
    });
    modal.querySelector(".dream-kpi-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const data = loadHealthMap();
      const target = data.kpis.find((k) => k.id === kpi.id);
      if (!target) {
        close();
        return;
      }
      const oldName = target.name;
      if (nameOnlyEdit) {
        const newName = (form.name.value || "").trim();
        if (!newName) return;
        target.name = newName;
      } else {
        if (!validateKpiActionForm(form, { sanitizeNumericInput })) return;
        applyKpiFormGoalFieldsToKpi(target, form, {
          sanitizeNumericInput,
        });
        target.name = (form.name.value || "").trim();
        target.direction = kpi.direction === "lower" ? "lower" : "higher";
      }
      target.progressStatus = progressStatusForKpiStartDate(
        target.targetStartDate,
        readKpiProgressStatusFromForm(form),
      );
      saveHealthMap(data, { pushServer: true });
      if (oldName !== target.name) syncKpiToTimeTask(target, "update", oldName);
      close();
      refreshHealthAfterKpiDataChange();
    });
    document.body.appendChild(modal);
    bindKpiProgressStatusField(modal);
    if (!nameOnlyEdit) {
      bindKpiGoalModeForm(modal.querySelector(".dream-kpi-form"), kpi, kpiTimeFormOpts);
    }
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


  function clearHealthKpiFooterActions() {
    clearKpiMapFooterActionButtons();
  }

  function healthKpiFooterAddLabel(tab, kpi) {
    const t = effectiveKpiHistoryBottomTab(tab, kpi);
    if (t === KPI_BOTTOM_TAB_TODO) {
      return isHealthCheckupKpi(kpi) ? "검진 목록 추가" : "할 일 추가";
    }
    if (t === KPI_BOTTOM_TAB_DAILY) {
      return isHealthSupplementKpi(kpi) ? "보충제 추가" : "매일 할 일 추가";
    }
  }

  async function runHealthKpiFooterAddAction() {
    const d = loadHealthMap();
    const k = (d.kpis || []).find((x) => x.id === selectedKpiId);
    if (!k) return;
    const tab = effectiveKpiHistoryBottomTab(
      getKpiHistoryBottomTab("health", selectedKpiId),
      k,
    );
    if (tab === KPI_BOTTOM_TAB_TODO) {
      const checkup = isHealthCheckupKpi(k);
      const text = await showKpiTodoAddModal({
        kpiName: k.name,
        title: checkup ? "검진 목록 추가" : undefined,
        inputLabel: checkup ? "검진 목록" : undefined,
        placeholder: checkup ? "검진 입력" : "할 일 입력",
        linkedLabel: "연결된 행동",
      });
      if (!text) return;
      const d2 = loadHealthMap();
      d2.kpiTodos = d2.kpiTodos || [];
      d2.kpiTodos.push({
        id: nextId(),
        kpiId: String(selectedKpiId),
        text,
        completed: false,
      });
      saveHealthMap(d2, { pushServer: true });
      renderKpiDetailView({ scrollTodoAfterMutation: true });
      return;
    }
    if (tab === KPI_BOTTOM_TAB_DAILY) {
      const text = await showKpiTodoAddModal({
        kpiName: k.name,
        title: isHealthSupplementKpi(k) ? "보충제 추가" : "매일 할 일 추가",
        placeholder: isHealthSupplementKpi(k) ? "보충제 입력" : "할 일 입력 (매일 반복)",
        linkedLabel: "연결된 행동",
      });
      if (!text) return;
      const d2 = loadHealthMap();
      d2.kpiDailyRepeatTodos = d2.kpiDailyRepeatTodos || [];
      appendKpiDailyRepeatTodoAtEnd(d2.kpiDailyRepeatTodos, {
        id: nextId(),
        kpiId: String(selectedKpiId),
        text,
        completed: false,
      });
      saveHealthMap(d2, { pushServer: true });
      renderKpiDetailView({ scrollTodoAfterMutation: true });
      return;
    }
  }

  function syncAppFooterHealthKpiActions() {
    clearHealthKpiFooterActions();
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

    const data = loadHealthMap();

    if (healthViewScreen === "main") {
      if (
        shouldShowKpiMapSyncLoading(
          "health",
          !data.healths?.length && !(data.kpis || []).length,
        )
      ) {
        return;
      }
      addBtn.title = "행동 추가";
      addBtn.setAttribute("aria-label", "행동 추가");
      addBtn.addEventListener("click", () => showKpiModal());
      slot.appendChild(mountAppFooterAddButton(addBtn));
      return;
    }

    if (healthViewScreen !== "kpiDetail" || !selectedKpiId) return;
    const kpiNow = (data.kpis || []).find((k) => k.id === selectedKpiId);
    if (!kpiNow) return;
    const tab = getKpiHistoryBottomTab("health", selectedKpiId);
    if (!kpiHistoryFooterShowsAddButton(tab, kpiNow)) {
      appendKpiFooterHomeButton(slot);
      return;
    }
    const addLabel = healthKpiFooterAddLabel(tab, kpiNow);
    addBtn.title = addLabel;
    addBtn.setAttribute("aria-label", addLabel);
    addBtn.addEventListener("click", () => {
      void runHealthKpiFooterAddAction();
    });
    appendKpiFooterHomeButton(slot);
    slot.appendChild(mountAppFooterAddButton(addBtn));
  }

  function getKpiLogs(kpiId) {
    const data = loadHealthMap();
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
    const data = loadHealthMap();
    data.kpiOrder = data.kpiOrder || {};
    data.kpiOrder[HEALTH_KPI_GLOBAL_SCOPE_ID] = orderedKpiIds;
    saveHealthMap(data);
  }

  function getAccumulatedKpiValue(kpiId) {
    const logs = getKpiLogs(kpiId);
    return logs.reduce((sum, log) => sum + parseNum(log.value), 0);
  }

  function getKpiProgress(kpi) {
    const result = computeKpiProgress(kpi, {
      toDateKey,
      getAllKpiLogs: () => loadHealthMap().kpiLogs || [],
      getAccumulatedKpiValue,
      getKpiTodos: (kpiId) =>
        (loadHealthMap().kpiTodos || []).filter((t) => t.kpiId === kpiId),
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

  function computeHealthMainPaintSig() {
    const data = loadHealthMap();
    const goalParts = (data.healths || []).map((health) => {
      const norm = normalizeHealthGoal(health);
      let hero = "";
      if (norm.trackTargetValue) {
        const goalLogs = (data.healthGoalLogs || []).filter(
          (l) => String(l.healthId ?? "") === String(health.id ?? ""),
        );
        const latestLog = getLatestHealthGoalLog(goalLogs);
        hero = latestLog
          ? formatHealthGoalNum(parseHealthGoalNum(latestLog.value))
          : "—";
      }
      return [
        health.id,
        String(norm.name || ""),
        hero,
        String(norm.targetValue || ""),
        String(norm.unit || ""),
      ].join("|");
    });
    const healthKpis = getOrderedAllHealthKpis(data);
    const progressByKpiId = new Map();
    const progressFor = (kpi) => {
      const id = String(kpi?.id ?? "");
      if (!progressByKpiId.has(id)) {
        progressByKpiId.set(id, getKpiProgress(kpi));
      }
      return progressByKpiId.get(id);
    };
    const kpiPart = buildKpiListPaintSignature(
      healthKpis,
      kpiFilter,
      progressFor,
      "health",
    );
    return `goals:${goalParts.join(";")}\n${kpiPart}`;
  }

  let lastHealthMainPaintSig = "";
  let lastKpiMapPaintSig = "";

  function appendHealthKpiGridSection(parentEl, data) {
    const healthKpis = getOrderedAllHealthKpis(data);
    const progressByKpiId = new Map();
    const progressFor = (kpi) => {
      const id = String(kpi?.id ?? "");
      if (!progressByKpiId.has(id)) {
        progressByKpiId.set(id, getKpiProgress(kpi));
      }
      return progressByKpiId.get(id);
    };
    let autoCompleted = false;
    for (const k of healthKpis) {
      if (applyAutoCompleteManualKpiIfNeeded(k, progressFor(k))) {
        autoCompleted = true;
      }
    }
    if (autoCompleted) {
      queueMicrotask(() => saveHealthMap(data, { pushServer: true }));
    }
    const kpiSection = document.createElement("section");
    kpiSection.className = "health-main-kpi-section dream-kpi-section";
    kpiSection.innerHTML = `<h3 class="health-main-section-title dream-kpi-section-title">행동</h3>`;
    parentEl.appendChild(kpiSection);

    const filterBarWrap = document.createElement("div");
    filterBarWrap.className = "health-main-kpi-filter-wrap";
    const filterBar = document.createElement("div");
    filterBar.className = "dream-kpi-filter-bar";
    filterBar.innerHTML = kpiProgressStatusFilterBarHtml(kpiFilter);
    filterBar.querySelectorAll(".dream-kpi-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        kpiFilter = normalizeKpiListFilter(btn.dataset.filter);
        updateHealthView();
      });
    });
    filterBarWrap.appendChild(filterBar);
    kpiSection.appendChild(filterBarWrap);

    const grid = document.createElement("div");
    grid.className = "dream-kpi-grid";
    const listToShow = filterKpisByProgressStatus(
      healthKpis,
      kpiFilter,
      progressFor,
    );

    if (!listToShow.length) {
      const empty = document.createElement("p");
      empty.className = "dream-goals-empty";
      empty.textContent = kpiFilterEmptyListMessage(kpiFilter, { noun: "행동" });
      grid.appendChild(empty);
      if (layoutIsSplit) {
        const addCard = document.createElement("button");
        addCard.type = "button";
        addCard.className = "dream-kpi-add-card";
        addCard.innerHTML =
          '<span class="dream-kpi-add-card-text">+ 행동 추가하기</span>';
        addCard.addEventListener("click", () => showKpiModal());
        grid.appendChild(addCard);
      }
      kpiSection.appendChild(grid);
      return;
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
        cardExtraClass;
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
          ${kpiCardHeadHtml(kpi, "health", nameHtml)}
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
        const newOrder = healthKpis.map((k) => k.id);
        const fromIdx = newOrder.indexOf(draggedId);
        const toIdx = newOrder.indexOf(kpi.id);
        if (fromIdx >= 0 && toIdx >= 0) {
          newOrder.splice(fromIdx, 1);
          newOrder.splice(toIdx, 0, draggedId);
          reorderKpis(newOrder);
          updateHealthView();
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
    kpiSection.appendChild(grid);
  }

  function renderHealthMainView(host) {
    const container = host || listHost();
    if (!container) return;
    const inSplitPane = layoutIsSplit && container !== contentWrap;
    const scopeId = HEALTH_KPI_LIST_SCOPE_ID;
    const savedGridScroll = readKpiGridScrollToRestore(
      container,
      kpiFilter,
      scopeId,
      kpiGridScrollPrevFilter,
      kpiGridScrollPrevScopeId,
    );
    historyWrap.hidden = true;
    historyWrap.innerHTML = "";
    if (!inSplitPane) {
      contentWrap.hidden = false;
      contentWrap.className = "dream-content-wrap health-main-view";
    } else {
      container.className =
        "kpi-twopane-split-pane kpi-twopane-split-pane--list dream-content-wrap health-main-view";
    }
    container.innerHTML = "";
    syncAppFooterHealthKpiActions();

    const data = loadHealthMap();
    const healths = data.healths || [];
    const kpis = data.kpis || [];

    if (
      renderKpiMapSyncLoadingIfNeeded({
        tabId: "health",
        container,
        isEmpty: !healths.length && !kpis.length,
        onLoading: () => syncAppFooterHealthKpiActions(),
      })
    ) {
      return;
    }

    const goalsSection = document.createElement("section");
    goalsSection.className = "health-main-goals-section dream-kpi-section";

    const goalsHead = document.createElement("div");
    goalsHead.className = "health-main-section-head";
    const goalsTitle = document.createElement("h3");
    goalsTitle.className = "health-main-section-title dream-kpi-section-title";
    goalsTitle.textContent = "건강 목표";
    const goalsAddBtn = document.createElement("button");
    goalsAddBtn.type = "button";
    goalsAddBtn.className = "health-main-section-add-btn";
    goalsAddBtn.title = "건강 목표 추가";
    goalsAddBtn.setAttribute("aria-label", "건강 목표 추가");
    goalsAddBtn.textContent = "+";
    goalsAddBtn.addEventListener("click", () => {
      if (healthAddModalJustClosed) return;
      showHealthAddModal();
    });
    goalsHead.appendChild(goalsTitle);
    goalsHead.appendChild(goalsAddBtn);
    goalsSection.appendChild(goalsHead);

    const goalsList = document.createElement("div");
    goalsList.className = "health-goals-scroll";
    if (!healths.length) {
      const empty = document.createElement("p");
      empty.className = "dream-goals-empty health-goals-empty";
      empty.textContent = "건강 목표를 추가해 보세요.";
      goalsList.appendChild(empty);
    }

    healths.forEach((health) => {
      const norm = normalizeHealthGoal(health);
      const item = document.createElement("article");
      item.className = "health-goal-tile dream-kpi-card";
      item.setAttribute("role", "button");
      item.tabIndex = 0;

      if (norm.trackTargetValue) {
        const goalLogs = (data.healthGoalLogs || []).filter(
          (l) => String(l.healthId ?? "") === String(health.id ?? ""),
        );
        const latestLog = getLatestHealthGoalLog(goalLogs);
        const latestDisp = latestLog
          ? formatHealthGoalNum(parseHealthGoalNum(latestLog.value))
          : "—";
        const targetDisp = norm.targetValue
          ? formatHealthGoalNum(parseHealthGoalNum(norm.targetValue))
          : "—";
        const unitTrim = (norm.unit || "").trim();
        item.innerHTML = `
          <div class="health-goal-tile-inner health-goal-tile-inner--plain">
            <div class="health-goal-tile-head">
              <h3 class="health-goal-tile-name">${escapeHtml(norm.name || "건강 이름")}</h3>
              ${HEALTH_GOAL_EDIT_PENCIL_HTML}
            </div>
            <div class="health-goal-tile-hero">
              <span class="health-goal-tile-current">${escapeHtml(latestDisp)}</span><span class="health-goal-tile-slash">/</span><span class="health-goal-tile-target">${escapeHtml(targetDisp)}</span>${unitTrim ? `<span class="health-goal-tile-unit">${escapeHtml(unitTrim)}</span>` : ""}
            </div>
          </div>
        `;
        bindKpiCardEditButton(item.querySelector(".dream-kpi-card-edit"), () =>
          showHealthContextModal(health),
        );
        const openGraph = () => showHealthGoalGraphModal(health);
        item.addEventListener("click", (e) => {
          if (e.target.closest(".dream-kpi-card-edit")) return;
          openGraph();
        });
        item.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          openGraph();
        });
      } else {
        item.innerHTML = `
          <div class="health-goal-tile-inner health-goal-tile-inner--plain">
            <div class="health-goal-tile-head">
              <h3 class="health-goal-tile-name">${escapeHtml(norm.name || "건강 이름")}</h3>
              ${HEALTH_GOAL_EDIT_PENCIL_HTML}
            </div>
          </div>
        `;
        bindKpiCardEditButton(item.querySelector(".dream-kpi-card-edit"), () =>
          showHealthContextModal(health),
        );
        item.addEventListener("click", (e) => {
          if (e.target.closest(".dream-kpi-card-edit")) return;
          showHealthContextModal(health);
        });
        item.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          showHealthContextModal(health);
        });
      }
      goalsList.appendChild(item);
    });
    goalsSection.appendChild(goalsList);
    container.appendChild(goalsSection);

    appendHealthKpiGridSection(container, data);

    applyKpiGridScrollRestore(container, savedGridScroll);
    kpiGridScrollPrevFilter = kpiFilter;
    kpiGridScrollPrevScopeId = scopeId;
    persistKpiUiState();
    syncAppFooterHealthKpiActions();
    lastHealthMainPaintSig = computeHealthMainPaintSig();
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
        "kpi-twopane-split-pane kpi-twopane-split-pane--detail dream-content-wrap dream-kpi-detail-wrap";
    }
    if (!selectedKpiId) {
      if (inSplitPane) {
        paintSplitPlaceholder(container, "행동을 선택해 주세요");
        syncAppFooterHealthKpiActions();
        persistKpiUiState();
        return;
      }
      container.innerHTML = "";
      exitToHealthMain();
      return;
    }
    void renderKpiHistory({ ...opts, target: container });
    syncAppFooterHealthKpiActions();
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
      syncAppFooterHealthKpiActions();
      return;
    }
    const data = loadHealthMap();
    const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
    if (!kpi) {
      if (target === historyWrap) historyWrap.hidden = true;
      exitToHealthMain();
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

    const todoSegLabel = isHealthCheckupKpi(kpi) ? "검진 목록" : "할 일";

    const segBar = KPI_DETAIL_LOGS_UI_ENABLED ? document.createElement("div") : null;
    if (segBar) {
      segBar.className = "dream-kpi-bottom-seg-bar";
      segBar.setAttribute("role", "tablist");
      segBar.setAttribute("aria-label", "할 일·매일 할 일·로그 전환");
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

    const btnSegTodo = KPI_DETAIL_LOGS_UI_ENABLED ? document.createElement("button") : null;
    if (btnSegTodo) {
      btnSegTodo.type = "button";
      btnSegTodo.className = "dream-kpi-bottom-seg-btn";
      btnSegTodo.textContent = todoSegLabel;
      btnSegTodo.setAttribute("role", "tab");
    }

    let btnSegDaily = null;
    if (hasDailyTab && KPI_DETAIL_LOGS_UI_ENABLED) {
      btnSegDaily = document.createElement("button");
      btnSegDaily.type = "button";
      btnSegDaily.className = "dream-kpi-bottom-seg-btn";
      btnSegDaily.textContent = healthKpiDailyTabLabel(kpi);
      btnSegDaily.setAttribute("role", "tab");
    }

    if (segBar) {
      if (!dailyTodosOnly && btnSegTodo) segBar.appendChild(btnSegTodo);
      if (btnSegDaily) segBar.appendChild(btnSegDaily);
      if (btnSegLog) segBar.appendChild(btnSegLog);
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
          title: isHealthCheckupKpi(kpi) ? "검진 목록 수정" : "할 일 수정",
          inputLabel: isHealthCheckupKpi(kpi) ? "검진 목록" : undefined,
          placeholder: isHealthCheckupKpi(kpi) ? "검진" : undefined,
          linkedLabel: "연결된 행동",
        });
        if (!result) return;
        if (result.action === "delete") {
          const d = loadHealthMap();
          kpiTodoLifecycleLog("건강KPI탭_모달삭제", {
            todoId: String(todo.id),
            삭제전: kpiTodoSnapshotBrief(d),
            삭제전dr: deletedRefsKpiTodosLen(d),
          });
          appendDeletedRef(d, "kpiTodos", todo.id);
          d.kpiTodos = (d.kpiTodos || []).filter((x) => x.id !== todo.id);
          saveHealthMap(d, { pushServer: true });
          const after = loadHealthMap();
          kpiTodoLifecycleLog("건강KPI탭_모달삭제_saveHealthMap후", {
            todoId: String(todo.id),
            삭제후: kpiTodoSnapshotBrief(after),
            삭제후dr: deletedRefsKpiTodosLen(after),
          });
          renderKpiDetailView({ scrollTodoAfterMutation: true });
          return;
        }
        const d = loadHealthMap();
        const row = (d.kpiTodos || []).find((x) => x.id === todo.id);
        if (!row) return;
        row.text = result.text;
        saveHealthMap(d, { pushServer: true });
        renderKpiDetailView({ scrollTodoAfterMutation: true });
      };

      item.addEventListener("click", async (e) => {
        if (e.target.closest(".dream-kpi-todo-check-wrap")) return;
        await openTodoEdit();
      });

      check.addEventListener("change", () => {
        const d = loadHealthMap();
        const t = d.kpiTodos.find((x) => x.id === todo.id);
        if (t) {
          kpiTodoLifecycleLog("건강KPI탭_체크_완료토글", {
            todoId: String(todo.id),
            이전완료: !!t.completed,
            요청완료: !!check.checked,
          });
          t.completed = !!check.checked;
          saveHealthMap(d, { pushServer: true });
          kpiTodoLifecycleLog("건강KPI탭_체크_save후", {
            todoId: String(todo.id),
            completion: kpiTodosCompletionBrief(loadHealthMap(), 20),
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
      todoAddCard.innerHTML = `<span class="dream-kpi-add-card-text">${
        isHealthCheckupKpi(kpi) ? "검진 목록 추가하기" : "할 일 추가하기"
      }</span>`;
      todoAddCard.addEventListener("click", () => {
        setKpiHistoryBottomTab("health", selKpi, KPI_BOTTOM_TAB_TODO);
        void runHealthKpiFooterAddAction();
      });
      panelTodoSeg.appendChild(todoAddCard);
    }
    if (todos.length === 0) {
      const emptyTodo = document.createElement("p");
      emptyTodo.className = "dream-kpi-history-empty";
      emptyTodo.textContent = isHealthCheckupKpi(kpi)
        ? "등록된 검진 목록이 없습니다."
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
          loadMap: loadHealthMap,
          saveMap: saveHealthMap,
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
      dailyHeader.innerHTML = `<span class="dream-kpi-todo-title">${escapeHtml(healthKpiDailyListTitle(kpi))}</span>`;
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
            title: isHealthSupplementKpi(kpi) ? "보충제 수정" : "매일 할 일 수정",
            placeholder: isHealthSupplementKpi(kpi) ? "보충제" : "매일 반복되는 할 일",
            linkedLabel: "연결된 행동",
          });
          if (!result) return;
          if (result.action === "delete") {
            const d = loadHealthMap();
            appendDeletedRef(d, "kpiDailyRepeatTodos", todo.id);
            d.kpiDailyRepeatTodos = (d.kpiDailyRepeatTodos || []).filter((x) => x.id !== todo.id);
            saveHealthMap(d, { pushServer: true });
            renderKpiDetailView({ scrollTodoAfterMutation: true });
            return;
          }
          const d = loadHealthMap();
          const row = (d.kpiDailyRepeatTodos || []).find((x) => x.id === todo.id);
          if (!row) return;
          row.text = result.text;
          saveHealthMap(d, { pushServer: true });
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
        loadMap: loadHealthMap,
        saveMap: saveHealthMap,
      });
      if (layoutIsSplit) {
        const dailyAddCard = document.createElement("button");
        dailyAddCard.type = "button";
        dailyAddCard.className =
          "dream-kpi-add-card sideincome-split-todo-add-card";
        dailyAddCard.innerHTML = `<span class="dream-kpi-add-card-text">${
          isHealthSupplementKpi(kpi) ? "보충제 추가하기" : "매일 할 일 추가하기"
        }</span>`;
        dailyAddCard.addEventListener("click", () => {
          setKpiHistoryBottomTab("health", selKpi, KPI_BOTTOM_TAB_DAILY);
          void runHealthKpiFooterAddAction();
        });
        panelDailySeg.appendChild(dailyAddCard);
      }
      if (dailyTodos.length === 0) {
        const emptyDaily = document.createElement("p");
        emptyDaily.className = "dream-kpi-history-empty";
        emptyDaily.textContent = isHealthSupplementKpi(kpi)
          ? "등록된 보충제가 없습니다."
          : "등록된 매일 할 일이 없습니다.";
        panelDailySeg.appendChild(emptyDaily);
      } else {
        panelDailySeg.appendChild(dailyList);
      }
    }

    const clearCompletedOpts = {
      showClearCompleted: !dailyTodosOnly && !layoutIsSplit,
      kpiId: selKpi,
      loadMap: loadHealthMap,
      saveMap: saveHealthMap,
      appendDeletedRef,
      onAfterDelete: () => renderKpiDetailView({ scrollTodoAfterMutation: true }),
    };

    if (KPI_DETAIL_LOGS_UI_ENABLED && segBar) {
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
      if (panelTodoSeg) target.appendChild(panelTodoSeg);
      if (panelDailySeg) target.appendChild(panelDailySeg);
      wireKpiHistoryBottomTabs(
        "health",
        selectedKpiId,
        btnSegLog,
        dailyTodosOnly ? null : btnSegTodo,
        btnSegDaily,
        panelLogSeg,
        dailyTodosOnly ? null : panelTodoSeg,
        panelDailySeg,
        hasDailyTab,
        (tab) => {
          syncAppFooterHealthKpiActions();
          syncSegClearCompletedTrashVisibility(tab);
        },
        { dailyTodosOnly },
      );
    } else if (layoutIsSplit && !dailyTodosOnly && panelTodoSeg) {
      target.appendChild(createKpiDetailSectionHeader(todoSegLabel || "할 일"));
      target.appendChild(panelTodoSeg);
      setKpiHistoryBottomTab("health", selKpi, KPI_BOTTOM_TAB_TODO);
      if (hasDailyTab && panelDailySeg) {
        panelDailySeg.querySelector(".dream-kpi-todo-header")?.remove();
        panelDailySeg.querySelector(".dream-kpi-todo-divider")?.remove();
        target.appendChild(
          createKpiDetailSectionHeader(healthKpiDailyTabLabel(kpi)),
        );
        target.appendChild(panelDailySeg);
      }
    } else {
      mountKpiDetailStackedSections(target, {
        namespace: "health",
        kpiId: selKpi,
        todoPanel: panelTodoSeg,
        dailyPanel: panelDailySeg,
        dailyTodosOnly,
        hasDailyTab,
        todoTitle: todoSegLabel,
        dailyTitle: healthKpiDailyTabLabel(kpi),
        clearCompleted: clearCompletedOpts,
      });
    }
    if (scrollTodoAfterMutation) {
      afterKpiTodoListMutationScroll(target, scrollSnap);
    }
    syncAppFooterHealthKpiActions();

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

  function appendHealthGoalLogItems(container, norm, goalLogs, handlers = {}) {
    container.innerHTML = "";
    const unitTrim = (norm.unit || "").trim();
    const unitSuffix = unitTrim ? ` ${unitTrim}` : "";
    if (!goalLogs.length) {
      const empty = document.createElement("p");
      empty.className = "health-goal-logs-empty";
      empty.textContent = "아직 기록이 없습니다.";
      container.appendChild(empty);
      return;
    }
    [...goalLogs]
      .sort((a, b) =>
        (b.dateRaw || b.date || "").localeCompare(a.dateRaw || a.date || ""),
      )
      .forEach((log) => {
        const logItem = document.createElement("div");
        logItem.className = "dream-kpi-path-log-item";
        logItem.innerHTML = `
          <div class="dream-kpi-path-log-body">
            <span class="dream-kpi-path-log-date">${escapeHtml(log.date)}</span>
            <span class="dream-kpi-path-log-value">${escapeHtml(log.value || "—")}${escapeHtml(unitSuffix)}</span>
            ${log.memo ? `<div class="dream-kpi-path-log-memo">${escapeHtml(log.memo)}</div>` : ""}
          </div>
          <div class="dream-kpi-path-log-actions">
            <button type="button" class="dream-kpi-path-log-edit">수정</button>
            <button type="button" class="dream-kpi-path-log-del">삭제</button>
          </div>
        `;
        logItem
          .querySelector(".dream-kpi-path-log-edit")
          .addEventListener("click", () => handlers.onEditLog?.(log));
        logItem.querySelector(".dream-kpi-path-log-del").addEventListener("click", () => {
          handlers.onDeleteLog?.(log);
        });
        container.appendChild(logItem);
      });
  }

  function showHealthGoalGraphModal(health) {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal health-goal-graph-modal";
    modal.style.zIndex = String(resolveLpModalStackZIndex());

    const getFreshHealthGoal = () =>
      normalizeHealthGoal(
        loadHealthMap().healths.find(
          (x) => String(x.id ?? "") === String(health.id ?? ""),
        ) || health,
      );

    const initialNorm = getFreshHealthGoal();
    if (!initialNorm.trackTargetValue) return;

    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel" class="health-goal-graph-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">${escapeHtml(initialNorm.name || "건강 목표")} 기록</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <div class="health-goal-graph-body" data-legacy="time-task-setup-body">
          <div class="health-goal-graph-range-bar" role="tablist" aria-label="기록 기간">
            ${HEALTH_GOAL_CHART_RANGES.map(
              (r) =>
                `<button type="button" class="health-goal-graph-range-btn${r.id === "week" ? " active" : ""}" data-range="${r.id}" role="tab" aria-selected="${r.id === "week"}">${r.label}</button>`,
            ).join("")}
          </div>
          <div class="health-goal-graph-chart" aria-hidden="false"></div>
        </div>
        <div data-legacy="time-task-log-footer">
          <button type="button" class="health-goal-graph-add-btn" data-legacy="time-task-log-submit">로그 추가</button>
        </div>
      </div>
    `;

    const close = () => {
      document.removeEventListener("calendar-time-rows-updated", onLedgerRowsUpdated);
      modal.remove();
    };
    modal.querySelector('[data-legacy~="time-task-setup-backdrop"]').addEventListener("click", close);
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);

    let chartRange = "week";
    const isSleepGoal =
      String(health.id ?? "") === DEFAULT_SLEEP_HEALTH_GOAL_ID;

    const prepareSleepLogsFromLedger = async () => {
      if (!isSleepGoal) return;
      try {
        await ensureTimeLedgerStorageReady();
        syncSleepHealthGoalLogsFromTimeLedger();
      } catch (_) {}
    };

    const refreshChart = async () => {
      await prepareSleepLogsFromLedger();
      const norm = getFreshHealthGoal();
      const unitTrim = (norm.unit || "").trim();
      const freshData = loadHealthMap();
      const healthId = String(health.id ?? "");
      const freshLogs = (freshData.healthGoalLogs || []).filter(
        (l) => String(l.healthId ?? "") === healthId,
      );
      const allPoints = buildHealthGoalChartPoints(freshLogs);
      const points = filterHealthGoalChartPoints(allPoints, chartRange);
      renderHealthGoalLineChart(modal.querySelector(".health-goal-graph-chart"), {
        points,
        targetValue: norm.trackTargetValue ? norm.targetValue : null,
        unit: unitTrim,
        caption: buildHealthGoalChartCaption(points),
        scrollToEnd: chartRange !== "all",
      });
    };

    const onLedgerRowsUpdated = () => {
      if (!modal.isConnected) return;
      void refreshChart();
    };
    document.addEventListener("calendar-time-rows-updated", onLedgerRowsUpdated);

    modal.querySelectorAll(".health-goal-graph-range-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        chartRange = btn.getAttribute("data-range") || "week";
        modal.querySelectorAll(".health-goal-graph-range-btn").forEach((b) => {
          const on = b === btn;
          b.classList.toggle("active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        refreshChart();
      });
    });

    void refreshChart();

    modal.querySelector(".health-goal-graph-add-btn")?.addEventListener("click", () => {
      const freshNorm = normalizeHealthGoal(
        loadHealthMap().healths.find((x) => x.id === health.id) || health,
      );
      showHealthGoalLogModal(freshNorm, null, {
        onSaved: () => {
          refreshChart();
          updateHealthView();
        },
      });
    });

    document.body.appendChild(modal);
  }

  function showHealthGoalLogModal(health, editLog = null, opts = {}) {
    const { onSaved } = opts;
    const norm = normalizeHealthGoal(health);
    const isEdit = !!editLog;
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal time-task-log-modal health-goal-log-modal";
    modal.style.zIndex = String(resolveLpModalStackZIndex());
    let dateVal = toDateKey(new Date());
    let valueVal = "";
    if (editLog) {
      if (editLog.dateRaw) {
        dateVal = editLog.dateRaw;
      } else if (editLog.date) {
        const m = editLog.date.match(/(\d{4})\.?\s*(\d{1,2})\.?\s*(\d{1,2})/);
        if (m) dateVal = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      }
      valueVal = sanitizeNumericInput(editLog.value) || "";
    }
    const unitLabel = (norm.unit || "").trim() || "값";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel" class="time-task-log-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">${isEdit ? "건강 목표 로그 수정" : "건강 목표 로그 추가"}</h3>
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
                  <label>건강 목표</label>
                  <input type="text" value="${escapeHtml(norm.name || "")}" readonly class="dream-kpi-log-readonly" />
                </div>
              </div>
              <div class="dream-kpi-log-row">
                <div class="dream-kpi-log-field">
                  <label>${escapeHtml(unitLabel)}</label>
                  <input type="text" name="value" placeholder="숫자 입력" value="${escapeHtml(valueVal)}" inputmode="decimal" />
                </div>
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
    modal.querySelector('[data-legacy~="time-task-setup-backdrop"]').addEventListener("click", close);
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);
    modal.querySelector(".dream-kpi-log-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const dateFieldVal = form.date.value;
      const dateStr = dateFieldVal
        ? `${dateFieldVal.split("-")[0]}. ${dateFieldVal.split("-")[1]}. ${dateFieldVal.split("-")[2]}.`
        : toDateStr(new Date());
      const data = loadHealthMap();
      if (isEdit) {
        const idx = (data.healthGoalLogs || []).findIndex((l) => l.id === editLog.id);
        if (idx >= 0) {
          data.healthGoalLogs = data.healthGoalLogs || [];
          data.healthGoalLogs[idx] = {
            ...data.healthGoalLogs[idx],
            date: dateStr,
            dateRaw: dateFieldVal,
            value: sanitizeNumericInput(form.value.value) || "",
            memo: "",
          };
        }
      } else {
        data.healthGoalLogs = data.healthGoalLogs || [];
        data.healthGoalLogs.push({
          id: nextId(),
          healthId: norm.id,
          date: dateStr,
          dateRaw: dateFieldVal,
          value: sanitizeNumericInput(form.value.value) || "",
          memo: "",
        });
      }
      saveHealthMap(data, { pushServer: true });
      close();
      updateHealthView();
      onSaved?.();
    });
    const delBtn = modal.querySelector(".dream-kpi-log-modal-delete-btn");
    if (delBtn && isEdit) {
      delBtn.addEventListener("click", () => {
        const d = loadHealthMap();
        appendDeletedRef(d, "healthGoalLogs", editLog.id);
        d.healthGoalLogs = (d.healthGoalLogs || []).filter((l) => l.id !== editLog.id);
        saveHealthMap(d, { pushServer: true });
        close();
        updateHealthView();
        onSaved?.();
      });
    }
    document.body.appendChild(modal);
    setupNumericOnlyInput(modal.querySelector('input[name="value"]'));
    initModalNativeDateFieldsIn(modal);
  }

  function showHealthContextModal(health) {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal health-goal-edit-modal";

    const getFreshHealth = () => {
      const d = loadHealthMap();
      return normalizeHealthGoal(d.healths.find((x) => x.id === health.id) || health);
    };

    const norm = getFreshHealth();
    const canDelete = !isProtectedDefaultHealthGoalId(health.id);

    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel" class="health-goal-edit-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">건강 목표 수정</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <div class="health-goal-edit-modal-body" data-legacy="time-task-setup-body">
          <form class="dream-kpi-form health-goal-edit-form" id="health-goal-edit-form">
            <div class="dream-kpi-form-body">
              <div class="dream-kpi-field">
                <label>건강 이름</label>
                <input type="text" name="name" value="${escapeHtml(norm.name || "")}" placeholder="몸무게 감량하기" />
              </div>
              ${healthGoalTargetFieldsMarkup(norm, escapeHtml)}
            </div>
          </form>
        </div>
        <div data-legacy="time-task-log-footer"${canDelete ? "" : ' class="health-goal-edit-modal-footer--save-only"'}>
          ${canDelete ? '<button type="button" class="dream-kpi-log-modal-delete-btn" data-legacy="time-task-log-delete-btn" data-action="delete">건강 목표 삭제</button>' : ""}
          <button type="submit" form="health-goal-edit-form" data-legacy="time-task-log-submit">저장</button>
        </div>
      </div>
    `;

    const close = () => modal.remove();
    modal.querySelector('[data-legacy~="time-task-setup-backdrop"]').addEventListener("click", close);
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);

    const goalForm = modal.querySelector(".health-goal-edit-form");

    bindHealthGoalTargetFields(goalForm);

    goalForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = (goalForm.name.value || "").trim() || "건강 이름";
      const targetFields = readHealthGoalTargetFields(goalForm);
      const d = loadHealthMap();
      const target = d.healths.find((x) => x.id === health.id);
      if (target) {
        target.name = val;
        target.trackTargetValue = targetFields.trackTargetValue;
        target.targetValue = targetFields.targetValue;
        target.unit = targetFields.unit;
        saveHealthMap(d, { pushServer: true });
        syncHealthHeader();
        updateHealthView();
      }
      close();
    });

    modal.querySelector('[data-action="delete"]')?.addEventListener("click", () => {
      close();
      showHealthDeleteConfirmModal(health.id);
    });

    document.body.appendChild(modal);
  }

  function showHealthAddModal() {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">건강 목표 추가</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>건강 이름</label>
              <input type="text" name="name" placeholder="몸무게 감량하기" />
            </div>
            ${healthGoalTargetFieldsMarkup(null, escapeHtml)}
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
      const val = (form.name.value || "").trim() || "새 건강";
      const targetFields = readHealthGoalTargetFields(form);
      const data = loadHealthMap();
      const health = {
        id: nextId(),
        name: val,
        ...targetFields,
      };
      data.healths.push(health);
      saveHealthMap(data, { pushServer: true });
      selectedKpiId = null;
      healthAddModalJustClosed = true;
      close();
      healthViewScreen = "main";
      updateHealthView();
      setTimeout(() => { healthAddModalJustClosed = false; }, 300);
    };
    confirmBtn.addEventListener("click", doSubmit);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      doSubmit();
    });
    document.body.appendChild(modal);
    bindHealthGoalTargetFields(form);
  }

  function showHealthDeleteConfirmModal(healthId) {
    if (isProtectedDefaultHealthGoalId(healthId)) return;
    const data = loadHealthMap();
    const health = data.healths.find((h) => h.id === healthId);
    const healthName = health?.name || "이 건강";
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal dream-delete-confirm-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel" class="dream-delete-confirm-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">건강 삭제</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <div data-legacy="time-task-setup-body">
          <p class="dream-delete-confirm-msg">"${escapeHtml(healthName)}"을(를) 정말 삭제하시겠습니까?</p>
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
      const d = loadHealthMap();
      appendDeletedRef(d, "categories", healthId);
      (d.healthGoalLogs || [])
        .filter((l) => l.healthId === healthId)
        .forEach((l) => appendDeletedRef(d, "healthGoalLogs", l.id));
      d.healthGoalLogs = (d.healthGoalLogs || []).filter((l) => l.healthId !== healthId);
      d.healths = (d.healths || []).filter((x) => x.id !== healthId);
      delete d.kpiOrder?.[healthId];
      saveHealthMap(d, { pushServer: true });
      syncHealthHeader();
      updateHealthView();
    });
    document.body.appendChild(modal);
  }

  function updateHealthView() {
    syncLayoutModeFromViewport();
    syncHealthHeader();
    historyWrap.hidden = true;
    historyWrap.innerHTML = "";
    if (layoutIsSplit) {
      renderHealthMainView(paneList);
      if (selectedKpiId) renderKpiDetailView({ target: paneDetail });
      else paintSplitPlaceholder(paneDetail, "행동을 선택해 주세요");
      syncAppFooterHealthKpiActions();
      persistKpiUiState();
      return;
    }
    if (healthViewScreen === "main") {
      renderHealthMainView();
      persistKpiUiState();
      return;
    }
    if (healthViewScreen === "kpiDetail") {
      contentWrap.hidden = false;
      contentWrap.className = "dream-content-wrap dream-kpi-detail-wrap";
      renderKpiDetailView();
      persistKpiUiState();
      return;
    }
    healthViewScreen = "main";
    renderHealthMainView();
    persistKpiUiState();
  }

  function reconcileScopeWithStoredMap(data) {
    const kpis = data?.kpis || [];
    if (selectedKpiId && !kpis.some((k) => k.id === selectedKpiId)) {
      selectedKpiId = null;
      healthViewScreen = "main";
    }
  }

  reconcileScopeWithStoredMap(_healthInitData);
  syncHealthHeader();
  updateHealthView();
  if (healthViewScreen !== "main") {
    lastKpiMapPaintSig = readKpiMapLocalStorageSignature(
      HEALTH_KPI_MAP_STORAGE_KEY,
    );
  }

  function syncHealthUiFromStoredMap() {
    if (!el.isConnected) return;
    if (healthViewScreen === "main") {
      const nextPaint = computeHealthMainPaintSig();
      if (nextPaint === lastHealthMainPaintSig) return;
      lastHealthMainPaintSig = nextPaint;
    } else {
      const nextSig = readKpiMapLocalStorageSignature(HEALTH_KPI_MAP_STORAGE_KEY);
      if (nextSig === lastKpiMapPaintSig) return;
      lastKpiMapPaintSig = nextSig;
    }
    const data = loadHealthMap();
    if (selectedKpiId && !data.kpis.some((k) => k.id === selectedKpiId)) {
      selectedKpiId = null;
      healthViewScreen = "main";
    }
    syncHealthHeader();
    updateHealthView();
    persistKpiUiState();
  }

  let healthSoftRefreshRaf = 0;
  function scheduleSyncHealthUiFromStoredMap() {
    if (!el.isConnected) return;
    if (healthSoftRefreshRaf) return;
    healthSoftRefreshRaf = requestAnimationFrame(() => {
      healthSoftRefreshRaf = 0;
      syncHealthUiFromStoredMap();
    });
  }

  const onMergedSync = (e) => {
    if (!el.isConnected) return;
    /* push 시에는 화면 갱신 불필요 (로컬 변경을 서버에 올린 것이므로) */
    if (e.detail?.fromPush) return;
    if (!e.detail?.fromServerMerge && !e.detail?.fromLocalWrite) return;
    scheduleSyncHealthUiFromStoredMap();
  };
  window.addEventListener("health-kpi-map-saved", onMergedSync);
  window.addEventListener("lp-kpi-tab-pull-settled", (e) => {
    if (!el.isConnected || e.detail?.tabId !== "health") return;
    scheduleSyncHealthUiFromStoredMap();
  });
  window.__lpHealthSoftRefresh = scheduleSyncHealthUiFromStoredMap;
  window.__lpHealthFooterBack = () => {
    if (!el.isConnected) return false;
    if (wantsSplitLayout() || layoutIsSplit) return false;
    if (healthViewScreen === "kpiDetail") {
      exitToHealthMain();
      return true;
    }
    return false;
  };

  /** @type {MediaQueryList | null} */
  let splitMql = null;
  function onSplitViewportChange() {
    if (!el.isConnected) return;
    updateHealthView();
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
