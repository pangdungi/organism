/**
 * 전체 할일 — KPI가 아닌 시간기록 기본 과제의 할일 목록
 * 로컬은 캐시, 진실은 서버 all_todos_builtin_items
 */

import { supabase } from "../supabase.js";
import {
  getScopedLocalStorageItem,
  setScopedLocalStorageItem,
} from "./clientStorageScope.js";
import { sortNormalizedKpiTodoRows } from "./kpiMapTodoListOrder.js";
import {
  localEntityTimeMs,
  mergeRowsByLwwWithServerOrder,
  parseIsoMs,
} from "./kpiMapLwwMerge.js";

export const ALL_TODOS_BUILTIN_STORAGE_KEY = "all-todos-builtin";

export const ALL_TODOS_BUILTIN_LISTS = [
  { key: "work", name: "근무하기" },
  { key: "prod_spend", name: "생산적 소비" },
  { key: "nonprod_spend", name: "비생산적 소비" },
  { key: "prod_out", name: "생산적 외출" },
  { key: "nonprod_out", name: "비생산적 외출" },
  { key: "prod_talk", name: "생산적 대화" },
  { key: "nonprod_talk", name: "비생산적 대화" },
  { key: "reading_notes", name: "독서 노트 쓰기" },
  { key: "time_mgmt", name: "시간 관리 관련 행동" },
];

const LIST_KEY_SET = new Set(ALL_TODOS_BUILTIN_LISTS.map((x) => x.key));
const TABLE = "all_todos_builtin_items";
const UPSERT_CONFLICT = "user_id,id";

function nextId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/** @returns {Record<string, Array<{ id: string, text: string, completed: boolean, sortOrder?: number, localModifiedAt?: number, serverUpdatedAt?: string }>>} */
function emptyByList() {
  /** @type {ReturnType<typeof emptyByList>} */
  const out = {};
  for (const list of ALL_TODOS_BUILTIN_LISTS) out[list.key] = [];
  return out;
}

function uniqDeleted(arr) {
  const seen = new Set();
  const out = [];
  for (const x of Array.isArray(arr) ? arr : []) {
    const id = String(x?.id || x || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      localModifiedAt:
        typeof x?.localModifiedAt === "number" && Number.isFinite(x.localModifiedAt)
          ? x.localModifiedAt
          : Date.now(),
    });
  }
  return out;
}

function mapStoredTodo(t) {
  const id = String(t?.id || "").trim();
  const text = String(t?.text || "").trim();
  if (!id || !text) return null;
  const lm = Number(t?.localModifiedAt);
  const su = String(t?.serverUpdatedAt || "").trim();
  return {
    id,
    text,
    completed: !!t?.completed,
    sortOrder: typeof t?.sortOrder === "number" ? t.sortOrder : undefined,
    localModifiedAt: Number.isFinite(lm) && lm > 0 ? lm : undefined,
    serverUpdatedAt: su || undefined,
  };
}

function readLocalStore() {
  const lists = emptyByList();
  let deleted = [];
  let localMetaModifiedAt = 0;
  let serverWatermarkMs = 0;
  try {
    const raw = getScopedLocalStorageItem(ALL_TODOS_BUILTIN_STORAGE_KEY);
    if (!raw) return { lists, deleted, localMetaModifiedAt, serverWatermarkMs };
    const parsed = JSON.parse(raw);
    const src = parsed?.lists && typeof parsed.lists === "object" ? parsed.lists : {};
    for (const list of ALL_TODOS_BUILTIN_LISTS) {
      const rows = Array.isArray(src[list.key]) ? src[list.key] : [];
      lists[list.key] = sortNormalizedKpiTodoRows(
        rows.map(mapStoredTodo).filter(Boolean),
      );
    }
    deleted = uniqDeleted(parsed?.deleted);
    const meta = Number(parsed?.localMetaModifiedAt);
    localMetaModifiedAt = Number.isFinite(meta) && meta > 0 ? meta : 0;
    const wm = Number(parsed?.serverWatermarkMs);
    serverWatermarkMs = Number.isFinite(wm) && wm > 0 ? wm : 0;
  } catch (_) {}
  return { lists, deleted, localMetaModifiedAt, serverWatermarkMs };
}

function readLocalByList() {
  return readLocalStore().lists;
}

function writeLocalStore(store) {
  const lists = emptyByList();
  for (const list of ALL_TODOS_BUILTIN_LISTS) {
    lists[list.key] = Array.isArray(store?.lists?.[list.key])
      ? store.lists[list.key]
      : [];
  }
  setScopedLocalStorageItem(
    ALL_TODOS_BUILTIN_STORAGE_KEY,
    JSON.stringify({
      lists,
      deleted: uniqDeleted(store?.deleted),
      localMetaModifiedAt: Number(store?.localMetaModifiedAt) || 0,
      serverWatermarkMs: Number(store?.serverWatermarkMs) || 0,
    }),
  );
}

function writeLocalByList(byList) {
  const prev = readLocalStore();
  writeLocalStore({ ...prev, lists: byList });
}

function stampLocalNow() {
  return Date.now();
}

function localTodosMaxMs(store) {
  let max = Number(store?.localMetaModifiedAt) || 0;
  max = Math.max(max, Number(store?.serverWatermarkMs) || 0);
  for (const list of ALL_TODOS_BUILTIN_LISTS) {
    for (const t of store?.lists?.[list.key] || []) {
      max = Math.max(max, localEntityTimeMs(t));
    }
  }
  for (const d of store?.deleted || []) {
    max = Math.max(max, Number(d?.localModifiedAt) || 0);
  }
  return max;
}

let persistTail = Promise.resolve();
function enqueueBuiltinPersist(job) {
  persistTail = persistTail.then(() => job()).catch(() => false);
  return persistTail;
}

async function whenBuiltinPersistIdle() {
  await persistTail;
}

async function persistUntilOk(job, tries = 3) {
  for (let i = 0; i < tries; i += 1) {
    try {
      if (await job()) return true;
    } catch (_) {}
  }
  return false;
}

function toRow(userId, listKey, todo, sortIndex) {
  return {
    user_id: userId,
    id: String(todo.id),
    list_key: listKey,
    text: String(todo.text || "").trim(),
    completed: !!todo.completed,
    extra: { sortOrder: sortIndex },
    updated_at: new Date().toISOString(),
  };
}

/**
 * @returns {{
 *   storageKey: string,
 *   domain: string,
 *   domainLabel: string,
 *   kpiId: string,
 *   kpiName: string,
 *   isChore: boolean,
 *   isBuiltin: boolean,
 *   rows: Array<{ id: string, text: string, completed: boolean }>,
 *   open: Array<{ id: string, text: string, completed: boolean }>,
 *   done: Array<{ id: string, text: string, completed: boolean }>,
 * }[]}
 */
export function collectBuiltinAllTodoGroups() {
  const byList = readLocalByList();
  return ALL_TODOS_BUILTIN_LISTS.map((list) => {
    const rows = (byList[list.key] || []).map((t) => ({
      id: t.id,
      text: t.text,
      completed: !!t.completed,
    }));
    return {
      storageKey: ALL_TODOS_BUILTIN_STORAGE_KEY,
      domain: "builtin",
      domainLabel: "기본",
      kpiId: list.key,
      kpiName: list.name,
      isChore: false,
      isBuiltin: true,
      rows,
      open: rows.filter((r) => !r.completed),
      done: rows.filter((r) => r.completed),
    };
  });
}

export function isAllTodosBuiltinListKey(key) {
  return LIST_KEY_SET.has(String(key || "").trim());
}

export function builtinListKeyFromTaskName(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  const hit = ALL_TODOS_BUILTIN_LISTS.find((x) => x.name === n);
  return hit ? hit.key : "";
}

/**
 * 오늘의 행동 id·과제명 → 기본 목록 키
 * @param {string} actionId
 * @param {string} [name]
 */
export function resolveBuiltinListKeyFromActionId(actionId, name) {
  const raw = String(actionId || "").trim();
  if (isAllTodosBuiltinListKey(raw)) return raw;
  if (raw.startsWith("builtin:")) {
    const k = raw.slice("builtin:".length).trim();
    if (isAllTodosBuiltinListKey(k)) return k;
  }
  if (raw.startsWith("schedule:")) {
    const rest = raw.slice("schedule:".length);
    for (const part of rest.split(":")) {
      const k = builtinListKeyFromTaskName(part);
      if (k) return k;
    }
  }
  return builtinListKeyFromTaskName(name);
}

export function lookupBuiltinTodoById(todoId) {
  const tid = String(todoId || "").trim();
  if (!tid) return null;
  const byList = readLocalByList();
  for (const list of ALL_TODOS_BUILTIN_LISTS) {
    const todo = (byList[list.key] || []).find((t) => t.id === tid);
    if (todo) return { listKey: list.key, listName: list.name, todo };
  }
  return null;
}

export function lookupBuiltinTodoCompleted(todoId) {
  const found = lookupBuiltinTodoById(todoId);
  if (!found) return null;
  return !!found.todo.completed;
}

export function getBuiltinTodoTextById(todoId) {
  const found = lookupBuiltinTodoById(todoId);
  return found ? String(found.todo.text || "").trim() : "";
}

/**
 * @param {string} listKey
 * @param {{ includeIds?: string[] }} [opts]
 */
export function getBuiltinTaskCompletionTodoInfo(listKey, opts = {}) {
  const key = String(listKey || "").trim();
  const list = ALL_TODOS_BUILTIN_LISTS.find((x) => x.key === key);
  if (!list) return null;
  const includeIds = new Set(
    (Array.isArray(opts.includeIds) ? opts.includeIds : [])
      .map((x) => String(x || "").trim())
      .filter(Boolean),
  );
  const rows = readLocalByList()[key] || [];
  const includeCompleted = opts.includeCompleted === true;
  const todos = rows
    .filter((t) => {
      if (!t.text) return false;
      if (!t.completed) return true;
      if (includeCompleted) return true;
      return includeIds.has(t.id);
    })
    .map((t) => ({
      id: t.id,
      text: t.text,
      completed: !!t.completed,
    }));
  return {
    storageKey: ALL_TODOS_BUILTIN_STORAGE_KEY,
    kpiId: key,
    kpiName: list.name,
    useTaskCompletionGoal: true,
    isBuiltin: true,
    todos,
  };
}

export function syncBuiltinTodoCompleted(todoId, completed) {
  const found = lookupBuiltinTodoById(todoId);
  if (!found) return false;
  return toggleBuiltinAllTodo(found.listKey, todoId, !!completed);
}

/** @param {string} listKey @param {string} text @returns {string} 새 id 또는 빈 문자열 */
export function addBuiltinAllTodo(listKey, text) {
  const key = String(listKey || "").trim();
  const val = String(text || "").trim();
  if (!LIST_KEY_SET.has(key) || !val) return "";
  const byList = readLocalByList();
  const rows = byList[key] || [];
  const added = {
    id: nextId(),
    text: val,
    completed: false,
    sortOrder: rows.length,
    localModifiedAt: stampLocalNow(),
  };
  rows.push(added);
  byList[key] = rows;
  writeLocalByList(byList);
  void enqueueBuiltinPersist(() => persistBuiltinTodoLatest(key, added.id));
  return added.id;
}

/** @param {string} listKey @param {string} todoId @param {string} text */
export function updateBuiltinAllTodo(listKey, todoId, text) {
  const key = String(listKey || "").trim();
  const id = String(todoId || "").trim();
  const val = String(text || "").trim();
  if (!LIST_KEY_SET.has(key) || !id || !val) return false;
  const byList = readLocalByList();
  const rows = byList[key] || [];
  const idx = rows.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  rows[idx] = { ...rows[idx], text: val, localModifiedAt: stampLocalNow() };
  byList[key] = rows;
  writeLocalByList(byList);
  void enqueueBuiltinPersist(() => persistBuiltinTodoLatest(key, id));
  return true;
}

/** @param {string} listKey @param {string} todoId */
export function removeBuiltinAllTodo(listKey, todoId) {
  const key = String(listKey || "").trim();
  const id = String(todoId || "").trim();
  if (!LIST_KEY_SET.has(key) || !id) return false;
  const byList = readLocalByList();
  const rows = byList[key] || [];
  const next = rows.filter((t) => t.id !== id);
  if (next.length === rows.length) return false;
  byList[key] = next;
  const prev = readLocalStore();
  writeLocalStore({
    ...prev,
    lists: byList,
    deleted: uniqDeleted([...prev.deleted, { id, localModifiedAt: stampLocalNow() }]),
    localMetaModifiedAt: stampLocalNow(),
  });
  void enqueueBuiltinPersist(() => persistBuiltinTodoDelete(id));
  return true;
}

/** 완료한 할일만 목록·서버에서 지움. 시간기록은 건드리지 않음. */
export async function purgeCompletedBuiltinAllTodos(listKey) {
  const key = String(listKey || "").trim();
  if (!LIST_KEY_SET.has(key)) return 0;
  const byList = readLocalByList();
  const rows = byList[key] || [];
  const toRemove = rows.filter((t) => t.completed);
  if (!toRemove.length) return 0;
  byList[key] = rows.filter((t) => !t.completed);
  const now = stampLocalNow();
  const prev = readLocalStore();
  writeLocalStore({
    ...prev,
    lists: byList,
    deleted: uniqDeleted([
      ...prev.deleted,
      ...toRemove.map((t) => ({ id: t.id, localModifiedAt: now })),
    ]),
    localMetaModifiedAt: now,
  });
  for (const t of toRemove) {
    void enqueueBuiltinPersist(() => persistBuiltinTodoDelete(t.id));
  }
  return toRemove.length;
}

/** @param {string} listKey @param {string} todoId @param {boolean} completed */
export function toggleBuiltinAllTodo(listKey, todoId, completed) {
  const key = String(listKey || "").trim();
  const id = String(todoId || "").trim();
  if (!LIST_KEY_SET.has(key) || !id) return false;
  const byList = readLocalByList();
  const rows = byList[key] || [];
  const idx = rows.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  rows[idx] = {
    ...rows[idx],
    completed: !!completed,
    localModifiedAt: stampLocalNow(),
  };
  byList[key] = rows;
  writeLocalByList(byList);
  void enqueueBuiltinPersist(() => persistBuiltinTodoLatest(key, id));
  return true;
}

async function persistBuiltinTodoLatest(listKey, todoId) {
  return persistUntilOk(async () => {
    const userId = await getSessionUserId();
    if (!userId || !supabase) return false;
    const id = String(todoId || "").trim();
    const rows = readLocalByList()[listKey] || [];
    const idx = rows.findIndex((t) => t.id === id);
    if (idx < 0) {
      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("user_id", userId)
        .eq("id", id);
      return !error;
    }
    const { error } = await supabase.from(TABLE).upsert(
      toRow(userId, listKey, rows[idx], idx),
      { onConflict: UPSERT_CONFLICT },
    );
    return !error;
  });
}

async function persistBuiltinTodoDelete(todoId) {
  return persistUntilOk(async () => {
    const userId = await getSessionUserId();
    if (!userId || !supabase) return false;
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("user_id", userId)
      .eq("id", String(todoId || "").trim());
    return !error;
  });
}

function serverRowToTodo(r) {
  const extra =
    r.extra && typeof r.extra === "object" && !Array.isArray(r.extra)
      ? r.extra
      : {};
  const updatedAt = String(r.updated_at || "").trim();
  return {
    id: String(r.id || "").trim(),
    text: String(r.text || "").trim(),
    completed: !!r.completed,
    sortOrder: typeof extra.sortOrder === "number" ? extra.sortOrder : undefined,
    serverUpdatedAt: updatedAt || undefined,
  };
}

async function fetchBuiltinServerMaxUpdatedAtMs(userId) {
  if (!userId || !supabase) return 0;
  const { data, error } = await supabase
    .from(TABLE)
    .select("updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) return 0;
  return parseIsoMs(data?.[0]?.updated_at);
}

/** KPI와 동일 — 서버가 로컬보다 새로울 때만 pull */
export async function probeBuiltinAllTodosServerStale() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    return { stale: false, serverMs: 0, localMs: 0, userId: "" };
  }
  const serverMs = await fetchBuiltinServerMaxUpdatedAtMs(userId);
  const localMs = localTodosMaxMs(readLocalStore());
  return {
    stale: serverMs > localMs,
    serverMs,
    localMs,
    userId,
  };
}

export async function pullBuiltinAllTodosFromServerIfStale() {
  const probe = await probeBuiltinAllTodosServerStale();
  if (!probe.stale) return false;
  return pullBuiltinAllTodosFromServer();
}

/** 받은 행과 로컬을 행 단위로 맞춤. 방금 고친 로컬·지운 id는 덮지 않음. 실패면 로컬 유지 */
export async function pullBuiltinAllTodosFromServer() {
  await whenBuiltinPersistIdle();
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, list_key, text, completed, extra, updated_at")
    .eq("user_id", userId);
  if (error) return false;
  const local = readLocalStore();
  const deletedSet = new Set((local.deleted || []).map((d) => d.id));
  const serverByList = emptyByList();
  const serverTsMap = new Map();
  const serverIds = new Set();
  let maxServerMs = 0;
  for (const r of data || []) {
    const key = String(r.list_key || "").trim();
    if (!LIST_KEY_SET.has(key)) continue;
    const todo = serverRowToTodo(r);
    if (!todo.id || !todo.text) continue;
    if (deletedSet.has(todo.id)) continue;
    serverByList[key].push(todo);
    const ts = parseIsoMs(r.updated_at);
    serverTsMap.set(todo.id, ts);
    serverIds.add(todo.id);
    maxServerMs = Math.max(maxServerMs, ts);
  }
  const byList = emptyByList();
  for (const list of ALL_TODOS_BUILTIN_LISTS) {
    const merged = mergeRowsByLwwWithServerOrder({
      localArr: local.lists[list.key] || [],
      serverArr: serverByList[list.key],
      serverTsMap,
      getId: (t) => t.id,
    }).filter((t) => t?.id && t?.text && !deletedSet.has(String(t.id)));
    byList[list.key] = sortNormalizedKpiTodoRows(merged);
  }
  writeLocalStore({
    lists: byList,
    deleted: (local.deleted || []).filter((d) => serverIds.has(d.id)),
    localMetaModifiedAt: local.localMetaModifiedAt,
    serverWatermarkMs: Math.max(Number(local.serverWatermarkMs) || 0, maxServerMs),
  });
  return true;
}
