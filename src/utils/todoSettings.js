/**
 * 할일목록 환경설정 - localStorage
 */
const TODO_SETTINGS_KEY = "todo-settings";

export const DEFAULT_SECTION_COLORS = {
  braindump: "rgba(196, 181, 253, 0.5)",
  happy: "rgba(253, 186, 116, 0.5)",
  dream: "rgba(147, 197, 253, 0.5)",
  sideincome: "rgba(190, 242, 100, 0.5)",
  health: "rgba(253, 164, 175, 0.5)",
};

/** 파스텔톤 고투명도 프리셋 */
export const PASTEL_PRESETS = [
  "rgba(255, 182, 193, 0.6)",
  "rgba(255, 218, 185, 0.6)",
  "rgba(255, 239, 213, 0.6)",
  "rgba(255, 228, 196, 0.6)",
  "rgba(221, 160, 221, 0.6)",
  "rgba(176, 224, 230, 0.6)",
  "rgba(173, 216, 230, 0.6)",
  "rgba(144, 238, 144, 0.6)",
  "rgba(152, 251, 152, 0.6)",
  "rgba(255, 255, 224, 0.6)",
  "rgba(255, 228, 181, 0.6)",
  "rgba(230, 230, 250, 0.6)",
];

export function getTodoSettings() {
  try {
    const raw = localStorage.getItem(TODO_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        hideCompleted: !!parsed.hideCompleted,
        sectionColors: { ...DEFAULT_SECTION_COLORS, ...parsed.sectionColors },
      };
    }
  } catch (_) {}
  return {
    hideCompleted: false,
    sectionColors: { ...DEFAULT_SECTION_COLORS },
  };
}

export function saveTodoSettings(settings) {
  try {
    localStorage.setItem(TODO_SETTINGS_KEY, JSON.stringify(settings));
  } catch (_) {}
}

export function getSectionColor(sectionId) {
  const s = getTodoSettings();
  return s.sectionColors[sectionId] || DEFAULT_SECTION_COLORS[sectionId] || "rgba(200, 200, 200, 0.5)";
}
