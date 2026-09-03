/**
 * 이미 켜 둔 앱 — 서버에 새 화면이 있으면 새로고침.
 * 앱을 다시 켤 때(화면이 다시 보일 때)만 확인한다.
 */

function currentBundleMark() {
  const srcs = [];
  document.querySelectorAll('script[src]').forEach((el) => {
    const src = String(el.getAttribute("src") || "").trim();
    if (src.includes("/assets/") || src.includes("/src/main.js")) srcs.push(src);
  });
  document.querySelectorAll('link[rel="stylesheet"][href]').forEach((el) => {
    const href = String(el.getAttribute("href") || "").trim();
    if (href.includes("/assets/") || href.includes("/src/main.css")) srcs.push(href);
  });
  return srcs.sort().join("|");
}

function bundleMarkFromHtml(html) {
  const found = [];
  const re =
    /(?:src|href)=["']([^"']*(?:\/assets\/[^"']+\.(?:js|css)|\/src\/main\.(?:js|css))[^"']*)["']/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const u = String(m[1] || "").trim();
    if (u) found.push(u);
  }
  return [...new Set(found)].sort().join("|");
}

function hasOpenBlockingModal() {
  const nodes = document.querySelectorAll(
    ".time-task-setup-modal, .time-task-log-modal, .lp-calendar-budget-add-modal, .lp-desktop-idea-modal",
  );
  for (const m of nodes) {
    if (!(m instanceof HTMLElement)) continue;
    if (m.hidden || m.hasAttribute("hidden")) continue;
    if (m.getAttribute("aria-hidden") === "true") continue;
    return true;
  }
  return false;
}

let checking = false;
let lastCheckAt = 0;
const CHECK_GAP_MS = 12000;

/** @returns {Promise<boolean>} 새로고침을 시작했으면 true */
export async function reloadIfAppShellUpdated() {
  if (checking) return false;
  if (hasOpenBlockingModal()) return false;
  const now = Date.now();
  if (now - lastCheckAt < CHECK_GAP_MS) return false;
  lastCheckAt = now;
  const here = currentBundleMark();
  if (!here) return false;
  checking = true;
  try {
    const res = await fetch(`/?lp-shell=${now}`, {
      cache: "reload",
      headers: { Accept: "text/html" },
    });
    if (!res.ok) return false;
    const there = bundleMarkFromHtml(await res.text());
    if (!there || there === here) return false;
    if (hasOpenBlockingModal()) return false;
    location.reload();
    return true;
  } catch (_) {
    return false;
  } finally {
    checking = false;
  }
}
