/**
 * 브라우저 native title(호버 툴팁) 전역 차단.
 * title 속성·프로퍼티 설정을 data-lp-title-backup 으로만 옮기고,
 * 실제 title 은 남기지 않는다. (예외 없음)
 */

const BACKUP_ATTR = "data-lp-title-backup";

function stripTitleAttr(el) {
  if (!(el instanceof Element)) return;
  if (!el.hasAttribute("title")) return;
  const v = el.getAttribute("title");
  if (v != null && String(v) !== "" && !el.hasAttribute(BACKUP_ATTR)) {
    try {
      el.setAttribute(BACKUP_ATTR, String(v));
    } catch (_) {}
  }
  el.removeAttribute("title");
}

function stripTitlesInTree(root) {
  if (!(root instanceof Element)) return;
  stripTitleAttr(root);
  root.querySelectorAll?.("[title]")?.forEach(stripTitleAttr);
}

function installTitlePropertyBlock(proto) {
  if (!proto) return;
  try {
    Object.defineProperty(proto, "title", {
      configurable: true,
      enumerable: true,
      get() {
        return this.getAttribute?.(BACKUP_ATTR) || "";
      },
      set(value) {
        const s = value == null ? "" : String(value);
        if (s) {
          try {
            this.setAttribute?.(BACKUP_ATTR, s);
          } catch (_) {}
        } else {
          try {
            this.removeAttribute?.(BACKUP_ATTR);
          } catch (_) {}
        }
        try {
          this.removeAttribute?.("title");
        } catch (_) {}
      },
    });
  } catch (_) {}
}

function installSetAttributeBlock() {
  const nativeSetAttribute = Element.prototype.setAttribute;
  if (nativeSetAttribute.__lpNoTitleTips) return;
  function setAttributePatched(name, value) {
    if (String(name).toLowerCase() === "title") {
      const s = value == null ? "" : String(value);
      if (s) nativeSetAttribute.call(this, BACKUP_ATTR, s);
      else {
        try {
          this.removeAttribute(BACKUP_ATTR);
        } catch (_) {}
      }
      try {
        this.removeAttribute("title");
      } catch (_) {}
      return;
    }
    return nativeSetAttribute.call(this, name, value);
  }
  setAttributePatched.__lpNoTitleTips = true;
  Element.prototype.setAttribute = setAttributePatched;
}

/** 앱 부팅 시 1회 — 이후 추가·변경되는 title도 차단 */
export function installGlobalTitleTooltipSuppression() {
  if (typeof document === "undefined") return;
  if (document.documentElement.dataset.lpNoNativeTitleTips === "1") return;
  document.documentElement.dataset.lpNoNativeTitleTips = "1";

  installSetAttributeBlock();
  /* SVG의 title 은 자식 <title> 노드용이라 건드리지 않음 */
  installTitlePropertyBlock(
    typeof HTMLElement !== "undefined" ? HTMLElement.prototype : null,
  );

  stripTitlesInTree(document.documentElement);

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "title") {
        stripTitleAttr(m.target);
        continue;
      }
      if (m.type !== "childList") continue;
      m.addedNodes.forEach((n) => {
        if (n instanceof Element) stripTitlesInTree(n);
      });
    }
  });

  mo.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["title"],
  });
}
