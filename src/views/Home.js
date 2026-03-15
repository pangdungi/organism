/**
 * Home 페이지 - 3분할 레이아웃, 한 구역에 오늘 해치우기 캘린더
 */

import { render1DayView } from "./Calendar.js";
import { getKpiTodosAsTasks, syncKpiTodoCompleted } from "../utils/kpiTodoSync.js";
import { getCustomSections } from "../utils/todoSettings.js";

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

/** To do list 영역: 마감일 오늘 할일 + 체크박스 + 우선순위 테이블 */
function fillTodoListContent(todoListContent) {
  todoListContent.innerHTML = "";
  const tasks = getTasksDueToday();
  if (tasks.length === 0) {
    todoListContent.innerHTML = '<p class="home-event-empty">오늘 마감인 할일이 없습니다.</p>';
    return;
  }
  const table = document.createElement("table");
  table.className = "home-todo-list-table";
  table.innerHTML = `
    <thead><tr>
      <th class="home-todo-th-check"></th>
      <th class="home-todo-th-name">할일</th>
      <th class="home-todo-th-priority">우선순위</th>
    </tr></thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  tasks.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = "home-todo-list-row" + (item.done ? " is-done" : "");
    const checkTd = document.createElement("td");
    checkTd.className = "home-todo-td-check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "home-todo-done-check";
    checkbox.checked = item.done;
    checkbox.addEventListener("change", () => {
      updateHomeTaskDone(item, checkbox.checked);
      tr.classList.toggle("is-done", checkbox.checked);
    });
    checkTd.appendChild(checkbox);
    const nameTd = document.createElement("td");
    nameTd.className = "home-todo-td-name";
    nameTd.textContent = item.name;
    const priorityTd = document.createElement("td");
    priorityTd.className = "home-todo-td-priority";
    priorityTd.textContent = item.eisenhower || "—";
    tr.appendChild(checkTd);
    tr.appendChild(nameTd);
    tr.appendChild(priorityTd);
    tbody.appendChild(tr);
  });
  todoListContent.appendChild(table);
}

/** 리마인더 영역 채우기: 목록 + 시간 + 수정 버튼. 수정 시 모달에서 저장하면 storage 반영 후 이 함수로 갱신. */
function fillReminderContent(reminderContent) {
  reminderContent.innerHTML = "";
  const list = getRemindersFromAllSections();
  if (list.length === 0) {
    reminderContent.innerHTML = '<p class="home-event-empty">No reminders set.</p>';
    return;
  }
  const escapeHtml = (s) => {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  };
  list.forEach((item) => {
    const row = document.createElement("div");
    row.className = "home-reminder-row";
    const displayTime = formatReminderDisplay(item.reminderDate, item.reminderTime);
    row.innerHTML = `
      <span class="home-reminder-row-name">${escapeHtml(item.name)}</span>
      <span class="home-reminder-row-time">${escapeHtml(displayTime)}</span>
      <button type="button" class="home-reminder-row-edit" title="Edit reminder">수정</button>
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
            <input type="date" class="todo-reminder-date" value="${escapeHtml(defaultDate)}" />
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

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content home-view";

  const threeCols = document.createElement("div");
  threeCols.className = "home-view-three";

  const section1 = document.createElement("div");
  section1.className = "home-view-section home-view-section--calendar";
  const header1 = document.createElement("h3");
  header1.className = "home-view-section-title";
  header1.textContent = "Daily";
  section1.appendChild(header1);
  const calendarWrap = render1DayView(null);
  calendarWrap.classList.add("home-embed-1day");
  section1.appendChild(calendarWrap);
  /* 홈 탭 전용: 날짜를 m/dd로만 표시(연도·이동 피커는 CSS로 숨김) */
  const nav = calendarWrap.querySelector(".calendar-nav");
  if (nav) {
    const monthEl = nav.querySelector(".calendar-nav-month");
    if (monthEl) {
      const d = new Date();
      monthEl.textContent = `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
    }
  }

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
  if (events.length === 0) {
    eventList.innerHTML = '<p class="home-event-empty">이번 달에 날짜가 배정된 이벤트가 없습니다.</p>';
  } else {
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
      card.className = "home-event-time-card" + (isWeekend(dateKey) ? " is-weekend" : "");
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

  const section3 = document.createElement("div");
  section3.className = "home-view-section";
  const header3 = document.createElement("h3");
  header3.className = "home-view-section-title";
  header3.textContent = "To do list";
  section3.appendChild(header3);
  const todoListContent = document.createElement("div");
  todoListContent.className = "home-todo-list-content";
  fillTodoListContent(todoListContent);
  section3.appendChild(todoListContent);

  threeCols.appendChild(section3);
  threeCols.appendChild(section1);
  threeCols.appendChild(section2);
  el.appendChild(threeCols);

  return el;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}
