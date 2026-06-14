/** 기본 KPI id — 아이콘 매핑용(무거운 kpi map 모듈 import 방지) */

export const DEFAULT_CHORE_TASK_KPI_ID = "__lp_default_kpi_chore_tasks__";
export const DEFAULT_MORNING_ROUTINE_KPI_ID = "__lp_default_kpi_morning_routine__";
export const DEFAULT_MOVE_ROUTINE_KPI_ID = "__lp_default_kpi_move_routine__";
export const DEFAULT_TIDY_ROUTINE_KPI_ID = "__lp_default_kpi_tidy_routine__";
export const DEFAULT_OUT_PREP_ROUTINE_KPI_ID = "__lp_default_kpi_out_prep_routine__";
export const DEFAULT_OUT_AFTER_ROUTINE_KPI_ID = "__lp_default_kpi_out_after_routine__";
export const DEFAULT_BEDTIME_ROUTINE_KPI_ID = "__lp_default_kpi_bedtime_routine__";

export const DEFAULT_AEROBIC_KPI_ID = "__lp_default_kpi_aerobic__";
export const DEFAULT_SUPPLEMENT_KPI_ID = "__lp_default_kpi_supplement__";
export const DEFAULT_CHECKUP_KPI_ID = "__lp_default_kpi_checkup__";

/** 기본 KPI id → picker 슬러그 */
export const DEFAULT_KPI_ICON_SLUG = {
  [DEFAULT_CHORE_TASK_KPI_ID]: "to do list",
  [DEFAULT_MORNING_ROUTINE_KPI_ID]: "drip coffee",
  [DEFAULT_MOVE_ROUTINE_KPI_ID]: "moving_basic",
  [DEFAULT_TIDY_ROUTINE_KPI_ID]: "clean",
  [DEFAULT_OUT_PREP_ROUTINE_KPI_ID]: "packing",
  [DEFAULT_OUT_AFTER_ROUTINE_KPI_ID]: "cloth",
  [DEFAULT_BEDTIME_ROUTINE_KPI_ID]: "bedtime",
  [DEFAULT_AEROBIC_KPI_ID]: "running",
  [DEFAULT_SUPPLEMENT_KPI_ID]: "medicine",
  [DEFAULT_CHECKUP_KPI_ID]: "dental appointment",
};

/** KPI 표시명 → picker 슬러그 (id 불일치·구 데이터 대비) */
export const DEFAULT_KPI_NAME_ICON_SLUG = {
  "잡무 처리하기": "to do list",
  "모닝 루틴": "drip coffee",
  "이동 루틴": "moving_basic",
  "정리루틴": "clean",
  "외출 준비 루틴": "packing",
  "외출 후 루틴": "cloth",
  "취침 루틴": "bedtime",
  "유산소 운동": "running",
  "보충제 섭취": "medicine",
  "건강 검진": "dental appointment",
};
