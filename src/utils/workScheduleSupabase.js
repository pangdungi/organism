/**
 * 스탬프 캘린더 ↔ Supabase
 *
 * - stamp_types              사용자별 스탬프 정의 (id, name, sort_order, is_builtin)
 * - stamp_calendar_entries   날짜별 스탬프 (stamp_id FK)
 *
 * 스키마: supabase/migrations/20260520120000_stamp_calendar_tables.sql
 *
 * pull: 탭 진입·설정·날짜/스탬프 모달 열 때 (types / entries 옵션)
 * push: 사용자가 모달에서 «저장»·«삭제»를 눌렀을 때만 (설정=types, 날짜 모달=entry 1건 upsert/delete)
 */

import { supabase } from "../supabase.js";
import { applyWorkScheduleRowTimesFromTypes } from "./workScheduleEntryResolve.js";
import {
  readWorkScheduleRowsFromMem,
  writeWorkScheduleRowsToMem,
  readWorkScheduleTypeOptionsRawFromMem,
  writeWorkScheduleTypeOptionsRawToMem,
} from "./workScheduleModel.js";
import { runWorkScheduleSerialized } from "./workScheduleServerSyncSerial.js";
import { workScheduleDiagLog } from "./workScheduleDiag.js";
import { lpPullDebug } from "./lpPullDebug.js";
import { showToast } from "./showToast.js";

const TYPES_TABLE = "stamp_types";
const ENTRIES_TABLE = "stamp_calendar_entries";
const UPSERT_CONFLICT_ROW = "user_id,id";

const STAMP_SCHEMA_MIGRATION =
  "20260520120000_stamp_calendar_tables.sql";

const DEFAULT_BUILTIN_NAMES = ["연차", "휴가", "정규근무"];

const DEFAULT_TYPE_SEED = DEFAULT_BUILTIN_NAMES.map((name) => ({
  name,
  is_builtin: true,
}));

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function wsSyncLog(...args) {
  workScheduleDiagLog("[sync]", ...args);
}

function isUuid(s) {
  return typeof s === "string" && UUID_RE.test(s.trim());
}

function snapshotWorkScheduleMemForCompare() {
  try {
    const rowsRaw = readWorkScheduleRowsFromMem();
    const rows = Array.isArray(rowsRaw)
      ? [...rowsRaw].sort((a, b) =>
          String(a?.id || "").localeCompare(String(b?.id || "")),
        )
      : rowsRaw;
    return JSON.stringify({
      rows,
      types: readWorkScheduleTypeOptionsRawFromMem(),
    });
  } catch (_) {
    return "";
  }
}

function formatLocalYmdFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeLocalTypeEntry(o) {
  if (!o || typeof o !== "object") return null;
  const name = (o.name || "").trim();
  if (!name) return null;
  const id = (o.id != null ? String(o.id).trim() : "") || "";
  const ar = o.addedAt;
  const addedAt =
    typeof ar === "number" && Number.isFinite(ar) ? ar : 0;
  return {
    id: isUuid(id) ? id : "",
    name,
    start: "",
    end: "",
    kind: "work",
    isBuiltin: !!o.isBuiltin || DEFAULT_BUILTIN_NAMES.includes(name),
    addedAt,
  };
}

/** 서버 stamp_types → 로컬 옵션(기본 3개 병합) */
function typeOptionsFromServerRows(serverRows) {
  const rows = Array.isArray(serverRows) ? serverRows : [];
  const byName = new Map(
    rows.map((r) => [
      r.name,
      {
        id: r.id,
        name: r.name,
        isBuiltin: !!r.is_builtin,
        addedAt: 0,
      },
    ]),
  );
  const out = [];
  for (const d of DEFAULT_TYPE_SEED) {
    const s = byName.get(d.name);
    out.push(
      s
        ? {
            id: s.id,
            name: d.name,
            start: "",
            end: "",
            kind: "work",
            isBuiltin: true,
            addedAt: 0,
          }
        : {
            id: "",
            name: d.name,
            start: "",
            end: "",
            kind: "work",
            isBuiltin: true,
            addedAt: 0,
          },
    );
    byName.delete(d.name);
  }
  const rest = [...rows]
    .filter((r) => r && r.name && !DEFAULT_BUILTIN_NAMES.includes(r.name))
    .sort((a, b) => {
      const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (so !== 0) return so;
      return String(a.name).localeCompare(String(b.name), "ko");
    })
    .map((r) => ({
      id: r.id,
      name: r.name,
      start: "",
      end: "",
      kind: "work",
      isBuiltin: !!r.is_builtin,
      addedAt: 0,
    }));
  return [...out, ...rest];
}

function buildTypeNameByIdMap(types) {
  const m = new Map();
  (Array.isArray(types) ? types : []).forEach((t) => {
    const norm = normalizeLocalTypeEntry(t);
    if (norm?.id) m.set(norm.id, norm.name);
  });
  return m;
}

function serverEntryToLocal(row, nameByStampId) {
  const d = row.entry_date;
  const workDate =
    typeof d === "string"
      ? d.slice(0, 10)
      : d instanceof Date
        ? formatLocalYmdFromDate(d)
        : String(d || "").slice(0, 10);
  const stampId = row.stamp_id != null ? String(row.stamp_id) : "";
  const workType =
    (stampId && nameByStampId.get(stampId)) ||
    (row.stamp_types?.name != null ? String(row.stamp_types.name) : "") ||
    "";
  return {
    id: row.id,
    stampId,
    workType,
    startTime: "",
    endTime: "",
    memo: "",
    hours: "",
    hoursWorked: "",
    workDate,
  };
}

function parseLocalTypes() {
  const raw = readWorkScheduleTypeOptionsRawFromMem();
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeLocalTypeEntry).filter(Boolean);
}

function loadLocalRows() {
  return readWorkScheduleRowsFromMem();
}

function normalizeWorkDateStr(r) {
  return String(r.workDate || "").trim().replace(/\//g, "-").slice(0, 10);
}

function isValidYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function rowHasStampPayload(r, nameById) {
  const wd = normalizeWorkDateStr(r);
  if (!isValidYmd(wd)) return false;
  const stampId = String(r.stampId || "").trim();
  if (isUuid(stampId)) return true;
  const wt = String(r.workType || "").trim();
  if (!wt) return false;
  for (const [id, name] of nameById) {
    if (name === wt) return true;
  }
  return false;
}

function resolveStampIdForRow(r, types) {
  const direct = String(r?.stampId || "").trim();
  if (isUuid(direct)) return direct;
  const wt = String(r?.workType || "").trim();
  if (!wt) return "";
  const hit = types.find((t) => t.name === wt);
  return hit?.id && isUuid(hit.id) ? hit.id : "";
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/**
 * @param {{ includeTypes?: boolean, includeEntries?: boolean }} [opts]
 */
async function pullWorkScheduleFromSupabaseImpl(opts = {}) {
  const includeTypes = opts.includeTypes !== false;
  const includeEntries = opts.includeEntries !== false;
  const userId = await getSessionUserId();
  if (!userId || !supabase) return null;

  let typesForMem = null;
  let nameByStampId = buildTypeNameByIdMap(parseLocalTypes());

  if (includeTypes) {
    const typesRes = await supabase
      .from(TYPES_TABLE)
      .select("id, name, sort_order, is_builtin")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!typesRes.error) {
      const serverRows = Array.isArray(typesRes.data) ? typesRes.data : [];
      typesForMem = typeOptionsFromServerRows(serverRows);
      writeWorkScheduleTypeOptionsRawToMem(typesForMem);
      nameByStampId = buildTypeNameByIdMap(typesForMem);
      wsSyncLog("pull: stamp_types → mem", serverRows.length);
    } else {
      wsSyncLog("pull: stamp_types error", typesRes.error);
      try {
        console.warn(
          "[스탬프 캘린더] 유형 불러오기 실패:",
          typesRes.error?.message || typesRes.error,
          `(SQL: ${STAMP_SCHEMA_MIGRATION})`,
        );
      } catch (_) {}
    }
  }

  let resolvedRows = loadLocalRows();
  if (includeEntries) {
    const entriesRes = await supabase
      .from(ENTRIES_TABLE)
      .select("id, entry_date, stamp_id, stamp_types ( name )")
      .eq("user_id", userId)
      .order("entry_date", { ascending: true });

    if (!entriesRes.error) {
      const rowsFromServer = (entriesRes.data || []).map((row) =>
        serverEntryToLocal(row, nameByStampId),
      );
      resolvedRows = applyWorkScheduleRowTimesFromTypes(rowsFromServer);
      writeWorkScheduleRowsToMem(resolvedRows);
      wsSyncLog(
        "pull: stamp_calendar_entries → mem",
        (entriesRes.data || []).length,
      );
    } else {
      wsSyncLog("pull: entries error", entriesRes.error);
    }
  }

  return { rows: resolvedRows, types: typesForMem };
}

export async function pullWorkScheduleFromSupabase(opts = {}) {
  return runWorkScheduleSerialized(() => pullWorkScheduleFromSupabaseImpl(opts));
}

/** 스탬프 목록만 서버에서 pull (모달·설정용) */
export async function pullStampTypesFromSupabase() {
  return pullWorkScheduleFromSupabase({
    includeTypes: true,
    includeEntries: false,
  });
}

async function upsertStampTypesToSupabase(userId, typeList) {
  const upserts = [];
  typeList.forEach((t, i) => {
    let id = (t.id != null ? String(t.id).trim() : "") || "";
    if (!isUuid(id)) id = crypto.randomUUID();
    upserts.push({
      id,
      user_id: userId,
      name: t.name,
      sort_order: i,
      is_builtin: !!t.isBuiltin || DEFAULT_BUILTIN_NAMES.includes(t.name),
    });
  });
  if (upserts.length === 0) return { ok: true, count: 0, upserts: [] };
  const { error } = await supabase
    .from(TYPES_TABLE)
    .upsert(upserts, { onConflict: UPSERT_CONFLICT_ROW });
  if (error) return { ok: false, error, upserts: [] };
  return { ok: true, count: upserts.length, upserts };
}

async function deleteOrphanStampTypesRemote(userId, localTypeIds) {
  const keep = new Set(localTypeIds.filter(isUuid));
  if (keep.size === 0) return;
  const { data: remoteTypes, error: rtErr } = await supabase
    .from(TYPES_TABLE)
    .select("id")
    .eq("user_id", userId);
  if (rtErr || !remoteTypes) return;
  for (const r of remoteTypes) {
    const rid = String(r.id || "");
    if (!rid || keep.has(rid)) continue;
    await supabase
      .from(ENTRIES_TABLE)
      .delete()
      .eq("user_id", userId)
      .eq("stamp_id", rid);
    await supabase.from(TYPES_TABLE).delete().eq("user_id", userId).eq("id", rid);
  }
}

/** 스탬프 설정 모달 «저장» — types upsert + 사용자가 지운 유형만 원격 삭제 */
async function pushStampTypesAfterSettingsSaveImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return { ok: false };

  let types = parseLocalTypes();
  if (types.length === 0) {
    types = typeOptionsFromServerRows([]).map(normalizeLocalTypeEntry).filter(Boolean);
  }

  const pushTypes = await upsertStampTypesToSupabase(userId, types);
  if (!pushTypes.ok) {
    const tErr = pushTypes.error;
    wsSyncLog("push: stamp_types 실패", tErr?.message || String(tErr));
    try {
      showToast(
        "서버에 스탬프 목록을 저장하지 못했습니다.",
        `Supabase SQL에서 ${STAMP_SCHEMA_MIGRATION} 내용을 실행한 뒤 다시 시도해 주세요.`,
      );
    } catch (_) {}
    return { ok: false, error: tErr };
  }

  if (pushTypes.upserts?.length) {
    writeWorkScheduleTypeOptionsRawToMem(
      types.map((t, i) => ({
        ...t,
        id: pushTypes.upserts[i]?.id || t.id,
      })),
    );
    types = parseLocalTypes();
  }

  await deleteOrphanStampTypesRemote(
    userId,
    types.map((t) => t.id).filter(isUuid),
  );
  return { ok: true };
}

/** 스탬프 등록·수정 모달 «저장» — 해당 날짜 entry 1건만 upsert (전체 동기화·고아 삭제 없음) */
async function upsertStampCalendarEntryFromModalImpl(row) {
  const userId = await getSessionUserId();
  if (!userId || !supabase || !row || typeof row !== "object") {
    return { ok: false, reason: "no_session" };
  }

  let types = parseLocalTypes();
  if (types.length === 0) {
    types = typeOptionsFromServerRows([]).map(normalizeLocalTypeEntry).filter(Boolean);
  }

  let r = { ...row };
  let id = String(r.id || "").trim();
  if (!isUuid(id)) id = crypto.randomUUID();
  r.id = id;

  const stampId = resolveStampIdForRow(r, types);
  if (!isUuid(stampId)) {
    wsSyncLog("push entry skip: stamp_id 없음", r);
    return { ok: false, reason: "no_stamp_id" };
  }

  const wd = normalizeWorkDateStr(r);
  if (!isValidYmd(wd)) {
    return { ok: false, reason: "bad_date" };
  }

  const payload = {
    id,
    user_id: userId,
    stamp_id: stampId,
    entry_date: wd,
  };

  const { error } = await supabase
    .from(ENTRIES_TABLE)
    .upsert([payload], { onConflict: UPSERT_CONFLICT_ROW });
  if (error) {
    wsSyncLog("push entry fail", error.message || error);
    return { ok: false, error };
  }

  const nameById = buildTypeNameByIdMap(types);
  const workType =
    String(r.workType || "").trim() || nameById.get(stampId) || "";
  const rows = loadLocalRows();
  const nextRow = {
    ...r,
    id,
    stampId,
    workType,
    workDate: wd,
  };
  const idx = rows.findIndex((x) => String(x.id || "") === id);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...nextRow };
  else rows.push(nextRow);
  writeWorkScheduleRowsToMem(rows);
  wsSyncLog("push entry ok", id);
  return { ok: true, id };
}

/** 스탬프 수정 모달 «삭제» — entry 1건만 DELETE */
async function deleteStampCalendarEntryFromModalImpl(entryId) {
  const id = String(entryId || "").trim();
  if (!isUuid(id)) return { ok: false, reason: "bad_id" };
  const userId = await getSessionUserId();
  if (!userId || !supabase) return { ok: false, reason: "no_session" };

  const { error } = await supabase
    .from(ENTRIES_TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    wsSyncLog("delete entry fail", error.message || error);
    return { ok: false, error };
  }
  wsSyncLog("delete entry ok", id);
  return { ok: true };
}

export async function pushStampTypesAfterSettingsSave() {
  return runWorkScheduleSerialized(() => pushStampTypesAfterSettingsSaveImpl());
}

export async function upsertStampCalendarEntryFromModal(row) {
  return runWorkScheduleSerialized(() => upsertStampCalendarEntryFromModalImpl(row));
}

export async function deleteStampCalendarEntryFromModal(entryId) {
  return runWorkScheduleSerialized(() => deleteStampCalendarEntryFromModalImpl(entryId));
}

/** @deprecated entries 일괄 sync 제거 — pushStampTypesAfterSettingsSave 만 사용 */
export async function syncWorkScheduleToSupabase(opts) {
  void opts;
  return pushStampTypesAfterSettingsSave();
}

export async function hydrateWorkScheduleFromCloud() {
  lpPullDebug("hydrateStampCalendarFromCloud", {});
  wsSyncLog("tab: pull stamp calendar (types+entries)");
  if (!supabase) {
    return { anyChanged: false };
  }
  const beforeSnap = snapshotWorkScheduleMemForCompare();
  await pullWorkScheduleFromSupabase({
    includeTypes: true,
    includeEntries: true,
  });
  const afterSnap = snapshotWorkScheduleMemForCompare();
  return { anyChanged: beforeSnap !== afterSnap };
}
