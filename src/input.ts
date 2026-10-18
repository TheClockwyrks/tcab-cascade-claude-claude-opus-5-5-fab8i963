// Cascade — the pointer and the menus (specs/controls.md, specs/screens.md).
//
// One press, move, or release at a time, each answered on its own. The engine's
// pointer samples and the debug surface's pointer operations both arrive here,
// so a posed press and a player's press are the same event.

import {
  CUES,
  CARD_H,
  CARD_W,
  DOUBLE_CLICK_SLOP,
  DOUBLE_CLICK_WINDOW,
  DRAG_THRESHOLD,
} from "./constants";
import type { CascadeState, DropTargetState } from "./game";
import {
  cardAt,
  contains,
  dropRect,
  menuItemAt,
  menuItems,
  pileAt,
} from "./layout";
import {
  accepts,
  landRun,
  liftRun,
  playableRow,
  returnRun,
  sendHome,
  startGame,
  turnStock,
  type Lift,
} from "./rules";
import { raise } from "./state";
import type { PileRef } from "./types";

// ---- The run in hand -------------------------------------------------------

function heldLift(state: CascadeState): Lift | null {
  const drag = state.drag;
  if (drag === null) return null;
  return {
    from: { pile: drag.fromPile, index: drag.fromIndex },
    cards: drag.cards,
  };
}

/** The pile a release would resolve the held run to, judged by its leading card's center. */
function releasePile(state: CascadeState): PileRef | null {
  const drag = state.drag;
  if (drag === null) return null;
  return pileAt(state, drag.x + CARD_W / 2, drag.y + CARD_H / 2);
}

/** The pile that would accept the held run on release, or `null`. */
export function computeDropTarget(state: CascadeState): DropTargetState | null {
  const lift = heldLift(state);
  const target = releasePile(state);
  if (lift === null || target === null) return null;
  if (target.pile !== "foundation" && target.pile !== "tableau") return null;
  if (!accepts(state, lift.from, target, lift.cards)) return null;
  return { pile: target.pile, index: target.index };
}

function withDropTarget(state: CascadeState): CascadeState {
  return { ...state, dropTarget: computeDropTarget(state) };
}

/** Returns any held run to its pile, exactly as it was lifted. */
export function returnHeld(state: CascadeState): CascadeState {
  const lift = heldLift(state);
  if (lift === null) return state;
  return { ...returnRun(state, lift), drag: null, dropTarget: null };
}

// ---- Menus -----------------------------------------------------------------

/** Activates item `index` of the current screen's menu. */
export function activate(
  state: CascadeState,
  index: number,
  random: () => number = Math.random,
): CascadeState {
  switch (state.screen) {
    case "title":
      if (index === 0) return { ...startGame(state, random), titleIndex: 0 };
      if (index === 1)
        return { ...state, screen: "howto", menuIndex: 0, titleIndex: 1 };
      return state;
    case "howto":
      return index === 0
        ? { ...state, screen: "title", menuIndex: state.titleIndex }
        : state;
    case "playing":
      if (index === 0) return startGame(returnHeld(state), random);
      if (index === 1) {
        return {
          ...returnHeld(state),
          screen: "title",
          menuIndex: state.titleIndex,
        };
      }
      if (index === 2)
        return { ...state, pendingMuteToggle: !state.pendingMuteToggle };
      return state;
    case "won":
      return state;
  }
}

/** The four menu edges a frame delivered. */
export interface MenuKeys {
  readonly up: boolean;
  readonly down: boolean;
  readonly confirm: boolean;
  readonly back: boolean;
}

function wrap(index: number, count: number): number {
  return ((index % count) + count) % count;
}

/** Applies a frame's menu keys: up before down, movement before confirm. */
export function menuKeys(
  state: CascadeState,
  keys: MenuKeys,
  random: () => number = Math.random,
): CascadeState {
  const screen = state.screen;
  if (screen === "won") return state;
  const count = menuItems(screen).length;
  if (keys.up || keys.down) {
    if (screen === "howto") return state;
    return {
      ...state,
      menuIndex: wrap(state.menuIndex + (keys.up ? -1 : 1), count),
    };
  }
  if (keys.confirm)
    return activate(state, screen === "howto" ? 0 : state.menuIndex, random);
  if (keys.back && screen === "howto") return activate(state, 0, random);
  return state;
}

/** Selects the menu item under the pointer, if any. */
function hover(state: CascadeState, x: number, y: number): CascadeState {
  const item = menuItemAt(state.screen, x, y);
  return item < 0 || item === state.menuIndex
    ? state
    : { ...state, menuIndex: item };
}

// ---- The gesture -----------------------------------------------------------

function isDoubleClick(state: CascadeState, x: number, y: number): boolean {
  const last = state.lastPress;
  return (
    last !== null &&
    state.simTime - last.at <= DOUBLE_CLICK_WINDOW &&
    Math.hypot(x - last.x, y - last.y) <= DOUBLE_CLICK_SLOP
  );
}

/** A press: a lift, a double click home, a deal from `won`, or a menu selection. */
export function pointerDown(
  state: CascadeState,
  x: number,
  y: number,
  random: () => number = Math.random,
): CascadeState {
  // A press that arrives while a run is still in hand ends that gesture first.
  const settled = returnHeld(state);
  const pressed: CascadeState = {
    ...settled,
    pointer: { x, y, down: true },
    lastPress: { x, y, at: settled.simTime },
    pressScreen: settled.screen,
  };
  if (settled.screen === "won") {
    // The deal answers the press, so the release that follows belongs to `won`.
    return startGame(pressed, random);
  }
  if (settled.screen !== "playing") return hover(pressed, x, y);

  const selected = hover(pressed, x, y);
  const hit = cardAt(settled, x, y);
  if (hit === null || hit.pile === "stock") return selected;

  if (hit.pile !== "foundation" && isDoubleClick(settled, x, y)) {
    const ref = { pile: hit.pile, index: hit.index };
    if (playableRow(settled, ref) === hit.row)
      return sendHome(selected, ref)[0];
  }

  const lifted = liftRun(selected, hit, hit.row);
  if (lifted === null) return selected;
  const [without, lift] = lifted;
  const held: CascadeState = {
    ...without,
    drag: {
      cards: lift.cards,
      fromPile: lift.from.pile,
      fromIndex: lift.from.index,
      x: hit.x,
      y: hit.y,
    },
  };
  return raise(withDropTarget(held), CUES.lift);
}

/** A move: the held run travels with the pointer, and menus follow it. */
export function pointerMove(
  state: CascadeState,
  x: number,
  y: number,
): CascadeState {
  const dx = x - state.pointer.x;
  const dy = y - state.pointer.y;
  let next: CascadeState = { ...state, pointer: { ...state.pointer, x, y } };
  if (next.drag !== null) {
    next = withDropTarget({
      ...next,
      drag: { ...next.drag, x: next.drag.x + dx, y: next.drag.y + dy },
    });
  }
  return next.screen === "won" ? next : hover(next, x, y);
}

/** A release: a click or a drop, and any control both edges landed in. */
export function pointerUp(
  state: CascadeState,
  x: number,
  y: number,
  random: () => number = Math.random,
): CascadeState {
  const moved = pointerMove(state, x, y);
  let next: CascadeState = {
    ...moved,
    pointer: { x, y, down: false },
    pressScreen: null,
  };
  const press = next.lastPress;
  if (
    press === null ||
    state.pressScreen !== next.screen ||
    next.screen === "won"
  ) {
    return returnHeld(next);
  }

  const click = Math.hypot(x - press.x, y - press.y) <= DRAG_THRESHOLD;
  if (next.screen === "playing") {
    const lift = heldLift(next);
    if (click) {
      next = returnHeld(next);
      if (
        contains(dropRect(next, { pile: "stock", index: 0 }), press.x, press.y)
      ) {
        next = turnStock(next);
      }
    } else if (lift !== null) {
      const target = releasePile(next);
      const cleared: CascadeState = { ...next, drag: null, dropTarget: null };
      next = landRun(cleared, lift, target, "drop")[0];
    }
  }

  const item = menuItemAt(state.screen, press.x, press.y);
  if (
    item >= 0 &&
    item === menuItemAt(state.screen, x, y) &&
    next.screen === state.screen
  ) {
    next = activate({ ...next, menuIndex: item }, item, random);
  }
  return next;
}
