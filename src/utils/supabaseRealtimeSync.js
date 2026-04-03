/**
 * Supabase Realtime — 다른 기기·탭에서 저장 시 이 브라우저가 서버 내용을 곧바로 받아 반영.
 * (대시보드 Database → Replication 에서 테이블별 Realtime 이 켜져 있어야 동작합니다.)
 */

import { supabase } from "../supabase.js";
import { hydrateTodoSectionTasksFromCloud } from "./todoSectionTasksSupabase.js";
import { pullAllKpiMapsFromCloud } from "./kpiTabCloudRefresh.js";
import { pullAllTimeLedgerFromCloud } from "./timeLedgerCloudRefresh.js";
import { pullAllAssetFromCloud } from "./assetCloudRefresh.js";
import { pullAllDiaryFromCloud } from "./diaryCloudRefresh.js";

/** App.js 의 TAB_IDS_REFRESH_ON_KPI_PULL 과 동일 — 이 탭일 때만 pull 후 화면 갱신 */
const REFRESH_MAIN_AFTER_CLOUD_PULL = new Set([
  "home",
  "dream",
  "sideincome",
  "happiness",
  "health",
  "calendar",
  "schedulecalendar",
  "time",
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

let _channel = null;
let _debounceTimer = null;
let _generation = 0;

function debouncedRealtimeRefresh(getCurrentTabId, renderMain) {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    const gen = ++_generation;
    void (async () => {
      try {
        const needTodo = await hydrateTodoSectionTasksFromCloud();
        const { anyChanged } = await pullAllKpiMapsFromCloud();
        const { anyChanged: timeLedgerChanged } = await pullAllTimeLedgerFromCloud();
        const { anyChanged: assetChanged } = await pullAllAssetFromCloud();
        const { anyChanged: diaryChanged } = await pullAllDiaryFromCloud();
        if (gen !== _generation) return;
        if (
          !needTodo &&
          !anyChanged &&
          !timeLedgerChanged &&
          !assetChanged &&
          !diaryChanged
        )
          return;
        const tab = getCurrentTabId();
        if (!REFRESH_MAIN_AFTER_CLOUD_PULL.has(tab)) return;
        renderMain({ skipTodoSaveBeforeUnmount: true });
      } catch (e) {
        console.warn("[realtime] 병합·갱신", e?.message || e);
      }
    })();
  }, 450);
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
    const onEvent = () => debouncedRealtimeRefresh(getCurrentTabId, renderMain);

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
