import {
  persistDreamKpiDailyTodoDelete,
  persistDreamKpiDailyTodoRow,
  persistDreamKpiTodoDelete,
  persistDreamKpiTodoRow,
} from "./dreamKpiMapSupabase.js";
import {
  persistHappinessKpiDailyTodoDelete,
  persistHappinessKpiDailyTodoRow,
  persistHappinessKpiTodoDelete,
  persistHappinessKpiTodoRow,
} from "./happinessKpiMapSupabase.js";
import {
  persistHealthKpiDailyTodoDelete,
  persistHealthKpiDailyTodoRow,
  persistHealthKpiTodoDelete,
  persistHealthKpiTodoRow,
} from "./healthKpiMapSupabase.js";
import {
  persistSideincomeKpiDailyTodoDelete,
  persistSideincomeKpiDailyTodoRow,
  persistSideincomeKpiTodoDelete,
  persistSideincomeKpiTodoRow,
} from "./sideincomeKpiMapSupabase.js";

const ROW_BY_KEY = {
  "kpi-dream-map": persistDreamKpiTodoRow,
  "kpi-happiness-map": persistHappinessKpiTodoRow,
  "kpi-health-map": persistHealthKpiTodoRow,
  "kpi-sideincome-paths": persistSideincomeKpiTodoRow,
};

const DELETE_BY_KEY = {
  "kpi-dream-map": persistDreamKpiTodoDelete,
  "kpi-happiness-map": persistHappinessKpiTodoDelete,
  "kpi-health-map": persistHealthKpiTodoDelete,
  "kpi-sideincome-paths": persistSideincomeKpiTodoDelete,
};

/** 추가·수정한 그 할일 한 줄만 서버에 씀. 이 창 목록 전체는 올리지 않음 */
export function persistKpiTodoRowOnly(storageKey, todo) {
  const fn = ROW_BY_KEY[String(storageKey || "")];
  if (!fn) return Promise.resolve(false);
  return fn(todo);
}

/** 지운 그 할일 한 줄만 서버에서 지움. 이 창 목록 전체는 올리지 않음 */
export function persistKpiTodoDeleteOnly(storageKey, todoId) {
  const fn = DELETE_BY_KEY[String(storageKey || "")];
  if (!fn) return Promise.resolve(false);
  return fn(todoId);
}

const DAILY_ROW_BY_KEY = {
  "kpi-dream-map": persistDreamKpiDailyTodoRow,
  "kpi-happiness-map": persistHappinessKpiDailyTodoRow,
  "kpi-health-map": persistHealthKpiDailyTodoRow,
  "kpi-sideincome-paths": persistSideincomeKpiDailyTodoRow,
};

const DAILY_DELETE_BY_KEY = {
  "kpi-dream-map": persistDreamKpiDailyTodoDelete,
  "kpi-happiness-map": persistHappinessKpiDailyTodoDelete,
  "kpi-health-map": persistHealthKpiDailyTodoDelete,
  "kpi-sideincome-paths": persistSideincomeKpiDailyTodoDelete,
};

/** 추가·수정한 매일 할일 한 줄만 서버에 씀 */
export function persistKpiDailyTodoRowOnly(storageKey, todo) {
  const fn = DAILY_ROW_BY_KEY[String(storageKey || "")];
  if (!fn) return Promise.resolve(false);
  return fn(todo);
}

/** 지운 매일 할일 한 줄만 서버에서 지움 */
export function persistKpiDailyTodoDeleteOnly(storageKey, todoId) {
  const fn = DAILY_DELETE_BY_KEY[String(storageKey || "")];
  if (!fn) return Promise.resolve(false);
  return fn(todoId);
}
