/**
 * 근무표 행: 시작·마감은 시간가계부「근무하기」기록 또는 저장된 행 값을 사용.
 * 근무유형 이름만 바꿔도 시작·마감을 자동 채우지 않음(유형별 기본 시간 적용 없음).
 */

import { readTimeLedgerEntriesRaw } from "./timeLedgerEntriesModel.js";

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

/** 행 정규화만 수행. 근무유형 기본 시작·마감으로 덮어쓰지 않음. */
export function applyWorkScheduleRowTimesFromTypes(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizeRowStartEnd(row));
}
