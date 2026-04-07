/**
 * 시간가계부 기록 행(time_task_log_rows) 영속화 — IndexedDB 우선 (용량 한도 대비).
 * localStorage는 1회 마이그레이션·선택적 미러링(용량 초과 시 생략).
 */

export const TIME_LEDGER_STORAGE_KEY = "time_task_log_rows";

const DB_NAME = "lp-time-ledger-v1";
const DB_VERSION = 1;
const STORE = "ledger";

const RECORD_KEY = "time_task_log_rows";

/** @type {IDBDatabase | null} */
let _db = null;

/** @type {Promise<void> | null} */
let _opening = null;

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
function idbGetRecord() {
  return new Promise((resolve, reject) => {
    if (!_db) {
      resolve(undefined);
      return;
    }
    const tx = _db.transaction(STORE, "readonly");
    const q = tx.objectStore(STORE).get(RECORD_KEY);
    q.onerror = () => reject(q.error);
    q.onsuccess = () => resolve(q.result);
  });
}

/**
 * @param {unknown[]} rows
 */
function idbPutRecord(rows) {
  return new Promise((resolve, reject) => {
    if (!_db) {
      resolve();
      return;
    }
    const rec = { key: RECORD_KEY, rows };
    const tx = _db.transaction(STORE, "readwrite");
    const q = tx.objectStore(STORE).put(rec);
    q.onerror = () => reject(q.error);
    tx.oncomplete = () => resolve();
  });
}

function readLocalStorageRows() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(TIME_LEDGER_STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch (_) {
    return [];
  }
}

/**
 * IndexedDB에 없으면 localStorage → IDB 1회 이전
 */
export async function migrateFromLocalStorageIfNeeded() {
  await openDatabase();
  const rec = await idbGetRecord();
  /* 스냅샷이 이미 있으면(빈 배열 포함) 덮어쓰지 않음 */
  if (rec && Array.isArray(rec.rows)) return;
  const fromLs = readLocalStorageRows();
  if (fromLs.length === 0) return;
  await idbPutRecord(fromLs);
}

/**
 * @returns {Promise<unknown[]>}
 */
export async function readAllRowsFromIdb() {
  await openDatabase();
  const rec = await idbGetRecord();
  if (rec && Array.isArray(rec.rows)) return rec.rows;
  return [];
}

/**
 * @param {unknown[]} rows
 */
export async function writeAllRowsToIdb(rows) {
  await openDatabase();
  const arr = Array.isArray(rows) ? rows : [];
  await idbPutRecord(arr);
}

let _lsMirrorWarned = false;

/**
 * 동일 키로 localStorage 미러(용량·호환). 실패 시 한 번만 안내.
 * @param {unknown[]} rows
 */
export function tryMirrorTimeLedgerToLocalStorage(rows) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(TIME_LEDGER_STORAGE_KEY, JSON.stringify(rows));
  } catch (_) {
    if (!_lsMirrorWarned) _lsMirrorWarned = true;
  }
}
