// Cascade — the victory cascade (specs/victory.md).
//
// Flyers advance on every frame, whatever the screen, so a card put in flight
// from code flies by the same rules as one the cascade launched. The launch
// clock runs on the `won` screen alone, where the cascade lives.

import {
  BOUNCE_DAMP,
  CARD_W,
  CUES,
  FLOOR_Y,
  FOUNDATION_X,
  GRAVITY,
  LAUNCH_INTERVAL,
  LAUNCH_VX_MAX,
  LAUNCH_VX_MIN,
  LAUNCH_VY,
  STAGE_W,
  TOP_ROW_Y,
} from "./constants";
import type { CascadeState, FlyerState } from "./game";
import { raise, withPile } from "./state";
import type { TrailStamp } from "./types";

/** Absorbs the rounding a clock summed from many small deltas carries. */
const CLOCK_EPSILON = 1e-9;

/** One launch's horizontal speed: a uniform magnitude and an even-odds sign. */
export function drawLaunchVx(random: () => number = Math.random): number {
  const magnitude = LAUNCH_VX_MIN + random() * (LAUNCH_VX_MAX - LAUNCH_VX_MIN);
  return random() < 0.5 ? -magnitude : magnitude;
}

/** One flyer advanced by `dt`: gravity, motion, and the floor bounce. */
export function stepFlyer(flyer: FlyerState, dt: number): FlyerState {
  let vy = flyer.vy + GRAVITY * dt;
  const x = flyer.x + flyer.vx * dt;
  let y = flyer.y + vy * dt;
  if (y >= FLOOR_Y && vy > 0) {
    vy = -vy * BOUNCE_DAMP;
    y = FLOOR_Y;
  }
  return { ...flyer, x, y, vy };
}

export function isOffStage(flyer: FlyerState): boolean {
  return flyer.x + CARD_W < 0 || flyer.x > STAGE_W;
}

/** Advances every card in flight: move, bounce, paint, retire. */
function advanceFlyers(state: CascadeState, dt: number): CascadeState {
  if (state.flyers.length === 0) return state;
  const flyers: FlyerState[] = [];
  const stamps: TrailStamp[] = [];
  for (const flyer of state.flyers) {
    const moved = stepFlyer(flyer, dt);
    if (state.trailPainting) {
      stamps.push({
        suit: moved.suit,
        rank: moved.rank,
        x: moved.x,
        y: moved.y,
      });
    }
    if (!isOffStage(moved)) flyers.push(moved);
  }
  return {
    ...state,
    flyers,
    trail: stamps.length > 0 ? [...state.trail, ...stamps] : state.trail,
    trailStamps: state.trailStamps + stamps.length,
  };
}

/** Launches the top card of the next foundation in turn, if any card remains. */
function launchNext(state: CascadeState, random: () => number): CascadeState {
  const count = state.foundations.length;
  for (let step = 0; step < count; step++) {
    const f = (state.launchTurn + step) % count;
    const pile = state.foundations[f];
    const card = pile[pile.length - 1];
    if (card === undefined) continue;
    const flyer: FlyerState = {
      id: card.id,
      suit: card.suit,
      rank: card.rank,
      x: FOUNDATION_X[f],
      y: TOP_ROW_Y,
      vx: drawLaunchVx(random),
      vy: LAUNCH_VY,
    };
    return raise(
      {
        ...state,
        foundations: withPile(state.foundations, f, pile.slice(0, -1)),
        flyers: [...state.flyers, flyer],
        launched: state.launched + 1,
        launchTurn: (f + 1) % count,
      },
      CUES.launch,
    );
  }
  return state;
}

function cardsRemain(state: CascadeState): boolean {
  return state.foundations.some((pile) => pile.length > 0);
}

/** Runs the launch clock, launching a card for each interval it holds. */
function runLaunchClock(
  state: CascadeState,
  dt: number,
  random: () => number,
): CascadeState {
  let next: CascadeState = { ...state, launchClock: state.launchClock + dt };
  while (
    next.launchClock >= LAUNCH_INTERVAL - CLOCK_EPSILON &&
    cardsRemain(next)
  ) {
    next = launchNext(
      { ...next, launchClock: next.launchClock - LAUNCH_INTERVAL },
      random,
    );
  }
  return next;
}

/** One frame of the cascade: flyers first, then the launch clock, then the end test. */
export function stepCascade(
  state: CascadeState,
  dt: number,
  random: () => number = Math.random,
): CascadeState {
  let next = advanceFlyers(state, dt);
  if (next.screen !== "won") return next;
  if (next.launching) next = runLaunchClock(next, dt, random);
  if (
    !next.cascadeDone &&
    next.launched > 0 &&
    next.flyers.length === 0 &&
    !cardsRemain(next)
  ) {
    next = { ...next, cascadeDone: true };
  }
  return next;
}
