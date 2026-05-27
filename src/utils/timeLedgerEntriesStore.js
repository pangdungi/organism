/**
 * 시간가계부 기록 행(time_task_log_rows) 영속화 — IndexedDB 우선 (용량 한도 대비).
 * 계정별 키(`lp:u:{uid}:time_task_log_rows`). localStorage는 선택적 미러.
 */

import {
  clientScopedStorageKey,
  getActiveClientStorageUserId,
  getScopedLocalStorageItem,
  migrateLegacyLocalStorageToScoped,
  setScopedLocalStorageItem,
} from "./clientStorageScope.js";

export const TIME_LEDGER_STORAGE_KEY = "time_task_log_rows";

const DB_NAME = "lp-time-ledger-v1";
const DB_VERSION = 1;
const STORE = "ledger";

/** @type {IDBDatabase | null} */
let _db = null;

/** @type {Promise<void> | null} */
let _opening = null;

function resolveIdbRecordKey(uid = getActiveClientStorageUserId()) {
  const scoped = clientScopedStorageKey(TIME_LEDGER_STORAGE_KEY, uid);
  return scoped || TIME_LEDGER_STORAGE_KEY;
}

function openDatabase() {
  if (_opening) return _opening;
  _opening = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error || new Error("indexedDB.open failed"));
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => {
        _db = req.result;
        resolve();
      };
    } catch (e) {
      reject(e);
    }
  });
  return _opening;
}

/**
 * @returns {Promise<{ rows: unknown[] } | undefined>}
 */
function idbGetRecord(recordKey) {
  return new Promise((resolve, reject) => {
    if (!_db) {
      resolve(undefined);
      return;
    }
    const tx = _db.transaction(STORE, "readonly");
    const q = tx.objectStore(STORE).get(recordKey);
    q.onerror = () => reject(q.error);
    q.onsuccess = () => resolve(q.result);
  });
}

/**
 * @param {unknown[]} rows
 */
function idbPutRecord(recordKey, rows) {
  return new Promise((resolve, reject) => {
    if (!_db) {
      resolve();
      return;
    }
    const rec = { key: recordKey, rows };
    const tx = _db.transaction(STORE, "readwrite");
    const q = tx.objectStore(STORE).put(rec);
    q.onerror = () => reject(q.error);
    tx.oncomplete = () => resolve();
  });
}

function idbDeleteRecord(recordKey) {
  return new Promise((resolve, reject) => {
    if (!_db) {
      resolve();
      return;
    }
    const tx = _db.transaction(STORE, "readwrite");
    const q = tx.objectStore(STORE).delete(recordKey);
    q.onerror = () => reject(q.error);
    tx.oncomplete = () => resolve();
  });
}

/** 부팅용 동기 읽기 — IndexedDB 대기 없이 localStorage 미러만 */
export function readTimeLedgerRowsLocalMirrorSync(uid = getActiveClientStorageUserId()) {
  return readLocalStorageRows(uid);
}

function readLocalStorageRows(uid = getActiveClientStorageUserId()) {
  try {
    const raw = getScopedLocalStorageItem(TIME_LEDGER_STORAGE_KEY, uid);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch (_) {
    return [];
  }
}

/**
 * IndexedDB에 없으면 localStorage(계정 스코프) → IDB 1회 이전
 */
export async function migrateFromLocalStorageIfNeeded(uid = getActiveClientStorageUserId()) {
  if (!String(uid || "").trim()) return;
  migrateLegacyLocalStorageToScoped(TIME_LEDGER_STORAGE_KEY, uid);
  await openDatabase();
  const recordKey = resolveIdbRecordKey(uid);
  const rec = await idbGetRecord(recordKey);
  if (rec && Array.isArray(rec.rows)) return;
  const fromLs = readLocalStorageRows(uid);
  if (fromLs.length === 0) return;
  await idbPutRecord(recordKey, fromLs);
}

/**
 * @returns {Promise<unknown[]>}
 */
export async function readAllRowsFromIdb(uid = getActiveClientStorageUserId()) {
  const u = String(uid || "").trim();
  if (!u) return [];
  await migrateFromLocalStorageIfNeeded(u);
  await openDatabase();
  const rec = await idbGetRecord(resolveIdbRecordKey(u));
  if (rec && Array.isArray(rec.rows)) return rec.rows;
  return [];
}

/**
 * @param {unknown[]} rows
 */
export async function writeAllRowsToIdb(rows, uid = getActiveClientStorageUserId()) {
  const u = String(uid || "").trim();
  if (!u) return;
  await openDatabase();
  const arr = Array.isArray(rows) ? rows : [];
  await idbPutRecord(resolveIdbRecordKey(u), arr);
  tryMirrorTimeLedgerToLocalStorage(arr, u);
}

/** 로그아웃 등 — 해당 계정 IDB 스냅샷만 제거 */
export async function purgeTimeLedgerIdbForUser(uid) {
  const u = String(uid || "").trim();
  if (!u) return;
  try {
    await openDatabase();
    await idbDeleteRecord(resolveIdbRecordKey(u));
  } catch (_) {}
}

let _lsMirrorWarned = false;

/**
 * 동일 키로 localStorage 미러(용량·호환). 실패 시 한 번만 안내.
 * @param {unknown[]} rows
 */
export function tryMirrorTimeLedgerToLocalStorage(
  rows,
  uid = getActiveClientStorageUserId(),
) {
  try {
    setScopedLocalStorageItem(
      TIME_LEDGER_STORAGE_KEY,
      JSON.stringify(rows),
      uid,
    );
  } catch (_) {
    if (!_lsMirrorWarned) _lsMirrorWarned = true;
  }
}
