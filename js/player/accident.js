// State "accident" (ROADMAP M2b, GDD §3.3/§3.5): the one thing only classic mode can do – drop both
// carabiners at once while up on something. There is no harness to catch this: the climber falls
// straight down, kinematically, to the terrain below, exactly as dramatic and exactly as final as
// GDD's "trockener Unfallbericht, keine Explosion" promises – no Rapier body, no pendulum, just gravity
// winning the argument. js/ui/accident-report.js owns the screen fade and the dry paperwork afterwards;
// this module only owns the fall itself and tells main.js when the ground has been reached.
import { ACCIDENT, PHYSICS } from "../config.js";

const GRAVITY = Math.abs(PHYSICS.gravity.y) * ACCIDENT.fallGravityScale;

/**
 * @param {{ terrain?: { heightAt(x:number,z:number): number }, camera?, events? }} options
 * @returns {object} a state for the player's state machine – register it with `player.addState("accident", …)`
 */
export function createAccidentState({ terrain = null, camera = null, events = null }) {
  let groundY = 0, velocity = 0, elapsed = 0, arrived = false;
  let cause = "bothCarabinersOpen";
  let elementLabel = null;
  let routeName = null;

  const state = {
    ownsMovement: true,
    get arrived() { return arrived; },
    get elapsed() { return elapsed; },
    get cause() { return cause; },
    get elementLabel() { return elementLabel; },

    /** `data.cause`/`data.elementLabel`/`data.routeName` are read straight back out for the accident
     *  report's form (js/ui/accident-report.js) via the events emitted below. */
    enter(player, data) {
      arrived = false;
      elapsed = 0;
      velocity = ACCIDENT.minFallSpeed;
      cause = (data && data.cause) || "bothCarabinersOpen";
      elementLabel = (data && data.elementLabel) || null;
      routeName = (data && data.routeName) || null;
      const h = terrain && typeof terrain.heightAt === "function" ? terrain.heightAt(player.position.x, player.position.z) : 0;
      groundY = Number.isFinite(h) ? h : 0;
      player.velocity.set(0, 0, 0);
      if (camera) camera.addShake(0.5);
      if (events) events.emit("player:accident-fall", { cause, elementLabel, routeName, from: { x: player.position.x, y: player.position.y, z: player.position.z } });
    },

    exit() {
      arrived = false;
    },

    update(player, dt) {
      if (arrived) return undefined;
      elapsed += dt;
      velocity = Math.min(40, velocity + GRAVITY * dt);
      const nextY = player.position.y - velocity * dt;
      if (nextY <= groundY) {
        player.moveTo(player.position.x, groundY, player.position.z);
        arrived = true;
        if (camera) camera.addShake(1);
        if (events) events.emit("player:accident-landed", { cause, elementLabel, routeName, seconds: elapsed });
      } else {
        player.moveTo(player.position.x, nextY, player.position.z);
      }
      return undefined;
    },
  };
  return state;
}
