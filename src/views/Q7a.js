const Q7A_SIDEBAR_KEY = "q7a_sidebar_data";

const DEFAULT_SIDEBAR = {
  감정정리: {
    icon: "😠",
    items: [
      { id: "1", label: "증오", icon: "😠" },
      { id: "2", label: "싫은 감정 내새울 때", icon: "😞" },
      { id: "3", label: "나의 건듬 포인트 \"컨피덴셜\"", icon: "😠" },
      { id: "4", label: "인정욕구가 심하다", icon: "😞" },
      { id: "5", label: "극도의 불안, 하지만 불안이 살려냄", icon: "😰" },
      { id: "6", label: "무시받는다는 느낌, 내 평판이 흔들릴...", icon: "🏎️" },
      { id: "diary", label: "감정관리", icon: "📄" },
    ],
  },
  "Q&A 데일리일기": {
    icon: "❓",
    items: [
      { id: "d1", label: "17/02/2026", icon: "☀️" },
      { id: "d2", label: "19/02/2026", icon: "☀️" },
    ],
  },
  "실수 일기": {
    icon: "😉",
    items: [
      { id: "m1", label: "환자의 컨피덴셜", icon: "😇" },
      { id: "m2", label: "Diffib Patch placement", icon: "🏥" },
    ],
  },
};

function loadSidebarData() {
  try {
    const raw = localStorage.getItem(Q7A_SIDEBAR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_SIDEBAR));
}

function saveSidebarData(data) {
  try {
    localStorage.setItem(Q7A_SIDEBAR_KEY, JSON.stringify(data));
  } catch (_) {}
}

function createSection(title, config, isOpen, onToggle, onSelect, selectedId) {
  const section = document.createElement("div");
  section.className = "q7a-sidebar-section";
  const header = document.createElement("button");
  header.type = "button";
  header.className = "q7a-sidebar-section-header" + (isOpen ? " is-open" : "");
  header.innerHTML = `<span class="q7a-sidebar-section-icon">${config.icon}</span><span class="q7a-sidebar-section-title">${title}</span><span class="q7a-sidebar-section-arrow">▼</span>`;
  header.addEventListener("click", () => onToggle(title));
  section.appendChild(header);
  const list = document.createElement("div");
  list.className = "q7a-sidebar-section-list" + (isOpen ? " is-open" : "");
  (config.items || []).forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "q7a-sidebar-item" + (selectedId === item.id ? " active" : "");
    row.dataset.id = item.id;
    row.innerHTML = `<span class="q7a-sidebar-item-icon">${item.icon}</span><span class="q7a-sidebar-item-label">${item.label}</span>`;
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      onSelect(item);
    });
    list.appendChild(row);
  });
  section.appendChild(list);
  return section;
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content q7a-view";

  const layout = document.createElement("div");
  layout.className = "q7a-layout";

  const sidebar = document.createElement("aside");
  sidebar.className = "q7a-sidebar";

  let sidebarData = loadSidebarData();
  let openSections = { 감정정리: true, "Q&A 데일리일기": true, "실수 일기": true };
  let selectedItem = null;

  function renderSidebar() {
    sidebar.innerHTML = "";
    Object.entries(sidebarData).forEach(([title, config]) => {
      const section = createSection(
        title,
        config,
        openSections[title] !== false,
        (t) => {
          openSections[t] = !openSections[t];
          renderSidebar();
        },
        (item) => {
          selectedItem = item;
          renderSidebar();
          renderContent();
        },
        selectedItem?.id
      );
      sidebar.appendChild(section);
    });
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "q7a-sidebar-add";
    addBtn.textContent = "+ Add page";
    addBtn.addEventListener("click", () => {
      const label = prompt("페이지 이름을 입력하세요");
      if (label?.trim()) {
        const id = "new_" + Date.now();
        if (!sidebarData["Q&A 데일리일기"]) sidebarData["Q&A 데일리일기"] = { icon: "❓", items: [] };
        sidebarData["Q&A 데일리일기"].items.push({ id, label, icon: "☀️" });
        saveSidebarData(sidebarData);
        renderSidebar();
      }
    });
    sidebar.appendChild(addBtn);
  }

  const content = document.createElement("main");
  content.className = "q7a-content";

  function renderContent() {
    content.innerHTML = "";
    if (selectedItem) {
      const h = document.createElement("h2");
      h.textContent = selectedItem.label;
      content.appendChild(h);
      const p = document.createElement("p");
      p.className = "q7a-content-placeholder";
      p.textContent = `${selectedItem.label} 내용 (준비 중)`;
      content.appendChild(p);
    } else {
      const empty = document.createElement("div");
      empty.className = "q7a-content-empty";
      empty.textContent = "왼쪽에서 항목을 선택하세요";
      content.appendChild(empty);
    }
  }

  renderSidebar();
  renderContent();

  layout.appendChild(sidebar);
  layout.appendChild(content);
  el.appendChild(layout);

  return el;
}
