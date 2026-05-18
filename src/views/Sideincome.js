/**
 * 부수입 페이지 - 꿈 페이지와 동일 구조
 * 부수입 목표 추가 모달 → 확인 시 탭 형성, KPI 카드, 로그, 할일
 * 활성 탭 연필 버튼으로 이름·목표 수정/삭제 모달
 */

import {
  SIDEINCOME_KPI_MAP_STORAGE_KEY,
  applySideincomeKpiTimestampsOnSave,
} from "../utils/sideincomeKpiMapSupabase.js";
import {
  kpiTimeTaskAdd,
  kpiTimeTaskRemove,
  kpiTimeTaskRename,
  getFullTaskOptions,
} from "../utils/timeTaskOptionsModel.js";
import { toDateInputValue, formatDeadlineForDisplay, formatDeadlineRangeForDisplay, formatDeadlineRangeCompact } from "../utils/ganttModal.js";
import { setupDeadlineQuickButtons } from "../utils/deadlineQuickButtons.js";
import {
  afterKpiTodoListMutationScroll,
} from "../utils/kpiTodoInputScroll.js";
import { getAccumulatedMinutesForKpiId, minutesToHhMm, hhMmToMinutes, syncHabitTrackerLogs } from "../utils/timeKpiSync.js";
import { defaultManualKpiLogMeta, kpiLogSourceBadgeHtml, formatKpiHistoryValueText } from "../utils/kpiLogFields.js";
import { createKpiHabitGridElement } from "../utils/kpiHabitTrackerGrid.js";
import { wireKpiHistoryHabitTabs } from "../utils/kpiHistoryHabitTabs.js";
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
import { KPI_TAB_EDIT_PENCIL_HTML } from "../utils/kpiTabNameEditIcon.js";
import { sortKpiLogsNewestFirst, getLatestKpiLogWithExplicitValue } from "../utils/kpiLogsSort.js";
import {
  deletedRefsKpiTodosLen,
  kpiTodoLifecycleLog,
  kpiTodoSnapshotBrief,
  kpiTodosCompletionBrief,
} from "../utils/kpiTodoLifecycleDebug.js";
import { pullKpiMapSubViewFromCloud } from "../utils/kpiTabCloudRefresh.js";
import {
  APP_FOOTER_ICON_BTN_CLASS,
  getAppFooterActionsSlot,
} from "../utils/appFooterShell.js";

const FIXED_TASK_NAMES = new Set(["수면하기", "근무하기"]);

const SIDEINCOME_FOOTER_LOG_ICON = `<img src="/toolbaricons/list.svg" alt="" width="22" height="22" aria-hidden="true" />`;
const SIDEINCOME_FOOTER_TODO_ICON = `<img src="/toolbaricons/todolist.svg" alt="" width="22" height="22" aria-hidden="true" />`;

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

function loadSideincomeMap() {
  try {
    const raw = localStorage.getItem(SIDEINCOME_KPI_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const kpis = (parsed.kpis || []).map((k) => ({
        ...k,
        needHabitTracker: !!k.needHabitTracker,
        direction: k.direction === "lower" ? "lower" : "higher",
      }));
      return {
        paths: parsed.paths || [],
        kpis,
        kpiLogs: parsed.kpiLogs || [],
        kpiTodos: parsed.kpiTodos || [],
        kpiDailyRepeatTodos: parsed.kpiDailyRepeatTodos || [],
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
    const opts = getFullTaskOptions();
    if (opts.some((o) => getTaskName(o) === name)) return;
    data.kpiTaskSync[kpi.id] = name;
    saveSideincomeMap(data);
    kpiTimeTaskAdd(kpi, "sideincome");
  } else if (action === "remove") {
    const syncName = (data.kpiTaskSync[kpi.id] || kpi.name || "").trim();
    if (syncName) {
      delete data.kpiTaskSync[kpi.id];
      saveSideincomeMap(data);
      kpiTimeTaskRemove(kpi, syncName);
    }
  } else if (action === "update" && oldName) {
    const newName = (kpi.name || "").trim();
    const oldNm = (oldName || "").trim();
    if (!newName || oldNm === newName) return;
    data.kpiTaskSync[kpi.id] = newName;
    saveSideincomeMap(data);
    void kpiTimeTaskRename(kpi, oldNm);
  }
}

function saveSideincomeMap(data) {
  try {
    let prev = null;
    try {
      const raw = localStorage.getItem(SIDEINCOME_KPI_MAP_STORAGE_KEY);
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
    localStorage.setItem(SIDEINCOME_KPI_MAP_STORAGE_KEY, JSON.stringify(stamped));
    try {
      window.dispatchEvent(new CustomEvent("sideincome-kpi-map-saved"));
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
  el.className = "app-tab-panel-content sideincome-view dream-view lp-kpi-dream-page";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "dream-add-icon-btn";
  addBtn.title = "부수입 목표 추가";
  addBtn.setAttribute("aria-label", "부수입 목표 추가");
  addBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="dream-add-icon" aria-hidden="true" width="24" height="24"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m12 8v8"/><path d="m8 12h8"/><path d="m18 22h-12c-2.209 0-4-1.791-4-4v-12c0-2.209 1.791-4 4-4h12c2.209 0 4 1.791 4 4v12c0 2.209-1.791 4-4 4z"/></g></svg>`;
  addBtn.addEventListener("click", () => {
    if (pathAddModalJustClosed) return;
    showPathAddModal();
  });

  const header = document.createElement("header");
  header.className = "dream-view-header";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "SIDE INCOME";
  const titleRow = document.createElement("div");
  titleRow.className = "dream-view-header-title-row";
  const title = document.createElement("h1");
  title.className = "dream-view-title";
  title.textContent = "부수입";
  titleRow.appendChild(title);
  titleRow.appendChild(addBtn);
  header.appendChild(label);
  header.appendChild(titleRow);
  el.appendChild(header);

  const tabsWrap = document.createElement("div");
  tabsWrap.className = "dream-tabs-wrap";
  const tabs = document.createElement("div");
  tabs.className = "dream-tabs";
  tabsWrap.appendChild(tabs);
  el.appendChild(tabsWrap);

  const contentWrap = document.createElement("div");
  contentWrap.className = "dream-content-wrap";
  el.appendChild(contentWrap);

  const historyWrap = document.createElement("div");
  historyWrap.className = "dream-kpi-history-wrap";
  historyWrap.hidden = true;
  el.appendChild(historyWrap);

  let activePathId = null;
  let selectedKpiId = null;
  let kpiFilter = "all";
  let kpiGridScrollPrevFilter = null;
  let kpiGridScrollPrevScopeId = null;
  let pathAddModalJustClosed = false;

  const _sideincomeUiSession = readKpiUiSession(KPI_UI_SESSION_KEYS.sideincome);
  const _sideincomeInitData = loadSideincomeMap();
  const _sideincomeRestored = restoreKpiTabFromSession(_sideincomeUiSession, {
    categoryIds: _sideincomeInitData.paths || [],
    kpis: _sideincomeInitData.kpis || [],
    foreignKey: "pathId",
  });
  if (_sideincomeRestored.tabId) activePathId = _sideincomeRestored.tabId;
  selectedKpiId = _sideincomeRestored.selectedKpiId;
  kpiFilter = _sideincomeRestored.kpiFilter;

  function persistKpiUiState() {
    writeKpiUiSession(KPI_UI_SESSION_KEYS.sideincome, {
      tabId: activePathId,
      selectedKpiId,
      kpiFilter,
    });
  }

  function showKpiModal() {
    if (!activePathId) return;
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
              <input type="text" name="name" placeholder="예) 인스타 게시물 포스팅하기" />
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
                <label><span class="dream-kpi-target-label-text">목표값</span></label>
                <input type="text" name="targetValue" placeholder="예) 100" inputmode="numeric" />
              </div>
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                <label>단위</label>
                <input type="text" name="unit" placeholder="예) 게시물" />
              </div>
            </div>
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>필요시간</label>
              <input type="text" name="targetTimeRequired" placeholder="예) 25:00" />
            </div>
            <div class="dream-kpi-period-block" data-legacy="time-add-task-field">
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
            <div class="dream-kpi-field dream-kpi-field-checkbox" data-legacy="time-add-task-field">
              <label class="dream-kpi-checkbox-label">
                매일 반복
                <input type="checkbox" name="needHabitTracker" />
              </label>
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
      const kpi = {
        id: nextId(),
        pathId: activePathId,
        name: (form.name.value || "").trim() || "행동",
        unit: (form.unit.value || "").trim() || "",
        targetValue: sanitizeNumericInput(form.targetValue.value) || "",
        targetTimeRequired: (form.targetTimeRequired?.value || "").trim() || "",
        targetStartDate: (form.targetStartDate?.value || "").trim() || "",
        targetDeadline: (form.targetDeadline.value || "").trim() || "",
        needHabitTracker: needHabitChecked,
        direction: dir,
      };
      const data = loadSideincomeMap();
      data.kpis = data.kpis || [];
      const existingOrder = (data.kpiOrder || {})[activePathId] || data.kpis.filter((k) => k.pathId === activePathId).map((k) => k.id);
      data.kpis.push(kpi);
      data.kpiOrder = data.kpiOrder || {};
      data.kpiOrder[activePathId] = [...existingOrder, kpi.id];
      saveSideincomeMap(data);
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
      if (targetInput) targetInput.placeholder = lower ? "예) 5" : "예) 100";
    };
    radios.forEach((r) => r.addEventListener("change", sync));
    sync();
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
              <input type="text" name="name" value="${escapeHtml(kpi.name || "")}" placeholder="예) 인스타 게시물 포스팅하기" />
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
                <label><span class="dream-kpi-target-label-text">목표값</span></label>
                <input type="text" name="targetValue" value="${escapeHtml(sanitizeNumericInput(kpi.targetValue))}" placeholder="예) 100" inputmode="numeric" />
              </div>
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                <label>단위</label>
                <input type="text" name="unit" value="${escapeHtml(kpi.unit || "")}" placeholder="예) 게시물" />
              </div>
            </div>
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>필요시간</label>
              <input type="text" name="targetTimeRequired" value="${escapeHtml(kpi.targetTimeRequired || "")}" placeholder="예) 25:00" />
            </div>
            <div class="dream-kpi-period-block" data-legacy="time-add-task-field">
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
            <div class="dream-kpi-field dream-kpi-field-checkbox" data-legacy="time-add-task-field">
              <label class="dream-kpi-checkbox-label">
                매일 반복
                <input type="checkbox" name="needHabitTracker" ${kpi.needHabitTracker ? "checked" : ""} />
              </label>
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
      const data = loadSideincomeMap();
      appendDeletedRef(data, "kpis", kpi.id);
      data.kpis = (data.kpis || []).filter((k) => k.id !== kpi.id);
      data.kpiLogs = (data.kpiLogs || []).filter((l) => l.kpiId !== kpi.id);
      data.kpiTodos = (data.kpiTodos || []).filter((t) => t.kpiId !== kpi.id);
      data.kpiDailyRepeatTodos = (data.kpiDailyRepeatTodos || []).filter((t) => t.kpiId !== kpi.id);
      const order = (data.kpiOrder || {})[kpi.pathId] || [];
      data.kpiOrder = { ...data.kpiOrder, [kpi.pathId]: order.filter((id) => id !== kpi.id) };
      saveSideincomeMap(data);
      selectedKpiId = null;
      close();
      renderKpiList();
      renderKpiHistory();
    });
    modal.querySelector(".dream-kpi-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const data = loadSideincomeMap();
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
        saveSideincomeMap(data);
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
                <input type="date" name="date" value="${dateVal}" />
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
      const data = loadSideincomeMap();
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
          pathId: kpi.pathId,
          date: dateStr,
          dateRaw: dateVal,
          value: sanitizeNumericInput(form.value.value) || "",
          memo: (form.memo.value || "").trim(),
          ...defaultManualKpiLogMeta(),
        };
        data.kpiLogs = data.kpiLogs || [];
        data.kpiLogs.push(log);
      }
      saveSideincomeMap(data);
      close();
      renderKpiList();
      renderKpiHistory();
    });
    const delBtn = modal.querySelector(".dream-kpi-log-modal-delete-btn");
    if (delBtn && isEdit) {
      delBtn.addEventListener("click", () => {
        const d = loadSideincomeMap();
        appendDeletedRef(d, "kpiLogs", editLog.id);
        d.kpiLogs = (d.kpiLogs || []).filter((l) => l.id !== editLog.id);
        saveSideincomeMap(d);
        close();
        renderKpiList();
        renderKpiHistory();
      });
    }
    document.body.appendChild(modal);
    setupNumericOnlyInput(modal.querySelector('input[name="value"]'));
  }

  function showPathLogModal(path, editLog) {
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
          <h3 data-legacy="time-task-setup-title">${isEdit ? "부수입 로그 수정" : "부수입 로그 추가"}</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-log-form">
          <div data-legacy="time-task-setup-body">
          <div class="dream-kpi-log-section">
            <div class="dream-kpi-log-row">
              <div class="dream-kpi-log-field">
                <label>날짜</label>
                <input type="date" name="date" value="${dateVal}" />
              </div>
              <div class="dream-kpi-log-field">
                <label>경로</label>
                <input type="text" value="${escapeHtml(path.name || "")}${path.unit ? " (" + escapeHtml(path.unit) + ")" : ""}" readonly class="dream-kpi-log-readonly" />
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
      saveSideincomeMap(data);
      close();
      renderKpiList();
    });
    const pathDelBtn = modal.querySelector(".dream-kpi-log-modal-delete-btn");
    if (pathDelBtn && isEdit) {
      pathDelBtn.addEventListener("click", () => {
        const d = loadSideincomeMap();
        appendDeletedRef(d, "pathLogs", editLog.id);
        d.pathLogs = (d.pathLogs || []).filter((l) => l.id !== editLog.id);
        saveSideincomeMap(d);
        close();
        renderKpiList();
      });
    }
    document.body.appendChild(modal);
    setupNumericOnlyInput(modal.querySelector('input[name="value"]'));
  }

  function clearSideincomeKpiFooterActions() {
    const slot = getAppFooterActionsSlot();
    if (!slot) return;
    slot
      .querySelectorAll("[data-lp-dream-kpi-footer-action]")
      .forEach((n) => n.remove());
  }

  function syncAppFooterSideincomeKpiActions() {
    clearSideincomeKpiFooterActions();
    const slot = getAppFooterActionsSlot();
    if (!slot) return;
    if (!selectedKpiId || !activePathId) return;
    const data = loadSideincomeMap();
    const kpiNow = (data.kpis || []).find((k) => k.id === selectedKpiId);
    if (!kpiNow || kpiNow.pathId !== activePathId) return;

    const logBtn = document.createElement("button");
    logBtn.type = "button";
    logBtn.className = APP_FOOTER_ICON_BTN_CLASS;
    logBtn.setAttribute("data-lp-dream-kpi-footer-action", "");
    logBtn.title = "로그 추가";
    logBtn.setAttribute("aria-label", "로그 추가");
    logBtn.innerHTML = SIDEINCOME_FOOTER_LOG_ICON;
    logBtn.addEventListener("click", () => {
      const d = loadSideincomeMap();
      const k = (d.kpis || []).find((x) => x.id === selectedKpiId);
      if (k) showKpiLogModal(k);
    });

    const todoBtn = document.createElement("button");
    todoBtn.type = "button";
    todoBtn.className = APP_FOOTER_ICON_BTN_CLASS;
    todoBtn.setAttribute("data-lp-dream-kpi-footer-action", "");
    todoBtn.title = "할 일 추가";
    todoBtn.setAttribute("aria-label", "할 일 추가");
    todoBtn.innerHTML = SIDEINCOME_FOOTER_TODO_ICON;
    todoBtn.addEventListener("click", async () => {
      const d = loadSideincomeMap();
      const k = (d.kpis || []).find((x) => x.id === selectedKpiId);
      if (!k) return;
      const text = await showKpiTodoAddModal({
        kpiName: k.name,
        placeholder: "할 일 입력",
      });
      if (!text) return;
      const d2 = loadSideincomeMap();
      const todo = {
        id: nextId(),
        kpiId: String(selectedKpiId),
        text,
        completed: false,
      };
      d2.kpiTodos = d2.kpiTodos || [];
      d2.kpiTodos.push(todo);
      saveSideincomeMap(d2);
      renderKpiHistory({ scrollTodoAfterMutation: true });
    });

    slot.appendChild(logBtn);
    slot.appendChild(todoBtn);
  }

  function getKpiLogs(kpiId) {
    const data = loadSideincomeMap();
    const logs = (data.kpiLogs || []).filter((l) => l.kpiId === kpiId);
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
    const lower = kpi.direction === "lower";
    const data = loadSideincomeMap();
    const latestLog = lower
      ? getLatestKpiLogWithExplicitValue(kpi.id, data.kpiLogs)
      : null;
    const targetVal = parseNum(kpi.targetValue);
    let currentVal;
    let progress = 0;
    if (lower) {
      currentVal =
        latestLog != null ? parseNum(latestLog.value) : null;
      if (latestLog != null && currentVal != null) {
        if (targetVal > 0) {
          const c = Math.max(currentVal, 1e-9);
          progress = Math.min(100, (targetVal / c) * 100);
        } else if (targetVal === 0) {
          progress = currentVal <= 0 ? 100 : 0;
        }
      }
    } else {
      currentVal = getAccumulatedKpiValue(kpi.id);
      progress =
        targetVal > 0 ? Math.min(100, (currentVal / targetVal) * 100) : 0;
    }
    const targetMins = kpi.targetTimeRequired ? hhMmToMinutes(kpi.targetTimeRequired) : 0;
    const accumulatedMins = targetMins > 0 ? getAccumulatedMinutesForKpiId(kpi.id) : 0;
    const timeProgress = targetMins > 0 ? Math.min(100, (accumulatedMins / targetMins) * 100) : 0;
    const valueComplete = lower
      ? latestLog != null &&
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
    const scopeId = activePathId;
    const savedGridScroll = readKpiGridScrollToRestore(
      contentWrap,
      kpiFilter,
      scopeId,
      kpiGridScrollPrevFilter,
      kpiGridScrollPrevScopeId,
    );
    historyWrap.remove();
    contentWrap.innerHTML = "";
    if (!activePathId) {
      kpiGridScrollPrevFilter = null;
      kpiGridScrollPrevScopeId = null;
      persistKpiUiState();
      historyWrap.hidden = true;
      el.appendChild(historyWrap);
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
    /* 진행중 = 미완료 KPI만(시작일 없는 새 KPI 포함) — 꿈 탭과 동일 */
    const completedKpis = pathKpis.filter((k) => getKpiProgress(k).isCompleted);
    const activeKpis = pathKpis.filter((k) => !getKpiProgress(k).isCompleted);

    const path = data.paths.find((p) => p.id === activePathId);
    const pathLogs = (data.pathLogs || []).filter((l) => l.pathId === activePathId);
    const pathCurrentVal = pathLogs.reduce((sum, l) => sum + parseNum(l.value), 0);
    const pathTargetVal = parseNum(path?.targetAmount);
    const pathProgress = pathTargetVal > 0 ? Math.min(100, (pathCurrentVal / pathTargetVal) * 100) : 0;
    const formatNum = (n) => (n == null || Number.isNaN(n) ? "—" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
    const pathUnit = path?.unit ? " " + path.unit : "";
    const pathUnitTrim = (path?.unit || "").trim();
    const targetDisp = path.targetAmount
      ? escapeHtml(String(path.targetAmount).replace(/\B(?=(\d{3})+(?!\d))/g, ","))
      : "—";

    if (path) {
      const pathSummary = document.createElement("div");
      pathSummary.className = "dream-kpi-path-summary";
      pathSummary.innerHTML = `
        <div class="dream-kpi-path-summary-inner">
          <div class="dream-kpi-path-summary-top">
            <h2 class="dream-kpi-path-summary-name">${escapeHtml(path.name || "부수입 경로")}</h2>
            <button type="button" class="dream-kpi-path-summary-log-btn dream-kpi-todo-header-add-btn">+ 로그</button>
          </div>
          <div class="dream-kpi-path-summary-hero">
            <span class="dream-kpi-path-summary-hero-current">${formatNum(pathCurrentVal)}</span><span class="dream-kpi-path-summary-hero-slash">/</span><span class="dream-kpi-path-summary-hero-denom">${targetDisp}</span>${pathUnitTrim ? `<span class="dream-kpi-path-summary-hero-unit">${escapeHtml(pathUnitTrim)}</span>` : ""}
          </div>
          <div class="dream-kpi-card-progress">
            <div class="dream-kpi-card-progress-bar"><div class="dream-kpi-card-progress-fill" style="width:${pathProgress}%"></div></div>
            <div class="dream-kpi-card-progress-text">누적 ${formatNum(pathCurrentVal)} / 목표 ${targetDisp}${pathUnit}</div>
          </div>
          <div class="dream-kpi-path-summary-logs-heading">부수입 로그</div>
          <div class="dream-kpi-path-summary-logs dream-kpi-history-list"></div>
        </div>
      `;
      pathSummary.querySelector(".dream-kpi-path-summary-log-btn").addEventListener("click", () => showPathLogModal(path));
      const logsContainer = pathSummary.querySelector(".dream-kpi-path-summary-logs");
      pathLogs.sort((a, b) => (b.dateRaw || b.date || "").localeCompare(a.dateRaw || a.date || ""));
      pathLogs.forEach((log) => {
        const item = document.createElement("div");
        item.className = "dream-kpi-path-log-item";
        item.innerHTML = `
          <div class="dream-kpi-path-log-body">
            <span class="dream-kpi-path-log-date">${escapeHtml(log.date)}</span>
            <span class="dream-kpi-path-log-value">${escapeHtml(log.value || "—")}${pathUnit}</span>
            ${log.memo ? `<div class="dream-kpi-path-log-memo">${escapeHtml(log.memo)}</div>` : ""}
          </div>
          <div class="dream-kpi-path-log-actions">
            <button type="button" class="dream-kpi-path-log-edit">수정</button>
            <button type="button" class="dream-kpi-path-log-del">삭제</button>
          </div>
        `;
        item.querySelector(".dream-kpi-path-log-edit").addEventListener("click", () => showPathLogModal(path, log));
        item.querySelector(".dream-kpi-path-log-del").addEventListener("click", () => {
          const d = loadSideincomeMap();
          appendDeletedRef(d, "pathLogs", log.id);
          d.pathLogs = (d.pathLogs || []).filter((l) => l.id !== log.id);
          saveSideincomeMap(d);
          renderKpiList();
        });
        logsContainer.appendChild(item);
      });
      contentWrap.appendChild(pathSummary);
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
        /* 필터 변경 시 선택된 KPI가 새 필터에 없으면 선택 해제 */
        const listAfterFilter = kpiFilter === "active" ? activeKpis : kpiFilter === "completed" ? completedKpis : pathKpis;
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
    const listToShow = kpiFilter === "active" ? activeKpis : kpiFilter === "completed" ? completedKpis : pathKpis;
    let historyAnchoredUnderCard = false;
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
      const investedMins = getAccumulatedMinutesForKpiId(kpi.id);
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
          <div class="dream-kpi-card-target-num">${formatKpiCardHeroHtml(lowerBetter, currentStr, kpi.unit)}</div>
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
        const newOrder = pathKpis.map((k) => k.id);
        const fromIdx = newOrder.indexOf(draggedId);
        const toIdx = newOrder.indexOf(kpi.id);
        if (fromIdx >= 0 && toIdx >= 0) {
          newOrder.splice(fromIdx, 1);
          newOrder.splice(toIdx, 0, draggedId);
          reorderKpis(activePathId, newOrder);
          renderKpiList();
          renderKpiHistory();
        }
      });
      grid.appendChild(card);
      if (selectedKpiId === kpi.id) {
        grid.appendChild(historyWrap);
        historyAnchoredUnderCard = true;
      }
    });
    grid.addEventListener("dragend", () => {
      grid.querySelectorAll(".dream-kpi-card-drag-over").forEach((c) => c.classList.remove("dream-kpi-card-drag-over"));
    });
    if (!historyAnchoredUnderCard) {
      grid.appendChild(historyWrap);
    }
    if (!selectedKpiId) {
      const addCard = document.createElement("button");
      addCard.type = "button";
      addCard.className = "dream-kpi-add-card";
      addCard.innerHTML = '<span class="dream-kpi-add-card-text">+ KPI 추가하기</span>';
      addCard.addEventListener("click", () => {
        if (!activePathId) return;
        showKpiModal();
      });
      grid.appendChild(addCard);
    }
    contentWrap.appendChild(grid);

    applyKpiGridScrollRestore(contentWrap, savedGridScroll);
    kpiGridScrollPrevFilter = kpiFilter;
    kpiGridScrollPrevScopeId = scopeId;
    persistKpiUiState();
    syncAppFooterSideincomeKpiActions();
  }

  function renderKpiHistory(opts = {}) {
    const { scrollTodoAfterMutation = false } = opts;
    historyWrap.innerHTML = "";
    if (!selectedKpiId) {
      historyWrap.hidden = true;
      syncAppFooterSideincomeKpiActions();
      return;
    }
    const data = loadSideincomeMap();
    const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
    if (!kpi) {
      historyWrap.hidden = true;
      selectedKpiId = null;
      renderKpiList();
      return;
    }
    const needHabitTracker = !!kpi.needHabitTracker;
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
    `;
    historyWrap.appendChild(headerRow);

    const dailyTodosForGrid = needHabitTracker
      ? (data.kpiDailyRepeatTodos || []).filter(
          (t) => String(t.kpiId) === selKpi && (t.text || "").trim() !== "",
        )
      : [];
    const useHabitTabs = needHabitTracker && dailyTodosForGrid.length > 0;

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

      appendKpiDailyLogBlock(panelLog);
      const gridEl = createKpiHabitGridElement(selKpi, dailyTodosForGrid, data.kpiLogs || []);
      if (gridEl) panelTr.appendChild(gridEl);

      wireKpiHistoryHabitTabs("sideincome", selectedKpiId, btnLog, btnTr, panelLog, panelTr);
      historyWrap.appendChild(panelLog);
      historyWrap.appendChild(panelTr);
    } else {
      appendKpiDailyLogBlock(historyWrap);
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
          const d = loadSideincomeMap();
          kpiTodoLifecycleLog("부수입KPI탭_모달삭제", {
            todoId: String(todo.id),
            삭제전: kpiTodoSnapshotBrief(d),
            삭제전dr: deletedRefsKpiTodosLen(d),
          });
          appendDeletedRef(d, "kpiTodos", todo.id);
          d.kpiTodos = (d.kpiTodos || []).filter((x) => x.id !== todo.id);
          saveSideincomeMap(d);
          const after = loadSideincomeMap();
          kpiTodoLifecycleLog("부수입KPI탭_모달삭제_saveSideincomeMap후", {
            todoId: String(todo.id),
            삭제후: kpiTodoSnapshotBrief(after),
            삭제후dr: deletedRefsKpiTodosLen(after),
          });
          renderKpiHistory({ scrollTodoAfterMutation: true });
          return;
        }
        const d = loadSideincomeMap();
        const row = (d.kpiTodos || []).find((x) => x.id === todo.id);
        if (!row) return;
        row.text = result.text;
        saveSideincomeMap(d);
        renderKpiHistory({ scrollTodoAfterMutation: true });
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
          saveSideincomeMap(d);
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

    historyWrap.appendChild(todoList);

    if (needHabitTracker) {
      const dailyHeader = document.createElement("div");
      dailyHeader.className = "dream-kpi-todo-header";
      dailyHeader.innerHTML = `<span class="dream-kpi-todo-title">매일 반복되는 할일 목록</span><button type="button" class="dream-kpi-history-log-btn dream-kpi-todo-header-add-btn dream-kpi-todo-header-add-btn--daily">+ 추가</button>`;
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
        const item = document.createElement("div");
        item.className = "dream-kpi-todo-item dream-kpi-daily-repeat-ref";
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
            const d = loadSideincomeMap();
            appendDeletedRef(d, "kpiDailyRepeatTodos", todo.id);
            d.kpiDailyRepeatTodos = (d.kpiDailyRepeatTodos || []).filter((x) => x.id !== todo.id);
            saveSideincomeMap(d);
            renderKpiHistory({ scrollTodoAfterMutation: true });
            return;
          }
          const d = loadSideincomeMap();
          const row = (d.kpiDailyRepeatTodos || []).find((x) => x.id === todo.id);
          if (!row) return;
          row.text = result.text;
          saveSideincomeMap(d);
          renderKpiHistory({ scrollTodoAfterMutation: true });
        };

        item.addEventListener("click", async (e) => {
          if (e.target.closest(".dream-kpi-todo-check-wrap")) return;
          await openDailyEdit();
        });

        item.appendChild(label);
        item.appendChild(textPreview);
        dailyList.appendChild(item);
      });
      dailyHeader.querySelector(".dream-kpi-todo-header-add-btn--daily")?.addEventListener("click", async () => {
        const text = await showKpiTodoAddModal({
          kpiName: kpi.name,
          title: "매일 할 일 추가",
          placeholder: "할 일 입력 (매일 반복)",
        });
        if (!text) return;
        const d = loadSideincomeMap();
        d.kpiDailyRepeatTodos = d.kpiDailyRepeatTodos || [];
        d.kpiDailyRepeatTodos.push({ id: nextId(), kpiId: selKpi, text, completed: false });
        saveSideincomeMap(d);
        renderKpiHistory({ scrollTodoAfterMutation: true });
      });
      historyWrap.appendChild(dailyList);
    }
    if (scrollTodoAfterMutation) {
      afterKpiTodoListMutationScroll(historyWrap);
    }
    syncAppFooterSideincomeKpiActions();
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
          <h3 data-legacy="time-task-setup-title">부수입 경로 삭제</h3>
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
      saveSideincomeMap(d);
      if (activePathId === pathId) {
        activePathId = d.paths[0]?.id || null;
        selectedKpiId = null;
      }
      renderTabs();
      updateTitleAndContent();
    });
    document.body.appendChild(modal);
  }

  function showPathContextModal(path, tabEl) {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel" class="dream-path-context-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">부수입 경로 수정</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form dream-path-edit-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>경로 이름</label>
              <input type="text" name="name" value="${escapeHtml(path.name || "")}" placeholder="홈페이지 디자인 외주" />
            </div>
            <div class="dream-kpi-row">
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                <label>목표 부수입</label>
                <input type="text" name="targetAmount" value="${escapeHtml(path.targetAmount || "")}" placeholder="예) 1000000" inputmode="numeric" />
              </div>
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                <label>단위</label>
                <input type="text" name="unit" value="${escapeHtml(path.unit || "")}" placeholder="예) 원, 만원" />
              </div>
            </div>
            <div class="dream-kpi-delete-wrap">
              <button type="button" class="dream-kpi-delete-btn" data-action="delete">부수입 경로 삭제</button>
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
      const targetAmount = sanitizeNumericInput(e.target.targetAmount?.value) || "";
      const unit = (e.target.unit?.value || "").trim() || "";
      const d = loadSideincomeMap();
      const target = d.paths.find((x) => x.id === path.id);
      if (target) {
        target.name = val;
        target.targetAmount = targetAmount;
        target.unit = unit;
        saveSideincomeMap(d);
        renderTabs();
        renderKpiList();
      }
      close();
    });
    setupNumericOnlyInput(modal.querySelector('input[name="targetAmount"]'));
    modal.querySelector('[data-action="delete"]').addEventListener("click", () => {
      close();
      showPathDeleteConfirmModal(path.id);
    });
    document.body.appendChild(modal);
  }

  function renderTabs() {
    const data = loadSideincomeMap();
    tabs.innerHTML = "";
    data.paths.forEach((path) => {
      const tab = document.createElement("div");
      const isActive = path.id === activePathId;
      tab.className = "dream-tab" + (isActive ? " active" : "");
      tab.dataset.pathId = path.id;
      tab.innerHTML = `<span class="dream-tab-text">${escapeHtml(path.name || "새 경로")}</span>${
        isActive ? KPI_TAB_EDIT_PENCIL_HTML : ""
      }`;
      if (isActive) {
        tab.querySelector(".dream-tab-edit")?.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          showPathContextModal(path, tab);
        });
      }
      tab.addEventListener("click", () => {
        const switching = activePathId !== path.id;
        if (switching) {
          selectedKpiId = null;
        }
        activePathId = path.id;
        renderTabs();
        updateTitleAndContent();
        if (switching) {
          void pullKpiMapSubViewFromCloud("sideincome").then((pullOk) => {
            if (pullOk && el.isConnected) {
              renderTabs();
              updateTitleAndContent();
            }
          });
        }
      });
      tabs.appendChild(tab);
    });
  }

  function updateTitleAndContent() {
    const data = loadSideincomeMap();
    const path = data.paths.find((d) => d.id === activePathId);
    if (path) {
      contentWrap.hidden = false;
      renderKpiList();
      renderKpiHistory();
    } else {
      contentWrap.hidden = true;
      persistKpiUiState();
    }
  }

  function showPathAddModal() {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">부수입 목표 추가</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>부수입 경로 이름</label>
              <input type="text" name="name" placeholder="홈페이지 디자인 외주" />
            </div>
            <div class="dream-kpi-row">
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                <label>목표 부수입</label>
                <input type="text" name="targetAmount" placeholder="예) 1000000" inputmode="numeric" />
              </div>
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                <label>단위</label>
                <input type="text" name="unit" placeholder="예) 원, 만원" />
              </div>
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
      const targetAmount = sanitizeNumericInput(form.targetAmount?.value) || "";
      const unit = (form.unit?.value || "").trim() || "";
      const data = loadSideincomeMap();
      const path = { id: nextId(), name: val, targetAmount, unit };
      data.paths.push(path);
      saveSideincomeMap(data);
      activePathId = path.id;
      selectedKpiId = null;
      pathAddModalJustClosed = true;
      close();
      renderTabs();
      updateTitleAndContent();
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
    setupNumericOnlyInput(modal.querySelector('input[name="targetAmount"]'));
  }

  renderTabs();
  if (activePathId) {
    updateTitleAndContent();
  } else {
    contentWrap.hidden = true;
  }

  const onMergedSync = (e) => {
    if (!el.isConnected) return;
    /* push 시에는 화면 갱신 불필요 (로컬 변경을 서버에 올린 것이므로) */
    if (e.detail?.fromPush) return;
    if (!e.detail?.fromServerMerge && !e.detail?.fromLocalWrite) return;
    const data = loadSideincomeMap();
    if (!data.paths.some((p) => p.id === activePathId)) {
      activePathId = data.paths[0]?.id || null;
      selectedKpiId = null;
    }
    /* 선택된 KPI가 삭제됐으면 선택 해제 */
    if (selectedKpiId && !data.kpis.some((k) => k.id === selectedKpiId)) {
      selectedKpiId = null;
    }
    renderTabs();
    /* 서버 동기화 시에는 selectedKpiId를 유지하면서 화면만 갱신 */
    const path = data.paths.find((p) => p.id === activePathId);
    if (path) {
      contentWrap.hidden = false;
      renderKpiList();
      renderKpiHistory();
    } else {
      contentWrap.hidden = true;
    }
    persistKpiUiState();
  };
  window.addEventListener("sideincome-kpi-map-saved", onMergedSync);

  return el;
}
