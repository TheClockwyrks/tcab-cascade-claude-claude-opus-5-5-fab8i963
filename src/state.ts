// Cascade — building and adjusting the state value.
//
// The opening state, the small immutable helpers every transaction uses, and
// the outbox through which a transaction raises a cue or asks for the mute bit
// to flip. Cues and mute belong to the engine and are reached only from
// `update`, so a transaction run from the debug surface queues them here and
// the next frame plays them.

import type { CueName } from "./constants";
import type { CardState, CascadeState } from "./game";
import { FOUNDATION_COUNT, TABLEAU_COLUMNS } from "./constants";

/** The id the first card of a fresh session takes. */
export const FIRST_ID = 1;

function emptyPiles(count: number): (readonly CardState[])[] {
  return Array.from({ length: count }, () => []);
}

/** The title-screen state: every declared field at its opening value. */
export function initialState(muted: boolean): CascadeState {
  return {
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,

    stock: [],
    waste: [],
    wasteSets: [],
    foundations: emptyPiles(FOUNDATION_COUNT),
    tableau: emptyPiles(TABLEAU_COLUMNS),

    drag: null,
    dropTarget: null,
    pointer: { x: 0, y: 0, down: false },
    lastPress: null,

    autoFlip: true,
    winDetect: true,
    launching: true,
    trailPainting: true,

    launchClock: 0,
    launched: 0,
    flyers: [],
    cascadeDone: false,
    trailStamps: 0,

    nextId: FIRST_ID,
    simTime: 0,
    muted,

    trail: [],
    launchTurn: 0,
    pressScreen: null,
    pendingCues: [],
    pendingMuteToggle: false,
  };
}

/** Queues a cue for the next frame, at most once per frame. */
export function raise(state: CascadeState, cue: CueName): CascadeState {
  if (state.pendingCues.includes(cue)) return state;
  return { ...state, pendingCues: [...state.pendingCues, cue] };
}

/** Replaces one entry of a list of piles. */
export function withPile(
  piles: readonly (readonly CardState[])[],
  index: number,
  pile: readonly CardState[],
): (readonly CardState[])[] {
  return piles.map((p, i) => (i === index ? pile : p));
}
