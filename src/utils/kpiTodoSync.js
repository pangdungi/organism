/**
 * KPI 할일 ↔ TodoList/캘린더 연동
 * 꿈/부수입/행복/건강의 KPI별 할일을 TodoList 형식으로 변환
 * - 이름: 할일 텍스트만 (예: 캘린더, 시간가계부)
 * - 분류: KPI 이름 (예: 시간관리 웹서비스 프론트 개발단계)
 * - 마감일: 없음
 */

const DREAM_MAP_KEY = "kpi-dream-map";
const SIDEINCOME_KEY = "kpi-sideincome-paths";
const HAPPINESS_KEY = "kpi-happiness-map";
const HEALTH_KEY = "kpi-health-map";

/** KPI 맵 저장 후 Supabase 동기화 리스너가 기대하는 이벤트 (뷰 saveDreamMap 등과 동일) */
function dispatchKpiMapSavedAfterLocalWrite(storageKey) {
  if (typeof window === "undefined") return;
  const name =
    storageKey === DREAM_MAP_KEY
      ? "dream-kpi-map-saved"
      : storageKey === SIDEINCOME_KEY
        ? "sideincome-kpi-map-saved"
        : storageKey === HAPPINESS_KEY
          ? "happiness-kpi-map-saved"
          : storageKey === HEALTH_KEY
            ? "health-kpi-map-saved"
            : null;
  if (name) window.dispatchEvent(new CustomEvent(name));
}

function ensureDeletedRefsShell(data, storageKey) {
  if (!data.deletedRefs || typeof data.deletedRefs !== "object") data.deletedRefs = {};
  const dr = data.deletedRefs;
  const keys =
    storageKey === SIDEINCOME_KEY
      ? ["categories", "pathLogs", "kpis", "kpiLogs", "kpiTodos", "kpiDailyRepeatTodos"]
      : ["categories", "kpis", "kpiLogs", "kpiTodos", "kpiDailyRepeatTodos"];
  for (const k of keys) {
    if (!Array.isArray(dr[k])) dr[k] = [];
  }
}

function appendDeletedKpiTodoRef(data, storageKey, todoId) {
  const sid = String(todoId ?? "").trim();
  if (!sid) return;
  ensureDeletedRefsShell(data, storageKey);
  const arr = data.deletedRefs.kpiTodos;
  if (!arr.includes(sid)) arr.push(sid);
}

function loadJson(key, fallback = {}) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed || fallback;
    }
  } catch (_) {}
  return fallback;
}

/**
 * 4개 도메인의 KPI 할일을 TodoList task 형식으로 변환
 * @returns {Array<{ name, dueDate, classification, sectionId, sectionLabel, done, isKpiTodo, kpiTodoId, domain, kpiId }>}
 */
export function getKpiTodosAsTasks() {
  const tasks = [];

  // 꿈
  const dreamData = loadJson(DREAM_MAP_KEY, {
    dreams: [],
    kpis: [],
    kpiTodos: [],
  });
  (dreamData.kpiTodos || [])
    .filter((todo) => (todo.text || "").trim() !== "")
    .forEach((todo) => {
      const kpi = (dreamData.kpis || []).find((k) => k.id === todo.kpiId);
      if (!kpi) return;
      const kpiName = kpi.name || "(KPI)";
      tasks.push({
        name: todo.text || "",
        startDate: todo.startDate || "",
        dueDate: todo.dueDate || "",
        startTime: todo.startTime || "",
        endTime: todo.endTime || "",
        eisenhower: todo.eisenhower || "",
        classification: kpiName,
        sectionId: "dream",
        sectionLabel: "꿈",
        done: !!todo.completed,
        isKpiTodo: true,
        kpiTodoId: todo.id,
        domain: "dream",
        kpiId: kpi.id,
        storageKey: DREAM_MAP_KEY,
        itemType: todo.itemType || "todo",
        _calPrevStart:
          (todo._calPrevStart || "").toString().trim().slice(0, 10) || "",
        _calPrevDue:
          (todo._calPrevDue || "").toString().trim().slice(0, 10) || "",
      });
    });

  // 부수입
  const sideData = loadJson(SIDEINCOME_KEY, {
    paths: [],
    kpis: [],
    kpiTodos: [],
  });
  (sideData.kpiTodos || [])
    .filter((todo) => (todo.text || "").trim() !== "")
    .forEach((todo) => {
      const kpi = (sideData.kpis || []).find((k) => k.id === todo.kpiId);
      if (!kpi) return;
      const kpiName = kpi.name || "(KPI)";
      tasks.push({
        name: todo.text || "",
        startDate: todo.startDate || "",
        dueDate: todo.dueDate || "",
        startTime: todo.startTime || "",
        endTime: todo.endTime || "",
        eisenhower: todo.eisenhower || "",
        classification: kpiName,
        sectionId: "sideincome",
        sectionLabel: "부수입",
        done: !!todo.completed,
        isKpiTodo: true,
        kpiTodoId: todo.id,
        domain: "sideincome",
        kpiId: kpi.id,
        storageKey: SIDEINCOME_KEY,
        itemType: todo.itemType || "todo",
        _calPrevStart:
          (todo._calPrevStart || "").toString().trim().slice(0, 10) || "",
        _calPrevDue:
          (todo._calPrevDue || "").toString().trim().slice(0, 10) || "",
      });
    });

  // 행복
  const happyData = loadJson(HAPPINESS_KEY, {
    happinesses: [],
    kpis: [],
    kpiTodos: [],
  });
  (happyData.kpiTodos || [])
    .filter((todo) => (todo.text || "").trim() !== "")
    .forEach((todo) => {
      const kpi = (happyData.kpis || []).find((k) => k.id === todo.kpiId);
      if (!kpi) return;
      const kpiName = kpi.name || "(KPI)";
      tasks.push({
        name: todo.text || "",
        startDate: todo.startDate || "",
        dueDate: todo.dueDate || "",
        startTime: todo.startTime || "",
        endTime: todo.endTime || "",
        eisenhower: todo.eisenhower || "",
        classification: kpiName,
        sectionId: "happy",
        sectionLabel: "행복",
        done: !!todo.completed,
        isKpiTodo: true,
        kpiTodoId: todo.id,
        domain: "happy",
        kpiId: kpi.id,
        storageKey: HAPPINESS_KEY,
        itemType: todo.itemType || "todo",
        _calPrevStart:
          (todo._calPrevStart || "").toString().trim().slice(0, 10) || "",
        _calPrevDue:
          (todo._calPrevDue || "").toString().trim().slice(0, 10) || "",
      });
    });

  // 건강
  const healthData = loadJson(HEALTH_KEY, {
    healths: [],
    kpis: [],
    kpiTodos: [],
  });
  (healthData.kpiTodos || [])
    .filter((todo) => (todo.text || "").trim() !== "")
    .forEach((todo) => {
      const kpi = (healthData.kpis || []).find((k) => k.id === todo.kpiId);
      if (!kpi) return;
      const kpiName = kpi.name || "(KPI)";
      tasks.push({
        name: todo.text || "",
        startDate: todo.startDate || "",
        dueDate: todo.dueDate || "",
        startTime: todo.startTime || "",
        endTime: todo.endTime || "",
        eisenhower: todo.eisenhower || "",
        classification: kpiName,
        sectionId: "health",
        sectionLabel: "건강",
        done: !!todo.completed,
        isKpiTodo: true,
        kpiTodoId: todo.id,
        domain: "health",
        kpiId: kpi.id,
        storageKey: HEALTH_KEY,
        itemType: todo.itemType || "todo",
        _calPrevStart:
          (todo._calPrevStart || "").toString().trim().slice(0, 10) || "",
        _calPrevDue:
          (todo._calPrevDue || "").toString().trim().slice(0, 10) || "",
      });
    });

  return tasks;
}

/**
 * KPI 할일 id로 연결된 KPI 표시 이름 조회 (할일 카드·모달에서 classification 유실 시 보강)
 * @param {string|number} kpiTodoId
 * @param {string} storageKey
 * @returns {string}
 */
export function getKpiDisplayNameForTodo(kpiTodoId, storageKey) {
  if (kpiTodoId == null || String(kpiTodoId).trim() === "" || !storageKey) return "";
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return "";
    const data = JSON.parse(raw);
    const todo = (data.kpiTodos || []).find((t) => String(t.id) === String(kpiTodoId));
    if (!todo) return "";
    const kpi = (data.kpis || []).find((k) => k.id === todo.kpiId);
    const name = (kpi?.name || "").trim();
    return name || "(KPI)";
  } catch (_) {}
  return "";
}

/**
 * KPI 할일 텍스트/마감일 수정 (캘린더 할일목록에서 수정 시 KPI에 반영)
 * @param {string} kpiTodoId
 * @param {string} storageKey
 * @param {{ text?: string, dueDate?: string }} updates
 * @returns {boolean}
 */
export function updateKpiTodo(kpiTodoId, storageKey, updates) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;
    const data = JSON.parse(raw);
    data.kpiTodos = data.kpiTodos || [];
    const todo = data.kpiTodos.find((t) => t.id === kpiTodoId);
    if (!todo) return false;
    if (updates && updates.recordCalendarSidebarRevert) {
      todo._calPrevStart =
        (todo.startDate || "").toString().trim().slice(0, 10) || "";
      todo._calPrevDue =
        (todo.dueDate || "").toString().trim().slice(0, 10) || "";
      delete updates.recordCalendarSidebarRevert;
    }
    if (updates.text !== undefined) todo.text = String(updates.text).trim();
    if (updates.startDate !== undefined)
      todo.startDate = updates.startDate
        ? String(updates.startDate).trim()
        : "";
    if (updates.dueDate !== undefined)
      todo.dueDate = updates.dueDate ? String(updates.dueDate).trim() : "";
    if (updates.startTime !== undefined)
      todo.startTime = updates.startTime
        ? String(updates.startTime).trim()
        : "";
    if (updates.endTime !== undefined)
      todo.endTime = updates.endTime ? String(updates.endTime).trim() : "";
    if (updates.eisenhower !== undefined)
      todo.eisenhower = updates.eisenhower ? String(updates.eisenhower).trim() : "";
    if (updates.itemType !== undefined)
      todo.itemType = updates.itemType === "schedule" ? "schedule" : "todo";
    if (updates.completed !== undefined) todo.completed = !!updates.completed;
    localStorage.setItem(storageKey, JSON.stringify(data));
    return true;
  } catch (_) {}
  return false;
}

/** 캘린더 ↔ 사이드바 되돌리기용 스냅샷 필드 제거 */
export function clearKpiTodoCalendarRevertSnapshot(kpiTodoId, storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;
    const data = JSON.parse(raw);
    data.kpiTodos = data.kpiTodos || [];
    const todo = data.kpiTodos.find((t) => t.id === kpiTodoId);
    if (!todo) return false;
    delete todo._calPrevStart;
    delete todo._calPrevDue;
    localStorage.setItem(storageKey, JSON.stringify(data));
    return true;
  } catch (_) {}
  return false;
}

/**
 * KPI 할일 완료 상태 동기화
 */
export function syncKpiTodoCompleted(kpiTodoId, storageKey, completed) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const data = JSON.parse(raw);
    data.kpiTodos = data.kpiTodos || [];
    const todo = data.kpiTodos.find((t) => t.id === kpiTodoId);
    if (todo) {
      todo.completed = !!completed;
      localStorage.setItem(storageKey, JSON.stringify(data));
    }
  } catch (_) {}
}

const STORAGE_KEYS = [DREAM_MAP_KEY, SIDEINCOME_KEY, HAPPINESS_KEY, HEALTH_KEY];

/**
 * KPI 이름으로 해당 KPI의 할일 목록 반환 (과제 기록 모달 등에서 사용)
 * @param {string} kpiName - KPI 이름 (예: "요가")
 * @returns {{ storageKey: string, kpiId: string, todos: Array<{ id: string, text: string, completed: boolean }> } | null}
 */
export function getKpiTodosByKpiName(kpiName) {
  const name = (kpiName || "").trim();
  if (!name) return null;
  for (const storageKey of STORAGE_KEYS) {
    const data = loadJson(storageKey, { kpis: [], kpiTodos: [] });
    const kpi = (data.kpis || []).find(
      (k) => (k.name || "").trim() === name
    );
    if (!kpi) continue;
    const kpiId = String(kpi.id);
    const todos = (data.kpiTodos || [])
      .filter(
        (t) =>
          String(t.kpiId) === kpiId &&
          (t.text || "").trim() !== "" &&
          !t.completed
      )
      .map((t) => ({
        id: t.id,
        text: (t.text || "").trim(),
        completed: !!t.completed,
      }));
    return { storageKey, kpiId, todos };
  }
  return null;
}

/**
 * KPI 이름으로 해당 KPI의 매일 반복 여부와 매일 할일 목록 반환 (과제 기록 모달용)
 * @param {string} kpiName - KPI 이름
 * @returns {{ storageKey: string, kpiId: string, needHabitTracker: boolean, dailyTodos: Array<{ id: string, text: string, completed: boolean }> } | null}
 */
export function getKpiDailyRepeatInfoByKpiName(kpiName) {
  const name = (kpiName || "").trim();
  if (!name) return null;
  for (const storageKey of STORAGE_KEYS) {
    const data = loadJson(storageKey, { kpis: [], kpiDailyRepeatTodos: [] });
    const kpi = (data.kpis || []).find((k) => (k.name || "").trim() === name);
    if (!kpi) continue;
    const needHabitTracker = !!kpi.needHabitTracker;
    const dailyTodos = (data.kpiDailyRepeatTodos || [])
      .filter((t) => String(t.kpiId) === String(kpi.id) && (t.text || "").trim() !== "")
      .map((t) => ({
        id: t.id,
        text: (t.text || "").trim(),
        completed: !!t.completed,
      }));
    return { storageKey, kpiId: kpi.id, needHabitTracker, dailyTodos };
  }
  return null;
}

/**
 * 매일 반복 할일 체크 상태 저장 (과제 기록 모달 등에서 체크 시 호출)
 * @param {string} todoId - kpiDailyRepeatTodos 항목 id
 * @param {string} storageKey - 저장소 키
 * @param {boolean} completed - 완료 여부
 */
export function syncKpiDailyRepeatTodoCompleted(todoId, storageKey, completed) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const data = JSON.parse(raw);
    data.kpiDailyRepeatTodos = data.kpiDailyRepeatTodos || [];
    const t = data.kpiDailyRepeatTodos.find((x) => x.id === todoId);
    if (t) {
      t.completed = !!completed;
      localStorage.setItem(storageKey, JSON.stringify(data));
    }
  } catch (_) {}
}

/**
 * KPI 할일 1건 제거
 * @param {string} kpiTodoId
 * @param {string} storageKey
 * @returns {boolean} 제거 성공 여부
 */
export function removeKpiTodo(kpiTodoId, storageKey) {
  const idNorm = String(kpiTodoId ?? "").trim();
  if (!idNorm) return false;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;
    const data = JSON.parse(raw);
    data.kpiTodos = data.kpiTodos || [];
    const idx = data.kpiTodos.findIndex((t) => String(t.id) === idNorm);
    if (idx < 0) return false;
    appendDeletedKpiTodoRef(data, storageKey, idNorm);
    data.kpiTodos.splice(idx, 1);
    localStorage.setItem(storageKey, JSON.stringify(data));
    dispatchKpiMapSavedAfterLocalWrite(storageKey);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * 특정 KPI에 할일 추가
 * @param {string} kpiId
 * @param {string} storageKey
 * @param {string} text
 * @returns {{ success: boolean, kpiTodoId?: string }}
 */
export function addKpiTodo(kpiId, storageKey, text) {
  const val = (text || "").trim();
  if (!val) return { success: false };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { success: false };
    const data = JSON.parse(raw);
    const kpi = (data.kpis || []).find((k) => k.id === kpiId);
    if (!kpi) return { success: false };
    data.kpiTodos = data.kpiTodos || [];
    const newId = nextId();
    data.kpiTodos.push({
      id: newId,
      kpiId,
      text: val,
      completed: false,
      itemType: "todo",
    });
    localStorage.setItem(storageKey, JSON.stringify(data));
    return { success: true, kpiTodoId: newId };
  } catch (_) {}
  return { success: false };
}

/**
 * 완료된 KPI 할일 모두 제거
 * @returns {number} 제거된 항목 수
 */
export function removeAllCompletedKpiTodos() {
  let removed = 0;
  STORAGE_KEYS.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw);
      data.kpiTodos = data.kpiTodos || [];
      const before = data.kpiTodos.length;
      const completedRows = data.kpiTodos.filter((t) => t.completed);
      data.kpiTodos = data.kpiTodos.filter((t) => !t.completed);
      const after = data.kpiTodos.length;
      removed += before - after;
      if (before > after) {
        for (const row of completedRows) {
          appendDeletedKpiTodoRef(data, key, row.id);
        }
      }
      localStorage.setItem(key, JSON.stringify(data));
      if (before > after) dispatchKpiMapSavedAfterLocalWrite(key);
    } catch (_) {}
  });
  return removed;
}

const SECTION_TO_STORAGE = {
  dream: DREAM_MAP_KEY,
  sideincome: SIDEINCOME_KEY,
  happy: HAPPINESS_KEY,
  health: HEALTH_KEY,
};

function getFirstKpiId(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const kpis = data.kpis || [];
    return kpis[0]?.id || null;
  } catch (_) {}
  return null;
}

function nextId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * KPI 할일을 다른 섹션으로 이동
 * @param {string} kpiTodoId
 * @param {string} fromStorageKey
 * @param {string} toSectionId - dream | sideincome | health | happy
 * @returns {{ success: boolean, task?: object }} 이동된 태스크 정보 (getKpiTodosAsTasks 형식)
 */
export function moveKpiTodoToSection(kpiTodoId, fromStorageKey, toSectionId) {
  const toStorageKey = SECTION_TO_STORAGE[toSectionId];
  if (!toStorageKey || toStorageKey === fromStorageKey)
    return { success: false };

  try {
    const fromRaw = localStorage.getItem(fromStorageKey);
    if (!fromRaw) return { success: false };
    const fromData = JSON.parse(fromRaw);
    const todo = (fromData.kpiTodos || []).find((t) => t.id === kpiTodoId);
    if (!todo) return { success: false };
    if (!(todo.text || "").trim()) return { success: false };

    const toKpiId = getFirstKpiId(toStorageKey);
    if (!toKpiId) return { success: false };

    const toRaw = localStorage.getItem(toStorageKey);
    const toData = toRaw ? JSON.parse(toRaw) : { kpis: [], kpiTodos: [] };
    const kpi = (toData.kpis || []).find((k) => k.id === toKpiId);
    const kpiName = kpi?.name || "(KPI)";

    const sectionMeta = {
      dream: { sectionId: "dream", sectionLabel: "꿈" },
      sideincome: { sectionId: "sideincome", sectionLabel: "부수입" },
      happy: { sectionId: "happy", sectionLabel: "행복" },
      health: { sectionId: "health", sectionLabel: "건강" },
    }[toSectionId];

    fromData.kpiTodos = (fromData.kpiTodos || []).filter(
      (t) => t.id !== kpiTodoId,
    );
    localStorage.setItem(fromStorageKey, JSON.stringify(fromData));

    const newId = nextId();
    toData.kpiTodos = toData.kpiTodos || [];
    const itemType = todo.itemType === "schedule" ? "schedule" : "todo";
    toData.kpiTodos.push({
      id: newId,
      kpiId: toKpiId,
      text: (todo.text || "").trim(),
      startDate: todo.startDate || "",
      dueDate: todo.dueDate || "",
      startTime: todo.startTime || "",
      endTime: todo.endTime || "",
      completed: !!todo.completed,
      itemType,
    });
    localStorage.setItem(toStorageKey, JSON.stringify(toData));

    const task = {
      name: (todo.text || "").trim(),
      startDate: todo.startDate || "",
      dueDate: todo.dueDate || "",
      startTime: todo.startTime || "",
      endTime: todo.endTime || "",
      classification: kpiName,
      sectionId: sectionMeta.sectionId,
      sectionLabel: sectionMeta.sectionLabel,
      done: !!todo.completed,
      isKpiTodo: true,
      kpiTodoId: newId,
      domain: toSectionId,
      kpiId: toKpiId,
      storageKey: toStorageKey,
      itemType,
    };
    return { success: true, task };
  } catch (_) {}
  return { success: false };
}

/**
 * 브레인덤프 할일을 KPI 섹션에 추가
 * @param {string} toSectionId - dream | sideincome | health | happy
 * @param {{ text: string, startDate?: string, dueDate?: string, completed?: boolean, itemType?: "todo"|"schedule" }} todoData
 * @returns {{ success: boolean, task?: object }}
 */
export function addBraindumpTodoToSection(toSectionId, todoData) {
  const toStorageKey = SECTION_TO_STORAGE[toSectionId];
  if (!toStorageKey) return { success: false };
  if (!(todoData.text || "").trim()) return { success: false };

  const toKpiId = getFirstKpiId(toStorageKey);
  if (!toKpiId) return { success: false };

  try {
    const raw = localStorage.getItem(toStorageKey);
    const data = raw ? JSON.parse(raw) : { kpis: [], kpiTodos: [] };
    const kpi = (data.kpis || []).find((k) => k.id === toKpiId);
    const kpiName = kpi?.name || "(KPI)";

    const sectionMeta = {
      dream: { sectionId: "dream", sectionLabel: "꿈" },
      sideincome: { sectionId: "sideincome", sectionLabel: "부수입" },
      happy: { sectionId: "happy", sectionLabel: "행복" },
      health: { sectionId: "health", sectionLabel: "건강" },
    }[toSectionId];

    data.kpiTodos = data.kpiTodos || [];
    const newId = nextId();
    const itemType = todoData.itemType === "schedule" ? "schedule" : "todo";
    data.kpiTodos.push({
      id: newId,
      kpiId: toKpiId,
      text: (todoData.text || "").trim(),
      startDate: todoData.startDate || "",
      dueDate: todoData.dueDate || "",
      startTime: todoData.startTime || "",
      endTime: todoData.endTime || "",
      completed: !!todoData.completed,
      itemType,
    });
    localStorage.setItem(toStorageKey, JSON.stringify(data));

    const task = {
      name: (todoData.text || "").trim(),
      startDate: todoData.startDate || "",
      dueDate: todoData.dueDate || "",
      startTime: todoData.startTime || "",
      endTime: todoData.endTime || "",
      classification: kpiName,
      sectionId: sectionMeta.sectionId,
      sectionLabel: sectionMeta.sectionLabel,
      done: !!todoData.completed,
      isKpiTodo: true,
      kpiTodoId: newId,
      domain: toSectionId,
      kpiId: toKpiId,
      storageKey: toStorageKey,
      itemType,
    };
    return { success: true, task };
  } catch (_) {}
  return { success: false };
}

/**
 * 캘린더에서 날짜셀 클릭 시 할일/일정 추가
 * @param {string} toSectionId - dream | sideincome | health | happy
 * @param {{ text: string, dueDate: string, itemType: "todo"|"schedule" }} todoData
 * @returns {{ success: boolean, task?: object }}
 */
export function addCalendarTodoToSection(toSectionId, todoData) {
  const toStorageKey = SECTION_TO_STORAGE[toSectionId];
  if (!toStorageKey) return { success: false };
  if (!(todoData.text || "").trim()) return { success: false };
  if (!(todoData.dueDate || "").trim()) return { success: false };

  const toKpiId = getFirstKpiId(toStorageKey);
  if (!toKpiId) return { success: false };

  try {
    const raw = localStorage.getItem(toStorageKey);
    const data = raw ? JSON.parse(raw) : { kpis: [], kpiTodos: [] };
    const kpi = (data.kpis || []).find((k) => k.id === toKpiId);
    const kpiName = kpi?.name || "(KPI)";

    const sectionMeta = {
      dream: { sectionId: "dream", sectionLabel: "꿈" },
      sideincome: { sectionId: "sideincome", sectionLabel: "부수입" },
      happy: { sectionId: "happy", sectionLabel: "행복" },
      health: { sectionId: "health", sectionLabel: "건강" },
    }[toSectionId];

    data.kpiTodos = data.kpiTodos || [];
    const newId = nextId();
    const itemType = todoData.itemType === "schedule" ? "schedule" : "todo";
    data.kpiTodos.push({
      id: newId,
      kpiId: toKpiId,
      text: (todoData.text || "").trim(),
      dueDate: (todoData.dueDate || "").trim(),
      completed: false,
      itemType,
    });
    localStorage.setItem(toStorageKey, JSON.stringify(data));

    const task = {
      name: (todoData.text || "").trim(),
      dueDate: (todoData.dueDate || "").trim(),
      classification: kpiName,
      sectionId: sectionMeta.sectionId,
      sectionLabel: sectionMeta.sectionLabel,
      done: false,
      isKpiTodo: true,
      kpiTodoId: newId,
      domain: toSectionId,
      kpiId: toKpiId,
      storageKey: toStorageKey,
      itemType,
    };
    return { success: true, task };
  } catch (_) {}
  return { success: false };
}
