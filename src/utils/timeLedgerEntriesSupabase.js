/**
 * 시간가계부 기록 행 ↔ Supabase (time_ledger_entries)
 */

import { supabase } from "../supabase.js";
import {
  ensureTimeLedgerEntryIds,
  localTimeLedgerRowToDbPayload,
  mergeTimeLedgerEntriesFromServer,
  mergeTimeLedgerEntriesFromServerForDateRange,
  readTimeLedgerEntriesRaw,
  timeLedgerMonthRangeYmd,
  timeLedgerRowIsSyncable,
  writeTimeLedgerEntriesRaw,
} from "./timeLedgerEntriesModel.js";

const TABLE = "time_ledger_entries";

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

export async function syncTimeLedgerEntriesToSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    if (_lastArchiveMemoSaveDetail?.entryId) {
      console.warn("[archive] [메모→서버] 로그인 없음 또는 Supabase 없음 — upsert 안 함", {
        entryId: _lastArchiveMemoSaveDetail.entryId,
      });
      _lastArchiveMemoSaveDetail = null;
    }
    return;
  }

  let rows = readTimeLedgerEntriesRaw();
  const ensured = ensureTimeLedgerEntryIds(rows);
  if (ensured.dirty) {
    rows = ensured.rows;
    writeTimeLedgerEntriesRaw(rows);
  }

  const substantive = rows.filter((r) => timeLedgerRowIsSyncable(r));
  const wantIds = new Set(substantive.map((r) => String(r.id).trim()));

  if (substantive.length > 0) {
    const payloads = substantive
      .map((r) => localTimeLedgerRowToDbPayload(userId, r))
      .filter(Boolean);
    if (payloads.length > 0) {
      const { error } = await supabase.from(TABLE).upsert(payloads, { onConflict: "id" });
      if (error) console.warn("[time-ledger-entries] upsert", error.message);

      const arc = _lastArchiveMemoSaveDetail;
      if (arc?.entryId) {
        const eid = arc.entryId;
        const inPayload = payloads.some((p) => String(p?.id || "").trim() === eid);
        const payloadRow = payloads.find((p) => String(p?.id || "").trim() === eid);
        console.info("[archive] [메모→서버] upsert 결과 (행 삭제 아님, memo 필드 갱신)", {
          entryId: eid,
          "이번 upsert 배열에 포함됨(서버에 반영 시도됨)": inPayload,
          upsert요청_행수: payloads.length,
          오류: error ? String(error.message) : null,
          서버에_보낸_memo_필드_미리보기: payloadRow
            ? String(payloadRow.memo ?? "").slice(0, 80)
            : "(해당 id 없음 — 동기화 대상 행에서 빠짐)",
        });
        if (!inPayload) {
          console.warn(
            "[archive] [메모→서버] 이 행은 upsert 대상이 아님. 메모만 비워서 taskName·시작시간 등이 없으면 timeLedgerRowIsSyncable 이 false가 될 수 있어요.",
          );
        }
        _lastArchiveMemoSaveDetail = null;
      }
    } else if (_lastArchiveMemoSaveDetail?.entryId) {
      console.warn("[archive] [메모→서버] 동기화 대상은 있으나 payload 0건 — 서버 반영 안 됨", {
        entryId: _lastArchiveMemoSaveDetail.entryId,
      });
      _lastArchiveMemoSaveDetail = null;
    }
  } else if (_lastArchiveMemoSaveDetail?.entryId) {
    console.warn("[archive] [메모→서버] upsert할 동기화 대상 행이 0건 — 서버 반영 안 됨", {
      entryId: _lastArchiveMemoSaveDetail.entryId,
    });
    _lastArchiveMemoSaveDetail = null;
  }

  const { data: remote, error: listErr } = await supabase
    .from(TABLE)
    .select("id")
    .eq("user_id", userId);
  if (listErr || !remote) return;

  for (const r of remote) {
    const id = String(r.id || "").trim();
    if (id && !wantIds.has(id)) {
      const { error: dErr } = await supabase.from(TABLE).delete().eq("id", id).eq("user_id", userId);
      if (dErr) console.warn("[time-ledger-entries] delete", dErr.message);
    }
  }
}

const LEDGER_ENTRY_SELECT =
  "id, entry_date, task_id, task_name, start_time, end_time, productivity, category, time_tracked, focus_events, memo, memo_tags, updated_at";

export async function pullTimeLedgerEntriesFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select(LEDGER_ENTRY_SELECT)
    .eq("user_id", userId)
    .order("entry_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (error) {
    console.warn("[time-ledger-entries] pull", error.message);
    return false;
  }
  if (!data?.length) return false;

  mergeTimeLedgerEntriesFromServer(data);
  return true;
}

/**
 * entry_date가 [rangeStart, rangeEnd] (포함)인 행만 서버에서 받아 로컬에 병합.
 * 빈 배열이면 해당 달의 syncable UUID 로컬 행은 삭제 반영.
 */
export async function pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd) {
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    console.info("[archive] [데이터] 서버 pull 생략", {
      이유: !userId ? "로그인 없음" : "Supabase 미설정",
    });
    return false;
  }
  const rs = String(rangeStart || "").trim();
  const re = String(rangeEnd || "").trim();
  if (!rs || !re) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select(LEDGER_ENTRY_SELECT)
    .eq("user_id", userId)
    .gte("entry_date", rs)
    .lte("entry_date", re)
    .order("entry_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (error) {
    console.warn("[time-ledger-entries] pull range", error.message);
    return false;
  }

  console.info("[archive] [데이터] Supabase에서 받음", {
    테이블: TABLE,
    entry_date: `${rs} ~ ${re}`,
    받은행수: (data ?? []).length,
  });
  mergeTimeLedgerEntriesFromServerForDateRange(data ?? [], rs, re);
  return true;
}

/**
 * 아카이브: 먼저 해당 연·월을 서버에서 받아 로컬에 반영한 뒤, 그다음 로컬→서버 동기.
 * (push를 먼저 하면 다른 기기에서 삭제한 행이 로컬에 남아 upsert로 서버에 부활함)
 */
export async function hydrateTimeLedgerEntriesForArchiveMonth(year, month) {
  if (!supabase) {
    console.info("[archive] [데이터] 월 동기화 스킵", { 이유: "Supabase 클라이언트 없음" });
    return false;
  }
  attachTimeLedgerEntriesSaveListener();
  const { rangeStart, rangeEnd } = timeLedgerMonthRangeYmd(year, month);
  console.info("[archive] [데이터] 월 범위", { rangeStart, rangeEnd });
  const pulledOk = await pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd);
  /* 목록 표시는 pull 병합만 되면 가능 — upsert·원격 정리는 백그라운드(아카이브 로딩 체감 단축) */
  console.info("[archive] [데이터] 로컬→서버 syncTimeLedgerEntriesToSupabase 백그라운드");
  void syncTimeLedgerEntriesToSupabase().catch((e) =>
    console.warn("[time-ledger-entries] archive month hydrate sync", e),
  );
  return pulledOk;
}

export async function pushAllLocalTimeLedgerEntriesIfServerEmpty() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { count, error } = await supabase
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return;
  if (count != null && count > 0) return;

  const rows = readTimeLedgerEntriesRaw();
  if (!rows.some((r) => timeLedgerRowIsSyncable(r))) return;

  await syncTimeLedgerEntriesToSupabase();
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 1200;

/** 아카이브 메모 저장 직후 동기화 로그용 (detail.source === archiveMemo) */
let _lastArchiveMemoSaveDetail = null;

export function scheduleTimeLedgerEntriesSyncPush() {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncTimeLedgerEntriesToSupabase().catch((e) =>
      console.warn("[time-ledger-entries]", e),
    );
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachTimeLedgerEntriesSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("time-ledger-entries-saved", (e) => {
    const d = e?.detail;
    if (d && d.source === "archiveMemo" && d.entryId) {
      _lastArchiveMemoSaveDetail = { entryId: String(d.entryId).trim() };
      console.info("[archive] [메모→동기화] 서버 upsert 예약", {
        entryId: _lastArchiveMemoSaveDetail.entryId,
        디바운스_ms: PUSH_DEBOUNCE_MS,
      });
    }
    scheduleTimeLedgerEntriesSyncPush();
  });
}

export async function hydrateTimeLedgerEntriesFromCloud() {
  if (!supabase) return false;
  attachTimeLedgerEntriesSaveListener();
  const pulled = await pullTimeLedgerEntriesFromSupabase();
  await pushAllLocalTimeLedgerEntriesIfServerEmpty();
  await syncTimeLedgerEntriesToSupabase();
  return pulled;
}
