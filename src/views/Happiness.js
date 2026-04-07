/**
 * 행복 페이지 - 꿈/부수입과 동일한 KPI 구조
 * 행복 추가 시 탭 형성, KPI 카드, 로그, 할일
 */

import {
  HAPPINESS_KPI_MAP_STORAGE_KEY,
  applyHappinessKpiTimestampsOnSave,
} from "../utils/happinessKpiMapSupabase.js";
import {
  notifyTimeLedgerTasksChanged,
  removeTimeLedgerTaskOptionByNameForKpi,
} from "../utils/timeTaskOptionsModel.js";
import { toDateInputValue, formatDeadlineForDisplay, formatDeadlineRangeForDisplay, formatDeadlineRangeCompact } from "../utils/ganttModal.js";
import { getAccumulatedMinutes, minutesToHhMm, hhMmToMinutes, syncHabitTrackerLogs } from "../utils/timeKpiSync.js";
import { setupDeadlineQuickButtons } from "../utils/deadlineQuickButtons.js";
import { attachKpiTodoInputScrollIntoView } from "../utils/kpiTodoInputScroll.js";
import {
  bindKpiTodoTextareaKeydown,
  setupKpiTodoInlineTextarea,
} from "../utils/kpiTodoInlineTextarea.js";
import {
  KPI_UI_SESSION_KEYS,
  readKpiUiSession,
  writeKpiUiSession,
  restoreKpiTabFromSession,
} from "../utils/kpiViewUiSession.js";

const TIME_TASK_OPTIONS_KEY = "time_task_options";
const FIXED_TASK_NAMES = new Set(["수면하기", "근무하기"]);

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
    const raw = localStorage.getItem(HAPPINESS_KPI_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const kpis = (parsed.kpis || []).map((k) => ({
        ...k,
        needHabitTracker: !!k.needHabitTracker,
        direction: k.direction === "lower" ? "lower" : "higher",
      }));
      return {
        happinesses: parsed.happinesses || [],
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

function getTimeTaskOptionsRaw() {
  try {
    const raw = localStorage.getItem(TIME_TASK_OPTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return null;
}

function getTaskName(o) {
  return typeof o === "string" ? o : (o?.name || "");
}

function syncKpiToTimeTask(kpi, action, oldName) {
  const data = loadHappinessMap();
  data.kpiTaskSync = data.kpiTaskSync || {};
  let opts = getTimeTaskOptionsRaw();
  if (opts === null) opts = [];

  if (action === "add") {
    const name = (kpi.name || "").trim();
    if (!name || opts.some((o) => getTaskName(o) === name)) return;
    data.kpiTaskSync[kpi.id] = name;
    opts.unshift({ name, category: "happiness", productivity: "productive", memo: "" });
    try {
      localStorage.setItem(TIME_TASK_OPTIONS_KEY, JSON.stringify(opts));
    } catch (_) {}
    saveHappinessMap(data);
    notifyTimeLedgerTasksChanged();
  } else if (action === "remove") {
    const name = (data.kpiTaskSync[kpi.id] || kpi.name || "").trim();
    if (name) {
      delete data.kpiTaskSync[kpi.id];
      saveHappinessMap(data);
      removeTimeLedgerTaskOptionByNameForKpi(name);
    }
  } else if (action === "update" && oldName) {
    const newName = (kpi.name || "").trim();
    const prevName = data.kpiTaskSync[kpi.id];
    if (prevName && newName && prevName !== newName) {
      opts = opts.map((o) => {
        if (getTaskName(o) === prevName) {
          return typeof o === "string" ? newName : { ...o, name: newName };
        }
        return o;
      });
      data.kpiTaskSync[kpi.id] = newName;
      try {
        localStorage.setItem(TIME_TASK_OPTIONS_KEY, JSON.stringify(opts));
      } catch (_) {}
      saveHappinessMap(data);
      notifyTimeLedgerTasksChanged();
    }
  }
}

function saveHappinessMap(data) {
  try {
    let prev = null;
    try {
      const raw = localStorage.getItem(HAPPINESS_KPI_MAP_STORAGE_KEY);
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
    localStorage.setItem(HAPPINESS_KPI_MAP_STORAGE_KEY, JSON.stringify(stamped));
    try {
      window.dispatchEvent(new CustomEvent("happiness-kpi-map-saved"));
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
  el.className = "app-tab-panel-content happiness-view dream-view";

  const header = document.createElement("header");
  header.className = "dream-view-header";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "HAPPINESS";
  const title = document.createElement("h1");
  title.className = "dream-view-title";
  title.textContent = "행복";
  header.appendChild(label);
  header.appendChild(title);
  el.appendChild(header);

  const tabsWrap = document.createElement("div");
  tabsWrap.className = "dream-tabs-wrap";
  const tabs = document.createElement("div");
  tabs.className = "dream-tabs";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "dream-add-icon-btn";
  addBtn.title = "행복 목표 추가";
  addBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="dream-add-icon" aria-hidden="true" width="24" height="24"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m12 8v8"/><path d="m8 12h8"/><path d="m18 22h-12c-2.209 0-4-1.791-4-4v-12c0-2.209 1.791-4 4-4h12c2.209 0 4 1.791 4 4v12c0 2.209-1.791 4-4 4z"/></g></svg>`;
  addBtn.addEventListener("click", () => {
    if (happinessAddModalJustClosed) return;
    showHappinessAddModal();
  });
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
  let completedSectionCollapsed = true;
  let happinessAddModalJustClosed = false;

  const _happinessUiSession = readKpiUiSession(KPI_UI_SESSION_KEYS.happiness);
  const _happinessInitData = loadHappinessMap();
  const _happinessRestored = restoreKpiTabFromSession(_happinessUiSession, {
    categoryIds: _happinessInitData.happinesses || [],
    kpis: _happinessInitData.kpis || [],
    foreignKey: "happinessId",
  });
  if (_happinessRestored.tabId) activeHappinessId = _happinessRestored.tabId;
  selectedKpiId = _happinessRestored.selectedKpiId;
  kpiFilter = _happinessRestored.kpiFilter;

  function persistKpiUiState() {
    writeKpiUiSession(KPI_UI_SESSION_KEYS.happiness, {
      tabId: activeHappinessId,
      selectedKpiId,
      kpiFilter,
    });
  }

  function showKpiModal() {
    if (!activeHappinessId) return;
    const modal = document.createElement("div");
    modal.className = "dream-kpi-modal";
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel">
        <div class="dream-kpi-modal-header">
          <h3 class="dream-kpi-modal-title">새 KPI 추가</h3>
          <button type="button" class="dream-kpi-modal-close" title="닫기">×</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-form-body">
            <div class="dream-kpi-section">
              <h4 class="dream-kpi-section-title">기본</h4>
              <div class="dream-kpi-field">
                <label>행동 이름</label>
                <input type="text" name="name" placeholder="예) 독서하기" />
              </div>
            </div>
            <div class="dream-kpi-section">
              <h4 class="dream-kpi-section-title">목표</h4>
              <div class="dream-kpi-field dream-kpi-direction-field">
                <span class="dream-kpi-field-label">지표 방향</span>
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
              <div class="dream-kpi-row">
                <div class="dream-kpi-field">
                  <label><span class="dream-kpi-target-label-text">목표값</span></label>
                  <input type="text" name="targetValue" placeholder="20" inputmode="numeric" />
                </div>
                <div class="dream-kpi-field">
                  <label>단위</label>
                  <input type="text" name="unit" placeholder="권" />
                </div>
              </div>
              <div class="dream-kpi-field">
                <label>필요시간</label>
                <input type="text" name="targetTimeRequired" placeholder="예) 25:00" />
              </div>
            </div>
            <div class="dream-kpi-section">
              <h4 class="dream-kpi-section-title">기간</h4>
              <div class="dream-kpi-row">
                <div class="dream-kpi-field">
                  <label>시작기한</label>
                  <input type="date" name="targetStartDate" />
                </div>
                <div class="dream-kpi-field">
                  <label>달성기한</label>
                  <input type="date" name="targetDeadline" />
                </div>
              </div>
              <div class="dream-kpi-deadline-quick">
                <button type="button" class="dream-kpi-today-btn">오늘</button>
                <button type="button" class="dream-kpi-deadline-quick-btn" data-days="14">+14일</button>
                <button type="button" class="dream-kpi-deadline-quick-btn" data-days="30">+30일</button>
              </div>
            </div>
            <div class="dream-kpi-field dream-kpi-field-checkbox">
              <label class="dream-kpi-checkbox-label">
                매일 반복
                <input type="checkbox" name="needHabitTracker" />
              </label>
            </div>
          </div>
          <div class="dream-kpi-form-actions">
            <button type="submit" class="dream-kpi-submit">KPI 등록하기</button>
          </div>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector(".dream-kpi-backdrop").addEventListener("click", close);
    modal.querySelector(".dream-kpi-modal-close").addEventListener("click", close);
    modal.querySelector(".dream-kpi-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const needHabitChecked = !!(form.querySelector('input[name="needHabitTracker"]')?.checked);
      const dir =
        form.querySelector('input[name="direction"]:checked')?.value === "lower"
          ? "lower"
          : "higher";
      const kpi = {
        id: nextId(),
        happinessId: activeHappinessId,
        name: (form.name.value || "").trim() || "행동",
        unit: (form.unit.value || "").trim() || "",
        targetValue: sanitizeNumericInput(form.targetValue.value) || "",
        targetTimeRequired: (form.targetTimeRequired?.value || "").trim() || "",
        targetStartDate: (form.targetStartDate?.value || "").trim() || "",
        targetDeadline: (form.targetDeadline.value || "").trim() || "",
        needHabitTracker: needHabitChecked,
        direction: dir,
      };
      const data = loadHappinessMap();
      data.kpis = data.kpis || [];
      const existingOrder = (data.kpiOrder || {})[activeHappinessId] || data.kpis.filter((k) => k.happinessId === activeHappinessId).map((k) => k.id);
      data.kpis.push(kpi);
      data.kpiOrder = data.kpiOrder || {};
      data.kpiOrder[activeHappinessId] = [...existingOrder, kpi.id];
      saveHappinessMap(data);
      syncKpiToTimeTask(kpi, "add");
      close();
      selectedKpiId = kpi.id;
      renderKpiList();
      renderKpiHistory();
    });
    document.body.appendChild(modal);
    setupNumericOnlyInput(modal.querySelector('input[name="targetValue"]'));
    setupDeadlineQuickButtons(modal);
    bindDreamKpiDirectionTargetLabels(modal.querySelector(".dream-kpi-form"));
  }

  function bindDreamKpiDirectionTargetLabels(form) {
    if (!form) return;
    const labelSpan = form.querySelector(".dream-kpi-target-label-text");
    const targetInput = form.querySelector('input[name="targetValue"]');
    const radios = form.querySelectorAll('input[name="direction"]');
    const sync = () => {
      const lower =
        form.querySelector('input[name="direction"]:checked')?.value === "lower";
      if (labelSpan) labelSpan.textContent = lower ? "허용 상한" : "목표값";
      if (targetInput) targetInput.placeholder = lower ? "5" : "20";
    };
    radios.forEach((r) => r.addEventListener("change", sync));
    sync();
  }

  function showKpiEditModal(kpi) {
    const modal = document.createElement("div");
    modal.className = "dream-kpi-modal";
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel">
        <div class="dream-kpi-modal-header">
          <h3 class="dream-kpi-modal-title">KPI 수정</h3>
          <button type="button" class="dream-kpi-modal-close" title="닫기">×</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-form-body">
            <div class="dream-kpi-section">
              <h4 class="dream-kpi-section-title">기본</h4>
              <div class="dream-kpi-field">
                <label>행동 이름</label>
                <input type="text" name="name" value="${escapeHtml(kpi.name || "")}" placeholder="예) 독서하기" />
              </div>
            </div>
            <div class="dream-kpi-section">
              <h4 class="dream-kpi-section-title">목표</h4>
              <div class="dream-kpi-field dream-kpi-direction-field">
                <span class="dream-kpi-field-label">지표 방향</span>
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
              <div class="dream-kpi-row">
                <div class="dream-kpi-field">
                  <label><span class="dream-kpi-target-label-text">목표값</span></label>
                  <input type="text" name="targetValue" value="${escapeHtml(sanitizeNumericInput(kpi.targetValue))}" placeholder="20" inputmode="numeric" />
                </div>
                <div class="dream-kpi-field">
                  <label>단위</label>
                  <input type="text" name="unit" value="${escapeHtml(kpi.unit || "")}" placeholder="권" />
                </div>
              </div>
              <div class="dream-kpi-field">
                <label>필요시간</label>
                <input type="text" name="targetTimeRequired" value="${escapeHtml(kpi.targetTimeRequired || "")}" placeholder="예) 25:00" />
              </div>
            </div>
            <div class="dream-kpi-section">
              <h4 class="dream-kpi-section-title">기간</h4>
              <div class="dream-kpi-row">
                <div class="dream-kpi-field">
                  <label>시작기한</label>
                  <input type="date" name="targetStartDate" value="${escapeHtml(toDateInputValue(kpi.targetStartDate))}" />
                </div>
                <div class="dream-kpi-field">
                  <label>달성기한</label>
                  <input type="date" name="targetDeadline" value="${escapeHtml(toDateInputValue(kpi.targetDeadline))}" />
                </div>
              </div>
              <div class="dream-kpi-deadline-quick">
                <button type="button" class="dream-kpi-today-btn">오늘</button>
                <button type="button" class="dream-kpi-deadline-quick-btn" data-days="14">+14일</button>
                <button type="button" class="dream-kpi-deadline-quick-btn" data-days="30">+30일</button>
              </div>
            </div>
            <div class="dream-kpi-field dream-kpi-field-checkbox">
              <label class="dream-kpi-checkbox-label">
                매일 반복
                <input type="checkbox" name="needHabitTracker" ${kpi.needHabitTracker ? "checked" : ""} />
              </label>
            </div>
          </div>
          <div class="dream-kpi-form-actions">
            <button type="submit" class="dream-kpi-submit">수정</button>
            <div class="dream-kpi-delete-wrap">
              <p class="dream-kpi-delete-note">삭제 시 복구 불가</p>
              <button type="button" class="dream-kpi-delete-btn">KPI 삭제하기</button>
            </div>
          </div>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector(".dream-kpi-backdrop").addEventListener("click", close);
    modal.querySelector(".dream-kpi-modal-close").addEventListener("click", close);
    modal.querySelector(".dream-kpi-delete-btn").addEventListener("click", () => {
      syncKpiToTimeTask(kpi, "remove");
      const data = loadHappinessMap();
      appendDeletedRef(data, "kpis", kpi.id);
      data.kpis = (data.kpis || []).filter((k) => k.id !== kpi.id);
      data.kpiLogs = (data.kpiLogs || []).filter((l) => l.kpiId !== kpi.id);
      data.kpiTodos = (data.kpiTodos || []).filter((t) => t.kpiId !== kpi.id);
      data.kpiDailyRepeatTodos = (data.kpiDailyRepeatTodos || []).filter((t) => t.kpiId !== kpi.id);
      const order = (data.kpiOrder || {})[kpi.happinessId] || [];
      data.kpiOrder = { ...data.kpiOrder, [kpi.happinessId]: order.filter((id) => id !== kpi.id) };
      saveHappinessMap(data);
      selectedKpiId = null;
      close();
      renderKpiList();
      renderKpiHistory();
    });
    modal.querySelector(".dream-kpi-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const data = loadHappinessMap();
      const target = data.kpis.find((k) => k.id === kpi.id);
      if (target) {
        const oldName = target.name;
        target.name = (form.name.value || "").trim() || "행동";
        target.unit = (form.unit.value || "").trim() || "";
        target.targetValue = sanitizeNumericInput(form.targetValue.value) || "";
        target.targetTimeRequired = (form.targetTimeRequired?.value || "").trim() || "";
        target.targetStartDate = (form.targetStartDate?.value || "").trim() || "";
        target.targetDeadline = (form.targetDeadline.value || "").trim() || "";
        target.needHabitTracker = !!form.querySelector('input[name="needHabitTracker"]')?.checked;
        target.direction =
          form.querySelector('input[name="direction"]:checked')?.value === "lower"
            ? "lower"
            : "higher";
        saveHappinessMap(data);
        if (oldName !== target.name) syncKpiToTimeTask(target, "update", oldName);
      }
      close();
      renderKpiList();
      renderKpiHistory();
    });
    document.body.appendChild(modal);
    setupNumericOnlyInput(modal.querySelector('input[name="targetValue"]'));
    setupDeadlineQuickButtons(modal);
    bindDreamKpiDirectionTargetLabels(modal.querySelector(".dream-kpi-form"));
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
    modal.className = "dream-kpi-log-modal";
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
      <div class="dream-kpi-log-backdrop"></div>
      <div class="dream-kpi-log-panel">
        <div class="dream-kpi-log-header">
          <h3 class="dream-kpi-log-title">${isEdit ? "로그 수정" : "오늘의 수치 기록"}</h3>
          <button type="button" class="dream-kpi-log-close" title="닫기">×</button>
        </div>
        <form class="dream-kpi-log-form">
          <div class="dream-kpi-log-section">
          ${kpi.direction === "lower" ? '<p class="dream-kpi-log-lower-hint">숫자가 <strong>작을수록</strong> 좋은 지표예요. 카드와 진행 막대에는 <strong>가장 최근에 입력한 숫자 하나</strong>만 반영하고, 예전 기록은 더하지 않아요.</p>' : ""}
            <div class="dream-kpi-log-row">
              <div class="dream-kpi-log-field">
                <label>날짜</label>
                <input type="date" name="date" value="${dateVal}" />
              </div>
              <div class="dream-kpi-log-field">
                <label>KPI 항목</label>
                <input type="text" value="${escapeHtml(kpi.name)}${kpi.unit ? " (" + escapeHtml(kpi.unit) + ")" : ""}" readonly class="dream-kpi-log-readonly" />
              </div>
            </div>
            <div class="dream-kpi-log-row">
              <div class="dream-kpi-log-field dream-kpi-log-field--full">
                <label>${kpi.direction === "lower" ? "이날 대표값" : "오늘 측정값"}</label>
                <input type="text" name="value" placeholder="숫자 입력" value="${escapeHtml(valueVal)}" inputmode="numeric" />
              </div>
            </div>
            <div class="dream-kpi-log-field">
              <label>메모 (선택)</label>
              <textarea name="memo" placeholder="오늘 이 수치가 나온 이유, 특이사항 등..." rows="3">${escapeHtml(memoVal)}</textarea>
            </div>
          </div>
          <button type="submit" class="dream-kpi-log-submit">${isEdit ? "수정 저장" : "+ 로그 저장"}</button>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector(".dream-kpi-log-backdrop").addEventListener("click", close);
    modal.querySelector(".dream-kpi-log-close").addEventListener("click", close);
    modal.querySelector(".dream-kpi-log-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const dateVal = form.date.value;
      const dateStr = dateVal ? `${dateVal.split("-")[0]}. ${dateVal.split("-")[1]}. ${dateVal.split("-")[2]}.` : toDateStr(new Date());
      const data = loadHappinessMap();
      if (isEdit) {
        const idx = data.kpiLogs.findIndex((l) => l.id === editLog.id);
        if (idx >= 0) {
          data.kpiLogs[idx] = {
            ...data.kpiLogs[idx],
            date: dateStr,
            dateRaw: dateVal,
            value: sanitizeNumericInput(form.value.value) || "",
            memo: (form.memo.value || "").trim(),
          };
        }
      } else {
        const log = {
          id: nextId(),
          kpiId: kpi.id,
          happinessId: kpi.happinessId,
          date: dateStr,
          dateRaw: dateVal,
          value: sanitizeNumericInput(form.value.value) || "",
          memo: (form.memo.value || "").trim(),
        };
        data.kpiLogs = data.kpiLogs || [];
        data.kpiLogs.push(log);
      }
      saveHappinessMap(data);
      close();
      renderKpiList();
      renderKpiHistory();
    });
    document.body.appendChild(modal);
    setupNumericOnlyInput(modal.querySelector('input[name="value"]'));
  }

  function getLatestKpiLog(kpiId) {
    const data = loadHappinessMap();
    const logs = (data.kpiLogs || []).filter((l) => l.kpiId === kpiId);
    if (logs.length === 0) return null;
    logs.sort((a, b) => {
      const da = a.dateRaw || a.date || "";
      const db = b.dateRaw || b.date || "";
      return db.localeCompare(da);
    });
    return logs[0];
  }

  function getKpiLogs(kpiId) {
    const data = loadHappinessMap();
    const logs = (data.kpiLogs || []).filter((l) => l.kpiId === kpiId);
    logs.sort((a, b) => {
      const da = a.dateRaw || a.date || "";
      const db = b.dateRaw || b.date || "";
      return db.localeCompare(da);
    });
    return logs;
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
    const lower = kpi.direction === "lower";
    const latestLog = getLatestKpiLog(kpi.id);
    const targetVal = parseNum(kpi.targetValue);
    let currentVal;
    let progress = 0;
    if (lower) {
      currentVal =
        latestLog != null ? parseNum(latestLog.value) : null;
      if (targetVal > 0 && latestLog != null && currentVal != null) {
        const c = Math.max(currentVal, 1e-9);
        progress = Math.min(100, (targetVal / c) * 100);
      }
    } else {
      currentVal = getAccumulatedKpiValue(kpi.id);
      progress =
        targetVal > 0 ? Math.min(100, (currentVal / targetVal) * 100) : 0;
    }
    const targetMins = kpi.targetTimeRequired ? hhMmToMinutes(kpi.targetTimeRequired) : 0;
    const accumulatedMins = targetMins > 0 ? getAccumulatedMinutes(kpi.name) : 0;
    const timeProgress = targetMins > 0 ? Math.min(100, (accumulatedMins / targetMins) * 100) : 0;
    const valueComplete = lower
      ? targetVal > 0 &&
        latestLog != null &&
        currentVal != null &&
        currentVal <= targetVal
      : progress >= 100;
    const isCompleted = valueComplete || (targetMins > 0 && timeProgress >= 100);
    const todayKey = toDateKey(new Date());
    const startKey = (kpi.targetStartDate || "").slice(0, 10);
    const endKey = (kpi.targetDeadline || "").slice(0, 10);
    const hasStart = startKey.length >= 10;
    const isInProgress =
      hasStart && startKey <= todayKey && (!endKey || endKey >= todayKey) && !isCompleted;
    return {
      progress,
      timeProgress,
      currentVal,
      targetVal,
      targetMins,
      accumulatedMins,
      isCompleted,
      isInProgress,
      lowerBetter: lower,
    };
  }

  function renderKpiList() {
    syncHabitTrackerLogs();
    contentWrap.innerHTML = "";
    if (!activeHappinessId) {
      persistKpiUiState();
      return;
    }
    const data = loadHappinessMap();
    let happinessKpis = (data.kpis || []).filter((k) => k.happinessId === activeHappinessId);
    const order = (data.kpiOrder || {})[activeHappinessId];
    if (order && order.length > 0) {
      const orderMap = new Map(order.map((id, i) => [id, i]));
      happinessKpis = [...happinessKpis].sort((a, b) => {
        const ia = orderMap.has(a.id) ? orderMap.get(a.id) : 999;
        const ib = orderMap.has(b.id) ? orderMap.get(b.id) : 999;
        return ia - ib;
      });
    }
    happinessKpis.forEach((kpi) => {
      const { isCompleted } = getKpiProgress(kpi);
      if (isCompleted && data.kpiTaskSync?.[kpi.id]) {
        syncKpiToTimeTask(kpi, "remove");
      }
    });
    const activeKpis = happinessKpis.filter((k) => getKpiProgress(k).isInProgress);
    const completedKpis = happinessKpis.filter((k) => getKpiProgress(k).isCompleted);

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
    const listToShow = kpiFilter === "active" ? activeKpis : kpiFilter === "completed" ? completedKpis : happinessKpis;
    listToShow.forEach((kpi) => {
      const {
        progress,
        timeProgress,
        currentVal,
        targetVal,
        targetMins,
        accumulatedMins,
        lowerBetter,
      } = getKpiProgress(kpi);
      const investedMins = getAccumulatedMinutes(kpi.name);
      const unitSuffix = kpi.unit ? " " + kpi.unit : "";
      const formatNum = (n) => (n == null || Number.isNaN(n) ? "—" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
      const currentStr = formatNum(currentVal);
      const targetStr = kpi.targetValue ? escapeHtml(String(kpi.targetValue).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) : "—";
      const progressText = lowerBetter
        ? `최근 ${currentStr} / 상한 ${targetStr}${unitSuffix}`
        : `${currentStr} / ${targetStr}${unitSuffix}`;
      const targetTimeDisplay = kpi.targetTimeRequired
        ? minutesToHhMm(String(kpi.targetTimeRequired).includes(":") ? hhMmToMinutes(kpi.targetTimeRequired) : (parseInt(kpi.targetTimeRequired, 10) || 0))
        : "";
      const investedTimeHtml = targetTimeDisplay
        ? `지금까지 투자한 시간 <span class="dream-kpi-card-invested-value">${minutesToHhMm(investedMins)}</span> / <span class="dream-kpi-card-invested-value">${targetTimeDisplay}</span>`
        : `지금까지 투자한 시간 <span class="dream-kpi-card-invested-value">${minutesToHhMm(investedMins)}</span>`;
      const card = document.createElement("div");
      card.className =
        "dream-kpi-card" +
        (lowerBetter ? " dream-kpi-card--lower-better" : "") +
        (selectedKpiId === kpi.id ? " is-selected" : "");
      card.dataset.kpiId = kpi.id;
      card.draggable = true;
      card.innerHTML = `
        <div class="dream-kpi-card-inner">
          <button type="button" class="dream-kpi-card-edit" title="KPI 수정">수정</button>
          <div class="dream-kpi-card-name">${escapeHtml(kpi.name)}${lowerBetter ? '<span class="dream-kpi-card-direction-badge" title="낮을수록 좋음 KPI">↓낮음</span>' : ""}</div>
          <div class="dream-kpi-card-target-num">${lowerBetter ? '<span class="dream-kpi-card-target-prefix">상한 </span>' : ""}${kpi.targetValue ? escapeHtml(String(kpi.targetValue).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) + (kpi.unit ? '<span class="dream-kpi-card-unit"> ' + escapeHtml(kpi.unit) + "</span>" : "") : "—"}</div>
          ${(kpi.targetStartDate || kpi.targetDeadline) ? `<div class="dream-kpi-card-deadline">${escapeHtml(formatDeadlineRangeCompact(kpi.targetStartDate, kpi.targetDeadline))}</div>` : ""}
          <div class="dream-kpi-card-progress">
            <div class="dream-kpi-card-progress-bar"><div class="dream-kpi-card-progress-fill" style="width:${progress}%"></div></div>
            <div class="dream-kpi-card-progress-text">${escapeHtml(progressText)}</div>
          </div>
          <div class="dream-kpi-card-invested">${investedTimeHtml}</div>
        </div>
      `;
      card.querySelector(".dream-kpi-card-edit").addEventListener("click", (e) => {
        e.stopPropagation();
        showKpiEditModal(kpi);
      });
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
      grid.appendChild(card);
    });
    grid.addEventListener("dragend", () => {
      grid.querySelectorAll(".dream-kpi-card-drag-over").forEach((c) => c.classList.remove("dream-kpi-card-drag-over"));
    });
    const addCard = document.createElement("button");
    addCard.type = "button";
    addCard.className = "dream-kpi-add-card";
    addCard.innerHTML = '<span class="dream-kpi-add-card-text">+ KPI 추가하기</span>';
    addCard.addEventListener("click", () => {
      if (!activeHappinessId) return;
      showKpiModal();
    });
    grid.appendChild(addCard);
    contentWrap.appendChild(grid);

    if (completedKpis.length > 0 && kpiFilter !== "completed") {
      const completedSection = document.createElement("div");
      completedSection.className = "dream-kpi-completed-section" + (completedSectionCollapsed ? " is-collapsed" : "");
      completedSection.innerHTML = `
        <button type="button" class="dream-kpi-completed-toggle">
          <span class="dream-kpi-completed-arrow">${completedSectionCollapsed ? "▶" : "▼"}</span>
          <span class="dream-kpi-completed-label">달성 완료 (${completedKpis.length})</span>
        </button>
        <div class="dream-kpi-completed-grid"></div>
      `;
      const toggleBtn = completedSection.querySelector(".dream-kpi-completed-toggle");
      const completedGrid = completedSection.querySelector(".dream-kpi-completed-grid");
      toggleBtn.addEventListener("click", () => {
        completedSectionCollapsed = !completedSectionCollapsed;
        completedSection.classList.toggle("is-collapsed", completedSectionCollapsed);
        toggleBtn.querySelector(".dream-kpi-completed-arrow").textContent = completedSectionCollapsed ? "▶" : "▼";
      });
      completedKpis.forEach((kpi) => {
        const {
          currentVal,
          targetVal,
          targetMins,
          accumulatedMins,
          lowerBetter,
        } = getKpiProgress(kpi);
        const investedMins = getAccumulatedMinutes(kpi.name);
        const unitSuffix = kpi.unit ? " " + kpi.unit : "";
        const formatNum = (n) => (n == null || Number.isNaN(n) ? "—" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
        const currentStr = formatNum(currentVal);
        const targetStr = kpi.targetValue ? escapeHtml(String(kpi.targetValue).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) : "—";
        const progressText = lowerBetter
          ? `최근 ${currentStr} / 상한 ${targetStr}${unitSuffix}`
          : `${currentStr} / ${targetStr}${unitSuffix}`;
        const targetTimeDisplayCompleted = kpi.targetTimeRequired
          ? minutesToHhMm(String(kpi.targetTimeRequired).includes(":") ? hhMmToMinutes(kpi.targetTimeRequired) : (parseInt(kpi.targetTimeRequired, 10) || 0))
          : "";
        const investedTimeHtmlCompleted = targetTimeDisplayCompleted
          ? `지금까지 투자한 시간 <span class="dream-kpi-card-invested-value">${minutesToHhMm(investedMins)}</span> / <span class="dream-kpi-card-invested-value">${targetTimeDisplayCompleted}</span>`
          : `지금까지 투자한 시간 <span class="dream-kpi-card-invested-value">${minutesToHhMm(investedMins)}</span>`;
        const card = document.createElement("div");
        card.className =
          "dream-kpi-card dream-kpi-card-completed" +
          (lowerBetter ? " dream-kpi-card--lower-better" : "") +
          (selectedKpiId === kpi.id ? " is-selected" : "");
        card.dataset.kpiId = kpi.id;
        card.innerHTML = `
          <div class="dream-kpi-card-inner">
            <button type="button" class="dream-kpi-card-edit" title="KPI 수정">수정</button>
            <div class="dream-kpi-card-name">${escapeHtml(kpi.name)}${lowerBetter ? '<span class="dream-kpi-card-direction-badge" title="낮을수록 좋음 KPI">↓낮음</span>' : ""}</div>
            <div class="dream-kpi-card-target-num">${lowerBetter ? '<span class="dream-kpi-card-target-prefix">상한 </span>' : ""}${kpi.targetValue ? escapeHtml(String(kpi.targetValue).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) + (kpi.unit ? '<span class="dream-kpi-card-unit"> ' + escapeHtml(kpi.unit) + "</span>" : "") : "—"}</div>
            ${(kpi.targetStartDate || kpi.targetDeadline) ? `<div class="dream-kpi-card-deadline">${escapeHtml(formatDeadlineRangeCompact(kpi.targetStartDate, kpi.targetDeadline))}</div>` : ""}
            <div class="dream-kpi-card-progress">
              <div class="dream-kpi-card-progress-bar"><div class="dream-kpi-card-progress-fill" style="width:100%"></div></div>
              <div class="dream-kpi-card-progress-text">${escapeHtml(progressText)} ✓</div>
            </div>
            <div class="dream-kpi-card-invested">${investedTimeHtmlCompleted}</div>
          </div>
        `;
        card.querySelector(".dream-kpi-card-edit").addEventListener("click", (e) => {
          e.stopPropagation();
          showKpiEditModal(kpi);
        });
        card.addEventListener("click", (e) => {
          if (e.target.closest(".dream-kpi-card-edit")) return;
          selectedKpiId = selectedKpiId === kpi.id ? null : kpi.id;
          renderKpiList();
          renderKpiHistory();
        });
        completedGrid.appendChild(card);
      });
      contentWrap.appendChild(completedSection);
    }
    persistKpiUiState();
  }

  function renderKpiHistory() {
    historyWrap.innerHTML = "";
    if (!selectedKpiId) {
      historyWrap.hidden = true;
      return;
    }
    const data = loadHappinessMap();
    const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
    if (!kpi) {
      historyWrap.hidden = true;
      return;
    }
    const logs = getKpiLogs(selectedKpiId);
    const selKpi = String(selectedKpiId);
    const todos = (data.kpiTodos || []).filter(
      (t) => String(t.kpiId) === selKpi && (t.text || "").trim() !== "",
    );
    historyWrap.hidden = false;

    const headerRow = document.createElement("div");
    headerRow.className = "dream-kpi-history-header";
    headerRow.innerHTML = `
      <h4 class="dream-kpi-history-title">${escapeHtml(kpi.name)} 기록</h4>
      <button type="button" class="dream-kpi-history-log-btn">+ 로그</button>
    `;
    headerRow.querySelector(".dream-kpi-history-log-btn").addEventListener("click", () => showKpiLogModal(kpi));
    historyWrap.appendChild(headerRow);

    const divider = document.createElement("div");
    divider.className = "dream-kpi-history-divider";
    historyWrap.appendChild(divider);

    if (logs.length === 0) {
      const empty = document.createElement("p");
      empty.className = "dream-kpi-history-empty";
      empty.textContent = "아직 기록이 없습니다.";
      historyWrap.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "dream-kpi-history-list";
      logs.forEach((log) => {
        const item = document.createElement("div");
        item.className = "dream-kpi-history-item";
        const unitSuffix = kpi.unit ? " " + kpi.unit : "";
        const completed = log.dailyCompleted || [];
        const incomplete = log.dailyIncomplete || [];
        let dailyLine = "";
        if (completed.length || incomplete.length) {
          const completedNames = completed.map((t) => (t.text || "").trim()).filter(Boolean).join(", ");
          const incompleteNames = incomplete.map((t) => (t.text || "").trim()).filter(Boolean).join(", ");
          if (completedNames) dailyLine = `${completedNames} 완료`;
          if (incompleteNames) dailyLine += (dailyLine ? " / " : "") + `미완료: ${incompleteNames}`;
        }
        item.innerHTML = `
          <div class="dream-kpi-history-item-body">
            <div class="dream-kpi-history-item-main">
              <span class="dream-kpi-history-date">${escapeHtml(log.date)}</span>
              <span class="dream-kpi-history-value">${escapeHtml(log.value || "—")}${unitSuffix}</span>
            </div>
            ${log.memo ? `<div class="dream-kpi-history-memo">${escapeHtml(log.memo)}</div>` : ""}
            ${dailyLine ? `<div class="dream-kpi-history-daily">${escapeHtml(dailyLine)}</div>` : ""}
          </div>
          <div class="dream-kpi-history-actions">
            <button type="button" class="dream-kpi-history-edit">수정</button>
            <button type="button" class="dream-kpi-history-delete">삭제</button>
          </div>
        `;
        item.querySelector(".dream-kpi-history-edit").addEventListener("click", () => showKpiLogModal(kpi, log));
        item.querySelector(".dream-kpi-history-delete").addEventListener("click", () => {
          const d = loadHappinessMap();
          appendDeletedRef(d, "kpiLogs", log.id);
          d.kpiLogs = (d.kpiLogs || []).filter((l) => l.id !== log.id);
          saveHappinessMap(d);
          renderKpiList();
          renderKpiHistory();
        });
        list.appendChild(item);
      });
      historyWrap.appendChild(list);
    }

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
      item.className = "dream-kpi-todo-item" + (completed ? " is-completed" : "");
      item.dataset.todoId = todo.id;

      const label = document.createElement("label");
      label.className = "dream-kpi-todo-check-wrap";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "dream-kpi-todo-check";
      check.checked = completed;
      label.appendChild(check);

      const textInput = document.createElement("textarea");
      textInput.className = "dream-kpi-todo-text dream-kpi-todo-edit-input";
      textInput.value = todo.text || "";
      textInput.title = "할 일 내용 수정";
      textInput.autocomplete = "off";
      textInput.spellcheck = false;
      textInput.style.cssText =
        "flex:1;min-width:0;border:none;background:transparent;font:inherit;color:inherit;padding:0;margin:0;box-sizing:border-box;resize:none;overflow:hidden;line-height:1.45;";
      setupKpiTodoInlineTextarea(textInput);
      bindKpiTodoTextareaKeydown(textInput);
      const saveTodoText = () => {
        const d = loadHappinessMap();
        const arr = d.kpiTodos || [];
        const row = arr.find((x) => x.id === todo.id);
        if (!row) return;
        const val = textInput.value.trim();
        if (!val) {
          textInput.value = row.text || "";
          return;
        }
        if (row.text === val) return;
        row.text = val;
        saveHappinessMap(d);
      };
      textInput.addEventListener("blur", saveTodoText);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "dream-kpi-todo-del";
      delBtn.title = "삭제";
      delBtn.textContent = "×";
      delBtn.addEventListener("click", () => {
        const d = loadHappinessMap();
        appendDeletedRef(d, "kpiTodos", todo.id);
        d.kpiTodos = (d.kpiTodos || []).filter((x) => x.id !== todo.id);
        saveHappinessMap(d);
        renderKpiHistory();
      });

      check.addEventListener("change", () => {
        const d = loadHappinessMap();
        const t = d.kpiTodos.find((x) => x.id === todo.id);
        if (t) {
          t.completed = !!check.checked;
          saveHappinessMap(d);
          item.classList.toggle("is-completed", t.completed);
        }
      });

      item.appendChild(label);
      item.appendChild(textInput);
      item.appendChild(delBtn);
      todoList.appendChild(item);
    });

    const addRow = document.createElement("div");
    addRow.className = "dream-kpi-todo-add-row";
    addRow.innerHTML = `
      <span class="dream-kpi-todo-add-spacer"></span>
      <input type="text" class="dream-kpi-todo-add-input" placeholder="할 일 입력" />
    `;
    const addInput = addRow.querySelector(".dream-kpi-todo-add-input");
    const addTodoFromInput = () => {
      const val = addInput.value.trim();
      if (!val) return;
      const data = loadHappinessMap();
      const todo = { id: nextId(), kpiId: selKpi, text: val, completed: false };
      data.kpiTodos = data.kpiTodos || [];
      data.kpiTodos.push(todo);
      saveHappinessMap(data);
      addInput.value = "";
      renderKpiHistory();
      setTimeout(() => historyWrap.querySelector(".dream-kpi-todo-add-input")?.focus(), 0);
    };
    addInput.addEventListener("blur", () => addTodoFromInput());
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        addTodoFromInput();
      }
    });
    attachKpiTodoInputScrollIntoView(addInput);
    historyWrap.appendChild(todoList);
    historyWrap.appendChild(addRow);

    const needHabitTracker = !!kpi.needHabitTracker;
    if (needHabitTracker) {
      const dailyHeader = document.createElement("div");
      dailyHeader.className = "dream-kpi-todo-header";
      dailyHeader.innerHTML = `<span class="dream-kpi-todo-title">매일 반복되는 할일 목록</span>`;
      historyWrap.appendChild(dailyHeader);
      const dailyDivider = document.createElement("div");
      dailyDivider.className = "dream-kpi-todo-divider";
      historyWrap.appendChild(dailyDivider);
      const dailyList = document.createElement("div");
      dailyList.className = "dream-kpi-todo-list";
      const dailyTodos = (data.kpiDailyRepeatTodos || []).filter(
        (t) => String(t.kpiId) === selKpi && (t.text || "").trim() !== "",
      );
      dailyTodos.forEach((todo) => {
        const completed = !!todo.completed;
        const item = document.createElement("div");
        item.className = "dream-kpi-todo-item" + (completed ? " is-completed" : "");
        const label = document.createElement("label");
        label.className = "dream-kpi-todo-check-wrap";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "dream-kpi-todo-check";
        check.disabled = true;
        check.checked = completed;
        check.title = "매일 할일 체크는 시간기록(과제 기록)에서만 가능합니다";
        label.appendChild(check);
        const textInput = document.createElement("textarea");
        textInput.className = "dream-kpi-todo-text dream-kpi-daily-repeat-edit-input";
        textInput.value = todo.text || "";
        textInput.title = "할 일 내용 수정";
        textInput.autocomplete = "off";
        textInput.spellcheck = false;
        textInput.style.cssText =
          "flex:1;min-width:0;border:none;background:transparent;font:inherit;color:inherit;padding:0;margin:0;box-sizing:border-box;resize:none;overflow:hidden;line-height:1.45;";
        setupKpiTodoInlineTextarea(textInput);
        bindKpiTodoTextareaKeydown(textInput);
        const saveDailyRepeatText = () => {
          const d = loadHappinessMap();
          const arr = d.kpiDailyRepeatTodos || [];
          const row = arr.find((x) => x.id === todo.id);
          if (!row) return;
          const val = textInput.value.trim();
          if (!val) {
            textInput.value = row.text || "";
            return;
          }
          if (row.text === val) return;
          row.text = val;
          saveHappinessMap(d);
        };
        textInput.addEventListener("blur", saveDailyRepeatText);
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "dream-kpi-todo-del";
        delBtn.title = "삭제";
        delBtn.textContent = "×";
        delBtn.addEventListener("click", () => {
          const d = loadHappinessMap();
          appendDeletedRef(d, "kpiDailyRepeatTodos", todo.id);
          d.kpiDailyRepeatTodos = (d.kpiDailyRepeatTodos || []).filter((x) => x.id !== todo.id);
          saveHappinessMap(d);
          renderKpiHistory();
        });
        item.appendChild(label);
        item.appendChild(textInput);
        item.appendChild(delBtn);
        dailyList.appendChild(item);
      });
      const dailyAddRow = document.createElement("div");
      dailyAddRow.className = "dream-kpi-todo-add-row";
      dailyAddRow.innerHTML = `<span class="dream-kpi-todo-add-spacer"></span><input type="text" class="dream-kpi-todo-add-input" placeholder="할 일 입력 (매일 반복)" />`;
      const dailyAddInput = dailyAddRow.querySelector(".dream-kpi-todo-add-input");
      const addDailyFromInput = () => {
        const val = dailyAddInput.value.trim();
        if (!val) return;
        const d = loadHappinessMap();
        d.kpiDailyRepeatTodos = d.kpiDailyRepeatTodos || [];
        d.kpiDailyRepeatTodos.push({ id: nextId(), kpiId: selKpi, text: val, completed: false });
        saveHappinessMap(d);
        dailyAddInput.value = "";
        renderKpiHistory();
      };
      dailyAddInput.addEventListener("blur", () => addDailyFromInput());
      dailyAddInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          addDailyFromInput();
        }
      });
      attachKpiTodoInputScrollIntoView(dailyAddInput);
      historyWrap.appendChild(dailyList);
      historyWrap.appendChild(dailyAddRow);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function showHappinessAddModal() {
    const modal = document.createElement("div");
    modal.className = "dream-kpi-modal";
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel">
        <div class="dream-kpi-modal-header">
          <h3 class="dream-kpi-modal-title">행복 목표 추가</h3>
          <button type="button" class="dream-kpi-modal-close" title="닫기">×</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-field">
            <label>행복 이름</label>
            <input type="text" name="name" placeholder="성장과 기쁨 같이 누리기" />
          </div>
          <button type="button" class="dream-kpi-submit dream-add-confirm-btn">확인</button>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector(".dream-kpi-backdrop").addEventListener("click", close);
    modal.querySelector(".dream-kpi-modal-close").addEventListener("click", close);
    const form = modal.querySelector("form");
    const confirmBtn = modal.querySelector(".dream-add-confirm-btn");
    const doSubmit = () => {
      const val = (form.name.value || "").trim() || "새 행복";
      const data = loadHappinessMap();
      const happiness = { id: nextId(), name: val };
      data.happinesses.push(happiness);
      saveHappinessMap(data);
      activeHappinessId = happiness.id;
      selectedKpiId = null;
      happinessAddModalJustClosed = true;
      close();
      renderTabs();
      updateTitleAndContent();
      setTimeout(() => { happinessAddModalJustClosed = false; }, 300);
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
    modal.className = "dream-kpi-modal dream-delete-confirm-modal";
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel dream-delete-confirm-panel">
        <h3 class="dream-delete-confirm-title">행복 삭제</h3>
        <p class="dream-delete-confirm-msg">"${escapeHtml(happinessName)}"을(를) 정말 삭제하시겠습니까?</p>
        <p class="dream-delete-confirm-warn">삭제 시 복구 불가</p>
        <div class="dream-delete-confirm-actions">
          <button type="button" class="dream-delete-confirm-cancel">취소</button>
          <button type="button" class="dream-delete-confirm-submit">삭제</button>
        </div>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector(".dream-kpi-backdrop").addEventListener("click", close);
    modal.querySelector(".dream-delete-confirm-cancel").addEventListener("click", close);
    modal.querySelector(".dream-delete-confirm-submit").addEventListener("click", () => {
      close();
      const d = loadHappinessMap();
      appendDeletedRef(d, "categories", happinessId);
      const happinessKpis = (d.kpis || []).filter((k) => k.happinessId === happinessId);
      const kpiIds = happinessKpis.map((k) => k.id);
      happinessKpis.forEach((k) => {
        appendDeletedRef(d, "kpis", k.id);
        syncKpiToTimeTask(k, "remove");
      });
      d.happinesses = (d.happinesses || []).filter((x) => x.id !== happinessId);
      d.kpis = (d.kpis || []).filter((k) => k.happinessId !== happinessId);
      d.kpiLogs = (d.kpiLogs || []).filter((l) => !kpiIds.includes(l.kpiId));
      d.kpiTodos = (d.kpiTodos || []).filter((t) => !kpiIds.includes(t.kpiId));
      d.kpiDailyRepeatTodos = (d.kpiDailyRepeatTodos || []).filter((t) => !kpiIds.includes(t.kpiId));
      delete d.kpiOrder?.[happinessId];
      d.kpiTaskSync = d.kpiTaskSync || {};
      kpiIds.forEach((id) => delete d.kpiTaskSync[id]);
      saveHappinessMap(d);
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
    modal.className = "dream-kpi-modal";
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel dream-path-context-panel">
        <div class="dream-kpi-modal-header">
          <h3 class="dream-kpi-modal-title">행복 수정</h3>
          <button type="button" class="dream-kpi-modal-close" title="닫기">×</button>
        </div>
        <form class="dream-kpi-form dream-path-edit-form">
          <div class="dream-kpi-field">
            <label>행복 이름</label>
            <input type="text" name="name" value="${escapeHtml(happiness.name || "")}" placeholder="성장과 기쁨 같이 누리기" />
          </div>
          <button type="submit" class="dream-kpi-submit">수정</button>
        </form>
        <div class="dream-path-context-divider"></div>
        <div class="dream-path-context-actions">
          <button type="button" class="dream-path-context-btn dream-path-context-delete" data-action="delete">삭제</button>
        </div>
        <p class="dream-path-context-warn">삭제 시 복구할 수 없습니다.</p>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector(".dream-kpi-backdrop").addEventListener("click", close);
    modal.querySelector(".dream-kpi-modal-close").addEventListener("click", close);
    modal.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const val = (e.target.name.value || "").trim() || "행복 이름";
      const d = loadHappinessMap();
      const target = d.happinesses.find((x) => x.id === happiness.id);
      if (target) {
        target.name = val;
        saveHappinessMap(d);
        renderTabs();
      }
      close();
    });
    modal.querySelector('[data-action="delete"]').addEventListener("click", () => {
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
      tab.className = "dream-tab" + (happiness.id === activeHappinessId ? " active" : "");
      tab.dataset.happinessId = happiness.id;
      tab.innerHTML = `<span class="dream-tab-text">${escapeHtml(happiness.name || "행복 이름")}</span>`;
      tab.addEventListener("click", () => {
        if (activeHappinessId !== happiness.id) {
          selectedKpiId = null;
        }
        activeHappinessId = happiness.id;
        renderTabs();
        updateTitleAndContent();
      });
      tab.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showHappinessContextModal(happiness, tab);
      });
      tabs.appendChild(tab);
    });
    tabs.appendChild(addBtn);
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
    if (!e.detail?.fromServerMerge || !el.isConnected) return;
    /* push 시에는 화면 갱신 불필요 (로컬 변경을 서버에 올린 것이므로) */
    if (e.detail?.fromPush) return;
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
