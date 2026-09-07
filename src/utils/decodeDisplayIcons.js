/**
 * 화면에 붙이기 전에 아이콘만 decode.
 * DOM 풀·Observer·칸 옮기기 없음.
 */

const decoded = new Set();
/** @type {Map<string, HTMLImageElement>} */
const decodedImgs = new Map();

/**
 * @param {unknown} srcs
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<void>}
 */
export function decodeDisplayIconSrcs(srcs, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs);
  const waitMs = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 800;
  const unique = [];
  const seen = new Set();
  for (const raw of Array.isArray(srcs) ? srcs : []) {
    const s = String(raw || "").trim();
    if (!s || seen.has(s) || decoded.has(s)) continue;
    seen.add(s);
    unique.push(s);
  }
  if (!unique.length) return Promise.resolve();

  return Promise.all(
    unique.map((src) =>
      withTimeout(decodeOne(src), waitMs)
        .then(() => {})
        .catch(() => {}),
    ),
  ).then(() => {});
}

/**
 * 이미 decode된 비트맵을 복제해 글자와 같이 붙인다.
 * @param {string} src
 * @returns {HTMLImageElement}
 */
function rememberDecodedImg(src, img) {
  const s = String(src || "").trim();
  if (!s || !img || img.naturalWidth <= 0) return;
  decoded.add(s);
  decodedImgs.set(s, img);
}

export function createReadyIconImg(src) {
  const s = String(src || "").trim();
  const cached = s ? decodedImgs.get(s) : null;
  if (cached && cached.naturalWidth > 0) {
    const clone = /** @type {HTMLImageElement} */ (cached.cloneNode(true));
    clone.alt = "";
    clone.decoding = "sync";
    clone.loading = "eager";
    if (!clone.getAttribute("src")) clone.src = s;
    return clone;
  }
  const img = document.createElement("img");
  img.alt = "";
  img.decoding = "sync";
  img.loading = "eager";
  if (s) {
    img.src = s;
    if (img.complete && img.naturalWidth > 0) {
      rememberDecodedImg(s, img);
    } else {
      img.addEventListener(
        "load",
        () => rememberDecodedImg(s, img),
        { once: true },
      );
    }
  }
  return img;
}

/**
 * 목록에 붙이기 전, 그 안의 img가 실제로 그려질 때까지 기다린다.
 * @param {ParentNode | Iterable<Element>} rootOrImgs
 * @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
export function waitIconImgsReady(rootOrImgs, timeoutMs = 1500) {
  /** @type {HTMLImageElement[]} */
  let imgs = [];
  if (rootOrImgs instanceof DocumentFragment || rootOrImgs instanceof Element) {
    imgs = [...rootOrImgs.querySelectorAll("img")];
  } else if (rootOrImgs && typeof rootOrImgs[Symbol.iterator] === "function") {
    imgs = [...rootOrImgs].filter((n) => n instanceof HTMLImageElement);
  }
  const pending = imgs.filter((img) =>
    String(img.currentSrc || img.getAttribute("src") || img.src || "").trim(),
  );
  if (!pending.length) return Promise.resolve();
  const waitMs = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 1500;
  return Promise.all(
    pending.map((img) => withTimeout(waitOneDomImg(img), waitMs).catch(() => {})),
  ).then(() => {});
}

/**
 * @param {HTMLImageElement} img
 * @returns {Promise<boolean>}
 */
function waitOneDomImg(img) {
  return new Promise((resolve) => {
    const done = () => resolve(true);
    const after = () => {
      if (typeof img.decode !== "function") {
        done();
        return;
      }
      img.decode().then(done).catch(done);
    };
    if (img.complete && img.naturalWidth > 0) {
      after();
      return;
    }
    img.addEventListener("load", after, { once: true });
    img.addEventListener("error", done, { once: true });
  });
}

/**
 * @param {string} src
 * @returns {Promise<boolean>}
 */
function decodeOne(src) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.decoding = "async";
      const done = (ok) => {
        if (ok && img.naturalWidth > 0) rememberDecodedImg(src, img);
        resolve(!!ok && img.naturalWidth > 0);
      };
      img.onerror = () => done(false);
      const afterLoad = () => {
        if (typeof img.decode !== "function") {
          done(img.naturalWidth > 0);
          return;
        }
        img
          .decode()
          .then(() => done(true))
          .catch(() => done(img.naturalWidth > 0));
      };
      img.onload = afterLoad;
      img.src = src;
      if (img.complete && img.naturalWidth > 0) afterLoad();
    } catch (_) {
      resolve(false);
    }
  });
}

/**
 * @param {Promise<boolean>} p
 * @param {number} ms
 * @returns {Promise<boolean>}
 */
function withTimeout(p, ms) {
  if (ms <= 0) return p;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(!!ok);
    };
    const t = setTimeout(() => finish(false), ms);
    p.then((ok) => {
      clearTimeout(t);
      finish(ok);
    }).catch(() => {
      clearTimeout(t);
      finish(false);
    });
  });
}
