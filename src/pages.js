export function showOnly(pageId) {
  if (pageId !== "login") {
    const m = document.getElementById("auth-pw-recovery-modal");
    if (m) {
      m.setAttribute("hidden", "");
      m.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("auth-pw-modal-open");
  }
  const pages = document.querySelectorAll("#app > .page");
  pages.forEach((p) => {
    if (p.id === pageId + "-page") {
      p.style.display = p.classList.contains("login-page") ? "flex" : "block";
    } else {
      p.style.display = "none";
    }
  });
}
