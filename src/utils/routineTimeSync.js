/**
 * 루틴/해빗트랙커 ↔ 시간가계부 과제 연동
 * - 루틴 추가 시 생산적>행복 카테고리로 과제 자동 추가
 * - 루틴 이름 → 과제명, 세부루틴 → 하부과제명 (루틴이름 > 세부루틴이름)
 * - 수정/삭제는 루틴/해빗트랙커에서만 가능
 */

const TASK_OPTIONS_KEY = "time_task_options";
const ROUTINE_STORAGE_KEY = "routine-track-list";

function getFullTaskOptions() {
  try {
    const raw = localStorage.getItem(TASK_OPTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((o) =>
          typeof o === "string"
            ? { name: o, category: "", productivity: "productive", memo: "" }
            : {
                name: o.name || "",
                category: o.category || "",
                productivity: o.productivity || "productive",
                memo: o.memo || "",
              }
        );
      }
    }
  } catch (_) {}
  return [];
}

function saveTaskOptions(opts) {
  try {
    localStorage.setItem(TASK_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
}

/**
 * 루틴을 시간가계부 과제로 동기화
 * - 메인 루틴 → 과제명 (생산적 > 행복)
 * - 세부루틴 → 하부과제명 (루틴이름 > 세부루틴이름)
 * - 기존 루틴 과제 제거 후 현재 상태로 재동기화 (삭제된 세부루틴 반영)
 */
export function syncRoutineToTimeTasks(routine) {
  if (!routine || !routine.name) return;
  const mainName = (routine.name || "").trim();
  if (!mainName) return;

  const opts = getFullTaskOptions();
  const toRemove = new Set([mainName]);
  (routine.items || []).forEach((it) => {
    const subName = (it.name || "").trim();
    if (subName) toRemove.add(`${mainName} > ${subName}`);
  });

  const filtered = opts.filter((o) => !toRemove.has(o.name));
  const existingNames = new Set(filtered.map((o) => o.name));
  const toAdd = [];

  if (!existingNames.has(mainName)) {
    toAdd.push({
      name: mainName,
      category: "happiness",
      productivity: "productive",
      memo: "",
    });
    existingNames.add(mainName);
  }

  (routine.items || []).forEach((item) => {
    const subName = (item.name || "").trim();
    if (!subName) return;
    const fullName = `${mainName} > ${subName}`;
    if (!existingNames.has(fullName)) {
      toAdd.push({
        name: fullName,
        category: "happiness",
        productivity: "productive",
        memo: "",
      });
      existingNames.add(fullName);
    }
  });

  if (toAdd.length > 0 || filtered.length !== opts.length) {
    saveTaskOptions([...toAdd, ...filtered]);
  }
}

/**
 * 루틴 삭제 시 시간가계부 과제에서 제거
 */
export function removeRoutineFromTimeTasks(routine) {
  if (!routine || !routine.name) return;
  const mainName = (routine.name || "").trim();
  if (!mainName) return;

  const opts = getFullTaskOptions();
  const toRemove = new Set([mainName]);
  (routine.items || []).forEach((it) => {
    const subName = (it.name || "").trim();
    if (subName) toRemove.add(`${mainName} > ${subName}`);
  });

  const filtered = opts.filter((o) => !toRemove.has(o.name));
  if (filtered.length !== opts.length) {
    saveTaskOptions(filtered);
  }
}

/**
 * 루틴 수정 시 기존 하부과제명 업데이트 (루틴 이름 변경 시)
 */
export function syncRoutineRenameToTimeTasks(oldRoutine, newRoutine) {
  if (!oldRoutine || !newRoutine || !oldRoutine.name || !newRoutine.name) return;
  const oldMain = (oldRoutine.name || "").trim();
  const newMain = (newRoutine.name || "").trim();
  if (oldMain === newMain) return;

  const opts = getFullTaskOptions();
  let changed = false;
  const newOpts = opts.map((o) => {
    if (o.name === oldMain) {
      changed = true;
      return { ...o, name: newMain };
    }
    if (o.name.startsWith(oldMain + " > ")) {
      changed = true;
      const sub = o.name.slice((oldMain + " > ").length);
      return { ...o, name: `${newMain} > ${sub}` };
    }
    return o;
  });
  if (changed) saveTaskOptions(newOpts);
}

/**
 * 루틴에서 연동된 과제명 집합
 * 과제설정창에서 수정·삭제 불가 (루틴/해빗트랙커에서만)
 * @returns {Set<string>}
 */
export function getRoutineSyncedTaskNames() {
  const names = new Set();
  try {
    const raw = localStorage.getItem(ROUTINE_STORAGE_KEY);
    if (!raw) return names;
    const routines = JSON.parse(raw);
    if (!Array.isArray(routines)) return names;
    routines.forEach((r) => {
      const mainName = (r.name || "").trim();
      if (mainName) names.add(mainName);
      (r.items || []).forEach((it) => {
        const subName = (it.name || "").trim();
        if (subName && mainName) names.add(`${mainName} > ${subName}`);
      });
    });
  } catch (_) {}
  return names;
}

function getCheckKey(routineId, itemId, dayIndex) {
  return `rt-check-${routineId}-${itemId}-${dayIndex}`;
}

export function loadRoutineCheckState(routineId, itemId, dayIndex) {
  try {
    return localStorage.getItem(getCheckKey(routineId, itemId, dayIndex)) === "1";
  } catch (_) {}
  return false;
}

export function saveRoutineCheckState(routineId, itemId, dayIndex, checked) {
  try {
    const key = getCheckKey(routineId, itemId, dayIndex);
    if (checked) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch (_) {}
}

/**
 * 과제명으로 루틴 조회 (메인 루틴 또는 하부과제인 경우)
 * @returns {{ routine: object, mainName: string } | null}
 */
export function getRoutineByTaskName(taskName) {
  const name = (taskName || "").trim();
  if (!name) return null;
  try {
    const raw = localStorage.getItem(ROUTINE_STORAGE_KEY);
    if (!raw) return null;
    const routines = JSON.parse(raw);
    if (!Array.isArray(routines)) return null;
    const sepIdx = name.indexOf(" > ");
    const mainName = sepIdx >= 0 ? name.slice(0, sepIdx).trim() : name;
    const routine = routines.find((r) => (r.name || "").trim() === mainName);
    return routine ? { routine, mainName } : null;
  } catch (_) {}
  return null;
}

/**
 * 날짜 문자열(YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm)을 루틴의 dayIndex로 변환
 * @returns {number | null} 0-based day index, or null if out of range
 */
export function getDayIndexForRoutine(routine, dateStr) {
  if (!routine?.start || !dateStr) return null;
  const datePart = String(dateStr).slice(0, 10);
  const start = new Date(routine.start);
  const d = new Date(datePart + "T12:00:00");
  const diffMs = d.getTime() - start.getTime();
  const dayIndex = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (dayIndex < 0 || dayIndex >= (routine.days || 0)) return null;
  return dayIndex;
}
