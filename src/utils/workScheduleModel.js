/**
 * 근무표 — 세션 메모리만 유지. 영속 복구는 Supabase pull.
 * 이전 localStorage 값은 최초 접근 시 한 번 읽힌 뒤 제거됩니다.
 */

export const WORK_SCHEDULE_ROWS_LS_LEGACY_KEY = "work_schedule_rows";
export const WORK_SCHEDULE_TYPE_OPTIONS_LS_LEGACY_KEY = "work_schedule_type_options";
export const WORK_SCHEDULE_DAILY_HOURS_LS_LEGACY_KEY = "work_schedule_daily_hours";

/** WorkSchedule.js ENTRY_ID_RE 와 동일 */
const ENTRY_ID_FULL_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let _legacyMigrated = false;

/** @type {any[]} */
let _rowsMem = [];

/** @type {any[] | null} — null이면 UI에서 기본 시드만 사용 */
let _typeOptionsMem = null;

/** @type {number | null} — null이면 기본 8.5 */
let _dailyHoursMem = null;

function migrateFromLegacyLocalStorageOnce() {
  if (_legacyMigrated) return;
  _legacyMigrated = true;
  try {
    const rawRows = localStorage.getItem(WORK_SCHEDULE_ROWS_LS_LEGACY_KEY);
    if (rawRows) {
      const arr = JSON.parse(rawRows);
      if (Array.isArray(arr)) _rowsMem = arr;
    }
    const rawTypes = localStorage.getItem(WORK_SCHEDULE_TYPE_OPTIONS_LS_LEGACY_KEY);
    if (rawTypes) {
      const arr = JSON.parse(rawTypes);
      if (Array.isArray(arr) && arr.length > 0) _typeOptionsMem = arr;
    }
    const rawH = localStorage.getItem(WORK_SCHEDULE_DAILY_HOURS_LS_LEGACY_KEY);
    if (rawH != null && rawH !== "") {
      const n = parseFloat(rawH);
      if (!Number.isNaN(n) && n >= 0) _dailyHoursMem = n;
    }
  } catch (_) {}
  try {
    localStorage.removeItem(WORK_SCHEDULE_ROWS_LS_LEGACY_KEY);
    localStorage.removeItem(WORK_SCHEDULE_TYPE_OPTIONS_LS_LEGACY_KEY);
    localStorage.removeItem(WORK_SCHEDULE_DAILY_HOURS_LS_LEGACY_KEY);
  } catch (_) {}
}

function ensureRowsHaveUuidsInMem() {
  if (!Array.isArray(_rowsMem)) _rowsMem = [];
  _rowsMem = _rowsMem.map((r) => {
    const id = r?.id != null ? String(r.id).trim() : "";
    if (id && ENTRY_ID_FULL_RE.test(id)) return r;
    return { ...r, id: crypto.randomUUID() };
  });
  return _rowsMem;
}

export function readWorkScheduleRowsFromMem() {
  migrateFromLegacyLocalStorageOnce();
  return ensureRowsHaveUuidsInMem();
}

export function writeWorkScheduleRowsToMem(rows) {
  migrateFromLegacyLocalStorageOnce();
  const withIds = (Array.isArray(rows) ? rows : []).map((r) => {
    const id = r?.id != null ? String(r.id).trim() : "";
    if (id && ENTRY_ID_FULL_RE.test(id)) return r;
    return { ...r, id: crypto.randomUUID() };
  });
  _rowsMem = withIds;
  return withIds;
}

export function readWorkScheduleTypeOptionsRawFromMem() {
  migrateFromLegacyLocalStorageOnce();
  return _typeOptionsMem;
}

export function writeWorkScheduleTypeOptionsRawToMem(arr) {
  migrateFromLegacyLocalStorageOnce();
  if (!Array.isArray(arr) || arr.length === 0) _typeOptionsMem = null;
  else _typeOptionsMem = arr;
}

export function readWorkScheduleDailyHoursFromMem() {
  migrateFromLegacyLocalStorageOnce();
  if (_dailyHoursMem != null && Number.isFinite(_dailyHoursMem) && _dailyHoursMem >= 0) {
    return _dailyHoursMem;
  }
  return null;
}

export function writeWorkScheduleDailyHoursToMem(n) {
  migrateFromLegacyLocalStorageOnce();
  const v = parseFloat(n);
  if (Number.isNaN(v) || v < 0) return;
  _dailyHoursMem = v;
}

/**
 * 로그아웃·계정 전환 시: 메모리 초기화 및 구버전 LS 키 제거
 */
export function clearWorkScheduleMemAndLegacy() {
  try {
    localStorage.removeItem(WORK_SCHEDULE_ROWS_LS_LEGACY_KEY);
    localStorage.removeItem(WORK_SCHEDULE_TYPE_OPTIONS_LS_LEGACY_KEY);
    localStorage.removeItem(WORK_SCHEDULE_DAILY_HOURS_LS_LEGACY_KEY);
  } catch (_) {}
  _legacyMigrated = false;
  _rowsMem = [];
  _typeOptionsMem = null;
  _dailyHoursMem = null;
}
