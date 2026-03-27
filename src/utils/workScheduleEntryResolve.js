/**
 * 근무표 행: 시작·마감은 근무유형 설정값 기준(표시·저장).
 * 해당 날짜에 시간가계부 "근무하기"가 있으면 그 시간은 유지.
 */

import { readTimeLedgerEntriesRaw } from "./timeLedgerEntriesModel.js";

const WORK_TYPE_OPTIONS_KEY = "work_schedule_type_options";

const DEFAULT_WORK_TYPE_OPTIONS = [
  { name: "연차", start: "00:00", end: "00:00" },
  { name: "휴가", start: "00:00", end: "00:00" },
  { name: "정규근무", start: "", end: "" },
];

const WORK_TYPE_DISPLAY_ORDER = DEFAULT_WORK_TYPE_OPTIONS.map((o) => o.name);

function normalizeTypeEntry(o) {
  if (typeof o === "string") return { name: (o || "").trim(), start: "", end: "" };
  return {
    name: (o.name || "").trim(),
    start: (o.start != null ? String(o.start) : "").trim(),
    end: (o.end != null ? String(o.end) : "").trim(),
  };
}

export function normalizeWorkDateKey(s) {
  return String(s || "").trim().replace(/\//g, "-").slice(0, 10);
}

function loadTimeTaskRows() {
  return readTimeLedgerEntriesRaw();
}

/** 근무하기가 있는 근무일(YYYY-MM-DD) */
export function getTimeLedgerWorkDatesSet() {
  const workTaskName = "근무하기";
  const dates = new Set();
  for (const r of loadTimeTaskRows()) {
    if ((r.taskName || "").trim() !== workTaskName) continue;
    if (!r.startTime || !r.endTime || !r.date) continue;
    const d = normalizeWorkDateKey(r.date);
    if (d.length >= 10) dates.add(d);
  }
  return dates;
}

export function workDateHasTimeLedgerWork(workDateKey) {
  const d = normalizeWorkDateKey(workDateKey);
  if (!d || d.length < 10) return false;
  return getTimeLedgerWorkDatesSet().has(d);
}

/** WorkSchedule.js getWorkTypeOptionsFull 과 동일 병합 */
export function getWorkTypeOptionsFullFromStorage() {
  const defaultFull = DEFAULT_WORK_TYPE_OPTIONS.map((o) => ({ name: o.name, start: o.start || "", end: o.end || "" }));
  try {
    const raw = localStorage.getItem(WORK_TYPE_OPTIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
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
    }
  } catch (_) {}
  return defaultFull;
}

export function getDefaultStartEndForTypeFromStorage(workTypeName) {
  const wt = (workTypeName || "").trim();
  if (!wt) return { start: "", end: "" };
  const full = getWorkTypeOptionsFullFromStorage();
  const entry = full.find((o) => o.name === wt);
  if (!entry) return { start: "", end: "" };
  return { start: entry.start || "", end: entry.end || "" };
}

function parseNameToStartEnd(name) {
  if (!name || typeof name !== "string") return { startTime: "", endTime: "" };
  const parts = name.trim().split("~");
  const start = (parts[0] || "").trim();
  const end = (parts[1] || "").trim();
  return { startTime: start, endTime: end };
}

export function normalizeRowStartEnd(row) {
  if (row.startTime != null && row.endTime != null && row.startTime !== "" && row.endTime !== "") {
    return { ...row, startTime: String(row.startTime).trim(), endTime: String(row.endTime).trim() };
  }
  const { startTime, endTime } = parseNameToStartEnd(row.name || "");
  return { ...row, startTime, endTime };
}

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

export function durationFromStartEndStrings(startStr, endStr) {
  const startH = parseTimeToHours(startStr);
  const endH = parseTimeToHours(endStr);
  if (startH == null || endH == null) return null;
  return endH > startH ? endH - startH : 24 - startH + endH;
}

/**
 * 시간가계부가 없는 날: 근무유형에 맞는 시작·마감·hoursWorked로 정규화.
 * 시간가계부가 있는 날: 행 그대로.
 */
export function applyWorkScheduleRowTimesFromTypes(rows) {
  if (!Array.isArray(rows)) return [];
  const ledgerDates = getTimeLedgerWorkDatesSet();
  return rows.map((row) => {
    const n = normalizeRowStartEnd(row);
    const d = normalizeWorkDateKey(n.workDate);
    if (d && ledgerDates.has(d)) return n;
    const wt = (n.workType || "").trim();
    if (!wt) return n;
    const { start, end } = getDefaultStartEndForTypeFromStorage(wt);
    const startTime = (start || "").trim() || n.startTime;
    const endTime = (end || "").trim() || n.endTime;
    const dur = durationFromStartEndStrings(startTime, endTime);
    let hoursWorked = n.hoursWorked;
    if (dur != null && dur > 0) {
      hoursWorked = String(Math.round(dur * 100) / 100);
    }
    return { ...n, startTime, endTime, hoursWorked };
  });
}
