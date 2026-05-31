/**
 * 캘린더 월간 뷰 — 날짜별 아이콘 1개 세션 메모리
 * @typedef {{ id: string, iconKey: string }} CalendarDayIconRow
 */

/** @type {Record<string, CalendarDayIconRow>} */
let _byDate = {};

export function resetCalendarDayIconsMemory() {
  _byDate = {};
}

function newCalendarDayIconId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return `cdi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeYmd(v) {
  return String(v || "").trim().slice(0, 10);
}

function normalizeIconKey(v) {
  return String(v || "").trim();
}

export function readCalendarDayIconsSnapshot() {
  /** @type {Record<string, CalendarDayIconRow>} */
  const out = {};
  for (const [ymd, row] of Object.entries(_byDate)) {
    const key = normalizeYmd(ymd);
    if (!key || !row?.iconKey) continue;
    out[key] = {
      id: String(row.id || "").trim(),
      iconKey: normalizeIconKey(row.iconKey),
    };
  }
  return out;
}

/**
 * @param {unknown[]} rows Supabase SELECT rows
 */
export function applyCalendarDayIconsServerSnapshot(rows) {
  /** @type {Record<string, CalendarDayIconRow>} */
  const next = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const r = row && typeof row === "object" ? row : {};
    const ymd = normalizeYmd(r.day_date);
    const iconKey = normalizeIconKey(r.icon_key);
    const id = String(r.id || "").trim();
    if (!ymd || !iconKey || !id) continue;
    if (!next[ymd]) {
      next[ymd] = { id, iconKey };
    }
  }
  _byDate = next;
}

/** @param {string} dateKey */
export function getCalendarDayIconKeyForDate(dateKey) {
  const ymd = normalizeYmd(dateKey);
  if (!ymd) return "";
  return normalizeIconKey(_byDate[ymd]?.iconKey);
}

/** @param {string} dateKey — 하위 호환 */
export function getCalendarDayIconsForDate(dateKey) {
  const iconKey = getCalendarDayIconKeyForDate(dateKey);
  if (!iconKey) return [];
  const ymd = normalizeYmd(dateKey);
  const id = _byDate[ymd]?.id || "";
  return [{ id, iconKey, sortOrder: 0 }];
}

/** @param {string} dateKey @param {string} iconKey */
export function setCalendarDayIconKeyForDate(dateKey, iconKey) {
  const ymd = normalizeYmd(dateKey);
  if (!ymd) return;
  const key = normalizeIconKey(iconKey);
  if (!key) {
    delete _byDate[ymd];
    return;
  }
  const prevId = _byDate[ymd]?.id;
  _byDate[ymd] = {
    id: prevId || newCalendarDayIconId(),
    iconKey: key,
  };
}

/** @param {string} dateKey @param {string[]} iconKeys — 첫 항목만 사용 */
export function setCalendarDayIconKeysForDate(dateKey, iconKeys) {
  const first = (Array.isArray(iconKeys) ? iconKeys : [])
    .map(normalizeIconKey)
    .find(Boolean);
  setCalendarDayIconKeyForDate(dateKey, first || "");
}
