/**
 * 인생 KPI 화면
 * 꿈: 역순 여정 (이룬 순간 → 마음먹은 순간)
 */

const DREAM_STORAGE_KEY = "kpi-dream-data";

function loadDreamData() {
  try {
    const raw = localStorage.getItem(DREAM_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        title: parsed.title || "",
        subtitle: parsed.subtitle || "",
        phases: Array.isArray(parsed.phases) ? parsed.phases : [],
      };
    }
  } catch (_) {}
  return { title: "", subtitle: "", phases: [] };
}

function saveDreamData(data) {
  try {
    localStorage.setItem(DREAM_STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

function escapeAttr(s) {
  if (!s) return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML.replace(/"/g, "&quot;");
}

function renderDreamPanel(panel) {
  panel.innerHTML = "";
  let data = loadDreamData();

  const wrap = document.createElement("div");
  wrap.className = "kpi-dream-wrap";

  const header = document.createElement("div");
  header.className = "kpi-dream-header";
  header.innerHTML = `
    <div class="kpi-dream-title-row">
      <input type="text" class="kpi-dream-title-input" placeholder="나의 꿈 (예: 자유로운 창작자)" value="${escapeAttr(data.title)}" />
    </div>
    <div class="kpi-dream-subtitle-row">
      <input type="text" class="kpi-dream-subtitle-input" placeholder="꿈에 대한 한 줄 설명" value="${escapeAttr(data.subtitle)}" />
    </div>
  `;
  wrap.appendChild(header);

  const hint = document.createElement("p");
  hint.className = "kpi-dream-hint";
  hint.textContent = "이룬 순간부터 역순으로, 꿈을 마음먹은 순간까지 단계를 쪼개보세요.";
  wrap.appendChild(hint);

  const timeline = document.createElement("div");
  timeline.className = "kpi-dream-timeline";

  function save() {
    data.title = header.querySelector(".kpi-dream-title-input").value.trim();
    data.subtitle = header.querySelector(".kpi-dream-subtitle-input").value.trim();
    data.phases = [];
    timeline.querySelectorAll(".kpi-dream-phase").forEach((el) => {
      const stored = el._phaseData;
      if (stored) {
        data.phases.push({ id: el.dataset.phaseId, ...stored });
        return;
      }
      const titleEl = el.querySelector(".kpi-dream-phase-title");
      const periodEl = el.querySelector(".kpi-dream-phase-period");
      const descEl = el.querySelector(".kpi-dream-phase-desc");
      const goalsEl = el.querySelector(".kpi-dream-phase-goals");
      const goals = (goalsEl?.value || "")
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      data.phases.push({
        id: el.dataset.phaseId,
        title: titleEl?.value?.trim() || "",
        period: periodEl?.value?.trim() || "",
        description: descEl?.value?.trim() || "",
        goals,
      });
    });
    saveDreamData(data);
  }

  function renderPhaseDisplay(bodyEl, phase, phaseNum, onEdit, phaseElRef) {
    const goals = phase?.goals || [];
    phaseElRef._phaseData = phase;
    const periodText = phase?.period ? `지금 ~ ${escapeHtml(phase.period)}` : "";
    bodyEl.innerHTML = `
      <div class="kpi-dream-phase-display">
        <div class="kpi-dream-phase-display-header">
          ${periodText ? `<span class="kpi-dream-phase-display-period">${periodText}</span>` : ""}
        </div>
        <div class="kpi-dream-phase-display-title">${escapeHtml(phase?.title || "단계 제목")}</div>
        ${phase?.description ? `<p class="kpi-dream-phase-display-desc">${escapeHtml(phase.description)}</p>` : ""}
        ${goals.length > 0 ? `
          <div class="kpi-dream-phase-display-goals">
            ${goals.map((g) => `<span class="kpi-dream-phase-goal-tag">${escapeHtml(g)}</span>`).join("")}
          </div>
        ` : ""}
        <div class="kpi-dream-phase-actions">
          <button type="button" class="kpi-dream-phase-edit">수정</button>
          <button type="button" class="kpi-dream-phase-delete">삭제</button>
        </div>
      </div>
    `;
    bodyEl.querySelector(".kpi-dream-phase-edit").addEventListener("click", onEdit);
    bodyEl.querySelector(".kpi-dream-phase-delete").addEventListener("click", () => {
      phaseElRef.remove();
      save();
    });
  }

  function escapeHtml(s) {
    if (!s) return "";
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function createPhaseEl(phase, index) {
    const phaseEl = document.createElement("div");
    phaseEl.className = "kpi-dream-phase";
    phaseEl.dataset.phaseId = phase?.id || "p-" + Date.now() + "-" + index;
    const phaseNum = index + 1;
    const hasContent = (phase?.title || "").trim() || (phase?.description || "").trim() || (phase?.goals || []).length > 0;

    const node = document.createElement("div");
    node.className = "kpi-dream-phase-node";
    phaseEl.appendChild(node);

    const body = document.createElement("div");
    body.className = "kpi-dream-phase-body";
    phaseEl.appendChild(body);

    function renderEditMode() {
      phaseEl._phaseData = null;
      body.innerHTML = `
        <div class="kpi-dream-phase-edit-wrap">
          <div class="kpi-dream-phase-field kpi-dream-phase-field-row">
            <div class="kpi-dream-phase-field-item">
              <label class="kpi-dream-phase-label">기간</label>
              <input type="text" class="kpi-dream-phase-period" placeholder="3-5" value="${escapeAttr(phase?.period)}" />
            </div>
            <div class="kpi-dream-phase-field-item kpi-dream-phase-field-item-flex">
              <label class="kpi-dream-phase-label">단계 제목</label>
              <input type="text" class="kpi-dream-phase-title" placeholder="독립 — 직장 없는 삶" value="${escapeAttr(phase?.title)}" />
            </div>
          </div>
          <div class="kpi-dream-phase-field">
            <label class="kpi-dream-phase-label">상세 계획</label>
            <textarea class="kpi-dream-phase-desc" placeholder="이 단계에서 달성할 내용을 입력하세요" rows="3">${escapeAttr(phase?.description)}</textarea>
          </div>
          <div class="kpi-dream-phase-field">
            <label class="kpi-dream-phase-label">목표 / 행동</label>
            <input type="text" class="kpi-dream-phase-goals" placeholder="책 출판, 월 수익 500만, 직장 독립" value="${escapeAttr((phase?.goals || []).join(", "))}" />
          </div>
          <div class="kpi-dream-phase-actions">
            <button type="button" class="kpi-dream-phase-done">완료</button>
            <button type="button" class="kpi-dream-phase-delete">삭제</button>
          </div>
        </div>
      `;
      body.querySelector(".kpi-dream-phase-delete").addEventListener("click", () => {
        phaseEl.remove();
        save();
      });
      body.querySelector(".kpi-dream-phase-done").addEventListener("click", () => {
        const titleEl = body.querySelector(".kpi-dream-phase-title");
        const periodEl = body.querySelector(".kpi-dream-phase-period");
        const descEl = body.querySelector(".kpi-dream-phase-desc");
        const goalsEl = body.querySelector(".kpi-dream-phase-goals");
        let periodVal = periodEl?.value?.trim() || "";
        if (periodVal && !periodVal.endsWith("년")) periodVal += "년";
        phase = {
          ...phase,
          title: titleEl?.value?.trim() || "",
          period: periodVal,
          description: descEl?.value?.trim() || "",
          goals: (goalsEl?.value || "")
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean),
        };
        save();
        renderPhaseDisplay(body, phase, phaseNum, renderEditMode, phaseEl);
      });
      ["title", "period", "desc", "goals"].forEach((key) => {
        const input = body.querySelector(`.kpi-dream-phase-${key === "desc" ? "desc" : key === "goals" ? "goals" : key}`);
        if (input) input.addEventListener("input", save);
      });
      const periodInput = body.querySelector(".kpi-dream-phase-period");
      if (periodInput) {
        periodInput.addEventListener("blur", () => {
          let v = periodInput.value.trim();
          if (v && !v.endsWith("년")) {
            periodInput.value = v + "년";
            save();
          }
        });
      }
    }

    if (hasContent) {
      renderPhaseDisplay(body, phase, phaseNum, renderEditMode, phaseEl);
    } else {
      renderEditMode();
    }

    return phaseEl;
  };

  data.phases.forEach((p, i) => {
    timeline.appendChild(createPhaseEl(p, i));
  });

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "kpi-dream-add-phase";
  addBtn.textContent = "+ 단계 추가";
  addBtn.addEventListener("click", () => {
    const empty = timeline.querySelector(".kpi-dream-empty");
    if (empty) empty.remove();
    const newPhase = createPhaseEl({}, timeline.querySelectorAll(".kpi-dream-phase").length);
    timeline.appendChild(newPhase);
    save();
  });

  header.querySelector(".kpi-dream-title-input").addEventListener("input", save);
  header.querySelector(".kpi-dream-title-input").addEventListener("change", save);
  header.querySelector(".kpi-dream-subtitle-input").addEventListener("input", save);
  header.querySelector(".kpi-dream-subtitle-input").addEventListener("change", save);

  if (data.phases.length === 0) {
    const empty = document.createElement("div");
    empty.className = "kpi-dream-empty";
    empty.textContent = "단계 추가 버튼을 눌러 여정을 쪼개보세요.";
    timeline.appendChild(empty);
  }

  wrap.appendChild(timeline);
  wrap.appendChild(addBtn);
  panel.appendChild(wrap);
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
