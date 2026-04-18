/**
 * Supabase Realtime — 다른 기기·탭에서 저장 시 이 브라우저가 서버 내용을 곧바로 받아 반영.
 * (대시보드 Database → Replication 에서 테이블별 Realtime 이 켜져 있어야 동작합니다.)
 */

import { supabase } from "../supabase.js";
import { timeLedgerEntryPayloadTouchesSessionPicker } from "./timeLedgerEntriesSupabase.js";
import { logLpRender } from "./lpRenderDebugLog.js";
import { logTabSync } from "./lpTabSyncDebug.js";
import { lpPullDebug } from "./lpPullDebug.js";
import { syncWatchLog } from "./syncWatchLog.js";

const KPI_REALTIME_TABLES = [
  "dream_map_categories",
  "dream_map_kpis",
  "dream_map_kpi_logs",
  "dream_map_kpi_todos",
  "dream_map_kpi_daily_todos",
  "dream_map_meta",
  "happiness_map_categories",
  "happiness_map_kpis",
  "happiness_map_kpi_logs",
  "happiness_map_kpi_todos",
  "happiness_map_kpi_daily_todos",
  "happiness_map_meta",
  "health_map_categories",
  "health_map_kpis",
  "health_map_kpi_logs",
  "health_map_kpi_todos",
  "health_map_kpi_daily_todos",
  "health_map_meta",
  "sideincome_map_paths",
  "sideincome_map_path_logs",
  "sideincome_map_kpis",
  "sideincome_map_kpi_logs",
  "sideincome_map_kpi_todos",
  "sideincome_map_kpi_daily_todos",
  "sideincome_map_meta",
];

/** postgres_changes 배치에 이 중 하나라도 있을 때만 pullAllKpiMapsFromCloud 실행 */
const KPI_REALTIME_TABLES_SET = new Set(KPI_REALTIME_TABLES);

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

/** Realtime 이벤트 디바운스(로그용). 서버 pull 은 App 상위 탭 전환 시에만 수행 */
const REALTIME_REFRESH_DEBOUNCE_MS = 1800;

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
        syncWatchLog("realtime_디바운스끝", {
          gen,
          debounceMs: REALTIME_REFRESH_DEBOUNCE_MS,
          postgres_changes테이블: [...realtimeTouchedTables],
          note: "서버 pull 은 상위 탭 전환 시에만 — Realtime 으로는 자동 fetch 안 함",
        });
        logTabSync("realtime_debounced_no_pull", { gen });
        lpPullDebug("realtime_debounced_pull_bundle", {
          gen,
          tab: getCurrentTabId(),
          realtimeTouchedTables: [...realtimeTouchedTables],
          timeLedgerRtTables: [...timeBatch.touchedTables],
        });
        logLpRender("realtime:자동 pull 비활성(탭 전환 시에만 동기화)", { gen });
      } catch (_e) {}
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

    /* calendar_section_tasks: Realtime으로 자동 목록 갱신 안 함(탭 진입 시 SELECT) */

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

    _channel = ch.subscribe((_status, _err) => {});
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
