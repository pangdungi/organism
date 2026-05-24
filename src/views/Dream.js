/**
 * 꿈 페이지 - 꿈 추가 시 탭 형성, 꿈 제목이 탭 및 하단에 표시
 * 인생 KPI와 동일한 dream 데이터 사용 (kpi-dream-map)
 */

import {
  DREAM_KPI_MAP_STORAGE_KEY,
  applyDreamKpiTimestampsOnSave,
} from "../utils/dreamKpiMapSupabase.js";
import {
  kpiTimeTaskAdd,
  kpiTimeTaskRemove,
  kpiTimeTaskRename,
  getFullTaskOptions,
} from "../utils/timeTaskOptionsModel.js";
import { toDateInputValue, formatDeadlineForDisplay, formatDeadlineRangeForDisplay, formatDeadlineRangeCompact } from "../utils/ganttModal.js";
import {
  getAccumulatedMinutesForKpiId,
  minutesToHhMm,
  parseKpiTargetTimeRequiredToMinutes,
  formatMinutesToKoreanHm,
  formatKpiTargetTimeRequiredDisplay,
  syncHabitTrackerLogs,
} from "../utils/timeKpiSync.js";
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
import { setupDeadlineQuickButtons } from "../utils/deadlineQuickButtons.js";
import { buildModalNativeDateFieldMarkup } from "../utils/modalNativeDateField.js";
import { initModalNativeDateFieldsIn } from "../utils/modalNativeDateField.js";
import {
  afterKpiTodoListMutationScroll,
} from "../utils/kpiTodoInputScroll.js";
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
  KPI_TAB_EDIT_PENCIL_HTML,
} from "../utils/kpiTabNameEditIcon.js";
import { sortKpiLogsNewestFirst, getLatestKpiLogWithExplicitValue } from "../utils/kpiLogsSort.js";
import {
  deletedRefsKpiTodosLen,
  kpiTodoLifecycleLog,
  kpiTodoSnapshotBrief,
  kpiTodosCompletionBrief,
} from "../utils/kpiTodoLifecycleDebug.js";
import { kpiTodoFineTrace } from "../utils/kpiTodoFineTrace.js";
import { pullKpiMapSubViewFromCloud } from "../utils/kpiTabCloudRefresh.js";
import {
  APP_FOOTER_ICON_BTN_CLASS,
  getAppFooterActionsSlot,
} from "../utils/appFooterShell.js";

const FIXED_TASK_NAMES = new Set(["수면하기", "근무하기"]);

const DREAM_FOOTER_ADD_ICON =
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

/** 서버 병합 시 삭제한 id가 다시 붙지 않도록 누적 */
function appendDeletedRef(data, kind, id) {
  if (!id) return;
  data.deletedRefs = data.deletedRefs || defaultDeletedRefs();
  const s = String(id);
  const arr = data.deletedRefs[kind] || [];
  if (!arr.includes(s)) arr.push(s);
  data.deletedRefs[kind] = arr;
}

function loadDreamMap() {
  try {
    const raw = localStorage.getItem(DREAM_KPI_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const kpis = (parsed.kpis || []).map((k) => ({
        ...k,
        needHabitTracker: !!k.needHabitTracker,
        useTimeAsUnit: !!k.useTimeAsUnit,
        direction: k.direction === "lower" ? "lower" : "higher",
      }));
      return {
        dreams: parsed.dreams || [],
        goals: parsed.goals || [],
        tasks: parsed.tasks || [],
        kpis,
        kpiLogs: parsed.kpiLogs || [],
        kpiTodos: parsed.kpiTodos || [],
        kpiDailyRepeatTodos: parsed.kpiDailyRepeatTodos || [],
        kpiOrder: parsed.kpiOrder || {},
        kpiTaskSync: parsed.kpiTaskSync || {},
        desiredLife: parsed.desiredLife || "",
        deletedRefs: parsed.deletedRefs && typeof parsed.deletedRefs === "object" ? parsed.deletedRefs : defaultDeletedRefs(),
      };
    }
  } catch (_) {}
  return {
    dreams: [],
    goals: [],
    tasks: [],
    kpis: [],
    kpiLogs: [],
    kpiTodos: [],
    kpiDailyRepeatTodos: [],
    kpiOrder: {},
    kpiTaskSync: {},
    desiredLife: "",
    deletedRefs: defaultDeletedRefs(),
  };
}

function getTaskName(o) {
  return typeof o === "string" ? o : (o?.name || "");
}

function syncKpiToTimeTask(kpi, action, oldName) {
  const data = loadDreamMap();
  data.kpiTaskSync = data.kpiTaskSync || {};
  if (action === "add") {
    const name = (kpi.name || "").trim();
    if (!name) return;
    const opts = getFullTaskOptions();
    if (opts.some((o) => getTaskName(o) === name)) return;
    data.kpiTaskSync[kpi.id] = name;
    saveDreamMap(data);
    kpiTimeTaskAdd(kpi, "dream");
  } else if (action === "remove") {
    const syncName = (data.kpiTaskSync[kpi.id] || kpi.name || "").trim();
    if (syncName) {
      delete data.kpiTaskSync[kpi.id];
      saveDreamMap(data);
      kpiTimeTaskRemove(kpi, syncName);
    }
  } else if (action === "update" && oldName) {
    const newName = (kpi.name || "").trim();
    const oldNm = (oldName || "").trim();
    if (!newName || oldNm === newName) return;
    data.kpiTaskSync[kpi.id] = newName;
    saveDreamMap(data);
    void kpiTimeTaskRename(kpi, oldNm);
  }
}

function saveDreamMap(data) {
  try {
    let prev = null;
    try {
      const raw = localStorage.getItem(DREAM_KPI_MAP_STORAGE_KEY);
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
    const stamped = applyDreamKpiTimestampsOnSave(prev, toSave);
    kpiTodoFineTrace("Dream.saveDreamMap:저장직전요약", {
      kpiTodos: (stamped.kpiTodos || []).length,
      idsSample: (stamped.kpiTodos || []).slice(0, 8).map((t) => ({ id: t.id, c: !!t.completed })),
    });
    localStorage.setItem(DREAM_KPI_MAP_STORAGE_KEY, JSON.stringify(stamped));
    try {
      window.dispatchEvent(new CustomEvent("dream-kpi-map-saved"));
      kpiTodoFineTrace("Dream.saveDreamMap:dream-kpi-map-saved_발송");
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

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "dream-add-icon-btn";
  addBtn.title = "꿈 목표 추가";
  addBtn.setAttribute("aria-label", "꿈 목표 추가");
  addBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="dream-add-icon" aria-hidden="true" width="24" height="24"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m12 8v8"/><path d="m8 12h8"/><path d="m18 22h-12c-2.209 0-4-1.791-4-4v-12c0-2.209 1.791-4 4-4h12c2.209 0 4 1.791 4 4v12c0 2.209-1.791 4-4 4z"/></g></svg>`;
  addBtn.addEventListener("click", (e) => {
    if (dreamAddModalJustClosed) return;
    showDreamAddModal();
  });

  const header = document.createElement("header");
  header.className = "dream-view-header";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "DREAM";
  const titleRow = document.createElement("div");
  titleRow.className = "dream-view-header-title-row";
  const title = document.createElement("h1");
  title.className = "dream-view-title";
  title.textContent = "꿈";
  titleRow.appendChild(title);
  header.appendChild(label);
  header.appendChild(titleRow);
  el.appendChild(header);

  const desiredLifeWrap = document.createElement("div");
  desiredLifeWrap.className = "dream-desired-life-wrap";
  desiredLifeWrap.hidden = true;
  el.appendChild(desiredLifeWrap);

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

  let activeDreamId = null;
  let selectedKpiId = null;
  let kpiFilter = "all"; // "all" | "active" | "completed"
  let kpiGridScrollPrevFilter = null;
  let kpiGridScrollPrevScopeId = null;
  let dreamAddModalJustClosed = false;

  const _dreamUiSession = readKpiUiSession(KPI_UI_SESSION_KEYS.dream);
  const _dreamInitData = loadDreamMap();
  const _dreamRestored = restoreKpiTabFromSession(_dreamUiSession, {
    categoryIds: _dreamInitData.dreams || [],
    kpis: _dreamInitData.kpis || [],
    foreignKey: "dreamId",
  });
  if (_dreamRestored.tabId) activeDreamId = _dreamRestored.tabId;
  selectedKpiId = _dreamRestored.selectedKpiId;
  kpiFilter = _dreamRestored.kpiFilter;

  function persistKpiUiState() {
    writeKpiUiSession(KPI_UI_SESSION_KEYS.dream, {
      tabId: activeDreamId,
      selectedKpiId,
      kpiFilter,
    });
  }

  function dreamKpiTargetValueFieldHtml(kpi = null) {
    const useTime = !!(kpi && kpi.useTimeAsUnit);
    const val = kpi
      ? useTime
        ? kpi.targetTimeRequired || ""
        : sanitizeNumericInput(kpi.targetValue)
      : "";
    const valueAttr = kpi ? ` value="${escapeHtml(val)}"` : "";
    const inputAttrs = useTime
      ? ' placeholder="예) 25:00"'
      : ' placeholder="예) 99" inputmode="numeric"';
    return `
      <label><span class="dream-kpi-target-label-text">${useTime ? "목표 시간" : "목표값"}</span></label>
      <input type="text" name="targetValue"${valueAttr}${inputAttrs} />
    `;
  }

  function dreamKpiUnitFieldHtml(kpi = null) {
    const useTime = !!(kpi && kpi.useTimeAsUnit);
    const unitVal = useTime ? "시간" : kpi?.unit || "";
    const unitAttrs = useTime
      ? ' value="시간" readonly aria-readonly="true" class="dream-kpi-input-readonly"'
      : kpi
        ? ` value="${escapeHtml(unitVal)}"`
        : "";
    return `
    <label>단위</label>
    <input type="text" name="unit"${unitAttrs} placeholder="예) %(완성도), 일" />
    <div class="lp-modal-field-subcheck" data-legacy="lp-modal-field-subcheck">
      <label class="lp-modal-field-subcheck__label" data-legacy="lp-modal-field-subcheck__label">
        <input type="checkbox" name="unitIsTime" class="lp-modal-field-subcheck__input" data-legacy="lp-modal-field-subcheck__input"${useTime ? " checked" : ""} />
        <span class="lp-modal-field-subcheck__text" data-legacy="lp-modal-field-subcheck__text">시간</span>
      </label>
    </div>
  `;
  }

  function readDreamKpiFormFields(form) {
    const useTimeAsUnit = !!form.querySelector('input[name="unitIsTime"]')?.checked;
    const targetRaw = (form.targetValue?.value || "").trim();
    if (useTimeAsUnit) {
      return {
        useTimeAsUnit: true,
        unit: "시간",
        targetValue: "",
        targetTimeRequired: targetRaw,
      };
    }
    return {
      useTimeAsUnit: false,
      unit: (form.unit?.value || "").trim(),
      targetValue: sanitizeNumericInput(targetRaw) || "",
      targetTimeRequired: "",
    };
  }

  function bindDreamKpiUnitTimeMode(form, kpi = null) {
    if (!form) return;
    const unitInput = form.querySelector('input[name="unit"]');
    const useTimeCheck = form.querySelector('input[name="unitIsTime"]');
    const targetInput = form.querySelector('input[name="targetValue"]');
    const labelSpan = form.querySelector(".dream-kpi-target-label-text");
    const directionField = form.querySelector(".dream-kpi-direction-field");
    const directionRadios = form.querySelectorAll('input[name="direction"]');
    let savedUnit = (kpi?.useTimeAsUnit ? "" : kpi?.unit || unitInput?.value || "").trim();
    if (savedUnit === "시간") savedUnit = "";

    const syncTargetLabelForDirection = () => {
      if (useTimeCheck?.checked) {
        if (labelSpan) labelSpan.textContent = "목표 시간";
        if (targetInput) targetInput.placeholder = "예) 25:00";
        return;
      }
      const lower =
        form.querySelector('input[name="direction"]:checked')?.value === "lower";
      if (labelSpan) labelSpan.textContent = lower ? "허용 상한" : "목표값";
      if (targetInput) targetInput.placeholder = lower ? "예) 5" : "예) 99";
    };

    const sync = () => {
      const on = !!useTimeCheck?.checked;
      syncTargetLabelForDirection();
      if (unitInput) {
        if (on) {
          const cur = (unitInput.value || "").trim();
          if (cur && cur !== "시간") savedUnit = cur;
          unitInput.value = "시간";
          unitInput.readOnly = true;
          unitInput.setAttribute("aria-readonly", "true");
          unitInput.classList.add("dream-kpi-input-readonly");
        } else {
          unitInput.readOnly = false;
          unitInput.removeAttribute("aria-readonly");
          unitInput.classList.remove("dream-kpi-input-readonly");
          if ((unitInput.value || "").trim() === "시간") {
            unitInput.value = savedUnit;
          }
        }
      }
      if (targetInput) {
        if (on) {
          targetInput.removeAttribute("inputmode");
        } else {
          targetInput.setAttribute("inputmode", "numeric");
        }
      }
      if (directionField) directionField.hidden = on;
      if (on) {
        const higherRadio = form.querySelector('input[name="direction"][value="higher"]');
        if (higherRadio) higherRadio.checked = true;
      }
    };

    useTimeCheck?.addEventListener("change", sync);
    directionRadios.forEach((r) => r.addEventListener("change", syncTargetLabelForDirection));
    sync();

    if (targetInput && !targetInput.dataset.dreamKpiTargetBound) {
      targetInput.dataset.dreamKpiTargetBound = "1";
      targetInput.addEventListener("input", () => {
        const pos = targetInput.selectionStart;
        const on = !!useTimeCheck?.checked;
        const sanitized = on
          ? sanitizeTimeInput(targetInput.value)
          : sanitizeNumericInput(targetInput.value);
        if (targetInput.value !== sanitized) {
          targetInput.value = sanitized;
          targetInput.setSelectionRange(
            Math.min(pos, sanitized.length),
            Math.min(pos, sanitized.length),
          );
        }
      });
    }
  }

  function showKpiModal() {
    if (!activeDreamId) return;
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
              <input type="text" name="name" placeholder="예) 플래너 오류 수정" />
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
                ${dreamKpiTargetValueFieldHtml()}
              </div>
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                ${dreamKpiUnitFieldHtml()}
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
      const fields = readDreamKpiFormFields(form);
      const kpi = {
        id: nextId(),
        dreamId: activeDreamId,
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
      const data = loadDreamMap();
      data.kpis = data.kpis || [];
      const existingOrder = (data.kpiOrder || {})[activeDreamId] || data.kpis.filter((k) => k.dreamId === activeDreamId).map((k) => k.id);
      data.kpis.push(kpi);
      data.kpiOrder = data.kpiOrder || {};
      data.kpiOrder[activeDreamId] = [...existingOrder, kpi.id];
      saveDreamMap(data);
      syncKpiToTimeTask(kpi, "add");
      close();
      selectedKpiId = kpi.id;
      renderKpiList();
      renderKpiHistory();
    });
    document.body.appendChild(modal);
    initModalNativeDateFieldsIn(modal);
    setupDeadlineQuickButtons(modal);
    bindDreamKpiUnitTimeMode(modal.querySelector(".dream-kpi-form"));
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
              <input type="text" name="name" value="${escapeHtml(kpi.name || "")}" placeholder="예) 플래너 오류 수정" />
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
                ${dreamKpiTargetValueFieldHtml(kpi)}
              </div>
              <div class="dream-kpi-field" data-legacy="time-add-task-field">
                ${dreamKpiUnitFieldHtml(kpi)}
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
      const data = loadDreamMap();
      appendDeletedRef(data, "kpis", kpi.id);
      data.kpis = (data.kpis || []).filter((k) => k.id !== kpi.id);
      data.kpiLogs = (data.kpiLogs || []).filter((l) => l.kpiId !== kpi.id);
      data.kpiTodos = (data.kpiTodos || []).filter((t) => t.kpiId !== kpi.id);
      data.kpiDailyRepeatTodos = (data.kpiDailyRepeatTodos || []).filter((t) => t.kpiId !== kpi.id);
      const order = (data.kpiOrder || {})[kpi.dreamId] || [];
      data.kpiOrder = { ...data.kpiOrder, [kpi.dreamId]: order.filter((id) => id !== kpi.id) };
      saveDreamMap(data);
      selectedKpiId = null;
      close();
      renderKpiList();
      renderKpiHistory();
    });
    modal.querySelector(".dream-kpi-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const data = loadDreamMap();
      const target = data.kpis.find((k) => k.id === kpi.id);
      if (target) {
        const oldName = target.name;
        const fields = readDreamKpiFormFields(form);
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
        saveDreamMap(data);
        if (oldName !== target.name) syncKpiToTimeTask(target, "update", oldName);
      }
      close();
      renderKpiList();
      renderKpiHistory();
    });
    document.body.appendChild(modal);
    initModalNativeDateFieldsIn(modal);
    setupDeadlineQuickButtons(modal);
    bindDreamKpiUnitTimeMode(modal.querySelector(".dream-kpi-form"), kpi);
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
      const data = loadDreamMap();
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
          dreamId: kpi.dreamId,
          date: dateStr,
          dateRaw: dateVal,
          value: sanitizeNumericInput(form.value.value) || "",
          memo: (form.memo.value || "").trim(),
          ...defaultManualKpiLogMeta(),
        };
        data.kpiLogs = data.kpiLogs || [];
        data.kpiLogs.push(log);
      }
      saveDreamMap(data);
      close();
      renderKpiList();
      renderKpiHistory();
    });
    const delBtn = modal.querySelector(".dream-kpi-log-modal-delete-btn");
    if (delBtn && isEdit) {
      delBtn.addEventListener("click", () => {
        const d = loadDreamMap();
        appendDeletedRef(d, "kpiLogs", editLog.id);
        d.kpiLogs = (d.kpiLogs || []).filter((l) => l.id !== editLog.id);
        saveDreamMap(d);
        close();
        renderKpiList();
        renderKpiHistory();
      });
    }
    document.body.appendChild(modal);
    setupNumericOnlyInput(modal.querySelector('input[name="value"]'));
    initModalNativeDateFieldsIn(modal);
  }

  function clearDreamKpiFooterActions() {
    const slot = getAppFooterActionsSlot();
    if (!slot) return;
    slot
      .querySelectorAll("[data-lp-dream-kpi-footer-action]")
      .forEach((n) => n.remove());
  }

  function dreamKpiFooterAddLabel(tab) {
    if (tab === KPI_BOTTOM_TAB_TODO) return "할 일 추가";
    if (tab === KPI_BOTTOM_TAB_DAILY) return "매일 할 일 추가";
    return "로그 추가";
  }

  async function runDreamKpiFooterAddAction() {
    const d = loadDreamMap();
    const k = (d.kpis || []).find((x) => x.id === selectedKpiId);
    if (!k) return;
    const tab = getKpiHistoryBottomTab("dream", selectedKpiId);
    if (tab === KPI_BOTTOM_TAB_TODO) {
      const text = await showKpiTodoAddModal({
        kpiName: k.name,
        placeholder: "할 일 입력",
      });
      if (!text) return;
      const d2 = loadDreamMap();
      d2.kpiTodos = d2.kpiTodos || [];
      d2.kpiTodos.push({
        id: nextId(),
        kpiId: String(selectedKpiId),
        text,
        completed: false,
      });
      saveDreamMap(d2);
      renderKpiHistory({ scrollTodoAfterMutation: true });
      return;
    }
    if (tab === KPI_BOTTOM_TAB_DAILY) {
      const text = await showKpiTodoAddModal({
        kpiName: k.name,
        title: "매일 할 일 추가",
        placeholder: "할 일 입력 (매일 반복)",
      });
      if (!text) return;
      const d2 = loadDreamMap();
      d2.kpiDailyRepeatTodos = d2.kpiDailyRepeatTodos || [];
      d2.kpiDailyRepeatTodos.push({
        id: nextId(),
        kpiId: String(selectedKpiId),
        text,
        completed: false,
      });
      saveDreamMap(d2);
      renderKpiHistory({ scrollTodoAfterMutation: true });
      return;
    }
    showKpiLogModal(k);
  }

  function syncAppFooterDreamKpiActions() {
    clearDreamKpiFooterActions();
    const slot = getAppFooterActionsSlot();
    if (!slot) return;
    if (!activeDreamId) return;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = APP_FOOTER_ICON_BTN_CLASS;
    addBtn.setAttribute("data-lp-dream-kpi-footer-action", "");
    addBtn.innerHTML = DREAM_FOOTER_ADD_ICON;

    if (!selectedKpiId) {
      addBtn.title = "KPI 추가";
      addBtn.setAttribute("aria-label", "KPI 추가");
      addBtn.addEventListener("click", () => {
        if (!activeDreamId) return;
        showKpiModal();
      });
      slot.appendChild(addBtn);
      return;
    }

    const data = loadDreamMap();
    const kpiNow = (data.kpis || []).find((k) => k.id === selectedKpiId);
    if (!kpiNow || kpiNow.dreamId !== activeDreamId) return;

    const tab = getKpiHistoryBottomTab("dream", selectedKpiId);
    const addLabel = dreamKpiFooterAddLabel(tab);
    addBtn.title = addLabel;
    addBtn.setAttribute("aria-label", addLabel);
    addBtn.addEventListener("click", () => {
      void runDreamKpiFooterAddAction();
    });
    slot.appendChild(addBtn);
  }

  function getKpiLogs(kpiId) {
    const data = loadDreamMap();
    const logs = (data.kpiLogs || []).filter((l) => l.kpiId === kpiId);
    return sortKpiLogsNewestFirst(logs, data.kpiLogs);
  }

  function parseNum(str) {
    const n = parseFloat(String(str || "").replace(/[^0-9.-]/g, ""));
    return Number.isNaN(n) ? 0 : n;
  }

  function reorderKpis(dreamId, orderedKpiIds) {
    const data = loadDreamMap();
    data.kpiOrder = data.kpiOrder || {};
    data.kpiOrder[dreamId] = orderedKpiIds;
    saveDreamMap(data);
  }

  function getAccumulatedKpiValue(kpiId) {
    const logs = getKpiLogs(kpiId);
    return logs.reduce((sum, log) => sum + parseNum(log.value), 0);
  }

  function getKpiProgress(kpi) {
    const lower = kpi.direction === "lower";
    const data = loadDreamMap();
    const todayKey = toDateKey(new Date());
    const startKey = (kpi.targetStartDate || "").slice(0, 10);
    const endKey = (kpi.targetDeadline || "").slice(0, 10);
    const hasStart = startKey.length >= 10;

    if (kpi.useTimeAsUnit) {
      const targetMins = parseKpiTargetTimeRequiredToMinutes(kpi.targetTimeRequired);
      const accumulatedMins = getAccumulatedMinutesForKpiId(kpi.id, kpi.name);
      const timeProgress =
        targetMins > 0 ? Math.min(100, (accumulatedMins / targetMins) * 100) : 0;
      const isCompleted = targetMins > 0 && timeProgress >= 100;
      const isInProgress =
        hasStart && startKey <= todayKey && (!endKey || endKey >= todayKey) && !isCompleted;
      return {
        progress: timeProgress,
        timeProgress,
        currentVal: accumulatedMins,
        targetVal: targetMins,
        targetMins,
        accumulatedMins,
        isCompleted,
        isInProgress,
        lowerBetter: false,
        useTimeAsUnit: true,
      };
    }

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
    const valueComplete = lower
      ? latestLog != null &&
        currentVal != null &&
        currentVal <= targetVal
      : progress >= 100;
    const isCompleted = valueComplete;
    const isInProgress =
      hasStart && startKey <= todayKey && (!endKey || endKey >= todayKey) && !isCompleted;
    return {
      progress,
      timeProgress: 0,
      currentVal,
      targetVal,
      targetMins: 0,
      accumulatedMins: 0,
      isCompleted,
      isInProgress,
      lowerBetter: lower,
      useTimeAsUnit: false,
    };
  }

  function renderKpiList() {
    syncHabitTrackerLogs();
    const scopeId = activeDreamId;
    const savedGridScroll = readKpiGridScrollToRestore(
      contentWrap,
      kpiFilter,
      scopeId,
      kpiGridScrollPrevFilter,
      kpiGridScrollPrevScopeId,
    );
    historyWrap.remove();
    contentWrap.innerHTML = "";
    if (!activeDreamId) {
      kpiGridScrollPrevFilter = null;
      kpiGridScrollPrevScopeId = null;
      persistKpiUiState();
      historyWrap.hidden = true;
      el.appendChild(historyWrap);
      syncAppFooterDreamKpiActions();
      return;
    }
    const data = loadDreamMap();
    let dreamKpis = (data.kpis || []).filter((k) => k.dreamId === activeDreamId);
    const order = (data.kpiOrder || {})[activeDreamId];
    if (order && order.length > 0) {
      const orderMap = new Map(order.map((id, i) => [id, i]));
      dreamKpis = [...dreamKpis].sort((a, b) => {
        const ia = orderMap.has(a.id) ? orderMap.get(a.id) : 999;
        const ib = orderMap.has(b.id) ? orderMap.get(b.id) : 999;
        return ia - ib;
      });
    }
    const completedKpis = dreamKpis.filter((k) => getKpiProgress(k).isCompleted);
    const activeKpis = dreamKpis.filter((k) => !getKpiProgress(k).isCompleted);

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
        const listAfterFilter = kpiFilter === "active" ? activeKpis : kpiFilter === "completed" ? completedKpis : dreamKpis;
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
          : dreamKpis;
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
        useTimeAsUnit,
      } = getKpiProgress(kpi);
      const unitSuffix = kpi.unit ? " " + kpi.unit : "";
      const formatNum = (n) => (n == null || Number.isNaN(n) ? "—" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
      const currentStr = formatNum(currentVal);
      const targetStr = kpi.targetValue ? escapeHtml(String(kpi.targetValue).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) : "—";
      const targetTimeLabel =
        useTimeAsUnit && kpi.targetTimeRequired
          ? formatKpiTargetTimeRequiredDisplay(kpi.targetTimeRequired)
          : "—";
      const accumulatedLabel = useTimeAsUnit
        ? formatMinutesToKoreanHm(accumulatedMins)
        : "";
      const displayProgress = useTimeAsUnit ? timeProgress : progress;
      const progressText = useTimeAsUnit
        ? `${accumulatedLabel} / ${targetTimeLabel}`
        : lowerBetter
          ? `최근 ${currentStr} / 상한 ${targetStr}${unitSuffix}`
          : `${currentStr} / ${targetStr}${unitSuffix}`;
      const card = document.createElement("div");
      card.className =
        "dream-kpi-card" +
        (lowerBetter ? " dream-kpi-card--lower-better" : "") +
        (useTimeAsUnit ? " dream-kpi-card--time-unit" : "") +
        (selectedKpiId === kpi.id ? " is-selected" : "");
      card.dataset.kpiId = kpi.id;
      card.draggable = true;
      const investedTimeHtml = "";
      const heroStr = useTimeAsUnit ? accumulatedLabel : currentStr;
      const heroUnit = useTimeAsUnit ? "" : kpi.unit;
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
          ${investedTimeHtml ? `<div class="dream-kpi-card-invested">${investedTimeHtml}</div>` : ""}
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
        const newOrder = dreamKpis.map((k) => k.id);
        const fromIdx = newOrder.indexOf(draggedId);
        const toIdx = newOrder.indexOf(kpi.id);
        if (fromIdx >= 0 && toIdx >= 0) {
          newOrder.splice(fromIdx, 1);
          newOrder.splice(toIdx, 0, draggedId);
          reorderKpis(activeDreamId, newOrder);
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
    if (!historyAnchoredUnderCard) {
      grid.appendChild(historyWrap);
    }
    grid.addEventListener("dragend", () => {
      grid.querySelectorAll(".dream-kpi-card-drag-over").forEach((c) => c.classList.remove("dream-kpi-card-drag-over"));
    });
    contentWrap.appendChild(grid);

    applyKpiGridScrollRestore(contentWrap, savedGridScroll);
    kpiGridScrollPrevFilter = kpiFilter;
    kpiGridScrollPrevScopeId = scopeId;
    persistKpiUiState();
    syncAppFooterDreamKpiActions();
  }

  function renderKpiHistory(opts = {}) {
    const { scrollTodoAfterMutation = false } = opts;
    historyWrap.innerHTML = "";
    if (!selectedKpiId) {
      historyWrap.hidden = true;
      syncAppFooterDreamKpiActions();
      return;
    }
    const data = loadDreamMap();
    const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
    const needHabitTracker = kpi ? !!kpi.needHabitTracker : false;
    if (!kpi) {
      historyWrap.hidden = true;
      selectedKpiId = null;
      renderKpiList();
      return;
    }
    const logs = getKpiLogs(selectedKpiId);
    const selKpi = String(selectedKpiId);
    const todos = (data.kpiTodos || []).filter(
      (t) => String(t.kpiId) === selKpi && (t.text || "").trim() !== "",
    );
    historyWrap.hidden = false;

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
          const d = loadDreamMap();
          kpiTodoLifecycleLog("꿈KPI탭_모달삭제", {
            todoId: String(todo.id),
            삭제전: kpiTodoSnapshotBrief(d),
            삭제전dr: deletedRefsKpiTodosLen(d),
          });
          appendDeletedRef(d, "kpiTodos", todo.id);
          d.kpiTodos = (d.kpiTodos || []).filter((x) => x.id !== todo.id);
          saveDreamMap(d);
          const after = loadDreamMap();
          kpiTodoLifecycleLog("꿈KPI탭_모달삭제_saveDreamMap후", {
            todoId: String(todo.id),
            삭제후: kpiTodoSnapshotBrief(after),
            삭제후dr: deletedRefsKpiTodosLen(after),
          });
          renderKpiHistory({ scrollTodoAfterMutation: true });
          return;
        }
        const d = loadDreamMap();
        const row = (d.kpiTodos || []).find((x) => x.id === todo.id);
        if (!row) return;
        row.text = result.text;
        saveDreamMap(d);
        renderKpiHistory({ scrollTodoAfterMutation: true });
      };

      item.addEventListener("click", async (e) => {
        if (e.target.closest(".dream-kpi-todo-check-wrap")) return;
        await openTodoEdit();
      });

      check.addEventListener("change", () => {
        const d = loadDreamMap();
        const t = d.kpiTodos.find((x) => x.id === todo.id);
        if (t) {
          kpiTodoLifecycleLog("꿈KPI탭_체크_완료토글", {
            todoId: String(todo.id),
            이전완료: !!t.completed,
            요청완료: !!check.checked,
          });
          t.completed = !!check.checked;
          saveDreamMap(d);
          kpiTodoLifecycleLog("꿈KPI탭_체크_saveDreamMap후", {
            todoId: String(todo.id),
            completion: kpiTodosCompletionBrief(loadDreamMap(), 20),
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
            const d = loadDreamMap();
            appendDeletedRef(d, "kpiDailyRepeatTodos", todo.id);
            d.kpiDailyRepeatTodos = (d.kpiDailyRepeatTodos || []).filter((x) => x.id !== todo.id);
            saveDreamMap(d);
            renderKpiHistory({ scrollTodoAfterMutation: true });
            return;
          }
          const d = loadDreamMap();
          const row = (d.kpiDailyRepeatTodos || []).find((x) => x.id === todo.id);
          if (!row) return;
          row.text = result.text;
          saveDreamMap(d);
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
      panelDailySeg.appendChild(dailyList);
    }

    historyWrap.appendChild(segBar);
    historyWrap.appendChild(panelLogSeg);
    historyWrap.appendChild(panelTodoSeg);
    if (panelDailySeg) historyWrap.appendChild(panelDailySeg);

    wireKpiHistoryBottomTabs(
      "dream",
      selectedKpiId,
      btnSegLog,
      btnSegTodo,
      btnSegDaily,
      panelLogSeg,
      panelTodoSeg,
      panelDailySeg,
      hasDailyTab,
      () => syncAppFooterDreamKpiActions(),
    );
    if (scrollTodoAfterMutation) {
      afterKpiTodoListMutationScroll(historyWrap);
    }
    syncAppFooterDreamKpiActions();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }


  function showDreamAddModal() {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">꿈 목표 추가</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
          <div class="dream-kpi-field">
            <label>꿈 이름</label>
            <input type="text" name="name" placeholder="삶이 정리가 될 수 있는 플래너 만들기" />
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
      const val = (form.name.value || "").trim() || "새 꿈";
      const data = loadDreamMap();
      const dream = { id: nextId(), name: val };
      data.dreams.push(dream);
      saveDreamMap(data);
      activeDreamId = dream.id;
      selectedKpiId = null;
      dreamAddModalJustClosed = true;
      close();
      renderTabs();
      updateTitleAndContent();
      setTimeout(() => { dreamAddModalJustClosed = false; }, 300);
    };
    confirmBtn.addEventListener("click", doSubmit);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      doSubmit();
    });
    document.body.appendChild(modal);
  }

  function showDreamDeleteConfirmModal(dreamId) {
    const data = loadDreamMap();
    const dream = data.dreams.find((d) => d.id === dreamId);
    const dreamName = dream?.name || "이 꿈";
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal dream-delete-confirm-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel" class="dream-delete-confirm-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">꿈 삭제</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <div data-legacy="time-task-setup-body">
          <p class="dream-delete-confirm-msg">"${escapeHtml(dreamName)}"을(를) 정말 삭제하시겠습니까?</p>
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
      const d = loadDreamMap();
      appendDeletedRef(d, "categories", dreamId);
      const dreamKpis = (d.kpis || []).filter((k) => k.dreamId === dreamId);
      const kpiIds = dreamKpis.map((k) => k.id);
      dreamKpis.forEach((k) => {
        appendDeletedRef(d, "kpis", k.id);
        syncKpiToTimeTask(k, "remove");
      });
      d.dreams = (d.dreams || []).filter((x) => x.id !== dreamId);
      d.kpis = (d.kpis || []).filter((k) => k.dreamId !== dreamId);
      d.kpiLogs = (d.kpiLogs || []).filter((l) => !kpiIds.includes(l.kpiId));
      d.kpiTodos = (d.kpiTodos || []).filter((t) => !kpiIds.includes(t.kpiId));
      d.kpiDailyRepeatTodos = (d.kpiDailyRepeatTodos || []).filter((t) => !kpiIds.includes(t.kpiId));
      delete d.kpiOrder?.[dreamId];
      d.kpiTaskSync = (d.kpiTaskSync || {});
      kpiIds.forEach((id) => delete d.kpiTaskSync[id]);
      saveDreamMap(d);
      if (activeDreamId === dreamId) {
        activeDreamId = d.dreams[0]?.id || null;
        selectedKpiId = null;
      }
      renderTabs();
      updateTitleAndContent();
    });
    document.body.appendChild(modal);
  }

  function showDreamContextModal(dream, tabEl) {
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel" class="dream-path-context-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">꿈 수정</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form dream-path-edit-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
            <div class="dream-kpi-field" data-legacy="time-add-task-field">
              <label>꿈 이름</label>
              <input type="text" name="name" value="${escapeHtml(dream.name || "")}" placeholder="꿈 이름" />
            </div>
            <div class="dream-kpi-delete-wrap">
              <button type="button" class="dream-kpi-delete-btn" data-action="delete">꿈 목표 삭제</button>
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
      const val = (e.target.name.value || "").trim() || "꿈 이름";
      const d = loadDreamMap();
      const target = d.dreams.find((x) => x.id === dream.id);
      if (target) {
        target.name = val;
        saveDreamMap(d);
        renderTabs();
      }
      close();
    });
    modal.querySelector('[data-action="delete"]').addEventListener("click", () => {
      close();
      showDreamDeleteConfirmModal(dream.id);
    });
    document.body.appendChild(modal);
  }

  function showDesiredLifeModal() {
    const data = loadDreamMap();
    const currentText = data.desiredLife || "";
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">내가 원하는 삶</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
          <div class="dream-kpi-field">
            <label>원하는 삶을 자유롭게 적어보세요</label>
            <textarea name="desiredLife" rows="6" placeholder="예) 건강하게 오래 살고, 가족과 행복한 시간을 보내며, 하고 싶은 일을 하며 살고 싶습니다.">${escapeHtml(currentText)}</textarea>
          </div>
          </div>
          <div data-legacy="time-task-log-footer" class="dream-desired-life-modal-footer">
            ${currentText ? '<button type="button" class="dream-desired-life-delete-btn">삭제</button>' : ""}
            <button type="submit" data-legacy="time-task-log-submit">저장</button>
          </div>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", close);
    modal.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const val = (e.target.desiredLife.value || "").trim();
      const d = loadDreamMap();
      d.desiredLife = val;
      saveDreamMap(d);
      close();
      updateDesiredLifeDisplay();
    });
    const deleteBtn = modal.querySelector(".dream-desired-life-delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        const d = loadDreamMap();
        d.desiredLife = "";
        saveDreamMap(d);
        close();
        updateDesiredLifeDisplay();
      });
    }
    document.body.appendChild(modal);
  }

  function updateDesiredLifeDisplay() {
    desiredLifeWrap.hidden = true;
    desiredLifeWrap.innerHTML = "";
  }

  function renderTabs() {
    const data = loadDreamMap();
    tabs.innerHTML = "";
    data.dreams.forEach((dream) => {
      const tab = document.createElement("div");
      const isActive = dream.id === activeDreamId;
      tab.className = "dream-tab" + (isActive ? " active" : "");
      tab.dataset.dreamId = dream.id;
      tab.innerHTML = `<span class="dream-tab-text">${escapeHtml(dream.name || "꿈 이름")}</span>${
        isActive ? KPI_TAB_EDIT_PENCIL_HTML : ""
      }`;
      if (isActive) {
        tab.querySelector(".dream-tab-edit")?.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          showDreamContextModal(dream, tab);
        });
      }
      tab.addEventListener("click", () => {
        const switching = activeDreamId !== dream.id;
        if (switching) {
          selectedKpiId = null;
        }
        activeDreamId = dream.id;
        renderTabs();
        updateTitleAndContent();
        if (switching) {
          void pullKpiMapSubViewFromCloud("dream").then((pullOk) => {
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
    const data = loadDreamMap();
    const dream = data.dreams.find((d) => d.id === activeDreamId);
    if (dream) {
      contentWrap.hidden = false;
      renderKpiList();
      renderKpiHistory();
    } else {
      contentWrap.hidden = true;
      persistKpiUiState();
    }
  }

  renderTabs();
  updateDesiredLifeDisplay();
  if (activeDreamId) {
    updateTitleAndContent();
  } else {
    contentWrap.hidden = true;
  }

  function syncDreamUiFromStoredMap() {
    if (!el.isConnected) return;
    const data = loadDreamMap();
    if (!data.dreams.some((d) => d.id === activeDreamId)) {
      activeDreamId = data.dreams[0]?.id || null;
      selectedKpiId = null;
    }
    if (selectedKpiId && !data.kpis.some((k) => k.id === selectedKpiId)) {
      selectedKpiId = null;
    }
    renderTabs();
    const dream = data.dreams.find((d) => d.id === activeDreamId);
    if (dream) {
      contentWrap.hidden = false;
      renderKpiList();
      renderKpiHistory();
    } else {
      contentWrap.hidden = true;
    }
    updateDesiredLifeDisplay();
    persistKpiUiState();
  }

  const onMergedSync = (e) => {
    if (!el.isConnected) return;
    /* push 시에는 화면 갱신 불필요 (로컬 변경을 서버에 올린 것이므로) */
    if (e.detail?.fromPush) return;
    if (!e.detail?.fromServerMerge && !e.detail?.fromLocalWrite) return;
    syncDreamUiFromStoredMap();
  };
  window.addEventListener("dream-kpi-map-saved", onMergedSync);
  window.__lpDreamSoftRefresh = syncDreamUiFromStoredMap;

  return el;
}
