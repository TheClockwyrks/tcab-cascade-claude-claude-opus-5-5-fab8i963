// Cascade — the transactions of play (specs/deal.md, specs/stock.md,
// specs/foundations.md, specs/tableau.md, specs/victory.md).
//
// Each function takes the state and returns the next one. The pointer path and
// the debug surface both route through these, so a move made from code and a
// move made by hand are the same move.

import {
  CUES,
  DEAL_TABLEAU_CARDS,
  DECK_SIZE,
  LAUNCH_INTERVAL,
  TABLEAU_COLUMNS,
  TURN_COUNT,
} from "./constants";
import {
  buildDeck,
  foundationAccepts,
  foundationFor,
  isBoardComplete,
  shuffle,
  tableauAccepts,
} from "./cards";
import type { CardState, CascadeState, DragState } from "./game";
import { playableWasteCard } from "./layout";
import { raise, withPile } from "./state";
import type { PileRef, Run } from "./types";

// ---- Reading a pile --------------------------------------------------------

export function pileCards(state: CascadeState, ref: PileRef): Run {
  switch (ref.pile) {
    case "stock":
      return state.stock;
    case "waste":
      return state.waste;
    case "foundation":
      return state.foundations[ref.index];
    case "tableau":
      return state.tableau[ref.index];
  }
}

export function setPileCards(
  state: CascadeState,
  ref: PileRef,
  cards: Run,
): CascadeState {
  switch (ref.pile) {
    case "stock":
      return { ...state, stock: cards };
    case "waste":
      return { ...state, waste: cards };
    case "foundation":
      return {
        ...state,
        foundations: withPile(state.foundations, ref.index, cards),
      };
    case "tableau":
      return { ...state, tableau: withPile(state.tableau, ref.index, cards) };
  }
}

// ---- The deal --------------------------------------------------------------

/**
 * Deals a fresh game onto the table: a uniformly shuffled deck, twenty-eight
 * cards to the columns with each column's last card face-up, the rest to the
 * stock face-down, an empty waste, empty foundations, and a clean felt. No
 * other field changes.
 */
export function dealTable(
  state: CascadeState,
  random: () => number = Math.random,
): CascadeState {
  const deck = shuffle(buildDeck(state.nextId), random);
  const tableau: CardState[][] = [];
  let next = 0;
  for (let c = 0; c < TABLEAU_COLUMNS; c++) {
    const column: CardState[] = [];
    for (let r = 0; r <= c; r++) {
      column.push({ ...deck[next++], faceUp: r === c });
    }
    tableau.push(column);
  }
  const stock = deck
    .slice(DEAL_TABLEAU_CARDS)
    .map((card) => ({ ...card, faceUp: false }));
  return raise(
    {
      ...state,
      stock,
      waste: [],
      wasteSets: [],
      foundations: state.foundations.map(() => []),
      tableau,
      launched: 0,
      trail: [],
      trailStamps: 0,
      nextId: state.nextId + DECK_SIZE,
    },
    CUES.deal,
  );
}

/**
 * A deal that begins play, as the title, the HUD, and the won screen start
 * one: the table dealt afresh, the hand empty, the cascade cleared, and the
 * first HUD item selected on the `playing` screen.
 */
export function startGame(
  state: CascadeState,
  random: () => number = Math.random,
): CascadeState {
  return {
    ...dealTable(state, random),
    screen: "playing",
    menuIndex: 0,
    drag: null,
    dropTarget: null,
    flyers: [],
    launchClock: 0,
    launchTurn: 0,
    cascadeDone: false,
  };
}

// ---- The stock -------------------------------------------------------------

/** Turns the stock onto the waste, or recycles the waste into an empty stock. */
export function turnStock(state: CascadeState): CascadeState {
  if (state.stock.length > 0) {
    const count = Math.min(TURN_COUNT, state.stock.length);
    const taken = state.stock
      .slice(state.stock.length - count)
      .reverse()
      .map((card) => ({ ...card, faceUp: true }));
    return raise(
      {
        ...state,
        stock: state.stock.slice(0, state.stock.length - count),
        waste: [...state.waste, ...taken],
        wasteSets: [...state.wasteSets, count],
      },
      CUES.turn,
    );
  }
  if (state.waste.length === 0) return state;
  return raise(
    {
      ...state,
      stock: state.waste
        .slice()
        .reverse()
        .map((card) => ({ ...card, faceUp: false })),
      waste: [],
      wasteSets: [],
    },
    CUES.recycle,
  );
}

/** Takes `count` cards off the waste's newest sets, dropping emptied sets. */
export function spendWasteSets(
  sets: readonly number[],
  count: number,
): number[] {
  const out = sets.slice();
  let left = count;
  while (left > 0 && out.length > 0) {
    const last = out.length - 1;
    const take = Math.min(left, out[last]);
    out[last] -= take;
    left -= take;
    if (out[last] <= 0) out.pop();
  }
  return out;
}

// ---- Lifting and landing ---------------------------------------------------

/** Where a run was lifted from. */
export interface Lift {
  readonly from: PileRef & { readonly pile: DragState["fromPile"] };
  readonly cards: Run;
}

/**
 * Takes the run starting at `row` off its pile, when the rules let that card
 * be taken: a column's face-up card with everything below it, or the top card
 * of the waste or of a foundation. Returns `null` when the card may not move.
 */
export function liftRun(
  state: CascadeState,
  ref: PileRef,
  row: number,
): [CascadeState, Lift] | null {
  const cards = pileCards(state, ref);
  const card = cards[row];
  if (card === undefined) return null;
  switch (ref.pile) {
    case "stock":
      return null;
    case "waste":
      if (row !== cards.length - 1 || playableWasteCard(state) === null)
        return null;
      break;
    case "foundation":
      if (row !== cards.length - 1) return null;
      break;
    case "tableau":
      if (!card.faceUp) return null;
      break;
  }
  const from = { pile: ref.pile, index: ref.index };
  return [
    setPileCards(state, ref, cards.slice(0, row)),
    { from, cards: cards.slice(row) },
  ];
}

/** Puts a lifted run back on the pile it came from, exactly as it left. */
export function returnRun(state: CascadeState, lift: Lift): CascadeState {
  return setPileCards(state, lift.from, [
    ...pileCards(state, lift.from),
    ...lift.cards,
  ]);
}

/** Whether a pile accepts a run lifted from `from`. */
export function accepts(
  state: CascadeState,
  from: PileRef,
  target: PileRef,
  run: Run,
): boolean {
  if (target.pile === "foundation") {
    if (from.pile === "foundation") return false;
    return foundationAccepts(state.foundations[target.index], run);
  }
  if (target.pile === "tableau") {
    if (from.pile === "tableau" && from.index === target.index) return false;
    return tableauAccepts(state.tableau[target.index], run);
  }
  return false;
}

/** How a move was made, which decides the cues it raises. */
export type MoveKind = "drop" | "home";

/**
 * Lands a lifted run on `target` when the target accepts it, or returns it to
 * its source when it does not. The state handed in is the one with the run
 * already off its source. Returns the next state and whether the move went.
 */
export function landRun(
  state: CascadeState,
  lift: Lift,
  target: PileRef | null,
  kind: MoveKind,
): [CascadeState, boolean] {
  if (target === null || !accepts(state, lift.from, target, lift.cards)) {
    const back = returnRun(state, lift);
    return [kind === "drop" ? raise(back, CUES.reject) : back, false];
  }
  let next = setPileCards(state, target, [
    ...pileCards(state, target),
    ...lift.cards,
  ]);
  if (kind === "drop") next = raise(next, CUES.drop);
  if (target.pile === "foundation") next = raise(next, CUES.home);
  next = settleSource(next, lift);
  return [checkWin(next), true];
}

/**
 * What a source pile does once a run has left it for good: the waste's set
 * gives up the card, and a column turns its newly exposed card face-up.
 */
function settleSource(state: CascadeState, lift: Lift): CascadeState {
  if (lift.from.pile === "waste") {
    return {
      ...state,
      wasteSets: spendWasteSets(state.wasteSets, lift.cards.length),
    };
  }
  if (lift.from.pile === "tableau" && state.autoFlip) {
    const column = state.tableau[lift.from.index];
    const lowest = column[column.length - 1];
    if (lowest !== undefined && !lowest.faceUp) {
      const turned = [...column.slice(0, -1), { ...lowest, faceUp: true }];
      return raise(
        { ...state, tableau: withPile(state.tableau, lift.from.index, turned) },
        CUES.flip,
      );
    }
  }
  return state;
}

/** Attempts a move of the run at `row` of `from` onto `to`. */
export function tryMove(
  state: CascadeState,
  from: PileRef,
  row: number,
  to: PileRef,
): [CascadeState, boolean] {
  const lifted = liftRun(state, from, row);
  if (lifted === null) return [state, false];
  const [without, lift] = lifted;
  if (!accepts(without, lift.from, to, lift.cards)) return [state, false];
  return landRun(without, lift, to, "drop");
}

/** The playable card of a pile: the waste's top card or a column's lowest face-up card. */
export function playableRow(state: CascadeState, ref: PileRef): number | null {
  if (ref.pile === "waste") {
    return playableWasteCard(state) === null ? null : state.waste.length - 1;
  }
  if (ref.pile === "tableau") {
    const column = state.tableau[ref.index];
    const lowest = column[column.length - 1];
    return lowest !== undefined && lowest.faceUp ? column.length - 1 : null;
  }
  return null;
}

/** Sends a pile's playable card to the foundation it belongs on, when it may go. */
export function sendHome(
  state: CascadeState,
  ref: PileRef,
): [CascadeState, boolean] {
  const row = playableRow(state, ref);
  if (row === null) return [state, false];
  const card = pileCards(state, ref)[row];
  const target = foundationFor(state.foundations, card);
  if (target < 0) return [state, false];
  const lifted = liftRun(state, ref, row);
  if (lifted === null) return [state, false];
  return landRun(
    lifted[0],
    lifted[1],
    { pile: "foundation", index: target },
    "home",
  );
}

// ---- The win ---------------------------------------------------------------

/** Moves to `won` and begins the cascade when every card is home. */
export function checkWin(state: CascadeState): CascadeState {
  if (
    !state.winDetect ||
    state.screen === "won" ||
    !isBoardComplete(state.foundations)
  ) {
    return state;
  }
  return raise(
    {
      ...state,
      screen: "won",
      menuIndex: 0,
      drag: null,
      dropTarget: null,
      launchClock: LAUNCH_INTERVAL,
      launched: 0,
      launchTurn: 0,
      cascadeDone: false,
    },
    CUES.win,
  );
}
