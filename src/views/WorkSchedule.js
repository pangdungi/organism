/**
 * 근무표 - 근무 일정 관리
 * 근무시간, 근무유형, 근무일, 시간(근무표), 메모
 */
import { renderMonthlyContent, setWorkScheduleMonthlyViewCursor } from "./WorkScheduleMonthly.js";
import { supabase } from "../supabase.js";
import { hydrateWorkScheduleFromCloud } from "../utils/workScheduleSupabase.js";
import { workScheduleDiagLog } from "../utils/workScheduleDiag.js";
import { applyWorkScheduleRowTimesFromTypes, normalizeWorkDateKey } from "../utils/workScheduleEntryResolve.js";
import { confirmDeleteRow } from "../utils/confirmModal.js";
import {
  readWorkScheduleRowsFromMem,
  writeWorkScheduleRowsToMem,
  readWorkScheduleTypeOptionsRawFromMem,
  writeWorkScheduleTypeOptionsRawToMem,
  readWorkScheduleDailyHoursFromMem,
  writeWorkScheduleDailyHoursToMem,
} from "../utils/workScheduleModel.js";

/** 모바일 근무 행 추가 FAB — 시간가계부 과제 기록 FAB와 동일 아이콘 */
const WORK_SCHEDULE_MOBILE_FAB_SVG =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 8v8"/><path d="m8 12h8"/><path d="m18 22h-12c-2.209 0-4-1.791-4-4v-12c0-2.209 1.791-4 4-4h12c2.209 0 4 1.791 4 4v12c0 2.209-1.791 4-4 4z"/></g></svg>';

function wsUiLog(...args) {
  workScheduleDiagLog("[ui]", ...args);
}

let _workScheduleHydrateGeneration = 0;

/**
 * renderMain·__lpRenderMain 으로 근무표 DOM이 다시 그려질 때 서브탭이 항상 1번(근무표 목록)으로 초기화되는 것을 막기 위해 저장.
 * (할일 동기화 등이 백그라운드에서 전체 탭을 다시 그릴 때 동일)
 */
const SESSION_WORK_SCHEDULE_SUBVIEW_KEY = "lp-work-schedule-subview";

function readSavedWorkScheduleSubview() {
  try {
    if (typeof sessionStorage === "undefined") return "all";
    const v = sessionStorage.getItem(SESSION_WORK_SCHEDULE_SUBVIEW_KEY);
    if (v === "monthly" || v === "all") return v;
  } catch (_) {}
  return "all";
}

function persistWorkScheduleSubview(view) {
  try {
    if (typeof sessionStorage !== "undefined" && (view === "monthly" || view === "all")) {
      sessionStorage.setItem(SESSION_WORK_SCHEDULE_SUBVIEW_KEY, view);
    }
  } catch (_) {}
}

const ENTRY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function notifyWorkScheduleSaved() {
  try {
    window.dispatchEvent(new CustomEvent("work-schedule-saved"));
  } catch (_) {}
}

/** 로컬 Date → YYYY-MM-DD (월별 캘린더와 동일 규칙) */
function formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 월 라벨 클릭 시 기본 근무일: 보는 달이 이번 달이면 오늘, 아니면 그 달 1일 */
function defaultDateKeyForCalendarMonth(year, monthIndex0) {
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() === monthIndex0) {
    return formatLocalYmd(now);
  }
  const m = String(monthIndex0 + 1).padStart(2, "0");
  return `${year}-${m}-01`;
}

/** 기본 근무유형 순서: 연차 → 휴가 → 정규근무 (연차·휴가는 00:00-00:00, 수정 불가) */
const DEFAULT_WORK_TYPE_OPTIONS = [
  { name: "연차", start: "00:00", end: "00:00" },
  { name: "휴가", start: "00:00", end: "00:00" },
  { name: "정규근무", start: "", end: "" },
];
/** 수정·삭제 불가 (UI에서 시작/마감 입력 없음, 삭제 버튼 없음) */
const READONLY_WORK_TYPES = ["연차", "휴가"];
const CALC_PROTECTED_WORK_TYPES = [];
const PROTECTED_WORK_TYPES = READONLY_WORK_TYPES;
const WORK_TYPE_DISPLAY_ORDER = DEFAULT_WORK_TYPE_OPTIONS.map((o) => o.name);

const DELETE_ICON =
  '<svg class="time-task-delete-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

function normalizeTypeEntry(o) {
  if (typeof o === "string") return { name: (o || "").trim(), start: "", end: "" };
  return {
    name: (o.name || "").trim(),
    start: (o.start != null ? String(o.start) : "").trim(),
    end: (o.end != null ? String(o.end) : "").trim(),
  };
}

const ALLOWED_WORK_TYPE_NAMES = new Set(DEFAULT_WORK_TYPE_OPTIONS.map((o) => o.name));

function getWorkTypeOptionsFull() {
  const defaultFull = DEFAULT_WORK_TYPE_OPTIONS.map((o) => ({ name: o.name, start: o.start || "", end: o.end || "" }));
  try {
    const arr = readWorkScheduleTypeOptionsRawFromMem();
    if (Array.isArray(arr) && arr.length > 0) {
      const normalized = arr.map(normalizeTypeEntry).filter((o) => o.name);
      const seen = new Set();
      const merged = [];
      for (const d of defaultFull) {
        const fromStorage = normalized.find((o) => o.name === d.name);
        merged.push(fromStorage ? { name: d.name, start: fromStorage.start || d.start, end: fromStorage.end || d.end } : d);
        seen.add(d.name);
      }
      for (const o of normalized) {
        if (seen.has(o.name)) continue;
        merged.push({ name: o.name, start: o.start || "", end: o.end || "" });
        seen.add(o.name);
      }
      merged.sort((a, b) => {
        const i = WORK_TYPE_DISPLAY_ORDER.indexOf(a.name);
        const j = WORK_TYPE_DISPLAY_ORDER.indexOf(b.name);
        if (i < 0 && j < 0) return 0;
        if (i < 0) return 1;
        if (j < 0) return -1;
        return i - j;
      });
      return merged;
    }
  } catch (_) {}
  return defaultFull;
}

function getWorkTypeOptions() {
  return getWorkTypeOptionsFull().map((o) => o.name);
}

function addWorkTypeOption(name, start, end) {
  const full = getWorkTypeOptionsFull();
  const trimmed = (name || "").trim();
  if (!trimmed) return full;
  if (full.some((o) => o.name === trimmed)) return full;
  const newEntry = { name: trimmed, start: (start != null ? String(start) : "").trim(), end: (end != null ? String(end) : "").trim() };
  full.unshift(newEntry);
  writeWorkScheduleTypeOptionsRawToMem(full);
  notifyWorkScheduleSaved();
  return full;
}

function updateWorkTypeOption(name, start, end) {
  if (READONLY_WORK_TYPES.includes(name)) return getWorkTypeOptionsFull();
  const full = getWorkTypeOptionsFull();
  const idx = full.findIndex((o) => o.name === name);
  if (idx < 0) return full;
  full[idx] = { name, start: (start != null ? String(start) : "").trim(), end: (end != null ? String(end) : "").trim() };
  writeWorkScheduleTypeOptionsRawToMem(full);
  notifyWorkScheduleSaved();
  return full;
}

function removeWorkTypeOption(name) {
  if (PROTECTED_WORK_TYPES.includes(name)) return getWorkTypeOptionsFull();
  const full = getWorkTypeOptionsFull().filter((o) => o.name !== name);
  writeWorkScheduleTypeOptionsRawToMem(full);
  notifyWorkScheduleSaved();
  return full;
}

function loadRows() {
  return readWorkScheduleRowsFromMem();
}

function saveRows(rows) {
  const withIds = writeWorkScheduleRowsToMem(rows);
  notifyWorkScheduleSaved();
  return withIds;
}

function rowHasPersistableContent(r) {
  return !!(
    (r.startTime || "").trim() ||
    (r.endTime || "").trim() ||
    (r.workType || "").trim() ||
    (r.hoursWorked || "").trim() ||
    (r.workDate || "").trim() ||
    (r.hours || "").trim() ||
    (r.memo || "").trim()
  );
}

/** saveRows로 보정된 id를 DOM 행에 반영 (다음 저장 시 중복 id 방지) */
function syncEntryIdsAfterSave(tableWrap, rowsWithIds) {
  if (!tableWrap || !rowsWithIds?.length) return;
  let i = 0;
  tableWrap.querySelectorAll(".work-schedule-row").forEach((tr) => {
    const r = collectRowFromTr(tr);
    if (!rowHasPersistableContent(r)) return;
    const id = rowsWithIds[i++]?.id;
    if (id && ENTRY_ID_RE.test(String(id))) tr.dataset.entryId = String(id);
  });
}

function getDailyHours() {
  const mem = readWorkScheduleDailyHoursFromMem();
  if (mem != null && !Number.isNaN(mem) && mem >= 0) return mem;
  return 8.5;
}

function setDailyHours(val) {
  const n = parseFloat(val);
  if (Number.isNaN(n) || n < 0) return;
  writeWorkScheduleDailyHoursToMem(n);
  notifyWorkScheduleSaved();
}


/** 시간적립 표시 문구: Hours - 하루근무시간 → "+ N시간" / "- N시간" */
function formatTimeAccumulation(diff) {
  if (diff == null || Number.isNaN(diff)) return "";
  if (Math.abs(diff) < 0.01) return "0";
  const abs = Math.abs(diff);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  const str = m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  if (diff > 0) return `+ ${str}`;
  return `- ${str}`;
}

/** "09:00" 또는 "2026-03-13 09:00" 형태에서 시각(0~24) 추출. 날짜의 2026 등이 시간으로 잡히지 않도록 HH:MM 패턴만 사용 */
function parseTimeToHours(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim();
  const withColon = s.match(/(\d{1,2}):(\d{2})\s*$/);
  if (withColon) {
    const h = parseInt(withColon[1], 10) || 0;
    const m = parseInt(withColon[2], 10) || 0;
    if (h >= 0 && h <= 24 && m >= 0 && m < 60) return h + m / 60;
  }
  const timeOnly = s.match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnly) {
    const h = parseInt(timeOnly[1], 10) || 0;
    const m = parseInt(timeOnly[2], 10) || 0;
    if (h >= 0 && h <= 24 && m >= 0 && m < 60) return h + m / 60;
  }
  return null;
}

/** "09:00~18:00" 형태에서 [시작, 마감] 파싱. 하위 호환용 */
function parseNameToStartEnd(name) {
  if (!name || typeof name !== "string") return { startTime: "", endTime: "" };
  const parts = name.trim().split("~");
  const start = (parts[0] || "").trim();
  const end = (parts[1] || "").trim();
  return { startTime: start, endTime: end };
}

/** 저장된 행에서 시작/마감 추출 (name "09:00~18:00" 하위 호환) */
function normalizeRowStartEnd(row) {
  if (row.startTime != null && row.endTime != null && row.startTime !== "" && row.endTime !== "") {
    return { ...row, startTime: String(row.startTime).trim(), endTime: String(row.endTime).trim() };
  }
  const { startTime, endTime } = parseNameToStartEnd(row.name || "");
  return { ...row, startTime, endTime };
}

/** 근무일·시작시간 기준 오름차순(날짜 필터와 동일 — 오래된 날이 위) */
function compareWorkScheduleRowsByDateTimeAsc(a, b) {
  const da = normalizeWorkDateKey(a?.workDate || "");
  const db = normalizeWorkDateKey(b?.workDate || "");
  const aOk = da.length >= 10;
  const bOk = db.length >= 10;
  if (aOk && bOk && da !== db) return da.localeCompare(db);
  if (aOk && !bOk) return -1;
  if (!aOk && bOk) return 1;
  const sa = String(a?.startTime || "").trim();
  const sb = String(b?.startTime || "").trim();
  if (sa !== sb) return sa.localeCompare(sb);
  return String(a?.endTime || "").localeCompare(String(b?.endTime || ""));
}

/** 근무표 초기 행: 저장된 데이터만(시간가계부 근무하기 자동 반영 없음) */
function getMergedInitialRows() {
  const saved = loadRows().map(normalizeRowStartEnd);
  const merged = applyWorkScheduleRowTimesFromTypes(saved);
  merged.sort(compareWorkScheduleRowsByDateTimeAsc);
  return merged;
}

function getHoursSum(tableEl) {
  let sum = 0;
  tableEl?.querySelectorAll(".work-schedule-input-hours").forEach((input) => {
    const tr = input.closest?.(".work-schedule-row");
    if (tr && tr.style.display === "none") return;
    const v = parseFloat(input?.value);
    if (!Number.isNaN(v)) sum += v;
  });
  return sum;
}

/** 시작/마감 문자열(HH:MM)으로 근무 시간(hours) 계산 */
function durationFromStartEnd(startStr, endStr) {
  const startH = parseTimeToHours(startStr);
  const endH = parseTimeToHours(endStr);
  if (startH == null || endH == null) return null;
  return endH > startH ? endH - startH : 24 - startH + endH;
}

function collectRowFromTr(tr) {
  const hoursInput = tr.querySelector(".work-schedule-input-hours");
  const hoursWorkedInput = tr.querySelector(".work-schedule-input-hours-worked");
  const typeInput = tr.querySelector(".work-schedule-input-type");
  const dateInput = tr.querySelector(".work-schedule-input-date");
  const memoInput = tr.querySelector(".work-schedule-input-memo");
  const startTimeInput = tr.querySelector(".work-schedule-input-start-time");
  const endTimeInput = tr.querySelector(".work-schedule-input-end-time");
  const startTime = (startTimeInput?.value || "").trim();
  const endTime = (endTimeInput?.value || "").trim();
  let hoursWorked = (hoursWorkedInput?.value || "").trim();
  if (startTime && endTime) {
    const d = durationFromStartEnd(startTime, endTime);
    if (d != null && d > 0) hoursWorked = String(Math.round(d * 100) / 100);
  }
  const idRaw = (tr.dataset.entryId || "").trim();
  return {
    ...(idRaw && ENTRY_ID_RE.test(idRaw) ? { id: idRaw } : {}),
    startTime,
    endTime,
    workType: typeInput?.value || "",
    hoursWorked,
    workDate: dateInput?.value || "",
    hours: hoursInput?.value || "",
    memo: memoInput?.value || "",
  };
}

function collectRowsFromDOM(tableEl) {
  const rows = [];
  tableEl?.querySelectorAll(".work-schedule-row").forEach((tr) => {
    rows.push(collectRowFromTr(tr));
  });
  return rows;
}

function getRowsToSave(tableEl) {
  return collectRowsFromDOM(tableEl).filter((r) => rowHasPersistableContent(r));
}

/** 근무유형 입력: Create/삭제 가능. 유형 선택 시 onTypeSelect로 해당 유형의 기본 시작·마감을 행에 반영 */
function createWorkTypeInput(initialValue, onUpdate, onTypeSelect) {
  const wrap = document.createElement("div");
  wrap.className = "time-task-name-wrap work-schedule-type-wrap";

  const inputWrap = document.createElement("div");
  inputWrap.className = "time-task-input-wrap";

  const display = document.createElement("span");
  display.className = "work-schedule-type-display";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "time-input-task work-schedule-input-type";
  input.placeholder = "선택";
  if (initialValue) input.value = initialValue;

  function updateDisplay() {
    const val = (input.value || "").trim();
    display.textContent = val || "선택";
    display.className = "work-schedule-type-display" + (val ? " is-default" : " is-placeholder");
  }

  function showInput() {
    wrap.classList.add("is-editing");
    wrap.classList.remove("has-value");
  }

  function showDisplay() {
    updateDisplay();
    if ((input.value || "").trim()) {
      wrap.classList.remove("is-editing");
      wrap.classList.add("has-value");
    } else {
      wrap.classList.remove("is-editing");
      wrap.classList.remove("has-value");
    }
  }

  display.addEventListener("click", () => {
    showInput();
    input.focus();
    renderPanel("");
  });

  input.addEventListener("focus", () => {
    showInput();
    renderPanel("");
  });
  input.addEventListener("blur", () => {
    showDisplay();
    onUpdate?.();
    setTimeout(closePanel, 150);
  });
  input.addEventListener("input", () => {
    if (wrap.classList.contains("is-editing")) renderPanel(input.value);
  });

  inputWrap.appendChild(display);
  inputWrap.appendChild(input);
  showDisplay();

  const panel = document.createElement("div");
  panel.className = "time-task-name-panel work-schedule-type-panel";
  panel.hidden = true;

  let highlightedIndex = -1;

  function updatePanelPosition() {
    const rect = input.getBoundingClientRect();
    const pad = 8;
    const maxView = window.innerWidth - pad * 2;
    const widthPx = Math.min(Math.max(rect.width, 120), maxView);
    let left = rect.left;
    if (left + widthPx > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - pad - widthPx);
    if (left < pad) left = pad;
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${left}px`;
    panel.style.width = `${widthPx}px`;
    panel.style.maxWidth = `${maxView}px`;
    panel.style.minWidth = "0";
    panel.style.boxSizing = "border-box";
  }

  function renderPanel(query) {
    const q = (query || "").trim().toLowerCase();
    const all = getWorkTypeOptions();
    const matches = q ? all.filter((o) => o.toLowerCase().includes(q)) : all;
    const exactMatch = q && matches.some((o) => o.toLowerCase() === q);
    const showCreate = q && !exactMatch;

    panel.innerHTML = "";
    highlightedIndex = -1;

    if (matches.length === 0 && !showCreate) {
      panel.hidden = true;
      return;
    }

    const sep = document.createElement("div");
    sep.className = "time-task-name-separator";
    sep.textContent = "—";
    panel.appendChild(sep);

    matches.forEach((opt) => {
      const isProtected = PROTECTED_WORK_TYPES.includes(opt);
      const tagClass = "";
      const row = document.createElement("div");
      row.className = "time-task-name-option" + (isProtected ? " work-schedule-type-protected" : "");
      row.innerHTML = `<span class="time-task-tag ${tagClass}">${opt}</span>`;
      row.dataset.value = opt;
      row.addEventListener("click", () => {
        input.value = opt;
        showDisplay();
        panel.hidden = true;
        input.blur();
        onTypeSelect?.(opt);
        onUpdate?.();
      });
      panel.appendChild(row);
    });

    if (showCreate) {
      const createRow = document.createElement("div");
      createRow.className = "time-task-name-option time-task-name-create";
      createRow.innerHTML = `<span class="time-task-create-label">Create</span><span class="time-task-tag">${(query || "").trim()}</span>`;
      createRow.dataset.value = (query || "").trim();
      createRow.dataset.isCreate = "true";
      createRow.addEventListener("click", () => {
        const val = (query || "").trim();
        addWorkTypeOption(val);
        input.value = val;
        showDisplay();
        panel.hidden = true;
        input.blur();
        onTypeSelect?.(val);
        onUpdate?.();
      });
      panel.appendChild(createRow);
    }

    highlightedIndex = -1;
    updatePanelPosition();
    panel.hidden = false;
  }

  function closePanel() {
    panel.hidden = true;
    highlightedIndex = -1;
  }

  input.addEventListener("keydown", (e) => {
    if (panel.hidden) {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        input.blur();
      }
      return;
    }
    const opts = panel.querySelectorAll(".time-task-name-option");
    if (opts.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, opts.length - 1);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) => o.classList.toggle("is-highlighted", i === highlightedIndex));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) => o.classList.toggle("is-highlighted", i === highlightedIndex));
      return;
    }
    if (e.key === "Enter") {
      if (e.isComposing) return;
      e.preventDefault();
      const sel = opts[highlightedIndex >= 0 ? highlightedIndex : 0];
      if (sel) {
        const val = sel.dataset.value;
        if (sel.dataset.isCreate === "true") addWorkTypeOption(val);
        input.value = val;
        showDisplay();
        closePanel();
        input.blur();
        onTypeSelect?.(val);
        onUpdate?.();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closePanel();
    }
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) closePanel();
  });

  wrap.appendChild(inputWrap);
  wrap.appendChild(panel);

  const scrollResizeHandler = () => {
    if (!panel.hidden) updatePanelPosition();
  };
  window.addEventListener("scroll", scrollResizeHandler, true);
  window.addEventListener("resize", scrollResizeHandler);

  return { wrap, input };
}

function createRow(initialData = {}, onUpdate, viewEl, onFilterApply, getDailyHours, isMobile = false, rowOpts = {}) {
  const deferNotify = !!rowOpts.deferNotify;
  const tr = document.createElement("tr");
  tr.className = "work-schedule-row";
  const initialId = initialData.id != null ? String(initialData.id).trim() : "";
  const rowId = initialId && ENTRY_ID_RE.test(initialId) ? initialId : crypto.randomUUID();
  tr.dataset.entryId = rowId;

  const dateTd = document.createElement("td");
  dateTd.className = "work-schedule-cell work-schedule-cell-date";
  const dateValue = initialData.workDate || "";
  const dateDisplay = document.createElement("span");
  dateDisplay.className = "work-schedule-date-display";
  function formatDateYYMMDD(val) {
    if (!val) return "";
    const [y, m, d] = val.split("-");
    if (!y || !m || !d) return val;
    return `${y}/${m}/${d}`;
  }
  dateDisplay.textContent = formatDateYYMMDD(dateValue);
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "work-schedule-input-date";
  dateInput.name = "work-schedule-date";
  dateInput.value = dateValue;
  dateInput.tabIndex = -1;
  dateInput.addEventListener("change", () => {
    dateDisplay.textContent = formatDateYYMMDD(dateInput.value);
    onUpdate();
    onFilterApply?.();
  });
  dateTd.addEventListener("click", (e) => {
    e.preventDefault();
    dateInput.focus();
    if (typeof dateInput.showPicker === "function") {
      dateInput.showPicker();
    }
  });
  dateTd.appendChild(dateDisplay);
  dateTd.appendChild(dateInput);

  const { startTime: initStart, endTime: initEnd } = initialData.startTime != null && initialData.endTime != null
    ? { startTime: initialData.startTime || "", endTime: initialData.endTime || "" }
    : parseNameToStartEnd(initialData.name || "");

  const startTimeTd = document.createElement("td");
  startTimeTd.className = "work-schedule-cell work-schedule-cell-start-time";
  const startTimeInput = document.createElement("input");
  startTimeInput.type = "text";
  startTimeInput.className = "work-schedule-input-start-time";
  startTimeInput.placeholder = "09:00";
  startTimeInput.value = initStart;
  startTimeTd.appendChild(startTimeInput);

  const endTimeTd = document.createElement("td");
  endTimeTd.className = "work-schedule-cell work-schedule-cell-end-time";
  const endTimeInput = document.createElement("input");
  endTimeInput.type = "text";
  endTimeInput.className = "work-schedule-input-end-time";
  endTimeInput.placeholder = "18:00";
  endTimeInput.value = initEnd;
  endTimeTd.appendChild(endTimeInput);

  let typeInputWrap;
  const hoursWorkedInput = document.createElement("input");
  hoursWorkedInput.type = "number";
  hoursWorkedInput.className = "work-schedule-input-hours-worked";
  hoursWorkedInput.placeholder = "";
  hoursWorkedInput.step = "0.5";
  hoursWorkedInput.value = initialData.hoursWorked ?? "";

  const hoursInput = document.createElement("input");
  hoursInput.type = "number";
  hoursInput.className = "work-schedule-input-hours";
  hoursInput.placeholder = "";
  hoursInput.step = "0.5";
  hoursInput.hidden = true;

  const timeAccumulationDisplay = document.createElement("span");
  timeAccumulationDisplay.className = "work-schedule-time-accumulation-display";

  function updateTimeAccumulationDisplay() {
    const daily = typeof getDailyHours === "function" ? getDailyHours() : getDailyHours;
    const dailyH = Number.isNaN(daily) || daily == null ? 8.5 : parseFloat(daily);
    const hw = parseFloat(hoursWorkedInput?.value);
    if (Number.isNaN(hw) || hoursWorkedInput.value === "") {
      timeAccumulationDisplay.textContent = "";
      hoursInput.value = "";
      return;
    }
    const diff = hw - dailyH;
    timeAccumulationDisplay.textContent = formatTimeAccumulation(diff);
    hoursInput.value = String(diff);
  }

  const rowOnUpdate = () => {
    updateTimeAccumulationDisplay();
    if (!deferNotify) onUpdate();
  };

  function syncHoursWorkedFromStartEnd() {
    const startStr = (startTimeInput?.value || "").trim();
    const endStr = (endTimeInput?.value || "").trim();
    if (startStr && endStr) {
      const d = durationFromStartEnd(startStr, endStr);
      if (d != null && d > 0) {
        hoursWorkedInput.value = String(Math.round(d * 100) / 100);
      }
    }
    rowOnUpdate();
  }

  function getWorkTypeInputEl() {
    return tr.querySelector(".work-schedule-input-type");
  }

  function syncReadonlyForWorkType() {
    const wt = (getWorkTypeInputEl()?.value || "").trim();
    const ro = READONLY_WORK_TYPES.includes(wt);
    startTimeInput.readOnly = ro;
    endTimeInput.readOnly = ro;
    startTimeInput.classList.toggle("work-schedule-time-readonly", ro);
    endTimeInput.classList.toggle("work-schedule-time-readonly", ro);
    if (ro) {
      startTimeInput.value = "00:00";
      endTimeInput.value = "00:00";
    }
  }

  function handleTypeSelect(optName) {
    const full = getWorkTypeOptionsFull();
    const entry = full.find((o) => o.name === optName);
    if (!entry) return;
    if (READONLY_WORK_TYPES.includes(optName)) {
      startTimeInput.value = "00:00";
      endTimeInput.value = "00:00";
    } else {
      const st = (entry.start || "").trim();
      const et = (entry.end || "").trim();
      if (st) startTimeInput.value = st;
      if (et) endTimeInput.value = et;
    }
    syncReadonlyForWorkType();
    syncHoursWorkedFromStartEnd();
    if (!deferNotify) onUpdate();
  }

  startTimeInput.addEventListener("input", () => {
    syncHoursWorkedFromStartEnd();
  });
  startTimeInput.addEventListener("blur", () => {
    if (!deferNotify) onUpdate();
  });
  endTimeInput.addEventListener("input", () => {
    syncHoursWorkedFromStartEnd();
  });
  endTimeInput.addEventListener("blur", () => {
    if (!deferNotify) onUpdate();
  });

  typeInputWrap = createWorkTypeInput(initialData.workType || "", rowOnUpdate, handleTypeSelect);

  const typeTd = document.createElement("td");
  typeTd.className = "work-schedule-cell work-schedule-cell-type";
  typeTd.appendChild(typeInputWrap.wrap);

  const hoursWorkedTd = document.createElement("td");
  hoursWorkedTd.className = "work-schedule-cell work-schedule-cell-hours-worked";
  hoursWorkedInput.addEventListener("input", rowOnUpdate);
  hoursWorkedInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) hoursWorkedInput.blur();
  });
  hoursWorkedTd.appendChild(hoursWorkedInput);

  const hoursTd = document.createElement("td");
  hoursTd.className = "work-schedule-cell work-schedule-cell-hours";
  hoursTd.appendChild(timeAccumulationDisplay);
  hoursTd.appendChild(hoursInput);

  if (initStart && initEnd) syncHoursWorkedFromStartEnd();
  updateTimeAccumulationDisplay();

  const memoTd = document.createElement("td");
  memoTd.className = "work-schedule-cell work-schedule-cell-memo";
  const memoInput = document.createElement("input");
  memoInput.type = "text";
  memoInput.className = "work-schedule-input-memo";
  memoInput.placeholder = "";
  memoInput.value = initialData.memo || "";
  let memoImeComposing = false;
  memoInput.addEventListener("compositionstart", () => {
    memoImeComposing = true;
  });
  memoInput.addEventListener("compositionend", () => {
    memoImeComposing = false;
  });
  memoInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.isComposing || memoImeComposing) return;
    memoInput.blur();
  });
  memoInput.addEventListener("blur", () => {
    if (memoImeComposing) {
      queueMicrotask(() => memoInput.focus());
      return;
    }
    onUpdate();
  });
  memoTd.appendChild(memoInput);

  const actionsTd = document.createElement("td");
  actionsTd.className = "work-schedule-cell work-schedule-cell-actions";
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "work-schedule-btn-delete";
  if (isMobile) {
    delBtn.textContent = "X";
    delBtn.classList.add("work-schedule-btn-delete--mobile-x");
    delBtn.style.opacity = "1";
    delBtn.setAttribute("aria-label", "행 삭제");
  } else {
    delBtn.textContent = "삭제";
  }
  delBtn.title = "행 삭제";
  delBtn.addEventListener("click", () => {
    confirmDeleteRow(() => {
      tr.remove();
      onUpdate();
    });
  });
  actionsTd.appendChild(delBtn);

  tr.appendChild(dateTd);
  tr.appendChild(typeTd);
  tr.appendChild(startTimeTd);
  tr.appendChild(endTimeTd);
  tr.appendChild(hoursWorkedTd);
  tr.appendChild(hoursTd);
  tr.appendChild(memoTd);
  tr.appendChild(actionsTd);

  syncReadonlyForWorkType();

  return tr;
}

export function render(opts = {}) {
  const mobile = !!opts.mobile;
  wsUiLog("render() enter", { mobile, savedSubview: readSavedWorkScheduleSubview() });
  const el = document.createElement("div");
  el.className = mobile
    ? "app-tab-panel-content work-schedule-view calendar-view calendar-view--mobile-workschedule"
    : "app-tab-panel-content work-schedule-view";

  const settingsBtn = document.createElement("button");
  settingsBtn.type = "button";
  settingsBtn.className = "work-schedule-settings-btn";
  settingsBtn.setAttribute("aria-label", "근무유형 설정");
  settingsBtn.title = "근무유형 설정";
  settingsBtn.innerHTML =
    '<img src="/toolbaricons/settings.svg" alt="" class="work-schedule-settings-icon" width="20" height="20">';

  const header = document.createElement("div");
  if (mobile) {
    header.className =
      "calendar-view-header dream-view-header-wrap work-schedule-header work-schedule-header--mobile-tab";
    const headerInner = document.createElement("div");
    headerInner.className =
      "work-schedule-header-inner work-schedule-header-inner--mobile-tab";
    const titleWrap = document.createElement("div");
    titleWrap.className = "work-schedule-header-title-wrap";
    const label = document.createElement("span");
    label.className = "dream-view-label";
    label.textContent = "WORK";
    const h = document.createElement("h1");
    h.className = "dream-view-title calendar-view-title";
    h.textContent = "근무표";
    titleWrap.appendChild(label);
    titleWrap.appendChild(h);
    headerInner.appendChild(titleWrap);
    headerInner.appendChild(settingsBtn);
    header.appendChild(headerInner);
  } else {
    header.className = "work-schedule-header dream-view-header-wrap";
    const headerInner = document.createElement("div");
    headerInner.className = "work-schedule-header-inner";
    const titleWrap = document.createElement("div");
    titleWrap.className = "work-schedule-header-title-wrap";
    const label = document.createElement("span");
    label.className = "dream-view-label";
    label.textContent = "WORK SCHEDULE";
    const h = document.createElement("h1");
    h.className = "dream-view-title";
    h.textContent = "근무표";
    titleWrap.appendChild(label);
    titleWrap.appendChild(h);
    headerInner.appendChild(titleWrap);
    headerInner.appendChild(settingsBtn);
    header.appendChild(headerInner);
  }
  el.appendChild(header);

  function openWorkTypeSettingsModal() {
    function escapeHtml(s) {
      const div = document.createElement("div");
      div.textContent = s == null ? "" : String(s);
      return div.innerHTML;
    }
    const modal = document.createElement("div");
    modal.className = "work-schedule-type-settings-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-labelledby", "work-schedule-type-settings-title");
    modal.innerHTML = `
      <div class="work-schedule-type-settings-backdrop"></div>
      <div class="work-schedule-type-settings-panel">
        <div class="work-schedule-type-settings-header">
          <h3 class="work-schedule-type-settings-title" id="work-schedule-type-settings-title">근무유형 설정</h3>
          <button type="button" class="work-schedule-type-settings-close" aria-label="닫기">&times;</button>
        </div>
        <div class="work-schedule-type-settings-list-head">
          <span class="work-schedule-type-settings-th-name">근무유형</span>
          <span class="work-schedule-type-settings-th-start">시작</span>
          <span class="work-schedule-type-settings-th-end">마감</span>
          <span class="work-schedule-type-settings-th-action" aria-hidden="true"></span>
        </div>
        <div class="work-schedule-type-settings-list" data-type-list></div>
        <div class="work-schedule-type-settings-add">
          <input type="text" class="work-schedule-type-settings-input" placeholder="근무유형" maxlength="50" autocomplete="off" />
          <input type="text" class="work-schedule-type-settings-add-start" placeholder="시작" maxlength="8" autocomplete="off" />
          <input type="text" class="work-schedule-type-settings-add-end" placeholder="마감" maxlength="8" autocomplete="off" />
          <button type="button" class="work-schedule-type-settings-add-btn">추가</button>
        </div>
      </div>
    `;
    const listEl = modal.querySelector("[data-type-list]");
    const addInput = modal.querySelector(".work-schedule-type-settings-input");
    const addStartInput = modal.querySelector(".work-schedule-type-settings-add-start");
    const addEndInput = modal.querySelector(".work-schedule-type-settings-add-end");
    const addBtn = modal.querySelector(".work-schedule-type-settings-add-btn");

    function renderTypeList() {
      const full = getWorkTypeOptionsFull();
      const sorted = [...full].sort((a, b) => {
        const i = WORK_TYPE_DISPLAY_ORDER.indexOf(a.name);
        const j = WORK_TYPE_DISPLAY_ORDER.indexOf(b.name);
        if (i < 0 && j < 0) return 0;
        if (i < 0) return 1;
        if (j < 0) return -1;
        return i - j;
      });
      listEl.innerHTML = "";
      sorted.forEach((entry) => {
        const isReadonly = READONLY_WORK_TYPES.includes(entry.name);
        const row = document.createElement("div");
        row.className = "work-schedule-type-settings-row" + (isReadonly ? " is-protected" : "");
        if (isReadonly) {
          row.innerHTML =
            `<span class="work-schedule-type-settings-name">${escapeHtml(entry.name)}</span>` +
            `<span class="work-schedule-type-settings-row-no-time">${escapeHtml(entry.start || "00:00")}</span>` +
            `<span class="work-schedule-type-settings-row-no-time">${escapeHtml(entry.end || "00:00")}</span>` +
            `<span class="work-schedule-type-settings-row-action" aria-hidden="true"></span>`;
        } else {
          row.innerHTML =
            `<span class="work-schedule-type-settings-name">${escapeHtml(entry.name)}</span>` +
            `<input type="text" class="work-schedule-type-settings-row-start" value="${escapeHtml(entry.start || "")}" />` +
            `<input type="text" class="work-schedule-type-settings-row-end" value="${escapeHtml(entry.end || "")}" />` +
            `<span class="work-schedule-type-settings-row-action">` +
            `<button type="button" class="work-schedule-type-settings-del" title="삭제">${DELETE_ICON}</button>` +
            `</span>`;
          const startInp = row.querySelector(".work-schedule-type-settings-row-start");
          const endInp = row.querySelector(".work-schedule-type-settings-row-end");
          const commit = () => {
            updateWorkTypeOption(entry.name, startInp?.value ?? "", endInp?.value ?? "");
          };
          startInp?.addEventListener("blur", commit);
          endInp?.addEventListener("blur", commit);
          const delBtn = row.querySelector(".work-schedule-type-settings-del");
          if (delBtn) {
            delBtn.addEventListener("click", () => {
              removeWorkTypeOption(entry.name);
              renderTypeList();
            });
          }
        }
        listEl.appendChild(row);
      });
    }

    addBtn.addEventListener("click", () => {
      const name = (addInput.value || "").trim();
      if (!name) return;
      addWorkTypeOption(
        name,
        (addStartInput?.value || "").trim(),
        (addEndInput?.value || "").trim(),
      );
      addInput.value = "";
      if (addStartInput) addStartInput.value = "";
      if (addEndInput) addEndInput.value = "";
      renderTypeList();
    });
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addBtn.click();
      }
    });

    const close = () => modal.remove();
    modal.querySelector(".work-schedule-type-settings-backdrop").addEventListener("click", close);
    modal.querySelector(".work-schedule-type-settings-close").addEventListener("click", close);

    renderTypeList();
    document.body.appendChild(modal);
    addInput.focus();
  }

  settingsBtn.addEventListener("click", openWorkTypeSettingsModal);

  const viewTabs = document.createElement("div");
  viewTabs.className = mobile ? "calendar-sub-tabs" : "work-schedule-view-tabs";
  const initialSubview = readSavedWorkScheduleSubview();
  [
    { id: "all", label: "1. 근무표" },
    { id: "monthly", label: "2. 월별보기" },
  ].forEach((tab) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.view = tab.id;
    btn.textContent = tab.label;
    const isActive = tab.id === initialSubview;
    btn.className = mobile
      ? "work-schedule-view-tab time-view-tab calendar-sub-tab" + (isActive ? " active" : "")
      : "work-schedule-view-tab" + (isActive ? " active" : "");
    viewTabs.appendChild(btn);
  });
  el.appendChild(viewTabs);

  const contentWrap = document.createElement("div");
  contentWrap.className = mobile
    ? "work-schedule-content-wrap calendar-content-wrap"
    : "work-schedule-content-wrap";
  el.appendChild(contentWrap);

  let activeWorkScheduleView = initialSubview;
  let renderTableViewSeq = 0;

  /**
   * @param {{ filterStart?: string, filterEnd?: string }} [scheduleOpts]
   */
  async function renderTableView(scheduleOpts = {}) {
    const now = new Date();
    const y0 = now.getFullYear();
    const mo0 = now.getMonth();
    const pad2 = (n) => String(n).padStart(2, "0");
    const defaultRangeStart = `${y0}-${pad2(mo0 + 1)}-01`;
    const lastDayOfMonth = new Date(y0, mo0 + 1, 0).getDate();
    const defaultRangeEnd = `${y0}-${pad2(mo0 + 1)}-${pad2(lastDayOfMonth)}`;
    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    const initialRangeStart =
      scheduleOpts.filterStart && ymdRe.test(scheduleOpts.filterStart) ? scheduleOpts.filterStart : defaultRangeStart;
    const initialRangeEnd =
      scheduleOpts.filterEnd && ymdRe.test(scheduleOpts.filterEnd) ? scheduleOpts.filterEnd : defaultRangeEnd;

    const mySeq = ++renderTableViewSeq;
    if (mySeq !== renderTableViewSeq) return;

    wsUiLog("renderTableView: start", {
      seq: mySeq,
      scheduleOpts,
      range: `${initialRangeStart}..${initialRangeEnd}`,
    });

    contentWrap.innerHTML = "";
    const notice = document.createElement("p");
    notice.className = "work-schedule-notice";
    notice.textContent =
      "시작·마감은 각 행에서 입력합니다. 근무유형별 기본 시간은 톱니(근무유형 설정)에서 바꿀 수 있습니다.";
    contentWrap.appendChild(notice);

    const dailyHoursWrap = document.createElement("div");
    dailyHoursWrap.className = "work-schedule-daily-hours-wrap";
    const dailyHoursLabel = document.createElement("label");
    dailyHoursLabel.className = "work-schedule-daily-hours-label";
    dailyHoursLabel.textContent = "";
    const labelText = document.createTextNode("하루 근무시간 ");
    const dailyHoursInput = document.createElement("input");
    dailyHoursInput.type = "text";
    dailyHoursInput.inputMode = "decimal";
    dailyHoursInput.className = "work-schedule-daily-hours-input";
    dailyHoursInput.placeholder = "8.5 (8시간 30분)";
    dailyHoursInput.value = String(getDailyHours());
    dailyHoursInput.title = "8시간 30분이면 8.5 입력";
    const hoursUnit = document.createElement("span");
    hoursUnit.className = "work-schedule-daily-hours-unit";
    hoursUnit.textContent = "h";
    dailyHoursLabel.appendChild(labelText);
    dailyHoursLabel.appendChild(dailyHoursInput);
    dailyHoursLabel.appendChild(hoursUnit);
    dailyHoursWrap.appendChild(dailyHoursLabel);

    const sumInlineWrap = document.createElement("span");
    sumInlineWrap.className = "work-schedule-sum-inline-wrap";
    sumInlineWrap.appendChild(document.createTextNode(" · "));
    const sumLabelEl = document.createElement("span");
    sumLabelEl.className = "work-schedule-sum-inline-label";
    sumLabelEl.textContent = "합계 ";
    const sumInline = document.createElement("span");
    sumInline.className = "work-schedule-sum-inline";
    sumInline.setAttribute("aria-live", "polite");
    sumInlineWrap.appendChild(sumLabelEl);
    sumInlineWrap.appendChild(sumInline);
    dailyHoursWrap.appendChild(sumInlineWrap);

    const filterBar = document.createElement("div");
    filterBar.className = "work-schedule-filter-bar work-schedule-filter-bar--range-only";
    filterBar.innerHTML = `
      <div class="time-filter-nav-cluster work-schedule-date-nav-cluster">
        <div class="time-filter-range-wrap work-schedule-date-range-wrap" data-filter-wrap="range">
          <div class="time-filter-date-field">
            <input type="date" class="time-filter-start-date" name="work-schedule-filter-start" aria-label="시작일" />
            <span class="time-filter-date-label time-filter-date-label--start" aria-hidden="true"></span>
            <img src="/toolbaricons/calendar-alt.svg" alt="" class="time-filter-date-cal-icon" width="14" height="14" aria-hidden="true" />
          </div>
          <span class="time-filter-range-sep">~</span>
          <div class="time-filter-date-field">
            <input type="date" class="time-filter-end-date" name="work-schedule-filter-end" aria-label="종료일" />
            <span class="time-filter-date-label time-filter-date-label--end" aria-hidden="true"></span>
            <img src="/toolbaricons/calendar-alt.svg" alt="" class="time-filter-date-cal-icon" width="14" height="14" aria-hidden="true" />
          </div>
        </div>
      </div>
    `;
    const startDateInput = filterBar.querySelector(".time-filter-start-date");
    const endDateInput = filterBar.querySelector(".time-filter-end-date");

    /** 근무표(목록) 날짜 필터: 연도 포함(모바일 라벨) — "2026년 4월 1일(수)" */
    function formatWorkScheduleFilterDateKr(dStr) {
      if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return "";
      const [y, mo, d] = dStr.split("-").map(Number);
      const dt = new Date(y, mo - 1, d);
      const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
      return `${y}년 ${mo}월 ${d}일(${weekdays[dt.getDay()]})`;
    }
    /** 데스크탑 라벨: "2026. 04. 01(토)" — 일 뒤 불필요한 마침표 없음(네이티브 표시와 구분) */
    function formatWorkScheduleFilterDateDotsWithWeekday(dStr) {
      if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return "";
      const [y, mo, d] = dStr.split("-").map(Number);
      const dt = new Date(y, mo - 1, d);
      const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
      const yy = String(y);
      const mm = String(mo).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      return `${yy}. ${mm}. ${dd}(${weekdays[dt.getDay()]})`;
    }
    function syncWorkScheduleDateLabels() {
      const isDesktop =
        typeof window !== "undefined" &&
        window.matchMedia("(min-width: 48.0625rem)").matches;
      const fmt = isDesktop
        ? formatWorkScheduleFilterDateDotsWithWeekday
        : formatWorkScheduleFilterDateKr;
      const startLabel = filterBar.querySelector(".time-filter-date-label--start");
      const endLabel = filterBar.querySelector(".time-filter-date-label--end");
      if (startLabel) startLabel.textContent = fmt(startDateInput.value || "");
      if (endLabel) endLabel.textContent = fmt(endDateInput.value || "");
    }

    startDateInput.value = initialRangeStart;
    endDateInput.value = initialRangeEnd;
    syncWorkScheduleDateLabels();
    startDateInput.addEventListener("input", syncWorkScheduleDateLabels);
    endDateInput.addEventListener("input", syncWorkScheduleDateLabels);

    if (mobile) {
      const openWorkScheduleRangeDate = (inp) => {
        if (!inp) return;
        try {
          inp.focus({ preventScroll: true });
        } catch (_) {
          inp.focus();
        }
        if (typeof inp.showPicker === "function") {
          try {
            inp.showPicker();
            return;
          } catch (_) {
            /* Safari 등에서 제한될 수 있음 → click 폴백 */
          }
        }
        inp.click();
      };
      filterBar.querySelectorAll(".time-filter-date-field").forEach((field) => {
        const inp = field.querySelector('input[type="date"]');
        if (!inp) return;
        field.addEventListener("click", () => {
          openWorkScheduleRangeDate(inp);
        });
      });
    }

    const tableWrap = document.createElement("div");
    tableWrap.className = "work-schedule-table-wrap";
    const table = document.createElement("table");
    table.className = "work-schedule-table";
    table.innerHTML = `
      <colgroup>
        <col class="work-schedule-col-date">
        <col class="work-schedule-col-type">
        <col class="work-schedule-col-start-time">
        <col class="work-schedule-col-end-time">
        <col class="work-schedule-col-hours-worked">
        <col class="work-schedule-col-hours">
        <col class="work-schedule-col-memo">
        <col class="work-schedule-col-actions">
      </colgroup>
      <thead>
        <tr>
          <th class="work-schedule-th-date">근무일</th>
          <th class="work-schedule-th-type">근무유형</th>
          <th class="work-schedule-th-start-time">시작시간</th>
          <th class="work-schedule-th-end-time">마감시간</th>
          <th class="work-schedule-th-hours-worked">Hours</th>
          <th class="work-schedule-th-hours">시간적립</th>
          <th class="work-schedule-th-memo">메모</th>
          <th class="work-schedule-th-actions"></th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    if (mobile) {
      const thActions = table.querySelector(".work-schedule-th-actions");
      if (thActions) thActions.textContent = "삭제";
    }

    const tbody = table.querySelector("tbody");

    function save() {
      const withIds = saveRows(getRowsToSave(tableWrap));
      syncEntryIdsAfterSave(tableWrap, withIds);
    }

    function updateSum() {
      const total = getHoursSum(tableWrap);
      sumInline.textContent = formatTimeAccumulation(total) || "0";
    }

    /** YYYY-MM-DD(또는 슬래시)만 문자열 비교 — Date 파싱은 브라우저·타임존에 따라 말일 등이 틀어짐 */
    function isRowDateInRange(dateStr, rangeStart, rangeEnd) {
      if (!dateStr) return true;
      const d = normalizeWorkDateKey(dateStr);
      if (!d || d.length < 10) return false;
      const s = normalizeWorkDateKey(rangeStart);
      const e = normalizeWorkDateKey(rangeEnd);
      if (!s || !e || s.length < 10 || e.length < 10) return false;
      return d >= s && d <= e;
    }

    function applyFilter() {
      syncWorkScheduleDateLabels();
      const start = startDateInput.value || initialRangeStart;
      const end = endDateInput.value || initialRangeEnd;
      tableWrap.querySelectorAll(".work-schedule-row").forEach((tr) => {
        const dateInput = tr.querySelector(".work-schedule-input-date");
        const dateStr = dateInput?.value || "";
        const show = isRowDateInRange(dateStr, start, end);
        tr.style.display = show ? "" : "none";
      });
      updateSum();
    }

    async function onWorkScheduleFilterRangeChanged() {
      const start = startDateInput.value || initialRangeStart;
      const end = endDateInput.value || initialRangeEnd;
      if (!el.isConnected) return;
      await renderTableView({ filterStart: start, filterEnd: end });
    }
    startDateInput.addEventListener("change", onWorkScheduleFilterRangeChanged);
    endDateInput.addEventListener("change", onWorkScheduleFilterRangeChanged);

    const onUpdate = () => {
      save();
      updateSum();
    };

    // 행 생성 시 save()가 getRowsToSave(tableWrap)를 쓰므로, table을 tableWrap에 먼저 붙여야 함.
    // (append가 forEach 뒤에 있으면 DOM에서 행을 못 찾아 localStorage가 []로 덮이고, 동기화 시 서버 행이 전부 삭제됨)
    tableWrap.appendChild(table);

    const getDailyHoursFn = () => parseFloat(dailyHoursInput?.value) || 8.5;

    function refreshAllRowsTimeAccumulation() {
      const dailyH = getDailyHoursFn();
      tableWrap.querySelectorAll(".work-schedule-row").forEach((tr) => {
        const display = tr.querySelector(".work-schedule-time-accumulation-display");
        const hoursWorkedInput = tr.querySelector(".work-schedule-input-hours-worked");
        const hoursInput = tr.querySelector(".work-schedule-input-hours");
        if (!display || !hoursWorkedInput) return;
        const hw = parseFloat(hoursWorkedInput.value);
        if (Number.isNaN(hw) || hoursWorkedInput.value === "") {
          display.textContent = "";
          if (hoursInput) hoursInput.value = "";
          return;
        }
        const diff = hw - dailyH;
        display.textContent = formatTimeAccumulation(diff);
        if (hoursInput) hoursInput.value = String(diff);
      });
      updateSum();
    }

    function sanitizeDailyHoursInput(val) {
      const cleaned = String(val || "").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
      return cleaned;
    }
    dailyHoursInput.addEventListener("input", () => {
      const raw = dailyHoursInput.value;
      const sanitized = sanitizeDailyHoursInput(raw);
      if (raw !== sanitized) dailyHoursInput.value = sanitized;
      setDailyHours(sanitized);
      refreshAllRowsTimeAccumulation();
    });
    dailyHoursInput.addEventListener("change", () => {
      const sanitized = sanitizeDailyHoursInput(dailyHoursInput.value);
      if (dailyHoursInput.value !== sanitized) dailyHoursInput.value = sanitized;
      setDailyHours(sanitized);
      refreshAllRowsTimeAccumulation();
    });

    const initialRows = getMergedInitialRows();
    wsUiLog("renderTableView: merged row count", initialRows.length);
    initialRows.forEach((row) => {
      const tr = createRow(row, onUpdate, el, applyFilter, getDailyHoursFn, mobile, { deferNotify: true });
      tbody.appendChild(tr);
    });
    save();
    updateSum();

    function addNewWorkScheduleRow() {
      const tr = createRow({}, onUpdate, el, applyFilter, getDailyHoursFn, mobile);
      tbody.appendChild(tr);
      applyFilter();
      save();
    }

    const topRow = document.createElement("div");
    topRow.className = "work-schedule-top-row";
    topRow.appendChild(dailyHoursWrap);
    topRow.appendChild(filterBar);
    contentWrap.appendChild(topRow);
    contentWrap.appendChild(tableWrap);
    /* 데스크톱: 테이블 안 tfoot + 행 대신 표 아래 단일 + (모바일은 하단 FAB만 사용) */
    if (!mobile) {
      const addWrap = document.createElement("div");
      addWrap.className = "work-schedule-desktop-add-wrap";
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      /* 데스크톱: 시간가계부「과제 기록」+와 동일 (.todo-add-btn + TIME_LEDGER와 동일 SVG) */
      addBtn.className = "todo-add-btn";
      addBtn.title = "근무 행 추가";
      addBtn.setAttribute("aria-label", "근무 행 추가");
      addBtn.innerHTML = WORK_SCHEDULE_MOBILE_FAB_SVG;
      addBtn.addEventListener("click", addNewWorkScheduleRow);
      addWrap.appendChild(addBtn);
      contentWrap.appendChild(addWrap);
    }
    if (mobile) {
      const fabWrap = document.createElement("div");
      fabWrap.className = "work-schedule-mobile-fab-wrap";
      const fabBtn = document.createElement("button");
      fabBtn.type = "button";
      fabBtn.className = "todo-cards-add-btn work-schedule-mobile-fab-btn";
      fabBtn.title = "근무 행 추가";
      fabBtn.setAttribute("aria-label", "근무 행 추가");
      fabBtn.innerHTML = WORK_SCHEDULE_MOBILE_FAB_SVG;
      fabBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        addNewWorkScheduleRow();
      });
      fabWrap.appendChild(fabBtn);
      contentWrap.appendChild(fabWrap);
    }
    applyFilter();
    const visibleRows = [...tableWrap.querySelectorAll(".work-schedule-row")].filter(
      (tr) => tr.style.display !== "none",
    ).length;
    wsUiLog("renderTableView: after filter, visible data rows", visibleRows, "/", initialRows.length);
  }

  /** 월별보기: 날짜·근무유형 선택 → 근무표에 행 추가(시작·마감은 유형 기본값) */
  function openMonthlyDayEntryModal(initialDateKey) {
    const dateKey = normalizeWorkDateKey(initialDateKey || "") || formatLocalYmd(new Date());
    document.querySelectorAll(".work-schedule-day-entry-modal").forEach((n) => n.remove());

    const modal = document.createElement("div");
    modal.className = "work-schedule-type-settings-modal work-schedule-day-entry-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "work-schedule-day-entry-title");

    const backdrop = document.createElement("div");
    backdrop.className = "work-schedule-type-settings-backdrop";

    const panel = document.createElement("div");
    panel.className = "work-schedule-type-settings-panel work-schedule-day-entry-modal-panel";

    const header = document.createElement("div");
    header.className = "work-schedule-type-settings-header";
    const title = document.createElement("h3");
    title.id = "work-schedule-day-entry-title";
    title.className = "work-schedule-type-settings-title";
    title.textContent = "근무 등록";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "work-schedule-type-settings-close";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.innerHTML = "&times;";
    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "work-schedule-day-entry-body";

    const labelDate = document.createElement("label");
    labelDate.className = "work-schedule-day-entry-label";
    const spanDate = document.createElement("span");
    spanDate.className = "work-schedule-day-entry-label-text";
    spanDate.textContent = "근무일";
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.className = "work-schedule-day-entry-date";
    dateInput.value = dateKey;
    labelDate.appendChild(spanDate);
    labelDate.appendChild(dateInput);

    const labelType = document.createElement("label");
    labelType.className = "work-schedule-day-entry-label";
    const spanType = document.createElement("span");
    spanType.className = "work-schedule-day-entry-label-text";
    spanType.textContent = "근무유형";
    const select = document.createElement("select");
    select.className = "work-schedule-day-entry-select";
    select.setAttribute("aria-label", "근무유형");
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "선택";
    select.appendChild(opt0);
    const seenTypeNames = new Set();
    getWorkTypeOptions().forEach((name) => {
      const n = (name || "").trim();
      if (!n || seenTypeNames.has(n)) return;
      seenTypeNames.add(n);
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      select.appendChild(o);
    });
    const existingForDay = getMergedInitialRows().filter(
      (r) => normalizeWorkDateKey(r.workDate || "") === dateKey,
    );
    const preloadType = existingForDay.length ? (existingForDay[0].workType || "").trim() : "";
    if (preloadType && [...select.options].some((op) => op.value === preloadType)) {
      select.value = preloadType;
    }
    labelType.appendChild(spanType);
    labelType.appendChild(select);

    body.appendChild(labelDate);
    body.appendChild(labelType);

    const footer = document.createElement("div");
    footer.className = "todo-list-modal-footer work-schedule-day-entry-footer";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "todo-list-modal-cancel work-schedule-day-entry-cancel";
    cancelBtn.textContent = "취소";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "todo-list-modal-confirm work-schedule-day-entry-save";
    saveBtn.textContent = "저장";
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    modal.appendChild(backdrop);
    modal.appendChild(panel);

    function closeModal() {
      try {
        document.removeEventListener("keydown", onKeyDown);
      } catch (_) {}
      modal.remove();
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      }
    }

    function onSave() {
      const wd = normalizeWorkDateKey(dateInput.value || "");
      const typeName = (select.value || "").trim();
      if (!wd || wd.length < 10) {
        window.alert("근무일을 선택해 주세요.");
        return;
      }
      if (!typeName) {
        window.alert("근무유형을 선택해 주세요.");
        return;
      }
      const full = getWorkTypeOptionsFull();
      const entry = full.find((o) => o.name === typeName);
      let startTime = "";
      let endTime = "";
      if (READONLY_WORK_TYPES.includes(typeName)) {
        startTime = "00:00";
        endTime = "00:00";
      } else if (entry) {
        startTime = (entry.start || "").trim();
        endTime = (entry.end || "").trim();
      }
      let hoursWorked = "";
      if (startTime && endTime) {
        const dur = durationFromStartEnd(startTime, endTime);
        if (dur != null && dur > 0) hoursWorked = String(Math.round(dur * 100) / 100);
      }
      const newRow = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined,
        workDate: wd,
        workType: typeName,
        startTime,
        endTime,
        hoursWorked,
        hours: "",
        memo: "",
      };
      /* 같은 근무일에 행이 여러 줄 쌓이지 않도록: 해당 날짜 기존 행은 모두 제거 후 한 줄로 덮어씀 */
      const rows = getMergedInitialRows().filter((r) => normalizeWorkDateKey(r.workDate || "") !== wd);
      rows.push(newRow);
      rows.sort(compareWorkScheduleRowsByDateTimeAsc);
      saveRows(rows);
      /* 저장한 근무일이 속한 달로 커서 고정 — 모달 직후 월별보기가 오늘 달로 돌아가는 현상 방지 */
      const dp = wd.split("-");
      if (dp.length === 3) {
        const cy = parseInt(dp[0], 10);
        const cm = parseInt(dp[1], 10) - 1;
        if (Number.isFinite(cy) && Number.isFinite(cm) && cm >= 0 && cm <= 11) {
          setWorkScheduleMonthlyViewCursor(cy, cm);
        }
      }
      closeModal();

      if (activeWorkScheduleView === "monthly") {
        renderMonthlyView();
      }
    }

    backdrop.addEventListener("click", closeModal);
    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    saveBtn.addEventListener("click", onSave);
    document.addEventListener("keydown", onKeyDown);

    document.body.appendChild(modal);
    requestAnimationFrame(() => {
      select.focus();
    });
  }

  function renderMonthlyView() {
    const tableWrap = contentWrap.querySelector(".work-schedule-table-wrap");
    if (tableWrap) {
      saveRows(getRowsToSave(tableWrap));
    }
    contentWrap.innerHTML = "";
    contentWrap.appendChild(
      renderMonthlyContent({
        typeOnly: true,
        onDayClick: (key) => openMonthlyDayEntryModal(key),
        onMonthLabelClick: ({ year, month }) =>
          openMonthlyDayEntryModal(defaultDateKeyForCalendarMonth(year, month)),
      }),
    );
  }

  function switchView(view, reason = "") {
    activeWorkScheduleView = view || "all";
    persistWorkScheduleSubview(activeWorkScheduleView);
    wsUiLog("switchView", { view: activeWorkScheduleView, reason });
    viewTabs.querySelectorAll(".work-schedule-view-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === activeWorkScheduleView);
    });
    if (activeWorkScheduleView === "all") {
      void renderTableView().catch((e) => console.warn("[work-schedule] renderTableView", e));
    } else {
      renderMonthlyView();
    }
  }

  viewTabs.querySelectorAll(".work-schedule-view-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view, "tab-click"));
  });

  const hydrateGen = ++_workScheduleHydrateGeneration;
  /* Supabase: 로딩 문구로 본문을 비우면 탭 전환마다 ‘불러오는 중’이 반복됨 → 메모리 기준으로 먼저 표시,
   * hydrate 완료 후 1회 갱신(App 부팅 시에도 hydrateWorkScheduleFromCloud 가 돌아 있음). */
  if (supabase) {
    wsUiLog("mount: 즉시 표시 + hydrate, gen=", hydrateGen);
    switchView(activeWorkScheduleView, "mount-initial-supabase");
    void hydrateWorkScheduleFromCloud()
      .catch((err) => {
        console.warn("[work-schedule]", err);
        return { anyChanged: false };
      })
      .then((hydrateResult) => {
        if (hydrateGen !== _workScheduleHydrateGeneration) {
          wsUiLog("hydrate SKIP (superseded by newer mount)", hydrateGen, "current=", _workScheduleHydrateGeneration);
          return;
        }
        if (!el.isConnected) {
          wsUiLog("hydrate SKIP (panel no longer in document)");
          return;
        }
        wsUiLog("hydrate 완료 → switchView 1회", hydrateResult);
        switchView(activeWorkScheduleView, "after-hydrate");
      });
  } else {
    wsUiLog("mount: Supabase 없음 → 로컬만 즉시 표시", hydrateGen);
    switchView(activeWorkScheduleView, "mount-initial-no-supabase");
  }

  return el;
}
