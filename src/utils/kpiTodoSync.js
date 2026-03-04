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
  const dreamData = loadJson(DREAM_MAP_KEY, { dreams: [], kpis: [], kpiTodos: [] });
  (dreamData.kpiTodos || []).forEach((todo) => {
    const kpi = (dreamData.kpis || []).find((k) => k.id === todo.kpiId);
    if (!kpi) return;
    const kpiName = kpi.name || "(KPI)";
    tasks.push({
      name: todo.text || "",
      dueDate: "",
      classification: kpiName,
      sectionId: "dream",
      sectionLabel: "꿈",
      done: !!todo.completed,
      isKpiTodo: true,
      kpiTodoId: todo.id,
      domain: "dream",
      kpiId: kpi.id,
      storageKey: DREAM_MAP_KEY,
    });
  });

  // 부수입
  const sideData = loadJson(SIDEINCOME_KEY, { paths: [], kpis: [], kpiTodos: [] });
  (sideData.kpiTodos || []).forEach((todo) => {
    const kpi = (sideData.kpis || []).find((k) => k.id === todo.kpiId);
    if (!kpi) return;
    const kpiName = kpi.name || "(KPI)";
    tasks.push({
      name: todo.text || "",
      dueDate: "",
      classification: kpiName,
      sectionId: "sideincome",
      sectionLabel: "부수입",
      done: !!todo.completed,
      isKpiTodo: true,
      kpiTodoId: todo.id,
      domain: "sideincome",
      kpiId: kpi.id,
      storageKey: SIDEINCOME_KEY,
    });
  });

  // 행복
  const happyData = loadJson(HAPPINESS_KEY, { happinesses: [], kpis: [], kpiTodos: [] });
  (happyData.kpiTodos || []).forEach((todo) => {
    const kpi = (happyData.kpis || []).find((k) => k.id === todo.kpiId);
    if (!kpi) return;
    const kpiName = kpi.name || "(KPI)";
    tasks.push({
      name: todo.text || "",
      dueDate: "",
      classification: kpiName,
      sectionId: "happy",
      sectionLabel: "하면 행복한 일",
      done: !!todo.completed,
      isKpiTodo: true,
      kpiTodoId: todo.id,
      domain: "happy",
      kpiId: kpi.id,
      storageKey: HAPPINESS_KEY,
    });
  });

  // 건강
  const healthData = loadJson(HEALTH_KEY, { healths: [], kpis: [], kpiTodos: [] });
  (healthData.kpiTodos || []).forEach((todo) => {
    const kpi = (healthData.kpis || []).find((k) => k.id === todo.kpiId);
    if (!kpi) return;
    const kpiName = kpi.name || "(KPI)";
    tasks.push({
      name: todo.text || "",
      dueDate: "",
      classification: kpiName,
      sectionId: "health",
      sectionLabel: "건강",
      done: !!todo.completed,
      isKpiTodo: true,
      kpiTodoId: todo.id,
      domain: "health",
      kpiId: kpi.id,
      storageKey: HEALTH_KEY,
    });
  });

  return tasks;
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
