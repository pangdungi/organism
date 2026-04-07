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
 * @returns {Promise<{ anyChanged: boolean }>}
 */
export async function pullAllAssetFromCloud(getCurrentTabId) {
  const before = snapshotAssetSessionState();
  const skipExpense = shouldDeferAssetExpensePull(getCurrentTabId);
  await runAssetSerialized(async () => {
    /* 로컬에서 지운 행이 서버 반영 전에 pull 되면 예전 행이 되살아남 → 먼저 pending upsert */
    await syncAssetNetWorthBundleToSupabaseImpl();
    await syncAssetNetWorthTargetToSupabaseImpl();
    if (!skipExpense) await pullAssetExpenseTransactionsFromSupabaseImpl();
    await pullAssetExpensePrefsFromSupabaseImpl();
    await pullAssetNetWorthBundleFromSupabaseImpl();
    await pullAssetNetWorthTargetFromSupabaseImpl();
    await pullAssetPlanMonthlyGoalsFromSupabaseImpl();
    await pullAssetStockCategoryOptionsFromSupabaseImpl();
  });
  const after = snapshotAssetSessionState();
  return { anyChanged: before !== after };
}
