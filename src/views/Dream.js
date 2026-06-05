/**
 * 꿈 페이지 - 꿈 추가 시 탭 형성, 꿈 제목이 탭 및 하단에 표시
 * 인생 KPI와 동일한 dream 데이터 사용 (kpi-dream-map)
 */

import {
  DREAM_KPI_MAP_STORAGE_KEY,
  applyDreamKpiTimestampsOnSave,
} from "../utils/dreamKpiMapSupabase.js";
import {
  kpiTimeTaskEnsure,
  kpiTimeTaskRemove,
  kpiTimeTaskRename,
  getFullTaskOptions,
  patchKpiLinkedTasksFromKpiMaps,
} from "../utils/timeTaskOptionsModel.js";
import { buildModalNativeDateFieldMarkup, initModalNativeDateFieldsIn } from "../utils/modalNativeDateField.js";
import {
  minutesToHhMm,
  parseKpiTargetTimeRequiredToMinutes,
  formatMinutesToKoreanHm,
  formatKpiTargetTimeRequiredDisplay,
  syncHabitTrackerLogs,
} from "../utils/timeKpiSync.js";
import { defaultManualKpiLogMeta, kpiLogSourceBadgeHtml, formatKpiHistoryValueText } from "../utils/kpiLogFields.js";
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
import {
  wireKpiHistoryBottomTabs,
  getKpiHistoryBottomTab,
  effectiveKpiHistoryBottomTab,
  kpiUsesDailyTodosOnly,
  KPI_BOTTOM_TAB_LOG,
  KPI_BOTTOM_TAB_TODO,
  KPI_BOTTOM_TAB_DAILY,
} from "../utils/kpiHistoryBottomTabs.js";
import {
  applyKpiGridScrollRestore,
  readKpiGridScrollToRestore,
} from "../utils/kpiGridScrollRestore.js";
import {
  afterKpiTodoListMutationScroll,
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
import { mountKpiSegBarClearCompletedRow } from "../utils/kpiTodoBulkDeleteUi.js";
import { formatKpiCardHeroHtml } from "../utils/kpiViewModal.js";
import { showKpiTodoEditModal } from "../utils/kpiTodoEditModal.js";
import {
  KPI_CARD_EDIT_PENCIL_HTML,
  DREAM_GOAL_EDIT_PENCIL_HTML,
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
import { kpiTodoFineTrace } from "../utils/kpiTodoFineTrace.js";
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
    const raw = readKpiMapScopedStorageRaw(DREAM_KPI_MAP_STORAGE_KEY);
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
    data.kpiTaskSync[kpi.id] = name;
    saveDreamMap(data);
    kpiTimeTaskEnsure(kpi, "dream");
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
    kpiTimeTaskRename(kpi, oldNm);
    data.kpiTaskSync[kpi.id] = newName;
    saveDreamMap(data);
  }
}

function saveDreamMap(data, opts) {
  try {
    let prev = null;
    try {
      const raw = readKpiMapScopedStorageRaw(DREAM_KPI_MAP_STORAGE_KEY);
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
      pushServer: !!opts?.pushServer,
    });
    writeKpiMapScopedStorageRaw(DREAM_KPI_MAP_STORAGE_KEY, JSON.stringify(stamped));
    if (opts?.pushServer) {
      try {
        window.dispatchEvent(
          new CustomEvent("dream-kpi-map-saved", { detail: { pushServer: true } }),
        );
        kpiTodoFineTrace("Dream.saveDreamMap:dream-kpi-map-saved_발송");
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
  const kpiTimeFormOpts = {
    sanitizeNumericInput,
    sanitizeTimeInput,
  };
  const el = document.createElement("div");
  el.className = "app-tab-panel-content dream-view lp-kpi-dream-page";

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
  setupKpiCategoryHeaderIcon(titleRow, "dream");
  header.appendChild(label);
  header.appendChild(titleRow);
  el.appendChild(header);

  const desiredLifeWrap = document.createElement("div");
  desiredLifeWrap.className = "dream-desired-life-wrap";
  desiredLifeWrap.hidden = true;
  el.appendChild(desiredLifeWrap);

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
  let dreamViewScreen = "goals"; // "goals" | "kpis" | "kpiDetail"
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
  kpiFilter = _dreamRestored.kpiFilter;
  /* 꿈 메뉴 진입은 항상 목표 목록 — KPI 화면은 목표 클릭 후에만 */
  dreamViewScreen = "goals";
  activeDreamId = null;
  selectedKpiId = null;

  function persistKpiUiState() {
    try {
      sessionStorage.setItem(
        KPI_UI_SESSION_KEYS.dream,
        JSON.stringify({
          tabId: activeDreamId,
          selectedKpiId,
          kpiFilter,
          dreamViewScreen,
        }),
      );
    } catch (_) {}
  }

  function syncDreamFooterBackLabel() {
    if (!el.isConnected) return;
    const footerBack = document.querySelector("[data-lp-app-footer-back]");
    if (!footerBack) return;
    if (dreamViewScreen === "kpiDetail") {
      footerBack.title = "KPI 목록으로";
      footerBack.setAttribute("aria-label", "KPI 목록으로");
    } else if (dreamViewScreen === "kpis") {
      footerBack.title = "꿈 목표 목록으로";
      footerBack.setAttribute("aria-label", "꿈 목표 목록으로");
    } else {
      footerBack.title = "오늘(메인)으로";
      footerBack.setAttribute("aria-label", "오늘(메인)으로");
    }
  }

  function syncDreamHeader() {
    const data = loadDreamMap();
    const dream = data.dreams.find((d) => d.id === activeDreamId);
    if (dreamViewScreen === "kpiDetail" && selectedKpiId) {
      const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
      title.textContent = kpi?.name || "KPI";
    } else if (dreamViewScreen === "kpis" && dream) {
      title.textContent = dream.name || "꿈";
    } else {
      title.textContent = "꿈";
    }
    setKpiCategoryHeaderIconVisible(titleRow, dreamViewScreen === "goals");
    syncDreamFooterBackLabel();
  }

  function enterKpiView(dreamId) {
    if (!dreamId) return;
    activeDreamId = dreamId;
    selectedKpiId = null;
    dreamViewScreen = "kpis";
    syncDreamHeader();
    updateDreamView();
  }

  function enterKpiDetailView(kpiId) {
    if (!kpiId || !activeDreamId) return;
    selectedKpiId = kpiId;
    dreamViewScreen = "kpiDetail";
    syncDreamHeader();
    updateDreamView();
  }

  function exitToKpiList() {
    selectedKpiId = null;
    dreamViewScreen = "kpis";
    syncDreamHeader();
    updateDreamView();
    persistKpiUiState();
  }

  function exitToDreamGoalsList() {
    dreamViewScreen = "goals";
    activeDreamId = null;
    selectedKpiId = null;
    syncDreamHeader();
    updateDreamView();
    persistKpiUiState();
  }

  function refreshDreamAfterKpiDataChange(opts = {}) {
    if (dreamViewScreen === "kpiDetail") {
      syncDreamHeader();
      renderKpiDetailView(opts);
    } else if (dreamViewScreen === "kpis") {
      renderKpiList();
    } else {
      updateDreamView();
    }
    persistKpiUiState();
  }

  function showKpiModal() {
    if (!activeDreamId) return;
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
              <input type="text" name="name" placeholder="예) 플래너 오류 수정" />
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
        dreamId: activeDreamId,
        name: (form.name.value || "").trim(),
        direction: "higher",
        ...fields,
      };
      const data = loadDreamMap();
      data.kpis = data.kpis || [];
      const existingOrder = (data.kpiOrder || {})[activeDreamId] || data.kpis.filter((k) => k.dreamId === activeDreamId).map((k) => k.id);
      data.kpis.push(kpi);
      data.kpiOrder = data.kpiOrder || {};
      data.kpiOrder[activeDreamId] = [...existingOrder, kpi.id];
      saveDreamMap(data, { pushServer: true });
      syncKpiToTimeTask(kpi, "add");
      close();
      refreshDreamAfterKpiDataChange();
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
              <input type="text" name="name" value="${escapeHtml(kpi.name || "")}" placeholder="예) 플래너 오류 수정" />
            </div>
            ${kpiFormGoalAndTargetSectionHtml(kpi, escapeHtml, kpiTimeFormOpts)}
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
      syncKpiToTimeTask(kpi, "remove");
      const data = loadDreamMap();
      appendDeletedRef(data, "kpis", kpi.id);
      data.kpis = (data.kpis || []).filter((k) => k.id !== kpi.id);
      data.kpiLogs = (data.kpiLogs || []).filter((l) => l.kpiId !== kpi.id);
      data.kpiTodos = (data.kpiTodos || []).filter((t) => t.kpiId !== kpi.id);
      data.kpiDailyRepeatTodos = (data.kpiDailyRepeatTodos || []).filter((t) => t.kpiId !== kpi.id);
      const order = (data.kpiOrder || {})[kpi.dreamId] || [];
      data.kpiOrder = { ...data.kpiOrder, [kpi.dreamId]: order.filter((id) => id !== kpi.id) };
      saveDreamMap(data, { pushServer: true });
      close();
      exitToKpiList();
    });
    modal.querySelector(".dream-kpi-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      if (!validateKpiActionForm(form, { sanitizeNumericInput })) return;
      const data = loadDreamMap();
      const target = data.kpis.find((k) => k.id === kpi.id);
      if (target) {
        const oldName = target.name;
        applyKpiFormGoalFieldsToKpi(target, form, {
          sanitizeNumericInput,
        });
        target.name = (form.name.value || "").trim();
        target.direction = kpi.direction === "lower" ? "lower" : "higher";
        saveDreamMap(data, { pushServer: true });
        if (oldName !== target.name) syncKpiToTimeTask(target, "update", oldName);
      }
      close();
      refreshDreamAfterKpiDataChange();
    });
    document.body.appendChild(modal);
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
      saveDreamMap(data, { pushServer: true });
      close();
      refreshDreamAfterKpiDataChange();
    });
    const delBtn = modal.querySelector(".dream-kpi-log-modal-delete-btn");
    if (delBtn && isEdit) {
      delBtn.addEventListener("click", () => {
        const d = loadDreamMap();
        appendDeletedRef(d, "kpiLogs", editLog.id);
        d.kpiLogs = (d.kpiLogs || []).filter((l) => l.id !== editLog.id);
        saveDreamMap(d, { pushServer: true });
        close();
        refreshDreamAfterKpiDataChange();
      });
    }
    document.body.appendChild(modal);
    setupNumericOnlyInput(modal.querySelector('input[name="value"]'));
    initModalNativeDateFieldsIn(modal);
  }

  function clearDreamKpiFooterActions() {
    clearKpiMapFooterActionButtons();
  }

  function dreamKpiFooterAddLabel(tab, kpi) {
    const t = effectiveKpiHistoryBottomTab(tab, kpi);
    if (t === KPI_BOTTOM_TAB_TODO) return "할 일 추가";
    if (t === KPI_BOTTOM_TAB_DAILY) return "매일 할 일 추가";
    return "로그 추가";
  }

  async function runDreamKpiFooterAddAction() {
    const d = loadDreamMap();
    const k = (d.kpis || []).find((x) => x.id === selectedKpiId);
    if (!k) return;
    const tab = effectiveKpiHistoryBottomTab(
      getKpiHistoryBottomTab("dream", selectedKpiId),
      k,
    );
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
      saveDreamMap(d2, { pushServer: true });
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
      const d2 = loadDreamMap();
      d2.kpiDailyRepeatTodos = d2.kpiDailyRepeatTodos || [];
      appendKpiDailyRepeatTodoAtEnd(d2.kpiDailyRepeatTodos, {
        id: nextId(),
        kpiId: String(selectedKpiId),
        text,
        completed: false,
      });
      saveDreamMap(d2, { pushServer: true });
      renderKpiDetailView({ scrollTodoAfterMutation: true });
      return;
    }
    showKpiLogModal(k);
  }

  function syncAppFooterDreamKpiActions() {
    clearDreamKpiFooterActions();
    const slot = getAppFooterActionsSlot();
    if (!slot) return;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = APP_FOOTER_ICON_BTN_CLASS;
    addBtn.setAttribute("data-lp-dream-kpi-footer-action", "");
    addBtn.innerHTML = DREAM_FOOTER_ADD_ICON;

    if (dreamViewScreen === "goals") {
      const data = loadDreamMap();
      if (shouldShowKpiMapSyncLoading("dream", !data.dreams?.length)) return;
      addBtn.title = "꿈 목표 추가";
      addBtn.setAttribute("aria-label", "꿈 목표 추가");
      addBtn.addEventListener("click", () => {
        if (dreamAddModalJustClosed) return;
        showDreamAddModal();
      });
      slot.appendChild(mountAppFooterAddButton(addBtn));
      return;
    }

    if (!activeDreamId) return;

    if (dreamViewScreen === "kpis") {
      addBtn.title = "KPI 추가";
      addBtn.setAttribute("aria-label", "KPI 추가");
      addBtn.addEventListener("click", () => {
        if (!activeDreamId) return;
        showKpiModal();
      });
      appendKpiFooterHomeButton(slot);
      slot.appendChild(mountAppFooterAddButton(addBtn));
      return;
    }

    if (dreamViewScreen !== "kpiDetail" || !selectedKpiId) return;

    const data = loadDreamMap();
    const kpiNow = (data.kpis || []).find((k) => k.id === selectedKpiId);
    if (!kpiNow || kpiNow.dreamId !== activeDreamId) return;

    const tab = getKpiHistoryBottomTab("dream", selectedKpiId);
    const addLabel = dreamKpiFooterAddLabel(tab, kpiNow);
    addBtn.title = addLabel;
    addBtn.setAttribute("aria-label", addLabel);
    addBtn.addEventListener("click", () => {
      void runDreamKpiFooterAddAction();
    });
    appendKpiFooterHomeButton(slot);
    slot.appendChild(mountAppFooterAddButton(addBtn));
  }

  function getKpiLogs(kpiId) {
    const data = loadDreamMap();
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
    const result = computeKpiProgress(kpi, {
      toDateKey,
      getAllKpiLogs: () => loadDreamMap().kpiLogs || [],
      getAccumulatedKpiValue: getAccumulatedKpiValue,
      getKpiTodos: (kpiId) =>
        (loadDreamMap().kpiTodos || []).filter((t) => t.kpiId === kpiId),
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

  function renderKpiList() {
    patchKpiLinkedTasksFromKpiMaps();
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
    contentWrap.className = "dream-content-wrap";
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

    if (
      renderKpiMapSyncLoadingIfNeeded({
        tabId: "dream",
        container: contentWrap,
        isEmpty: dreamKpis.length === 0,
        onLoading: () => {
          historyWrap.hidden = true;
          el.appendChild(historyWrap);
          syncAppFooterDreamKpiActions();
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
    const listToShow =
      kpiFilter === "active"
        ? activeKpis
        : kpiFilter === "completed"
          ? completedKpis
          : dreamKpis;
    listToShow.forEach((kpi) => {
      const progressResult = getKpiProgress(kpi);
      const {
        progress,
        timeProgress,
        currentVal,
        lowerBetter,
        useTimeAsUnit,
        accumulatedMins,
      } = progressResult;
      const unitSuffix = kpi.unit ? " " + kpi.unit : "";
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
      const investedTimeHtml = "";
      const heroUnitFinal = heroUnit;
      const nameHtml = `${escapeHtml(kpi.name)}${lowerBetter ? '<span class="dream-kpi-card-direction-badge" title="낮을수록 좋음 KPI">↓낮음</span>' : ""}`;
      const progressHtml = hideProgressBar
        ? `<div class="dream-kpi-card-progress dream-kpi-card-progress--habit"><div class="dream-kpi-card-progress-text">${escapeHtml(progressText)}</div></div>`
        : `<div class="dream-kpi-card-progress">
            <div class="dream-kpi-card-progress-bar${hideProgressFill ? " dream-kpi-card-progress-bar--empty" : ""}"><div class="dream-kpi-card-progress-fill" style="width:${hideProgressFill ? 0 : displayProgress}%"></div></div>
            <div class="dream-kpi-card-progress-text">${escapeHtml(progressText)}</div>
          </div>`;
      card.innerHTML = `
        <div class="dream-kpi-card-inner">
          ${KPI_CARD_EDIT_PENCIL_HTML}
          ${kpiCardHeadHtml(kpi, "dream", nameHtml)}
          <div class="dream-kpi-card-target-num${heroStreakAsideHtml ? " dream-kpi-card-target-num--habit-unit" : ""}">${formatKpiCardHeroHtml(lowerBetter, heroStr, heroUnitFinal, heroPrefix)}${heroStreakAsideHtml || ""}</div>
          ${progressHtml}
          ${investedTimeHtml ? `<div class="dream-kpi-card-invested">${investedTimeHtml}</div>` : ""}
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
        const newOrder = dreamKpis.map((k) => k.id);
        const fromIdx = newOrder.indexOf(draggedId);
        const toIdx = newOrder.indexOf(kpi.id);
        if (fromIdx >= 0 && toIdx >= 0) {
          newOrder.splice(fromIdx, 1);
          newOrder.splice(toIdx, 0, draggedId);
          reorderKpis(activeDreamId, newOrder);
          renderKpiList();
        }
      });
      appendKpiCardToGrid(grid, card, kpi, escapeHtml);
    });
    wireKpiCardIconsIn(grid);
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

  function renderKpiDetailView(opts = {}) {
    contentWrap.hidden = false;
    contentWrap.className = "dream-content-wrap dream-kpi-detail-wrap";
    if (!selectedKpiId) {
      contentWrap.innerHTML = "";
      exitToKpiList();
      return;
    }
    void renderKpiHistory({ ...opts, target: contentWrap });
    syncAppFooterDreamKpiActions();
    persistKpiUiState();
  }

  async function renderKpiHistory(opts = {}) {
    syncHabitTrackerLogs();
    const { scrollTodoAfterMutation = false, target = historyWrap } = opts;
    target.innerHTML = "";
    if (!selectedKpiId) {
      if (target === historyWrap) historyWrap.hidden = true;
      syncAppFooterDreamKpiActions();
      return;
    }
    const data = loadDreamMap();
    const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
    const needHabitTracker = kpi ? !!kpi.needHabitTracker : false;
    if (!kpi) {
      if (target === historyWrap) historyWrap.hidden = true;
      exitToKpiList();
      return;
    }
    const storedLogs = getKpiLogs(selectedKpiId);
    const logs = resolveKpiDetailLogEntriesLocal(kpi, storedLogs);
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
    segBar.setAttribute("aria-label", "할 일·매일 할 일·로그 전환");

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

    if (!dailyTodosOnly) {
      segBar.appendChild(btnSegTodo);
    }
    if (btnSegDaily) segBar.appendChild(btnSegDaily);
    segBar.appendChild(btnSegLog);

    const panelLogSeg = document.createElement("div");
    panelLogSeg.className =
      "dream-kpi-bottom-seg-panel dream-kpi-bottom-seg-panel--log";
    panelLogSeg.setAttribute("role", "tabpanel");
    appendKpiDailyLogBlock(panelLogSeg, logs);

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
            saveDreamMap(d, { pushServer: true });
            const after = loadDreamMap();
            kpiTodoLifecycleLog("꿈KPI탭_모달삭제_saveDreamMap후", {
              todoId: String(todo.id),
              삭제후: kpiTodoSnapshotBrief(after),
              삭제후dr: deletedRefsKpiTodosLen(after),
            });
            renderKpiDetailView({ scrollTodoAfterMutation: true });
            return;
          }
          const d = loadDreamMap();
          const row = (d.kpiTodos || []).find((x) => x.id === todo.id);
          if (!row) return;
          row.text = result.text;
          saveDreamMap(d, { pushServer: true });
          renderKpiDetailView({ scrollTodoAfterMutation: true });
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
            saveDreamMap(d, { pushServer: true });
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
            saveDreamMap(d, { pushServer: true });
            renderKpiDetailView({ scrollTodoAfterMutation: true });
            return;
          }
          const d = loadDreamMap();
          const row = (d.kpiDailyRepeatTodos || []).find((x) => x.id === todo.id);
          if (!row) return;
          row.text = result.text;
          saveDreamMap(d, { pushServer: true });
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

    const segBarMount = mountKpiSegBarClearCompletedRow(segBar, {
      showClearCompleted: !dailyTodosOnly,
      kpiId: selKpi,
      loadMap: loadDreamMap,
      saveMap: saveDreamMap,
      appendDeletedRef,
      onAfterDelete: () => renderKpiDetailView({ scrollTodoAfterMutation: true }),
    });
    target.appendChild(segBarMount);
    target.appendChild(panelLogSeg);
    if (panelTodoSeg) target.appendChild(panelTodoSeg);
    if (panelDailySeg) target.appendChild(panelDailySeg);

    wireKpiHistoryBottomTabs(
      "dream",
      selectedKpiId,
      btnSegLog,
      dailyTodosOnly ? null : btnSegTodo,
      btnSegDaily,
      panelLogSeg,
      dailyTodosOnly ? null : panelTodoSeg,
      panelDailySeg,
      hasDailyTab,
      () => syncAppFooterDreamKpiActions(),
      { dailyTodosOnly },
    );
    if (scrollTodoAfterMutation) {
      afterKpiTodoListMutationScroll(target);
    }
    syncAppFooterDreamKpiActions();

    if (kpiDetailLogsNeedCloudPull(kpi, storedLogs)) {
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
            <input type="text" name="name" placeholder="시간관리를 도와주는 사람" />
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
      saveDreamMap(data, { pushServer: true });
      selectedKpiId = null;
      dreamAddModalJustClosed = true;
      close();
      dreamViewScreen = "goals";
      activeDreamId = null;
      updateDreamView();
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
      saveDreamMap(d, { pushServer: true });
      if (activeDreamId === dreamId) {
        activeDreamId = d.dreams[0]?.id || null;
        selectedKpiId = null;
        if (!activeDreamId) dreamViewScreen = "goals";
      }
      syncDreamHeader();
      updateDreamView();
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
        saveDreamMap(d, { pushServer: true });
        syncDreamHeader();
        updateDreamView();
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
      saveDreamMap(d, { pushServer: true });
      close();
      updateDesiredLifeDisplay();
    });
    const deleteBtn = modal.querySelector(".dream-desired-life-delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        const d = loadDreamMap();
        d.desiredLife = "";
        saveDreamMap(d, { pushServer: true });
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

  function renderDreamGoalsList() {
    historyWrap.hidden = true;
    historyWrap.innerHTML = "";
    contentWrap.hidden = false;
    contentWrap.className = "dream-content-wrap";
    contentWrap.innerHTML = "";
    syncAppFooterDreamKpiActions();

    const list = document.createElement("div");
    list.className = "dream-goals-list";
    const data = loadDreamMap();

    if (
      renderKpiMapSyncLoadingIfNeeded({
        tabId: "dream",
        container: contentWrap,
        isEmpty: !data.dreams.length,
        onLoading: () => syncAppFooterDreamKpiActions(),
      })
    ) {
      return;
    }

    if (!data.dreams.length) {
      const empty = document.createElement("p");
      empty.className = "dream-goals-empty";
      empty.textContent = "꿈 목표를 추가해 보세요.";
      list.appendChild(empty);
    }

    data.dreams.forEach((dream) => {
      const kpiCount = (data.kpis || []).filter((k) => k.dreamId === dream.id)
        .length;
      const item = document.createElement("div");
      item.className = "dream-goals-item dream-kpi-card";
      item.innerHTML = `
        <div class="dream-kpi-card-inner">
          ${DREAM_GOAL_EDIT_PENCIL_HTML}
          <div class="dream-goals-item-name">${escapeHtml(dream.name || "꿈 이름")}</div>
          <div class="dream-goals-item-meta">KPI ${kpiCount}개</div>
        </div>
      `;
      bindKpiCardEditButton(item.querySelector(".dream-kpi-card-edit"), () =>
        showDreamContextModal(dream, item),
      );
      item.addEventListener("click", (e) => {
        if (e.target.closest(".dream-kpi-card-edit")) return;
        enterKpiView(dream.id);
      });
      list.appendChild(item);
    });

    contentWrap.appendChild(list);
    persistKpiUiState();
  }

  function updateDreamView() {
    syncDreamHeader();
    historyWrap.hidden = true;
    historyWrap.innerHTML = "";
    if (dreamViewScreen === "goals") {
      renderDreamGoalsList();
      return;
    }
    const data = loadDreamMap();
    const dream = data.dreams.find((d) => d.id === activeDreamId);
    if (dream) {
      if (dreamViewScreen === "kpiDetail") {
        renderKpiDetailView();
      } else {
        contentWrap.hidden = false;
        contentWrap.className = "dream-content-wrap";
        renderKpiList();
      }
    } else {
      exitToDreamGoalsList();
    }
    persistKpiUiState();
  }

  function reconcileScopeWithStoredMap(data) {
    const dreams = data?.dreams || [];
    const kpis = data?.kpis || [];
    const inKpiFlow = dreamViewScreen === "kpis" || dreamViewScreen === "kpiDetail";
    if (inKpiFlow) {
      if (!dreams.some((d) => d.id === activeDreamId)) {
        activeDreamId = dreams[0]?.id || null;
        selectedKpiId = null;
        dreamViewScreen = activeDreamId ? "kpis" : "goals";
      }
    } else {
      activeDreamId = null;
      selectedKpiId = null;
    }
    if (selectedKpiId && !kpis.some((k) => k.id === selectedKpiId)) {
      selectedKpiId = null;
      if (dreamViewScreen === "kpiDetail") dreamViewScreen = "kpis";
    }
  }

  reconcileScopeWithStoredMap(_dreamInitData);
  updateDesiredLifeDisplay();
  syncDreamHeader();
  updateDreamView();
  let lastKpiMapPaintSig = readKpiMapLocalStorageSignature(
    DREAM_KPI_MAP_STORAGE_KEY,
  );

  function syncDreamUiFromStoredMap() {
    if (!el.isConnected) return;
    const nextSig = readKpiMapLocalStorageSignature(DREAM_KPI_MAP_STORAGE_KEY);
    if (nextSig === lastKpiMapPaintSig) return;
    lastKpiMapPaintSig = nextSig;
    const data = loadDreamMap();
    const inKpiFlow = dreamViewScreen === "kpis" || dreamViewScreen === "kpiDetail";
    if (inKpiFlow) {
      if (!data.dreams.some((d) => d.id === activeDreamId)) {
        activeDreamId = data.dreams[0]?.id || null;
        selectedKpiId = null;
        dreamViewScreen = activeDreamId ? "kpis" : "goals";
      }
    } else {
      activeDreamId = null;
      selectedKpiId = null;
    }
    if (selectedKpiId && !data.kpis.some((k) => k.id === selectedKpiId)) {
      selectedKpiId = null;
      if (dreamViewScreen === "kpiDetail") dreamViewScreen = "kpis";
    }
    syncDreamHeader();
    updateDreamView();
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
  window.addEventListener("lp-kpi-tab-pull-settled", (e) => {
    if (!el.isConnected || e.detail?.tabId !== "dream") return;
    updateDreamView();
  });
  window.__lpDreamSoftRefresh = syncDreamUiFromStoredMap;
  window.__lpDreamFooterBack = () => {
    if (!el.isConnected) return false;
    if (dreamViewScreen === "kpiDetail") {
      exitToKpiList();
      return true;
    }
    if (dreamViewScreen === "kpis") {
      exitToDreamGoalsList();
      return true;
    }
    return false;
  };

  return el;
}
