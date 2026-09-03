const GUARD = "lp_reload_if_app_stale";
const GAP_MS = 60000;

let lastAt = 0;
let busy = false;

function currentJsFile() {
  try {
    for (const s of document.scripts) {
      const src = String(s.src || "");
      const i = src.lastIndexOf("/assets/");
      if (i >= 0 && src.includes(".js")) return src.slice(i).split("?")[0];
    }
  } catch (_) {}
  return "";
}

/** 화면 전환을 기다리지 않음. 새 화면이 있을 때만 뒤에서 한 번 다시 받음 */
export function checkLatestAppInBackground() {
  const now = Date.now();
  if (busy || now - lastAt < GAP_MS) return;
  try {
    if (sessionStorage.getItem(GUARD) === "1") {
      sessionStorage.removeItem(GUARD);
      lastAt = now;
      return;
    }
  } catch (_) {}
  const cur = currentJsFile();
  if (!cur) return;
  busy = true;
  lastAt = now;
  void fetch(`${location.origin}/?lp=${now}`, {
    cache: "reload",
    credentials: "same-origin",
  })
    .then((res) => (res && res.ok ? res.text() : ""))
    .then((html) => {
      const m = String(html).match(/\/assets\/[^"'>\s]+\.js/);
      const live = m ? m[0] : "";
      if (!live || cur.endsWith(live) || cur.includes(live.split("/").pop())) return;
      try {
        sessionStorage.setItem(GUARD, "1");
      } catch (_) {}
      location.reload();
    })
    .catch(() => {})
    .finally(() => {
      busy = false;
    });
}
