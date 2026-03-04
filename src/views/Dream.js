/**
 * 꿈 페이지 - 꿈 추가 시 탭 형성, 꿈 제목이 탭 및 하단에 표시
 * 인생 KPI와 동일한 dream 데이터 사용 (kpi-dream-map)
 */

const DREAM_MAP_STORAGE_KEY = "kpi-dream-map";

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
      };
    }
  } catch (_) {}
  return { dreams: [], goals: [], tasks: [], kpis: [], kpiLogs: [], kpiTodos: [], kpiOrder: {} };
}

function saveDreamMap(data) {
  try {
    localStorage.setItem(DREAM_MAP_STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

function nextId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content dream-view";

  const title = document.createElement("h2");
  title.className = "dream-view-title";
  title.textContent = "꿈";
  el.appendChild(title);

  const btnRow = document.createElement("div");
  btnRow.className = "dream-btn-row";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "dream-add-btn";
  addBtn.textContent = "+ 꿈 추가하기";
  btnRow.appendChild(addBtn);
  el.appendChild(btnRow);

  const tabsWrap = document.createElement("div");
  tabsWrap.className = "dream-tabs-wrap";
  const tabs = document.createElement("div");
  tabs.className = "dream-tabs";
  tabsWrap.appendChild(tabs);
  el.appendChild(tabsWrap);

  const contentWrap = document.createElement("div");
  contentWrap.className = "dream-content-wrap";
  el.appendChild(contentWrap);

  const historyWrap = document.createElement("div");
  historyWrap.className = "dream-kpi-history-wrap";
  historyWrap.hidden = true;
  el.appendChild(historyWrap);

  let activeDreamId = null;
  let selectedKpiId = null;

  function showKpiModal() {
    if (!activeDreamId) return;
    const modal = document.createElement("div");
    modal.className = "dream-kpi-modal";
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel">
        <div class="dream-kpi-modal-header">
          <h3 class="dream-kpi-modal-title">새 KPI 추가</h3>
          <button type="button" class="dream-kpi-modal-close" title="닫기">×</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-field">
            <label>지표 이름</label>
            <input type="text" name="name" placeholder="예) DAU, 월 수익, 전환율" />
          </div>
          <div class="dream-kpi-row">
            <div class="dream-kpi-field">
              <label>목표값</label>
              <input type="text" name="targetValue" placeholder="예) 1000" inputmode="numeric" />
            </div>
            <div class="dream-kpi-field">
              <label>단위</label>
              <input type="text" name="unit" placeholder="예) 명, 만원, %" />
            </div>
          </div>
          <div class="dream-kpi-row">
            <div class="dream-kpi-field">
              <label>목표 달성 기한</label>
              <input type="text" name="targetDeadline" placeholder="예) 2026년 6월, 출시 6개월 후 등 자유 입력" />
            </div>
            <div class="dream-kpi-field">
              <label>목표 달성까지 필요한 시간</label>
              <input type="text" name="targetTimeRequired" placeholder="예) 02:30" />
            </div>
          </div>
          <button type="submit" class="dream-kpi-submit">KPI 등록하기</button>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector(".dream-kpi-backdrop").addEventListener("click", close);
    modal.querySelector(".dream-kpi-modal-close").addEventListener("click", close);
    modal.querySelector(".dream-kpi-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const kpi = {
        id: nextId(),
        dreamId: activeDreamId,
        name: (form.name.value || "").trim() || "지표",
        unit: (form.unit.value || "").trim() || "",
        targetValue: (form.targetValue.value || "").trim() || "",
        targetDeadline: (form.targetDeadline.value || "").trim() || "",
        targetTimeRequired: (form.targetTimeRequired?.value || "").trim() || "",
      };
      const data = loadDreamMap();
      data.kpis = data.kpis || [];
      const existingOrder = (data.kpiOrder || {})[activeDreamId] || data.kpis.filter((k) => k.dreamId === activeDreamId).map((k) => k.id);
      data.kpis.push(kpi);
      data.kpiOrder = data.kpiOrder || {};
      data.kpiOrder[activeDreamId] = [...existingOrder, kpi.id];
      saveDreamMap(data);
      close();
      renderKpiList();
    });
    document.body.appendChild(modal);
  }

  function showKpiEditModal(kpi) {
    const modal = document.createElement("div");
    modal.className = "dream-kpi-modal";
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel">
        <div class="dream-kpi-modal-header">
          <h3 class="dream-kpi-modal-title">KPI 수정</h3>
          <button type="button" class="dream-kpi-modal-close" title="닫기">×</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-field">
            <label>지표 이름</label>
            <input type="text" name="name" value="${escapeHtml(kpi.name || "")}" placeholder="예) DAU, 월 수익, 전환율" />
          </div>
          <div class="dream-kpi-row">
            <div class="dream-kpi-field">
              <label>목표값</label>
              <input type="text" name="targetValue" value="${escapeHtml(kpi.targetValue || "")}" placeholder="예) 1000" inputmode="numeric" />
            </div>
            <div class="dream-kpi-field">
              <label>단위</label>
              <input type="text" name="unit" value="${escapeHtml(kpi.unit || "")}" placeholder="예) 명, 만원, %" />
            </div>
          </div>
          <div class="dream-kpi-row">
            <div class="dream-kpi-field">
              <label>목표 달성 기한</label>
              <input type="text" name="targetDeadline" value="${escapeHtml(kpi.targetDeadline || "")}" placeholder="예) 2026년 6월, 출시 6개월 후 등 자유 입력" />
            </div>
            <div class="dream-kpi-field">
              <label>목표 달성까지 필요한 시간</label>
              <input type="text" name="targetTimeRequired" value="${escapeHtml(kpi.targetTimeRequired || "")}" placeholder="예) 02:30" />
            </div>
          </div>
          <button type="submit" class="dream-kpi-submit">수정</button>
          <div class="dream-kpi-delete-wrap">
            <p class="dream-kpi-delete-note">삭제 시 로그, 할일 목록이 모두 삭제됩니다.</p>
            <button type="button" class="dream-kpi-delete-btn">KPI 삭제하기</button>
          </div>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector(".dream-kpi-backdrop").addEventListener("click", close);
    modal.querySelector(".dream-kpi-modal-close").addEventListener("click", close);
    modal.querySelector(".dream-kpi-delete-btn").addEventListener("click", () => {
      const data = loadDreamMap();
      data.kpis = (data.kpis || []).filter((k) => k.id !== kpi.id);
      data.kpiLogs = (data.kpiLogs || []).filter((l) => l.kpiId !== kpi.id);
      data.kpiTodos = (data.kpiTodos || []).filter((t) => t.kpiId !== kpi.id);
      const order = (data.kpiOrder || {})[kpi.dreamId] || [];
      data.kpiOrder = { ...data.kpiOrder, [kpi.dreamId]: order.filter((id) => id !== kpi.id) };
      saveDreamMap(data);
      selectedKpiId = null;
      close();
      renderKpiList();
      renderKpiHistory();
    });
    modal.querySelector(".dream-kpi-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const data = loadDreamMap();
      const target = data.kpis.find((k) => k.id === kpi.id);
      if (target) {
        target.name = (form.name.value || "").trim() || "지표";
        target.unit = (form.unit.value || "").trim() || "";
        target.targetValue = (form.targetValue.value || "").trim() || "";
        target.targetDeadline = (form.targetDeadline.value || "").trim() || "";
        target.targetTimeRequired = (form.targetTimeRequired?.value || "").trim() || "";
        saveDreamMap(data);
      }
      close();
      renderKpiList();
      renderKpiHistory();
    });
    document.body.appendChild(modal);
  }

  function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}. ${m}. ${day}.`;
  }

  function showKpiLogModal(kpi, editLog) {
    const isEdit = !!editLog;
    const modal = document.createElement("div");
    modal.className = "dream-kpi-log-modal";
    const today = new Date();
    let dateVal = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    let valueVal = "";
    let statusVal = "순항";
    let memoVal = "";
    if (editLog) {
      if (editLog.dateRaw) {
        dateVal = editLog.dateRaw;
      } else if (editLog.date) {
        const m = editLog.date.match(/(\d{4})\.?\s*(\d{1,2})\.?\s*(\d{1,2})/);
        if (m) dateVal = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      }
      valueVal = editLog.value || "";
      statusVal = editLog.status || "순항";
      memoVal = editLog.memo || "";
    }
    modal.innerHTML = `
      <div class="dream-kpi-log-backdrop"></div>
      <div class="dream-kpi-log-panel">
        <div class="dream-kpi-log-header">
          <h3 class="dream-kpi-log-title">${isEdit ? "로그 수정" : "오늘의 수치 기록"}</h3>
          <button type="button" class="dream-kpi-log-close" title="닫기">×</button>
        </div>
        <p class="dream-kpi-log-subtitle">${isEdit ? "기록을 수정합니다." : "설정한 KPI 기준으로 오늘 측정값을 기록하세요."}</p>
        <form class="dream-kpi-log-form">
          <div class="dream-kpi-log-section">
            <div class="dream-kpi-log-row">
              <div class="dream-kpi-log-field">
                <label>날짜</label>
                <input type="date" name="date" value="${dateVal}" />
              </div>
              <div class="dream-kpi-log-field">
                <label>KPI 항목</label>
                <input type="text" value="${escapeHtml(kpi.name)}${kpi.unit ? " (" + escapeHtml(kpi.unit) + ")" : ""}" readonly class="dream-kpi-log-readonly" />
              </div>
            </div>
            <div class="dream-kpi-log-row">
              <div class="dream-kpi-log-field">
                <label>오늘 측정값</label>
                <input type="text" name="value" placeholder="숫자 입력" value="${escapeHtml(valueVal)}" inputmode="numeric" />
              </div>
              <div class="dream-kpi-log-field">
                <label>목표 대비 상태</label>
                <div class="dream-kpi-log-status">
                  <label class="dream-kpi-log-status-btn"><input type="radio" name="status" value="순항" ${statusVal === "순항" ? "checked" : ""} /><span>순항</span></label>
                  <label class="dream-kpi-log-status-btn"><input type="radio" name="status" value="보통" ${statusVal === "보통" ? "checked" : ""} /><span>보통</span></label>
                  <label class="dream-kpi-log-status-btn"><input type="radio" name="status" value="부진" ${statusVal === "부진" ? "checked" : ""} /><span>부진</span></label>
                </div>
              </div>
            </div>
            <div class="dream-kpi-log-field">
              <label>메모 (선택)</label>
              <textarea name="memo" placeholder="오늘 이 수치가 나온 이유, 특이사항 등..." rows="3">${escapeHtml(memoVal)}</textarea>
            </div>
          </div>
          <button type="submit" class="dream-kpi-log-submit">${isEdit ? "수정 저장" : "+ 로그 저장"}</button>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector(".dream-kpi-log-backdrop").addEventListener("click", close);
    modal.querySelector(".dream-kpi-log-close").addEventListener("click", close);
    modal.querySelector(".dream-kpi-log-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const dateVal = form.date.value;
      const dateStr = dateVal ? `${dateVal.split("-")[0]}. ${dateVal.split("-")[1]}. ${dateVal.split("-")[2]}.` : toDateStr(new Date());
      const data = loadDreamMap();
      if (isEdit) {
        const idx = data.kpiLogs.findIndex((l) => l.id === editLog.id);
        if (idx >= 0) {
          data.kpiLogs[idx] = {
            ...data.kpiLogs[idx],
            date: dateStr,
            dateRaw: dateVal,
            value: (form.value.value || "").trim(),
            status: form.status.value || "순항",
            memo: (form.memo.value || "").trim(),
          };
        }
      } else {
        const log = {
          id: nextId(),
          kpiId: kpi.id,
          dreamId: kpi.dreamId,
          date: dateStr,
          dateRaw: dateVal,
          value: (form.value.value || "").trim(),
          status: form.status.value || "순항",
          memo: (form.memo.value || "").trim(),
        };
        data.kpiLogs = data.kpiLogs || [];
        data.kpiLogs.push(log);
      }
      saveDreamMap(data);
      close();
      renderKpiList();
      renderKpiHistory();
    });
    document.body.appendChild(modal);
  }

  function getLatestKpiLog(kpiId) {
    const data = loadDreamMap();
    const logs = (data.kpiLogs || []).filter((l) => l.kpiId === kpiId);
    if (logs.length === 0) return null;
    logs.sort((a, b) => {
      const da = a.dateRaw || a.date || "";
      const db = b.dateRaw || b.date || "";
      return db.localeCompare(da);
    });
    return logs[0];
  }

  function getKpiLogs(kpiId) {
    const data = loadDreamMap();
    const logs = (data.kpiLogs || []).filter((l) => l.kpiId === kpiId);
    logs.sort((a, b) => {
      const da = a.dateRaw || a.date || "";
      const db = b.dateRaw || b.date || "";
      return db.localeCompare(da);
    });
    return logs;
  }

  function parseNum(str) {
    const n = parseFloat(String(str || "").replace(/[^0-9.-]/g, ""));
    return Number.isNaN(n) ? 0 : n;
  }

  function reorderKpis(dreamId, orderedKpiIds) {
    const data = loadDreamMap();
    data.kpiOrder = data.kpiOrder || {};
    data.kpiOrder[dreamId] = orderedKpiIds;
    saveDreamMap(data);
  }

  function renderKpiList() {
    contentWrap.innerHTML = "";
    if (!activeDreamId) return;
    const data = loadDreamMap();
    let dreamKpis = (data.kpis || []).filter((k) => k.dreamId === activeDreamId);
    const order = (data.kpiOrder || {})[activeDreamId];
    if (order && order.length > 0) {
      const orderMap = new Map(order.map((id, i) => [id, i]));
      dreamKpis = [...dreamKpis].sort((a, b) => {
        const ia = orderMap.has(a.id) ? orderMap.get(a.id) : 999;
        const ib = orderMap.has(b.id) ? orderMap.get(b.id) : 999;
        return ia - ib;
      });
    }
    const grid = document.createElement("div");
    grid.className = "dream-kpi-grid";
    dreamKpis.forEach((kpi) => {
        const latestLog = getLatestKpiLog(kpi.id);
        const currentVal = latestLog?.value ? parseNum(latestLog.value) : 0;
        const targetVal = parseNum(kpi.targetValue);
        const progress = targetVal > 0 ? Math.min(100, (currentVal / targetVal) * 100) : 0;
        const unitSuffix = kpi.unit ? " " + kpi.unit : "";
        const card = document.createElement("div");
        card.className = "dream-kpi-card" + (selectedKpiId === kpi.id ? " is-selected" : "");
        card.dataset.kpiId = kpi.id;
        card.draggable = true;
        card.innerHTML = `
          <div class="dream-kpi-card-inner">
            <button type="button" class="dream-kpi-card-edit" title="KPI 수정">수정</button>
            <div class="dream-kpi-card-name">${escapeHtml(kpi.name)}</div>
            <div class="dream-kpi-card-current">현재 ${latestLog?.value ? escapeHtml(latestLog.value) + unitSuffix : "0" + unitSuffix}</div>
            <div class="dream-kpi-card-target-num">${kpi.targetValue ? escapeHtml(String(kpi.targetValue).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) : "—"}</div>
            <div class="dream-kpi-card-target-desc">${kpi.unit ? escapeHtml(kpi.unit) : ""}</div>
            ${kpi.targetDeadline ? `<div class="dream-kpi-card-deadline">목표기한 ${escapeHtml(kpi.targetDeadline)}</div>` : ""}
            ${kpi.targetTimeRequired ? `<div class="dream-kpi-card-time">필요시간 ${escapeHtml(kpi.targetTimeRequired)}</div>` : ""}
            <div class="dream-kpi-card-progress">
              <div class="dream-kpi-card-progress-bar"><div class="dream-kpi-card-progress-fill" style="width:${progress}%"></div></div>
              <div class="dream-kpi-card-progress-text">${latestLog?.value || "0"} / ${kpi.targetValue || "0"}${unitSuffix}</div>
            </div>
          </div>
        `;
        card.querySelector(".dream-kpi-card-edit").addEventListener("click", (e) => {
          e.stopPropagation();
          showKpiEditModal(kpi);
        });
        card.addEventListener("click", (e) => {
          if (e.target.closest(".dream-kpi-card-edit")) return;
          selectedKpiId = selectedKpiId === kpi.id ? null : kpi.id;
          renderKpiList();
          renderKpiHistory();
        });
        card.addEventListener("dragstart", (e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", kpi.id);
          card.classList.add("dream-kpi-card-dragging");
        });
        card.addEventListener("dragend", () => {
          card.classList.remove("dream-kpi-card-dragging");
        });
        card.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (card.dataset.kpiId !== e.dataTransfer.getData("text/plain")) {
            card.classList.add("dream-kpi-card-drag-over");
          }
        });
        card.addEventListener("dragleave", (e) => {
          e.currentTarget.classList.remove("dream-kpi-card-drag-over");
        });
        card.addEventListener("drop", (e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("dream-kpi-card-drag-over");
          const draggedId = e.dataTransfer.getData("text/plain");
          if (draggedId === kpi.id) return;
          const newOrder = dreamKpis.map((k) => k.id);
          const fromIdx = newOrder.indexOf(draggedId);
          const toIdx = newOrder.indexOf(kpi.id);
          if (fromIdx >= 0 && toIdx >= 0) {
            newOrder.splice(fromIdx, 1);
            newOrder.splice(toIdx, 0, draggedId);
            reorderKpis(activeDreamId, newOrder);
            renderKpiList();
            renderKpiHistory();
          }
        });
        grid.appendChild(card);
      });
    grid.addEventListener("dragend", () => {
      grid.querySelectorAll(".dream-kpi-card-drag-over").forEach((c) => c.classList.remove("dream-kpi-card-drag-over"));
    });
    const addCard = document.createElement("button");
    addCard.type = "button";
    addCard.className = "dream-kpi-add-card";
    addCard.innerHTML = '<span class="dream-kpi-add-card-text">+ KPI 추가하기</span>';
    addCard.addEventListener("click", () => {
      if (!activeDreamId) return;
      showKpiModal();
    });
    grid.appendChild(addCard);
    contentWrap.appendChild(grid);
  }

  function renderKpiHistory() {
    historyWrap.innerHTML = "";
    if (!selectedKpiId) {
      historyWrap.hidden = true;
      return;
    }
    const data = loadDreamMap();
    const kpi = (data.kpis || []).find((k) => k.id === selectedKpiId);
    if (!kpi) {
      historyWrap.hidden = true;
      return;
    }
    const logs = getKpiLogs(selectedKpiId);
    const todos = (data.kpiTodos || []).filter((t) => t.kpiId === selectedKpiId);
    historyWrap.hidden = false;

    const headerRow = document.createElement("div");
    headerRow.className = "dream-kpi-history-header";
    headerRow.innerHTML = `
      <h4 class="dream-kpi-history-title">${escapeHtml(kpi.name)} 기록</h4>
      <button type="button" class="dream-kpi-history-log-btn">+ 로그</button>
    `;
    headerRow.querySelector(".dream-kpi-history-log-btn").addEventListener("click", () => showKpiLogModal(kpi));
    historyWrap.appendChild(headerRow);

    const divider = document.createElement("div");
    divider.className = "dream-kpi-history-divider";
    historyWrap.appendChild(divider);

    if (logs.length === 0) {
      const empty = document.createElement("p");
      empty.className = "dream-kpi-history-empty";
      empty.textContent = "아직 기록이 없습니다.";
      historyWrap.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "dream-kpi-history-list";
      logs.forEach((log) => {
        const item = document.createElement("div");
        item.className = "dream-kpi-history-item";
        const unitSuffix = kpi.unit ? " " + kpi.unit : "";
        item.innerHTML = `
          <div class="dream-kpi-history-item-main">
            <span class="dream-kpi-history-date">${escapeHtml(log.date)}</span>
            <span class="dream-kpi-history-value">${escapeHtml(log.value || "—")}${unitSuffix}</span>
            <span class="dream-kpi-history-status dream-kpi-history-status--${log.status === "순항" ? "good" : log.status === "보통" ? "normal" : "poor"}">${escapeHtml(log.status)}</span>
          </div>
          ${log.memo ? `<div class="dream-kpi-history-memo">${escapeHtml(log.memo)}</div>` : ""}
          <div class="dream-kpi-history-actions">
            <button type="button" class="dream-kpi-history-edit">수정</button>
            <button type="button" class="dream-kpi-history-delete">삭제</button>
          </div>
        `;
        item.querySelector(".dream-kpi-history-edit").addEventListener("click", () => showKpiLogModal(kpi, log));
        item.querySelector(".dream-kpi-history-delete").addEventListener("click", () => {
          const d = loadDreamMap();
          d.kpiLogs = (d.kpiLogs || []).filter((l) => l.id !== log.id);
          saveDreamMap(d);
          renderKpiList();
          renderKpiHistory();
        });
        list.appendChild(item);
      });
      historyWrap.appendChild(list);
    }

    const todoHeader = document.createElement("div");
    todoHeader.className = "dream-kpi-todo-header";
    todoHeader.innerHTML = `<span class="dream-kpi-todo-title">할일 목록</span>`;
    historyWrap.appendChild(todoHeader);

    const todoList = document.createElement("div");
    todoList.className = "dream-kpi-todo-list";
    todos.forEach((todo) => {
      const item = document.createElement("div");
      const completed = !!todo.completed;
      item.className = "dream-kpi-todo-item" + (completed ? " is-completed" : "");
      item.dataset.todoId = todo.id;
      item.innerHTML = `
        <label class="dream-kpi-todo-check-wrap">
          <input type="checkbox" class="dream-kpi-todo-check" ${completed ? "checked" : ""} />
        </label>
        <span class="dream-kpi-todo-text">${escapeHtml(todo.text)}</span>
        <button type="button" class="dream-kpi-todo-del" title="삭제">×</button>
      `;
      const check = item.querySelector(".dream-kpi-todo-check");
      check.addEventListener("change", () => {
        const d = loadDreamMap();
        const t = d.kpiTodos.find((x) => x.id === todo.id);
        if (t) {
          t.completed = !!check.checked;
          saveDreamMap(d);
          item.classList.toggle("is-completed", t.completed);
        }
      });
      item.querySelector(".dream-kpi-todo-del").addEventListener("click", () => {
        const d = loadDreamMap();
        d.kpiTodos = (d.kpiTodos || []).filter((x) => x.id !== todo.id);
        saveDreamMap(d);
        renderKpiHistory();
      });
      todoList.appendChild(item);
    });

    const addRow = document.createElement("div");
    addRow.className = "dream-kpi-todo-add-row";
    addRow.innerHTML = `
      <span class="dream-kpi-todo-add-spacer"></span>
      <input type="text" class="dream-kpi-todo-add-input" placeholder="할 일 입력" />
    `;
    const addInput = addRow.querySelector(".dream-kpi-todo-add-input");
    const addTodoFromInput = () => {
      const val = addInput.value.trim();
      if (!val) return;
      const data = loadDreamMap();
      const todo = { id: nextId(), kpiId: selectedKpiId, text: val, completed: false };
      data.kpiTodos = data.kpiTodos || [];
      data.kpiTodos.push(todo);
      saveDreamMap(data);
      addInput.value = "";
      renderKpiHistory();
      setTimeout(() => historyWrap.querySelector(".dream-kpi-todo-add-input")?.focus(), 0);
    };
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        addTodoFromInput();
      }
    });
    historyWrap.appendChild(todoList);
    historyWrap.appendChild(addRow);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }


  function showDreamEditModal(dream) {
    const modal = document.createElement("div");
    modal.className = "dream-kpi-modal";
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel">
        <div class="dream-kpi-modal-header">
          <h3 class="dream-kpi-modal-title">꿈 이름 수정</h3>
          <button type="button" class="dream-kpi-modal-close" title="닫기">×</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-field">
            <label>꿈 이름</label>
            <input type="text" name="name" value="${escapeHtml(dream.name || "")}" placeholder="꿈 이름" />
          </div>
          <button type="submit" class="dream-kpi-submit">수정</button>
        </form>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector(".dream-kpi-backdrop").addEventListener("click", close);
    modal.querySelector(".dream-kpi-modal-close").addEventListener("click", close);
    modal.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const val = (e.target.name.value || "").trim() || "꿈 이름";
      const d = loadDreamMap();
      const target = d.dreams.find((x) => x.id === dream.id);
      if (target) {
        target.name = val;
        saveDreamMap(d);
        renderTabs();
      }
      close();
    });
    document.body.appendChild(modal);
  }

  function showDreamDeleteConfirmModal(dreamId) {
    const data = loadDreamMap();
    const dream = data.dreams.find((d) => d.id === dreamId);
    const dreamName = dream?.name || "이 꿈";
    const modal = document.createElement("div");
    modal.className = "dream-kpi-modal dream-delete-confirm-modal";
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel dream-delete-confirm-panel">
        <h3 class="dream-delete-confirm-title">꿈 삭제</h3>
        <p class="dream-delete-confirm-msg">"${escapeHtml(dreamName)}"을(를) 정말 삭제하시겠습니까?</p>
        <p class="dream-delete-confirm-warn">삭제하면 복구할 수 없으며, 내부 KPI·로그·할일이 모두 삭제됩니다.</p>
        <div class="dream-delete-confirm-actions">
          <button type="button" class="dream-delete-confirm-cancel">취소</button>
          <button type="button" class="dream-delete-confirm-submit">삭제</button>
        </div>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector(".dream-kpi-backdrop").addEventListener("click", close);
    modal.querySelector(".dream-delete-confirm-cancel").addEventListener("click", close);
    modal.querySelector(".dream-delete-confirm-submit").addEventListener("click", () => {
      close();
      const d = loadDreamMap();
      const kpiIds = (d.kpis || []).filter((k) => k.dreamId === dreamId).map((k) => k.id);
      d.dreams = (d.dreams || []).filter((x) => x.id !== dreamId);
      d.kpis = (d.kpis || []).filter((k) => k.dreamId !== dreamId);
      d.kpiLogs = (d.kpiLogs || []).filter((l) => !kpiIds.includes(l.kpiId));
      d.kpiTodos = (d.kpiTodos || []).filter((t) => !kpiIds.includes(t.kpiId));
      delete d.kpiOrder?.[dreamId];
      saveDreamMap(d);
      if (activeDreamId === dreamId) {
        activeDreamId = d.dreams[0]?.id || null;
        selectedKpiId = null;
      }
      renderTabs();
      updateTitleAndContent();
    });
    document.body.appendChild(modal);
  }

  function renderTabs() {
    const data = loadDreamMap();
    tabs.innerHTML = "";
    data.dreams.forEach((dream) => {
      const tab = document.createElement("div");
      tab.className = "dream-tab" + (dream.id === activeDreamId ? " active" : "");
      tab.dataset.dreamId = dream.id;
      tab.innerHTML = `
        <span class="dream-tab-text">${escapeHtml(dream.name || "꿈 이름")}</span>
        <button type="button" class="dream-tab-edit" title="꿈 이름 수정">✎</button>
        <button type="button" class="dream-tab-del" title="꿈 삭제 (내부 KPI·로그·할일 모두 삭제)">×</button>
      `;
      tab.querySelector(".dream-tab-text").addEventListener("click", () => {
        activeDreamId = dream.id;
        renderTabs();
        updateTitleAndContent();
      });
      tab.querySelector(".dream-tab-edit").addEventListener("click", (e) => {
        e.stopPropagation();
        showDreamEditModal(dream);
      });
      tab.querySelector(".dream-tab-del").addEventListener("click", (e) => {
        e.stopPropagation();
        showDreamDeleteConfirmModal(dream.id);
      });
      tabs.appendChild(tab);
    });
  }

  function updateTitleAndContent() {
    const data = loadDreamMap();
    const dream = data.dreams.find((d) => d.id === activeDreamId);
    if (dream) {
      contentWrap.hidden = false;
      selectedKpiId = null;
      renderKpiList();
      renderKpiHistory();
    } else {
      contentWrap.hidden = true;
    }
  }

  addBtn.addEventListener("click", () => {
    const data = loadDreamMap();
    const dream = { id: nextId(), name: "새 꿈" };
    data.dreams.push(dream);
    saveDreamMap(data);
    activeDreamId = dream.id;
    renderTabs();
    updateTitleAndContent();
  });

  renderTabs();
  if (activeDreamId) {
    updateTitleAndContent();
  } else {
    const data = loadDreamMap();
    if (data.dreams.length > 0) {
      activeDreamId = data.dreams[0].id;
      renderTabs();
      updateTitleAndContent();
    } else {
      contentWrap.hidden = true;
    }
  }

  return el;
}
