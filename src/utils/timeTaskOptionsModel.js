/**
 * 시간가계부 과제 옵션 (localStorage + 고유 id + Supabase 동기화용)
 */

import * as C from "./timeTaskOptionsConstants.js";
import { getKpiSyncedTaskNames } from "./timeKpiSync.js";
import { isUuid, UUID_RE } from "./idUtils.js";
import {
  readTimeLedgerEntriesRaw,
  writeTimeLedgerEntriesRaw,
} from "./timeLedgerEntriesModel.js";

export { isUuid };
export const TASK_OPTIONS_KEY = "time_task_options";
export const TIME_TASK_LOG_ROWS_KEY = "time_task_log_rows";

/** 내장 과제명 → 코드 기준 분류 (결정적 id용) */
const BUILTIN_BY_NAME = new Map();
for (const t of C.getBuiltinTaskTemplates()) {
  BUILTIN_BY_NAME.set(t.name, t);
}

function findBuiltinByName(name) {
  return BUILTIN_BY_NAME.get(name) || null;
}

export function isBuiltinTaskName(name) {
  return findBuiltinByName(name) != null;
}

/** 이름·생산성·카테고리 기반 결정적 UUID (고정 과제용, 앱 버전 간 동일) */
export function deterministicTaskId(name, productivity, category) {
  const s = `${String(name)}\0${String(productivity ?? "")}\0${String(category ?? "")}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let h2 = h;
  const parts = [];
  for (let k = 0; k < 8; k++) {
    h2 = Math.imul(h2 ^ (h2 >>> 15), 2246822519);
    /* (x & 0xffffffff).toString(16) 은 JS 부호 있는 32비트로 음수가 되어 '-'가 붙을 수 있음 → >>> 0 만 사용 */
    parts.push((h2 >>> 0).toString(16).padStart(8, "0"));
  }
  const p = parts.join("");
  return `${p.slice(0, 8)}-${p.slice(8, 12)}-4${p.slice(13, 16)}-a${p.slice(17, 20)}-${p.slice(20, 32)}`;
}

function normalizeProductivity(p) {
  const x = (p || "").trim();
  if (x === "productive" || x === "nonproductive" || x === "other") return x;
  return "productive";
}

function getLockedTaskNamesStatic() {
  return new Set([
    ...C.FIXED_OTHER_TASKS.map((t) => t.name),
    ...C.FIXED_PRODUCTIVE_TASKS.map((t) => t.name),
    ...C.FIXED_NONPRODUCTIVE_TASKS.map((t) => t.name),
    ...C.TASKS_LOCKED_FOR_EDIT,
    ...getKpiSyncedTaskNames(),
  ]);
}

function notifySaved() {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("time-ledger-tasks-saved"));
    }
  } catch (_) {}
}

function saveMergedList(list) {
  try {
    localStorage.setItem(TASK_OPTIONS_KEY, JSON.stringify(list));
    notifySaved();
  } catch (_) {}
}

function assignIdsToMergedList(merged) {
  let dirty = false;
  const out = merged.map((t) => {
    const idIn = (t.id || "").trim();
    if (isUuid(idIn)) return { ...t, id: idIn };
    dirty = true;
    const builtin = findBuiltinByName(t.name);
    if (builtin) {
      return {
        ...t,
        productivity: t.productivity || builtin.productivity,
        category: t.category || builtin.category,
        memo: t.memo || "",
        id: deterministicTaskId(
          t.name,
          builtin.productivity,
          builtin.category,
        ),
      };
    }
    const uid =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `t-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    return { ...t, memo: t.memo || "", id: uid };
  });
  if (dirty) saveMergedList(out);
  return out;
}

export function getFullTaskOptions() {
  let arr = [];
  try {
    const raw = localStorage.getItem(TASK_OPTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        arr = parsed.map((o) =>
          typeof o === "string"
            ? {
                name: o,
                category: "",
                productivity: "productive",
                memo: "",
                id: "",
              }
            : {
                name: o.name || "",
                category: o.category || "",
                productivity: o.productivity || "productive",
                memo: o.memo || "",
                id: o.id || "",
              },
        );
      }
    }
  } catch (_) {}

  let merged;
  if (arr.length === 0) {
    merged = C.getBuiltinTaskTemplates().map((t) => ({ ...t, memo: "" }));
  } else {
    const fixedOtherNames = new Set(C.FIXED_OTHER_TASKS.map((t) => t.name));
    const fixedProdNames = new Set(C.FIXED_PRODUCTIVE_TASKS.map((t) => t.name));
    const fixedNonProdNames = new Set(
      C.FIXED_NONPRODUCTIVE_TASKS.map((t) => t.name),
    );
    const replacedNames = new Set(C.REPLACED_TASK_NAMES);
    const others = arr.filter(
      (o) =>
        !fixedOtherNames.has(o.name) &&
        !fixedProdNames.has(o.name) &&
        !fixedNonProdNames.has(o.name) &&
        !replacedNames.has(o.name),
    );
    /* 이름별로 저장본이 있으면 id·memo 등 유지 (상수만 쓰면 id가 비어 매번 dirty → 저장·동기화 루프) */
    const byName = new Map(arr.map((o) => [o.name, o]));
    const hydrateFixed = (t) => {
      const s = byName.get(t.name);
      if (!s) return { ...t, memo: "" };
      return {
        ...t,
        memo: (s.memo || "").trim(),
        id: (s.id || "").trim(),
      };
    };
    merged = [
      ...C.FIXED_OTHER_TASKS.map(hydrateFixed),
      ...C.FIXED_PRODUCTIVE_TASKS.map(hydrateFixed),
      ...C.FIXED_NONPRODUCTIVE_TASKS.map(hydrateFixed),
      ...others,
    ];
  }
  return assignIdsToMergedList(merged);
}

/** localStorage 직접 수정(예: KPI 추가) 후 UUID 부여·Supabase 푸시 예약 */
export function notifyTimeLedgerTasksChanged() {
  getFullTaskOptions();
  notifySaved();
}

export function getTaskOptions() {
  return getFullTaskOptions().map((o) => o.name);
}

export function getTaskOptionByName(name) {
  const n = (name || "").trim();
  if (!n) return null;
  return getFullTaskOptions().find((o) => o.name === n) || null;
}

export function addTaskOption(name) {
  const opts = getFullTaskOptions();
  const trimmed = (name || "").trim();
  if (!trimmed || opts.some((o) => o.name === trimmed)) return opts;
  const next = [
    {
      name: trimmed,
      category: "",
      productivity: "productive",
      memo: "",
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `t-${Date.now()}`,
    },
    ...opts,
  ];
  saveMergedList(next);
  return next;
}

export function addTaskOptionFull(task) {
  const opts = getFullTaskOptions();
  const name = (task?.name || "").trim();
  if (!name || opts.some((o) => o.name === name)) return opts;
  const row = {
    name,
    category: task.category || "",
    productivity: task.productivity || "productive",
    memo: task.memo || "",
    id:
      task.id && isUuid(String(task.id))
        ? String(task.id).trim()
        : typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `t-${Date.now()}`,
  };
  const next = [row, ...opts];
  saveMergedList(next);
  return next;
}

export function patchTimeLogRowsOnTaskRename({ taskId, oldName, newName }) {
  const oid = (taskId || "").trim();
  const on = (oldName || "").trim();
  const nn = (newName || "").trim();
  if (!nn || (!oid && !on)) return;
  try {
    const arr = readTimeLedgerEntriesRaw();
    if (!arr.length) return;
    let changed = false;
    const next = arr.map((r) => {
      const name = (r.taskName || "").trim();
      const rid = (r.taskId || "").trim();
      if (oid && rid === oid) {
        changed = true;
        return { ...r, taskName: nn, taskId: oid };
      }
      if (oid && !rid && on && name === on) {
        changed = true;
        return { ...r, taskName: nn, taskId: oid };
      }
      if (!oid && on && name === on) {
        changed = true;
        return { ...r, taskName: nn };
      }
      return r;
    });
    if (changed) {
      writeTimeLedgerEntriesRaw(next);
    }
  } catch (_) {}
}

export function updateTaskOption(oldName, task) {
  if (getLockedTaskNamesStatic().has(oldName)) return getFullTaskOptions();
  const opts = getFullTaskOptions();
  const idx = opts.findIndex((o) => o.name === oldName);
  if (idx < 0) return opts;
  const name = (task?.name || "").trim();
  if (!name) return opts;
  const prevId = (opts[idx].id || "").trim();
  let nextId = isUuid(prevId) ? prevId : opts[idx].id;
  if (!isUuid(String(nextId || "").trim())) {
    nextId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `t-${Date.now()}`;
  }
  if (name !== oldName) {
    patchTimeLogRowsOnTaskRename({
      taskId: String(nextId).trim(),
      oldName,
      newName: name,
    });
  }
  if (name !== oldName && opts.some((o, i) => i !== idx && o.name === name)) {
    const removedId = opts[idx].id;
    opts.splice(idx, 1);
    saveMergedList(opts);
    scheduleDeleteTimeLedgerTaskOnServer(removedId);
    return opts;
  }
  opts[idx] = {
    id: String(nextId).trim(),
    name,
    category: task.category || "",
    productivity: task.productivity || "productive",
    memo: task.memo || "",
  };
  saveMergedList(opts);
  return opts;
}

/** 로컬에서 제거된 과제 id를 Supabase time_ledger_tasks 에서도 삭제 (동적 import로 순환 참조 방지) */
function scheduleDeleteTimeLedgerTaskOnServer(id) {
  const rid = String(id || "").trim();
  if (!isUuid(rid)) return;
  void import("./timeLedgerTasksSupabase.js").then((m) => {
    m.deleteTimeLedgerTaskRowForCurrentUser(rid).catch(() => {});
  });
}

/**
 * KPI 삭제·탭 삭제로 연동이 끊길 때 시간가계부 과제 목록에서 이름 제거.
 * `removeTaskOption`은 KPI에서 붙인 과제명이 잠겨 있어 삭제에 실패하므로 별도 경로.
 * 서버 `time_ledger_tasks` 행도 삭제해 pull·Realtime 시 부활 방지.
 */
export function removeTimeLedgerTaskOptionByNameForKpi(name) {
  const n = (name || "").trim();
  if (!n) return;
  const opts = getFullTaskOptions();
  const target = opts.find((o) => (o.name || "").trim() === n);
  const removedId =
    target && isUuid(String(target.id || "").trim())
      ? String(target.id).trim()
      : "";
  const next = opts.filter((o) => (o.name || "").trim() !== n);
  saveMergedList(next);
  if (removedId) scheduleDeleteTimeLedgerTaskOnServer(removedId);
}

/** @returns {boolean} true면 목록에서 실제로 제거됨(KPI 연동 등 잠금이면 false) */
export function removeTaskOption(name) {
  const n = (name || "").trim();
  if (!n) return false;
  if (getLockedTaskNamesStatic().has(n)) return false;
  const opts = getFullTaskOptions();
  const target = opts.find((o) => o.name === n);
  const removedId =
    target && isUuid(String(target.id || "").trim())
      ? String(target.id).trim()
      : "";
  const next = opts.filter((o) => o.name !== n);
  saveMergedList(next);
  if (removedId) scheduleDeleteTimeLedgerTaskOnServer(removedId);
  return true;
}

export function migrateTimeLogRowsTaskIds() {
  const opts = getFullTaskOptions();
  const byName = new Map(
    opts.map((o) => [(o.name || "").trim(), o]).filter(([k]) => k),
  );
  try {
    const arr = readTimeLedgerEntriesRaw();
    if (!Array.isArray(arr) || arr.length === 0) return;
    let changed = false;
    const next = arr.map((r) => {
      if ((r.taskId || "").trim()) return r;
      const n = (r.taskName || "").trim();
      const o = byName.get(n);
      if (o?.id && isUuid(String(o.id))) {
        changed = true;
        return { ...r, taskId: String(o.id).trim() };
      }
      return r;
    });
    if (changed) {
      writeTimeLedgerEntriesRaw(next);
    }
  } catch (_) {}
}

function readStoredTaskOptionRows() {
  try {
    const raw = localStorage.getItem(TASK_OPTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((o) =>
      typeof o === "string"
        ? { name: o, category: "", productivity: "productive", memo: "", id: "" }
        : {
            name: (o?.name || "").trim(),
            category: (o?.category || "").trim(),
            productivity: o?.productivity || "productive",
            memo: (o?.memo || "").trim(),
            id: (o?.id || "").trim(),
          },
    );
  } catch (_) {
    return [];
  }
}

/** 서버에서 내려받은 행으로 로컬 과제 목록 덮기·병합 */
export function applyTimeLedgerTasksFromServer(serverRows) {
  if (!Array.isArray(serverRows) || serverRows.length === 0) return false;
  const byId = new Map(
    serverRows.map((r) => [String(r.id || "").trim(), r]).filter(([k]) => k),
  );
  const builtinTemplates = C.getBuiltinTaskTemplates();
  const builtInIdSet = new Set(
    builtinTemplates.map((t) =>
      deterministicTaskId(t.name, t.productivity, t.category),
    ),
  );
  const out = [];
  for (const t of builtinTemplates) {
    const id = deterministicTaskId(t.name, t.productivity, t.category);
    const s = byId.get(id);
    if (s) {
      out.push({
        id: String(s.id || id).trim(),
        name: ((s.name || "").trim() || t.name).trim(),
        category:
          s.category != null && String(s.category).trim() !== ""
            ? String(s.category).trim()
            : t.category,
        productivity: normalizeProductivity(s.productivity || t.productivity),
        memo: (s.memo || "").trim(),
      });
    } else {
      out.push({ ...t, memo: "", id });
    }
  }
  for (const r of serverRows) {
    const rid = String(r.id || "").trim();
    if (!rid || builtInIdSet.has(rid)) continue;
    out.push({
      id: rid,
      name: (r.name || "").trim(),
      category: (r.category || "").trim(),
      productivity: normalizeProductivity(r.productivity),
      memo: (r.memo || "").trim(),
    });
  }
  /* KPI가 막 추가돼 서버에 아직 없을 때: pull이 로컬만 덮어쓰지 않도록 kpiTaskSync 과제 유지 */
  const namesInOut = new Set(
    out.map((t) => (t.name || "").trim()).filter(Boolean),
  );
  const kpiSyncedNames = getKpiSyncedTaskNames();
  if (kpiSyncedNames.size > 0) {
    for (const row of readStoredTaskOptionRows()) {
      const n = (row.name || "").trim();
      if (!n || !kpiSyncedNames.has(n) || namesInOut.has(n)) continue;
      let rid = String(row.id || "").trim();
      if (!isUuid(rid)) {
        rid =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `t-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      }
      out.push({
        id: rid,
        name: n,
        category: (row.category || "").trim(),
        productivity: normalizeProductivity(row.productivity),
        memo: (row.memo || "").trim(),
      });
      namesInOut.add(n);
    }
  }
  const order = new Map(
    serverRows.map((r, i) => [String(r.id || "").trim(), r.sort_order ?? i]),
  );
  out.sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999));
  saveMergedList(out);
  return true;
}

export function buildTimeLedgerTasksUpsertPayloads(userId) {
  const list = getFullTaskOptions();
  return list.map((t, sort_order) => ({
    id: String(t.id || "").trim(),
    user_id: userId,
    name: (t.name || "").trim(),
    productivity: normalizeProductivity(t.productivity),
    category: (t.category || "").trim(),
    memo: (t.memo || "").trim(),
    sort_order,
    is_system: isBuiltinTaskName(t.name),
  })).filter((p) => isUuid(p.id));
}
