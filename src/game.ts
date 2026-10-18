// Cascade — the game.
//
// This module declares the state contract (specs/state.md) and the debug and
// automation surface (specs/instrumentation.md), and binds the three functions
// the engine drives. The rules live beside it under `src/`: `rules.ts` holds
// the transactions of play, `input.ts` the pointer and the menus, `cascade.ts`
// the victory cascade, `debug.ts` the surface, and `render/` the drawing. The
// simulation reads nothing from the renderer.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { stepCascade } from "./cascade";
import {
  MENU_BACK,
  MENU_BINDINGS,
  MENU_CONFIRM,
  MENU_DOWN,
  MENU_UP,
  type CueName,
} from "./constants";
import { defineCues } from "./audio";
import { createDebugApi } from "./debug";
import { registerDiagnostics } from "./diagnostics";
import {
  computeDropTarget,
  menuKeys,
  pointerDown,
  pointerMove,
  pointerUp,
} from "./input";
import { renderGame } from "./render/scene";
import { checkWin } from "./rules";
import { initialState } from "./state";
import type { TrailStamp } from "./types";

// ---- The state (specs/state.md) --------------------------------------------

export type Screen = "title" | "howto" | "playing" | "won";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export type PileKind = "stock" | "waste" | "foundation" | "tableau";

export interface CardState {
  readonly id: number;
  readonly suit: Suit;
  readonly rank: number;
  readonly faceUp: boolean;
}

export interface DragState {
  readonly cards: readonly CardState[];
  readonly fromPile: "waste" | "foundation" | "tableau";
  readonly fromIndex: number;
  readonly x: number;
  readonly y: number;
}

export interface DropTargetState {
  readonly pile: "foundation" | "tableau";
  readonly index: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
}

export interface PressState {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

export interface FlyerState {
  readonly id: number;
  readonly suit: Suit;
  readonly rank: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

export interface CascadeState {
  readonly screen: Screen;
  readonly menuIndex: number;
  readonly titleIndex: number;

  readonly stock: readonly CardState[];
  readonly waste: readonly CardState[];
  readonly wasteSets: readonly number[];
  readonly foundations: readonly (readonly CardState[])[];
  readonly tableau: readonly (readonly CardState[])[];

  readonly drag: DragState | null;
  readonly dropTarget: DropTargetState | null;
  readonly pointer: PointerState;
  readonly lastPress: PressState | null;

  readonly autoFlip: boolean;
  readonly winDetect: boolean;
  readonly launching: boolean;
  readonly trailPainting: boolean;

  readonly launchClock: number;
  readonly launched: number;
  readonly flyers: readonly FlyerState[];
  readonly cascadeDone: boolean;
  readonly trailStamps: number;

  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;
}

/**
 * The build's own fields, merged into the declaration above. None of them is
 * authoritative game state: `trail` is the painted layer's drawing resource,
 * and the rest are the bookkeeping of a frame in progress — the foundation
 * whose turn the cascade's next launch takes, the screen the current gesture
 * began on, and the cues and the mute flip a transaction raised for the next
 * `update` to hand the engine. `reset` returns every one of them to rest.
 */
export interface CascadeState {
  readonly trail: readonly TrailStamp[];
  readonly launchTurn: number;
  readonly pressScreen: Screen | null;
  readonly pendingCues: readonly CueName[];
  readonly pendingMuteToggle: boolean;
}

// ---- The debug surface (specs/instrumentation.md) ---------------------------

/** A card as the snapshot reports it. */
export interface CardSnapshot {
  readonly id: number;
  readonly suit: Suit;
  readonly rank: number;
  readonly color: "red" | "black";
  readonly faceUp: boolean;
}

/** The object `snapshot` returns. */
export interface CascadeSnapshot {
  readonly version: number;
  readonly screen: Screen;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly dealMode: string;
  readonly turnCount: number;
  readonly dealModeLabel: string;
  readonly muted: boolean;

  readonly autoFlip: boolean;
  readonly winDetect: boolean;
  readonly launching: boolean;
  readonly trailPainting: boolean;

  readonly stock: CardSnapshot[];
  readonly waste: CardSnapshot[];
  readonly wasteSets: number[];
  readonly wasteVisibleCount: number;
  readonly foundations: CardSnapshot[][];
  readonly tableau: CardSnapshot[][];

  readonly drag: {
    readonly cards: CardSnapshot[];
    readonly fromPile: "waste" | "foundation" | "tableau";
    readonly fromIndex: number;
    readonly x: number;
    readonly y: number;
  } | null;
  readonly dropTarget: {
    readonly pile: "foundation" | "tableau";
    readonly index: number;
  } | null;

  readonly pointer: {
    readonly x: number;
    readonly y: number;
    readonly down: boolean;
  };
  readonly lastPress: {
    readonly x: number;
    readonly y: number;
    readonly at: number;
  } | null;

  readonly launchClock: number;
  readonly launched: number;
  readonly flyers: {
    readonly id: number;
    readonly suit: Suit;
    readonly rank: number;
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
  }[];
  readonly cascadeDone: boolean;
  readonly trailStamps: number;

  readonly simTime: number;
}

/** A menu item's hit region in logical units. */
export interface MenuItemRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

type View = DeepReadonly<CascadeState>;

/**
 * The debug and automation surface. Every pose takes the current state and
 * returns the next; every reading takes the state and returns what it read;
 * `move` and `autoMove` return the next state beside the rules' verdict.
 */
export interface CascadeDebugApi {
  readonly version: number;

  reset(state: View): CascadeState;
  snapshot(state: View): CascadeSnapshot;
  reconcile(state: View): CascadeState;
  menuItemRect(state: View, index: number): MenuItemRect | null;

  setScreen(state: View, screen: Screen): CascadeState;
  setMenuIndex(state: View, index: number): CascadeState;
  setTitleIndex(state: View, index: number): CascadeState;

  addCard(
    state: View,
    pile: PileKind,
    index: number,
    suit: Suit,
    rank: number,
    faceUp: boolean,
  ): CascadeState;
  removeCard(state: View, id: number): CascadeState;
  setCardFaceUp(state: View, id: number, faceUp: boolean): CascadeState;
  clearPile(state: View, pile: PileKind, index: number): CascadeState;
  clearTable(state: View): CascadeState;

  addWasteSet(state: View, count: number): CascadeState;
  clearWasteSets(state: View): CascadeState;

  deal(state: View): CascadeState;
  turnStock(state: View): CascadeState;
  move(
    state: View,
    fromPile: PileKind,
    fromIndex: number,
    fromRow: number,
    toPile: PileKind,
    toIndex: number,
  ): [CascadeState, boolean];
  autoMove(state: View, pile: PileKind, index: number): [CascadeState, boolean];

  pointerDown(state: View, x: number, y: number): CascadeState;
  pointerMove(state: View, x: number, y: number): CascadeState;
  pointerUp(state: View, x: number, y: number): CascadeState;

  setAutoFlip(state: View, enabled: boolean): CascadeState;
  setWinDetect(state: View, enabled: boolean): CascadeState;
  setLaunching(state: View, enabled: boolean): CascadeState;
  setTrailPainting(state: View, enabled: boolean): CascadeState;

  addFlyer(
    state: View,
    suit: Suit,
    rank: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): CascadeState;
  setFlyerPosition(state: View, id: number, x: number, y: number): CascadeState;
  setFlyerVelocity(
    state: View,
    id: number,
    vx: number,
    vy: number,
  ): CascadeState;
  removeFlyer(state: View, id: number): CascadeState;
  clearFlyers(state: View): CascadeState;
  setLaunchClock(state: View, seconds: number): CascadeState;
  clearTrail(state: View): CascadeState;
  drawLaunchVx(state: View): number;
}

// ---- The game ---------------------------------------------------------------

/** The felt the table is laid on, and the letterbox around it. */
export const BACKGROUND = "#0b3327";

/** Answers every primary pointer sample the frame delivered, in order. */
function answerPointer(state: CascadeState, api: UpdateApi): CascadeState {
  let next = state;
  for (const sample of api.input.pointerSamples()) {
    if (!sample.primary) continue;
    const primaryEdge = sample.button === null || sample.button === "primary";
    if (sample.type === "down" && primaryEdge) {
      next = pointerDown(next, sample.x, sample.y);
    } else if (sample.type === "up" && primaryEdge) {
      next = pointerUp(next, sample.x, sample.y);
    } else {
      next = pointerMove(next, sample.x, sample.y);
    }
  }
  return next;
}

/** Hands the engine what the frame's transactions raised, then mirrors mute. */
function flushOutbox(state: CascadeState, api: UpdateApi): CascadeState {
  if (state.pendingMuteToggle) api.audio.setMuted(!api.audio.muted());
  for (const cue of state.pendingCues) api.audio.play(cue);
  return {
    ...state,
    pendingCues: [],
    pendingMuteToggle: false,
    muted: api.audio.muted(),
  };
}

export const game: Game<CascadeState, CascadeDebugApi> = {
  initialize(api: InitApi<CascadeState>): [CascadeState, CascadeDebugApi] {
    for (const [name, keys] of Object.entries(MENU_BINDINGS)) {
      api.input.register(name, { keys: [...keys] });
    }
    defineCues(api);
    registerDiagnostics(api);
    return [initialState(false), createDebugApi()];
  },

  update(state: View, api: UpdateApi, dt: number): CascadeState {
    let next: CascadeState = { ...state, simTime: state.simTime + dt };
    next = answerPointer(next, api);

    const keys = {
      up: api.input.pressed(MENU_UP),
      down: api.input.pressed(MENU_DOWN),
      confirm: api.input.pressed(MENU_CONFIRM),
      back: api.input.pressed(MENU_BACK),
    };
    next = menuKeys(next, keys);

    if (next.screen === "playing") next = checkWin(next);
    next = stepCascade(next, dt);
    if (next.drag !== null)
      next = { ...next, dropTarget: computeDropTarget(next) };
    return flushOutbox(next, api);
  },

  render(state: View, api: RenderApi): void {
    renderGame(api.ctx, state);
  },
};
