/**
 * 건강 페이지 - 꿈/부수입과 동일한 KPI 구조
 * 건강 추가 시 탭 형성, KPI 카드, 로그, 할일
 */

import {
  HEALTH_KPI_MAP_STORAGE_KEY,
  applyHealthKpiTimestampsOnSave,
} from "../utils/healthKpiMapSupabase.js";
import {
  kpiTimeTaskAdd,
  kpiTimeTaskRemove,
  kpiTimeTaskRename,
  getFullTaskOptions,
} from "../utils/timeTaskOptionsModel.js";
import { toDateInputValue, formatDeadlineForDisplay, formatDeadlineRangeForDisplay, formatDeadlineRangeCompact } from "../utils/ganttModal.js";
import { setupDeadlineQuickButtons } from "../utils/deadlineQuickButtons.js";
import {
  buildModalNativeDateFieldMarkup,
  initModalNativeDateFieldsIn,
} from "../utils/modalNativeDateField.js";
import {
  afterKpiTodoListMutationScroll,
} from "../utils/kpiTodoInputScroll.js";
import { minutesToHhMm, syncHabitTrackerLogs } from "../utils/timeKpiSync.js";
import {
  kpiTargetValueFieldHtml,
  kpiUnitFieldHtml,
  readKpiTimeUnitFormFields,
  bindKpiUnitTimeMode,
  computeKpiProgress,
  buildKpiCardTimePresentation,
} from "../utils/kpiTimeUnitKpi.js";
import { defaultManualKpiLogMeta, kpiLogSourceBadgeHtml, formatKpiHistoryValueText } from "../utils/kpiLogFields.js";
import {
  wireKpiHistoryBottomTabs,
  getKpiHistoryBottomTab,
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
import { formatKpiCardHeroHtml } from "../utils/kpiViewModal.js";
import { showKpiTodoEditModal } from "../utils/kpiTodoEditModal.js";
import {
  KPI_CARD_EDIT_PENCIL_HTML,
  HEALTH_GOAL_EDIT_PENCIL_HTML,
} from "../utils/kpiTabNameEditIcon.js";
import { sortKpiLogsNewestFirst, getLatestKpiLogWithExplicitValue } from "../utils/kpiLogsSort.js";
import {
  deletedRefsKpiTodosLen,
  kpiTodoLifecycleLog,
  kpiTodoSnapshotBrief,
  kpiTodosCompletionBrief,
} from "../utils/kpiTodoLifecycleDebug.js";
import { readKpiMapLocalStorageSignature } from "../utils/kpiMapLocalStorage.js";
import {
  APP_FOOTER_ICON_BTN_CLASS,
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

function loadHealthMap() {
  try {
    const raw = localStorage.getItem(HEALTH_KPI_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const kpis = (parsed.kpis || []).map((k) => ({
        ...k,
        needHabitTracker: !!k.needHabitTracker,
        useTimeAsUnit: !!k.useTimeAsUnit,
        direction: k.direction === "lower" ? "lower" : "higher",
      }));
      return {
        healths: parsed.healths || [],
        kpis,
        kpiLogs: parsed.kpiLogs || [],
        kpiTodos: parsed.kpiTodos || [],
        kpiDailyRepeatTodos: parsed.kpiDailyRepeatTodos || [],
        kpiOrder: parsed.kpiOrder || {},
        kpiTaskSync: parsed.kpiTaskSync || {},
        deletedRefs: parsed.deletedRefs && typeof parsed.deletedRefs === "object" ? parsed.deletedRefs : defaultDeletedRefs(),
      };
    }
  } catch (_) {}
  return {
    healths: [],
    kpis: [],
    kpiLogs: [],
    kpiTodos: [],
    kpiDailyRepeatTodos: [],
    kpiOrder: {},
    kpiTaskSync: {},
    deletedRefs: defaultDeletedRefs(),
  };
}

function getTaskName(o) {
  return typeof o === "string" ? o : (o?.name || "");
}

function syncKpiToTimeTask(kpi, action, oldName) {
  const data = loadHealthMap();
  data.kpiTaskSync = data.kpiTaskSync || {};
  if (action === "add") {
    const name = (kpi.name || "").trim();
    if (!name) return;
    const opts = getFullTaskOptions();
    if (opts.some((o) => getTaskName(o) === name)) return;
    data.kpiTaskSync[kpi.id] = name;
    saveHealthMap(data);
    kpiTimeTaskAdd(kpi, "health");
  } else if (action === "remove") {
    const syncName = (data.kpiTaskSync[kpi.id] || kpi.name || "").trim();
    if (syncName) {
      delete data.kpiTaskSync[kpi.id];
      saveHealthMap(data);
      kpiTimeTaskRemove(kpi, syncName);
    }
  } else if (action === "update" && oldName) {
    const newName = (kpi.name || "").trim();
    const oldNm = (oldName || "").trim();
    if (!newName || oldNm === newName) return;
    kpiTimeTaskRename(kpi, oldNm);
    data.kpiTaskSync[kpi.id] = newName;
    saveHealthMap(data);
  }
}

function saveHealthMap(data) {
  try {
    let prev = null;
    try {
      const raw = localStorage.getItem(HEALTH_KPI_MAP_STORAGE_KEY);
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
    localStorage.setItem(HEALTH_KPI_MAP_STORAGE_KEY, JSON.stringify(stamped));
    try {
      window.dispatchEvent(new CustomEvent("health-kpi-map-saved"));
    } catch (_) {}
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
  el.className = "app-tab-panel-content dream-view lp-kpi-dream-page";

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

  let activeHealthId = null;
  let selectedKpiId = null;
  let kpiFilter = "all";
  let healthViewScreen = "goals"; // "goals" | "kpis" | "kpiDetail"
  let kpiGridScrollPrevFilter = null;
  let kpiGridScrollPrevScopeId = null;
  let healthAddModalJustClosed = false;

  const _healthUiSession = readKpiUiSession(KPI_UI_SESSION_KEYS.health);
  const _healthInitData = loadHealthMap();
  const _healthRestored = restoreKpiTabFromSession(_healthUiSession, {
    categoryIds: _healthInitData.healths || [],
    kpis: _healthInitData.kpis || [],
    foreignKey: "healthId",
  });
  kpiFilter = _healthRestored.kpiFilter;
  /* 건강 메뉴 진입은 항상 목표 목록 — KPI 화면은 목표 클릭 후에만 */
  healthViewScreen = "goals";
  activeHealthId = null;
  selectedKpiId = null;

  function persistKpiUiState() {
    writeKpiUiSession(KPI_UI_SESSION_KEYS.health, {
      tabId: activeHealthId,
      selectedKpiId,
      kpiFilter,
      healthViewScreen,
    });
  }

  function syncHealthFooterBackLabel() {
    if (!el.isConnected) return;
    const footerBack = document.querySelector("[data-lp-app-footer-back]");
    if (!footerBack) return;
    if (healthViewScreen === "kpiDetail") {
      footerBack.title = "KPI 목록으로";
      footerBack.setAttribute("aria-label", "KPI 목록으로");
    } else if (healthViewScreen === "kpis") {
      footerBack.title = "건강 목표 목록으로";
      footerBack.setAttribute("aria-label", "건강 목표 목록으로");
    } else {
      footerBack.title = "오늘(메인)으로";
      footerBack.setAttribute("aria-label", "오늘(메인)으로");
    }
  }

  function syncHealthHeader() {
    const data = loadHealthMap();
    const health = data.healths.find((h) => h.id === activeHealthId);
    if (healthViewScreen === "kpiDetail" && selectedKpiId) {
      const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
      title.textContent = kpi?.name || "KPI";
    } else if (healthViewScreen === "kpis" && health) {
      title.textContent = health.name || "건강";
    } else {
      title.textContent = "건강";
    }
    syncHealthFooterBackLabel();
  }

  function enterKpiView(healthId) {
    if (!healthId) return;
    activeHealthId = healthId;
    selectedKpiId = null;
    healthViewScreen = "kpis";
    syncHealthHeader();
    updateHealthView();
  }

  function enterKpiDetailView(kpiId) {
    if (!kpiId || !activeHealthId) return;
    selectedKpiId = kpiId;
    healthViewScreen = "kpiDetail";
    syncHealthHeader();
    updateHealthView();
  }

  function exitToKpiList() {
    selectedKpiId = null;
    healthViewScreen = "kpis";
    syncHealthHeader();
    updateHealthView();
    persistKpiUiState();
  }

  function refreshHealthAfterKpiDataChange(opts = {}) {
    if (healthViewScreen === "kpiDetail") {
      syncHealthHeader();
      renderKpiDetailView(opts);
    } else if (healthViewScreen === "kpis") {
      renderKpiList();
    } else {
      updateHealthView();
    }
    persistKpiUiState();
  }

  function exitToHealthGoalsList() {
    healthViewScreen = "goals";
    activeHealthId = null;
    selectedKpiId = null;
    syncHealthHeader();
    updateHealthView();
    persistKpiUiState();
  }

  const kpiTimeFormOpts = {
    unitPlaceholder: "일",
    higherPlaceholder: "30",
    lowerPlaceholder: "5",
    timePlaceholder: "예) 25:00",
  };

  function showKpiModal() {
    if (!activeHealthId) return;
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">새 KPI 추가</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>행동 이름</label>
              <input type="text" name="name" placeholder="예) 30분이상의 유산소 운동하기" />
            </div>
            <div class="dream-kpi-field dream-kpi-direction-field" data-legacy="time-add-task-field">
              <div class="dream-kpi-direction-inline">
                <span class="dream-kpi-direction-caption">지표 방향</span>
                <div class="dream-kpi-direction-options">
                  <label class="dream-kpi-direction-option">
                    <input type="radio" name="direction" value="higher" checked />
                    <span>높을수록 좋음</span>
                  </label>
                  <label class="dream-kpi-direction-option">
                    <input type="radio" name="direction" value="lower" />
                    <span>낮을수록 좋음</span>
                  </label>
                </div>
              </div>
            </div>
            <div class="dream-kpi-row">
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                ${kpiTargetValueFieldHtml(null, escapeHtml, kpiTimeFormOpts)}
              </div>
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                ${kpiUnitFieldHtml(null, escapeHtml, kpiTimeFormOpts)}
              </div>
            </div>
            <div class="dream-kpi-period-block" data-legacy="time-add-task-field">
              <div class="dream-kpi-row">
                <div class="dream-kpi-field">
                  <label>시작기한</label>
                  ${buildModalNativeDateFieldMarkup({
                    name: "targetStartDate",
                    ariaLabel: "시작기한",
                    inputClass: "todo-task-edit-start",
                  })}
                </div>
                <div class="dream-kpi-field">
                  <label>달성기한</label>
                  ${buildModalNativeDateFieldMarkup({
                    name: "targetDeadline",
                    ariaLabel: "달성기한",
                    inputClass: "todo-task-edit-due",
                  })}
                </div>
              </div>
              <div class="dream-kpi-deadline-quick">
                <button type="button" class="dream-kpi-today-btn">오늘</button>
                <button type="button" class="dream-kpi-deadline-quick-btn" data-days="14">+14일</button>
                <button type="button" class="dream-kpi-deadline-quick-btn" data-days="30">+30일</button>
              </div>
            </div>
          </div>
          <div data-legacy="time-task-log-footer">
            <button type="submit" data-legacy="time-task-log-submit">KPI 등록하기</button>
          </div>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);
    modal.querySelector(".dream-kpi-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const needHabitChecked = !!(form.querySelector('input[name="needHabitTracker"]')?.checked);
      const dir =
        form.querySelector('input[name="direction"]:checked')?.value === "lower"
          ? "lower"
          : "higher";
      const fields = readKpiTimeUnitFormFields(form, sanitizeNumericInput);
      const kpi = {
        id: nextId(),
        healthId: activeHealthId,
        name: (form.name.value || "").trim() || "행동",
        unit: fields.unit,
        targetValue: fields.targetValue,
        targetTimeRequired: fields.targetTimeRequired,
        targetStartDate: (form.targetStartDate?.value || "").trim() || "",
        targetDeadline: (form.targetDeadline.value || "").trim() || "",
        needHabitTracker: needHabitChecked,
        useTimeAsUnit: fields.useTimeAsUnit,
        direction: dir,
      };
      const data = loadHealthMap();
      data.kpis = data.kpis || [];
      const existingOrder = (data.kpiOrder || {})[activeHealthId] || data.kpis.filter((k) => k.healthId === activeHealthId).map((k) => k.id);
      data.kpis.push(kpi);
      data.kpiOrder = data.kpiOrder || {};
      data.kpiOrder[activeHealthId] = [...existingOrder, kpi.id];
      saveHealthMap(data);
      syncKpiToTimeTask(kpi, "add");
      close();
      enterKpiDetailView(kpi.id);
    });
    document.body.appendChild(modal);
    initModalNativeDateFieldsIn(modal);
    setupDeadlineQuickButtons(modal);
    bindKpiUnitTimeMode(modal.querySelector(".dream-kpi-form"), null, kpiTimeFormOpts);
  }

  function showKpiEditModal(kpi) {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">KPI 수정</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>행동 이름</label>
              <input type="text" name="name" value="${escapeHtml(kpi.name || "")}" placeholder="예) 30분이상의 유산소 운동하기" />
            </div>
            <div class="dream-kpi-field dream-kpi-direction-field" data-legacy="time-add-task-field">
              <div class="dream-kpi-direction-inline">
                <span class="dream-kpi-direction-caption">지표 방향</span>
                <div class="dream-kpi-direction-options">
                  <label class="dream-kpi-direction-option">
                    <input type="radio" name="direction" value="higher" ${kpi.direction !== "lower" ? "checked" : ""} />
                    <span>높을수록 좋음</span>
                  </label>
                  <label class="dream-kpi-direction-option">
                    <input type="radio" name="direction" value="lower" ${kpi.direction === "lower" ? "checked" : ""} />
                    <span>낮을수록 좋음</span>
                  </label>
                </div>
              </div>
            </div>
            <div class="dream-kpi-row">
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                ${kpiTargetValueFieldHtml(kpi, escapeHtml, kpiTimeFormOpts)}
              </div>
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                ${kpiUnitFieldHtml(kpi, escapeHtml, kpiTimeFormOpts)}
              </div>
            </div>
            <div class="dream-kpi-period-block" data-legacy="time-add-task-field">
              <div class="dream-kpi-row">
                <div class="dream-kpi-field">
                  <label>시작기한</label>
                  ${buildModalNativeDateFieldMarkup({
                    name: "targetStartDate",
                    ariaLabel: "시작기한",
                    value: escapeHtml(toDateInputValue(kpi.targetStartDate)),
                    inputClass: "todo-task-edit-start",
                  })}
                </div>
                <div class="dream-kpi-field">
                  <label>달성기한</label>
                  ${buildModalNativeDateFieldMarkup({
                    name: "targetDeadline",
                    ariaLabel: "달성기한",
                    value: escapeHtml(toDateInputValue(kpi.targetDeadline)),
                    inputClass: "todo-task-edit-due",
                  })}
                </div>
              </div>
              <div class="dream-kpi-deadline-quick">
                <button type="button" class="dream-kpi-today-btn">오늘</button>
                <button type="button" class="dream-kpi-deadline-quick-btn" data-days="14">+14일</button>
                <button type="button" class="dream-kpi-deadline-quick-btn" data-days="30">+30일</button>
              </div>
            </div>
            <div class="dream-kpi-delete-wrap">
              <button type="button" class="dream-kpi-delete-btn">KPI 삭제하기</button>
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
      syncKpiToTimeTask(kpi, "remove");
      const data = loadHealthMap();
      appendDeletedRef(data, "kpis", kpi.id);
      data.kpis = (data.kpis || []).filter((k) => k.id !== kpi.id);
      data.kpiLogs = (data.kpiLogs || []).filter((l) => l.kpiId !== kpi.id);
      data.kpiTodos = (data.kpiTodos || []).filter((t) => t.kpiId !== kpi.id);
      data.kpiDailyRepeatTodos = (data.kpiDailyRepeatTodos || []).filter((t) => t.kpiId !== kpi.id);
      const order = (data.kpiOrder || {})[kpi.healthId] || [];
      data.kpiOrder = { ...data.kpiOrder, [kpi.healthId]: order.filter((id) => id !== kpi.id) };
      saveHealthMap(data);
      close();
      exitToKpiList();
    });
    modal.querySelector(".dream-kpi-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const data = loadHealthMap();
      const target = data.kpis.find((k) => k.id === kpi.id);
      if (target) {
        const oldName = target.name;
        const fields = readKpiTimeUnitFormFields(form, sanitizeNumericInput);
        target.name = (form.name.value || "").trim() || "행동";
        target.unit = fields.unit;
        target.targetValue = fields.targetValue;
        target.targetTimeRequired = fields.targetTimeRequired;
        target.targetStartDate = (form.targetStartDate?.value || "").trim() || "";
        target.targetDeadline = (form.targetDeadline.value || "").trim() || "";
        target.needHabitTracker = !!form.querySelector('input[name="needHabitTracker"]')?.checked;
        target.useTimeAsUnit = fields.useTimeAsUnit;
        target.direction =
          form.querySelector('input[name="direction"]:checked')?.value === "lower"
            ? "lower"
            : "higher";
        saveHealthMap(data);
        if (oldName !== target.name) syncKpiToTimeTask(target, "update", oldName);
      }
      close();
      refreshHealthAfterKpiDataChange();
    });
    document.body.appendChild(modal);
    initModalNativeDateFieldsIn(modal);
    setupDeadlineQuickButtons(modal);
    bindKpiUnitTimeMode(modal.querySelector(".dream-kpi-form"), kpi, kpiTimeFormOpts);
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

  function showKpiLogModal(kpi, editLog) {
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
          <h3 data-legacy="time-task-setup-title">${isEdit ? "로그 수정" : "오늘의 수치 기록"}</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-log-form">
          <div data-legacy="time-task-setup-body">
          ${kpi.direction === "lower" ? '<p class="dream-kpi-log-lower-hint">숫자가 <strong>작을수록</strong> 좋은 지표예요. 카드와 진행 막대에는 <strong>가장 최근에 입력한 숫자 하나</strong>만 반영하고, 예전 기록은 더하지 않아요.</p>' : ""}
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
                <label>KPI 항목</label>
                <input type="text" value="${escapeHtml(kpi.name)}${kpi.unit ? " (" + escapeHtml(kpi.unit) + ")" : ""}" readonly class="dream-kpi-log-readonly" />
              </div>
            </div>
            <div class="dream-kpi-log-row">
              <div class="dream-kpi-log-field">
                <label>${kpi.direction === "lower" ? "이날 대표값" : "오늘 측정값"}</label>
                <input type="text" name="value" placeholder="숫자 입력" value="${escapeHtml(valueVal)}" inputmode="numeric" />
              </div>
            </div>
            <div class="dream-kpi-log-field">
              <label>메모 (선택)</label>
              <textarea name="memo" placeholder="오늘 이 수치가 나온 이유, 특이사항 등..." rows="3">${escapeHtml(memoVal)}</textarea>
            </div>
          </div>
          </div>
          <div data-legacy="time-task-log-footer" class="dream-kpi-log-modal-footer">
            ${isEdit ? '<button type="button" class="dream-kpi-log-modal-delete-btn" data-legacy="time-task-log-delete-btn">삭제</button>' : ""}
            <button type="submit" data-legacy="time-task-log-submit">${isEdit ? "수정" : "로그 저장"}</button>
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
      const data = loadHealthMap();
      if (isEdit) {
        const idx = data.kpiLogs.findIndex((l) => l.id === editLog.id);
        if (idx >= 0) {
          const row = {
            ...data.kpiLogs[idx],
            date: dateStr,
            dateRaw: dateVal,
            value: sanitizeNumericInput(form.value.value) || "",
            memo: (form.memo.value || "").trim(),
          };
          delete row.status;
          data.kpiLogs[idx] = row;
        }
      } else {
        const log = {
          id: nextId(),
          kpiId: kpi.id,
          healthId: kpi.healthId,
          date: dateStr,
          dateRaw: dateVal,
          value: sanitizeNumericInput(form.value.value) || "",
          memo: (form.memo.value || "").trim(),
          ...defaultManualKpiLogMeta(),
        };
        data.kpiLogs = data.kpiLogs || [];
        data.kpiLogs.push(log);
      }
      saveHealthMap(data);
      close();
      refreshHealthAfterKpiDataChange();
    });
    const delBtn = modal.querySelector(".dream-kpi-log-modal-delete-btn");
    if (delBtn && isEdit) {
      delBtn.addEventListener("click", () => {
        const d = loadHealthMap();
        appendDeletedRef(d, "kpiLogs", editLog.id);
        d.kpiLogs = (d.kpiLogs || []).filter((l) => l.id !== editLog.id);
        saveHealthMap(d);
        close();
        refreshHealthAfterKpiDataChange();
      });
    }
    document.body.appendChild(modal);
    setupNumericOnlyInput(modal.querySelector('input[name="value"]'));
    initModalNativeDateFieldsIn(modal);
  }

  function clearHealthKpiFooterActions() {
    const slot = getAppFooterActionsSlot();
    if (!slot) return;
    slot
      .querySelectorAll("[data-lp-dream-kpi-footer-action]")
      .forEach((n) => n.remove());
  }

  function healthKpiFooterAddLabel(tab) {
    if (tab === KPI_BOTTOM_TAB_TODO) return "할 일 추가";
    if (tab === KPI_BOTTOM_TAB_DAILY) return "매일 할 일 추가";
    return "로그 추가";
  }

  async function runHealthKpiFooterAddAction() {
    const d = loadHealthMap();
    const k = (d.kpis || []).find((x) => x.id === selectedKpiId);
    if (!k) return;
    const tab = getKpiHistoryBottomTab("health", selectedKpiId);
    if (tab === KPI_BOTTOM_TAB_TODO) {
      const text = await showKpiTodoAddModal({
        kpiName: k.name,
        placeholder: "할 일 입력",
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
      saveHealthMap(d2);
      renderKpiDetailView({ scrollTodoAfterMutation: true });
      return;
    }
    if (tab === KPI_BOTTOM_TAB_DAILY) {
      const text = await showKpiTodoAddModal({
        kpiName: k.name,
        title: "매일 할 일 추가",
        placeholder: "할 일 입력 (매일 반복)",
      });
      if (!text) return;
      const d2 = loadHealthMap();
      d2.kpiDailyRepeatTodos = d2.kpiDailyRepeatTodos || [];
      d2.kpiDailyRepeatTodos.push({
        id: nextId(),
        kpiId: String(selectedKpiId),
        text,
        completed: false,
      });
      saveHealthMap(d2);
      renderKpiDetailView({ scrollTodoAfterMutation: true });
      return;
    }
    showKpiLogModal(k);
  }

  function syncAppFooterHealthKpiActions() {
    clearHealthKpiFooterActions();
    const slot = getAppFooterActionsSlot();
    if (!slot) return;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = APP_FOOTER_ICON_BTN_CLASS;
    addBtn.setAttribute("data-lp-dream-kpi-footer-action", "");
    addBtn.innerHTML = KPI_FOOTER_ADD_ICON;

    if (healthViewScreen === "goals") {
      const data = loadHealthMap();
      if (shouldShowKpiMapSyncLoading("health", !data.healths?.length)) return;
      addBtn.title = "건강 목표 추가";
      addBtn.setAttribute("aria-label", "건강 목표 추가");
      addBtn.addEventListener("click", () => {
        if (healthAddModalJustClosed) return;
        showHealthAddModal();
      });
      slot.appendChild(addBtn);
      return;
    }

    if (!activeHealthId) return;

    if (healthViewScreen === "kpis") {
      addBtn.title = "KPI 추가";
      addBtn.setAttribute("aria-label", "KPI 추가");
      addBtn.addEventListener("click", () => {
        if (!activeHealthId) return;
        showKpiModal();
      });
      slot.appendChild(addBtn);
      return;
    }

    if (healthViewScreen !== "kpiDetail" || !selectedKpiId) return;

    const data = loadHealthMap();
    const kpiNow = (data.kpis || []).find((k) => k.id === selectedKpiId);
    if (!kpiNow || kpiNow.healthId !== activeHealthId) return;

    const tab = getKpiHistoryBottomTab("health", selectedKpiId);
    const addLabel = healthKpiFooterAddLabel(tab);
    addBtn.title = addLabel;
    addBtn.setAttribute("aria-label", addLabel);
    addBtn.addEventListener("click", () => {
      void runHealthKpiFooterAddAction();
    });
    slot.appendChild(addBtn);
  }

  function getKpiLogs(kpiId) {
    const data = loadHealthMap();
    const logs = (data.kpiLogs || []).filter((l) => l.kpiId === kpiId);
    return sortKpiLogsNewestFirst(logs, data.kpiLogs);
  }

  function parseNum(str) {
    const n = parseFloat(String(str || "").replace(/[^0-9.-]/g, ""));
    return Number.isNaN(n) ? 0 : n;
  }

  function reorderKpis(healthId, orderedKpiIds) {
    const data = loadHealthMap();
    data.kpiOrder = data.kpiOrder || {};
    data.kpiOrder[healthId] = orderedKpiIds;
    saveHealthMap(data);
  }

  function getAccumulatedKpiValue(kpiId) {
    const logs = getKpiLogs(kpiId);
    return logs.reduce((sum, log) => sum + parseNum(log.value), 0);
  }

  function getKpiProgress(kpi) {
    return computeKpiProgress(kpi, {
      toDateKey,
      getAllKpiLogs: () => loadHealthMap().kpiLogs || [],
      getAccumulatedKpiValue,
      parseNum,
    });
  }

  function renderKpiList() {
    syncHabitTrackerLogs();
    const scopeId = activeHealthId;
    const savedGridScroll = readKpiGridScrollToRestore(
      contentWrap,
      kpiFilter,
      scopeId,
      kpiGridScrollPrevFilter,
      kpiGridScrollPrevScopeId,
    );
    historyWrap.remove();
    contentWrap.innerHTML = "";
    contentWrap.className = "dream-content-wrap";
    if (!activeHealthId) {
      kpiGridScrollPrevFilter = null;
      kpiGridScrollPrevScopeId = null;
      persistKpiUiState();
      historyWrap.hidden = true;
      el.appendChild(historyWrap);
      syncAppFooterHealthKpiActions();
      return;
    }
    const data = loadHealthMap();
    let healthKpis = (data.kpis || []).filter((k) => k.healthId === activeHealthId);
    const order = (data.kpiOrder || {})[activeHealthId];
    if (order && order.length > 0) {
      const orderMap = new Map(order.map((id, i) => [id, i]));
      healthKpis = [...healthKpis].sort((a, b) => {
        const ia = orderMap.has(a.id) ? orderMap.get(a.id) : 999;
        const ib = orderMap.has(b.id) ? orderMap.get(b.id) : 999;
        return ia - ib;
      });
    }
    /* 진행중 = 미완료 KPI만(시작일 없는 새 KPI 포함) — 꿈 탭과 동일 */
    const completedKpis = healthKpis.filter((k) => getKpiProgress(k).isCompleted);
    const activeKpis = healthKpis.filter((k) => !getKpiProgress(k).isCompleted);

    if (
      renderKpiMapSyncLoadingIfNeeded({
        tabId: "health",
        container: contentWrap,
        isEmpty: healthKpis.length === 0,
        onLoading: () => {
          historyWrap.hidden = true;
          el.appendChild(historyWrap);
          syncAppFooterHealthKpiActions();
        },
      })
    ) {
      return;
    }

    const filterBar = document.createElement("div");
    filterBar.className = "dream-kpi-filter-bar";
    filterBar.innerHTML = `
      <button type="button" class="dream-kpi-filter-btn ${kpiFilter === "all" ? "active" : ""}" data-filter="all">전체</button>
      <button type="button" class="dream-kpi-filter-btn ${kpiFilter === "active" ? "active" : ""}" data-filter="active">진행중</button>
      <button type="button" class="dream-kpi-filter-btn ${kpiFilter === "completed" ? "active" : ""}" data-filter="completed">완료</button>
    `;
    filterBar.querySelectorAll(".dream-kpi-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        kpiFilter = btn.dataset.filter;
        renderKpiList();
      });
    });
    contentWrap.appendChild(filterBar);

    const grid = document.createElement("div");
    grid.className = "dream-kpi-grid";
    const listToShow = kpiFilter === "active" ? activeKpis : kpiFilter === "completed" ? completedKpis : healthKpis;
    listToShow.forEach((kpi) => {
      const progressResult = getKpiProgress(kpi);
      const { lowerBetter } = progressResult;
      const formatNum = (n) => (n == null || Number.isNaN(n) ? "—" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
      const { displayProgress, progressText, heroStr, heroUnit, cardExtraClass } =
        buildKpiCardTimePresentation(kpi, progressResult, formatNum);
      const card = document.createElement("div");
      card.className =
        "dream-kpi-card" +
        (lowerBetter ? " dream-kpi-card--lower-better" : "") +
        cardExtraClass;
      card.dataset.kpiId = kpi.id;
      card.draggable = true;
      card.innerHTML = `
        <div class="dream-kpi-card-inner">
          ${KPI_CARD_EDIT_PENCIL_HTML}
          <div class="dream-kpi-card-name">${escapeHtml(kpi.name)}${lowerBetter ? '<span class="dream-kpi-card-direction-badge" title="낮을수록 좋음 KPI">↓낮음</span>' : ""}</div>
          <div class="dream-kpi-card-target-num">${formatKpiCardHeroHtml(lowerBetter, heroStr, heroUnit)}</div>
          ${(kpi.targetStartDate || kpi.targetDeadline) ? `<div class="dream-kpi-card-deadline">${escapeHtml(formatDeadlineRangeCompact(kpi.targetStartDate, kpi.targetDeadline))}</div>` : ""}
          <div class="dream-kpi-card-progress">
            <div class="dream-kpi-card-progress-bar"><div class="dream-kpi-card-progress-fill" style="width:${displayProgress}%"></div></div>
            <div class="dream-kpi-card-progress-text">${escapeHtml(progressText)}</div>
          </div>
        </div>
      `;
      card.querySelector(".dream-kpi-card-edit").addEventListener("click", (e) => {
        e.stopPropagation();
        showKpiEditModal(kpi);
      });
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
          reorderKpis(activeHealthId, newOrder);
          renderKpiList();
        }
      });
      grid.appendChild(card);
    });
    grid.addEventListener("dragend", () => {
      grid.querySelectorAll(".dream-kpi-card-drag-over").forEach((c) => c.classList.remove("dream-kpi-card-drag-over"));
    });
    contentWrap.appendChild(grid);

    applyKpiGridScrollRestore(contentWrap, savedGridScroll);
    kpiGridScrollPrevFilter = kpiFilter;
    kpiGridScrollPrevScopeId = scopeId;
    persistKpiUiState();
    syncAppFooterHealthKpiActions();
  }


  function renderKpiDetailView(opts = {}) {
    contentWrap.hidden = false;
    contentWrap.className = "dream-content-wrap dream-kpi-detail-wrap";
    contentWrap.innerHTML = "";
    if (!selectedKpiId) {
      exitToKpiList();
      return;
    }
    renderKpiHistory({ ...opts, target: contentWrap });
    syncAppFooterHealthKpiActions();
    persistKpiUiState();
  }

  function renderKpiHistory(opts = {}) {
    const { scrollTodoAfterMutation = false, target = historyWrap } = opts;
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
      exitToKpiList();
      return;
    }
    const needHabitTracker = !!kpi.needHabitTracker;
    const logs = getKpiLogs(selectedKpiId);
    const selKpi = String(selectedKpiId);
    const todos = (data.kpiTodos || []).filter(
      (t) => String(t.kpiId) === selKpi && (t.text || "").trim() !== "",
    );
    if (target === historyWrap) historyWrap.hidden = false;

    const hasDailyTab = needHabitTracker;

    const appendKpiDailyLogBlock = (parentEl) => {
      const div = document.createElement("div");
      div.className = "dream-kpi-history-divider";
      parentEl.appendChild(div);
      if (logs.length === 0) {
        const empty = document.createElement("p");
        empty.className = "dream-kpi-history-empty";
        empty.textContent = "아직 기록이 없습니다.";
        parentEl.appendChild(empty);
      } else {
        const list = document.createElement("div");
        list.className = "dream-kpi-history-list";
        logs.forEach((log) => {
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
          item.setAttribute("role", "button");
          item.setAttribute("tabindex", "0");
          item.title = "눌러서 수정";
          item.addEventListener("click", () => showKpiLogModal(kpi, log));
          item.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              showKpiLogModal(kpi, log);
            }
          });
          list.appendChild(item);
        });
        parentEl.appendChild(list);
      }
    };

    const segBar = document.createElement("div");
    segBar.className = "dream-kpi-bottom-seg-bar";
    segBar.setAttribute("role", "tablist");
    segBar.setAttribute("aria-label", "로그·할 일·매일 할 일 전환");

    const btnSegLog = document.createElement("button");
    btnSegLog.type = "button";
    btnSegLog.className = "dream-kpi-bottom-seg-btn";
    btnSegLog.textContent = "로그";
    btnSegLog.setAttribute("role", "tab");

    const btnSegTodo = document.createElement("button");
    btnSegTodo.type = "button";
    btnSegTodo.className = "dream-kpi-bottom-seg-btn";
    btnSegTodo.textContent = "할 일";
    btnSegTodo.setAttribute("role", "tab");

    let btnSegDaily = null;
    if (hasDailyTab) {
      btnSegDaily = document.createElement("button");
      btnSegDaily.type = "button";
      btnSegDaily.className = "dream-kpi-bottom-seg-btn";
      btnSegDaily.textContent = "매일할일";
      btnSegDaily.setAttribute("role", "tab");
    }

    segBar.appendChild(btnSegLog);
    segBar.appendChild(btnSegTodo);
    if (btnSegDaily) segBar.appendChild(btnSegDaily);

    const panelLogSeg = document.createElement("div");
    panelLogSeg.className =
      "dream-kpi-bottom-seg-panel dream-kpi-bottom-seg-panel--log";
    panelLogSeg.setAttribute("role", "tabpanel");
    appendKpiDailyLogBlock(panelLogSeg);

    const panelTodoSeg = document.createElement("div");
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
          title: "할 일 수정",
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
          saveHealthMap(d);
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
        saveHealthMap(d);
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
          saveHealthMap(d);
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

    if (todos.length === 0) {
      const emptyTodo = document.createElement("p");
      emptyTodo.className = "dream-kpi-history-empty";
      emptyTodo.textContent = "등록된 할 일이 없습니다.";
      panelTodoSeg.appendChild(emptyTodo);
    } else {
      panelTodoSeg.appendChild(todoList);
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
      const dailyTodos = (data.kpiDailyRepeatTodos || []).filter(
        (t) => String(t.kpiId) === selKpi && (t.text || "").trim() !== "",
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
          "KPI 화면에서는 체크 상태를 보여 주지 않습니다. 완료는 시간기록(과제 기록)에서만 체크하세요.";
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
          });
          if (!result) return;
          if (result.action === "delete") {
            const d = loadHealthMap();
            appendDeletedRef(d, "kpiDailyRepeatTodos", todo.id);
            d.kpiDailyRepeatTodos = (d.kpiDailyRepeatTodos || []).filter((x) => x.id !== todo.id);
            saveHealthMap(d);
            renderKpiDetailView({ scrollTodoAfterMutation: true });
            return;
          }
          const d = loadHealthMap();
          const row = (d.kpiDailyRepeatTodos || []).find((x) => x.id === todo.id);
          if (!row) return;
          row.text = result.text;
          saveHealthMap(d);
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
      panelDailySeg.appendChild(dailyList);
    }

    target.appendChild(segBar);
    target.appendChild(panelLogSeg);
    target.appendChild(panelTodoSeg);
    if (panelDailySeg) target.appendChild(panelDailySeg);

    wireKpiHistoryBottomTabs(
      "health",
      selectedKpiId,
      btnSegLog,
      btnSegTodo,
      btnSegDaily,
      panelLogSeg,
      panelTodoSeg,
      panelDailySeg,
      hasDailyTab,
      () => syncAppFooterHealthKpiActions(),
    );
    if (scrollTodoAfterMutation) {
      afterKpiTodoListMutationScroll(target);
    }
    syncAppFooterHealthKpiActions();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
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
              <input type="text" name="name" placeholder="신체적으로 건강해지기" />
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
      const val = (form.name.value || "").trim() || "새 건강";
      const data = loadHealthMap();
      const health = { id: nextId(), name: val };
      data.healths.push(health);
      saveHealthMap(data);
      selectedKpiId = null;
      healthAddModalJustClosed = true;
      close();
      healthViewScreen = "goals";
      activeHealthId = null;
      updateHealthView();
      setTimeout(() => { healthAddModalJustClosed = false; }, 300);
    };
    confirmBtn.addEventListener("click", doSubmit);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      doSubmit();
    });
    document.body.appendChild(modal);
  }

  function showHealthDeleteConfirmModal(healthId) {
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
      const healthKpis = (d.kpis || []).filter((k) => k.healthId === healthId);
      const kpiIds = healthKpis.map((k) => k.id);
      healthKpis.forEach((k) => {
        appendDeletedRef(d, "kpis", k.id);
        syncKpiToTimeTask(k, "remove");
      });
      d.healths = (d.healths || []).filter((x) => x.id !== healthId);
      d.kpis = (d.kpis || []).filter((k) => k.healthId !== healthId);
      d.kpiLogs = (d.kpiLogs || []).filter((l) => !kpiIds.includes(l.kpiId));
      d.kpiTodos = (d.kpiTodos || []).filter((t) => !kpiIds.includes(t.kpiId));
      d.kpiDailyRepeatTodos = (d.kpiDailyRepeatTodos || []).filter((t) => !kpiIds.includes(t.kpiId));
      delete d.kpiOrder?.[healthId];
      d.kpiTaskSync = d.kpiTaskSync || {};
      kpiIds.forEach((id) => delete d.kpiTaskSync[id]);
      saveHealthMap(d);
      if (activeHealthId === healthId) {
        activeHealthId = d.healths[0]?.id || null;
        selectedKpiId = null;
        if (!activeHealthId) healthViewScreen = "goals";
      }
      syncHealthHeader();
      updateHealthView();
    });
    document.body.appendChild(modal);
  }

  function showHealthContextModal(health, tabEl) {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel" class="dream-path-context-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">건강 수정</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form dream-path-edit-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>건강 이름</label>
              <input type="text" name="name" value="${escapeHtml(health.name || "")}" placeholder="신체적으로 건강해지기" />
            </div>
            <div class="dream-kpi-delete-wrap">
              <button type="button" class="dream-kpi-delete-btn" data-action="delete">건강 목표 삭제</button>
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
      const val = (e.target.name.value || "").trim() || "건강 이름";
      const d = loadHealthMap();
      const target = d.healths.find((x) => x.id === health.id);
      if (target) {
        target.name = val;
        saveHealthMap(d);
        syncHealthHeader();
        updateHealthView();
      }
      close();
    });
    modal.querySelector('[data-action="delete"]').addEventListener("click", () => {
      close();
      showHealthDeleteConfirmModal(health.id);
    });
    document.body.appendChild(modal);
  }

  function renderHealthGoalsList() {
    historyWrap.hidden = true;
    historyWrap.innerHTML = "";
    contentWrap.hidden = false;
    contentWrap.className = "dream-content-wrap";
    contentWrap.innerHTML = "";
    syncAppFooterHealthKpiActions();

    const list = document.createElement("div");
    list.className = "dream-goals-list";
    const data = loadHealthMap();

    if (
      renderKpiMapSyncLoadingIfNeeded({
        tabId: "health",
        container: contentWrap,
        isEmpty: !data.healths.length,
        onLoading: () => syncAppFooterHealthKpiActions(),
      })
    ) {
      return;
    }

    if (!data.healths.length) {
      const empty = document.createElement("p");
      empty.className = "dream-goals-empty";
      empty.textContent = "건강 목표를 추가해 보세요.";
      list.appendChild(empty);
    }

    data.healths.forEach((health) => {
      const kpiCount = (data.kpis || []).filter((k) => k.healthId === health.id)
        .length;
      const item = document.createElement("div");
      item.className = "dream-goals-item dream-kpi-card";
      item.innerHTML = `
        <div class="dream-kpi-card-inner">
          ${HEALTH_GOAL_EDIT_PENCIL_HTML}
          <div class="dream-goals-item-name">${escapeHtml(health.name || "건강 이름")}</div>
          <div class="dream-goals-item-meta">KPI ${kpiCount}개</div>
        </div>
      `;
      item.querySelector(".dream-kpi-card-edit").addEventListener("click", (e) => {
        e.stopPropagation();
        showHealthContextModal(health, item);
      });
      item.addEventListener("click", (e) => {
        if (e.target.closest(".dream-kpi-card-edit")) return;
        enterKpiView(health.id);
      });
      list.appendChild(item);
    });

    contentWrap.appendChild(list);
    persistKpiUiState();
  }

  function updateHealthView() {
    syncHealthHeader();
    historyWrap.hidden = true;
    historyWrap.innerHTML = "";
    if (healthViewScreen === "goals") {
      renderHealthGoalsList();
      return;
    }
    const data = loadHealthMap();
    const health = data.healths.find((h) => h.id === activeHealthId);
    if (health) {
      if (healthViewScreen === "kpiDetail") {
        renderKpiDetailView();
      } else {
        contentWrap.hidden = false;
        contentWrap.className = "dream-content-wrap";
        renderKpiList();
      }
    } else {
      exitToHealthGoalsList();
    }
    persistKpiUiState();
  }

  function reconcileScopeWithStoredMap(data) {
    const healths = data?.healths || [];
    const kpis = data?.kpis || [];
    const inKpiFlow = healthViewScreen === "kpis" || healthViewScreen === "kpiDetail";
    if (inKpiFlow) {
      if (!healths.some((h) => h.id === activeHealthId)) {
        activeHealthId = healths[0]?.id || null;
        selectedKpiId = null;
        healthViewScreen = activeHealthId ? "kpis" : "goals";
      }
    } else {
      activeHealthId = null;
      selectedKpiId = null;
    }
    if (selectedKpiId && !kpis.some((k) => k.id === selectedKpiId)) {
      selectedKpiId = null;
      if (healthViewScreen === "kpiDetail") healthViewScreen = "kpis";
    }
  }

  reconcileScopeWithStoredMap(_healthInitData);
  syncHealthHeader();
  updateHealthView();
  let lastKpiMapPaintSig = readKpiMapLocalStorageSignature(
    HEALTH_KPI_MAP_STORAGE_KEY,
  );

  function syncHealthUiFromStoredMap() {
    if (!el.isConnected) return;
    const nextSig = readKpiMapLocalStorageSignature(HEALTH_KPI_MAP_STORAGE_KEY);
    if (nextSig === lastKpiMapPaintSig) return;
    lastKpiMapPaintSig = nextSig;
    const data = loadHealthMap();
    const inKpiFlow = healthViewScreen === "kpis" || healthViewScreen === "kpiDetail";
    if (inKpiFlow) {
      if (!data.healths.some((h) => h.id === activeHealthId)) {
        activeHealthId = data.healths[0]?.id || null;
        selectedKpiId = null;
        healthViewScreen = activeHealthId ? "kpis" : "goals";
      }
    } else {
      activeHealthId = null;
      selectedKpiId = null;
    }
    if (selectedKpiId && !data.kpis.some((k) => k.id === selectedKpiId)) {
      selectedKpiId = null;
      if (healthViewScreen === "kpiDetail") healthViewScreen = "kpis";
    }
    syncHealthHeader();
    updateHealthView();
    persistKpiUiState();
  }

  const onMergedSync = (e) => {
    if (!el.isConnected) return;
    /* push 시에는 화면 갱신 불필요 (로컬 변경을 서버에 올린 것이므로) */
    if (e.detail?.fromPush) return;
    if (!e.detail?.fromServerMerge && !e.detail?.fromLocalWrite) return;
    syncHealthUiFromStoredMap();
  };
  window.addEventListener("health-kpi-map-saved", onMergedSync);
  window.addEventListener("lp-kpi-tab-pull-settled", (e) => {
    if (!el.isConnected || e.detail?.tabId !== "health") return;
    updateHealthView();
  });
  window.__lpHealthSoftRefresh = syncHealthUiFromStoredMap;
  window.__lpHealthFooterBack = () => {
    if (!el.isConnected) return false;
    if (healthViewScreen === "kpiDetail") {
      exitToKpiList();
      return true;
    }
    if (healthViewScreen === "kpis") {
      exitToHealthGoalsList();
      return true;
    }
    return false;
  };

  return el;
}
