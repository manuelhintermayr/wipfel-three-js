// Tiny finite-state helper for the player. States are plain objects with optional hooks
// `enter(ctx, data)`, `exit(ctx)` and any number of custom hooks (e.g. `update`, `postMove`).
// A hook that returns a state name requests a transition; the machine performs it.
// Locomotion states today: "ground", "air". Hooks for later sessions: "ladder", "element",
// "fall", "zipline", "tarzan" – register them with `machine.add(name, state)`.

export const PLAYER_STATES = Object.freeze(["ground", "air", "ladder", "element", "fall", "zipline", "tarzan"]);

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

    /**
     * Call `hook` on the active state. A hook may request a transition by returning the next
     * state's name, or `{ state, data }` when the next state needs to be told something (which
     * element the climber just slipped off, where the rescue should put them down).
     */
    dispatch(hook, ctx, ...args) {
      const state = table[current];
      if (!state || typeof state[hook] !== "function") return null;
      const requested = state[hook](ctx, ...args);
      if (typeof requested === "string") {
        if (requested !== current) machine.set(requested, ctx);
        return requested;
      }
      if (requested && typeof requested === "object" && typeof requested.state === "string") {
        if (requested.state !== current) machine.set(requested.state, ctx, requested.data);
        return requested.state;
      }
      return requested;
    },

    /** Advance the state timer (call once per fixed step). */
    tick(dt) { time += dt; },
  };
  return machine;
}
