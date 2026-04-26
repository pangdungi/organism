/**
 * 근무·식단표 ↔ Supabase
 *
 * 테이블 (로컬 필드 → 컬럼):
 * - work_schedule_settings     daily_work_hours
 * - work_schedule_types        name, start_time, end_time, sort_order, kind ('work'|'diet')
 * - work_schedule_entries      work_date, start/end_time, work_type, memo, hours, hours_worked, id
 *
 * 스키마: supabase/migrations/20260419120000_work_schedule_meal_schema.sql (Supabase SQL Editor에 실행)
 *
 * pull(읽기): App 탭 전환(근무-식단표) 시, 그리고 유형 설정 모달을 열 때만.
 * **서버에 쓰기(push)는** `work-schedule-saved` 이벤트로만 — 일정 저장/삭제, 유형 추가/삭제에서만 dispatch.
 * 탭에서 로컬을 서버에 임의로 올리거나, 푸시 직후 자동 pull로 덮어쓰지 않음.
 */

import { supabase } from "../supabase.js";
import { applyWorkScheduleRowTimesFromTypes } from "./workScheduleEntryResolve.js";
import {
  readWorkScheduleRowsFromMem,
  writeWorkScheduleRowsToMem,
  readWorkScheduleTypeOptionsRawFromMem,
  writeWorkScheduleTypeOptionsRawToMem,
  readWorkScheduleDailyHoursFromMem,
  writeWorkScheduleDailyHoursToMem,
} from "./workScheduleModel.js";
import { runWorkScheduleSerialized } from "./workScheduleServerSyncSerial.js";
import { workScheduleDiagLog } from "./workScheduleDiag.js";
import { lpPullDebug } from "./lpPullDebug.js";
import { showToast } from "./showToast.js";

function wsSyncLog(...args) {
  workScheduleDiagLog("[sync]", ...args);
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
      dh: readWorkScheduleDailyHoursFromMem(),
    });
  } catch (_) {
    return "";
  }
}

const SETTINGS_TABLE = "work_schedule_settings";
const TYPES_TABLE = "work_schedule_types";
const ENTRIES_TABLE = "work_schedule_entries";

const DEFAULT_TYPE_SEED = [
  { name: "연차", start: "", end: "", kind: "work" },
  { name: "휴가", start: "", end: "", kind: "work" },
  { name: "정규근무", start: "", end: "", kind: "work" },
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s) {
  return typeof s === "string" && UUID_RE.test(s.trim());
}

function parseLocalTypes() {
  const raw = readWorkScheduleTypeOptionsRawFromMem();
  return Array.isArray(raw) ? raw : [];
}

function normalizeTypeEntry(o) {
  if (typeof o === "string")
    return { name: (o || "").trim(), start: "", end: "", kind: "work" };
  const kind = String(o.kind || "").trim() === "diet" ? "diet" : "work";
  return {
    name: (o.name || "").trim(),
    start: (o.start != null ? String(o.start) : "").trim(),
    end: (o.end != null ? String(o.end) : "").trim(),
    kind,
  };
}

/** 서버 근무유형 행 → 로컬 옵션 배열(기본 순서 + 서버 정렬) */
function typeOptionsFromServerRows(serverRows) {
  const rows = Array.isArray(serverRows) ? serverRows : [];
  const byName = new Map(
    rows.map((r) => [
      r.name,
      {
        name: r.name,
        start: (r.start_time != null ? String(r.start_time) : "").trim(),
        end: (r.end_time != null ? String(r.end_time) : "").trim(),
        kind: String(r.kind || "").trim() === "diet" ? "diet" : "work",
      },
    ]),
  );
  const out = [];
  for (const d of DEFAULT_TYPE_SEED) {
    const s = byName.get(d.name);
    out.push(
      s
        ? {
            name: d.name,
            start: s.start,
            end: s.end,
            kind: s.kind === "diet" ? "diet" : "work",
          }
        : { name: d.name, start: d.start, end: d.end, kind: d.kind || "work" },
    );
    byName.delete(d.name);
  }
  const rest = [...rows]
    .filter((r) => r && r.name && !DEFAULT_TYPE_SEED.some((d) => d.name === r.name))
    .sort((a, b) => {
      const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (so !== 0) return so;
      return String(a.name).localeCompare(String(b.name));
    })
    .map((r) => ({
      name: r.name,
      start: (r.start_time != null ? String(r.start_time) : "").trim(),
      end: (r.end_time != null ? String(r.end_time) : "").trim(),
      kind: String(r.kind || "").trim() === "diet" ? "diet" : "work",
    }));
  return [...out, ...rest];
}

function loadLocalRows() {
  return readWorkScheduleRowsFromMem();
}

function formatLocalYmdFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function serverEntryToLocal(row) {
  const d = row.work_date;
  const workDate =
    typeof d === "string"
      ? d.slice(0, 10)
      : d instanceof Date
        ? formatLocalYmdFromDate(d)
        : String(d || "").slice(0, 10);
  return {
    id: row.id,
    startTime: row.start_time != null ? String(row.start_time) : "",
    endTime: row.end_time != null ? String(row.end_time) : "",
    workType: row.work_type != null ? String(row.work_type) : "",
    memo: row.memo != null ? String(row.memo) : "",
    hours: row.hours != null ? String(row.hours) : "",
    hoursWorked: row.hours_worked != null ? String(row.hours_worked) : "",
    workDate,
  };
}

function rowHasAnyPayload(r) {
  return !!(
    String(r.startTime || "").trim() ||
    String(r.endTime || "").trim() ||
    String(r.workType || "").trim() ||
    String(r.hoursWorked || "").trim() ||
    String(r.workDate || "").trim() ||
    String(r.hours || "").trim() ||
    String(r.memo || "").trim()
  );
}

function normalizeWorkDateStr(r) {
  return String(r.workDate || "").trim().replace(/\//g, "-").slice(0, 10);
}

function isValidYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** @param {string} userId @param {Array<{ name: string, start?: string, end?: string, kind?: string }>} typeList */
async function upsertWorkScheduleTypesToSupabase(userId, typeList) {
  const typeUpserts = typeList.map((t, i) => ({
    user_id: userId,
    name: t.name,
    start_time: t.start || "",
    end_time: t.end || "",
    kind: t.kind === "diet" ? "diet" : "work",
    sort_order: i,
  }));
  if (typeUpserts.length === 0) {
    return { ok: true, count: 0 };
  }
  const { error } = await supabase
    .from(TYPES_TABLE)
    .upsert(typeUpserts, { onConflict: "user_id,name" });
  if (error) return { ok: false, error };
  return { ok: true, count: typeUpserts.length };
}

/** 유형 upsert 성공 후에만 호출: 로컬 목록에 없는 원격 유형만 삭제 */
async function deleteOrphanWorkScheduleTypesRemote(userId, localTypeNames) {
  const typeNames = new Set(localTypeNames);
  const { data: remoteTypes, error: rtErr } = await supabase
    .from(TYPES_TABLE)
    .select("name")
    .eq("user_id", userId);
  if (rtErr || !remoteTypes) return;
  for (const r of remoteTypes) {
    if (!typeNames.has(r.name)) {
      await supabase.from(TYPES_TABLE).delete().eq("user_id", userId).eq("name", r.name);
    }
  }
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/**
 * @param {{ includeTypes?: boolean }} [opts]
 * - includeTypes: true일 때만 서버에서 근무·식단 유형을 가져와 메모에 반영 (유형 설정 모달을 열 때만 사용)
 */
async function pullWorkScheduleFromSupabaseImpl(opts = {}) {
  const includeTypes = !!opts.includeTypes;
  const userId = await getSessionUserId();
  if (!userId || !supabase) return null;

  const pulls = [
    supabase.from(SETTINGS_TABLE).select("daily_work_hours").eq("user_id", userId).maybeSingle(),
    supabase
      .from(ENTRIES_TABLE)
      .select("id, work_date, start_time, end_time, work_type, memo, hours, hours_worked")
      .eq("user_id", userId)
      .order("work_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ];
  if (includeTypes) {
    pulls.splice(
      1,
      0,
      supabase
        .from(TYPES_TABLE)
        .select("name, start_time, end_time, sort_order, kind")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    );
  }
  const results = await Promise.all(pulls);
  const settingsRes = results[0];
  const typesRes = includeTypes ? results[1] : { data: null, error: null };
  const entriesRes = includeTypes ? results[2] : results[1];

  if (includeTypes) {
    if (!typesRes.error) {
      const serverRows = Array.isArray(typesRes.data) ? typesRes.data : [];
      const localRaw = readWorkScheduleTypeOptionsRawFromMem();
      let typesForMem = typeOptionsFromServerRows(serverRows);
      const serverCustomNames = new Set(
        serverRows
          .filter(
            (r) =>
              r &&
              r.name &&
              !DEFAULT_TYPE_SEED.some((d) => d.name === r.name),
          )
          .map((r) => String(r.name).trim())
          .filter(Boolean),
      );
      const namesInMerged = new Set(typesForMem.map((t) => t.name));
      const extras = [];
      if (Array.isArray(localRaw)) {
        for (const entry of localRaw) {
          const name =
            typeof entry === "string"
              ? String(entry || "").trim()
              : String(entry?.name || "").trim();
          if (!name || DEFAULT_TYPE_SEED.some((d) => d.name === name)) continue;
          if (serverCustomNames.has(name) || namesInMerged.has(name)) continue;
          const kind =
            typeof entry === "object" &&
            entry &&
            String(entry.kind || "").trim() === "diet"
              ? "diet"
              : "work";
          const start =
            typeof entry === "object" && entry && entry.start != null
              ? String(entry.start).trim()
              : "";
          const end =
            typeof entry === "object" && entry && entry.end != null
              ? String(entry.end).trim()
              : "";
          const addedAt =
            typeof entry === "object" &&
            entry &&
            typeof entry.addedAt === "number" &&
            Number.isFinite(entry.addedAt)
              ? entry.addedAt
              : 0;
          extras.push({ name, start, end, kind, addedAt });
          namesInMerged.add(name);
        }
      }
      if (extras.length > 0) {
        wsSyncLog(
          "pull: work_schedule_types — 서버에 없는 로컬·미러 커스텀 유형 병합",
          extras.length,
        );
        typesForMem = [...typesForMem, ...extras];
      }
      writeWorkScheduleTypeOptionsRawToMem(typesForMem);
      wsSyncLog("pull: types → mem", serverRows.length, "merged", typesForMem.length);
    } else {
      wsSyncLog("pull: work_schedule_types 조회 오류 — 유형 메모 유지", typesRes.error);
      try {
        console.warn(
          "[근무-식단표 동기화] 유형 불러오기 실패:",
          typesRes.error?.message || typesRes.error,
          "(kind 컬럼 없으면 마이그레이션 적용 필요)",
        );
      } catch (_) {}
    }
  } else {
    wsSyncLog("pull: work_schedule_types — 생략 (includeTypes false)");
  }

  let resolvedRows = loadLocalRows();
  if (!entriesRes.error) {
    const rowsFromServer = (entriesRes.data || []).map(serverEntryToLocal);
    resolvedRows = applyWorkScheduleRowTimesFromTypes(rowsFromServer);
    writeWorkScheduleRowsToMem(resolvedRows);
    wsSyncLog(
      "pull: server snapshot → mem",
      "entries",
      (entriesRes.data || []).length,
      "resolved",
      resolvedRows.length,
    );
  } else {
    wsSyncLog("pull: entries error — rows mem unchanged", loadLocalRows().length);
  }

  if (!settingsRes.error) {
    const serverHours = settingsRes.data?.daily_work_hours;
    if (serverHours != null && !Number.isNaN(Number(serverHours))) {
      writeWorkScheduleDailyHoursToMem(Number(serverHours));
    }
  }

  return { rows: resolvedRows };
}

/** 로그인·동기화 시 서버 스냅샷 → 세션 메모리 (opts.includeTypes 기본 false) */
export async function pullWorkScheduleFromSupabase(opts = {}) {
  return runWorkScheduleSerialized(() => pullWorkScheduleFromSupabaseImpl(opts));
}

/**
 * @param {{ syncTypes?: boolean, syncEntries?: boolean }} [opts]
 * - syncTypes: 유형 설정에서 추가/삭제한 경우만 true
 * - syncEntries: 캘린더 행 저장 등 — 설정·일정 행만 서버 반영
 */
async function syncWorkScheduleToSupabaseImpl(opts = {}) {
  const syncTypes = !!opts.syncTypes;
  const syncEntries = !!opts.syncEntries;
  if (!syncTypes && !syncEntries) {
    wsSyncLog("push: skip (syncTypes/syncEntries 모두 false)");
    return;
  }

  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  let daily_work_hours = 8.5;
  if (syncEntries) {
    let dailyStr = "8.5";
    const dhMem = readWorkScheduleDailyHoursFromMem();
    if (dhMem != null && !Number.isNaN(dhMem)) dailyStr = String(dhMem);
    const dailyNum = parseFloat(dailyStr);
    daily_work_hours = !Number.isNaN(dailyNum) && dailyNum >= 0 ? dailyNum : 8.5;
  }

  const rawTypes = parseLocalTypes();
  let typeList =
    rawTypes.length > 0
      ? rawTypes.map(normalizeTypeEntry).filter((t) => t.name)
      : typeOptionsFromServerRows([]);
  if (typeList.length === 0) {
    typeList = typeOptionsFromServerRows([]);
  }

  let rows = loadLocalRows();
  rows = rows.map((r) => {
    const id = r.id != null ? String(r.id).trim() : "";
    if (isUuid(id)) return r;
    return { ...r, id: crypto.randomUUID() };
  });
  rows = applyWorkScheduleRowTimesFromTypes(rows);
  writeWorkScheduleRowsToMem(rows);

  const idsStillInLocal = new Set(rows.map((r) => String(r.id || "").trim()).filter((id) => isUuid(id)));

  const entryPayloads = syncEntries
    ? rows
        .filter(rowHasAnyPayload)
        .map((r) => {
          const wd = normalizeWorkDateStr(r);
          if (!isValidYmd(wd)) return null;
          const id = String(r.id || "").trim();
          return {
            id,
            user_id: userId,
            work_date: wd,
            start_time: String(r.startTime || "").trim(),
            end_time: String(r.endTime || "").trim(),
            work_type: String(r.workType || "").trim(),
            memo: String(r.memo || "").trim(),
            hours: String(r.hours != null ? r.hours : "").trim(),
            hours_worked: String(r.hoursWorked != null ? r.hoursWorked : "").trim(),
          };
        })
        .filter(Boolean)
    : [];

  if (syncEntries) {
    const { error: setErr } = await supabase.from(SETTINGS_TABLE).upsert(
      { user_id: userId, daily_work_hours },
      { onConflict: "user_id" },
    );
  }

  if (syncTypes) {
    const pushTypes = await upsertWorkScheduleTypesToSupabase(userId, typeList);
    if (!pushTypes.ok) {
      const tErr = pushTypes.error;
      wsSyncLog(
        "push: work_schedule_types upsert 실패 — 스키마·RLS·네트워크 확인",
        tErr?.message || String(tErr),
      );
      try {
        console.warn(
          "[근무-식단표 동기화] 유형 저장 실패:",
          tErr?.message || tErr,
          "→ Supabase SQL에 supabase/migrations/20260419120000_work_schedule_meal_schema.sql 실행",
        );
      } catch (_) {}
      try {
        showToast(
          "서버에 근무·식단 유형을 저장하지 못했습니다.",
          "Supabase 대시보드 → SQL에서 프로젝트 파일 20260419120000_work_schedule_meal_schema.sql 내용을 실행한 뒤 다시 시도해 주세요.",
        );
      } catch (_) {}
    } else {
      if (pushTypes.count > 0) {
        wsSyncLog("push: work_schedule_types upsert OK", pushTypes.count);
      }
      await deleteOrphanWorkScheduleTypesRemote(
        userId,
        typeList.map((t) => t.name),
      );
    }
  }

  if (syncEntries && entryPayloads.length > 0) {
    await supabase.from(ENTRIES_TABLE).upsert(entryPayloads, { onConflict: "id" });
  }

  /* 원격에만 있는 work_schedule_entries 삭제(로컬 id 집합과 diff).
   * 예전: entryPayloads.length > 0 일 때만 돌렸는데, 전부 지운 경우(로컬 [])는 payload가 비어
   * 고아 삭제가 스킵되어, 직후 pull이 삭제한 행을 “부활”시킬 수 있음. */
  if (syncEntries) {
    const { data: remoteEntries, error: reErr } = await supabase
      .from(ENTRIES_TABLE)
      .select("id")
      .eq("user_id", userId);
    const allowOrphanEntryDelete =
      !reErr &&
      Array.isArray(remoteEntries) &&
      (entryPayloads.length > 0 ||
        (rows.length === 0 && idsStillInLocal.size === 0) ||
        (idsStillInLocal.size > 0 && entryPayloads.length === 0));
    if (allowOrphanEntryDelete) {
      wsSyncLog(
        "push: orphan entry delete check, remote",
        remoteEntries.length,
        "local ids",
        idsStillInLocal.size,
        "entryPayloads",
        entryPayloads.length,
      );
      for (const r of remoteEntries) {
        if (!idsStillInLocal.has(r.id)) {
          await supabase.from(ENTRIES_TABLE).delete().eq("user_id", userId).eq("id", r.id);
        }
      }
    } else if (!reErr && remoteEntries?.length) {
      wsSyncLog("push: SKIP orphan entry delete (safety), rows", rows.length, "entries", entryPayloads.length);
    }
  }

  /* 푸시 직후 자동 pull 제거: 서버 쓰기는 위에서 끝난 것이고, pull은 탭/모달에서만(읽기). */
}

/** 세션 메모리를 서버에 반영 (직렬 큐). opts 생략 시 types+entries 모두 (초기 빈 서버 업로드 등) */
export async function syncWorkScheduleToSupabase(opts) {
  const o =
    opts && typeof opts === "object"
      ? opts
      : { syncTypes: true, syncEntries: true };
  return runWorkScheduleSerialized(() => syncWorkScheduleToSupabaseImpl(o));
}

let _listenerAttached = false;

export function attachWorkScheduleSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  /* 근무-식단표: 서버에 반영은 이 이벤트로만(일정 저장·삭제, 유형 추가·삭제). */
  window.addEventListener("work-schedule-saved", (e) => {
    const d = (e && e.detail) || {};
    const syncTypes = !!d.types;
    const syncEntries = !!d.entries;
    if (!syncTypes && !syncEntries) return;
    syncWorkScheduleToSupabase({ syncTypes, syncEntries }).catch(() => {});
  });
}

/**
 * App 근무-식단표 탭: 서버 **읽기**만(자동 push 없음). 메모·UI는 이후에 저장 시에만 서버에 올라감.
 * @returns {Promise<{ anyChanged: boolean }>}
 */
export async function hydrateWorkScheduleFromCloud() {
  lpPullDebug("hydrateWorkScheduleFromCloud", {});
  wsSyncLog("tab: pull work_schedule (read only, no auto-push)");
  attachWorkScheduleSaveListener();
  if (!supabase) {
    return { anyChanged: false };
  }
  const beforeSnap = snapshotWorkScheduleMemForCompare();
  await pullWorkScheduleFromSupabase({ includeTypes: false });
  const afterSnap = snapshotWorkScheduleMemForCompare();
  const anyChanged = beforeSnap !== afterSnap;
  wsSyncLog("tab: pull done", { anyChanged });
  return { anyChanged };
}
