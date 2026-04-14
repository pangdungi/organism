/**
 * Supabase Realtime — 다른 기기·탭에서 저장 시 이 브라우저가 서버 내용을 곧바로 받아 반영.
 * (대시보드 Database → Replication 에서 테이블별 Realtime 이 켜져 있어야 동작합니다.)
 */

import { supabase } from "../supabase.js";
import { hydrateTodoSectionTasksFromCloud } from "./todoSectionTasksSupabase.js";
import { pullAllKpiMapsFromCloud } from "./kpiTabCloudRefresh.js";
import { pullAllTimeLedgerFromCloud } from "./timeLedgerCloudRefresh.js";
import { timeLedgerEntryPayloadTouchesSessionPicker } from "./timeLedgerEntriesSupabase.js";
import { pullAllAssetFromCloud } from "./assetCloudRefresh.js";
import { pullAllDiaryFromCloud } from "./diaryCloudRefresh.js";
import { logLpRender } from "./lpRenderDebugLog.js";
import { logTabSync } from "./lpTabSyncDebug.js";
import { lpPullDebug } from "./lpPullDebug.js";
import { syncWatchLog } from "./syncWatchLog.js";

/** App.js 의 TAB_IDS_REFRESH_ON_KPI_PULL 과 동일 — 이 탭일 때만 pull 후 화면 갱신 (time 은 전체 renderMain 대신 이벤트로 부분 갱신) */
const REFRESH_MAIN_AFTER_CLOUD_PULL = new Set([
  "home",
  "dream",
  "sideincome",
  "happiness",
  "health",
  "calendar",
  "schedulecalendar",
  "asset",
  "diary",
  "archive",
]);

const KPI_REALTIME_TABLES = [
  "dream_map_categories",
  "dream_map_kpis",
  "dream_map_meta",
  "happiness_map_categories",
  "happiness_map_kpis",
  "happiness_map_meta",
  "health_map_categories",
  "health_map_kpis",
  "health_map_meta",
  "sideincome_map_paths",
  "sideincome_map_kpis",
  "sideincome_map_meta",
];

/** 시간가계부 기록·과제·일간 예산 — KPI·할일과 동일하게 postgres_changes 로 병합 */
const TIME_LEDGER_REALTIME_TABLES = [
  "time_ledger_entries",
  "time_ledger_tasks",
  "time_daily_budget_days",
];

/** 자산관리 — 가계부·순자산·설정 등 */
const ASSET_REALTIME_TABLES = [
  "asset_user_expense_transactions",
  "asset_user_expense_classifications",
  "asset_user_payment_options",
  "asset_user_net_worth_bundle",
  "asset_user_net_worth_goal",
  "asset_user_plan_monthly_goals",
  "asset_user_stock_category_options",
];

const DIARY_REALTIME_TABLES = ["diary_daily_entries"];

/** 사용자가 입력 중인지 확인 (입력 중이면 화면 갱신 건너뜀) */
function isUserTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if (el.isContentEditable) return true;
  return false;
}

let _channel = null;
let _debounceTimer = null;
let _generation = 0;

/** 이번 디바운스 윈도에 쌓인 시간가계부 Realtime 이벤트 (배치 끝에서 초기화). */
let _timeLedgerRtBatch = {
  touchedTables: /** @type {Set<string>} */ (new Set()),
  entryTouchesPicker: false,
};

/** 디바운스 윈도 동안 postgres_changes 로 건드린 테이블명 (가계부 pull 스킵 판별용). */
let _realtimeAllTablesBatch = /** @type {Set<string>} */ (new Set());

function recordTimeLedgerRealtimePayload(payload) {
  const table = payload?.table;
  if (!TIME_LEDGER_REALTIME_TABLES.includes(table)) return;
  _timeLedgerRtBatch.touchedTables.add(table);
  if (table === "time_ledger_entries") {
    if (timeLedgerEntryPayloadTouchesSessionPicker(payload)) {
      _timeLedgerRtBatch.entryTouchesPicker = true;
    }
  }
}

/**
 * pull 결과로 전체 renderMain 할지 — 현재 탭과 무관한 도메인만 바뀐 경우 할일/캘린더·KPI 화면이 불필요하게 깜빡이지 않게 함.
 * @param {string} tab
 * @param {{ needTodo: boolean, kpiMapsChanged: boolean, timeLedgerChanged: boolean, assetChanged: boolean, diaryChanged: boolean }} flags
 */
function shouldRenderMainForRealtimePull(tab, flags) {
  const {
    needTodo,
    kpiMapsChanged,
    timeLedgerChanged,
    assetChanged,
    diaryChanged,
  } = flags;
  switch (tab) {
    case "calendar":
    case "schedulecalendar":
      return needTodo;
    case "asset":
      return assetChanged;
    case "diary":
      return diaryChanged;
    case "dream":
    case "health":
    case "happiness":
    case "sideincome":
      return kpiMapsChanged;
    case "home":
      return (
        needTodo ||
        kpiMapsChanged ||
        timeLedgerChanged ||
        assetChanged ||
        diaryChanged
      );
    case "archive":
      return (
        needTodo || kpiMapsChanged || assetChanged || diaryChanged
      );
    default:
      return (
        needTodo ||
        kpiMapsChanged ||
        timeLedgerChanged ||
        assetChanged ||
        diaryChanged
      );
  }
}

/** Realtime 이벤트 폭주 시 pull·render 연속 호출 완화 (push 디바운스와 비슷한 체감) */
const REALTIME_REFRESH_DEBOUNCE_MS = 1800;

/**
 * 전체 renderMain 직후 짧은 간격에 시간가계부 Realtime만 또 오면(PWA·모바일에서 마치 초마다 새로고침) 화면이 깜빡임.
 * 할일·KPI·자산·일기 변경은 즉시 반영하고, 시간/예산 등만 연속일 때만 쿨다운.
 */
let _lastRealtimeRenderMainAt = 0;
const REALTIME_RENDER_MAIN_COOLDOWN_MS = 4500;

function debouncedRealtimeRefresh(getCurrentTabId, renderMain) {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    const gen = ++_generation;
    const timeBatch = {
      touchedTables: new Set(_timeLedgerRtBatch.touchedTables),
      entryTouchesPicker: _timeLedgerRtBatch.entryTouchesPicker,
    };
    _timeLedgerRtBatch.touchedTables.clear();
    _timeLedgerRtBatch.entryTouchesPicker = false;
    const realtimeTouchedTables = new Set(_realtimeAllTablesBatch);
    _realtimeAllTablesBatch.clear();

    void (async () => {
      try {
        syncWatchLog("realtime_디바운스끝_ pull실행", {
          gen,
          debounceMs: REALTIME_REFRESH_DEBOUNCE_MS,
          postgres_changes테이블: [...realtimeTouchedTables],
          note: "이벤트마다 타이머만 재설정·연속이면 한 번에 묶음. 1초 폴링 아님",
        });
        logTabSync("realtime_debounced_pull", { gen });
        lpPullDebug("realtime_debounced_pull_bundle", {
          gen,
          tab: getCurrentTabId(),
          realtimeTouchedTables: [...realtimeTouchedTables],
          timeLedgerRtTables: [...timeBatch.touchedTables],
        });
        logLpRender("realtime:debounced 틱 시작", { gen });
        const needTodo = await hydrateTodoSectionTasksFromCloud();
        const { anyChanged: kpiMapsChanged } = await pullAllKpiMapsFromCloud(getCurrentTabId);
        const hasTimeRealtime = timeBatch.touchedTables.size > 0;
        /* 기록(time_ledger_entries)이 피커 구간에 닿는 이벤트가 있을 때만 항목 pull. 과제·예산만 변했으면 생략. */
        const skipEntries =
          hasTimeRealtime &&
          !(
            timeBatch.touchedTables.has("time_ledger_entries") &&
            timeBatch.entryTouchesPicker
          );
        let timeLedgerChanged = hasTimeRealtime
          ? (await pullAllTimeLedgerFromCloud({ skipEntries })).anyChanged
          : false;
        /*
         * KPI 맵만 Realtime으로 바뀐 경우에도: 과제 목록은 time_ledger_tasks pull 시 KPI 연동 이름을 합침.
         * (시간「기록」행은 건드리지 않음 — skipEntries: true)
         */
        if (!hasTimeRealtime && kpiMapsChanged) {
          const t = await pullAllTimeLedgerFromCloud({ skipEntries: true });
          timeLedgerChanged = timeLedgerChanged || t.anyChanged;
        }
        const { anyChanged: assetChanged } = await pullAllAssetFromCloud(getCurrentTabId, {
          realtimeTouchedTables,
        });
        const { anyChanged: diaryChanged } = await pullAllDiaryFromCloud();
        if (gen !== _generation) return;
        if (
          !needTodo &&
          !kpiMapsChanged &&
          !timeLedgerChanged &&
          !assetChanged &&
          !diaryChanged
        ) {
          logLpRender("realtime:pull 결과 변경 없음·renderMain 안 함", { gen });
          return;
        }
        const tab = getCurrentTabId();
        if (timeLedgerChanged && tab === "time") {
          try {
            document.dispatchEvent(
              new CustomEvent("lp-time-ledger-remote-updated"),
            );
          } catch (_) {}
          if (!needTodo && !kpiMapsChanged && !assetChanged && !diaryChanged)
            return;
        }
        /* 아카이브: 전체 renderMain 하면 탭이 통째로 다시 그려져 로딩 스켈레톤이 ~수초마다 깜빡임 */
        if (timeLedgerChanged && tab === "archive") {
          try {
            document.dispatchEvent(
              new CustomEvent("lp-time-ledger-remote-updated"),
            );
          } catch (_) {}
          if (!needTodo && !kpiMapsChanged && !assetChanged && !diaryChanged)
            return;
        }
        if (!REFRESH_MAIN_AFTER_CLOUD_PULL.has(tab)) return;
        if (isUserTyping()) return; /* 입력 중이면 화면 갱신 건너뜀 */
        if (
          !shouldRenderMainForRealtimePull(tab, {
            needTodo,
            kpiMapsChanged,
            timeLedgerChanged,
            assetChanged,
            diaryChanged,
          })
        ) {
          logLpRender("realtime:현재 탭에선 renderMain 스킵(shouldRenderMainForRealtimePull)", {
            tab,
            needTodo,
            kpiMapsChanged,
            timeLedgerChanged,
            assetChanged,
            diaryChanged,
          });
          return;
        }
        const nowMs = Date.now();
        const timeLedgerOnlyChurn =
          !needTodo &&
          timeLedgerChanged &&
          !kpiMapsChanged &&
          !assetChanged &&
          !diaryChanged;
        if (
          timeLedgerOnlyChurn &&
          nowMs - _lastRealtimeRenderMainAt < REALTIME_RENDER_MAIN_COOLDOWN_MS
        ) {
          logLpRender("realtime:renderMain 쿨다운(시간·예산 등만 연속 변경)", {
            tab,
            waitMs:
              REALTIME_RENDER_MAIN_COOLDOWN_MS -
              (nowMs - _lastRealtimeRenderMainAt),
          });
          return;
        }
        logLpRender("realtime:debouncedRealtimeRefresh → renderMain", {
          tab,
          needTodo,
          kpiMapsChanged,
          timeLedgerChanged,
          assetChanged,
          diaryChanged,
        });
        _lastRealtimeRenderMainAt = nowMs;
        renderMain({ skipTodoSaveBeforeUnmount: true });
      } catch (e) {
        console.warn("[realtime] pull/render 오류", e?.message || e);
      }
    })();
  }, REALTIME_REFRESH_DEBOUNCE_MS);
}

/**
 * @param {{ getCurrentTabId: () => string, renderMain: (opts?: { skipTodoSaveBeforeUnmount?: boolean }) => void }} opts
 */
export function initSupabaseRealtimeSync(opts) {
  const { getCurrentTabId, renderMain } = opts;
  if (!supabase || typeof getCurrentTabId !== "function" || typeof renderMain !== "function") return;

  const teardown = async () => {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
    if (_channel) {
      try {
        await supabase.removeChannel(_channel);
      } catch (_) {}
      _channel = null;
    }
  };

  const bind = (uid) => {
    void teardown();
    const onEvent = (payload) => {
      const tbl = payload?.table;
      if (tbl) _realtimeAllTablesBatch.add(tbl);
      recordTimeLedgerRealtimePayload(payload);
      debouncedRealtimeRefresh(getCurrentTabId, renderMain);
    };

    let ch = supabase.channel(`lp-multi-${uid}`, {
      config: { broadcast: { self: false } },
    });

    ch = ch.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "calendar_section_tasks",
        filter: `user_id=eq.${uid}`,
      },
      onEvent,
    );

    for (const table of KPI_REALTIME_TABLES) {
      ch = ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `user_id=eq.${uid}`,
        },
        onEvent,
      );
    }

    for (const table of TIME_LEDGER_REALTIME_TABLES) {
      ch = ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `user_id=eq.${uid}`,
        },
        onEvent,
      );
    }

    for (const table of ASSET_REALTIME_TABLES) {
      ch = ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `user_id=eq.${uid}`,
        },
        onEvent,
      );
    }

    for (const table of DIARY_REALTIME_TABLES) {
      ch = ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `user_id=eq.${uid}`,
        },
        onEvent,
      );
    }

    _channel = ch.subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[realtime] 채널 상태", status, err?.message || err || "");
      }
    });
  };

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session?.user?.id) {
      void teardown();
      return;
    }
    bind(session.user.id);
  });

  void supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user?.id) bind(session.user.id);
  });
}
