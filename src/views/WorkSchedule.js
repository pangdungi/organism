/**
 * 근무표 - 근무 일정 관리
 * 근무시간, 근무유형, 근무일, 시간(근무표), 메모
 */
import { renderMonthlyContent } from "./WorkScheduleMonthly.js";
import { supabase } from "../supabase.js";
import { hydrateWorkScheduleFromCloud } from "../utils/workScheduleSupabase.js";
import {
  applyWorkScheduleRowTimesFromTypes,
  normalizeWorkDateKey,
  workDateHasTimeLedgerWork,
} from "../utils/workScheduleEntryResolve.js";
import { readTimeLedgerEntriesRaw } from "../utils/timeLedgerEntriesModel.js";
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

/** localStorage `debug_work_schedule` = `1` 이면 근무표 UI/하이드레이트 진단 로그 */
function wsUiLog(...args) {
  try {
    if (localStorage.getItem("debug_work_schedule") === "1") {
      console.log("[work-schedule-ui]", ...args);
    }
  } catch (_) {}
}

let _workScheduleHydrateGeneration = 0;

const ENTRY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function notifyWorkScheduleSaved() {
  try {
    window.dispatchEvent(new CustomEvent("work-schedule-saved"));
  } catch (_) {}
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

function getDefaultStartEndForType(workTypeName) {
  const full = getWorkTypeOptionsFull();
  const entry = full.find((o) => o.name === workTypeName);
  if (!entry) return { start: "", end: "" };
  return { start: entry.start || "", end: entry.end || "" };
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

/** 시간기록의 근무하기 → 근무표 행 형식 (시작시간, 마감시간, Hours, 근무일, 근무유형/메모 유지) */
function getWorkRowsFromTimeRecord() {
  const timeRows = readTimeLedgerEntriesRaw();
  const workTaskName = "근무하기";
  const toTimeString = (hours) => {
    if (hours == null || Number.isNaN(hours)) return "";
    const h = Math.floor(hours) % 24;
    const m = Math.round((hours - Math.floor(hours)) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const rows = timeRows
    .filter((r) => (r.taskName || "").trim() === workTaskName)
    .filter((r) => r.startTime && r.endTime && r.date)
    .map((r) => {
      const startH = parseTimeToHours(r.startTime);
      const endH = parseTimeToHours(r.endTime);
      if (startH == null || endH == null) return null;
      const duration = endH > startH ? endH - startH : 24 - startH + endH;
      const startStr = toTimeString(startH);
      const endStr = toTimeString(endH);
      const dateStr = String(r.date || "").trim().replace(/\//g, "-").slice(0, 10);
      return {
        startTime: startStr,
        endTime: endStr,
        hoursWorked: duration > 0 ? String(Math.round(duration * 100) / 100) : "",
        workDate: dateStr,
        workType: "",
        memo: "",
      };
    })
    .filter(Boolean);
  return rows;
}

/** 저장된 행에서 시작/마감 추출 (name "09:00~18:00" 하위 호환) */
function normalizeRowStartEnd(row) {
  if (row.startTime != null && row.endTime != null && row.startTime !== "" && row.endTime !== "") {
    return { ...row, startTime: String(row.startTime).trim(), endTime: String(row.endTime).trim() };
  }
  const { startTime, endTime } = parseNameToStartEnd(row.name || "");
  return { ...row, startTime, endTime };
}

/** 행 일치 키: 근무일|시작|마감 */
function rowKey(r) {
  const n = normalizeRowStartEnd(r);
  return `${n.workDate || ""}|${n.startTime || ""}|${n.endTime || ""}`;
}

/** 시간기록에서만 온 행: 저장본과 매칭 전까지 탭 전환·리렌더 시에도 동일 id 유지 */
function stableSessionIdForTimeRow(t) {
  const k = rowKey(t);
  const sessKey = `work_schedule_row_id_${k}`;
  try {
    let id = sessionStorage.getItem(sessKey);
    if (id && ENTRY_ID_RE.test(id)) return id;
    id = crypto.randomUUID();
    sessionStorage.setItem(sessKey, id);
    return id;
  } catch (_) {
    return crypto.randomUUID();
  }
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

/** 근무표 = 시간기록 "근무하기" + 저장된 수동 행. 같은 날짜에 시간기록이 있으면 실제 기록으로 덮어쓰고, 없을 때만 저장된 행 표시 */
function getMergedInitialRows() {
  const fromTime = getWorkRowsFromTimeRecord();
  const saved = loadRows();
  const keyFromTime = (t) => rowKey(t);
  const mergedFromTime = fromTime.map((t) => {
    const match = saved.find((s) => rowKey(normalizeRowStartEnd(s)) === keyFromTime(t));
    return {
      ...t,
      id: match?.id || (t.id && ENTRY_ID_RE.test(String(t.id).trim()) ? String(t.id).trim() : stableSessionIdForTimeRow(t)),
      workType: match?.workType ?? t.workType,
      memo: match?.memo ?? t.memo,
    };
  });
  const timeRecordDates = new Set(fromTime.map((ft) => normalizeWorkDateKey(ft.workDate)).filter((d) => d.length >= 10));
  const savedOnly = saved
    .map(normalizeRowStartEnd)
    .filter((s) => !timeRecordDates.has(normalizeWorkDateKey(s.workDate)));
  const merged = applyWorkScheduleRowTimesFromTypes([...mergedFromTime, ...savedOnly]);
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

/** 근무유형 입력: 과제명처럼 Create/삭제 가능. onTypeSelect(workType)는 유형 선택 시 호출(기본 시작/마감 채우기용) */
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
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.width = "max-content";
    panel.style.minWidth = `${rect.width}px`;
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

function createRow(initialData = {}, onUpdate, viewEl, onFilterApply, getDailyHours, isMobile = false) {
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
  startTimeInput.className = "work-schedule-input-start-time work-schedule-time-readonly";
  startTimeInput.readOnly = true;
  startTimeInput.tabIndex = -1;
  startTimeInput.setAttribute("aria-readonly", "true");
  startTimeInput.title = "시간은 시간가계부의 근무하기 기록에서 수정할 수 있습니다.";
  startTimeInput.value = initStart;
  startTimeTd.appendChild(startTimeInput);

  const endTimeTd = document.createElement("td");
  endTimeTd.className = "work-schedule-cell work-schedule-cell-end-time";
  const endTimeInput = document.createElement("input");
  endTimeInput.type = "text";
  endTimeInput.className = "work-schedule-input-end-time work-schedule-time-readonly";
  endTimeInput.readOnly = true;
  endTimeInput.tabIndex = -1;
  endTimeInput.setAttribute("aria-readonly", "true");
  endTimeInput.title = "시간은 시간가계부의 근무하기 기록에서 수정할 수 있습니다.";
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
    onUpdate();
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

  const fillDefaultStartEnd = (workTypeName) => {
    if (!(workTypeName || "").trim()) return;
    const d = normalizeWorkDateKey(dateInput.value);
    if (workDateHasTimeLedgerWork(d)) {
      rowOnUpdate();
      return;
    }
    const def = getDefaultStartEndForType(workTypeName);
    if (def.start) startTimeInput.value = def.start;
    if (def.end) endTimeInput.value = def.end;
    syncHoursWorkedFromStartEnd();
    rowOnUpdate();
  };
  typeInputWrap = createWorkTypeInput(initialData.workType || "", rowOnUpdate, fillDefaultStartEnd);

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

  return tr;
}

export function render(opts = {}) {
  const mobile = !!opts.mobile;
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
          <span class="work-schedule-type-settings-th-start">시작</span>
          <span class="work-schedule-type-settings-th-end">마감</span>
          <span class="work-schedule-type-settings-th-name">근무유형</span>
          <span class="work-schedule-type-settings-th-action"></span>
        </div>
        <div class="work-schedule-type-settings-list" data-type-list></div>
        <div class="work-schedule-type-settings-add">
          <input type="text" class="work-schedule-type-settings-add-start work-schedule-time-input" placeholder="hh:mm" maxlength="5" title="시작시간" inputmode="numeric" autocomplete="off" />
          <input type="text" class="work-schedule-type-settings-add-end work-schedule-time-input" placeholder="hh:mm" maxlength="5" title="마감시간" inputmode="numeric" autocomplete="off" />
          <input type="text" class="work-schedule-type-settings-input" placeholder="근무유형 입력" maxlength="50" />
          <button type="button" class="work-schedule-type-settings-add-btn">추가</button>
        </div>
      </div>
    `;
    const listEl = modal.querySelector("[data-type-list]");
    const addStartInput = modal.querySelector(".work-schedule-type-settings-add-start");
    const addEndInput = modal.querySelector(".work-schedule-type-settings-add-end");
    const addInput = modal.querySelector(".work-schedule-type-settings-input");
    const addBtn = modal.querySelector(".work-schedule-type-settings-add-btn");

    function formatTimeInputField(el) {
      if (!el || !el.matches(".work-schedule-time-input")) return;
      const raw = (el.value || "").replace(/\D/g, "").slice(0, 4);
      if (raw.length <= 2) {
        el.value = raw;
        return;
      }
      el.value = raw.slice(0, -2) + ":" + raw.slice(-2);
    }
    modal.addEventListener("input", (e) => {
      if (e.target.matches(".work-schedule-time-input")) formatTimeInputField(e.target);
    });
    modal.addEventListener("keydown", (e) => {
      if (!e.target.matches(".work-schedule-time-input")) return;
      const key = e.key;
      if (key === "Backspace" || key === "Delete" || key === "Tab" || key === "ArrowLeft" || key === "ArrowRight" || key === ":" || e.ctrlKey || e.metaKey) return;
      if (!/^\d$/.test(key)) e.preventDefault();
    });

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
        const startVal = escapeHtml(entry.start);
        const endVal = escapeHtml(entry.end);
        if (isReadonly) {
          const showTime = entry.start || entry.end;
          const startDisplay = showTime ? (entry.start || "00:00") : "—";
          const endDisplay = showTime ? (entry.end || "00:00") : "—";
          row.innerHTML =
            `<span class="work-schedule-type-settings-row-no-time" aria-hidden="true">${escapeHtml(startDisplay)}</span>` +
            `<span class="work-schedule-type-settings-row-no-time" aria-hidden="true">${escapeHtml(endDisplay)}</span>` +
            `<span class="work-schedule-type-settings-name">${escapeHtml(entry.name)}</span>` +
            `<span class="work-schedule-type-settings-row-action"></span>`;
        } else {
          row.innerHTML =
            `<input type="text" class="work-schedule-type-settings-row-start work-schedule-time-input" placeholder="hh:mm" value="${startVal}" maxlength="5" inputmode="numeric" autocomplete="off" />` +
            `<input type="text" class="work-schedule-type-settings-row-end work-schedule-time-input" placeholder="hh:mm" value="${endVal}" maxlength="5" inputmode="numeric" autocomplete="off" />` +
            `<span class="work-schedule-type-settings-name">${escapeHtml(entry.name)}</span>` +
            `<button type="button" class="work-schedule-type-settings-del" title="삭제">${DELETE_ICON}</button>`;
          const startInp = row.querySelector(".work-schedule-type-settings-row-start");
          const endInp = row.querySelector(".work-schedule-type-settings-row-end");
          const saveRow = () => {
            updateWorkTypeOption(entry.name, startInp.value.trim(), endInp.value.trim());
          };
          let saveRowTimer = null;
          const saveRowDebounced = () => {
            if (saveRowTimer) clearTimeout(saveRowTimer);
            saveRowTimer = setTimeout(saveRow, 300);
          };
          startInp.addEventListener("blur", saveRow);
          endInp.addEventListener("blur", saveRow);
          startInp.addEventListener("change", saveRow);
          endInp.addEventListener("change", saveRow);
          startInp.addEventListener("input", saveRowDebounced);
          endInp.addEventListener("input", saveRowDebounced);
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
      const start = (addStartInput.value || "").trim();
      const end = (addEndInput.value || "").trim();
      addWorkTypeOption(name, start, end);
      addStartInput.value = "";
      addEndInput.value = "";
      addInput.value = "";
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
  [
    { id: "all", label: "1. 근무기록 트래커" },
    { id: "monthly", label: "2. 월별보기" },
  ].forEach((tab, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.view = tab.id;
    btn.textContent = tab.label;
    btn.className = mobile
      ? "work-schedule-view-tab time-view-tab calendar-sub-tab" + (i === 0 ? " active" : "")
      : "work-schedule-view-tab" + (i === 0 ? " active" : "");
    viewTabs.appendChild(btn);
  });
  el.appendChild(viewTabs);

  const contentWrap = document.createElement("div");
  contentWrap.className = mobile
    ? "work-schedule-content-wrap calendar-content-wrap"
    : "work-schedule-content-wrap";
  el.appendChild(contentWrap);

  let activeWorkScheduleView = "all";

  function renderTableView() {
    contentWrap.innerHTML = "";
    const notice = document.createElement("p");
    notice.className = "work-schedule-notice";
    notice.textContent =
      "시작·마감 시간은 시간가계부의 근무하기 기록을 기준으로 표시됩니다. 시간을 바꾸려면 시간가계부에서 수정해 주세요.";
    contentWrap.appendChild(notice);
    const now = new Date();
    const y0 = now.getFullYear();
    const mo0 = now.getMonth();
    const pad2 = (n) => String(n).padStart(2, "0");
    const defaultRangeStart = `${y0}-${pad2(mo0 + 1)}-01`;
    const lastDayOfMonth = new Date(y0, mo0 + 1, 0).getDate();
    const defaultRangeEnd = `${y0}-${pad2(mo0 + 1)}-${pad2(lastDayOfMonth)}`;

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

    /** 근무기록 트래커: 연도 포함(모바일 라벨) — "2026년 4월 1일(수)" */
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

    startDateInput.value = defaultRangeStart;
    endDateInput.value = defaultRangeEnd;
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
      const start = startDateInput.value || defaultRangeStart;
      const end = endDateInput.value || defaultRangeEnd;
      tableWrap.querySelectorAll(".work-schedule-row").forEach((tr) => {
        const dateInput = tr.querySelector(".work-schedule-input-date");
        const dateStr = dateInput?.value || "";
        const show = isRowDateInRange(dateStr, start, end);
        tr.style.display = show ? "" : "none";
      });
      updateSum();
    }

    startDateInput.addEventListener("change", applyFilter);
    endDateInput.addEventListener("change", applyFilter);

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
      const tr = createRow(row, onUpdate, el, applyFilter, getDailyHoursFn, mobile);
      tbody.appendChild(tr);
    });

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

  function renderMonthlyView() {
    const tableWrap = contentWrap.querySelector(".work-schedule-table-wrap");
    if (tableWrap) {
      saveRows(getRowsToSave(tableWrap));
    }
    contentWrap.innerHTML = "";
    contentWrap.appendChild(
      renderMonthlyContent(mobile ? { typeOnly: true } : {}),
    );
  }

  function switchView(view) {
    activeWorkScheduleView = view || "all";
    viewTabs.querySelectorAll(".work-schedule-view-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === activeWorkScheduleView);
    });
    if (activeWorkScheduleView === "all") {
      renderTableView();
    } else {
      renderMonthlyView();
    }
  }

  viewTabs.querySelectorAll(".work-schedule-view-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  /* 로컬 기준으로 즉시 표시. Supabase 사용 시 병합 후 한 번 더 그림(할일 탭과 동일, 불러오는 중 화면 없음) */
  switchView(activeWorkScheduleView);
  const hydrateGen = ++_workScheduleHydrateGeneration;
  wsUiLog("mount hydrate start, gen=", hydrateGen);
  void hydrateWorkScheduleFromCloud()
    .catch((err) => console.warn("[work-schedule]", err))
    .finally(() => {
      if (hydrateGen !== _workScheduleHydrateGeneration) {
        wsUiLog("hydrate.finally SKIP (superseded by newer mount)", hydrateGen, "current=", _workScheduleHydrateGeneration);
        return;
      }
      if (!el.isConnected) {
        wsUiLog("hydrate.finally SKIP (panel no longer in document)");
        return;
      }
      if (!supabase) return;
      wsUiLog("hydrate.finally OK → switchView", activeWorkScheduleView);
      switchView(activeWorkScheduleView);
    });

  return el;
}
