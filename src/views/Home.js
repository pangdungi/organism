/**
 * Home 페이지 - 3분할 레이아웃, 한 구역에 오늘 해치우기 캘린더
 */

import { render1DayView } from "./Calendar.js";
import { getKpiTodosAsTasks } from "../utils/kpiTodoSync.js";
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
    return (a.name || "").localeCompare(b.name || "", "ko");
  });
  return out;
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
  const sub1 = document.createElement("p");
  sub1.className = "home-view-section-subtitle";
  const today = new Date();
  sub1.textContent = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
  section1.appendChild(sub1);
  const calendarWrap = render1DayView(null);
  calendarWrap.classList.add("home-embed-1day");
  section1.appendChild(calendarWrap);

  const section2 = document.createElement("div");
  section2.className = "home-view-section home-view-section--event";
  const header2 = document.createElement("h3");
  header2.className = "home-view-section-title";
  header2.textContent = "Event";
  section2.appendChild(header2);
  const sub2 = document.createElement("p");
  sub2.className = "home-view-section-subtitle";
  const now = new Date();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  sub2.textContent = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  section2.appendChild(sub2);
  const eventList = document.createElement("div");
  eventList.className = "home-event-list home-event-cards";
  const events = getEventsForCurrentMonth();
  if (events.length === 0) {
    eventList.innerHTML = '<p class="home-event-empty">이번 달에 날짜가 배정된 이벤트가 없습니다.</p>';
  } else {
    const byDate = new Map();
    events.forEach((ev) => {
      const dateKey = (ev.dueDate || ev.startDate || "").slice(0, 10);
      if (!dateKey) return;
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey).push(ev);
    });
    const sortedDates = [...byDate.keys()].sort();
    sortedDates.forEach((dateKey) => {
      const dayEvents = byDate.get(dateKey) || [];
      const dayNum = getDayNumber(dateKey);
      const weekend = isWeekend(dateKey);
      const card = document.createElement("div");
      card.className = "home-event-card" + (weekend ? " home-event-card--weekend" : "");
      const namesHtml = dayEvents
        .map((ev) => `<div class="home-event-card-item${ev.done ? " is-done" : ""}">${escapeHtml(ev.name)}</div>`)
        .join("");
      card.innerHTML = `
        <div class="home-event-card-day">${dayNum}</div>
        <div class="home-event-card-label">할일 목록</div>
        <div class="home-event-card-list">${namesHtml}</div>
      `;
      eventList.appendChild(card);
    });
  }
  section2.appendChild(eventList);

  const section3 = document.createElement("div");
  section3.className = "home-view-section";
  const header3 = document.createElement("h3");
  header3.className = "home-view-section-title";
  header3.textContent = "To do list";
  section3.appendChild(header3);

  threeCols.appendChild(section1);
  threeCols.appendChild(section2);
  threeCols.appendChild(section3);
  el.appendChild(threeCols);

  return el;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}
