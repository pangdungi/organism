/**
 * 인생 KPI 화면
 * 꿈 탭: 꿈 → 작은 목표 → 할 일 마인드맵 (인라인 입력)
 * 부수입 탭: 부수입 목표 → 부수입 방법 → 할 일
 */

const DREAM_MAP_STORAGE_KEY = "kpi-dream-map";
const SIDEINCOME_MAP_STORAGE_KEY = "kpi-sideincome-map";
const UNDO_MAX = 5;

let dreamHistory = [];
let sideincomeHistory = [];

function loadDreamMap() {
  try {
    const raw = localStorage.getItem(DREAM_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        dreams: parsed.dreams || [],
        goals: parsed.goals || [],
        tasks: parsed.tasks || [],
        kpis: parsed.kpis || [],
        kpiLogs: parsed.kpiLogs || [],
        kpiTodos: parsed.kpiTodos || [],
        kpiOrder: parsed.kpiOrder || {},
        kpiTaskSync: parsed.kpiTaskSync || {},
      };
    }
  } catch (_) {}
  return { dreams: [], goals: [], tasks: [], kpis: [], kpiLogs: [], kpiTodos: [], kpiOrder: {}, kpiTaskSync: {} };
}

function saveDreamMap(data) {
  try {
    localStorage.setItem(DREAM_MAP_STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

function loadSideincomeMap() {
  try {
    const raw = localStorage.getItem(SIDEINCOME_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        goals: parsed.goals || [],
        methods: parsed.methods || [],
        tasks: parsed.tasks || [],
      };
    }
  } catch (_) {}
  return { goals: [], methods: [], tasks: [] };
}

function saveSideincomeMap(data) {
  try {
    localStorage.setItem(SIDEINCOME_MAP_STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

function nextId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function pushDreamHistory() {
  const snap = loadDreamMap();
  dreamHistory.push(JSON.parse(JSON.stringify(snap)));
  if (dreamHistory.length > UNDO_MAX) dreamHistory.shift();
}

function pushSideincomeHistory() {
  const snap = loadSideincomeMap();
  sideincomeHistory.push(JSON.parse(JSON.stringify(snap)));
  if (sideincomeHistory.length > UNDO_MAX) sideincomeHistory.shift();
}

function showConfirmModal(message) {
  return new Promise((resolve) => {
    let overlay = document.querySelector(".kpi-confirm-modal");
    if (overlay) overlay.remove();

    overlay = document.createElement("div");
    overlay.className = "kpi-confirm-modal";
    overlay.innerHTML = `
      <div class="kpi-confirm-backdrop"></div>
      <div class="kpi-confirm-panel">
        <p class="kpi-confirm-message">${message}</p>
        <p class="kpi-confirm-warn">삭제 시 복구 불가</p>
        <div class="kpi-confirm-actions">
          <button type="button" class="kpi-confirm-cancel">취소</button>
          <button type="button" class="kpi-confirm-ok">삭제</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector(".kpi-confirm-backdrop").addEventListener("click", () => close(false));
    overlay.querySelector(".kpi-confirm-cancel").addEventListener("click", () => close(false));
    overlay.querySelector(".kpi-confirm-ok").addEventListener("click", () => close(true));

    document.body.appendChild(overlay);
  });
}

function createNodeInput(type, id, value, placeholder) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "kpi-mindmap-input kpi-mindmap-input--" + type;
  input.value = value || "";
  input.placeholder = placeholder || "";
  input.dataset[type + "Id"] = id;
  input.addEventListener("input", () => resizeInputToContent(input));
  input.addEventListener("compositionend", () => resizeInputToContent(input));
  return input;
}

function resizeInputToContent(input) {
  const val = input.value || input.placeholder || "";
  const measure = document.createElement("span");
  const style = getComputedStyle(input);
  measure.style.cssText = "position:absolute;visibility:hidden;white-space:pre;padding:0;margin:0;";
  measure.style.font = style.font;
  measure.style.letterSpacing = style.letterSpacing;
  measure.textContent = val || " ";
  document.body.appendChild(measure);
  const w = Math.ceil(measure.offsetWidth) + 2;
  document.body.removeChild(measure);
  input.style.width = Math.max(w, 32) + "px";
}

function renderDreamPanel(panel) {
  panel.innerHTML = "";
  const { dreams, goals, tasks } = loadDreamMap();

  const wrap = document.createElement("div");
  wrap.className = "kpi-mindmap-wrap";

  const btnRow = document.createElement("div");
  btnRow.className = "kpi-mindmap-btn-row";
  const addDreamBtn = document.createElement("button");
  addDreamBtn.className = "kpi-mindmap-add-dream";
  addDreamBtn.textContent = "+ 꿈 추가하기";
  addDreamBtn.addEventListener("click", () => addDream(panel));
  const undoDreamBtn = document.createElement("button");
  undoDreamBtn.className = "kpi-mindmap-undo-btn";
  undoDreamBtn.textContent = "↩ 실행취소";
  undoDreamBtn.disabled = dreamHistory.length === 0;
  undoDreamBtn.addEventListener("click", () => undoDream(panel));
  btnRow.appendChild(addDreamBtn);
  btnRow.appendChild(undoDreamBtn);
  wrap.appendChild(btnRow);

  const mapArea = document.createElement("div");
  mapArea.className = "kpi-mindmap-area";

  if (dreams.length === 0) {
    const empty = document.createElement("p");
    empty.className = "kpi-mindmap-empty";
    empty.textContent = "꿈을 추가해보세요";
    mapArea.appendChild(empty);
  } else {
    dreams.forEach((dream) => {
      const dreamGoals = goals.filter((g) => g.dreamId === dream.id);
      const tree = document.createElement("div");
      tree.className = "kpi-mindmap-tree";

      const dreamNode = document.createElement("div");
      dreamNode.className = "kpi-mindmap-node kpi-mindmap-node--dream";
      const dreamInput = createNodeInput("dream", dream.id, dream.name, "꿈 이름");
      dreamNode.appendChild(dreamInput);
      const dreamActions = document.createElement("span");
      dreamActions.className = "kpi-mindmap-node-actions";
      const dreamAddBtn = document.createElement("button");
      dreamAddBtn.className = "kpi-mindmap-node-add";
      dreamAddBtn.textContent = "+";
      dreamAddBtn.title = "목표 추가";
      dreamAddBtn.addEventListener("click", (e) => { e.stopPropagation(); addGoal(panel, dream.id); });
      const dreamDelBtn = document.createElement("button");
      dreamDelBtn.className = "kpi-mindmap-node-del";
      dreamDelBtn.textContent = "×";
      dreamDelBtn.title = "삭제";
      dreamDelBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteDream(panel, dream.id); });
      dreamActions.appendChild(dreamAddBtn);
      dreamActions.appendChild(dreamDelBtn);
      dreamNode.appendChild(dreamActions);
      setupInputBlur(dreamInput, "dream", dream.id);
      tree.appendChild(dreamNode);

      const branches = document.createElement("div");
      branches.className = "kpi-mindmap-branches";

      dreamGoals.forEach((goal, gIdx) => {
        const goalTasks = tasks.filter((t) => t.goalId === goal.id);
        const isLastGoal = gIdx === dreamGoals.length - 1;

        const branch = document.createElement("div");
        branch.className = "kpi-mindmap-branch" + (isLastGoal ? " kpi-mindmap-branch--last" : "");

        const goalLine = document.createElement("div");
        goalLine.className = "kpi-mindmap-line kpi-mindmap-line--goal";
        const goalNode = document.createElement("span");
        goalNode.className = "kpi-mindmap-node kpi-mindmap-node--goal";
        const goalInput = createNodeInput("goal", goal.id, goal.name, "작은 목표");
        goalNode.appendChild(goalInput);
        const goalActions = document.createElement("span");
        goalActions.className = "kpi-mindmap-node-actions";
        const goalAddBtn = document.createElement("button");
        goalAddBtn.className = "kpi-mindmap-node-add";
        goalAddBtn.textContent = "+";
        goalAddBtn.title = "할 일 추가";
        goalAddBtn.addEventListener("click", (e) => { e.stopPropagation(); addTask(panel, goal.id); });
        const goalDelBtn = document.createElement("button");
        goalDelBtn.className = "kpi-mindmap-node-del";
        goalDelBtn.textContent = "×";
        goalDelBtn.title = "삭제";
        goalDelBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteGoal(panel, goal.id); });
        goalActions.appendChild(goalAddBtn);
        goalActions.appendChild(goalDelBtn);
        goalNode.appendChild(goalActions);
        setupInputBlur(goalInput, "goal", goal.id);
        goalLine.appendChild(goalNode);
        branch.appendChild(goalLine);

        const tasksWrap = document.createElement("div");
        tasksWrap.className = "kpi-mindmap-tasks";
        goalTasks.forEach((task, tIdx) => {
          const isLastTask = tIdx === goalTasks.length - 1;
          const taskLine = document.createElement("div");
          taskLine.className = "kpi-mindmap-line kpi-mindmap-line--task" + (isLastTask ? " kpi-mindmap-line--last" : "");
          const taskNode = document.createElement("span");
          taskNode.className = "kpi-mindmap-node kpi-mindmap-node--task";
          const taskInput = createNodeInput("task", task.id, task.name, "할 일");
          taskNode.appendChild(taskInput);
          const taskDelBtn = document.createElement("button");
          taskDelBtn.className = "kpi-mindmap-node-del";
          taskDelBtn.textContent = "×";
          taskDelBtn.title = "삭제";
          taskDelBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteTask(panel, task.id); });
          taskNode.appendChild(taskDelBtn);
          setupInputBlur(taskInput, "task", task.id);
          taskLine.appendChild(taskNode);
          tasksWrap.appendChild(taskLine);
        });
        branch.appendChild(tasksWrap);
        branches.appendChild(branch);
      });

      tree.appendChild(branches);
      mapArea.appendChild(tree);
    });
  }

  wrap.appendChild(mapArea);
  panel.appendChild(wrap);

  panel.querySelectorAll(".kpi-mindmap-input").forEach((inp) => resizeInputToContent(inp));

  function setupInputBlur(input, type, id) {
    input.addEventListener("blur", () => {
      const val = input.value.trim();
      const data = loadDreamMap();
      if (val === "") {
        // 빈 항목은 저장하지 않고 제거
        if (type === "dream") {
          const goalIds = data.goals.filter((g) => g.dreamId === id).map((g) => g.id);
          data.dreams = data.dreams.filter((d) => d.id !== id);
          data.goals = data.goals.filter((g) => g.dreamId !== id);
          data.tasks = data.tasks.filter((t) => !goalIds.includes(t.goalId));
        } else if (type === "goal") {
          data.goals = data.goals.filter((g) => g.id !== id);
          data.tasks = data.tasks.filter((t) => t.goalId !== id);
        } else if (type === "task") {
          data.tasks = data.tasks.filter((t) => t.id !== id);
        }
        saveDreamMap(data);
        renderDreamPanel(panel);
        return;
      }
      if (type === "dream") {
        const d = data.dreams.find((x) => x.id === id);
        if (d) d.name = val;
      } else if (type === "goal") {
        const g = data.goals.find((x) => x.id === id);
        if (g) g.name = val;
      } else if (type === "task") {
        const t = data.tasks.find((x) => x.id === id);
        if (t) t.name = val;
      }
      saveDreamMap(data);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setTimeout(() => input.blur(), 0);
      }
    });
  }

  function addDream(panelEl) {
    pushDreamHistory();
    const data = loadDreamMap();
    const dream = { id: nextId(), name: "" };
    data.dreams.push(dream);
    saveDreamMap(data);
    renderDreamPanel(panelEl);
    const inp = panelEl.querySelector(`.kpi-mindmap-input--dream[data-dream-id="${dream.id}"]`);
    if (inp) inp.focus();
  }

  function addGoal(panelEl, dreamId) {
    pushDreamHistory();
    const data = loadDreamMap();
    const goal = { id: nextId(), dreamId, name: "" };
    data.goals.push(goal);
    saveDreamMap(data);
    renderDreamPanel(panelEl);
    const inp = panelEl.querySelector(`.kpi-mindmap-input--goal[data-goal-id="${goal.id}"]`);
    if (inp) inp.focus();
  }

  function addTask(panelEl, goalId) {
    pushDreamHistory();
    const data = loadDreamMap();
    const task = { id: nextId(), goalId, name: "" };
    data.tasks.push(task);
    saveDreamMap(data);
    renderDreamPanel(panelEl);
    const inp = panelEl.querySelector(`.kpi-mindmap-input--task[data-task-id="${task.id}"]`);
    if (inp) inp.focus();
  }

  async function deleteDream(panelEl, dreamId) {
    const data = loadDreamMap();
    const goalIds = data.goals.filter((g) => g.dreamId === dreamId).map((g) => g.id);
    const childCount = goalIds.length + data.tasks.filter((t) => goalIds.includes(t.goalId)).length;
    if (childCount > 0) {
      const ok = await showConfirmModal(`하위 항목 ${childCount}개도 함께 삭제됩니다. 삭제할까요?`);
      if (!ok) return;
    }
    pushDreamHistory();
    data.dreams = data.dreams.filter((d) => d.id !== dreamId);
    data.goals = data.goals.filter((g) => g.dreamId !== dreamId);
    data.tasks = data.tasks.filter((t) => !goalIds.includes(t.goalId));
    saveDreamMap(data);
    renderDreamPanel(panelEl);
  }

  async function deleteGoal(panelEl, goalId) {
    const data = loadDreamMap();
    const taskCount = data.tasks.filter((t) => t.goalId === goalId).length;
    if (taskCount > 0) {
      const ok = await showConfirmModal(`하위 할 일 ${taskCount}개도 함께 삭제됩니다. 삭제할까요?`);
      if (!ok) return;
    }
    pushDreamHistory();
    data.goals = data.goals.filter((g) => g.id !== goalId);
    data.tasks = data.tasks.filter((t) => t.goalId !== goalId);
    saveDreamMap(data);
    renderDreamPanel(panelEl);
  }

  function deleteTask(panelEl, taskId) {
    pushDreamHistory();
    const data = loadDreamMap();
    data.tasks = data.tasks.filter((t) => t.id !== taskId);
    saveDreamMap(data);
    renderDreamPanel(panelEl);
  }

  function undoDream(panelEl) {
    if (dreamHistory.length === 0) return;
    const prev = dreamHistory.pop();
    saveDreamMap(prev);
    renderDreamPanel(panelEl);
  }
}

function renderSideincomePanel(panel) {
  panel.innerHTML = "";
  const { goals, methods, tasks } = loadSideincomeMap();

  const wrap = document.createElement("div");
  wrap.className = "kpi-mindmap-wrap";

  const btnRow = document.createElement("div");
  btnRow.className = "kpi-mindmap-btn-row";
  const addGoalBtn = document.createElement("button");
  addGoalBtn.className = "kpi-mindmap-add-dream";
  addGoalBtn.textContent = "+ 부수입 목표 추가하기";
  addGoalBtn.addEventListener("click", () => addSiGoal(panel));
  const undoSideincomeBtn = document.createElement("button");
  undoSideincomeBtn.className = "kpi-mindmap-undo-btn";
  undoSideincomeBtn.textContent = "↩ 실행취소";
  undoSideincomeBtn.disabled = sideincomeHistory.length === 0;
  undoSideincomeBtn.addEventListener("click", () => undoSideincome(panel));
  btnRow.appendChild(addGoalBtn);
  btnRow.appendChild(undoSideincomeBtn);
  wrap.appendChild(btnRow);

  const mapArea = document.createElement("div");
  mapArea.className = "kpi-mindmap-area";

  if (goals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "kpi-mindmap-empty";
    empty.textContent = "부수입 목표를 추가해보세요";
    mapArea.appendChild(empty);
  } else {
    goals.forEach((goal) => {
      const goalMethods = methods.filter((m) => m.goalId === goal.id);
      const tree = document.createElement("div");
      tree.className = "kpi-mindmap-tree";

      const goalNode = document.createElement("div");
      goalNode.className = "kpi-mindmap-node kpi-mindmap-node--dream";
      const goalInput = createNodeInput("siGoal", goal.id, goal.name, "부수입 목표");
      goalNode.appendChild(goalInput);
      const goalActions = document.createElement("span");
      goalActions.className = "kpi-mindmap-node-actions";
      const goalAddBtn = document.createElement("button");
      goalAddBtn.className = "kpi-mindmap-node-add";
      goalAddBtn.textContent = "+";
      goalAddBtn.title = "부수입 방법 추가";
      goalAddBtn.addEventListener("click", (e) => { e.stopPropagation(); addSiMethod(panel, goal.id); });
      const goalDelBtn = document.createElement("button");
      goalDelBtn.className = "kpi-mindmap-node-del";
      goalDelBtn.textContent = "×";
      goalDelBtn.title = "삭제";
      goalDelBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteSiGoal(panel, goal.id); });
      goalActions.appendChild(goalAddBtn);
      goalActions.appendChild(goalDelBtn);
      goalNode.appendChild(goalActions);
      setupSiInputBlur(goalInput, "goal", goal.id);
      tree.appendChild(goalNode);

      const branches = document.createElement("div");
      branches.className = "kpi-mindmap-branches";

      goalMethods.forEach((method, mIdx) => {
        const methodTasks = tasks.filter((t) => t.methodId === method.id);
        const isLastMethod = mIdx === goalMethods.length - 1;

        const branch = document.createElement("div");
        branch.className = "kpi-mindmap-branch" + (isLastMethod ? " kpi-mindmap-branch--last" : "");

        const methodLine = document.createElement("div");
        methodLine.className = "kpi-mindmap-line kpi-mindmap-line--goal";
        const methodNode = document.createElement("span");
        methodNode.className = "kpi-mindmap-node kpi-mindmap-node--goal";
        const methodInput = createNodeInput("siMethod", method.id, method.name, "부수입 방법");
        methodNode.appendChild(methodInput);
        const methodActions = document.createElement("span");
        methodActions.className = "kpi-mindmap-node-actions";
        const methodAddBtn = document.createElement("button");
        methodAddBtn.className = "kpi-mindmap-node-add";
        methodAddBtn.textContent = "+";
        methodAddBtn.title = "할 일 추가";
        methodAddBtn.addEventListener("click", (e) => { e.stopPropagation(); addSiTask(panel, method.id); });
        const methodDelBtn = document.createElement("button");
        methodDelBtn.className = "kpi-mindmap-node-del";
        methodDelBtn.textContent = "×";
        methodDelBtn.title = "삭제";
        methodDelBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteSiMethod(panel, method.id); });
        methodActions.appendChild(methodAddBtn);
        methodActions.appendChild(methodDelBtn);
        methodNode.appendChild(methodActions);
        setupSiInputBlur(methodInput, "method", method.id);
        methodLine.appendChild(methodNode);
        branch.appendChild(methodLine);

        const tasksWrap = document.createElement("div");
        tasksWrap.className = "kpi-mindmap-tasks";
        methodTasks.forEach((task, tIdx) => {
          const isLastTask = tIdx === methodTasks.length - 1;
          const taskLine = document.createElement("div");
          taskLine.className = "kpi-mindmap-line kpi-mindmap-line--task" + (isLastTask ? " kpi-mindmap-line--last" : "");
          const taskNode = document.createElement("span");
          taskNode.className = "kpi-mindmap-node kpi-mindmap-node--task";
          const taskInput = createNodeInput("siTask", task.id, task.name, "할 일");
          taskNode.appendChild(taskInput);
          const taskDelBtn = document.createElement("button");
          taskDelBtn.className = "kpi-mindmap-node-del";
          taskDelBtn.textContent = "×";
          taskDelBtn.title = "삭제";
          taskDelBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteSiTask(panel, task.id); });
          taskNode.appendChild(taskDelBtn);
          setupSiInputBlur(taskInput, "task", task.id);
          taskLine.appendChild(taskNode);
          tasksWrap.appendChild(taskLine);
        });
        branch.appendChild(tasksWrap);
        branches.appendChild(branch);
      });

      tree.appendChild(branches);
      mapArea.appendChild(tree);
    });
  }

  wrap.appendChild(mapArea);
  panel.appendChild(wrap);

  panel.querySelectorAll(".kpi-mindmap-input").forEach((inp) => resizeInputToContent(inp));

  async function deleteSiGoal(panelEl, goalId) {
    const data = loadSideincomeMap();
    const methodIds = data.methods.filter((m) => m.goalId === goalId).map((m) => m.id);
    const childCount = methodIds.length + data.tasks.filter((t) => methodIds.includes(t.methodId)).length;
    if (childCount > 0) {
      const ok = await showConfirmModal(`하위 항목 ${childCount}개도 함께 삭제됩니다. 삭제할까요?`);
      if (!ok) return;
    }
    pushSideincomeHistory();
    data.goals = data.goals.filter((g) => g.id !== goalId);
    data.methods = data.methods.filter((m) => m.goalId !== goalId);
    data.tasks = data.tasks.filter((t) => !methodIds.includes(t.methodId));
    saveSideincomeMap(data);
    renderSideincomePanel(panelEl);
  }

  async function deleteSiMethod(panelEl, methodId) {
    const data = loadSideincomeMap();
    const taskCount = data.tasks.filter((t) => t.methodId === methodId).length;
    if (taskCount > 0) {
      const ok = await showConfirmModal(`하위 할 일 ${taskCount}개도 함께 삭제됩니다. 삭제할까요?`);
      if (!ok) return;
    }
    pushSideincomeHistory();
    data.methods = data.methods.filter((m) => m.id !== methodId);
    data.tasks = data.tasks.filter((t) => t.methodId !== methodId);
    saveSideincomeMap(data);
    renderSideincomePanel(panelEl);
  }

  function deleteSiTask(panelEl, taskId) {
    pushSideincomeHistory();
    const data = loadSideincomeMap();
    data.tasks = data.tasks.filter((t) => t.id !== taskId);
    saveSideincomeMap(data);
    renderSideincomePanel(panelEl);
  }

  function undoSideincome(panelEl) {
    if (sideincomeHistory.length === 0) return;
    const prev = sideincomeHistory.pop();
    saveSideincomeMap(prev);
    renderSideincomePanel(panelEl);
  }

  function setupSiInputBlur(input, type, id) {
    input.addEventListener("blur", () => {
      const val = input.value.trim();
      const data = loadSideincomeMap();
      if (val === "") {
        // 빈 항목은 저장하지 않고 제거
        if (type === "goal") {
          const methodIds = data.methods.filter((m) => m.goalId === id).map((m) => m.id);
          data.goals = data.goals.filter((g) => g.id !== id);
          data.methods = data.methods.filter((m) => m.goalId !== id);
          data.tasks = data.tasks.filter((t) => !methodIds.includes(t.methodId));
        } else if (type === "method") {
          data.methods = data.methods.filter((m) => m.id !== id);
          data.tasks = data.tasks.filter((t) => t.methodId !== id);
        } else if (type === "task") {
          data.tasks = data.tasks.filter((t) => t.id !== id);
        }
        saveSideincomeMap(data);
        renderSideincomePanel(panel);
        return;
      }
      if (type === "goal") {
        const g = data.goals.find((x) => x.id === id);
        if (g) g.name = val;
      } else if (type === "method") {
        const m = data.methods.find((x) => x.id === id);
        if (m) m.name = val;
      } else if (type === "task") {
        const t = data.tasks.find((x) => x.id === id);
        if (t) t.name = val;
      }
      saveSideincomeMap(data);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setTimeout(() => input.blur(), 0);
      }
    });
  }

  function addSiGoal(panelEl) {
    pushSideincomeHistory();
    const data = loadSideincomeMap();
    const goal = { id: nextId(), name: "" };
    data.goals.push(goal);
    saveSideincomeMap(data);
    renderSideincomePanel(panelEl);
    const inp = panelEl.querySelector(`.kpi-mindmap-input--siGoal[data-si-goal-id="${goal.id}"]`);
    if (inp) inp.focus();
  }

  function addSiMethod(panelEl, goalId) {
    pushSideincomeHistory();
    const data = loadSideincomeMap();
    const method = { id: nextId(), goalId, name: "" };
    data.methods.push(method);
    saveSideincomeMap(data);
    renderSideincomePanel(panelEl);
    const inp = panelEl.querySelector(`.kpi-mindmap-input--siMethod[data-si-method-id="${method.id}"]`);
    if (inp) inp.focus();
  }

  function addSiTask(panelEl, methodId) {
    pushSideincomeHistory();
    const data = loadSideincomeMap();
    const task = { id: nextId(), methodId, name: "" };
    data.tasks.push(task);
    saveSideincomeMap(data);
    renderSideincomePanel(panelEl);
    const inp = panelEl.querySelector(`.kpi-mindmap-input--siTask[data-si-task-id="${task.id}"]`);
    if (inp) inp.focus();
  }
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content kpi-view";
  const title = document.createElement("h2");
  title.className = "kpi-view-title";
  title.textContent = "인생 KPI";
  el.appendChild(title);

  const viewTabs = document.createElement("div");
  viewTabs.className = "kpi-view-tabs";
  viewTabs.innerHTML = `
    <button type="button" class="kpi-view-tab active" data-view="1">꿈</button>
    <button type="button" class="kpi-view-tab" data-view="2">부수입</button>
    <button type="button" class="kpi-view-tab" data-view="3">건강</button>
    <button type="button" class="kpi-view-tab" data-view="4">행복</button>
  `;
  el.appendChild(viewTabs);

  const contentWrap = document.createElement("div");
  contentWrap.className = "kpi-view-content-wrap";
  el.appendChild(contentWrap);

  const panels = [];
  for (let i = 1; i <= 4; i++) {
    const panel = document.createElement("div");
    panel.className = "kpi-view-panel";
    panel.dataset.view = String(i);
    panel.hidden = i !== 1;
    contentWrap.appendChild(panel);
    panels.push(panel);
  }

  renderDreamPanel(panels[0]);
  renderSideincomePanel(panels[1]);

  viewTabs.querySelectorAll(".kpi-view-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      viewTabs.querySelectorAll(".kpi-view-tab").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
      panels.forEach((p) => {
        p.hidden = p.dataset.view !== view;
      });
    });
  });

  return el;
}
