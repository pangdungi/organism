/**
 * 자산관리 — 서버(Supabase)에서 세션 메모리로 병합 (한 줄 직렬 runAssetSerialized).
 */

import { runAssetSerialized } from "./assetServerSyncSerial.js";
import { getExpenseRowsMem, pullAssetExpenseTransactionsFromSupabaseImpl } from "./assetExpenseTransactionsSupabase.js";
import { pullAssetExpensePrefsFromSupabaseImpl, readExpenseClassificationSavedMem, readExpensePaymentOptionsListMem } from "./assetExpensePrefsSupabase.js";
import {
  syncAssetNetWorthBundleToSupabaseImpl,
  pullAssetNetWorthBundleFromSupabaseImpl,
  NET_WORTH_BUNDLE_LOCAL_KEYS,
  readNetWorthBundleKey,
} from "./assetNetWorthBundleSupabase.js";
import {
  syncAssetNetWorthTargetToSupabaseImpl,
  getNetWorthTargetDisplayStrMem,
  pullAssetNetWorthTargetFromSupabaseImpl,
} from "./assetNetWorthTargetSupabase.js";
import { getPlanMonthlyGoalsRowsMem, pullAssetPlanMonthlyGoalsFromSupabaseImpl } from "./assetPlanMonthlyGoalsSupabase.js";
import { pullAssetStockCategoryOptionsFromSupabaseImpl, readStockCategoryCustomLabelsMem } from "./assetStockCategorySupabase.js";
import { shouldDeferAssetExpensePull } from "./kpiPullTypingGuard.js";
import { lpPullDebug } from "./lpPullDebug.js";

/** supabaseRealtimeSync ASSET_REALTIME_TABLES 와 동일 — Realtime에 자산만 없으면 가계부 full pull 생략 */
const ASSET_REALTIME_TABLE_NAMES = new Set([
  "asset_user_expense_transactions",
  "asset_user_expense_classifications",
  "asset_user_payment_options",
  "asset_user_net_worth_bundle",
  "asset_user_net_worth_goal",
  "asset_user_plan_monthly_goals",
  "asset_user_stock_category_options",
]);

function snapshotAssetSessionState() {
  try {
    const bundle = Object.values(NET_WORTH_BUNDLE_LOCAL_KEYS).map((k) => JSON.stringify(readNetWorthBundleKey(k) ?? "__undef__"));
    const expenseSnap = JSON.stringify(getExpenseRowsMem());
    const cls = JSON.stringify(readExpenseClassificationSavedMem());
    const pay = JSON.stringify(readExpensePaymentOptionsListMem());
    const netTarget = JSON.stringify(getNetWorthTargetDisplayStrMem());
    const plan = JSON.stringify(getPlanMonthlyGoalsRowsMem());
    const stock = JSON.stringify(readStockCategoryCustomLabelsMem());
    return [expenseSnap, cls, pay, netTarget, plan, stock, ...bundle].join("\n");
  } catch (_) {
    return "";
  }
}

/**
 * 가계부 거래·설정·순자산·목표·월계획·주식분류를 서버에서 받아 메모리에 반영.
 * @param {() => string} [getCurrentTabId]
 * @param {{ realtimeTouchedTables?: Set<string>; forceExpensePull?: boolean }} [opts]
 *   — Realtime 배치에 자산 테이블 변화가 없으면 **호출 전체를 생략**(가계부 탭에서도 시간/KPI 이벤트만 올 때 Supabase 요청·로그 폭주 방지).
 *   — `forceExpensePull`: true면 입력 중에도 거래 range pull 생략하지 않음(자산 탭 최초 hydrate 등).
 * @returns {Promise<{ anyChanged: boolean }>}
 */
export async function pullAllAssetFromCloud(getCurrentTabId, opts = {}) {
  const { realtimeTouchedTables, forceExpensePull } = opts;
  /* Realtime: 이번 틱에 자산·가계부 관련 테이블이 하나도 없으면 네트워크 호출 자체를 하지 않음 */
  if (
    realtimeTouchedTables != null &&
    realtimeTouchedTables.size > 0 &&
    ![...ASSET_REALTIME_TABLE_NAMES].some((name) => realtimeTouchedTables.has(name))
  ) {
    return { anyChanged: false };
  }

  const before = snapshotAssetSessionState();
  const skipExpense = forceExpensePull ? false : shouldDeferAssetExpensePull(getCurrentTabId);
  lpPullDebug("pullAllAssetFromCloud", {
    tab: typeof getCurrentTabId === "function" ? getCurrentTabId() : "",
    skipExpense,
    forceExpensePull: !!forceExpensePull,
    realtimeTouchedTables:
      realtimeTouchedTables && realtimeTouchedTables.size > 0
        ? [...realtimeTouchedTables]
        : undefined,
  });
  await runAssetSerialized(async () => {
    /* 로컬에서 지운 행이 서버 반영 전에 pull 되면 예전 행이 되살아남 → 먼저 pending upsert */
    await syncAssetNetWorthBundleToSupabaseImpl();
    await syncAssetNetWorthTargetToSupabaseImpl();
    /* 서로 다른 테이블만 읽음 → 순차 대기 대신 병렬로 RTT·총 체감 시간 단축 */
    await Promise.all([
      skipExpense ? Promise.resolve() : pullAssetExpenseTransactionsFromSupabaseImpl({ mode: "range" }),
      pullAssetExpensePrefsFromSupabaseImpl(),
      pullAssetNetWorthBundleFromSupabaseImpl(),
      pullAssetNetWorthTargetFromSupabaseImpl(),
      pullAssetPlanMonthlyGoalsFromSupabaseImpl(),
      pullAssetStockCategoryOptionsFromSupabaseImpl(),
    ]);
  });
  const after = snapshotAssetSessionState();
  return { anyChanged: before !== after };
}
