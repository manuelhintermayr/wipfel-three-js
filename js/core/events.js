// Minimal typed-by-convention event bus. Names: "player:fell", "route:completed", "belay:clip", …

export class Events {
  constructor() { this._map = new Map(); }
  on(name, fn) {
    if (!this._map.has(name)) this._map.set(name, new Set());
    this._map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  once(name, fn) {
    const off = this.on(name, (payload) => { off(); fn(payload); });
    return off;
  }
  off(name, fn) { const s = this._map.get(name); if (s) s.delete(fn); }
  emit(name, payload) {
    const s = this._map.get(name);
    if (!s) return;
    for (const fn of Array.from(s)) fn(payload);
  }
}

export const events = new Events();
