// Tiny finite-state helper for the player. States are plain objects with optional hooks
// `enter(ctx, data)`, `exit(ctx)` and any number of custom hooks (e.g. `update`, `postMove`).
// A hook that returns a state name requests a transition; the machine performs it.
// Locomotion states today: "ground", "air". Hooks for later sessions: "ladder", "element",
// "fall", "zipline" – register them with `machine.add(name, state)`.

export const PLAYER_STATES = Object.freeze(["ground", "air", "ladder", "element", "fall", "zipline"]);

/**
 * @param {{ states: Record<string, object>, initial: string }} options
 */
export function createStateMachine({ states, initial }) {
  const table = { ...states };
  let current = null;
  let time = 0;

  const machine = {
    /** name of the active state */
    get current() { return current; },
    /** seconds spent in the active state */
    get time() { return time; },
    is(name) { return current === name; },
    has(name) { return Object.prototype.hasOwnProperty.call(table, name); },
    /** The state object itself – lets the owner read declarative flags such as `ownsMovement`. */
    get(name = current) { return table[name] || null; },

    /** Register (or replace) a state; used by later modes (ladder, element, …). */
    add(name, state) { table[name] = state; },

    /** Enter the initial state. Call once after construction. */
    start(ctx, data) { machine.set(initial, ctx, data); },

    /** Force a transition (exit current → enter next). */
    set(name, ctx, data) {
      const next = table[name];
      if (!next) throw new Error(`state machine: unknown state '${name}'`);
      if (current && table[current].exit) table[current].exit(ctx);
      current = name;
      time = 0;
      if (next.enter) next.enter(ctx, data);
    },

    /** Call `hook` on the active state; if it returns a different state name, transition to it. */
    dispatch(hook, ctx, ...args) {
      const state = table[current];
      if (!state || typeof state[hook] !== "function") return null;
      const requested = state[hook](ctx, ...args);
      if (typeof requested === "string" && requested !== current) machine.set(requested, ctx);
      return requested;
    },

    /** Advance the state timer (call once per fixed step). */
    tick(dt) { time += dt; },
  };
  return machine;
}
