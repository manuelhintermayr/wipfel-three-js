// No silent failures: fatal screen for init errors, organised console output.

const TAG = "%c[wipfel]";
const STYLE = "color:#79b893;font-weight:600";

export const log = {
  info: (...a) => console.info(TAG, STYLE, ...a),
  warn: (...a) => console.warn(TAG, STYLE, ...a),
  error: (...a) => console.error(TAG, STYLE, ...a),
};

/** Show a readable full-screen error and stop the game. */
export function showFatal(title, err, hint = "") {
  const root = document.getElementById("fatal");
  if (!root) { alert(`${title}\n${err}`); return; }
  const detail = err && err.stack ? err.stack : String(err);
  root.innerHTML = "";
  const box = document.createElement("div");
  box.className = "fatal-box";
  box.innerHTML = `
    <div class="fatal-inner">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(hint || "The game cannot start in this browser/session. Details below.")}</p>
      <pre>${escapeHtml(detail)}</pre>
      <p><button type="button" id="fatal-reload">Reload</button></p>
    </div>`;
  root.appendChild(box);
  root.hidden = false;
  const btn = document.getElementById("fatal-reload");
  if (btn) btn.addEventListener("click", () => location.reload());
  log.error(title, err);
}

export function installGlobalHandlers() {
  window.addEventListener("error", (e) => {
    if (e.error && e.error.__wipfelHandled) return;
    log.error("Uncaught error:", e.error || e.message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    log.error("Unhandled rejection:", e.reason);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
