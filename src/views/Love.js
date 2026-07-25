/**
 * 행복 페이지 - 꿈/부수입과 동일한 KPI 구조
 * 행복 추가 시 탭 형성, KPI 카드, 로그, 할일
 */

import {
  kpiTimeTaskEnsure,
  kpiTimeTaskRemove,
  kpiTimeTaskRename,
  getFullTaskOptions,
} from "../utils/timeTaskOptionsModel.js";
import {
  readKpiMapScopedStorageRaw,
  writeKpiMapScopedStorageRaw,
} from "../utils/kpiMapLocalStorage.js";
import {
  HAPPINESS_KPI_MAP_STORAGE_KEY,
  applyHappinessKpiTimestampsOnSave,
} from "../utils/happinessKpiMapSupabase.js";
import {
  getAccumulatedMinutesForKpi,
  minutesToHhMm,
  hhMmToMinutes,
  syncHabitTrackerLogs,
} from "../utils/timeKpiSync.js";
import {
  resolveKpiDetailLogEntriesPrepared,
  resolveKpiDetailLogEntriesLocal,
  kpiDetailLogsNeedCloudPull,
} from "../utils/kpiTimeLedgerLogs.js";
import { confirmKpiActionDelete } from "../utils/confirmModal.js";
import { kpiLogSourceBadgeHtml, formatKpiHistoryValueText } from "../utils/kpiLogFields.js";
import { createKpiHabitGridElement } from "../utils/kpiHabitTrackerGrid.js";
import { computeKpiHabitCurrentStreak, computeKpiHabitTotalDays } from "../utils/kpiHabitStreak.js";
import {
  validateKpiActionForm,
  bindKpiFormValidationClear,
} from "../utils/kpiTimeUnitKpi.js";
import { wireKpiHistoryHabitTabs } from "../utils/kpiHistoryHabitTabs.js";
import {
  applyKpiGridScrollRestore,
  readKpiGridScrollToRestore,
} from "../utils/kpiGridScrollRestore.js";
import { appendKpiCardToGrid } from "../utils/kpiCardDeadlineFoot.js";
import {
  afterKpiTodoListMutationScroll,
  captureKpiDetailScroll,
} from "../utils/kpiTodoInputScroll.js";
import {
  KPI_UI_SESSION_KEYS,
  readKpiUiSession,
  writeKpiUiSession,
  restoreKpiTabFromSession,
} from "../utils/kpiViewUiSession.js";
import {
  deletedRefsKpiTodosLen,
  kpiTodoLifecycleLog,
  kpiTodoSnapshotBrief,
  kpiTodosCompletionBrief,
} from "../utils/kpiTodoLifecycleDebug.js";
import { showKpiTodoAddModal } from "../utils/kpiTodoAddModal.js";
import {
  appendKpiDailyRepeatTodoAtEnd,
  sortNormalizedKpiTodoRows,
} from "../utils/kpiMapTodoListOrder.js";
import { formatKpiCardHeroHtml } from "../utils/kpiViewModal.js";
import { showKpiTodoEditModal } from "../utils/kpiTodoEditModal.js";
import {
  KPI_CARD_EDIT_PENCIL_HTML,
  KPI_TAB_EDIT_PENCIL_HTML,
  bindKpiCardEditButton,
} from "../utils/kpiTabNameEditIcon.js";
import { sortKpiLogsNewestFirst } from "../utils/kpiLogsSort.js";
import {
  APP_FOOTER_ICON_BTN_CLASS,
  getAppFooterActionsSlot,
} from "../utils/appFooterShell.js";

const FIXED_TASK_NAMES = new Set(["수면하기", "근무하기"]);

const LOVE_FOOTER_TODO_ICON = `<img src="/toolbaricons/todolist.png" alt="" width="22" height="22" aria-hidden="true" />`;

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

function loadHappinessMap() {
  try {
    const raw = readKpiMapScopedStorageRaw(HAPPINESS_KPI_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        happinesses: parsed.happinesses || [],
        kpis: parsed.kpis || [],
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
    happinesses: [],
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
  return typeof o === "string" ? o : o?.name || "";
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
      toSave.kpiTodos = toSave.kpiTodos.filter(
        (t) => (t.text || "").trim() !== "",
      );
    }
    if (toSave.kpiDailyRepeatTodos && Array.isArray(toSave.kpiDailyRepeatTodos)) {
      toSave.kpiDailyRepeatTodos = toSave.kpiDailyRepeatTodos.filter(
        (t) => (t.text || "").trim() !== "",
      );
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

function setupNumericOnlyInput(inp) {
  inp.addEventListener("input", () => {
    const pos = inp.selectionStart;
    const sanitized = sanitizeNumericInput(inp.value);
    if (inp.value !== sanitized) {
      inp.value = sanitized;
      inp.setSelectionRange(
        Math.min(pos, sanitized.length),
        Math.min(pos, sanitized.length),
      );
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
      inp.setSelectionRange(
        Math.min(pos, sanitized.length),
        Math.min(pos, sanitized.length),
      );
    }
  });
}

function calcDaysBetween(startYmd, endYmd) {
  if (
    !startYmd ||
    !endYmd ||
    typeof startYmd !== "string" ||
    typeof endYmd !== "string"
  )
    return 0;
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
  el.className = "app-tab-panel-content happiness-view dream-view lp-kpi-dream-page";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "dream-add-icon-btn";
  addBtn.title = "행복 목표 추가";
  addBtn.setAttribute("aria-label", "행복 목표 추가");
  addBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="dream-add-icon" aria-hidden="true" width="24" height="24"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m12 8v8"/><path d="m8 12h8"/><path d="m18 22h-12c-2.209 0-4-1.791-4-4v-12c0-2.209 1.791-4 4-4h12c2.209 0 4 1.791 4 4v12c0 2.209-1.791 4-4 4z"/></g></svg>`;
  addBtn.addEventListener("click", () => {
    if (happinessAddModalJustClosed) return;
    showHappinessAddModal();
  });

  const header = document.createElement("header");
  header.className = "dream-view-header";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "LOVE";
  const titleRow = document.createElement("div");
  titleRow.className = "dream-view-header-title-row";
  const title = document.createElement("h1");
  title.className = "dream-view-title";
  title.textContent = "행복";
  titleRow.appendChild(title);
  header.appendChild(label);
  header.appendChild(titleRow);
  el.appendChild(header);

  const tabsWrap = document.createElement("div");
  tabsWrap.className = "dream-tabs-wrap";
  const tabs = document.createElement("div");
  tabs.className = "dream-tabs";
  tabsWrap.appendChild(addBtn);
  tabsWrap.appendChild(tabs);
  el.appendChild(tabsWrap);

  const contentWrap = document.createElement("div");
  contentWrap.className = "dream-content-wrap";
  el.appendChild(contentWrap);

  const historyWrap = document.createElement("div");
  historyWrap.className = "dream-kpi-history-wrap";
  historyWrap.hidden = true;
  el.appendChild(historyWrap);

  let activeHappinessId = null;
  let selectedKpiId = null;
  let kpiFilter = "all";
  let kpiGridScrollPrevFilter = null;
  let kpiGridScrollPrevScopeId = null;
  let happinessAddModalJustClosed = false;

  const _loveUiSession = readKpiUiSession(KPI_UI_SESSION_KEYS.love);
  const _loveInitData = loadHappinessMap();
  const _loveRestored = restoreKpiTabFromSession(_loveUiSession, {
    categoryIds: _loveInitData.happinesses || [],
    kpis: _loveInitData.kpis || [],
    foreignKey: "happinessId",
  });
  if (_loveRestored.tabId) activeHappinessId = _loveRestored.tabId;
  selectedKpiId = _loveRestored.selectedKpiId;
  kpiFilter = _loveRestored.kpiFilter;

  function persistKpiUiState() {
    writeKpiUiSession(KPI_UI_SESSION_KEYS.love, {
      tabId: activeHappinessId,
      selectedKpiId,
      kpiFilter,
    });
  }

  function showKpiModal() {
    if (!activeHappinessId) return;
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
            <div class="dream-kpi-row">
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                <label>목표값</label>
                <input type="text" name="targetValue" placeholder="20" inputmode="numeric" />
              </div>
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                <label>단위</label>
                <input type="text" name="unit" placeholder="권" />
              </div>
            </div>
            <div class="dream-kpi-field dream-kpi-field-checkbox" data-legacy="time-add-task-field">
              <label class="dream-kpi-checkbox-label">
                매일 반복
                <input type="checkbox" name="needHabitTracker" />
              </label>
            </div>
          </div>
          <div data-legacy="time-task-log-footer">
            <button type="submit" data-legacy="time-task-log-submit">저장</button>
          </div>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal
      .querySelector('[data-legacy~="time-task-setup-close"]')
      .addEventListener("click", close);
    modal.querySelector(".dream-kpi-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      if (!validateKpiActionForm(form, { sanitizeNumericInput })) return;
      const kpi = {
        id: nextId(),
        happinessId: activeHappinessId,
        name: (form.name.value || "").trim(),
        unit: (form.unit.value || "").trim() || "",
        targetValue: sanitizeNumericInput(form.targetValue.value) || "",
        needHabitTracker: !!form.needHabitTracker?.checked,
      };
      const data = loadHappinessMap();
      data.kpis = data.kpis || [];
      const existingOrder =
        (data.kpiOrder || {})[activeHappinessId] ||
        data.kpis
          .filter((k) => k.happinessId === activeHappinessId)
          .map((k) => k.id);
      data.kpis.push(kpi);
      data.kpiOrder = data.kpiOrder || {};
      data.kpiOrder[activeHappinessId] = [...existingOrder, kpi.id];
      saveHappinessMap(data, { pushServer: true });
      syncKpiToTimeTask(kpi, "add");
      close();
      renderKpiList();
    });
    document.body.appendChild(modal);
    setupNumericOnlyInput(modal.querySelector('input[name="targetValue"]'));
    bindKpiFormValidationClear(modal.querySelector(".dream-kpi-form"));
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
              <input type="text" name="name" value="${escapeHtml(kpi.name || "")}" placeholder="예) 독서하기" />
            </div>
            <div class="dream-kpi-row">
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                <label>목표값</label>
                <input type="text" name="targetValue" value="${escapeHtml(sanitizeNumericInput(kpi.targetValue))}" placeholder="20" inputmode="numeric" />
              </div>
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                <label>단위</label>
                <input type="text" name="unit" value="${escapeHtml(kpi.unit || "")}" placeholder="권" />
              </div>
            </div>
            <div class="dream-kpi-field dream-kpi-field-checkbox" data-legacy="time-add-task-field">
              <label class="dream-kpi-checkbox-label">
                매일 반복
                <input type="checkbox" name="needHabitTracker" ${kpi.needHabitTracker ? "checked" : ""} />
              </label>
            </div>
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
    modal
      .querySelector('[data-legacy~="time-task-setup-close"]')
      .addEventListener("click", close);
    modal
      .querySelector(".dream-kpi-delete-btn")
      .addEventListener("click", () => {
        void confirmKpiActionDelete(kpi.name).then((ok) => {
          if (!ok) return;
          syncKpiToTimeTask(kpi, "remove");
          const data = loadHappinessMap();
          appendDeletedRef(data, "kpis", kpi.id);
          data.kpis = (data.kpis || []).filter((k) => k.id !== kpi.id);
          data.kpiLogs = (data.kpiLogs || []).filter((l) => l.kpiId !== kpi.id);
          data.kpiTodos = (data.kpiTodos || []).filter((t) => t.kpiId !== kpi.id);
          data.kpiDailyRepeatTodos = (data.kpiDailyRepeatTodos || []).filter(
            (t) => t.kpiId !== kpi.id,
          );
          const order = (data.kpiOrder || {})[kpi.happinessId] || [];
          data.kpiOrder = {
            ...data.kpiOrder,
            [kpi.happinessId]: order.filter((id) => id !== kpi.id),
          };
          saveHappinessMap(data, { pushServer: true });
          selectedKpiId = null;
          close();
          renderKpiList();
          renderKpiHistory();
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
        target.name = (form.name.value || "").trim();
        target.unit = (form.unit.value || "").trim() || "";
        target.targetValue = sanitizeNumericInput(form.targetValue.value) || "";
        target.needHabitTracker = !!form.needHabitTracker?.checked;
        saveHappinessMap(data, { pushServer: true });
        if (oldName !== target.name)
          syncKpiToTimeTask(target, "update", oldName);
      }
      close();
      renderKpiList();
      renderKpiHistory();
    });
    document.body.appendChild(modal);
    setupNumericOnlyInput(modal.querySelector('input[name="targetValue"]'));
    bindKpiFormValidationClear(modal.querySelector(".dream-kpi-form"));
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


  function clearLoveKpiFooterActions() {
    const slot = getAppFooterActionsSlot();
    if (!slot) return;
    slot
      .querySelectorAll("[data-lp-dream-kpi-footer-action]")
      .forEach((n) => n.remove());
  }

  function syncAppFooterLoveKpiActions() {
    clearLoveKpiFooterActions();
    const slot = getAppFooterActionsSlot();
    if (!slot) return;
    if (!selectedKpiId || !activeHappinessId) return;
    const data = loadHappinessMap();
    const kpiNow = (data.kpis || []).find((k) => k.id === selectedKpiId);
    if (!kpiNow || kpiNow.happinessId !== activeHappinessId) return;


    const todoBtn = document.createElement("button");
    todoBtn.type = "button";
    todoBtn.className = APP_FOOTER_ICON_BTN_CLASS;
    todoBtn.setAttribute("data-lp-dream-kpi-footer-action", "");
    todoBtn.title = "할 일 추가";
    todoBtn.setAttribute("aria-label", "할 일 추가");
    todoBtn.innerHTML = LOVE_FOOTER_TODO_ICON;
    todoBtn.addEventListener("click", async () => {
      const d = loadHappinessMap();
      const k = (d.kpis || []).find((x) => x.id === selectedKpiId);
      if (!k) return;
      const text = await showKpiTodoAddModal({
        kpiName: k.name,
        placeholder: "할 일 입력",
      });
      if (!text) return;
      const d2 = loadHappinessMap();
      const todo = {
        id: nextId(),
        kpiId: String(selectedKpiId),
        text,
        completed: false,
      };
      d2.kpiTodos = d2.kpiTodos || [];
      d2.kpiTodos.push(todo);
      saveHappinessMap(d2, { pushServer: true });
      renderKpiHistory({ scrollTodoAfterMutation: true });
    });

    const dailyTodoBtn = document.createElement("button");
    dailyTodoBtn.type = "button";
    dailyTodoBtn.className = APP_FOOTER_ICON_BTN_CLASS;
    dailyTodoBtn.setAttribute("data-lp-dream-kpi-footer-action", "");
    dailyTodoBtn.title = "매일 할 일 추가";
    dailyTodoBtn.setAttribute("aria-label", "매일 할 일 추가");
    dailyTodoBtn.innerHTML = LOVE_FOOTER_TODO_ICON;
    dailyTodoBtn.addEventListener("click", async () => {
      const d = loadHappinessMap();
      const k = (d.kpis || []).find((x) => x.id === selectedKpiId);
      if (!k) return;
      const text = await showKpiTodoAddModal({
        kpiName: k.name,
        title: "매일 할 일 추가",
        placeholder: "할 일 입력 (매일 반복)",
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
      renderKpiHistory({ scrollTodoAfterMutation: true });
    });

    slot.appendChild(logBtn);
    if (kpiNow.needHabitTracker) {
      slot.appendChild(dailyTodoBtn);
    } else {
      slot.appendChild(todoBtn);
    }
  }

  function getLatestKpiLog(kpiId) {
    const data = loadHappinessMap();
    const logs = (data.kpiLogs || []).filter((l) => l.kpiId === kpiId);
    if (logs.length === 0) return null;
    const sorted = sortKpiLogsNewestFirst(logs, data.kpiLogs);
    return sorted[0];
  }

  function getKpiLogs(kpiId) {
    const data = loadHappinessMap();
    const logs = (data.kpiLogs || []).filter((l) => l.kpiId === kpiId);
    return sortKpiLogsNewestFirst(logs, data.kpiLogs);
  }

  function parseNum(str) {
    const n = parseFloat(String(str || "").replace(/[^0-9.-]/g, ""));
    return Number.isNaN(n) ? 0 : n;
  }

  function reorderKpis(happinessId, orderedKpiIds) {
    const data = loadHappinessMap();
    data.kpiOrder = data.kpiOrder || {};
    data.kpiOrder[happinessId] = orderedKpiIds;
    saveHappinessMap(data);
  }

  function getAccumulatedKpiValue(kpiId) {
    const logs = getKpiLogs(kpiId);
    return logs.reduce((sum, log) => sum + parseNum(log.value), 0);
  }

  function getKpiProgress(kpi) {
    const currentVal = getAccumulatedKpiValue(kpi.id);
    const targetVal = parseNum(kpi.targetValue);
    const progress =
      targetVal > 0 ? Math.min(100, (currentVal / targetVal) * 100) : 0;
    const targetMins = kpi.targetTimeRequired
      ? hhMmToMinutes(kpi.targetTimeRequired)
      : 0;
    const accumulatedMins =
      targetMins > 0 ? getAccumulatedMinutesForKpi(kpi) : 0;
    const timeProgress =
      targetMins > 0 ? Math.min(100, (accumulatedMins / targetMins) * 100) : 0;
    const isCompleted =
      progress >= 100 || (targetMins > 0 && timeProgress >= 100);
    const isInProgress = !isCompleted;
    return {
      progress,
      timeProgress,
      currentVal,
      targetVal,
      targetMins,
      accumulatedMins,
      isCompleted,
      isInProgress,
    };
  }

  function renderKpiList() {
    syncHabitTrackerLogs();
    const scopeId = activeHappinessId;
    const savedGridScroll = readKpiGridScrollToRestore(
      contentWrap,
      kpiFilter,
      scopeId,
      kpiGridScrollPrevFilter,
      kpiGridScrollPrevScopeId,
    );
    historyWrap.remove();
    contentWrap.innerHTML = "";
    if (!activeHappinessId) {
      kpiGridScrollPrevFilter = null;
      kpiGridScrollPrevScopeId = null;
      persistKpiUiState();
      historyWrap.hidden = true;
      el.appendChild(historyWrap);
      syncAppFooterLoveKpiActions();
      return;
    }
    const data = loadHappinessMap();
    let happinessKpis = (data.kpis || []).filter(
      (k) => k.happinessId === activeHappinessId,
    );
    const order = (data.kpiOrder || {})[activeHappinessId];
    if (order && order.length > 0) {
      const orderMap = new Map(order.map((id, i) => [id, i]));
      happinessKpis = [...happinessKpis].sort((a, b) => {
        const ia = orderMap.has(a.id) ? orderMap.get(a.id) : 999;
        const ib = orderMap.has(b.id) ? orderMap.get(b.id) : 999;
        return ia - ib;
      });
    }
    /* 진행중 = 목표 미달성, 완료 = 목표 달성 */
    const completedKpis = happinessKpis.filter(
      (k) => getKpiProgress(k).isCompleted,
    );
    const activeKpis = happinessKpis.filter(
      (k) => !getKpiProgress(k).isCompleted,
    );

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
        /* 필터 변경 시 선택된 KPI가 새 필터에 없으면 선택 해제 */
        const listAfterFilter = kpiFilter === "active" ? activeKpis : kpiFilter === "completed" ? completedKpis : happinessKpis;
        if (selectedKpiId && !listAfterFilter.some((k) => k.id === selectedKpiId)) {
          selectedKpiId = null;
        }
        renderKpiList();
        renderKpiHistory();
      });
    });
    contentWrap.appendChild(filterBar);

    const grid = document.createElement("div");
    grid.className = "dream-kpi-grid";
    const listToShow =
      kpiFilter === "active"
        ? activeKpis
        : kpiFilter === "completed"
          ? completedKpis
          : happinessKpis;
    let historyAnchoredUnderCard = false;
    listToShow.forEach((kpi) => {
      const {
        progress,
        timeProgress,
        currentVal,
        targetVal,
        targetMins,
        accumulatedMins,
      } = getKpiProgress(kpi);
      const investedMins = getAccumulatedMinutesForKpi(kpi);
      const unitSuffix = kpi.unit ? " " + kpi.unit : "";
      const formatNum = (n) =>
        n == null || Number.isNaN(n)
          ? "—"
          : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      const isHabit = !!kpi.needHabitTracker;
      const habitLogs = isHabit ? getKpiLogs(kpi.id) : [];
      const habitTotalDays = isHabit ? computeKpiHabitTotalDays(kpi, habitLogs) : 0;
      const habitStreak = isHabit
        ? computeKpiHabitCurrentStreak(kpi, habitLogs, toDateKey(new Date()))
        : 0;
      const currentStr = formatNum(currentVal);
      const targetStr = kpi.targetValue
        ? escapeHtml(
            String(kpi.targetValue).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
          )
        : "—";
      const progressText = isHabit
        ? habitStreak > 0
          ? `연속 ${habitStreak}일째!`
          : "연속 0일"
        : `${currentStr} / ${targetStr}${unitSuffix}`;
      const heroHtml = isHabit
        ? formatKpiCardHeroHtml(false, String(habitTotalDays), "일", "총 ")
        : formatKpiCardHeroHtml(false, currentStr, kpi.unit);
      const progressHtml = isHabit
        ? `<div class="dream-kpi-card-progress dream-kpi-card-progress--habit"><div class="dream-kpi-card-progress-text">${escapeHtml(progressText)}</div></div>`
        : `<div class="dream-kpi-card-progress">
            <div class="dream-kpi-card-progress-bar"><div class="dream-kpi-card-progress-fill" style="width:${progress}%"></div></div>
            <div class="dream-kpi-card-progress-text">${escapeHtml(progressText)}</div>
          </div>`;
      const targetTimeDisplay = kpi.targetTimeRequired
        ? minutesToHhMm(String(kpi.targetTimeRequired).includes(":") ? hhMmToMinutes(kpi.targetTimeRequired) : (parseInt(kpi.targetTimeRequired, 10) || 0))
        : "";
      const investedTimeHtml = targetTimeDisplay
        ? `지금까지 투자한 시간 <span class="dream-kpi-card-invested-value">${minutesToHhMm(investedMins)}</span> / <span class="dream-kpi-card-invested-value">${targetTimeDisplay}</span>`
        : `지금까지 투자한 시간 <span class="dream-kpi-card-invested-value">${minutesToHhMm(investedMins)}</span>`;
      const card = document.createElement("div");
      card.className =
        "dream-kpi-card" +
        (isHabit ? " dream-kpi-card--habit" : "") +
        (selectedKpiId === kpi.id ? " is-selected" : "");
      card.dataset.kpiId = kpi.id;
      card.draggable = true;
      card.innerHTML = `
        <div class="dream-kpi-card-inner">
          ${KPI_CARD_EDIT_PENCIL_HTML}
          <div class="dream-kpi-card-name">${escapeHtml(kpi.name)}</div>
          <div class="dream-kpi-card-target-num">${heroHtml}</div>
          ${progressHtml}
          <div class="dream-kpi-card-invested">${investedTimeHtml}</div>
        </div>
      `;
      bindKpiCardEditButton(card.querySelector(".dream-kpi-card-edit"), () =>
        showKpiEditModal(kpi),
      );
      card.addEventListener("click", (e) => {
        if (e.target.closest(".dream-kpi-card-edit")) return;
        selectedKpiId = selectedKpiId === kpi.id ? null : kpi.id;
        renderKpiList();
        renderKpiHistory();
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
          reorderKpis(activeHappinessId, newOrder);
          renderKpiList();
          renderKpiHistory();
        }
      });
      appendKpiCardToGrid(grid, card, kpi, escapeHtml);
      if (selectedKpiId === kpi.id) {
        grid.appendChild(historyWrap);
        historyAnchoredUnderCard = true;
      }
    });
    grid.addEventListener("dragend", () => {
      grid
        .querySelectorAll(".dream-kpi-card-drag-over")
        .forEach((c) => c.classList.remove("dream-kpi-card-drag-over"));
    });
    if (!historyAnchoredUnderCard) {
      grid.appendChild(historyWrap);
    }
    if (!selectedKpiId) {
      const addCard = document.createElement("button");
      addCard.type = "button";
      addCard.className = "dream-kpi-add-card";
      addCard.innerHTML =
        '<span class="dream-kpi-add-card-text">+ KPI 추가하기</span>';
      addCard.addEventListener("click", () => {
        if (!activeHappinessId) return;
        showKpiModal();
      });
      grid.appendChild(addCard);
    }
    contentWrap.appendChild(grid);

    applyKpiGridScrollRestore(contentWrap, savedGridScroll);
    kpiGridScrollPrevFilter = kpiFilter;
    kpiGridScrollPrevScopeId = scopeId;
    persistKpiUiState();
    syncAppFooterLoveKpiActions();
  }

  async function renderKpiHistory(opts = {}) {
    syncHabitTrackerLogs();
    const { scrollTodoAfterMutation = false } = opts;
    const scrollSnap = scrollTodoAfterMutation
      ? captureKpiDetailScroll(historyWrap)
      : null;
    historyWrap.innerHTML = "";
    if (!selectedKpiId) {
      historyWrap.hidden = true;
      syncAppFooterLoveKpiActions();
      return;
    }
    const data = loadHappinessMap();
    const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
    if (!kpi) {
      historyWrap.hidden = true;
      selectedKpiId = null;
      renderKpiList();
      return;
    }
    const needHabitTracker = !!kpi.needHabitTracker;
    const storedLogs = getKpiLogs(selectedKpiId);
    const logs = resolveKpiDetailLogEntriesLocal(kpi, storedLogs);
    const selKpi = String(selectedKpiId);
    const todos = (data.kpiTodos || []).filter(
      (t) => String(t.kpiId) === selKpi && (t.text || "").trim() !== "",
    );
    historyWrap.hidden = false;

    const headerRow = document.createElement("div");
    headerRow.className = "dream-kpi-history-header";
    headerRow.innerHTML = `
      <h4 class="dream-kpi-history-title">${escapeHtml(kpi.name)} 기록</h4>
    `;
    historyWrap.appendChild(headerRow);

    const dailyTodosForGrid = needHabitTracker
      ? sortNormalizedKpiTodoRows(
          (data.kpiDailyRepeatTodos || []).filter(
            (t) => String(t.kpiId) === selKpi && (t.text || "").trim() !== "",
          ),
        )
      : [];
    const useHabitTabs = needHabitTracker && dailyTodosForGrid.length > 0;
    let loveLogPanelEl = null;

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

    if (useHabitTabs) {
      const tabsRow = document.createElement("div");
      tabsRow.className = "dream-kpi-filter-bar dream-kpi-history-habit-subtabs";
      tabsRow.setAttribute("role", "tablist");
      const btnLog = document.createElement("button");
      btnLog.type = "button";
      btnLog.className = "dream-kpi-filter-btn";
      btnLog.textContent = "로그보기";
      btnLog.setAttribute("role", "tab");
      const btnTr = document.createElement("button");
      btnTr.type = "button";
      btnTr.className = "dream-kpi-filter-btn";
      btnTr.textContent = "트랙커보기";
      btnTr.setAttribute("role", "tab");
      tabsRow.appendChild(btnLog);
      tabsRow.appendChild(btnTr);
      historyWrap.appendChild(tabsRow);

      const panelLog = document.createElement("div");
      panelLog.className = "dream-kpi-history-tab-panel dream-kpi-history-tab-panel--log";
      panelLog.setAttribute("role", "tabpanel");
      const panelTr = document.createElement("div");
      panelTr.className = "dream-kpi-history-tab-panel dream-kpi-history-tab-panel--tracker";
      panelTr.setAttribute("role", "tabpanel");

      loveLogPanelEl = panelLog;
      appendKpiDailyLogBlock(panelLog, logs);
      const gridEl = createKpiHabitGridElement(selKpi, dailyTodosForGrid, data.kpiLogs || []);
      if (gridEl) panelTr.appendChild(gridEl);

      wireKpiHistoryHabitTabs("love", selectedKpiId, btnLog, btnTr, panelLog, panelTr);
      historyWrap.appendChild(panelLog);
      historyWrap.appendChild(panelTr);
    } else {
      appendKpiDailyLogBlock(historyWrap, logs);
    }

    if (!needHabitTracker) {
      const todoHeader = document.createElement("div");
      todoHeader.className = "dream-kpi-todo-header";
      todoHeader.innerHTML = `<span class="dream-kpi-todo-title">할일 목록</span>`;
      historyWrap.appendChild(todoHeader);

      const todoDivider = document.createElement("div");
      todoDivider.className = "dream-kpi-todo-divider";
      historyWrap.appendChild(todoDivider);

      const todoList = document.createElement("div");
      todoList.className = "dream-kpi-todo-list";
      todos.forEach((todo) => {
        const item = document.createElement("div");
        const completed = !!todo.completed;
        item.className =
          "dream-kpi-todo-item" + (completed ? " is-completed" : "");
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
            const d = loadHappinessMap();
            kpiTodoLifecycleLog("러브KPI탭_모달삭제", {
              todoId: String(todo.id),
              삭제전: kpiTodoSnapshotBrief(d),
              삭제전dr: deletedRefsKpiTodosLen(d),
            });
            appendDeletedRef(d, "kpiTodos", todo.id);
            d.kpiTodos = (d.kpiTodos || []).filter((x) => x.id !== todo.id);
            saveHappinessMap(d, { pushServer: true });
            const after = loadHappinessMap();
            kpiTodoLifecycleLog("러브KPI탭_모달삭제_saveHappinessMap후", {
              todoId: String(todo.id),
              삭제후: kpiTodoSnapshotBrief(after),
              삭제후dr: deletedRefsKpiTodosLen(after),
            });
            renderKpiHistory({ scrollTodoAfterMutation: true });
            return;
          }
          const d = loadHappinessMap();
          const row = (d.kpiTodos || []).find((x) => x.id === todo.id);
          if (!row) return;
          row.text = result.text;
          saveHappinessMap(d, { pushServer: true });
          renderKpiHistory({ scrollTodoAfterMutation: true });
        };

        item.addEventListener("click", async (e) => {
          if (e.target.closest(".dream-kpi-todo-check-wrap")) return;
          await openTodoEdit();
        });

        check.addEventListener("change", () => {
          const d = loadHappinessMap();
          const t = d.kpiTodos.find((x) => x.id === todo.id);
          if (t) {
            kpiTodoLifecycleLog("러브KPI탭_체크_완료토글", {
              todoId: String(todo.id),
              이전완료: !!t.completed,
              요청완료: !!check.checked,
            });
            t.completed = !!check.checked;
            saveHappinessMap(d, { pushServer: true });
            kpiTodoLifecycleLog("러브KPI탭_체크_save후", {
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

      historyWrap.appendChild(todoList);
    }
    if (scrollTodoAfterMutation) {
      afterKpiTodoListMutationScroll(historyWrap, scrollSnap);
    }
    syncAppFooterLoveKpiActions();

    if (loveLogPanelEl && kpiDetailLogsNeedCloudPull(kpi, storedLogs)) {
      void resolveKpiDetailLogEntriesPrepared(kpi, storedLogs).then((freshLogs) => {
        if (!loveLogPanelEl.isConnected) return;
        loveLogPanelEl.replaceChildren();
        appendKpiDailyLogBlock(loveLogPanelEl, freshLogs);
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function showHappinessAddModal() {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">행복 목표 추가</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>행복 이름</label>
              <input type="text" name="name" placeholder="성장과 기쁨 같이 누리기" />
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
      const val = (form.name.value || "").trim() || "새 행복";
      const data = loadHappinessMap();
      const happiness = { id: nextId(), name: val };
      data.happinesses.push(happiness);
      saveHappinessMap(data, { pushServer: true });
      activeHappinessId = happiness.id;
      selectedKpiId = null;
      happinessAddModalJustClosed = true;
      close();
      renderTabs();
      updateTitleAndContent();
      setTimeout(() => {
        happinessAddModalJustClosed = false;
      }, 300);
    };
    confirmBtn.addEventListener("click", doSubmit);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      doSubmit();
    });
    document.body.appendChild(modal);
  }

  function showHappinessDeleteConfirmModal(happinessId) {
    const data = loadHappinessMap();
    const happiness = data.happinesses.find((h) => h.id === happinessId);
    const happinessName = happiness?.name || "이 행복";
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal dream-delete-confirm-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel" class="dream-delete-confirm-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">행복 삭제</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <div data-legacy="time-task-setup-body">
          <p class="dream-delete-confirm-msg">"${escapeHtml(happinessName)}"을(를) 정말 삭제하시겠습니까?</p>
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
    modal
      .querySelector(".dream-delete-confirm-cancel")
      .addEventListener("click", close);
    modal
      .querySelector(".dream-delete-confirm-submit")
      .addEventListener("click", () => {
        close();
        const d = loadHappinessMap();
        appendDeletedRef(d, "categories", happinessId);
        const happinessKpis = (d.kpis || []).filter(
          (k) => k.happinessId === happinessId,
        );
        const kpiIds = happinessKpis.map((k) => k.id);
        happinessKpis.forEach((k) => {
          appendDeletedRef(d, "kpis", k.id);
          syncKpiToTimeTask(k, "remove");
        });
        d.happinesses = (d.happinesses || []).filter(
          (x) => x.id !== happinessId,
        );
        d.kpis = (d.kpis || []).filter((k) => k.happinessId !== happinessId);
        d.kpiLogs = (d.kpiLogs || []).filter((l) => !kpiIds.includes(l.kpiId));
        d.kpiTodos = (d.kpiTodos || []).filter(
          (t) => !kpiIds.includes(t.kpiId),
        );
        d.kpiDailyRepeatTodos = (d.kpiDailyRepeatTodos || []).filter(
          (t) => !kpiIds.includes(t.kpiId),
        );
        delete d.kpiOrder?.[happinessId];
        d.kpiTaskSync = d.kpiTaskSync || {};
        kpiIds.forEach((id) => delete d.kpiTaskSync[id]);
        saveHappinessMap(d, { pushServer: true });
        if (activeHappinessId === happinessId) {
          activeHappinessId = d.happinesses[0]?.id || null;
          selectedKpiId = null;
        }
        renderTabs();
        updateTitleAndContent();
      });
    document.body.appendChild(modal);
  }

  function showHappinessContextModal(happiness, tabEl) {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel" class="dream-path-context-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">행복 수정</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form dream-path-edit-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>행복 이름</label>
              <input type="text" name="name" value="${escapeHtml(happiness.name || "")}" placeholder="성장과 기쁨 같이 누리기" />
            </div>
            <div class="dream-kpi-delete-wrap">
              <button type="button" class="dream-kpi-delete-btn" data-action="delete">행복 목표 삭제</button>
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
      const val = (e.target.name.value || "").trim() || "행복 이름";
      const d = loadHappinessMap();
      const target = d.happinesses.find((x) => x.id === happiness.id);
      if (target) {
        target.name = val;
        saveHappinessMap(d, { pushServer: true });
        renderTabs();
      }
      close();
    });
    modal
      .querySelector('[data-action="delete"]')
      .addEventListener("click", () => {
        close();
        showHappinessDeleteConfirmModal(happiness.id);
      });
    document.body.appendChild(modal);
  }

  function renderTabs() {
    const data = loadHappinessMap();
    tabs.innerHTML = "";
    data.happinesses.forEach((happiness) => {
      const tab = document.createElement("div");
      const isActive = happiness.id === activeHappinessId;
      tab.className = "dream-tab" + (isActive ? " active" : "");
      tab.dataset.happinessId = happiness.id;
      tab.innerHTML = `<span class="dream-tab-text">${escapeHtml(happiness.name || "행복 이름")}</span>${
        isActive ? KPI_TAB_EDIT_PENCIL_HTML : ""
      }`;
      if (isActive) {
        tab.querySelector(".dream-tab-edit")?.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          showHappinessContextModal(happiness, tab);
        });
      }
      tab.addEventListener("click", () => {
        if (activeHappinessId !== happiness.id) {
          selectedKpiId = null;
        }
        activeHappinessId = happiness.id;
        renderTabs();
        updateTitleAndContent();
      });
      tabs.appendChild(tab);
    });
  }

  function updateTitleAndContent() {
    const data = loadHappinessMap();
    const happiness = data.happinesses.find((h) => h.id === activeHappinessId);
    if (happiness) {
      contentWrap.hidden = false;
      renderKpiList();
      renderKpiHistory();
    } else {
      contentWrap.hidden = true;
      persistKpiUiState();
    }
  }

  renderTabs();
  if (activeHappinessId) {
    updateTitleAndContent();
  } else {
    contentWrap.hidden = true;
  }

  const onMergedSync = (e) => {
    if (!el.isConnected) return;
    /* push 시에는 화면 갱신 불필요 (로컬 변경을 서버에 올린 것이므로) */
    if (e.detail?.fromPush) return;
    if (!e.detail?.fromServerMerge && !e.detail?.fromLocalWrite) return;
    const data = loadHappinessMap();
    if (!data.happinesses.some((h) => h.id === activeHappinessId)) {
      activeHappinessId = data.happinesses[0]?.id || null;
      selectedKpiId = null;
    }
    /* 선택된 KPI가 삭제됐으면 선택 해제 */
    if (selectedKpiId && !data.kpis.some((k) => k.id === selectedKpiId)) {
      selectedKpiId = null;
    }
    renderTabs();
    /* 서버 동기화 시에는 selectedKpiId를 유지하면서 화면만 갱신 */
    const happiness = data.happinesses.find((h) => h.id === activeHappinessId);
    if (happiness) {
      contentWrap.hidden = false;
      renderKpiList();
      renderKpiHistory();
    } else {
      contentWrap.hidden = true;
    }
    persistKpiUiState();
  };
  window.addEventListener("happiness-kpi-map-saved", onMergedSync);

  return el;
}
