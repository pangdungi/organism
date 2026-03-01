/**
 * 인생 KPI 화면
 * 꿈, 부수입, 행복, 건강
 */

export const CATEGORIES = [
  { id: "dream", label: "꿈" },
  { id: "sideincome", label: "부수입" },
  { id: "happiness", label: "행복" },
  { id: "health", label: "건강" },
];

const STATUS_OPTIONS = [
  { value: "진행중", label: "진행 중", icon: "status-progress" },
  { value: "시작안함", label: "시작 안함", icon: "status-notstarted" },
  { value: "하기로결정함", label: "하기로 결정함", icon: "status-decided" },
  { value: "달성완료", label: "달성완료", icon: "status-done" },
  { value: "달성실패", label: "달성실패", icon: "status-failed" },
];

const STATUS_GROUPS = [
  { key: "notstarted", label: "Not started", options: ["시작안함"] },
  { key: "active", label: "Active", options: ["하기로결정함", "진행중"] },
  { key: "closed", label: "Closed", options: ["달성완료", "달성실패"] },
];

const STATUS_VIEW_ORDER = [
  { value: "시작안함", label: "시작 안함" },
  { value: "하기로결정함", label: "하기로 결정함" },
  { value: "진행중", label: "진행 중" },
  { value: "달성완료", label: "달성완료" },
  { value: "달성실패", label: "달성실패" },
];

const COL_WIDTH_KEYS = { name: "kpi-col-name-width", kpi: "kpi-col-kpi-width" };
const COL_WIDTH_DEFAULTS = { name: 180, kpi: 360 };
const COL_WIDTH_MIN = { name: 100, kpi: 200 };
const COL_WIDTH_MAX = { name: 800, kpi: 1200 };
const COL_FIXED_TOTAL = 26 * 16;

function getColWidth(col) {
  const saved = localStorage.getItem(COL_WIDTH_KEYS[col]);
  return saved ? parseInt(saved, 10) : COL_WIDTH_DEFAULTS[col];
}

function setColWidth(col, px) {
  const clamped = Math.max(COL_WIDTH_MIN[col], Math.min(COL_WIDTH_MAX[col], px));
  localStorage.setItem(COL_WIDTH_KEYS[col], String(clamped));
  return clamped;
}

function getTableWidth() {
  return getColWidth("name") + getColWidth("kpi") + COL_FIXED_TOTAL;
}

function syncTableWidths(tables) {
  const w = getTableWidth();
  tables.forEach((t) => {
    t.style.width = w + "px";
  });
}

function openSidePanel(tr, nameInput) {
  let overlay = document.querySelector(".kpi-side-overlay");
  let panel = document.querySelector(".kpi-side-panel");
  const viewEl = tr.closest(".kpi-view");
  if (!viewEl) return;

  function closePanel() {
    const curTr = panel._currentTr;
    const memo = panel.querySelector(".kpi-side-memo");
    if (curTr && memo) curTr.dataset.kpiMemo = memo.value;
    overlay.classList.remove("is-open");
    panel.classList.remove("is-open");
  }

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "kpi-side-overlay";
    overlay.addEventListener("click", closePanel);
  }
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "kpi-side-panel";
    panel.innerHTML = `
      <div class="kpi-side-header">
        <h3 class="kpi-side-title"></h3>
        <button type="button" class="kpi-side-close" title="닫기">×</button>
      </div>
      <div class="kpi-side-body">
        <label class="kpi-side-label">메모</label>
        <textarea class="kpi-side-memo" placeholder="메모를 입력하세요..."></textarea>
      </div>
    `;
    panel.querySelector(".kpi-side-close").addEventListener("click", closePanel);
    viewEl.appendChild(overlay);
    viewEl.appendChild(panel);
  }

  const titleEl = panel.querySelector(".kpi-side-title");
  const memoEl = panel.querySelector(".kpi-side-memo");
  panel._currentTr = tr;
  titleEl.textContent = nameInput?.value?.trim() || "목표";
  memoEl.value = tr.dataset.kpiMemo || "";

  overlay.classList.add("is-open");
  panel.classList.add("is-open");
  memoEl.focus();
}

function formatYYMMDD(val) {
  if (!val || val.length < 10) return "";
  const [y, m, d] = val.split("-");
  return `${y.slice(2)}/${m}/${d}`;
}

function createDateCell() {
  const wrap = document.createElement("div");
  wrap.className = "kpi-date-cell";
  const display = document.createElement("span");
  display.className = "kpi-date-display";
  display.innerHTML =
    '<span class="kpi-date-icon-simple"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
  const input = document.createElement("input");
  input.type = "date";
  input.className = "kpi-input-date-hidden";
  function refresh() {
    if (input.value) {
      display.textContent = formatYYMMDD(input.value);
      display.classList.add("has-value");
    } else {
      display.innerHTML =
        '<span class="kpi-date-icon-simple"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
      display.classList.remove("has-value");
    }
  }
  input.addEventListener("change", refresh);
  wrap.appendChild(display);
  wrap.appendChild(input);
  wrap.addEventListener("click", () => {
    input.focus();
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  });
  return { wrap, input, refresh };
}

function createStatusDropdown(initialValue) {
  const wrap = document.createElement("div");
  wrap.className = "kpi-status-dropdown-wrap";
  let value = initialValue || "시작안함";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "kpi-status-trigger";
  function updateTriggerLabel() {
    const opt = STATUS_OPTIONS.find((o) => o.value === value);
    const icon = opt?.icon || "status-progress";
    const label = opt ? opt.label : value;
    trigger.innerHTML = `<span class="kpi-status-option-icon ${icon}"></span><span class="kpi-status-trigger-label">${label}</span>`;
  }
  updateTriggerLabel();

  const panel = document.createElement("div");
  panel.className = "kpi-status-panel";
  panel.hidden = true;

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search...";
  searchInput.className = "kpi-status-search";

  const listWrap = document.createElement("div");
  listWrap.className = "kpi-status-list";

  function renderList(filter = "") {
    listWrap.innerHTML = "";
    const q = filter.toLowerCase().trim();
    STATUS_GROUPS.forEach((grp) => {
      const opts = grp.options
        .map((v) => STATUS_OPTIONS.find((o) => o.value === v))
        .filter(Boolean)
        .filter((o) => !q || o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
      if (opts.length === 0) return;
      const header = document.createElement("div");
      header.className = "kpi-status-group-header";
      header.textContent = grp.label;
      listWrap.appendChild(header);
      opts.forEach((o) => {
        const opt = document.createElement("div");
        opt.className = "kpi-status-option" + (o.value === value ? " is-selected" : "");
        opt.dataset.value = o.value;
        opt.innerHTML = `<span class="kpi-status-option-icon ${o.icon}"></span><span class="kpi-status-option-label">${o.label}</span><span class="kpi-status-option-check">${o.value === value ? "✓" : ""}</span>`;
        opt.addEventListener("click", () => {
          value = o.value;
          updateTriggerLabel();
          renderList(searchInput.value);
          panel.hidden = true;
        });
        listWrap.appendChild(opt);
      });
    });
  }

  searchInput.addEventListener("input", () => renderList(searchInput.value));
  panel.appendChild(searchInput);
  panel.appendChild(listWrap);

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      renderList();
      searchInput.value = "";
      searchInput.focus();
    }
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) panel.hidden = true;
  });

  wrap.appendChild(trigger);
  wrap.appendChild(panel);
  wrap._getStatus = () => value;
  return { wrap, getValue: () => value };
}

export function createSection(cat, options = {}) {
  const { tasks = [], mode = "category", variant = "kpi" } = options;
  const isStatusMode = mode === "status";
  const isTodoMode = variant === "todo";
  const section = document.createElement("section");
  section.className = "kpi-section";
  if (isStatusMode) {
    section.dataset.status = cat.id;
  } else {
    section.dataset.category = cat.id;
  }

  const header = document.createElement("div");
  header.className = "kpi-section-header";
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "kpi-section-toggle";
  toggleBtn.innerHTML = "▼";
  toggleBtn.title = "접기/펼치기";
  const title = document.createElement("span");
  title.className = "kpi-section-title";
  title.textContent = cat.label;
  const countSpan = document.createElement("span");
  countSpan.className = "kpi-section-count";
  countSpan.textContent = "0";
  header.appendChild(toggleBtn);
  header.appendChild(title);
  header.appendChild(countSpan);
  section.appendChild(header);

  const tableWrap = document.createElement("div");
  tableWrap.className = "kpi-table-wrap";
  const table = document.createElement("table");
  table.className = "kpi-table" + (isTodoMode ? " kpi-table-todo" : "");
  const nameW = getColWidth("name");
  const kpiW = getColWidth("kpi");
  const tableWidth = isTodoMode ? 3.75 * 16 + nameW + 5 * 16 + 5 * 16 + 4 * 16 : getTableWidth();
  table.style.width = tableWidth + "px";
  table.style.setProperty("--kpi-name-width", nameW + "px");
  if (!isTodoMode) table.style.setProperty("--kpi-kpi-width", kpiW + "px");
  if (isTodoMode) {
    table.innerHTML = `
      <colgroup>
        <col class="kpi-col-check" style="width: 3.75rem;">
        <col class="kpi-col-name" style="width: ${nameW}px;">
        <col class="kpi-col-date" style="width: 5rem;">
        <col class="kpi-col-memo" style="width: 8rem;">
        <col class="kpi-col-actions" style="width: 4rem;">
      </colgroup>
      <thead>
        <tr>
          <th class="kpi-th-check"></th>
          <th class="kpi-th-name">태스크명</th>
          <th class="kpi-th-date">마감일</th>
          <th class="kpi-th-memo">메모</th>
          <th class="kpi-th-actions"></th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
  } else {
    table.innerHTML = `
      <colgroup>
        <col class="kpi-col-name" style="width: ${nameW}px;">
        <col class="kpi-col-date" style="width: 5rem;">
        <col class="kpi-col-date" style="width: 5rem;">
        <col class="kpi-col-status" style="width: 6rem;">
        <col class="kpi-col-kpi" style="width: ${kpiW}px;">
        <col class="kpi-col-actual" style="width: 4rem;">
        <col class="kpi-col-target" style="width: 4rem;">
        <col class="kpi-col-actions" style="width: 4rem;">
      </colgroup>
      <thead>
        <tr>
          <th class="kpi-th-name">목표명</th>
          <th class="kpi-th-date">Start date</th>
          <th class="kpi-th-date">Due date</th>
          <th class="kpi-th-status">Status</th>
          <th class="kpi-th-kpi">KPI</th>
          <th class="kpi-th-actual">실제</th>
          <th class="kpi-th-target">목표</th>
          <th class="kpi-th-actions"></th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
  }
  const tbody = table.querySelector("tbody");

  function updateCount() {
    const n = tbody.querySelectorAll(".kpi-row").length;
    countSpan.textContent = n;
  }

  function createRow(categoryId, isSub, parentId, onUpdateCount, initialData) {
    const tr = document.createElement("tr");
    tr.className = "kpi-row" + (isSub ? " kpi-row-sub" : "");
    if (isStatusMode && initialData?.categoryId) tr.dataset.categoryId = initialData.categoryId;

    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "kpi-expand";
    expandBtn.innerHTML = "▼";
    if (isTodoMode) {
      expandBtn.classList.add("kpi-expand-todo");
      expandBtn.title = "접기/펼치기";
      if (isSub) {
        expandBtn.style.display = "none";
      } else {
        expandBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const collapsed = tr.classList.toggle("sub-collapsed");
          let next = tr.nextElementSibling;
          while (next && next.classList.contains("kpi-row-sub")) {
            next.style.display = collapsed ? "none" : "";
            next = next.nextElementSibling;
          }
        });
      }
    }

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "kpi-input-name";
    nameInput.placeholder = isTodoMode ? "태스크" : "목표";
    if (initialData?.name) nameInput.value = initialData.name;
    const memoBtn = document.createElement("button");
    memoBtn.type = "button";
    memoBtn.className = "kpi-memo-btn";
    memoBtn.title = "메모";
    memoBtn.innerHTML = `<svg class="kpi-memo-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h8v12H4V2z"/><path d="M6 5h4M6 7h4M6 9h2"/></svg>`;

    if (isTodoMode) {
      if (isSub) {
        const checkTd = document.createElement("td");
        checkTd.className = "kpi-cell kpi-cell-check";
        const checkLabel = document.createElement("label");
        checkLabel.className = "kpi-todo-check-wrap";
        const checkInput = document.createElement("input");
        checkInput.type = "checkbox";
        checkInput.className = "kpi-todo-check";
        if (initialData?.done) {
          checkInput.checked = true;
          tr.classList.add("kpi-row-done");
        }
        checkInput.addEventListener("change", () => tr.classList.toggle("kpi-row-done", checkInput.checked));
        checkLabel.appendChild(checkInput);
        checkTd.appendChild(checkLabel);
        tr.appendChild(checkTd);
        const nameTd = document.createElement("td");
        nameTd.className = "kpi-cell kpi-cell-name";
        const nameWrap = document.createElement("div");
        nameWrap.className = "kpi-name-wrap";
        nameWrap.appendChild(nameInput);
        nameTd.appendChild(nameWrap);
        tr.appendChild(nameTd);
      } else {
        const nameTd = document.createElement("td");
        nameTd.className = "kpi-cell kpi-cell-name kpi-cell-name-merged";
        nameTd.colSpan = 2;
        const nameWrap = document.createElement("div");
        nameWrap.className = "kpi-name-wrap kpi-name-wrap-merged";
        if (!isSub) nameWrap.appendChild(expandBtn);
        const checkLabel = document.createElement("label");
        checkLabel.className = "kpi-todo-check-wrap";
        const checkInput = document.createElement("input");
        checkInput.type = "checkbox";
        checkInput.className = "kpi-todo-check";
        if (initialData?.done) {
          checkInput.checked = true;
          tr.classList.add("kpi-row-done");
        }
        checkInput.addEventListener("change", () => tr.classList.toggle("kpi-row-done", checkInput.checked));
        checkLabel.appendChild(checkInput);
        nameWrap.appendChild(checkLabel);
        nameWrap.appendChild(nameInput);
        nameTd.appendChild(nameWrap);
        tr.appendChild(nameTd);
      }
    } else {
      const nameTd = document.createElement("td");
      nameTd.className = "kpi-cell kpi-cell-name";
      const nameWrap = document.createElement("div");
      nameWrap.className = "kpi-name-wrap";
      nameWrap.appendChild(expandBtn);
      nameWrap.appendChild(nameInput);
      nameWrap.appendChild(memoBtn);
      nameTd.appendChild(nameWrap);
      tr.appendChild(nameTd);
    }

    if (!isTodoMode) {
      memoBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openSidePanel(tr, nameInput);
      });
      nameInput.addEventListener("dblclick", (e) => {
        e.preventDefault();
        openSidePanel(tr, nameInput);
      });
    }

    if (!isTodoMode) {
      const startDate = createDateCell();
      if (initialData?.startDate) {
        startDate.input.value = initialData.startDate;
        startDate.refresh();
      }
      tr.appendChild(createCell(startDate.wrap, "kpi-cell-date"));
    }
    const dueDate = createDateCell();
    if (initialData?.dueDate) {
      dueDate.input.value = initialData.dueDate;
      dueDate.refresh();
    }
    tr.appendChild(createCell(dueDate.wrap, "kpi-cell-date"));

    if (isTodoMode) {
      const memoInput = document.createElement("input");
      memoInput.type = "text";
      memoInput.className = "kpi-input-memo";
      memoInput.placeholder = "";
      if (initialData?.memo) memoInput.value = initialData.memo;
      tr.appendChild(createCell(memoInput, "kpi-cell-memo"));
    }

    if (!isTodoMode) {
      const statusDropdown = createStatusDropdown(initialData?.status || "시작안함");
      tr.appendChild(createCell(statusDropdown.wrap, "kpi-cell-status"));
    }

    if (!isTodoMode) {
      const kpiInput = document.createElement("input");
      kpiInput.type = "text";
      kpiInput.className = "kpi-input-kpi";
      kpiInput.placeholder = "KPI 설명";
      if (initialData?.kpi) kpiInput.value = initialData.kpi;
      tr.appendChild(createCell(kpiInput, "kpi-cell-kpi"));

      const actualInput = document.createElement("input");
      actualInput.type = "text";
      actualInput.className = "kpi-input-actual";
      actualInput.placeholder = "-";
      if (initialData?.actual) actualInput.value = initialData.actual;
      tr.appendChild(createCell(actualInput, "kpi-cell-actual"));

      const targetInput = document.createElement("input");
      targetInput.type = "text";
      targetInput.className = "kpi-input-target";
      targetInput.placeholder = "-";
      if (initialData?.target) targetInput.value = initialData.target;
      tr.appendChild(createCell(targetInput, "kpi-cell-target"));
    }

    if (initialData?.memo) tr.dataset.kpiMemo = initialData.memo;

    if (!isTodoMode) {
      const actualInput = tr.querySelector(".kpi-input-actual");
      const targetInput = tr.querySelector(".kpi-input-target");
      const measureWidth = (el, text) => {
        const span = document.createElement("span");
        const cs = el ? getComputedStyle(el) : null;
        span.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font-size:15px;font-family:'Noto Sans KR',sans-serif;padding:0 0.5rem;";
        if (cs) {
          span.style.fontSize = cs.fontSize;
          span.style.fontFamily = cs.fontFamily;
        }
        span.textContent = text || "-";
        document.body.appendChild(span);
        const w = Math.max(48, span.offsetWidth + 20);
        document.body.removeChild(span);
        return w;
      };
      const updateActualTargetWidths = () => {
        const section = tr.closest(".kpi-section");
        if (!section) return;
        const tbl = section.querySelector(".kpi-table");
        if (!tbl) return;
        const actualInputs = tbl.querySelectorAll(".kpi-input-actual");
        const targetInputs = tbl.querySelectorAll(".kpi-input-target");
        let maxActualPx = 40;
        let maxTargetPx = 40;
        actualInputs.forEach((i) => {
          const w = measureWidth(i, i.value);
          if (w > maxActualPx) maxActualPx = w;
        });
        targetInputs.forEach((i) => {
          const w = measureWidth(i, i.value);
          if (w > maxTargetPx) maxTargetPx = w;
        });
        const colActual = tbl.querySelector(".kpi-col-actual");
        const colTarget = tbl.querySelector(".kpi-col-target");
        if (colActual) colActual.style.width = `${maxActualPx}px`;
        if (colTarget) colTarget.style.width = `${maxTargetPx}px`;
      };
      if (actualInput) actualInput.addEventListener("input", updateActualTargetWidths);
      if (targetInput) targetInput.addEventListener("input", updateActualTargetWidths);
    }

    const actionsTd = document.createElement("td");
    actionsTd.className = "kpi-cell kpi-cell-actions";
    if (!isSub) {
      const addSubBtn = document.createElement("button");
      addSubBtn.type = "button";
      addSubBtn.className = "kpi-btn-add-sub";
      addSubBtn.textContent = "+ 하위";
      addSubBtn.addEventListener("click", () => {
        const sub = createRow(categoryId, true, null, onUpdateCount);
        tbody.insertBefore(sub, tr.nextSibling);
        if (isTodoMode) tr.classList.add("has-sub");
        onUpdateCount?.();
      });
      actionsTd.appendChild(addSubBtn);
    }
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "kpi-btn-delete";
    delBtn.textContent = "삭제";
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);
    delBtn.addEventListener("click", () => {
      if (tr.classList.contains("kpi-row-sub") && isTodoMode) {
        let prev = tr.previousElementSibling;
        while (prev && prev.classList.contains("kpi-row-sub")) prev = prev.previousElementSibling;
        tr.remove();
        if (prev && !prev.classList.contains("kpi-row-sub")) {
          const nextSub = prev.nextElementSibling;
          if (!nextSub || !nextSub.classList.contains("kpi-row-sub")) prev.classList.remove("has-sub");
        }
      } else {
        if (!tr.classList.contains("kpi-row-sub")) {
          let next = tr.nextElementSibling;
          while (next && next.classList.contains("kpi-row-sub")) {
            const toRemove = next;
            next = next.nextElementSibling;
            toRemove.remove();
          }
        }
        tr.remove();
      }
      onUpdateCount?.();
    });

    return tr;
  }

  function createCell(content, cellClass = "") {
    const td = document.createElement("td");
    td.className = "kpi-cell" + (cellClass ? " " + cellClass : "");
    if (content && content.nodeType) td.appendChild(content);
    else td.textContent = content ?? "";
    return td;
  }

  const addTaskRow = document.createElement("tr");
  addTaskRow.className = "kpi-row-add-task";
  const addTaskCell = document.createElement("td");
  addTaskCell.colSpan = isTodoMode ? 2 : 1;
  addTaskCell.className = "kpi-cell-name kpi-cell-add-task";
  const addTaskBtn = document.createElement("button");
  addTaskBtn.type = "button";
  addTaskBtn.className = "kpi-btn-add-task-inline";
  addTaskBtn.innerHTML = isTodoMode ? '<span class="kpi-add-task-icon">+</span> Add Task' : '<span class="kpi-add-task-icon">+</span> Add Goal';
  addTaskCell.appendChild(addTaskBtn);
  addTaskRow.appendChild(addTaskCell);
  const addTaskRest = document.createElement("td");
  addTaskRest.colSpan = isTodoMode ? 3 : 7;
  addTaskRest.className = "kpi-cell-add-task-rest";
  addTaskRow.appendChild(addTaskRest);
  tbody.appendChild(addTaskRow);

  addTaskBtn.addEventListener("click", () => {
    const initialData = isStatusMode ? { categoryId: "dream", status: cat.id } : undefined;
    const rowCategoryId = isStatusMode ? "dream" : cat.id;
    const tr = createRow(rowCategoryId, false, null, updateCount, initialData);
    tbody.insertBefore(tr, addTaskRow);
    updateCount();
  });

  const sectionTasks = isStatusMode
    ? tasks.filter((t) => t.status === cat.id)
    : tasks.filter((t) => t.categoryId === cat.id);
  if (sectionTasks.length > 0) {
    let lastParent = null;
    sectionTasks.forEach((task) => {
      const isSub = isTodoMode && !!task.isSub;
      const tr = createRow(task.categoryId || cat.id, isSub, null, updateCount, task);
      if (isSub && lastParent) {
        let insertBeforeEl = lastParent.nextElementSibling;
        while (insertBeforeEl && insertBeforeEl.classList.contains("kpi-row-sub")) {
          insertBeforeEl = insertBeforeEl.nextElementSibling;
        }
        tbody.insertBefore(tr, insertBeforeEl);
      } else {
        tbody.insertBefore(tr, addTaskRow);
        if (!isSub) lastParent = tr;
      }
    });
    if (isTodoMode) {
      tbody.querySelectorAll(".kpi-row:not(.kpi-row-sub)").forEach((tr) => {
        if (tr.nextElementSibling?.classList.contains("kpi-row-sub")) tr.classList.add("has-sub");
      });
    }
    updateCount();
  }

  tableWrap.appendChild(table);
  section.appendChild(tableWrap);

  toggleBtn.addEventListener("click", () => {
    section.classList.toggle("kpi-section-collapsed");
    toggleBtn.classList.toggle("collapsed", section.classList.contains("kpi-section-collapsed"));
  });

  return section;
}

export function setupColumnResize(viewEl) {
  const tables = viewEl.querySelectorAll(".kpi-table");
  tables.forEach((table) => {
    const thName = table.querySelector(".kpi-th-name");
    const thKpi = table.querySelector(".kpi-th-kpi");
    if (!thName || !thKpi) return;

    const gripName = document.createElement("div");
    gripName.className = "kpi-col-resize";
    gripName.dataset.col = "name";
    thName.appendChild(gripName);

    const gripKpi = document.createElement("div");
    gripKpi.className = "kpi-col-resize";
    gripKpi.dataset.col = "kpi";
    thKpi.appendChild(gripKpi);
  });

  viewEl.addEventListener("mousedown", (e) => {
    const grip = e.target.closest(".kpi-col-resize");
    if (!grip) return;
    e.preventDefault();
    const col = grip.dataset.col;
    const table = grip.closest(".kpi-table");
    const colEl = table.querySelector(`.kpi-col-${col}`);
    const startX = e.clientX;
    const startW = colEl.offsetWidth;

    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      const newW = setColWidth(col, startW + delta);
      tables.forEach((t) => {
        const c = t.querySelector(`.kpi-col-${col}`);
        if (c) c.style.width = newW + "px";
        t.style.setProperty(col === "name" ? "--kpi-name-width" : "--kpi-kpi-width", newW + "px");
      });
      syncTableWidths(tables);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("kpi-resizing");
    };
    document.body.classList.add("kpi-resizing");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

/** 목표명, KPI, 시작일, 마감일, 실제, 목표값이 전부 비어있으면 빈 행으로 간주 */
export function isEmptyTask(task) {
  const name = (task.name || "").trim();
  const startDate = (task.startDate || "").trim();
  const dueDate = (task.dueDate || "").trim();
  const kpi = (task.kpi || "").trim();
  const actual = (task.actual || "").trim();
  const target = (task.target || "").trim();
  return !name && !startDate && !dueDate && !kpi && !actual && !target;
}

export function collectTasksFromDOM(container) {
  const tasks = [];
  const sections = container.querySelectorAll(".kpi-section");
  sections.forEach((section) => {
    const categoryId = section.dataset.category;
    const statusValue = section.dataset.status;
    const isTodoSection = section.closest(".todo-list-view") || section.querySelector(".kpi-todo-check");
    const tbody = section.querySelector("tbody");
    if (!tbody) return;
    const rows = tbody.querySelectorAll(".kpi-row");
    rows.forEach((tr) => {
      const nameInput = tr.querySelector(".kpi-input-name");
      const kpiInput = tr.querySelector(".kpi-input-kpi");
      const actualInput = tr.querySelector(".kpi-input-actual");
      const targetInput = tr.querySelector(".kpi-input-target");
      const statusWrap = tr.querySelector(".kpi-status-dropdown-wrap");
      const todoCheck = tr.querySelector(".kpi-todo-check");
      const cells = tr.querySelectorAll("td");
      const isMergedParent = isTodoSection && tr.querySelector(".kpi-cell-name-merged");
      const startCellIdx = todoCheck ? -1 : 1;
      const dueCellIdx = todoCheck ? (isMergedParent ? 1 : 2) : 2;
      const memoCellIdx = todoCheck ? (isMergedParent ? 2 : 3) : -1;
      const startInput = startCellIdx >= 0 ? (cells[startCellIdx]?.querySelector(".kpi-date-cell input") || cells[startCellIdx]?.querySelector("input")) : null;
      const dueInput = cells[dueCellIdx]?.querySelector(".kpi-date-cell input") || cells[dueCellIdx]?.querySelector("input");
      const memoInput = memoCellIdx >= 0 ? (cells[memoCellIdx]?.querySelector(".kpi-input-memo") || cells[memoCellIdx]?.querySelector("input")) : null;
      const catId = categoryId || tr.dataset.categoryId || "dream";
      const status = (typeof statusWrap?._getStatus === "function" ? statusWrap._getStatus() : null) || statusValue || "시작안함";
      const isSub = isTodoSection && tr.classList.contains("kpi-row-sub");
      const task = {
        categoryId: catId,
        status,
        name: nameInput?.value || "",
        startDate: startInput?.value || "",
        dueDate: dueInput?.value || "",
        kpi: kpiInput?.value || "",
        actual: actualInput?.value || "",
        target: targetInput?.value || "",
        memo: (memoInput ? memoInput.value : tr.dataset.kpiMemo) || "",
        done: todoCheck ? todoCheck.checked : false,
        isSub: isTodoSection ? isSub : undefined,
      };
      if (!isEmptyTask(task)) tasks.push(task);
    });
  });
  return tasks;
}

function renderStatusView(container, tasks) {
  const content = document.createElement("div");
  content.className = "kpi-view-content kpi-view-status";
  STATUS_VIEW_ORDER.forEach(({ value: statusValue, label: statusLabel }) => {
    const section = createSection(
      { id: statusValue, label: statusLabel },
      { tasks: tasks.filter((t) => t.status === statusValue), mode: "status" }
    );
    content.appendChild(section);
  });
  return content;
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
    <button type="button" class="kpi-view-tab active" data-view="category">카테고리별</button>
    <button type="button" class="kpi-view-tab" data-view="status">진행상태별</button>
  `;
  el.appendChild(viewTabs);

  const contentWrap = document.createElement("div");
  contentWrap.className = "kpi-view-content-wrap";
  el.appendChild(contentWrap);

  let currentView = "category";
  let allTasks = [];

  function renderCategory(tasks = []) {
    const content = document.createElement("div");
    content.className = "kpi-view-content kpi-view-category";
    CATEGORIES.forEach((cat) => {
      content.appendChild(createSection(cat, { tasks, mode: "category" }));
    });
    contentWrap.innerHTML = "";
    contentWrap.appendChild(content);
    setupColumnResize(contentWrap);
  }

  function renderStatus(tasks = []) {
    const content = renderStatusView(contentWrap, tasks);
    contentWrap.innerHTML = "";
    contentWrap.appendChild(content);
    setupColumnResize(contentWrap);
  }

  function switchView(view) {
    allTasks = collectTasksFromDOM(contentWrap);
    currentView = view;
    viewTabs.querySelectorAll(".kpi-view-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    if (view === "category") {
      renderCategory(allTasks);
    } else {
      renderStatus(allTasks);
    }
  }

  viewTabs.querySelectorAll(".kpi-view-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  renderCategory();
  return el;
}
