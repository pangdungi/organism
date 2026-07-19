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

const DIARY_REALTIME_TABLES = ["diary_daily_entries"];

/** 홈 3분할(시간·습관·캘린더) 갱신에 쓰는 Realtime 테이블 */
const CALENDAR_REALTIME_TABLES = [
  "calendar_section_tasks",
  "calendar_day_icons",
];

const DESKTOP_DASHBOARD_REALTIME_TABLES_SET = new Set([
  ...TIME_LEDGER_REALTIME_TABLES,
  ...KPI_REALTIME_TABLES,
  ...CALENDAR_REALTIME_TABLES,
]);

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

/** Realtime 이벤트 디바운스 — 홈 3분할은 여기서 pull·soft refresh */
const REALTIME_REFRESH_DEBOUNCE_MS = 1800;

/**
 * @param {{
 *   getCurrentTabId: () => string,
 *   refreshDesktopDashboardFromRealtime?: (touchedTables: string[]) => Promise<boolean>,
 * }} opts
 */
function debouncedRealtimeRefresh(opts) {
  const { getCurrentTabId, refreshDesktopDashboardFromRealtime } = opts;
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
        const tab = getCurrentTabId();
        const touched = [...realtimeTouchedTables];
        const touchesDashboard = touched.some((t) =>
          DESKTOP_DASHBOARD_REALTIME_TABLES_SET.has(t),
        );
        if (
          tab === "home" &&
          touchesDashboard &&
          typeof refreshDesktopDashboardFromRealtime === "function"
        ) {
          const refreshed = await refreshDesktopDashboardFromRealtime(touched);
          syncWatchLog("realtime_디바운스끝", {
            gen,
            debounceMs: REALTIME_REFRESH_DEBOUNCE_MS,
            postgres_changes테이블: touched,
            note: "홈 3분할 — pull 후 embed soft refresh",
            refreshed,
          });
          logTabSync("realtime_debounced_pull", { gen, refreshed });
          lpPullDebug("realtime_desktop_dashboard_pull", {
            gen,
            tab,
            refreshed,
            realtimeTouchedTables: touched,
            timeLedgerRtTables: [...timeBatch.touchedTables],
          });
          logLpRender("realtime:홈 대시보드 pull", { gen, refreshed });
          return;
        }
        syncWatchLog("realtime_디바운스끝", {
          gen,
          debounceMs: REALTIME_REFRESH_DEBOUNCE_MS,
          postgres_changes테이블: touched,
          note: "홈 3분할 외 — Realtime 후 자동 pull 없음(탭 전환 시 pull)",
        });
        logTabSync("realtime_debounced_no_pull", { gen, tab });
        lpPullDebug("realtime_debounced_pull_bundle", {
          gen,
          tab,
          realtimeTouchedTables: touched,
          timeLedgerRtTables: [...timeBatch.touchedTables],
        });
        logLpRender("realtime:자동 pull 없음(탭 전환 시 동기화)", { gen, tab });
      } catch (_e) {}
    })();
  }, REALTIME_REFRESH_DEBOUNCE_MS);
}

/**
 * @param {{
 *   getCurrentTabId: () => string,
 *   renderMain: (opts?: { skipTodoSaveBeforeUnmount?: boolean }) => void,
 *   refreshDesktopDashboardFromRealtime?: (touchedTables: string[]) => Promise<boolean>,
 * }} opts
 */
export function initSupabaseRealtimeSync(opts) {
  const { getCurrentTabId, renderMain, refreshDesktopDashboardFromRealtime } =
    opts;
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
      debouncedRealtimeRefresh({
        getCurrentTabId,
        refreshDesktopDashboardFromRealtime,
      });
    };

    let ch = supabase.channel(`lp-multi-${uid}`, {
      config: { broadcast: { self: false } },
    });

    for (const table of CALENDAR_REALTIME_TABLES) {
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
