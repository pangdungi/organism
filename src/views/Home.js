/**
 * Home 페이지 - 투두리스트 + 이벤트·리마인더 레이아웃
 */

import { getKpiTodosAsTasks, syncKpiTodoCompleted } from "../utils/kpiTodoSync.js";
import { getCustomSections } from "../utils/todoSettings.js";
import { getTodayTimeSummary } from "./Time.js";
import { render1DayView } from "./Calendar.js";

const SECTION_TASKS_KEY = "todo-section-tasks";
const CUSTOM_SECTION_TASKS_KEY = "todo-custom-section-tasks";
const KPI_SECTION_IDS = ["braindump", "dream", "sideincome", "health", "happy"];
const SECTION_LABELS = {
  dream: "꿈",
  sideincome: "부수입",
  health: "건강",
  happy: "행복",
  braindump: "브레인 덤프",
};

/** 해당 월(YYYY-MM)에 날짜가 배정된 이벤트/할일만 수집 (해당 월 셀만) */
function getEventsForCurrentMonth() {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const out = [];

  const inMonth = (dateStr) => (dateStr || "").slice(0, 7) === yearMonth;

  getKpiTodosAsTasks()
    .filter((t) => inMonth(t.dueDate) || inMonth(t.startDate))
    .forEach((t) => {
      out.push({
        name: (t.name || "").trim(),
        dueDate: (t.dueDate || "").slice(0, 10),
        startDate: (t.startDate || "").slice(0, 10),
        startTime: (t.startTime || "").trim(),
        endTime: (t.endTime || "").trim(),
        sectionLabel: t.sectionLabel || "",
        done: !!t.done,
        itemType: t.itemType || "todo",
      });
    });

  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      KPI_SECTION_IDS.forEach((sectionId) => {
        const arr = obj[sectionId];
        if (!Array.isArray(arr)) return;
        const sectionLabel = SECTION_LABELS[sectionId] || sectionId;
        arr
          .filter(
            (t) =>
              (t.name || "").trim() !== "" &&
              (inMonth(t.dueDate) || inMonth(t.startDate)),
          )
          .forEach((t) =>
            out.push({
              name: (t.name || "").trim(),
              dueDate: (t.dueDate || "").slice(0, 10),
              startDate: (t.startDate || "").slice(0, 10),
              startTime: (t.startTime || "").trim(),
              endTime: (t.endTime || "").trim(),
              sectionLabel,
              done: !!t.done,
              itemType: (t.itemType || "todo"),
            }),
          );
      });
    }
  } catch (_) {}

  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      getCustomSections().forEach((sec) => {
        const arr = obj[sec.id];
        if (!Array.isArray(arr)) return;
        arr
          .filter(
            (t) =>
              (t.name || "").trim() !== "" &&
              (inMonth(t.dueDate) || inMonth(t.startDate)),
          )
          .forEach((t) =>
            out.push({
              name: (t.name || "").trim(),
              dueDate: (t.dueDate || "").slice(0, 10),
              startDate: (t.startDate || "").slice(0, 10),
              startTime: (t.startTime || "").trim(),
              endTime: (t.endTime || "").trim(),
              sectionLabel: sec.label || sec.id,
              done: !!t.done,
              itemType: (t.itemType || "todo"),
            }),
          );
      });
    }
  } catch (_) {}

  out.sort((a, b) => {
    const dateA = a.dueDate || a.startDate || "";
    const dateB = b.dueDate || b.startDate || "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const timeA = a.startTime || "";
    const timeB = b.startTime || "";
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    return (a.name || "").localeCompare(b.name || "", "ko");
  });
  return out;
}

function formatTimeRange(startTime, endTime) {
  const s = (startTime || "").trim();
  const e = (endTime || "").trim();
  if (s && e) return `${s}~${e}`;
  if (s) return s;
  if (e) return e;
  return "";
}

function formatEventDate(dateStr) {
  if (!dateStr || dateStr.length < 10) return "";
  const [y, m, d] = dateStr.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function getDayNumber(dateStr) {
  if (!dateStr || dateStr.length < 10) return "";
  const d = dateStr.split("-")[2];
  return d ? parseInt(d, 10) : "";
}

function isWeekend(dateStr) {
  if (!dateStr || dateStr.length < 10) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
}

function isToday(dateStr) {
  if (!dateStr || dateStr.length < 10) return false;
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return dateStr.slice(0, 10) === todayKey;
}

/** 모든 탭(섹션)에서 리마인더가 설정된 할일만 수집. 탭명은 제외. */
function getRemindersFromAllSections() {
  const out = [];
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      KPI_SECTION_IDS.forEach((sectionId) => {
        const arr = obj[sectionId];
        if (!Array.isArray(arr)) return;
        arr.forEach((t) => {
          const rDate = (t.reminderDate || "").trim();
          if (!rDate) return;
          out.push({
            sectionId,
            taskId: t.taskId || "",
            name: (t.name || "").trim() || "(과제명 없음)",
            reminderDate: rDate.slice(0, 10),
            reminderTime: (t.reminderTime || "").trim(),
            isCustom: false,
          });
        });
      });
    }
  } catch (_) {}
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      getCustomSections().forEach((sec) => {
        const arr = obj[sec.id];
        if (!Array.isArray(arr)) return;
        arr.forEach((t) => {
          const rDate = (t.reminderDate || "").trim();
          if (!rDate) return;
          out.push({
            sectionId: sec.id,
            taskId: t.taskId || "",
            name: (t.name || "").trim() || "(과제명 없음)",
            reminderDate: rDate.slice(0, 10),
            reminderTime: (t.reminderTime || "").trim(),
            isCustom: true,
          });
        });
      });
    }
  } catch (_) {}
  out.sort((a, b) => {
    if (a.reminderDate !== b.reminderDate) return a.reminderDate.localeCompare(b.reminderDate);
    if (a.reminderTime !== b.reminderTime) return (a.reminderTime || "").localeCompare(b.reminderTime || "");
    return (a.name || "").localeCompare(b.name || "", "ko");
  });
  return out;
}

function formatReminderDisplay(rDate, rTime) {
  if (!(rDate || "").trim()) return "";
  const parts = String(rDate).trim().split(/[-/]/);
  const dateStr = parts.length >= 3 ? `${parts[1]}/${parts[2]}` : rDate;
  return (rTime || "").trim() ? `${dateStr} ${(rTime || "").trim()}` : dateStr;
}

/** 리마인더 날짜/시간이 과거인지 판별 (날짜 지난 리마인더 희미 표시용) */
function isReminderPast(reminderDate, reminderTime) {
  const dateStr = (reminderDate || "").trim().slice(0, 10);
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return false;
  let reminderMs = new Date(y, m - 1, d).getTime();
  const timeStr = (reminderTime || "").trim();
  if (timeStr) {
    const [hh, mm] = timeStr.split(":").map((n) => parseInt(n, 10) || 0);
    reminderMs = new Date(y, m - 1, d, hh, mm, 0).getTime();
  }
  return reminderMs < Date.now();
}

function updateReminderInStorage(sectionId, taskId, reminderDate, reminderTime, isCustom) {
  const key = isCustom ? CUSTOM_SECTION_TASKS_KEY : SECTION_TASKS_KEY;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const obj = JSON.parse(raw);
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (!t) return;
    t.reminderDate = (reminderDate || "").slice(0, 10) || "";
    t.reminderTime = (reminderTime || "").trim() || "";
    localStorage.setItem(key, JSON.stringify(obj));
  } catch (_) {}
}

/** 오늘 날짜(YYYY-MM-DD) 반환 */
function getTodayDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 마감일이 오늘인 모든 할일 수집 (섹션 + 커스텀 + KPI) */
function getTasksDueToday() {
  const today = getTodayDateKey();
  const out = [];
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      KPI_SECTION_IDS.forEach((sectionId) => {
        const arr = obj[sectionId];
        if (!Array.isArray(arr)) return;
        arr.forEach((t) => {
          const due = (t.dueDate || "").slice(0, 10);
          if (due !== today) return;
          out.push({
            sectionId,
            taskId: t.taskId || "",
            name: (t.name || "").trim() || "(과제명 없음)",
            done: !!t.done,
            eisenhower: (t.eisenhower || "").trim(),
            isCustom: false,
            isKpiTodo: false,
            dueDate: due,
            startDate: (t.startDate || "").slice(0, 10),
            reminderDate: (t.reminderDate || "").slice(0, 10),
            reminderTime: (t.reminderTime || "").trim(),
            sectionLabel: SECTION_LABELS[sectionId] || sectionId,
          });
        });
      });
    }
  } catch (_) {}
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      getCustomSections().forEach((sec) => {
        const arr = obj[sec.id];
        if (!Array.isArray(arr)) return;
        arr.forEach((t) => {
          const due = (t.dueDate || "").slice(0, 10);
          if (due !== today) return;
          out.push({
            sectionId: sec.id,
            taskId: t.taskId || "",
            name: (t.name || "").trim() || "(과제명 없음)",
            done: !!t.done,
            eisenhower: (t.eisenhower || "").trim(),
            isCustom: true,
            isKpiTodo: false,
            dueDate: due,
            startDate: (t.startDate || "").slice(0, 10),
            reminderDate: (t.reminderDate || "").slice(0, 10),
            reminderTime: (t.reminderTime || "").trim(),
            sectionLabel: sec.label || sec.id,
          });
        });
      });
    }
  } catch (_) {}
  getKpiTodosAsTasks().forEach((t) => {
    const due = (t.dueDate || "").slice(0, 10);
    if (due !== today) return;
    out.push({
      sectionId: t.sectionId || "",
      taskId: t.kpiTodoId || "",
      name: (t.name || "").trim() || "(과제명 없음)",
      done: !!t.done,
      eisenhower: (t.eisenhower || "").trim(),
      isCustom: false,
      isKpiTodo: true,
      kpiTodoId: t.kpiTodoId,
      storageKey: t.storageKey,
      dueDate: due,
      startDate: (t.startDate || "").slice(0, 10),
      reminderDate: (t.reminderDate || "").slice(0, 10),
      reminderTime: (t.reminderTime || "").trim(),
      classification: (t.classification || "").trim(),
      sectionLabel: t.sectionLabel || SECTION_LABELS[t.sectionId] || "",
      kpiId: t.kpiId,
    });
  });
  out.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
  return out;
}

function updateHomeTaskDone(item, done) {
  if (item.isKpiTodo && item.kpiTodoId && item.storageKey) {
    syncKpiTodoCompleted(item.kpiTodoId, item.storageKey, done);
    return;
  }
  const key = item.isCustom ? CUSTOM_SECTION_TASKS_KEY : SECTION_TASKS_KEY;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const obj = JSON.parse(raw);
    const arr = obj[item.sectionId];
    if (!Array.isArray(arr)) return;
    const t = arr.find((x) => (x.taskId || "") === item.taskId);
    if (t) {
      t.done = !!done;
      localStorage.setItem(key, JSON.stringify(obj));
    }
  } catch (_) {}
}

const HOME_CARD_EISENHOWER_LABELS = {
  "urgent-important": "긴급+중요",
  "important-not-urgent": "중요+여유",
  "urgent-not-important": "긴급+덜중요",
  "not-urgent-not-important": "여유+안중요",
  "not-urgent-": "여유+안중요",
};

const HOME_TODO_REMINDER_BELL_SVG =
  '<svg class="todo-card-reminder-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 19.001c0 2.209 1.791 4 4 4s4-1.791 4-4"/><path d="m12 5.999v6"/><path d="m9 8.999h6"/><path d="m22 19.001-3-5.25v-5.752c0-3.866-3.134-7-7-7s-7 3.134-7 7v5.751l-3 5.25h20z"/></svg>';

function isHomeDueOverdue(dueStr) {
  if (!dueStr || dueStr.length < 10) return false;
  const parts = String(dueStr).trim().split("-");
  if (parts.length < 3) return false;
  const due = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

/** 할일 탭 todo-card와 동일 규칙 (TodoList.formatCardDates) */
function formatHomeTodoCardDates(item) {
  const startDate = item.startDate || "";
  const dueDate = item.dueDate || "";
  if (dueDate && isHomeDueOverdue(dueDate)) {
    const parts = String(dueDate).trim().split(/[-/]/);
    if (parts.length >= 3) {
      const due = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays < 0) return `${Math.abs(diffDays)}일 초과`;
    }
  }
  const toMD = (str) => {
    if (!str || !String(str).includes("-")) return "";
    const [, m, d] = str.trim().split("-");
    return m && d ? `${m}/${d}` : "";
  };
  const start = toMD(startDate);
  const due = toMD(dueDate);
  if (start && due) return `${start} ~ ${due}`;
  if (due) return due;
  if (start) return start;
  return "";
}

function formatHomeCardReminder(reminderDate, reminderTime) {
  if (!(reminderDate || "").trim()) return "";
  const parts = String(reminderDate).trim().split(/[-/]/);
  const dateStr = parts.length >= 3 ? `${parts[1]}/${parts[2]}` : reminderDate;
  return (reminderTime || "").trim() ? `${dateStr} ${(reminderTime || "").trim()}` : dateStr;
}

/** 할일 목록 탭과 동일 todo-card 마크업 (오늘 탭 전용) */
function createHomeTodoCard(item) {
  const card = document.createElement("div");
  card.className = "todo-card" + (item.done ? " is-done" : "");

  const doneCheck = document.createElement("input");
  doneCheck.type = "checkbox";
  doneCheck.className = "todo-done-check todo-card-done";
  doneCheck.checked = item.done;
  doneCheck.addEventListener("change", (e) => {
    e.stopPropagation();
    updateHomeTaskDone(item, doneCheck.checked);
    card.classList.toggle("is-done", doneCheck.checked);
  });

  const nameWrap = document.createElement("div");
  nameWrap.className = "todo-card-name-wrap";
  const nameEl = document.createElement("span");
  nameEl.className = "todo-card-name";
  nameEl.textContent = item.name;
  const priorityEl = document.createElement("span");
  priorityEl.className = "todo-card-priority";
  priorityEl.textContent = item.eisenhower
    ? HOME_CARD_EISENHOWER_LABELS[item.eisenhower] || item.eisenhower
    : "";
  priorityEl.hidden = !item.eisenhower;

  nameWrap.appendChild(nameEl);
  nameWrap.appendChild(priorityEl);

  const kpiEl = document.createElement("div");
  kpiEl.className = "todo-card-kpi";
  const kpiText = (item.classification || "").trim();
  kpiEl.textContent = kpiText;
  kpiEl.hidden = !item.isKpiTodo || !kpiText;

  const datesEl = document.createElement("div");
  datesEl.className = "todo-card-dates";
  const homeDateStr = formatHomeTodoCardDates(item);
  datesEl.textContent = homeDateStr;
  datesEl.hidden = !homeDateStr || !String(homeDateStr).trim();

  const reminderEl = document.createElement("div");
  reminderEl.className = "todo-card-reminder";
  const remText = formatHomeCardReminder(item.reminderDate, item.reminderTime);
  if (remText) {
    reminderEl.innerHTML = `${HOME_TODO_REMINDER_BELL_SVG}<span class="todo-card-reminder-text"></span>`;
    const remSpan = reminderEl.querySelector(".todo-card-reminder-text");
    if (remSpan) remSpan.textContent = remText;
    reminderEl.hidden = false;
  } else {
    reminderEl.hidden = true;
  }

  const metaRow = document.createElement("div");
  metaRow.className = "todo-card-meta-row";
  metaRow.appendChild(datesEl);
  metaRow.appendChild(reminderEl);
  metaRow.hidden = !!(datesEl.hidden && reminderEl.hidden);

  const doneWrap = document.createElement("div");
  doneWrap.className = "todo-card-done-wrap";
  doneWrap.appendChild(doneCheck);

  const detailStack = document.createElement("div");
  detailStack.className = "todo-card-detail-stack";
  detailStack.appendChild(kpiEl);
  detailStack.appendChild(metaRow);

  const titleRow = document.createElement("div");
  titleRow.className = "todo-card-title-row";
  titleRow.appendChild(doneWrap);
  titleRow.appendChild(nameWrap);
  titleRow.appendChild(detailStack);

  const contentCol = document.createElement("div");
  contentCol.className = "todo-card-content";
  contentCol.appendChild(titleRow);

  const inner = document.createElement("div");
  inner.className = "todo-card-inner";
  inner.appendChild(contentCol);
  card.appendChild(inner);

  return card;
}

/** To do list 영역: 마감일 오늘 할일 — 할일 탭과 동일 카드 레이아웃 */
function fillTodoListContent(todoListContent) {
  todoListContent.innerHTML = "";
  const tasks = getTasksDueToday();
  if (tasks.length === 0) {
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "todo-cards-wrap home-todo-cards-wrap";
  tasks.forEach((item) => {
    wrap.appendChild(createHomeTodoCard(item));
  });
  todoListContent.appendChild(wrap);
}

/** 리마인더 영역 채우기: 목록 + 시간 + 수정 버튼. 수정 시 모달에서 저장하면 storage 반영 후 이 함수로 갱신. */
function fillReminderContent(reminderContent) {
  reminderContent.innerHTML = "";
  const list = getRemindersFromAllSections();
  if (list.length === 0) {
    return;
  }
  const escapeHtml = (s) => {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  };
  list.forEach((item) => {
    const row = document.createElement("div");
    const isPast = isReminderPast(item.reminderDate, item.reminderTime);
    row.className = "home-reminder-row" + (isPast ? " home-reminder-row--past" : "");
    const displayTime = formatReminderDisplay(item.reminderDate, item.reminderTime);
    row.innerHTML = `
      <span class="home-reminder-row-name">${escapeHtml(item.name)}</span>
      <button type="button" class="home-reminder-row-edit" title="Edit reminder">수정</button>
      <span class="home-reminder-row-time">${escapeHtml(displayTime)}</span>
    `;
    row.querySelector(".home-reminder-row-edit").addEventListener("click", () => {
      openReminderModalFromHome(item, () => fillReminderContent(reminderContent));
    });
    reminderContent.appendChild(row);
  });
}

/** 홈에서 리마인더 수정 모달 열기. 저장 시 onSaved() 콜백으로 목록 갱신. */
function openReminderModalFromHome(item, onSaved) {
  const modal = document.createElement("div");
  modal.className = "dream-kpi-modal todo-reminder-modal";
  const escapeHtml = (s) => {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  };
  const defaultDate = (item.reminderDate || "").slice(0, 10) || "";
  const defaultTime = (item.reminderTime || "").trim() || "";
  modal.innerHTML = `
    <div class="dream-kpi-backdrop"></div>
    <div class="dream-kpi-panel">
      <div class="dream-kpi-modal-header">
        <h3 class="dream-kpi-modal-title">Reminder</h3>
        <button type="button" class="dream-kpi-modal-close" title="닫기">×</button>
      </div>
      <div class="todo-reminder-form">
        <div class="todo-reminder-field">
          <label class="todo-reminder-label">과제명</label>
          <p class="todo-reminder-task-name">${escapeHtml(item.name)}</p>
        </div>
        <div class="todo-reminder-field">
          <label class="todo-reminder-label">날짜</label>
          <div class="todo-reminder-date-row">
            <input type="date" class="todo-reminder-date" name="todo-reminder-date" value="${escapeHtml(defaultDate)}" />
            <button type="button" class="todo-reminder-date-btn" data-offset="0">오늘</button>
            <button type="button" class="todo-reminder-date-btn" data-offset="1">내일</button>
          </div>
        </div>
        <div class="todo-reminder-field">
          <label class="todo-reminder-label">시간</label>
          <input type="text" class="todo-reminder-time" placeholder="예: 14:30" autocomplete="off" value="${escapeHtml(defaultTime)}" />
          <span class="todo-reminder-time-error" aria-live="polite"></span>
        </div>
        <button type="button" class="dream-kpi-submit todo-reminder-save">설정</button>
      </div>
    </div>
  `;
  const close = () => modal.remove();
  modal.querySelector(".dream-kpi-backdrop").addEventListener("click", close);
  modal.querySelector(".dream-kpi-modal-close").addEventListener("click", close);
  const dateInput = modal.querySelector(".todo-reminder-date");
  function toYYYYMMDD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  modal.querySelectorAll(".todo-reminder-date-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const offset = parseInt(btn.dataset.offset, 10) || 0;
      const d = new Date();
      d.setDate(d.getDate() + offset);
      dateInput.value = toYYYYMMDD(d);
    });
  });
  const timeInput = modal.querySelector(".todo-reminder-time");
  const timeErrorEl = modal.querySelector(".todo-reminder-time-error");
  function formatTimeInput(val) {
    const digits = String(val || "").replace(/\D/g, "");
    if (digits.length >= 4) {
      const h = digits.slice(0, 2);
      const m = digits.slice(2, 4);
      return `${h}:${m}`;
    }
    return digits;
  }
  timeInput.addEventListener("input", () => {
    timeErrorEl.textContent = "";
    const raw = timeInput.value;
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 4) timeInput.value = formatTimeInput(raw);
  });
  timeInput.addEventListener("blur", () => {
    const digits = (timeInput.value || "").replace(/\D/g, "");
    if (digits.length >= 2) timeInput.value = formatTimeInput(timeInput.value);
  });
  modal.querySelector(".todo-reminder-save").addEventListener("click", () => {
    const dateVal = (modal.querySelector(".todo-reminder-date").value || "").trim();
    let timeVal = (timeInput.value || "").trim();
    const digits = timeVal.replace(/\D/g, "");
    if (digits.length >= 2) timeVal = formatTimeInput(timeVal);
    if (!timeVal || digits.length < 2) {
      timeErrorEl.textContent = "시간을 입력하세요.";
      return;
    }
    updateReminderInStorage(item.sectionId, item.taskId, dateVal, timeVal, item.isCustom);
    close();
    if (typeof onSaved === "function") onSaved();
  });
  document.body.appendChild(modal);
}

/** 오늘 탭 대형 날짜: 한글 (예: 4월 2일) */
function formatTodayTitle(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}월 ${day}일`;
}

function formatTodayWeekdayKo(date) {
  return date.toLocaleDateString("ko-KR", { weekday: "long" });
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content home-view";

  const today = new Date();
  const dateBlock = document.createElement("div");
  dateBlock.className = "home-view-date-block";

  const dateKicker = document.createElement("p");
  dateKicker.className = "home-view-date-kicker";
  dateKicker.textContent = "ORGANISM PLANNER";

  const dateTitle = document.createElement("h1");
  dateTitle.className = "home-view-date-title";
  dateTitle.textContent = formatTodayTitle(today);

  const dateWeekday = document.createElement("p");
  dateWeekday.className = "home-view-date-weekday";
  dateWeekday.textContent = formatTodayWeekdayKo(today);

  dateBlock.appendChild(dateKicker);
  dateBlock.appendChild(dateTitle);
  dateBlock.appendChild(dateWeekday);

  const timeSummary = getTodayTimeSummary();
  const trackedPct = Math.min(100, Math.max(0, Number(timeSummary.trackedPct24 ?? 0)));
  const productivePct = Math.min(100, Math.max(0, Number(timeSummary.productivePct24 ?? 0)));
  const summaryGrid = document.createElement("div");
  summaryGrid.className = "home-time-summary-grid";
  summaryGrid.innerHTML = `
    <div class="home-time-summary-cell home-time-summary-cell--tracked">
      <span class="home-time-summary-label">총 기록</span>
      <span class="home-time-summary-value">${timeSummary.trackedDisplay}</span>
      <div class="home-time-summary-bar" aria-hidden="true">
        <div class="home-time-summary-bar-fill home-time-summary-bar-fill--viridian" style="width:${trackedPct}%"></div>
      </div>
    </div>
    <div class="home-time-summary-cell home-time-summary-cell--productive">
      <span class="home-time-summary-label">생산적 시간</span>
      <span class="home-time-summary-value">${timeSummary.productiveDisplay}</span>
      <div class="home-time-summary-bar" aria-hidden="true">
        <div class="home-time-summary-bar-fill home-time-summary-bar-fill--mint" style="width:${productivePct}%"></div>
      </div>
    </div>
    <div class="home-time-summary-cell home-time-summary-cell--money">
      <span class="home-time-summary-label">투자한 시급</span>
      <span class="home-time-summary-value home-time-summary-value--invested">${timeSummary.priceDisplay}<span class="home-time-summary-unit">원</span></span>
    </div>
    <div class="home-time-summary-cell home-time-summary-cell--money">
      <span class="home-time-summary-label">소비한 시급</span>
      <span class="home-time-summary-value home-time-summary-value--spent">${timeSummary.wastedDisplay}<span class="home-time-summary-unit">원</span></span>
    </div>
  `;

  const threeCols = document.createElement("div");
  threeCols.className = "home-view-three home-view-three--no-calendar";

  const leftCol = document.createElement("div");
  leftCol.className = "home-view-left-col";
  leftCol.appendChild(dateBlock);
  leftCol.appendChild(summaryGrid);

  const section2 = document.createElement("div");
  section2.className = "home-view-section home-view-section--event";

  const eventHalf = document.createElement("div");
  eventHalf.className = "home-event-half";
  const header2 = document.createElement("h3");
  header2.className = "home-view-section-title";
  header2.textContent = "Event";
  eventHalf.appendChild(header2);
  const eventList = document.createElement("div");
  eventList.className = "home-event-list home-event-list-grid";
  const events = getEventsForCurrentMonth();
  if (events.length > 0) {
    const byDate = {};
    events.forEach((ev) => {
      const dateKey = (ev.dueDate || ev.startDate || "").slice(0, 10);
      if (!dateKey) return;
      if (!byDate[dateKey]) byDate[dateKey] = [];
      byDate[dateKey].push(ev);
    });
    const sortedDates = Object.keys(byDate).sort();
    sortedDates.forEach((dateKey) => {
      const dayEvents = byDate[dateKey];
      const dd = getDayNumber(dateKey);
      const card = document.createElement("div");
      card.className =
        "home-event-time-card" +
        (isWeekend(dateKey) ? " is-weekend" : "") +
        (isToday(dateKey) ? " is-today" : "");
      const titlesHtml = dayEvents
        .map((ev) => {
          const doneClass = ev.done ? " is-done" : "";
          return `<div class="home-event-time-card-item${doneClass}">${escapeHtml(ev.name)}</div>`;
        })
        .join("");
      card.innerHTML = `
        <div class="home-event-time-card-dd">${escapeHtml(String(dd || ""))}</div>
        <div class="home-event-time-card-list">${titlesHtml}</div>
      `;
      eventList.appendChild(card);
    });
  }
  eventHalf.appendChild(eventList);
  section2.appendChild(eventHalf);

  const reminderHalf = document.createElement("div");
  reminderHalf.className = "home-event-half";
  const headerReminder = document.createElement("h3");
  headerReminder.className = "home-view-section-title";
  headerReminder.textContent = "Reminder";
  reminderHalf.appendChild(headerReminder);
  const reminderContent = document.createElement("div");
  reminderContent.className = "home-reminder-content";
  fillReminderContent(reminderContent);
  reminderHalf.appendChild(reminderContent);
  section2.appendChild(reminderHalf);

  /* 예상시간/실제 타임테이블(1일 뷰): 모바일은 세로 스택, 데스크탑(64rem↑)은 Event|Reminder 옆 3분할 */
  const timelineSection = document.createElement("div");
  timelineSection.className = "home-1day-timeline-section home-embed-1day";
  const timelineTitle = document.createElement("h3");
  timelineTitle.className = "home-view-section-title";
  timelineTitle.textContent = "타임라인";
  timelineSection.appendChild(timelineTitle);
  const timelineMount = document.createElement("div");
  timelineMount.className = "home-1day-timeline-mount";
  timelineMount.appendChild(render1DayView(null));
  timelineSection.appendChild(timelineMount);
  section2.appendChild(timelineSection);

  const section3 = document.createElement("div");
  section3.className = "home-view-section home-view-section--todo";
  const header3 = document.createElement("h3");
  header3.className = "home-view-section-title";
  header3.textContent = "Today's to do list";
  section3.appendChild(header3);
  const todoListContent = document.createElement("div");
  todoListContent.className = "home-todo-list-content";
  fillTodoListContent(todoListContent);
  section3.appendChild(todoListContent);

  leftCol.appendChild(section3);
  threeCols.appendChild(leftCol);
  threeCols.appendChild(section2);
  el.appendChild(threeCols);

  return el;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}
