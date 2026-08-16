// Developer overlay (F1 / ?debug=1): fps, frame/physics ms, draw calls, triangles, bodies, seed, player.
// Separate from product UI; reads from a `probe()` function supplied by main.js.

export class DebugPanel {
  constructor(root, probe) {
    this.root = root;
    this.probe = probe;
    this.visible = false;
    this.el = document.createElement("div");
    this.el.className = "debug-panel";
    this.el.innerHTML = `<h2>Wipfel · debug (F1)</h2><dl></dl>`;
    this.dl = this.el.querySelector("dl");
    root.appendChild(this.el);
    this._acc = 0;
    this._rows = new Map();
  }

  toggle(force) {
    this.visible = force == null ? !this.visible : !!force;
    this.root.hidden = !this.visible;
  }

  /** Call every frame (ui phase); refreshes at ~8 Hz to stay cheap. */
  update(dt) {
    if (!this.visible) return;
    this._acc += dt;
    if (this._acc < 0.125) return;
    this._acc = 0;
    const data = this.probe();
    for (const [k, v] of Object.entries(data)) {
      let row = this._rows.get(k);
      if (!row) {
        const dt_ = document.createElement("dt"); dt_.textContent = k;
        const dd = document.createElement("dd");
        this.dl.append(dt_, dd);
        row = dd; this._rows.set(k, row);
      }
      row.textContent = String(v);
    }
  }
}
