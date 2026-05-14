/**
 * Home 페이지 - 오늘 탭 레이아웃(통계·과제별 예상·타임라인·할 일)
 */

import { syncKpiTodoCompleted } from "../utils/kpiTodoSync.js";
import {
  getCustomSections,
  getTimeCategorySolidHex,
} from "../utils/todoSettings.js";
import {
  readSectionTasksObject,
  readCustomSectionTasksObject,
} from "../utils/todoSectionTasksModel.js";
import {
  persistSectionTasksAndSchedule,
  persistCustomSectionTasksAndSchedule,
} from "../utils/todoSectionTasksSupabase.js";
import {
  getTodayTimeSummary,
  getTodayLiveTimeLedgerRow,
  getTimeLedgerRowLiveStableKey,
  getTimeLedgerRowLiveElapsedMs,
  formatIntegerMinutesDurationKo,
  formatHomeLiveStartClock,
} from "./Time.js";
import { render1DayView, LP_CAL_TODO_SIDEBAR_NONE } from "./Calendar.js";
import { buildHomeTodayEventPulseModel } from "../utils/homeTodayEventPulse.js";

const KPI_SECTION_IDS = ["dream", "sideincome", "health", "happy"];
const SECTION_LABELS = {
  dream: "꿈",
  sideincome: "부수입",
  health: "건강",
  happy: "행복",
};

/** 오늘 날짜(YYYY-MM-DD) 반환 */
function getTodayDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 마감일이 오늘인 할일 수집 (꿈·부수입·건강·행복 고정 섹션 + 커스텀 리스트) */
function getTasksDueToday() {
  const today = getTodayDateKey();
  const out = [];
  try {
    const obj = readSectionTasksObject();
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
          sectionLabel: SECTION_LABELS[sectionId] || sectionId,
        });
      });
    });
  } catch (_) {}
  try {
    const obj = readCustomSectionTasksObject();
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
          sectionLabel: sec.label || sec.id,
        });
      });
    });
  } catch (_) {}
  out.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
  return out;
}

function updateHomeTaskDone(item, done) {
  if (item.isKpiTodo && item.kpiTodoId && item.storageKey) {
    syncKpiTodoCompleted(item.kpiTodoId, item.storageKey, done);
    return;
  }
  try {
    const obj = item.isCustom ? readCustomSectionTasksObject() : readSectionTasksObject();
    const arr = obj[item.sectionId];
    if (!Array.isArray(arr)) return;
    const t = arr.find((x) => (x.taskId || "") === item.taskId);
    if (t) {
      t.done = !!done;
      if (item.isCustom) persistCustomSectionTasksAndSchedule(obj);
      else persistSectionTasksAndSchedule(obj);
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

function isHomeDueOverdue(dueStr) {
  if (!dueStr || dueStr.length < 10) return false;
  const parts = String(dueStr).trim().split("-");
  if (parts.length < 3) return false;
  const due = new Date(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10),
  );
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
      const due = new Date(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10),
      );
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.round(
        (due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
      );
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

/** 할일 목록 탭과 동일 todo-card 마크업 (오늘 탭 전용) */
function createHomeTodoCard(item) {
  const card = document.createElement("div");
  card.className =
    "todo-card home-todo-flat-row" + (item.done ? " is-done" : "");

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

  const metaRow = document.createElement("div");
  metaRow.className = "todo-card-meta-row";
  metaRow.appendChild(datesEl);
  metaRow.hidden = !!datesEl.hidden;

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

/** 상단 툴바 영문 전체 날짜 */
function formatToolbarDateEn(date) {
  try {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch (_) {
    return "";
  }
}

function lpNavigateTab(tabId) {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.__lpSetTab === "function"
    ) {
      window.__lpSetTab(tabId);
    }
  } catch (_) {}
}

/** HTML 텍스트 이스케이프 (innerHTML 조합용) */
function escapeHtml(text) {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 시간 요약 문자열 "9h 35m" → 숫자만 크게 보이게 span 분리 (표시값만 사용) */
function wrapHoursDisplayForSummary(display) {
  return escapeHtml(display).replace(
    /(\d+)(h|m)/g,
    '<span class="home-time-summary-digits">$1</span><span class="home-time-summary-unit-suffix">$2</span>',
  );
}

let homeEventPulseRefreshBound = false;

function buildHomeLiveTracker() {
  const root = document.createElement("div");
  root.className = "home-live-tracker";
  root.setAttribute("hidden", "");

  const sub = document.createElement("div");
  sub.className = "home-live-tracker-subtitle";
  sub.textContent = "지금 진행 중";

  const card = document.createElement("div");
  card.className = "home-live-tracker-card";
  const cardMain = document.createElement("div");
  cardMain.className = "home-live-tracker-card-main";
  const dot = document.createElement("span");
  dot.className = "home-live-tracker-dot";
  dot.setAttribute("aria-hidden", "true");
  const textWrap = document.createElement("div");
  textWrap.className = "home-live-tracker-text";
  const taskEl = document.createElement("div");
  taskEl.className = "home-live-tracker-task";
  const metaEl = document.createElement("div");
  metaEl.className = "home-live-tracker-meta";
  textWrap.appendChild(taskEl);
  textWrap.appendChild(metaEl);
  cardMain.appendChild(dot);
  cardMain.appendChild(textWrap);
  const clockEl = document.createElement("div");
  clockEl.className = "home-live-tracker-clock";
  clockEl.setAttribute("aria-live", "polite");
  card.appendChild(cardMain);
  card.appendChild(clockEl);

  root.appendChild(sub);
  root.appendChild(card);
  return root;
}

function clearHomeLiveTrackerTimer(root) {
  if (!root?._lpHomeTrackerInterval) return;
  clearInterval(root._lpHomeTrackerInterval);
  root._lpHomeTrackerInterval = null;
}

function refreshHomeLiveTrackerEl(root) {
  if (!root) return;
  clearHomeLiveTrackerTimer(root);
  const row = getTodayLiveTimeLedgerRow();
  if (!row) {
    root.setAttribute("hidden", "");
    return;
  }
  root.removeAttribute("hidden");

  const task = (row.taskName || "").trim() || "(과제명 없음)";
  const startClock = formatHomeLiveStartClock(row);
  const stableKey = getTimeLedgerRowLiveStableKey(row);

  const taskEl = root.querySelector(".home-live-tracker-task");
  const metaEl = root.querySelector(".home-live-tracker-meta");
  const clockEl = root.querySelector(".home-live-tracker-clock");
  const dotEl = root.querySelector(".home-live-tracker-dot");
  if (taskEl) {
    taskEl.textContent = task;
    taskEl.style.removeProperty("color");
  }
  if (dotEl) {
    dotEl.style.removeProperty("background");
    dotEl.style.removeProperty("box-shadow");
  }
  if (clockEl) clockEl.style.removeProperty("color");

  const tick = () => {
    if (!root.isConnected) {
      clearHomeLiveTrackerTimer(root);
      return;
    }
    const r = getTodayLiveTimeLedgerRow();
    if (!r || getTimeLedgerRowLiveStableKey(r) !== stableKey) {
      refreshHomeLiveTrackerEl(root);
      return;
    }
    const ms = getTimeLedgerRowLiveElapsedMs(r);
    if (metaEl) metaEl.textContent = startClock ? `시작 ${startClock}` : "";
    if (clockEl)
      clockEl.textContent = formatIntegerMinutesDurationKo(Math.floor(ms / 60000));
  };
  tick();
  root._lpHomeTrackerInterval = setInterval(tick, 1000);
}

function bindHomeEventPulseRefreshOnce() {
  if (homeEventPulseRefreshBound) return;
  homeEventPulseRefreshBound = true;
  const refreshPulse = () => {
    document.querySelectorAll(".home-event-pulse-body").forEach((node) => {
      if (node.isConnected) fillHomeEventPulseContent(node);
    });
  };
  const refreshTracker = () => {
    document.querySelectorAll(".home-live-tracker").forEach((node) => {
      if (node.isConnected) refreshHomeLiveTrackerEl(node);
    });
  };
  const refresh = () => {
    refreshPulse();
    refreshTracker();
  };
  document.addEventListener("calendar-time-rows-updated", refresh);
  document.addEventListener("calendar-budget-scheduled-updated", refreshPulse);
}

/** 막대 좌·우 계획/실제 분: 60분 미만 「Nm」(기존), 이상 「h시간 m분」 */
function formatHomeEventBarMinutes(minutes) {
  const n = Math.max(0, Math.round(Number(minutes) || 0));
  if (n < 60) return `${n}m`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${h}시간 ${m}분`;
}

/** 우측 차이(절댓값): 60분 미만 「N 분」, 이상 「h시간 m분」 */
function formatHomeEventDiffAbsMinutes(minutes) {
  const n = Math.max(0, Math.round(Number(minutes) || 0));
  if (n < 60) return `${n} 분`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${h}시간 ${m}분`;
}

function formatTaskDiffLabel(variant, diffMins) {
  const n = Math.abs(Math.round(Number(diffMins) || 0));
  if (variant === "over") return `+${formatHomeEventDiffAbsMinutes(n)}`;
  if (variant === "under") return `-${formatHomeEventDiffAbsMinutes(n)}`;
  return "±0 분";
}

function applyBarTagGoalAlign(el, pct) {
  const n = Number(pct) || 0;
  el.classList.remove(
    "home-event-task-bar-tag--pin-start",
    "home-event-task-bar-tag--pin-end",
  );
  if (n <= 0) {
    el.classList.add("home-event-task-bar-tag--pin-start");
    el.style.left = "0";
  } else {
    el.classList.add("home-event-task-bar-tag--pin-end");
    el.style.left = `${Math.min(100, n)}%`;
  }
}

function applyBarTagActualAlign(el, pct) {
  const n = Number(pct) || 0;
  el.classList.remove(
    "home-event-task-bar-tag--pin-start",
    "home-event-task-bar-tag--pin-end",
  );
  if (n <= 0) {
    el.classList.add("home-event-task-bar-tag--pin-start");
    el.style.left = "0";
  } else {
    el.classList.add("home-event-task-bar-tag--pin-end");
    el.style.left = `${Math.min(100, n)}%`;
  }
}

function fillHomeEventPulseContent(container) {
  container.replaceChildren();
  const todayKey = getTodayDateKey();
  const { taskRows } = buildHomeTodayEventPulseModel(todayKey);

  const card = document.createElement("div");
  card.className = "home-event-pulse-card";

  if (taskRows.length > 0) {
    const list = document.createElement("div");
    list.className = "home-event-task-list";

    taskRows.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = `home-event-task-row home-event-task-row--${row.variant}`;

      const prodAccent = getTimeCategorySolidHex(row.prod);

      const labelCell = document.createElement("div");
      labelCell.className = "home-event-task-label";
      const sw = document.createElement("span");
      sw.className = "home-event-task-swatch";
      sw.style.background = prodAccent;
      const name = document.createElement("span");
      name.className = "home-event-task-name";
      name.textContent = row.taskName;
      labelCell.appendChild(sw);
      labelCell.appendChild(name);

      const bottom = document.createElement("div");
      bottom.className = "home-event-task-bottom";
      /* 막대는 행마다 같은 남은 폭을 쓰고, 차이 텍스트만 좁은 고정폭 → 막대-숫자 사이 빈칸 최소화 */
      bottom.style.display = "flex";
      bottom.style.flexDirection = "row";
      bottom.style.alignItems = "center";
      bottom.style.setProperty("column-gap", "0.06rem", "important");
      bottom.style.width = "100%";

      const barShell = document.createElement("div");
      barShell.className = "home-event-task-bar-shell";
      barShell.style.flex = "1 1 0";
      barShell.style.minWidth = "0";

      const wrap = document.createElement("div");
      wrap.className = "home-event-task-bar-wrap";

      const tagPl = document.createElement("span");
      tagPl.className =
        "home-event-task-bar-tag home-event-task-bar-tag--planned";
      applyBarTagGoalAlign(tagPl, row.plannedPct);
      tagPl.textContent = formatHomeEventBarMinutes(row.planned);

      const bars = document.createElement("div");
      bars.className = "home-event-task-bars";
      const track = document.createElement("div");
      track.className =
        "home-event-task-bar-track home-event-task-bar-track--combined";
      const goal = document.createElement("div");
      goal.className = "home-event-task-bar-goal";
      goal.style.width = `${row.plannedPct}%`;
      const flAc = document.createElement("div");
      flAc.className = "home-event-task-bar-fill home-event-task-bar-fill--actual";
      flAc.style.width = `${row.actualPct}%`;
      flAc.style.setProperty("background", prodAccent, "important");
      track.appendChild(goal);
      track.appendChild(flAc);
      bars.appendChild(track);

      const tagAc = document.createElement("span");
      tagAc.className = "home-event-task-bar-tag home-event-task-bar-tag--actual";
      applyBarTagActualAlign(tagAc, row.actualPct);
      tagAc.textContent = formatHomeEventBarMinutes(row.actual);
      tagAc.style.color = prodAccent;

      wrap.appendChild(tagPl);
      wrap.appendChild(bars);
      wrap.appendChild(tagAc);
      barShell.appendChild(wrap);

      const diff = document.createElement("div");
      diff.className = "home-event-task-diff";
      diff.style.color = prodAccent;
      diff.style.flex = "0 0 7.75rem";
      diff.style.textAlign = "right";
      diff.textContent = formatTaskDiffLabel(row.variant, row.diff);

      bottom.appendChild(barShell);
      bottom.appendChild(diff);

      rowEl.appendChild(labelCell);
      rowEl.appendChild(bottom);
      list.appendChild(rowEl);
    });
    card.appendChild(list);
  } else {
    const empty = document.createElement("p");
    empty.className = "home-event-pulse-empty";
    empty.textContent =
      "오늘 타임라인에 예상 시간이 잡힌 과제가 없습니다.";
    card.appendChild(empty);
  }

  container.appendChild(card);
}

function buildHomeToolbar(dateBasis) {
  const toolbar = document.createElement("header");
  toolbar.className = "home-view-toolbar";

  const start = document.createElement("div");
  start.className = "home-view-toolbar-start";

  const ctx = document.createElement("span");
  ctx.className = "home-view-toolbar-context";
  ctx.textContent = "오늘";

  const sep = document.createElement("span");
  sep.className = "home-view-toolbar-sep";
  sep.setAttribute("aria-hidden", "true");

  const dateEn = document.createElement("span");
  dateEn.className = "home-view-toolbar-date";
  dateEn.textContent = formatToolbarDateEn(dateBasis);

  start.appendChild(ctx);
  start.appendChild(sep);
  start.appendChild(dateEn);

  const end = document.createElement("div");
  end.className = "home-view-toolbar-end";

  const btnTime = document.createElement("button");
  btnTime.type = "button";
  btnTime.className = "home-view-toolbar-btn home-view-toolbar-btn--pill";
  btnTime.textContent = "시간 기록 +";

  btnTime.addEventListener("click", () => lpNavigateTab("time"));

  end.appendChild(btnTime);

  toolbar.appendChild(start);
  toolbar.appendChild(end);

  return toolbar;
}

function buildHomeTimeSummaryGridInnerHtml(timeSummary) {
  const trackedBarPct = Math.round(Number(timeSummary.trackedPctOfGoal) || 0);
  const productiveBarPct = Math.round(
    Number(timeSummary.productivePctOfAvailable) || 0,
  );
  return `
    <div class="home-time-summary-cell home-time-summary-cell--tracked">
      <span class="home-time-summary-label">총 기록</span>
      <div class="home-time-summary-cell-body">
        <span class="home-time-summary-value home-time-summary-value--duration">${wrapHoursDisplayForSummary(timeSummary.trackedDisplay)}</span>
        <div class="home-time-summary-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${trackedBarPct}" aria-label="총 기록 목표 대비">
          <span class="home-time-summary-bar-fill home-time-summary-bar-fill--tracked" style="width:${trackedBarPct}%"></span>
        </div>
        <div class="home-time-summary-metric-row">
          <span class="home-time-summary-metric-caption home-time-summary-metric-caption--footer">목표 ${escapeHtml(timeSummary.totalRecordGoalDisplay)}</span>
          <span class="home-time-summary-pill home-time-summary-pill--tracked">${escapeHtml(timeSummary.trackedGoalPercentLabel)}</span>
        </div>
      </div>
    </div>
    <div class="home-time-summary-cell home-time-summary-cell--productive">
      <span class="home-time-summary-label" title="생산적 시간">생산적</span>
      <div class="home-time-summary-cell-body">
        <span class="home-time-summary-value home-time-summary-value--duration">${wrapHoursDisplayForSummary(timeSummary.productiveDisplay)}</span>
        <div class="home-time-summary-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${productiveBarPct}" aria-label="가용 시간 대비 생산적 기록">
          <span class="home-time-summary-bar-fill home-time-summary-bar-fill--productive" style="width:${productiveBarPct}%"></span>
        </div>
        <div class="home-time-summary-metric-row">
          <span class="home-time-summary-metric-caption home-time-summary-metric-caption--footer" title="가용 시간(24h − 근무 − 수면) 대비 생산적 기록 비율">${escapeHtml(timeSummary.productiveContextDisplay)}</span>
          <span class="home-time-summary-pill home-time-summary-pill--productive">${escapeHtml(timeSummary.productiveOfAvailablePercentLabel)}</span>
        </div>
      </div>
    </div>
    <div class="home-time-summary-cell home-time-summary-cell--money home-time-summary-cell--invested">
      <span class="home-time-summary-label">투자</span>
      <div class="home-time-summary-cell-body home-time-summary-cell-body--money">
        <span class="home-time-summary-value home-time-summary-value--invested"><span class="home-time-summary-digits home-time-summary-digits--money">${escapeHtml(timeSummary.priceDisplay)}</span><span class="home-time-summary-unit">원</span></span>
        <span class="home-time-summary-metric-caption home-time-summary-metric-caption--invested">투자한 시간의 가치</span>
      </div>
    </div>
    <div class="home-time-summary-cell home-time-summary-cell--money home-time-summary-cell--waste">
      <span class="home-time-summary-label">낭비</span>
      <div class="home-time-summary-cell-body home-time-summary-cell-body--money">
        <span class="home-time-summary-value home-time-summary-value--spent"><span class="home-time-summary-digits home-time-summary-digits--money">${escapeHtml(timeSummary.wastedDisplay)}</span><span class="home-time-summary-unit">원</span></span>
        <span class="home-time-summary-metric-caption home-time-summary-metric-caption--waste">낭비한 시간의 가치</span>
      </div>
    </div>
  `;
}

/** 서버 pull 직후: 오늘 탭 통째 renderMain 없이 통계·할일·타임라인만 맞춤 */
function refreshHomeAfterPullFromServer() {
  const root =
    document.querySelector(".app-tab-panel-content.home-view") ||
    document.querySelector(".home-view");
  if (!root?.isConnected) return;
  const grid = root.querySelector(".home-time-summary-grid");
  if (grid) {
    grid.innerHTML = buildHomeTimeSummaryGridInnerHtml(getTodayTimeSummary());
  }
  root.querySelectorAll(".home-todo-list-content").forEach((n) => {
    fillTodoListContent(n);
  });
  root.querySelectorAll(".home-event-pulse-body").forEach((n) => {
    fillHomeEventPulseContent(n);
  });
  document.querySelectorAll(".home-live-tracker").forEach((n) => {
    refreshHomeLiveTrackerEl(n);
  });
  const cal = root.querySelector(
    ".home-1day-timeline-mount .calendar-1day-view",
  );
  try {
    if (cal && typeof cal._lpRefreshCalendarView === "function") {
      cal._lpRefreshCalendarView();
    }
  } catch (_) {}
}

function appendHomeMainBelowToolbar(el) {
  const timeSummary = getTodayTimeSummary();
  const summarySection = document.createElement("section");
  summarySection.className = "home-time-summary-section";
  summarySection.setAttribute("aria-label", "오늘 통계");

  const summaryHeading = document.createElement("h3");
  summaryHeading.className = "home-time-summary-heading";
  summaryHeading.textContent = "통계";

  const summaryGrid = document.createElement("div");
  summaryGrid.className = "home-time-summary-grid";
  summaryGrid.innerHTML = buildHomeTimeSummaryGridInnerHtml(timeSummary);

  summarySection.appendChild(summaryHeading);
  summarySection.appendChild(summaryGrid);

  const threeCols = document.createElement("div");
  threeCols.className = "home-view-three home-view-three--no-calendar";

  const leftCol = document.createElement("div");
  leftCol.className = "home-view-left-col";
  const liveTracker = buildHomeLiveTracker();
  leftCol.appendChild(liveTracker);
  refreshHomeLiveTrackerEl(liveTracker);
  leftCol.appendChild(summarySection);

  const section2 = document.createElement("div");
  section2.className = "home-view-section home-view-section--event";

  const eventHalf = document.createElement("div");
  eventHalf.className = "home-event-half";
  const usageSection = document.createElement("div");
  usageSection.className = "home-time-usage-section";

  const header2 = document.createElement("h3");
  header2.className = "home-time-summary-heading home-time-usage-heading";
  header2.textContent = "과제별 예상 대비 실제";

  const usageCard = document.createElement("div");
  usageCard.className = "home-time-usage-card";
  const eventList = document.createElement("div");
  eventList.className = "home-event-list home-event-pulse-body";
  fillHomeEventPulseContent(eventList);
  usageCard.appendChild(eventList);

  usageSection.appendChild(header2);
  usageSection.appendChild(usageCard);
  eventHalf.appendChild(usageSection);

  const eventReminderStack = document.createElement("div");
  eventReminderStack.className = "home-event-reminder-stack";
  eventReminderStack.appendChild(eventHalf);
  section2.appendChild(eventReminderStack);

  /* 예상시간/실제 타임테이블(1일 뷰): 데스크탑(64rem↑) [시간사용|타임라인]; 64rem↓ CSS Grid로 타임라인→시간사용 */
  const timelineSection = document.createElement("div");
  timelineSection.className = "home-1day-timeline-section home-embed-1day";
  const timelineTitle = document.createElement("h3");
  timelineTitle.className = "home-view-section-title";
  timelineTitle.textContent = "타임라인";
  timelineSection.appendChild(timelineTitle);
  const timelineMount = document.createElement("div");
  timelineMount.className = "home-1day-timeline-mount";
  timelineMount.appendChild(
    render1DayView(null, LP_CAL_TODO_SIDEBAR_NONE, null, true),
  );
  timelineSection.appendChild(timelineMount);
  section2.appendChild(timelineSection);

  const section3 = document.createElement("div");
  section3.className = "home-view-section home-view-section--todo";
  const header3 = document.createElement("h3");
  header3.className = "home-view-section-title";
  header3.textContent = "TODAY'S TO-DO";
  section3.appendChild(header3);
  const todoListContent = document.createElement("div");
  todoListContent.className = "home-todo-list-content";
  fillTodoListContent(todoListContent);
  section3.appendChild(todoListContent);

  leftCol.appendChild(section3);
  threeCols.appendChild(leftCol);
  threeCols.appendChild(section2);
  el.appendChild(threeCols);
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content home-view";

  const today = new Date();
  el.appendChild(buildHomeToolbar(today));
  appendHomeMainBelowToolbar(el);
  bindHomeEventPulseRefreshOnce();

  window.__lpHomeAfterPullRefresh = refreshHomeAfterPullFromServer;

  return el;
}
