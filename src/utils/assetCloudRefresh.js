/**
 * 자산관리 — 서버(Supabase)에서 로컬로만 병합 (timeLedgerCloudRefresh·KPI pull 과 동일).
 * Realtime·브라우저 탭 포커스 시 다른 기기 변경을 반영.
 */

import { pullAssetExpenseTransactionsFromSupabase } from "./assetExpenseTransactionsSupabase.js";
import { pullAssetExpensePrefsFromSupabase } from "./assetExpensePrefsSupabase.js";
import {
  NET_WORTH_BUNDLE_LOCAL_KEYS,
  pullAssetNetWorthBundleFromSupabase,
} from "./assetNetWorthBundleSupabase.js";
import {
  NET_WORTH_TARGET_STORAGE_KEY,
  pullAssetNetWorthGoalFromSupabase,
} from "./assetNetWorthTargetSupabase.js";
import {
  PLAN_MONTHLY_GOALS_STORAGE_KEY,
  pullAssetPlanMonthlyGoalsFromSupabase,
} from "./assetPlanMonthlyGoalsSupabase.js";
import { pullAssetStockCategoryOptionsFromSupabase } from "./assetStockCategorySupabase.js";

const ASSET_EXPENSE_ROWS_KEY = "asset_expense_rows";
const ASSET_EXPENSE_CLASSIFICATION_KEY = "asset_expense_classification_by_category";
const ASSET_EXPENSE_PAYMENT_OPTIONS_KEY = "asset_expense_payment_options";
const ASSET_STOCK_CATEGORY_OPTIONS_KEY = "asset_stock_category_options";

function snapshotAssetLocalStorage() {
  try {
    const bundle = Object.values(NET_WORTH_BUNDLE_LOCAL_KEYS).map(
      (k) => localStorage.getItem(k) ?? "",
    );
    return [
      localStorage.getItem(ASSET_EXPENSE_ROWS_KEY) ?? "",
      localStorage.getItem(ASSET_EXPENSE_CLASSIFICATION_KEY) ?? "",
      localStorage.getItem(ASSET_EXPENSE_PAYMENT_OPTIONS_KEY) ?? "",
      localStorage.getItem(NET_WORTH_TARGET_STORAGE_KEY) ?? "",
      localStorage.getItem(PLAN_MONTHLY_GOALS_STORAGE_KEY) ?? "",
      localStorage.getItem(ASSET_STOCK_CATEGORY_OPTIONS_KEY) ?? "",
      ...bundle,
    ].join("\n");
  } catch (_) {
    return "";
  }
}

/**
 * 가계부 거래·설정·순자산·목표·월계획·주식분류를 서버에서 받아 로컬에 반영.
 * @returns {Promise<{ anyChanged: boolean }>}
 */
export async function pullAllAssetFromCloud() {
  const before = snapshotAssetLocalStorage();
  await Promise.all([
    pullAssetExpenseTransactionsFromSupabase(),
    pullAssetExpensePrefsFromSupabase(),
    pullAssetNetWorthBundleFromSupabase(),
    pullAssetNetWorthGoalFromSupabase(),
    pullAssetPlanMonthlyGoalsFromSupabase(),
    pullAssetStockCategoryOptionsFromSupabase(),
  ]);
  const after = snapshotAssetLocalStorage();
  return { anyChanged: before !== after };
}
