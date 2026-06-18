/**
 * 시간가계부 과제 옵션 — 메모리 + 서버 pull, **iconKey 등은 계정별 localStorage 미러로 부팅 즉시 복구**.
 */

import * as C from "./timeTaskOptionsConstants.js";
import {
  getActiveClientStorageUserId,
  getScopedLocalStorageItem,
  removeScopedLocalStorageItem,
  setScopedLocalStorageItem,
} from "./clientStorageScope.js";
import {
  getActiveKpiTaskKeepersById,
  getKpiSyncedTaskNames,
} from "./kpiMapLocalStorage.js";
import { isUuid, UUID_RE } from "./idUtils.js";
import {
  readTimeLedgerEntriesRaw,
  writeTimeLedgerEntriesRaw,
} from "./timeLedgerEntriesModel.js";
import {
  getDefaultKpiIconKey,
  resolveEffectiveTaskIconKey,
} from "./timeTaskIconUrls.js";

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
        iconKey: String(o.iconKey || "").trim(),
        category: (o.category || "").trim(),
        productivity: normalizeProductivity(o.productivity),
      })),
    );
  } catch (_) {
    return "";
  }
}

let _patchKpiLinkedFromMapsDepth = 0;

function normalizeBuiltinTaskRow(o) {
  const rawName = String(o?.name ?? "").trim();
  const name = C.canonicalMealTaskDisplayName(rawName);
  const builtin = findBuiltinByName(name) || findBuiltinByName(rawName);
  const kpiId = String(o?.kpiId || "").trim();
  return {
    ...o,
    name,
    category: builtin
      ? builtin.category
      : C.canonicalTimeTaskCategory(o?.category),
    productivity: builtin
      ? builtin.productivity
      : normalizeProductivity(o?.productivity),
    memo: (o?.memo || "").trim(),
    id: String(o?.id || "").trim(),
    kpiId,
    iconKey: String(
      resolveEffectiveTaskIconKey({
        iconKey: o?.iconKey,
        kpiId,
        taskName: name,
      }) || "",
    ).trim(),
  };
}

export function readTaskOptionsMemRows() {
  if (!_ledgerTasksMem || !Array.isArray(_ledgerTasksMem)) return [];
  return _ledgerTasksMem.map((o) => ({
    name: (o.name || "").trim(),
    category: (o.category || "").trim(),
    productivity: o.productivity || "productive",
    memo: (o.memo || "").trim(),
    id: (o.id || "").trim(),
    kpiId: String(o.kpiId || "").trim(),
    iconKey: String(o.iconKey || "").trim(),
  }));
}

/** KPI 맵의 현재 표시명·category만 연동 과제 행에 반영(서버 행 삭제·로컬 중복 제거 없음) */
export function patchKpiLinkedTasksFromKpiMaps() {
  if (!_ledgerTasksMem || !Array.isArray(_ledgerTasksMem)) return;
  if (_patchKpiLinkedFromMapsDepth > 4) return;
  _patchKpiLinkedFromMapsDepth++;
  try {
    const keepers = getActiveKpiTaskKeepersById();
    let changed = false;
    const next = _ledgerTasksMem.map((o) => {
      const kid = String(o.kpiId || "").trim();
      if (!kid) return o;
      const meta = keepers.get(kid);
      if (!meta) return o;
      const name = String(meta.name || o.name || "").trim() || o.name;
      const category = String(meta.category || o.category || "").trim() || o.category;
      if (name === o.name && category === o.category) return o;
      changed = true;
      return { ...o, name, category };
    });
    if (!changed) return;
    saveLedgerTaskList(next, {
      bumpPullSkip: true,
      scheduleSyncPush: false,
    });
  } finally {
    _patchKpiLinkedFromMapsDepth--;
  }
}

/** pull/저장으로만 채움. null = 아직 로컬·서버에서 로드 전(내장만 표시) */
let _ledgerTasksMem = null;

function mirrorTaskOptionsToLocalStorage() {
  const uid = getActiveClientStorageUserId();
  if (!uid || _ledgerTasksMem == null || !Array.isArray(_ledgerTasksMem)) return;
  try {
    setScopedLocalStorageItem(TASK_OPTIONS_KEY, JSON.stringify(_ledgerTasksMem), uid);
  } catch (_) {}
}

function setLedgerTasksMemory(list) {
  if (!Array.isArray(list)) {
    _ledgerTasksMem = [];
    mirrorTaskOptionsToLocalStorage();
    return;
  }
  _ledgerTasksMem = list.map((o) => normalizeBuiltinTaskRow(o));
  mirrorTaskOptionsToLocalStorage();
}

/**
 * mountApp 직전: localStorage 미러만 동기 로드 — 새로고침 직후 iconKey 깜빡임 방지.
 * @returns {boolean} 미러에서 1건 이상 복구했으면 true
 */
export function hydrateTaskOptionsFromLocalMirrorForBoot() {
  if (_ledgerTasksMem !== null) {
    return Array.isArray(_ledgerTasksMem) && _ledgerTasksMem.length > 0;
  }
  const uid = getActiveClientStorageUserId();
  if (!uid) return false;
  try {
    const raw = getScopedLocalStorageItem(TASK_OPTIONS_KEY, uid);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return false;
    setLedgerTasksMemory(parsed);
    return true;
  } catch (_) {
    return false;
  }
}

/** 부팅: 계정별 localStorage 미러만(빠른 표시). 과제 pull·서버 쓰기는 과제설정 모달·KPI·모달 저장만. */
export function prepareTimeLedgerTasksStorageForBoot() {
  hydrateTaskOptionsFromLocalMirrorForBoot();
  void import("./timeLedgerTasksSupabase.js")
    .then((m) => {
      m.attachTimeLedgerTasksSaveListener();
    })
    .catch(() => {});
}

/** 계정 전환: 과제 메모리만 비운 뒤 새 계정 미러로 다시 채움 */
export function resetTimeLedgerTasksMemoryForAccountSwitch() {
  _ledgerTasksMem = null;
  hydrateTaskOptionsFromLocalMirrorForBoot();
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
for (const { from, to } of C.MEAL_TASK_NAME_RENAMES) {
  const canon = BUILTIN_BY_NAME.get(to);
  if (canon) BUILTIN_BY_NAME.set(from, canon);
}

function findBuiltinByName(name) {
  return BUILTIN_BY_NAME.get(name) || null;
}

export function isBuiltinTaskName(name) {
  return findBuiltinByName(name) != null;
}

function builtinTemplateAlreadyPresent(presentNames, presentIds, template) {
  const id = deterministicTaskId(
    template.name,
    template.productivity,
    template.category,
  );
  if (presentIds.has(id)) return true;
  const name = String(template.name || "").trim();
  if (presentNames.has(name)) return true;
  const canon = C.canonicalMealTaskDisplayName(name);
  if (canon && presentNames.has(canon)) return true;
  for (const { from, to } of C.MEAL_TASK_NAME_RENAMES) {
    if (to === name && presentNames.has(from)) return true;
    if (from === name && presentNames.has(to)) return true;
  }
  return false;
}

/** 서버·메모리 목록 + 코드 기본 과제(FIXED_*) 중 빠진 이름 보충 — 자동 서버 upsert 없음 */
function mergeMissingBuiltinTemplates(rows) {
  const base = (rows || []).map((o) => normalizeBuiltinTaskRow(o));
  const presentNames = new Set();
  const presentIds = new Set();
  for (const o of base) {
    const n = String(o.name || "").trim();
    if (n) presentNames.add(n);
    const canon = C.canonicalMealTaskDisplayName(n);
    if (canon) presentNames.add(canon);
    const id = String(o.id || "").trim();
    if (id) presentIds.add(id);
  }

  const supplements = [];
  for (const t of C.getBuiltinTaskTemplates()) {
    if (builtinTemplateAlreadyPresent(presentNames, presentIds, t)) continue;
    supplements.push(
      normalizeBuiltinTaskRow({
        name: t.name,
        category: t.category,
        productivity: t.productivity,
        memo: "",
        kpiId: "",
        id: deterministicTaskId(t.name, t.productivity, t.category),
        iconKey: String(
          resolveEffectiveTaskIconKey({ taskName: t.name }) || "",
        ).trim(),
      }),
    );
  }
  return [...base, ...supplements];
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
    for (const o of readTaskOptionsMemRows()) {
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

/** KPI 맵 push(800ms) + DB 트리거 후 서버 task id 를 로컬에 맞춤 */
const _kpiTaskRealignTimers = new Map();
const KPI_TASK_SERVER_ID_REALIGN_MS = 1500;

function scheduleKpiTaskServerIdRealign(kpiId) {
  const kid = String(kpiId || "").trim();
  if (!kid) return;
  const prev = _kpiTaskRealignTimers.get(kid);
  if (prev != null) clearTimeout(prev);
  _kpiTaskRealignTimers.set(
    kid,
    setTimeout(() => {
      _kpiTaskRealignTimers.delete(kid);
      void import("./timeLedgerTasksSupabase.js")
        .then((m) =>
          m.pullTimeLedgerTasksFromSupabase({ ignoreSkip: true }),
        )
        .catch(() => {});
    }, KPI_TASK_SERVER_ID_REALIGN_MS),
  );
}

/**
 * 과제 행 삭제 시: 서버 delete 요청 직후 곧바로 pull 스킵 → delete 완료 전 SELECT 로 부활 방지. 완료 후 스킵 한 번 더 연장.
 */
async function notifyAfterServerDeleteIfNeeded(removedId, kpiId) {
  const id = String(removedId || "").trim();
  const kid = String(kpiId || "").trim();
  notifySaved({ bumpPullSkip: true, scheduleSyncPush: false });
  if ((!id || !isUuid(id)) && !kid) {
    return;
  }
  try {
    const m = await import("./timeLedgerTasksSupabase.js");
    await m.deleteTimeLedgerTaskForCurrentUser({ taskId: id, kpiId: kid });
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

let _taskOptionsIdNotifyTimer = null;

function scheduleTaskOptionsIdAssignedNotify() {
  if (_taskOptionsIdNotifyTimer != null) return;
  _taskOptionsIdNotifyTimer = setTimeout(() => {
    _taskOptionsIdNotifyTimer = null;
    notifySaved({ bumpPullSkip: true, scheduleSyncPush: false });
  }, 0);
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
    const prod = normalizeProductivity(t.productivity);
    const cat = String(t.category || "").trim() || "other";
    const uid =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : deterministicTaskId(t.name, prod, cat);
    if (isUuid(uid)) upsertIds.push(uid);
    return { ...t, memo: t.memo || "", id: uid };
  });
  if (dirty) {
    writeTaskOptionListLocal(out);
    scheduleTaskOptionsIdAssignedNotify();
  }
  return out;
}

/** 로그아웃 시 — 과제 메모리 비움. 레거시 localStorage 키는 제거만(옛 데이터 정리). */
export function clearTimeLedgerTaskOptionsLocalStorage() {
  _ledgerTasksMem = null;
  try {
    removeScopedLocalStorageItem(TASK_OPTIONS_KEY);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(TASK_OPTIONS_KEY);
    }
  } catch (_) {}
}

/** 과제 기록 모달 — 서버 행 + 코드 기본 과제(FIXED_*) 목록 */
export function getServerLedgerTaskOptionsForTaskLog() {
  const arr = readTaskOptionsMemRows().filter(
    (o) => !C.isRetiredBuiltinTaskName(String(o.name || "").trim()),
  );
  return mergeMissingBuiltinTemplates(arr);
}

export function getFullTaskOptions() {
  const arr = readTaskOptionsMemRows().filter(
    (o) => !C.isRetiredBuiltinTaskName(String(o.name || "").trim()),
  );
  return assignIdsToMergedList(mergeMissingBuiltinTemplates(arr));
}

/** 꿈 KPI 연동 과제 — 과제설정 모달 목록에서 숨김(기록·조회용 데이터는 유지) */
export function isDreamKpiLedgerTask(task) {
  if (!task) return false;
  const cat = String(task.category || "").trim().toLowerCase();
  if (cat === "dream") return true;
  const kpiId = String(task.kpiId || "").trim();
  if (!kpiId) return false;
  const meta = getActiveKpiTaskKeepersById().get(kpiId);
  return meta?.category === "dream";
}

/** @param {ReturnType<typeof getFullTaskOptions>} tasks */
export function filterTasksForTaskSetupModalList(tasks) {
  return (tasks || []).filter((t) => !isDreamKpiLedgerTask(t));
}

/** 외부에서 과제 메모리를 건드린 뒤 알림(예: KPI 연동 경로). UUID 부여·푸시는 getFullTaskOptions·별도 save 경로에서 처리 */
export function notifyTimeLedgerTasksChanged() {
  patchKpiLinkedTasksFromKpiMaps();
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

export function getTaskOptionById(taskId) {
  const id = String(taskId || "").trim();
  if (!id) return null;
  return (
    getFullTaskOptions().find((o) => String(o.id || "").trim() === id) || null
  );
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
    iconKey: String(task.iconKey || "").trim(),
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
    iconKey:
      task.iconKey !== undefined
        ? String(task.iconKey || "").trim()
        : String(opts[idx].iconKey || "").trim(),
  };
  saveMergedList(opts, {
    bumpPullSkip: true,
    scheduleSyncPush: isUuid(newId),
    upsertTaskIds: isUuid(newId) ? [newId] : [],
  });
  return opts;
}

/** KPI·기본 과제 등 — 이름·분류는 잠금, 아이콘만 변경 */
export function updateTaskOptionIconByName(taskName, iconKey) {
  const n = String(taskName || "").trim();
  if (!n) return getFullTaskOptions();
  const opts = getFullTaskOptions();
  const idx = opts.findIndex((o) => (o.name || "").trim() === n);
  if (idx < 0) return opts;
  const prevId = String(opts[idx].id || "").trim();
  let nextId = isUuid(prevId) ? prevId : opts[idx].id;
  if (!isUuid(String(nextId || "").trim())) {
    nextId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `t-${Date.now()}`;
  }
  const newId = String(nextId).trim();
  opts[idx] = {
    ...opts[idx],
    id: newId,
    iconKey: String(iconKey || "").trim(),
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
  if (
    getFullTaskOptions().some((o) => String(o.kpiId || "").trim() === kpiId)
  ) {
    return;
  }
  const mem = readTaskOptionsMemRows();
  const memByName = mem.find((o) => (o.name || "").trim() === name);
  if (memByName) {
    const linked = String(memByName.kpiId || "").trim();
    if (linked === kpiId) return;
    if (!linked) {
      kpiTimeTaskEnsure(kpi, category);
      return;
    }
    /* 같은 표시명·다른 KPI — kpiId 당 1행이므로 아래에서 새 행 추가 */
  }
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
    iconKey: getDefaultKpiIconKey(kpiId, name) || "",
  };
  const rid = String(row.id || "").trim();
  saveMergedList([row, ...mem], {
    bumpPullSkip: true,
    scheduleSyncPush: isUuid(rid),
    upsertTaskIds: isUuid(rid) ? [rid] : [],
  });
}

/** KPI 과제 행이 없으면 추가, 같은 이름·category 행만 있으면 kpiId 연결 */
export function kpiTimeTaskEnsure(kpi, category) {
  const kpiId = (kpi && kpi.id && String(kpi.id).trim()) || "";
  const name = (kpi && (kpi.name || "").trim()) || "";
  const cat = String(category || "").trim();
  if (!kpiId || !name) return;

  if (
    getFullTaskOptions().some((o) => String(o.kpiId || "").trim() === kpiId)
  ) {
    return;
  }

  const mem = readTaskOptionsMemRows();
  const nameIdx = mem.findIndex((o) => {
    if ((o.name || "").trim() !== name) return false;
    const rowCat = String(o.category || "").trim();
    if (!cat) return true;
    return !rowCat || rowCat === cat;
  });
  if (nameIdx >= 0 && !String(mem[nameIdx].kpiId || "").trim()) {
    const row = mem[nameIdx];
    let id = String(row.id || "").trim();
    if (!isUuid(id)) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `t-${Date.now()}`;
    }
    const next = mem.map((o, i) =>
      i === nameIdx
        ? {
            ...o,
            id,
            name,
            kpiId,
            category: cat || o.category || "",
            productivity: o.productivity || "productive",
            iconKey:
              String(o.iconKey || "").trim() ||
              getDefaultKpiIconKey(kpiId, name) ||
              "",
          }
        : o,
    );
    saveMergedList(next, {
      bumpPullSkip: true,
      scheduleSyncPush: isUuid(id),
      upsertTaskIds: isUuid(id) ? [id] : [],
    });
    patchKpiLinkedTasksFromKpiMaps();
    return;
  }

  kpiTimeTaskAdd(kpi, category);
  patchKpiLinkedTasksFromKpiMaps();
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
  void notifyAfterServerDeleteIfNeeded(removedId, kpiId);
}

/**
 * KPI 표시명 변경 → kpiId 기준 한 줄만 유지·이름 갱신·옛 이름 잔재 제거.
 * KPI 맵 저장(서버 트리거)보다 **먼저** 호출해야 pull 전에 로컬이 맞음.
 */
export function kpiTimeTaskRename(kpi, oldNameFromKpi) {
  const kpiId = (kpi && kpi.id && String(kpi.id).trim()) || "";
  const newName = (kpi && (kpi.name || "").trim()) || "";
  if (!kpiId || !newName) return;
  const oldNm = (oldNameFromKpi || "").trim();
  patchKpiLinkedTasksFromKpiMaps();
  const opts = readTaskOptionsMemRows();
  const mapKeeper = getActiveKpiTaskKeepersById().get(kpiId);
  let idx = opts.findIndex((o) => String(o.kpiId || "").trim() === kpiId);
  if (idx < 0 && oldNm) {
    idx = opts.findIndex(
      (o) =>
        String(o.kpiId || "").trim() === kpiId &&
        (o.name || "").trim() === oldNm,
    );
  }
  if (idx < 0 && oldNm) {
    idx = opts.findIndex(
      (o) =>
        !String(o.kpiId || "").trim() && (o.name || "").trim() === oldNm,
    );
  }
  if (idx < 0 && oldNm) {
    idx = opts.findIndex((o) => (o.name || "").trim() === oldNm);
  }
  if (idx < 0) return;

  const row = opts[idx];
  let canonicalId = String(row.id || "").trim();
  if (!isUuid(canonicalId)) {
    canonicalId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `t-${Date.now()}`;
  }

  const deleteIds = new Set();
  for (const o of opts) {
    const oid = String(o.id || "").trim();
    if (!isUuid(oid) || oid === canonicalId) continue;
    const kid = String(o.kpiId || "").trim();
    const n = (o.name || "").trim();
    if (kid === kpiId) {
      deleteIds.add(oid);
      continue;
    }
    if (oldNm && n === oldNm && kid !== kpiId) deleteIds.add(oid);
    if (!kid && n === newName) deleteIds.add(oid);
  }

  const keeperCat =
    String(row.category || "").trim() ||
    String(mapKeeper?.category || "").trim();
  const next = opts
    .filter((o) => {
      const oid = String(o.id || "").trim();
      if (deleteIds.has(oid)) return false;
      const kid = String(o.kpiId || "").trim();
      if (kid === kpiId && oid !== canonicalId) return false;
      return true;
    })
    .map((o) => {
      const oid = String(o.id || "").trim();
      if (oid !== canonicalId && String(o.kpiId || "").trim() !== kpiId) {
        return o;
      }
      return {
        ...o,
        id: canonicalId,
        name: newName,
        kpiId,
        category: keeperCat || o.category || "",
        productivity: o.productivity || "productive",
      };
    });

  const prevSig = taskRowsIdentitySig(opts);
  if (taskRowsIdentitySig(next) === prevSig && deleteIds.size === 0) return;

  saveMergedList(next, {
    bumpPullSkip: true,
    scheduleSyncPush: isUuid(canonicalId),
    upsertTaskIds: isUuid(canonicalId) ? [canonicalId] : [],
  });

  patchKpiLinkedTasksFromKpiMaps();
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
  void notifyAfterServerDeleteIfNeeded(
    removedId,
    String(target?.kpiId || "").trim(),
  );
  return true;
}

/** pull 후 로컬 uuid → 서버 uuid (kpiId 동일) — 시간 기록 taskId 갱신 */
export function remapTimeLedgerEntryTaskIds(idPairs) {
  const pairs = (Array.isArray(idPairs) ? idPairs : [])
    .map((p) => ({
      from: String(p?.from || "").trim(),
      to: String(p?.to || "").trim(),
    }))
    .filter(
      (p) =>
        p.from &&
        p.to &&
        p.from !== p.to &&
        isUuid(p.from) &&
        isUuid(p.to),
    );
  if (!pairs.length) return;
  const byFrom = new Map(pairs.map((p) => [p.from, p.to]));
  try {
    const arr = readTimeLedgerEntriesRaw();
    if (!Array.isArray(arr) || arr.length === 0) return;
    let changed = false;
    const next = arr.map((r) => {
      const tid = String(r.taskId || "").trim();
      const to = byFrom.get(tid);
      if (!to) return r;
      changed = true;
      return { ...r, taskId: to };
    });
    if (changed) writeTimeLedgerEntriesRaw(next);
  } catch (_) {}
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
      let row = r;
      const rawName = (r.taskName || "").trim();
      const canonName = C.canonicalMealTaskDisplayName(rawName);
      if (canonName && canonName !== rawName) {
        changed = true;
        row = { ...row, taskName: canonName };
      }
      const rawCat = String(row.category || "").trim();
      const canonCat = C.canonicalTimeTaskCategory(rawCat);
      if (canonCat && canonCat !== rawCat) {
        changed = true;
        row = { ...row, category: canonCat };
      }
      if ((row.taskId || "").trim()) {
        const tid = String(row.taskId || "").trim();
        const byId = new Map(
          opts
            .map((o) => [String(o.id || "").trim(), o])
            .filter(([k]) => k && isUuid(k)),
        );
        if (!byId.has(tid)) {
          const n = (row.taskName || "").trim();
          const o = byName.get(n);
          if (o?.id && isUuid(String(o.id)) && String(o.id).trim() !== tid) {
            changed = true;
            return { ...row, taskId: String(o.id).trim() };
          }
        }
        return row;
      }
      const n = (row.taskName || "").trim();
      const o = byName.get(n);
      if (o?.id && isUuid(String(o.id))) {
        changed = true;
        return { ...row, taskId: String(o.id).trim() };
      }
      return row;
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
  const localRows = readStoredTaskOptionRows();
  const localById = new Map(
    localRows.map((r) => [String(r.id || "").trim(), r]).filter(([k]) => k),
  );
  const builtinTemplates = C.getBuiltinTaskTemplates();
  const builtInIdSet = new Set();
  for (const t of builtinTemplates) {
    builtInIdSet.add(deterministicTaskId(t.name, t.productivity, t.category));
    for (const { from, to } of C.MEAL_TASK_NAME_RENAMES) {
      if (to === t.name) {
        builtInIdSet.add(
          deterministicTaskId(from, t.productivity, t.category),
        );
      }
    }
  }
  for (const t of C.RETIRED_BUILTIN_TASK_TEMPLATES) {
    builtInIdSet.add(deterministicTaskId(t.name, t.productivity, t.category));
  }
  const out = [];
  const outIds = new Set();
  /* 서버 행만 반영 — 로컬·기본 과제 보충 없음(서버 기록은 사용자 행동으로만) */
  for (const r of serverRowsSafe) {
    const rid = String(r.id || "").trim();
    if (!rid || outIds.has(rid)) continue;
    if (C.isRetiredBuiltinTaskName(r.name)) continue;
    outIds.add(rid);
    const loc = localById.get(rid);
    const fromServerKpi = String(r.kpi_id ?? "").trim();
    const kid =
      fromServerKpi || (loc && String(loc.kpiId || "").trim()) || "";
    const baseName = (r.name || "").trim();
    const baseCat = (r.category || "").trim();
    const merged = resolveFromKpiLink(kid, baseName, baseCat);
    const builtin = findBuiltinByName(merged.name || baseName);
    out.push({
      id: rid,
      name: merged.name || baseName,
      category: builtin
        ? builtin.category
        : C.canonicalTimeTaskCategory(merged.category || baseCat),
      productivity: normalizeProductivity(
        builtin?.productivity || r.productivity,
      ),
      memo: (r.memo || "").trim(),
      kpiId: kid,
      iconKey: String(
        resolveEffectiveTaskIconKey({
          iconKey: r.icon_key ?? loc?.iconKey,
          kpiId: kid,
          taskName: merged.name || baseName,
        }) || "",
      ).trim(),
    });
  }
  const serverIdSet = new Set(
    serverRowsSafe.map((r) => String(r.id || "").trim()).filter((k) => k),
  );
  const serverKpiIdSet = new Set(
    serverRowsSafe
      .map((r) => String(r.kpi_id ?? "").trim())
      .filter((k) => k),
  );
  const serverTaskIdByKpiId = new Map();
  for (const r of serverRowsSafe) {
    const k = String(r.kpi_id ?? "").trim();
    const id = String(r.id || "").trim();
    if (k && id) serverTaskIdByKpiId.set(k, id);
  }
  const entryTaskIdRemaps = [];
  for (const loc of localRows) {
    const lid = String(loc.id || "").trim();
    if (!lid || !isUuid(lid) || builtInIdSet.has(lid) || serverIdSet.has(lid))
      continue;
    const locKid = String(loc.kpiId || "").trim();
    if (locKid && serverKpiIdSet.has(locKid)) {
      const serverId = serverTaskIdByKpiId.get(locKid);
      if (serverId && serverId !== lid) {
        entryTaskIdRemaps.push({ from: lid, to: serverId });
      }
    }
  }
  const order = new Map(
    serverRowsSafe.map((r, i) => [String(r.id || "").trim(), r.sort_order ?? i]),
  );
  out.sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999));
  const listUnchanged =
    entryTaskIdRemaps.length === 0 &&
    taskRowsIdentitySig(out) === taskRowsIdentitySig(_ledgerTasksMem);
  if (!listUnchanged) {
    saveMergedList(out, {
      bumpPullSkip: false,
      scheduleSyncPush: false,
    });
  }
  if (entryTaskIdRemaps.length) {
    remapTimeLedgerEntryTaskIds(entryTaskIdRemaps);
  }
  return !listUnchanged || entryTaskIdRemaps.length > 0;
}

/** 서버에 없는 코드 기본 과제만 골라냄 */
export function findMissingBuiltinTasksOnServer(serverRows) {
  const serverRowsSafe = Array.isArray(serverRows) ? serverRows : [];
  const presentNames = new Set();
  const presentIds = new Set();
  for (const r of serverRowsSafe) {
    const id = String(r.id || "").trim();
    if (id) presentIds.add(id);
    const n = String(r.name || "").trim();
    if (n) presentNames.add(n);
    const canon = C.canonicalMealTaskDisplayName(n);
    if (canon) presentNames.add(canon);
  }
  const missing = [];
  for (const t of C.getBuiltinTaskTemplates()) {
    if (builtinTemplateAlreadyPresent(presentNames, presentIds, t)) continue;
    missing.push(
      normalizeBuiltinTaskRow({
        name: t.name,
        category: t.category,
        productivity: t.productivity,
        memo: "",
        kpiId: "",
        id: deterministicTaskId(t.name, t.productivity, t.category),
        iconKey: String(
          resolveEffectiveTaskIconKey({ taskName: t.name }) || "",
        ).trim(),
      }),
    );
  }
  return missing;
}

export function buildMissingBuiltinUpsertPayloads(
  userId,
  missingRows,
  sortOrderStart = 0,
) {
  return (missingRows || []).map((t, i) => ({
    id: String(t.id || "").trim(),
    user_id: userId,
    name: (t.name || "").trim(),
    productivity: normalizeProductivity(t.productivity),
    category: (t.category || "").trim(),
    memo: "",
    sort_order: sortOrderStart + i,
    is_system: true,
    kpi_id: "",
    icon_key: String(t.iconKey || "").trim(),
  }));
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
    icon_key: String(t.iconKey || "").trim(),
  }));
}
