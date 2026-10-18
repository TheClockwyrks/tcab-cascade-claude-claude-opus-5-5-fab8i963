// Cascade — the debug and automation surface (specs/instrumentation.md).
//
// Every operation takes the state the engine holds and returns what it made of
// it. Poses set one element of the state; the game's own events route through
// exactly the code a player's gesture does; and a call naming nothing the game
// can act on throws rather than returning the state unchanged.

import type { DeepReadonly } from "ts-essentials";
import {
  CASCADE_DEBUG_VERSION,
  DEAL_MODE,
  DEAL_MODE_LABEL,
  FOUNDATION_COUNT,
  TABLEAU_COLUMNS,
  TITLE_ITEMS,
  TURN_COUNT,
} from "./constants";
import { isRank, isSuit, suitColor } from "./cards";
import { drawLaunchVx } from "./cascade";
import type {
  CardSnapshot,
  CardState,
  CascadeDebugApi,
  CascadeSnapshot,
  CascadeState,
  PileKind,
  Screen,
  Suit,
} from "./game";
import {
  computeDropTarget,
  pointerDown,
  pointerMove,
  pointerUp,
} from "./input";
import { menuRect } from "./layout";
import {
  dealTable,
  pileCards,
  sendHome,
  setPileCards,
  spendWasteSets,
  tryMove,
  turnStock,
} from "./rules";
import { initialState } from "./state";
import type { PileRef } from "./types";

type View = DeepReadonly<CascadeState>;

const SCREENS: readonly Screen[] = ["title", "howto", "playing", "won"];

function fail(message: string): never {
  throw new Error(`Cascade debug: ${message}`);
}

/** The engine hands every operation a read-only view; the rules read it as the state. */
function own(state: View): CascadeState {
  return state as CascadeState;
}

function requireWhole(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail(`${what} must be a whole number, got ${String(value)}`);
  }
  return value;
}

function requireFinite(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${what} must be a finite number, got ${String(value)}`);
  }
  return value;
}

function requireBoolean(value: unknown, what: string): boolean {
  if (typeof value !== "boolean")
    fail(`${what} must be a boolean, got ${String(value)}`);
  return value;
}

function requireSuit(value: unknown): Suit {
  if (!isSuit(value)) fail(`no such suit: ${String(value)}`);
  return value;
}

function requireRank(value: unknown): number {
  if (!isRank(value)) fail(`no such rank: ${String(value)}`);
  return value;
}

/** Validates a pile address, throwing when it names no pile. */
function requirePile(pile: unknown, index: unknown): PileRef {
  const counts: Record<PileKind, number> = {
    stock: 1,
    waste: 1,
    foundation: FOUNDATION_COUNT,
    tableau: TABLEAU_COLUMNS,
  };
  if (typeof pile !== "string" || !(pile in counts))
    fail(`no such pile: ${String(pile)}`);
  const kind = pile as PileKind;
  if (
    typeof index !== "number" ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= counts[kind]
  ) {
    fail(`no ${kind} pile at index ${String(index)}`);
  }
  return { pile: kind, index };
}

function cardSnapshot(card: DeepReadonly<CardState>): CardSnapshot {
  return {
    id: card.id,
    suit: card.suit,
    rank: card.rank,
    color: suitColor(card.suit),
    faceUp: card.faceUp,
  };
}

function piles(state: CascadeState): PileRef[] {
  const refs: PileRef[] = [
    { pile: "stock", index: 0 },
    { pile: "waste", index: 0 },
  ];
  for (let i = 0; i < state.foundations.length; i++)
    refs.push({ pile: "foundation", index: i });
  for (let i = 0; i < state.tableau.length; i++)
    refs.push({ pile: "tableau", index: i });
  return refs;
}

/** Applies `change` to the card with `id`, wherever it lies; throws when none does. */
function editCard(
  state: CascadeState,
  id: unknown,
  change: (cards: readonly CardState[], at: number) => readonly CardState[],
): CascadeState {
  for (const ref of piles(state)) {
    const cards = pileCards(state, ref);
    const at = cards.findIndex((card) => card.id === id);
    if (at >= 0) return setPileCards(state, ref, change(cards, at));
  }
  const drag = state.drag;
  const at =
    drag === null ? -1 : drag.cards.findIndex((card) => card.id === id);
  if (drag !== null && at >= 0) {
    const cards = change(drag.cards, at);
    return { ...state, drag: cards.length > 0 ? { ...drag, cards } : null };
  }
  return fail(`no card on the table has id ${String(id)}`);
}

function wastePileOf(state: CascadeState, id: unknown): boolean {
  return state.waste.some((card) => card.id === id);
}

function requireFlyer(state: CascadeState, id: unknown): number {
  const at = state.flyers.findIndex((flyer) => flyer.id === id);
  if (at < 0) fail(`no flyer has id ${String(id)}`);
  return at;
}

export function snapshot(view: View): CascadeSnapshot {
  const state = own(view);
  const drag = state.drag;
  const sets = state.wasteSets;
  return {
    version: CASCADE_DEBUG_VERSION,
    screen: state.screen,
    menuIndex: state.menuIndex,
    titleIndex: state.titleIndex,
    dealMode: DEAL_MODE,
    turnCount: TURN_COUNT,
    dealModeLabel: DEAL_MODE_LABEL,
    muted: state.muted,

    autoFlip: state.autoFlip,
    winDetect: state.winDetect,
    launching: state.launching,
    trailPainting: state.trailPainting,

    stock: state.stock.map(cardSnapshot),
    waste: state.waste.map(cardSnapshot),
    wasteSets: sets.slice(),
    wasteVisibleCount: sets.length === 0 ? 0 : sets[sets.length - 1],
    foundations: state.foundations.map((pile) => pile.map(cardSnapshot)),
    tableau: state.tableau.map((pile) => pile.map(cardSnapshot)),

    drag:
      drag === null
        ? null
        : {
            cards: drag.cards.map(cardSnapshot),
            fromPile: drag.fromPile,
            fromIndex: drag.fromIndex,
            x: drag.x,
            y: drag.y,
          },
    dropTarget: computeDropTarget(state),

    pointer: { ...state.pointer },
    lastPress: state.lastPress === null ? null : { ...state.lastPress },

    launchClock: state.launchClock,
    launched: state.launched,
    flyers: state.flyers.map((flyer) => ({ ...flyer })),
    cascadeDone: state.cascadeDone,
    trailStamps: state.trailStamps,

    simTime: state.simTime,
  };
}

function setGate(
  key: "autoFlip" | "winDetect" | "launching" | "trailPainting",
): (view: View, enabled: boolean) => CascadeState {
  return (view, enabled) => ({
    ...own(view),
    [key]: requireBoolean(enabled, key),
  });
}

export function createDebugApi(): CascadeDebugApi {
  return {
    version: CASCADE_DEBUG_VERSION,

    // ---- The core ----------------------------------------------------------

    reset: (view) => initialState(own(view).muted),
    snapshot,
    reconcile: (view) => {
      const state = own(view);
      const dropTarget = computeDropTarget(state);
      const same =
        dropTarget === state.dropTarget ||
        (dropTarget !== null &&
          state.dropTarget !== null &&
          dropTarget.pile === state.dropTarget.pile &&
          dropTarget.index === state.dropTarget.index);
      return same ? state : { ...state, dropTarget };
    },
    menuItemRect: (view, index) => {
      const rect = menuRect(own(view).screen, index);
      return rect === null ? null : { ...rect };
    },

    // ---- The screen and the menus -----------------------------------------

    setScreen: (view, screen) => {
      if (!SCREENS.includes(screen)) fail(`no such screen: ${String(screen)}`);
      return { ...own(view), screen };
    },
    setMenuIndex: (view, index) => ({
      ...own(view),
      menuIndex: requireWhole(index, "menu index"),
    }),
    setTitleIndex: (view, index) => {
      const titleIndex = requireWhole(index, "title index");
      if (titleIndex >= TITLE_ITEMS.length)
        fail(`no title item at index ${titleIndex}`);
      return { ...own(view), titleIndex };
    },

    // ---- The cards --------------------------------------------------------

    addCard: (view, pile, index, suit, rank, faceUp) => {
      const state = own(view);
      const ref = requirePile(pile, index);
      const card: CardState = {
        id: state.nextId,
        suit: requireSuit(suit),
        rank: requireRank(rank),
        faceUp: requireBoolean(faceUp, "faceUp"),
      };
      return {
        ...setPileCards(state, ref, [...pileCards(state, ref), card]),
        nextId: state.nextId + 1,
      };
    },
    removeCard: (view, id) => {
      const state = own(view);
      const fromWaste = wastePileOf(state, id);
      const next = editCard(state, id, (cards, at) => [
        ...cards.slice(0, at),
        ...cards.slice(at + 1),
      ]);
      return fromWaste
        ? { ...next, wasteSets: spendWasteSets(next.wasteSets, 1) }
        : next;
    },
    setCardFaceUp: (view, id, faceUp) => {
      const up = requireBoolean(faceUp, "faceUp");
      return editCard(own(view), id, (cards, at) =>
        cards.map((card, i) => (i === at ? { ...card, faceUp: up } : card)),
      );
    },
    clearPile: (view, pile, index) => {
      const ref = requirePile(pile, index);
      const cleared = setPileCards(own(view), ref, []);
      return ref.pile === "waste" ? { ...cleared, wasteSets: [] } : cleared;
    },
    clearTable: (view) => {
      const state = own(view);
      return {
        ...state,
        stock: [],
        waste: [],
        wasteSets: [],
        foundations: state.foundations.map(() => []),
        tableau: state.tableau.map(() => []),
        drag: null,
        dropTarget: null,
      };
    },

    // ---- The waste's sets -------------------------------------------------

    addWasteSet: (view, count) => {
      const state = own(view);
      return {
        ...state,
        wasteSets: [...state.wasteSets, requireWhole(count, "count")],
      };
    },
    clearWasteSets: (view) => ({ ...own(view), wasteSets: [] }),

    // ---- The game's own events --------------------------------------------

    deal: (view) => dealTable(own(view)),
    turnStock: (view) => turnStock(own(view)),
    move: (view, fromPile, fromIndex, fromRow, toPile, toIndex) => {
      const state = own(view);
      const from = requirePile(fromPile, fromIndex);
      const to = requirePile(toPile, toIndex);
      const row = requireWhole(fromRow, "fromRow");
      if (row >= pileCards(state, from).length) {
        fail(`${from.pile} ${from.index} holds no card at row ${row}`);
      }
      return tryMove(state, from, row, to);
    },
    autoMove: (view, pile, index) =>
      sendHome(own(view), requirePile(pile, index)),

    // ---- The pointer ------------------------------------------------------

    pointerDown: (view, x, y) =>
      pointerDown(own(view), requireFinite(x, "x"), requireFinite(y, "y")),
    pointerMove: (view, x, y) =>
      pointerMove(own(view), requireFinite(x, "x"), requireFinite(y, "y")),
    pointerUp: (view, x, y) =>
      pointerUp(own(view), requireFinite(x, "x"), requireFinite(y, "y")),

    // ---- The faculty gates ------------------------------------------------

    setAutoFlip: setGate("autoFlip"),
    setWinDetect: setGate("winDetect"),
    setLaunching: setGate("launching"),
    setTrailPainting: setGate("trailPainting"),

    // ---- The cascade ------------------------------------------------------

    addFlyer: (view, suit, rank, x, y, vx, vy) => {
      const state = own(view);
      const flyer = {
        id: state.nextId,
        suit: requireSuit(suit),
        rank: requireRank(rank),
        x: requireFinite(x, "x"),
        y: requireFinite(y, "y"),
        vx: requireFinite(vx, "vx"),
        vy: requireFinite(vy, "vy"),
      };
      return {
        ...state,
        flyers: [...state.flyers, flyer],
        nextId: state.nextId + 1,
      };
    },
    setFlyerPosition: (view, id, x, y) => {
      const state = own(view);
      const at = requireFlyer(state, id);
      const px = requireFinite(x, "x");
      const py = requireFinite(y, "y");
      return {
        ...state,
        flyers: state.flyers.map((f, i) =>
          i === at ? { ...f, x: px, y: py } : f,
        ),
      };
    },
    setFlyerVelocity: (view, id, vx, vy) => {
      const state = own(view);
      const at = requireFlyer(state, id);
      const fx = requireFinite(vx, "vx");
      const fy = requireFinite(vy, "vy");
      return {
        ...state,
        flyers: state.flyers.map((f, i) =>
          i === at ? { ...f, vx: fx, vy: fy } : f,
        ),
      };
    },
    removeFlyer: (view, id) => {
      const state = own(view);
      const at = requireFlyer(state, id);
      return { ...state, flyers: state.flyers.filter((_, i) => i !== at) };
    },
    clearFlyers: (view) => ({ ...own(view), flyers: [] }),
    setLaunchClock: (view, seconds) => ({
      ...own(view),
      launchClock: requireFinite(seconds, "seconds"),
    }),
    clearTrail: (view) => ({ ...own(view), trail: [], trailStamps: 0 }),
    drawLaunchVx: () => drawLaunchVx(),
  };
}
