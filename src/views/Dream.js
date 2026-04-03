/**
 * 꿈 페이지 - 꿈 추가 시 탭 형성, 꿈 제목이 탭 및 하단에 표시
 * 인생 KPI와 동일한 dream 데이터 사용 (kpi-dream-map)
 */

import { DREAM_KPI_MAP_STORAGE_KEY } from "../utils/dreamKpiMapSupabase.js";
import { notifyTimeLedgerTasksChanged } from "../utils/timeTaskOptionsModel.js";
import { toDateInputValue, formatDeadlineForDisplay, formatDeadlineRangeForDisplay, formatDeadlineRangeCompact } from "../utils/ganttModal.js";
import { getAccumulatedMinutes, minutesToHhMm, hhMmToMinutes, syncHabitTrackerLogs } from "../utils/timeKpiSync.js";
import { getSubtasks, addSubtask, updateSubtask, removeSubtask } from "../utils/todoSubtasks.js";
import { setupDeadlineQuickButtons } from "../utils/deadlineQuickButtons.js";
import { attachKpiTodoInputScrollIntoView } from "../utils/kpiTodoInputScroll.js";

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
  const data = loadDreamMap();
  data.kpiTaskSync = data.kpiTaskSync || {};
  let opts = getTimeTaskOptionsRaw();
  if (opts === null) opts = [];

  if (action === "add") {
    const name = (kpi.name || "").trim();
    if (!name || opts.some((o) => getTaskName(o) === name)) return;
    data.kpiTaskSync[kpi.id] = name;
    opts.unshift({ name, category: "dream", productivity: "productive", memo: "" });
    try {
      localStorage.setItem(TIME_TASK_OPTIONS_KEY, JSON.stringify(opts));
    } catch (_) {}
    saveDreamMap(data);
    notifyTimeLedgerTasksChanged();
  } else if (action === "remove") {
    const name = (data.kpiTaskSync[kpi.id] || kpi.name || "").trim();
    if (name) {
      opts = opts.filter((o) => getTaskName(o) !== name);
      delete data.kpiTaskSync[kpi.id];
      try {
        localStorage.setItem(TIME_TASK_OPTIONS_KEY, JSON.stringify(opts));
      } catch (_) {}
      saveDreamMap(data);
      notifyTimeLedgerTasksChanged();
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
      saveDreamMap(data);
      notifyTimeLedgerTasksChanged();
    }
  }
}

function saveDreamMap(data) {
  try {
    const toSave = { ...data };
    if (toSave.kpiTodos && Array.isArray(toSave.kpiTodos)) {
      toSave.kpiTodos = toSave.kpiTodos.filter((t) => (t.text || "").trim() !== "");
    }
    if (toSave.kpiDailyRepeatTodos && Array.isArray(toSave.kpiDailyRepeatTodos)) {
      toSave.kpiDailyRepeatTodos = toSave.kpiDailyRepeatTodos.filter((t) => (t.text || "").trim() !== "");
    }
    localStorage.setItem(DREAM_KPI_MAP_STORAGE_KEY, JSON.stringify(toSave));
    try {
      window.dispatchEvent(new CustomEvent("dream-kpi-map-saved"));
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
  el.className = "app-tab-panel-content dream-view";

  const header = document.createElement("header");
  header.className = "dream-view-header";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "DREAM";
  const title = document.createElement("h1");
  title.className = "dream-view-title";
  title.textContent = "꿈";
  header.appendChild(label);
  header.appendChild(title);
  el.appendChild(header);

  const desiredLifeWrap = document.createElement("div");
  desiredLifeWrap.className = "dream-desired-life-wrap";
  desiredLifeWrap.hidden = true;
  el.appendChild(desiredLifeWrap);

  const tabsWrap = document.createElement("div");
  tabsWrap.className = "dream-tabs-wrap";
  const tabs = document.createElement("div");
  tabs.className = "dream-tabs";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "dream-add-icon-btn";
  addBtn.title = "꿈 목표 추가";
  addBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="dream-add-icon" aria-hidden="true" width="24" height="24"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m12 8v8"/><path d="m8 12h8"/><path d="m18 22h-12c-2.209 0-4-1.791-4-4v-12c0-2.209 1.791-4 4-4h12c2.209 0 4 1.791 4 4v12c0 2.209-1.791 4-4 4z"/></g></svg>`;
  addBtn.addEventListener("click", (e) => {
    if (dreamAddModalJustClosed) return;
    showDreamAddModal();
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

  let activeDreamId = null;
  let selectedKpiId = null;
  let kpiFilter = "all"; // "all" | "active" | "completed"
  let completedSectionCollapsed = true;
  let dreamAddModalJustClosed = false;

  function showKpiModal() {
    if (!activeDreamId) return;
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
          <div class="dream-kpi-field">
            <label>지표 이름</label>
            <input type="text" name="name" placeholder="예) DAU, 월 수익, 전환율" />
          </div>
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
              <input type="text" name="targetValue" placeholder="예) 1000" inputmode="numeric" />
            </div>
            <div class="dream-kpi-field">
              <label>단위</label>
              <input type="text" name="unit" placeholder="예) 명, 만원, %" />
            </div>
          </div>
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
        dreamId: activeDreamId,
        name: (form.name.value || "").trim() || "지표",
        unit: (form.unit.value || "").trim() || "",
        targetValue: sanitizeNumericInput(form.targetValue.value) || "",
        targetStartDate: (form.targetStartDate?.value || "").trim() || "",
        targetDeadline: (form.targetDeadline.value || "").trim() || "",
        needHabitTracker: needHabitChecked,
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
      if (targetInput) targetInput.placeholder = lower ? "예) 5" : "예) 1000";
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
          <div class="dream-kpi-field">
            <label>지표 이름</label>
            <input type="text" name="name" value="${escapeHtml(kpi.name || "")}" placeholder="예) DAU, 월 수익, 전환율" />
          </div>
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
              <input type="text" name="targetValue" value="${escapeHtml(sanitizeNumericInput(kpi.targetValue))}" placeholder="예) 1000" inputmode="numeric" />
            </div>
            <div class="dream-kpi-field">
              <label>단위</label>
              <input type="text" name="unit" value="${escapeHtml(kpi.unit || "")}" placeholder="예) 명, 만원, %" />
            </div>
          </div>
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
            <p class="dream-kpi-delete-note">삭제 시 로그, 할일 목록이 모두 삭제됩니다.</p>
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
        target.name = (form.name.value || "").trim() || "지표";
        target.unit = (form.unit.value || "").trim() || "";
        target.targetValue = sanitizeNumericInput(form.targetValue.value) || "";
        target.targetStartDate = (form.targetStartDate?.value || "").trim() || "";
        target.targetDeadline = (form.targetDeadline.value || "").trim() || "";
        target.needHabitTracker = !!form.querySelector('input[name="needHabitTracker"]')?.checked;
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
      const data = loadDreamMap();
      if (isEdit) {
        const idx = data.kpiLogs.findIndex((l) => l.id === editLog.id);
        if (idx >= 0) {
          data.kpiLogs[idx] = {
            ...data.kpiLogs[idx],
            date: dateStr,
            dateRaw: dateVal,
            value: sanitizeNumericInput(form.value.value) || "",
            status: "순항",
            memo: (form.memo.value || "").trim(),
          };
        }
      } else {
        const log = {
          id: nextId(),
          kpiId: kpi.id,
          dreamId: kpi.dreamId,
          date: dateStr,
          dateRaw: dateVal,
          value: sanitizeNumericInput(form.value.value) || "",
          status: "순항",
          memo: (form.memo.value || "").trim(),
        };
        data.kpiLogs = data.kpiLogs || [];
        data.kpiLogs.push(log);
      }
      saveDreamMap(data);
      close();
      renderKpiList();
      renderKpiHistory();
    });
    document.body.appendChild(modal);
    setupNumericOnlyInput(modal.querySelector('input[name="value"]'));
  }

  function getLatestKpiLog(kpiId) {
    const data = loadDreamMap();
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
    const data = loadDreamMap();
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
    if (!activeDreamId) return;
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
    dreamKpis.forEach((kpi) => {
      const { isCompleted } = getKpiProgress(kpi);
      if (isCompleted && data.kpiTaskSync?.[kpi.id]) {
        syncKpiToTimeTask(kpi, "remove");
      }
    });
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
        renderKpiList();
      });
    });
    contentWrap.appendChild(filterBar);

    const grid = document.createElement("div");
    grid.className = "dream-kpi-grid";
    const listToShow = kpiFilter === "active" ? activeKpis : kpiFilter === "completed" ? completedKpis : dreamKpis;
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
      const remainingMins = Math.max(0, targetMins - accumulatedMins);
      const card = document.createElement("div");
      card.className =
        "dream-kpi-card" +
        (lowerBetter ? " dream-kpi-card--lower-better" : "") +
        (selectedKpiId === kpi.id ? " is-selected" : "");
      card.dataset.kpiId = kpi.id;
      card.draggable = true;
      const timeCircleHtml =
        targetMins > 0
          ? `
          <div class="dream-kpi-time-circle-wrap">
            <div class="dream-kpi-time-circle" role="progressbar" aria-valuenow="${timeProgress}" aria-valuemin="0" aria-valuemax="100">
              <svg viewBox="0 0 36 36">
                <path class="dream-kpi-time-circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path class="dream-kpi-time-circle-fill" stroke-dasharray="${timeProgress}, ${100 - timeProgress}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div class="dream-kpi-time-circle-label">
                <span class="dream-kpi-time-accumulated">${minutesToHhMm(accumulatedMins)}</span>
                <span class="dream-kpi-time-sep">/</span>
                <span class="dream-kpi-time-target">${escapeHtml(kpi.targetTimeRequired)}</span>
              </div>
            </div>
            <div class="dream-kpi-time-remaining">남은 ${minutesToHhMm(remainingMins)}</div>
          </div>
        `
          : "";
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
          <div class="dream-kpi-card-invested">지금까지 투자한 시간 <span class="dream-kpi-card-invested-value">${minutesToHhMm(investedMins)}</span></div>
          ${timeCircleHtml}
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
    });
    grid.addEventListener("dragend", () => {
      grid.querySelectorAll(".dream-kpi-card-drag-over").forEach((c) => c.classList.remove("dream-kpi-card-drag-over"));
    });
    const addCard = document.createElement("button");
    addCard.type = "button";
    addCard.className = "dream-kpi-add-card";
    addCard.innerHTML = '<span class="dream-kpi-add-card-text">+ KPI 추가하기</span>';
    addCard.addEventListener("click", () => {
      if (!activeDreamId) return;
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
        const remainingMins = Math.max(0, targetMins - accumulatedMins);
        const card = document.createElement("div");
        card.className =
          "dream-kpi-card dream-kpi-card-completed" +
          (lowerBetter ? " dream-kpi-card--lower-better" : "") +
          (selectedKpiId === kpi.id ? " is-selected" : "");
        card.dataset.kpiId = kpi.id;
        const timeCircleHtml =
          targetMins > 0
            ? `
          <div class="dream-kpi-time-circle-wrap">
            <div class="dream-kpi-time-circle" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100">
              <svg viewBox="0 0 36 36">
                <path class="dream-kpi-time-circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path class="dream-kpi-time-circle-fill" stroke-dasharray="100, 0" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div class="dream-kpi-time-circle-label">
                <span class="dream-kpi-time-accumulated">${minutesToHhMm(accumulatedMins)}</span>
                <span class="dream-kpi-time-sep">/</span>
                <span class="dream-kpi-time-target">${escapeHtml(kpi.targetTimeRequired)}</span>
              </div>
            </div>
          </div>
        `
            : "";
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
            <div class="dream-kpi-card-invested">지금까지 투자한 시간 <span class="dream-kpi-card-invested-value">${minutesToHhMm(investedMins)}</span></div>
            ${timeCircleHtml}
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
  }

  function renderKpiHistory() {
    historyWrap.innerHTML = "";
    if (!selectedKpiId) {
      historyWrap.hidden = true;
      return;
    }
    const data = loadDreamMap();
    const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
    const needHabitTracker = kpi ? !!kpi.needHabitTracker : false;
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
          const d = loadDreamMap();
          appendDeletedRef(d, "kpiLogs", log.id);
          d.kpiLogs = (d.kpiLogs || []).filter((l) => l.id !== log.id);
          saveDreamMap(d);
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
      const taskId = `kpi-${todo.id}-${DREAM_KPI_MAP_STORAGE_KEY}`;
      const subtasks = getSubtasks(taskId);

      const item = document.createElement("div");
      const completed = !!todo.completed;
      item.className = "dream-kpi-todo-item" + (completed ? " is-completed" : "");
      item.dataset.todoId = todo.id;
      item.innerHTML = `
        <label class="dream-kpi-todo-check-wrap">
          <input type="checkbox" class="dream-kpi-todo-check" ${completed ? "checked" : ""} />
        </label>
        <span class="dream-kpi-todo-text">${escapeHtml(todo.text)}</span>
        <button type="button" class="dream-kpi-todo-sub-add" title="세부 할일 추가">+</button>
        <button type="button" class="dream-kpi-todo-del" title="삭제">×</button>
      `;
      const check = item.querySelector(".dream-kpi-todo-check");
      check.addEventListener("change", () => {
        const d = loadDreamMap();
        const t = d.kpiTodos.find((x) => x.id === todo.id);
        if (t) {
          t.completed = !!check.checked;
          saveDreamMap(d);
          item.classList.toggle("is-completed", t.completed);
        }
      });
      item.querySelector(".dream-kpi-todo-del").addEventListener("click", () => {
        const d = loadDreamMap();
        appendDeletedRef(d, "kpiTodos", todo.id);
        d.kpiTodos = (d.kpiTodos || []).filter((x) => x.id !== todo.id);
        saveDreamMap(d);
        renderKpiHistory();
      });
      item.querySelector(".dream-kpi-todo-sub-add").addEventListener("click", () => {
        const subs = addSubtask(taskId, { name: "", done: false });
        const newSt = subs[subs.length - 1];
        const subItem = document.createElement("div");
        subItem.className = "dream-kpi-todo-subitem";
        subItem.dataset.subtaskId = newSt.id;
        subItem.innerHTML = `
          <span class="dream-kpi-todo-subitem-spacer"></span>
          <label class="dream-kpi-todo-check-wrap">
            <input type="checkbox" class="dream-kpi-todo-check" />
          </label>
          <input type="text" class="dream-kpi-todo-subitem-input" placeholder="세부 할일 입력" value="" />
          <button type="button" class="dream-kpi-todo-del" title="삭제">×</button>
        `;
        const subInput = subItem.querySelector(".dream-kpi-todo-subitem-input");
        subInput.focus();
        subInput.addEventListener("blur", () => {
          const val = (subInput.value || "").trim();
          if (val === "") {
            removeSubtask(taskId, newSt.id);
            subItem.remove();
          } else {
            updateSubtask(taskId, newSt.id, { name: val });
            const span = document.createElement("span");
            span.className = "dream-kpi-todo-text dream-kpi-todo-subitem-text";
            span.textContent = val;
            subInput.replaceWith(span);
          }
        });
        subInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            subInput.blur();
          }
        });
        subItem.querySelector(".dream-kpi-todo-check").addEventListener("change", (e) => {
          updateSubtask(taskId, newSt.id, { done: e.target.checked });
          subItem.classList.toggle("is-completed", e.target.checked);
        });
        subItem.querySelector(".dream-kpi-todo-del").addEventListener("click", () => {
          removeSubtask(taskId, newSt.id);
          subItem.remove();
        });
        let insertBefore = item.nextElementSibling;
        while (insertBefore && insertBefore.classList.contains("dream-kpi-todo-subitem")) {
          insertBefore = insertBefore.nextElementSibling;
        }
        if (insertBefore) {
          todoList.insertBefore(subItem, insertBefore);
        } else {
          todoList.appendChild(subItem);
        }
      });
      todoList.appendChild(item);

      subtasks.forEach((st) => {
        const subItem = document.createElement("div");
        subItem.className = "dream-kpi-todo-subitem" + (st.done ? " is-completed" : "");
        subItem.dataset.subtaskId = st.id;
        subItem.innerHTML = `
          <span class="dream-kpi-todo-subitem-spacer"></span>
          <label class="dream-kpi-todo-check-wrap">
            <input type="checkbox" class="dream-kpi-todo-check" ${st.done ? "checked" : ""} />
          </label>
          <span class="dream-kpi-todo-text dream-kpi-todo-subitem-text">${escapeHtml(st.name)}</span>
          <button type="button" class="dream-kpi-todo-del" title="삭제">×</button>
        `;
        const subCheck = subItem.querySelector(".dream-kpi-todo-check");
        subCheck.addEventListener("change", () => {
          updateSubtask(taskId, st.id, { done: subCheck.checked });
          subItem.classList.toggle("is-completed", subCheck.checked);
        });
        subItem.querySelector(".dream-kpi-todo-del").addEventListener("click", () => {
          removeSubtask(taskId, st.id);
          subItem.remove();
        });
        todoList.appendChild(subItem);
      });
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
      const data = loadDreamMap();
      const todo = { id: nextId(), kpiId: selKpi, text: val, completed: false };
      data.kpiTodos = data.kpiTodos || [];
      data.kpiTodos.push(todo);
      saveDreamMap(data);
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
        item.dataset.todoId = todo.id;
        const label = document.createElement("label");
        label.className = "dream-kpi-todo-check-wrap";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "dream-kpi-todo-check";
        check.disabled = true;
        check.checked = completed;
        check.title = "매일 할일 체크는 시간기록(과제 기록)에서만 가능합니다";
        label.appendChild(check);
        const textInput = document.createElement("input");
        textInput.type = "text";
        textInput.className = "dream-kpi-todo-text dream-kpi-daily-repeat-edit-input";
        textInput.value = todo.text || "";
        textInput.title = "할 일 내용 수정";
        textInput.autocomplete = "off";
        textInput.style.cssText =
          "flex:1;min-width:0;border:none;background:transparent;font:inherit;color:inherit;padding:0;margin:0;box-sizing:border-box;";
        const saveDailyRepeatText = () => {
          const d = loadDreamMap();
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
          saveDreamMap(d);
        };
        textInput.addEventListener("blur", saveDailyRepeatText);
        textInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            textInput.blur();
          }
        });
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "dream-kpi-todo-del";
        delBtn.title = "삭제";
        delBtn.textContent = "×";
        delBtn.addEventListener("click", () => {
          const d = loadDreamMap();
          appendDeletedRef(d, "kpiDailyRepeatTodos", todo.id);
          d.kpiDailyRepeatTodos = (d.kpiDailyRepeatTodos || []).filter((x) => x.id !== todo.id);
          saveDreamMap(d);
          renderKpiHistory();
        });
        item.appendChild(label);
        item.appendChild(textInput);
        item.appendChild(delBtn);
        dailyList.appendChild(item);
      });
      const dailyAddRow = document.createElement("div");
      dailyAddRow.className = "dream-kpi-todo-add-row";
      dailyAddRow.innerHTML = `
        <span class="dream-kpi-todo-add-spacer"></span>
        <input type="text" class="dream-kpi-todo-add-input dream-kpi-daily-repeat-add-input" placeholder="할 일 입력 (매일 반복)" />
      `;
      const dailyAddInput = dailyAddRow.querySelector(".dream-kpi-todo-add-input");
      const addDailyFromInput = () => {
        const val = dailyAddInput.value.trim();
        if (!val) return;
        const d = loadDreamMap();
        d.kpiDailyRepeatTodos = d.kpiDailyRepeatTodos || [];
        d.kpiDailyRepeatTodos.push({ id: nextId(), kpiId: selKpi, text: val, completed: false });
        saveDreamMap(d);
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


  function showDreamAddModal() {
    const modal = document.createElement("div");
    modal.className = "dream-kpi-modal";
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel">
        <div class="dream-kpi-modal-header">
          <h3 class="dream-kpi-modal-title">꿈 목표 추가</h3>
          <button type="button" class="dream-kpi-modal-close" title="닫기">×</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-field">
            <label>꿈 이름</label>
            <input type="text" name="name" placeholder="예) ADHD 인생관리 웹서비스 판매" />
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
      const val = (form.name.value || "").trim() || "새 꿈";
      const data = loadDreamMap();
      const dream = { id: nextId(), name: val };
      data.dreams.push(dream);
      saveDreamMap(data);
      activeDreamId = dream.id;
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
    modal.className = "dream-kpi-modal dream-delete-confirm-modal";
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel dream-delete-confirm-panel">
        <h3 class="dream-delete-confirm-title">꿈 삭제</h3>
        <p class="dream-delete-confirm-msg">"${escapeHtml(dreamName)}"을(를) 정말 삭제하시겠습니까?</p>
        <p class="dream-delete-confirm-warn">삭제하면 복구할 수 없으며, 내부 KPI·로그·할일이 모두 삭제됩니다.</p>
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
    modal.className = "dream-kpi-modal";
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel dream-path-context-panel">
        <div class="dream-kpi-modal-header">
          <h3 class="dream-kpi-modal-title">꿈 수정</h3>
          <button type="button" class="dream-kpi-modal-close" title="닫기">×</button>
        </div>
        <form class="dream-kpi-form dream-path-edit-form">
          <div class="dream-kpi-field">
            <label>꿈 이름</label>
            <input type="text" name="name" value="${escapeHtml(dream.name || "")}" placeholder="꿈 이름" />
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
    modal.className = "dream-kpi-modal";
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel">
        <div class="dream-kpi-modal-header">
          <h3 class="dream-kpi-modal-title">내가 원하는 삶</h3>
          <button type="button" class="dream-kpi-modal-close" title="닫기">×</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-field">
            <label>원하는 삶을 자유롭게 적어보세요</label>
            <textarea name="desiredLife" rows="6" placeholder="예) 건강하게 오래 살고, 가족과 행복한 시간을 보내며, 하고 싶은 일을 하며 살고 싶습니다.">${escapeHtml(currentText)}</textarea>
          </div>
          <div class="dream-desired-life-modal-actions">
            <button type="submit" class="dream-kpi-submit">저장</button>
            ${currentText ? '<button type="button" class="dream-desired-life-delete-btn">삭제</button>' : ""}
          </div>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector(".dream-kpi-backdrop").addEventListener("click", close);
    modal.querySelector(".dream-kpi-modal-close").addEventListener("click", close);
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
      tab.className = "dream-tab" + (dream.id === activeDreamId ? " active" : "");
      tab.dataset.dreamId = dream.id;
      tab.innerHTML = `<span class="dream-tab-text">${escapeHtml(dream.name || "꿈 이름")}</span>`;
      tab.addEventListener("click", () => {
        activeDreamId = dream.id;
        renderTabs();
        updateTitleAndContent();
      });
      tab.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showDreamContextModal(dream, tab);
      });
      tabs.appendChild(tab);
    });
    tabs.appendChild(addBtn);
  }

  function updateTitleAndContent() {
    const data = loadDreamMap();
    const dream = data.dreams.find((d) => d.id === activeDreamId);
    if (dream) {
      contentWrap.hidden = false;
      selectedKpiId = null;
      renderKpiList();
      renderKpiHistory();
    } else {
      contentWrap.hidden = true;
    }
  }

  renderTabs();
  updateDesiredLifeDisplay();
  if (activeDreamId) {
    updateTitleAndContent();
  } else {
    const data = loadDreamMap();
    if (data.dreams.length > 0) {
      activeDreamId = data.dreams[0].id;
      renderTabs();
      updateTitleAndContent();
    } else {
      contentWrap.hidden = true;
    }
  }

  const onMergedSync = (e) => {
    if (!e.detail?.fromServerMerge || !el.isConnected) return;
    const data = loadDreamMap();
    if (!data.dreams.some((d) => d.id === activeDreamId)) {
      activeDreamId = data.dreams[0]?.id || null;
      selectedKpiId = null;
    }
    renderTabs();
    updateTitleAndContent();
    updateDesiredLifeDisplay();
  };
  window.addEventListener("dream-kpi-map-saved", onMergedSync);

  return el;
}
