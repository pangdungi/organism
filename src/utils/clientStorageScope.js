/**
 * 계정(user id)별 localStorage 키 — `lp:u:{uid}:{baseKey}`
 * 로그인 uid가 없으면 읽기 null·쓰기 no-op (다른 계정/레거시 데이터 노출 방지).
 */

const SCOPE_PREFIX = "lp:u:";

/** @type {string} */
let _activeUid = "";

/** 계정별로 스코프하는 localStorage base 키 목록 */
export const CLIENT_STORAGE_SCOPED_BASE_KEYS = [
  "kpi-dream-map",
  "kpi-sideincome-paths",
  "kpi-happiness-map",
  "kpi-health-map",
  "time_task_log_rows",
  "time_daily_budget_goals",
  "time_budget_excluded",
  "time_task_options",
  "diary_entries",
  "diary_server_had_rows_v1",
  "todo-section-tasks",
  "todo-custom-section-tasks",
  "todo-section-task-deletion-tombstones",
  "todo-settings",
  "todo-custom-sections",
  "todo_category_options",
  "lp-todo-main-fixed-tab-index",
  "work_schedule_rows",
  "work_schedule_type_options",
  "work_schedule_daily_hours",
  "lp_stamp_types_mirror_v1",
  "user_hourly_rate",
  "user_hourly_calc_inputs",
];

export function setActiveClientStorageUserId(uid) {
  _activeUid = String(uid || "").trim();
}

export function getActiveClientStorageUserId() {
  return _activeUid;
}

export function clientScopedStorageKey(baseKey, uid = _activeUid) {
  const base = String(baseKey || "").trim();
  const u = String(uid || "").trim();
  if (!base || !u) return "";
  return `${SCOPE_PREFIX}${u}:${base}`;
}

export function getScopedLocalStorageItem(baseKey, uid = _activeUid) {
  const key = clientScopedStorageKey(baseKey, uid);
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

export function setScopedLocalStorageItem(baseKey, value, uid = _activeUid) {
  const key = clientScopedStorageKey(baseKey, uid);
  if (!key) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (_) {
    return false;
  }
}

export function removeScopedLocalStorageItem(baseKey, uid = _activeUid) {
  const key = clientScopedStorageKey(baseKey, uid);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch (_) {}
}

/** 구버전(계정 미구분) 키 → 지정 계정 스코프로 1회 이전 */
export function migrateLegacyLocalStorageToScoped(baseKey, uid = _activeUid) {
  const u = String(uid || "").trim();
  if (!u) return;
  const scoped = clientScopedStorageKey(baseKey, u);
  if (!scoped) return;
  try {
    if (localStorage.getItem(scoped) != null) return;
    const legacy = localStorage.getItem(baseKey);
    if (legacy == null) return;
    localStorage.setItem(scoped, legacy);
    localStorage.removeItem(baseKey);
  } catch (_) {}
}

export function removeLegacyUnscopedLocalStorageKeys() {
  for (const baseKey of CLIENT_STORAGE_SCOPED_BASE_KEYS) {
    try {
      localStorage.removeItem(baseKey);
    } catch (_) {}
  }
}

/** 로그인 계정에 레거시(미스코프) 데이터 1회 이전 */
export function migrateAllRegisteredLegacyLocalStorage(uid = _activeUid) {
  for (const baseKey of CLIENT_STORAGE_SCOPED_BASE_KEYS) {
    migrateLegacyLocalStorageToScoped(baseKey, uid);
  }
}

/** 해당 계정의 스코프 localStorage 전부 제거 */
export function purgeScopedLocalStorageForUser(uid) {
  const u = String(uid || "").trim();
  if (!u) return;
  const prefix = `${SCOPE_PREFIX}${u}:`;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch (_) {}
}
