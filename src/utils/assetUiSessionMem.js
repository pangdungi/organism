/**
 * 서버 동기화 없는 자산 UI 설정만 세션 메모리 + 레거시 LS 1회 이전.
 */

const EXPENSE_CATEGORY_OPTIONS_KEY = "asset_expense_category_options";
const SAVINGS_GOAL_OPTIONS_KEY = "asset_savings_goal_options";
const INSURANCE_KIND_OPTIONS_KEY = "asset_insurance_kind_options";

const _mem = {
  expenseCategory: /** @type {unknown} */ (undefined),
  savingsGoals: /** @type {unknown} */ (undefined),
  insuranceKinds: /** @type {unknown} */ (undefined),
};
let _migrated = false;

function migrateOnce() {
  if (_migrated) return;
  _migrated = true;
  try {
    if (typeof localStorage === "undefined") return;
    if (_mem.expenseCategory === undefined) {
      const r = localStorage.getItem(EXPENSE_CATEGORY_OPTIONS_KEY);
      _mem.expenseCategory = r ? JSON.parse(r) : undefined;
      localStorage.removeItem(EXPENSE_CATEGORY_OPTIONS_KEY);
    }
    if (_mem.savingsGoals === undefined) {
      const r = localStorage.getItem(SAVINGS_GOAL_OPTIONS_KEY);
      _mem.savingsGoals = r ? JSON.parse(r) : undefined;
      localStorage.removeItem(SAVINGS_GOAL_OPTIONS_KEY);
    }
    if (_mem.insuranceKinds === undefined) {
      const r = localStorage.getItem(INSURANCE_KIND_OPTIONS_KEY);
      _mem.insuranceKinds = r ? JSON.parse(r) : undefined;
      localStorage.removeItem(INSURANCE_KIND_OPTIONS_KEY);
    }
  } catch (_) {}
}

export function readExpenseCategoryOptionsMemRaw() {
  migrateOnce();
  return _mem.expenseCategory;
}

export function writeExpenseCategoryOptionsMemRaw(arr) {
  migrateOnce();
  _mem.expenseCategory = Array.isArray(arr) ? arr : [];
}

export function readSavingsGoalOptionsMemRaw() {
  migrateOnce();
  return _mem.savingsGoals;
}

export function writeSavingsGoalOptionsMemRaw(arr) {
  migrateOnce();
  _mem.savingsGoals = Array.isArray(arr) ? arr : [];
}

export function readInsuranceKindOptionsMemRaw() {
  migrateOnce();
  return _mem.insuranceKinds;
}

export function writeInsuranceKindOptionsMemRaw(arr) {
  migrateOnce();
  _mem.insuranceKinds = Array.isArray(arr) ? arr : [];
}

export function clearAssetUiSessionMem() {
  _mem.expenseCategory = undefined;
  _mem.savingsGoals = undefined;
  _mem.insuranceKinds = undefined;
  _migrated = false;
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(EXPENSE_CATEGORY_OPTIONS_KEY);
    localStorage.removeItem(SAVINGS_GOAL_OPTIONS_KEY);
    localStorage.removeItem(INSURANCE_KIND_OPTIONS_KEY);
  } catch (_) {}
}
