/**
 * 시간가계부 과제 옵션 — **표시·편집 소스는 메모리 + 서버 pull**. localStorage(time_task_options) 미사용.
 */

import * as C from "./timeTaskOptionsConstants.js";
import { getKpiSyncedTaskNames } from "./kpiMapLocalStorage.js";
import { isUuid, UUID_RE } from "./idUtils.js";
import {
  readTimeLedgerEntriesRaw,
  writeTimeLedgerEntriesRaw,
} from "./timeLedgerEntriesModel.js";

export { isUuid };
export const TASK_OPTIONS_KEY = "time_task_options";
export const TIME_TASK_LOG_ROWS_KEY = "time_task_log_rows";

function taskRowsIdentitySig(rows) {
  try {
    return JSON.stringify(
      (rows || []).map((o) => ({
        name: (o.name || "").trim(),
        id: (o.id || "").trim(),
        kpiId: String(o.kpiId || "").trim(),
      })),
    );
  } catch (_) {
    return "";
  }
}

let _patchKpiLinkedFromMapsDepth = 0;

/** KPI 화면(kpis[])의 현재 이름·kpiId당 1행으로 메모리·서버 time_ledger_tasks 정리 */
function patchKpiLinkedTasksFromKpiMaps() {
  if (!_ledgerTasksMem || !Array.isArray(_ledgerTasksMem)) return;
  if (_patchKpiLinkedFromMapsDepth > 4) return;
  _patchKpiLinkedFromMapsDepth++;
  try {
    const dupIds = [];
    const seenKpi = new Set();
    const next = [];
    for (const o of _ledgerTasksMem) {
      const kid = String(o.kpiId || "").trim();
      const name = (o.name || "").trim();
      const row = {
        name,
        category: (o.category || "").trim(),
        productivity: o.productivity || "productive",
        memo: (o.memo || "").trim(),
        id: (o.id || "").trim(),
        kpiId: kid,
      };
      if (!kid) {
        next.push(row);
        continue;
      }
      if (seenKpi.has(kid)) {
        const oid = String(row.id || "").trim();
        if (isUuid(oid)) dupIds.push(oid);
        continue;
      }
      seenKpi.add(kid);
      next.push(row);
    }
    const nameByKpiKeeper = new Map();
    for (const row of next) {
      const kid = String(row.kpiId || "").trim();
      if (!kid) continue;
      const n = (row.name || "").trim();
      if (n) nameByKpiKeeper.set(n, row);
    }
    const nextSansNameDup = [];
    for (const row of next) {
      const kid = String(row.kpiId || "").trim();
      if (kid) {
        nextSansNameDup.push(row);
        continue;
      }
      const n = (row.name || "").trim();
      if (n && nameByKpiKeeper.has(n)) {
        const oid = String(row.id || "").trim();
        const keepId = String(nameByKpiKeeper.get(n).id || "").trim();
        if (isUuid(oid) && oid !== keepId) dupIds.push(oid);
        continue;
      }
      nextSansNameDup.push(row);
    }
    if (
      dupIds.length === 0 &&
      taskRowsIdentitySig(nextSansNameDup) === taskRowsIdentitySig(_ledgerTasksMem)
    ) {
      return;
    }
    const upsertIds = [
      ...new Set(
        nextSansNameDup
          .filter((o) => String(o.kpiId || "").trim())
          .map((o) => String(o.id || "").trim())
          .filter((id) => isUuid(id)),
      ),
    ];
    saveLedgerTaskList(nextSansNameDup, {
      bumpPullSkip: true,
      scheduleSyncPush: upsertIds.length > 0,
      upsertTaskIds: upsertIds.length ? upsertIds : null,
    });
    if (dupIds.length) {
      void import("./timeLedgerTasksSupabase.js").then(async (m) => {
        for (const id of dupIds) {
          try {
            await m.deleteTimeLedgerTaskRowForCurrentUser(id);
          } catch (_) {}
        }
      });
    }
  } finally {
    _patchKpiLinkedFromMapsDepth--;
  }
}

/** pull/저장으로만 채움. null = 아직 서버에서 로드 전(내장만 표시) */
let _ledgerTasksMem = null;

function setLedgerTasksMemory(list) {
  if (!Array.isArray(list)) {
    _ledgerTasksMem = [];
    return;
  }
  _ledgerTasksMem = list.map((o) => ({
    name: (o.name || "").trim(),
    category: (o.category || "").trim(),
    productivity: o.productivity || "productive",
    memo: (o.memo || "").trim(),
    id: (o.id || "").trim(),
    kpiId: (o.kpiId && String(o.kpiId).trim()) || "",
  }));
}

/** 스냅샷 비교용(예: timeLedgerCloudRefresh) */
export function getLedgerTasksMemSnapshotString() {
  try {
    return JSON.stringify(_ledgerTasksMem ?? []);
  } catch (_) {
    return "";
  }
}

/** 루틴 등: 목록 통째 교체 후 서버 동기화 옵션과 함께 */
export function saveLedgerTaskList(list, opts = {}) {
  const {
    bumpPullSkip = false,
    scheduleSyncPush = false,
    upsertTaskIds = null,
  } = opts;
  setLedgerTasksMemory(list);
  notifySaved({ bumpPullSkip, scheduleSyncPush, upsertTaskIds });
}

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
  const locked = new Set([
    ...C.FIXED_OTHER_TASKS.map((t) => t.name),
    ...C.FIXED_PRODUCTIVE_TASKS.map((t) => t.name),
    ...C.FIXED_NONPRODUCTIVE_TASKS.map((t) => t.name),
    ...C.TASKS_LOCKED_FOR_EDIT,
    ...getKpiSyncedTaskNames(),
  ]);
  /* KPI id로 연동된 행(이름이 바뀌어도 잠금 유지) */
  try {
    for (const o of getFullTaskOptions()) {
      if ((o.kpiId || "").trim() && (o.name || "").trim()) {
        locked.add(String(o.name).trim());
      }
    }
  } catch (_) {}
  return locked;
}

function notifySaved(detail = {}) {
  const merged = {
    bumpPullSkip: false,
    scheduleSyncPush: false,
    upsertTaskIds: null,
    ...detail,
  };
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("time-ledger-tasks-saved", {
          detail: { bumpPullSkip: !!merged.bumpPullSkip },
        }),
      );
    }
  } catch (_) {}
  if (!merged.scheduleSyncPush) return;
  const raw = merged.upsertTaskIds;
  const ids = Array.isArray(raw)
    ? raw
    : raw != null && String(raw).trim()
      ? [raw]
      : [];
  const filtered = [
    ...new Set(
      ids.map((x) => String(x || "").trim()).filter((id) => id && isUuid(id)),
    ),
  ];
  if (filtered.length === 0) {
    try {
      console.warn(
        "[lp-time-ledger-tasks] scheduleSyncPush 인데 upsertTaskIds 없음 — 서버 upsert 생략",
      );
    } catch (_) {}
    return;
  }
  void import("./timeLedgerTasksSupabase.js").then((m) =>
    m.upsertTimeLedgerTaskRowsFromLocalByIds(filtered).catch((err) => {
      try {
        console.error(
          "[lp-time-ledger-tasks] upsert:ids 예외",
          err && (err.message || err),
          err,
        );
      } catch (_) {}
    }),
  );
}

/**
 * @param {{ bumpPullSkip?: boolean, scheduleSyncPush?: boolean, upsertTaskIds?: string[]|string|null }} [opts]
 * - scheduleSyncPush: true일 때 upsertTaskIds(유효 uuid) 필수 — 전체 목록 upsert 없음.
 */
function saveMergedList(list, opts = {}) {
  saveLedgerTaskList(list, opts);
}

function writeTaskOptionListLocal(list) {
  setLedgerTasksMemory(list);
}

/**
 * 과제 행 삭제 시: 서버 delete 요청 직후 곧바로 pull 스킵 → delete 완료 전 SELECT 로 부활 방지. 완료 후 스킵 한 번 더 연장.
 */
async function notifyAfterServerDeleteIfNeeded(removedId) {
  const id = String(removedId || "").trim();
  notifySaved({ bumpPullSkip: true, scheduleSyncPush: false });
  if (!id || !isUuid(id)) {
    return;
  }
  try {
    const m = await import("./timeLedgerTasksSupabase.js");
    await m.deleteTimeLedgerTaskRowForCurrentUser(id);
  } catch (e) {
    try {
      console.warn(
        "[lp-time-ledger-tasks] 서버 delete 예외",
        e && (e.message || e),
      );
    } catch (_) {}
    /* 네트워크 실패 시에도 스킵으로 잘못된 pull 완화 */
  }
  notifySaved({ bumpPullSkip: true, scheduleSyncPush: false });
}

function assignIdsToMergedList(merged) {
  let dirty = false;
  const upsertIds = [];
  const out = merged.map((t) => {
    const idIn = (t.id || "").trim();
    if (isUuid(idIn)) return { ...t, id: idIn };
    dirty = true;
    const builtin = findBuiltinByName(t.name);
    if (builtin) {
      const nid = deterministicTaskId(
        t.name,
        builtin.productivity,
        builtin.category,
      );
      upsertIds.push(nid);
      return {
        ...t,
        productivity: t.productivity || builtin.productivity,
        category: t.category || builtin.category,
        memo: t.memo || "",
        id: nid,
      };
    }
    const uid =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `t-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    if (isUuid(uid)) upsertIds.push(uid);
    return { ...t, memo: t.memo || "", id: uid };
  });
  if (dirty)
    saveMergedList(out, {
      bumpPullSkip: true,
      scheduleSyncPush: upsertIds.length > 0,
      upsertTaskIds: upsertIds,
    });
  return out;
}

/** 로그아웃 시 — 과제 메모리 비움. 레거시 localStorage 키는 제거만(옛 데이터 정리). */
export function clearTimeLedgerTaskOptionsLocalStorage() {
  _ledgerTasksMem = null;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(TASK_OPTIONS_KEY);
    }
  } catch (_) {}
}

export function getFullTaskOptions() {
  patchKpiLinkedTasksFromKpiMaps();
  let arr = [];
  if (_ledgerTasksMem !== null && Array.isArray(_ledgerTasksMem)) {
    arr = _ledgerTasksMem.map((o) => ({
      name: o.name || "",
      category: o.category || "",
      productivity: o.productivity || "productive",
      memo: o.memo || "",
      id: o.id || "",
      kpiId: (o.kpiId && String(o.kpiId).trim()) || "",
    }));
  }

  let merged;
  if (arr.length === 0) {
    merged = C.getBuiltinTaskTemplates().map((t) => ({ ...t, memo: "" }));
  } else {
    const fixedOtherNames = new Set(C.FIXED_OTHER_TASKS.map((t) => t.name));
    const fixedProdNames = new Set(C.FIXED_PRODUCTIVE_TASKS.map((t) => t.name));
    const fixedNonProdNames = new Set(
      C.FIXED_NONPRODUCTIVE_TASKS.map((t) => t.name),
    );
    const others = arr.filter(
      (o) =>
        !fixedOtherNames.has(o.name) &&
        !fixedProdNames.has(o.name) &&
        !fixedNonProdNames.has(o.name),
    );
    /* 이름별로 저장본이 있으면 id·memo 등 유지 (상수만 쓰면 id가 비어 매번 dirty → 저장·동기화 루프) */
    const byName = new Map(arr.map((o) => [o.name, o]));
    const hydrateFixed = (t) => {
      const s = byName.get(t.name);
      if (!s) return { ...t, memo: "" };
      const kid = String(s.kpiId || "").trim();
      return {
        ...t,
        memo: (s.memo || "").trim(),
        id: (s.id || "").trim(),
        ...(kid ? { kpiId: kid } : {}),
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

/** 외부에서 과제 메모리를 건드린 뒤 알림(예: KPI 연동 경로). UUID 부여·푸시는 getFullTaskOptions·별도 save 경로에서 처리 */
export function notifyTimeLedgerTasksChanged() {
  getFullTaskOptions();
  notifySaved({ bumpPullSkip: true, scheduleSyncPush: false });
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
      kpiId: "",
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `t-${Date.now()}`,
    },
    ...opts,
  ];
  const nid = String(next[0].id || "").trim();
  saveMergedList(next, {
    bumpPullSkip: true,
    scheduleSyncPush: isUuid(nid),
    upsertTaskIds: isUuid(nid) ? [nid] : [],
  });
  return next;
}

export function addTaskOptionFull(task) {
  const name = (task?.name || "").trim();
  const opts = getFullTaskOptions();
  if (!name) {
    return opts;
  }
  if (opts.some((o) => o.name === name)) {
    return opts;
  }
  const row = {
    name,
    category: task.category || "",
    productivity: task.productivity || "productive",
    memo: task.memo || "",
    kpiId: (task.kpiId && String(task.kpiId).trim()) || "",
    id:
      task.id && isUuid(String(task.id))
        ? String(task.id).trim()
        : typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `t-${Date.now()}`,
  };
  const next = [row, ...opts];
  const rid = String(row.id || "").trim();
  saveMergedList(next, {
    bumpPullSkip: true,
    scheduleSyncPush: isUuid(rid),
    upsertTaskIds: isUuid(rid) ? [rid] : [],
  });
  return next;
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
  if (name !== oldName && opts.some((o, i) => i !== idx && o.name === name)) {
    const removedId = opts[idx].id;
    opts.splice(idx, 1);
    writeTaskOptionListLocal(opts);
    void notifyAfterServerDeleteIfNeeded(removedId);
    return opts;
  }
  const prevKpi = (opts[idx].kpiId || "").trim();
  const newId = String(nextId).trim();
  opts[idx] = {
    id: newId,
    name,
    category: task.category || "",
    productivity: task.productivity || "productive",
    memo: task.memo || "",
    kpiId: prevKpi,
  };
  saveMergedList(opts, {
    bumpPullSkip: true,
    scheduleSyncPush: isUuid(newId),
    upsertTaskIds: isUuid(newId) ? [newId] : [],
  });
  return opts;
}

/**
 * KPI(꿈/부수입/행복/건강)에서 연동: 시간가계부 과제에 kpiId·uuid 를 붙이고 곧바로 Supabase 푸시
 */
export function kpiTimeTaskAdd(kpi, category) {
  const kpiId = (kpi && kpi.id && String(kpi.id).trim()) || "";
  const name = (kpi && (kpi.name || "").trim()) || "";
  if (!kpiId || !name) return;
  const opts = getFullTaskOptions();
  if (opts.some((o) => o.kpiId && String(o.kpiId) === kpiId)) return;
  if (opts.some((o) => (o.name || "").trim() === name)) return;
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `t-${Date.now()}`;
  const row = {
    name,
    category: category || "",
    productivity: "productive",
    memo: "",
    kpiId,
    id,
  };
  const next = [row, ...opts];
  const kid = String(row.id || "").trim();
  saveMergedList(next, {
    bumpPullSkip: true,
    scheduleSyncPush: isUuid(kid),
    upsertTaskIds: isUuid(kid) ? [kid] : [],
  });
}

export function kpiTimeTaskRemove(kpi, syncNameFromMap) {
  const kpiId = (kpi && kpi.id && String(kpi.id).trim()) || "";
  const nameFb = (syncNameFromMap || (kpi && (kpi.name || "")) || "").trim();
  const opts = getFullTaskOptions();
  const byKpi =
    kpiId && opts.find((o) => o.kpiId && String(o.kpiId) === kpiId);
  const target =
    byKpi || (nameFb && opts.find((o) => (o.name || "").trim() === nameFb));
  if (!target) return;
  const removedId =
    target && isUuid(String(target.id || "").trim())
      ? String(target.id).trim()
      : "";
  const next = opts.filter((o) => o !== target);
  writeTaskOptionListLocal(next);
  void notifyAfterServerDeleteIfNeeded(removedId);
}

/**
 * KPI 표시명 변경 → 같은 kpiId 과제는 한 줄만 유지, 나머지 id는 서버에서 삭제 후 메모리 반영.
 */
export async function kpiTimeTaskRename(kpi, oldNameFromKpi) {
  const kpiId = (kpi && kpi.id && String(kpi.id).trim()) || "";
  const newName = (kpi && (kpi.name || "").trim()) || "";
  if (!kpiId || !newName) return;
  const oldNm = (oldNameFromKpi || "").trim();
  const opts = getFullTaskOptions();
  let idx = -1;
  if (oldNm) {
    idx = opts.findIndex(
      (o) =>
        String(o.kpiId || "").trim() === kpiId &&
        (o.name || "").trim() === oldNm,
    );
  }
  if (idx < 0) {
    idx = opts.findIndex((o) => String(o.kpiId || "").trim() === kpiId);
  }
  if (idx < 0 && oldNm) {
    idx = opts.findIndex((o) => (o.name || "").trim() === oldNm);
  }
  if (idx < 0) return;
  const row = opts[idx];
  const canonicalId = String(row.id || "").trim();
  const dupIds = [];
  for (const o of opts) {
    if (String(o.kpiId || "").trim() !== kpiId) continue;
    const oid = String(o.id || "").trim();
    if (oid && oid !== canonicalId && isUuid(oid)) dupIds.push(oid);
  }
  const on = (row.name || "").trim();
  const needNameFix = on !== newName;
  const next = opts
    .filter((o) => {
      if (String(o.kpiId || "").trim() !== kpiId) return true;
      return String(o.id || "").trim() === canonicalId;
    })
    .map((o) =>
      needNameFix &&
      String(o.kpiId || "").trim() === kpiId &&
      String(o.id || "").trim() === canonicalId
        ? { ...o, name: newName }
        : o,
    );
  if (!needNameFix && dupIds.length === 0) return;
  saveMergedList(next, {
    bumpPullSkip: true,
    scheduleSyncPush: needNameFix && isUuid(canonicalId),
    upsertTaskIds:
      needNameFix && isUuid(canonicalId) ? [canonicalId] : null,
  });
  if (!dupIds.length) return;
  try {
    const m = await import("./timeLedgerTasksSupabase.js");
    for (const id of dupIds) {
      await m.deleteTimeLedgerTaskRowForCurrentUser(id);
    }
  } catch (_) {}
  notifySaved({ bumpPullSkip: true, scheduleSyncPush: false });
}

/**
 * KPI 삭제·탭 삭제로 연동이 끊길 때 시간가계부 과제 목록에서 이름 제거.
 * `removeTaskOption`은 KPI에서 붙인 과제명이 잠겨 있어 삭제에 실패하므로 별도 경로.
 * 서버 `time_ledger_tasks` 행도 삭제해 pull·Realtime 시 부활 방지.
 */
export function removeTimeLedgerTaskOptionByNameForKpi(name) {
  kpiTimeTaskRemove({ id: null, name: "" }, (name || "").trim());
}

/** @returns {Promise<boolean>} true면 목록에서 실제로 제거됨(KPI 연동 등 잠금이면 false) */
export async function removeTaskOption(name) {
  const n = (name || "").trim();
  if (!n) return false;
  if (getLockedTaskNamesStatic().has(n)) {
    return false;
  }
  const opts = getFullTaskOptions();
  const target = opts.find((o) => o.name === n);
  const removedId =
    target && isUuid(String(target.id || "").trim())
      ? String(target.id).trim()
      : "";
  const next = opts.filter((o) => o.name !== n);
  writeTaskOptionListLocal(next);
  await notifyAfterServerDeleteIfNeeded(removedId);
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
  if (!_ledgerTasksMem || !Array.isArray(_ledgerTasksMem)) return [];
  return _ledgerTasksMem.map((o) => ({ ...o }));
}

/** 서버 time_ledger_tasks + map_kpis 메타(kpi id→이름·과제설정용 category) 병합 */
export function applyTimeLedgerTasksFromServer(
  serverRows,
  kpiLinkMetaById = null,
) {
  const serverRowsSafe = Array.isArray(serverRows) ? serverRows : [];
  const kpiLink = kpiLinkMetaById instanceof Map ? kpiLinkMetaById : null;
  function resolveFromKpiLink(kid, nameIn, categoryIn) {
    let name = nameIn;
    let category = categoryIn;
    const k = String(kid || "").trim();
    if (!k || !kpiLink || !kpiLink.has(k)) return { name, category };
    const m = kpiLink.get(k);
    if (m && typeof m === "object") {
      if (m.name && String(m.name).trim()) name = String(m.name).trim();
      if (m.taskCategory && String(m.taskCategory).trim())
        category = String(m.taskCategory).trim();
    }
    return { name, category };
  }
  const byId = new Map(
    serverRowsSafe.map((r) => [String(r.id || "").trim(), r]).filter(([k]) => k),
  );
  const localRows = readStoredTaskOptionRows();
  const localById = new Map(
    localRows.map((r) => [String(r.id || "").trim(), r]).filter(([k]) => k),
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
      const skpi = String(s.kpi_id ?? "").trim();
      let cat =
        s.category != null && String(s.category).trim() !== ""
          ? String(s.category).trim()
          : t.category;
      let dispName = ((s.name || "").trim() || t.name).trim();
      const resolved = resolveFromKpiLink(skpi, dispName, cat);
      out.push({
        id: String(s.id || id).trim(),
        name: resolved.name,
        category: resolved.category,
        productivity: normalizeProductivity(s.productivity || t.productivity),
        memo: (s.memo || "").trim(),
        kpiId: skpi,
      });
    } else {
      out.push({ ...t, memo: "", id, kpiId: "" });
    }
  }
  for (const r of serverRowsSafe) {
    const rid = String(r.id || "").trim();
    if (!rid || builtInIdSet.has(rid)) continue;
    const loc = localById.get(rid);
    const fromServerKpi = String(r.kpi_id ?? "").trim();
    const kid =
      fromServerKpi || (loc && String(loc.kpiId || "").trim()) || "";
    const baseName = (r.name || "").trim();
    const baseCat = (r.category || "").trim();
    const merged = resolveFromKpiLink(kid, baseName, baseCat);
    out.push({
      id: rid,
      name: merged.name,
      category: merged.category,
      productivity: normalizeProductivity(r.productivity),
      memo: (r.memo || "").trim(),
      kpiId: kid,
    });
  }
  const serverIdSet = new Set(
    serverRowsSafe.map((r) => String(r.id || "").trim()).filter((k) => k),
  );
  for (const loc of localRows) {
    const lid = String(loc.id || "").trim();
    if (!lid || !isUuid(lid) || builtInIdSet.has(lid) || serverIdSet.has(lid))
      continue;
    const locKid = String(loc.kpiId || "").trim();
    const locName0 = (loc.name || "").trim();
    const locCat0 = (loc.category || "").trim();
    const mergedLoc = resolveFromKpiLink(locKid, locName0, locCat0);
    out.push({
      id: lid,
      name: mergedLoc.name,
      category: mergedLoc.category,
      productivity: normalizeProductivity(loc.productivity),
      memo: (loc.memo || "").trim(),
      kpiId: locKid,
    });
  }
  const order = new Map(
    serverRowsSafe.map((r, i) => [String(r.id || "").trim(), r.sort_order ?? i]),
  );
  out.sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999));
  const seenKpi = new Set();
  const deduped = [];
  const dupIdsToDelete = [];
  for (const r of out) {
    const kid = String(r.kpiId || "").trim();
    if (kid) {
      if (seenKpi.has(kid)) {
        const rid = String(r.id || "").trim();
        if (isUuid(rid)) dupIdsToDelete.push(rid);
        continue;
      }
      seenKpi.add(kid);
    }
    deduped.push(r);
  }
  /** kpi_id 있는 행(트리거 등)과 동일 표시명인 옛 행(kpi_id 빈 클라 산물) 제거 */
  const nameByKpiKeeper = new Map();
  for (const r of deduped) {
    const kid = String(r.kpiId || "").trim();
    if (!kid) continue;
    const n = (r.name || "").trim();
    if (n) nameByKpiKeeper.set(n, r);
  }
  const dedupedSansOrphanNameDup = [];
  for (const r of deduped) {
    const kid = String(r.kpiId || "").trim();
    if (kid) {
      dedupedSansOrphanNameDup.push(r);
      continue;
    }
    const n = (r.name || "").trim();
    if (n && nameByKpiKeeper.has(n)) {
      const rid = String(r.id || "").trim();
      const keepId = String(nameByKpiKeeper.get(n).id || "").trim();
      if (isUuid(rid) && rid !== keepId) dupIdsToDelete.push(rid);
      continue;
    }
    dedupedSansOrphanNameDup.push(r);
  }
  const upsertSyncIds = [];
  for (const r of dedupedSansOrphanNameDup) {
    const id = String(r.id || "").trim();
    if (!isUuid(id) || builtInIdSet.has(id)) continue;
    const sr = byId.get(id);
    if (!sr) continue;
    const srvName = (sr.name || "").trim();
    const srvKpi = String(sr.kpi_id ?? "").trim();
    const srvCat = (sr.category || "").trim();
    const locName = (r.name || "").trim();
    const locKpi = String(r.kpiId || "").trim();
    const locCat = (r.category || "").trim();
    if (srvName !== locName || srvKpi !== locKpi || srvCat !== locCat)
      upsertSyncIds.push(id);
  }
  if (dupIdsToDelete.length) {
    void import("./timeLedgerTasksSupabase.js").then((m) =>
      Promise.all(
        dupIdsToDelete.map((id) =>
          m.deleteTimeLedgerTaskRowForCurrentUser(id).catch(() => {}),
        ),
      ),
    );
  }
  saveMergedList(dedupedSansOrphanNameDup, {
    bumpPullSkip: false,
    scheduleSyncPush: upsertSyncIds.length > 0,
    upsertTaskIds: upsertSyncIds.length ? upsertSyncIds : null,
  });
  return true;
}

export function buildTimeLedgerTasksUpsertPayloads(userId) {
  const list = getFullTaskOptions();
  const seen = new Set();
  const unique = [];
  const dupIdSamples = [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const id = String(t.id || "").trim();
    if (!isUuid(id)) continue;
    if (seen.has(id)) {
      if (dupIdSamples.length < 8) dupIdSamples.push(id);
      continue;
    }
    seen.add(id);
    unique.push(t);
  }
  if (dupIdSamples.length && typeof console !== "undefined" && console.warn) {
    console.warn(
      "[lp-time-ledger-tasks] upsert:동일 id 가 목록에 중복 (첫 행만 전송) — RLS/merge 이슈 점검 권장",
      {
        listLength: list.length,
        uniqueCount: unique.length,
        sampleDuplicateIds: dupIdSamples,
      },
    );
  }
  return unique.map((t, sort_order) => ({
    id: String(t.id || "").trim(),
    user_id: userId,
    name: (t.name || "").trim(),
    productivity: normalizeProductivity(t.productivity),
    category: (t.category || "").trim(),
    memo: (t.memo || "").trim(),
    sort_order,
    is_system: isBuiltinTaskName(t.name),
    kpi_id: String(t.kpiId || "").trim(),
  }));
}
