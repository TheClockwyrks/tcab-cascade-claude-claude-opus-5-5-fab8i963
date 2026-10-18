// Cascade — the geometry of the table (specs/table.md) and of the menus
// (specs/controls.md, specs/screens.md).
//
// Every position is a top-left corner in the stage's logical units. These
// functions read the state and return figures; none of them changes anything,
// and the renderer and the input path share them so what is drawn is exactly
// what is hit.

import {
  CARD_H,
  CARD_W,
  COLUMN_BOTTOM_LIMIT,
  COLUMN_X,
  FACE_DOWN_OFFSET,
  FACE_UP_OFFSET,
  FACE_UP_OFFSET_MIN,
  FOUNDATION_X,
  HUD_H,
  HUD_ITEMS,
  HUD_Y,
  HOWTO_BACK_LABEL,
  STOCK_X,
  TABLEAU_Y,
  TITLE_ITEMS,
  TOP_ROW_Y,
  WASTE_FAN,
  WASTE_X,
} from "./constants";
import type { CardState, CascadeState, Screen } from "./game";
import type { PileRef, Rect, Run } from "./types";

/** The most cards the waste fans; the rest are squared away beneath them. */
export const WASTE_FAN_MAX = 3;

export function contains(rect: Rect, x: number, y: number): boolean {
  return (
    x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
  );
}

function cardRect(x: number, y: number): Rect {
  return { x, y, w: CARD_W, h: CARD_H };
}

// ---- The columns -----------------------------------------------------------

/**
 * The face-up offset a column is drawn with: `FACE_UP_OFFSET`, or less when
 * the column would otherwise pass `COLUMN_BOTTOM_LIMIT`, never below
 * `FACE_UP_OFFSET_MIN`.
 */
export function faceUpOffset(column: Run): number {
  let down = 0;
  let up = 0;
  for (let i = 0; i < column.length - 1; i++) {
    if (column[i].faceUp) up++;
    else down++;
  }
  const natural =
    TABLEAU_Y + down * FACE_DOWN_OFFSET + up * FACE_UP_OFFSET + CARD_H;
  if (up === 0 || natural <= COLUMN_BOTTOM_LIMIT) return FACE_UP_OFFSET;
  const fit =
    (COLUMN_BOTTOM_LIMIT - CARD_H - TABLEAU_Y - down * FACE_DOWN_OFFSET) / up;
  return Math.max(FACE_UP_OFFSET_MIN, Math.min(FACE_UP_OFFSET, fit));
}

/** The top edge of each card of a column, first card first. */
export function columnCardYs(column: Run): number[] {
  const upOffset = faceUpOffset(column);
  const ys: number[] = [];
  let y = TABLEAU_Y;
  for (let i = 0; i < column.length; i++) {
    ys.push(y);
    y += column[i].faceUp ? upOffset : FACE_DOWN_OFFSET;
  }
  return ys;
}

/** The bottom edge of a column's lowest drawn card, or of the empty slot. */
export function columnBottom(column: Run): number {
  const ys = columnCardYs(column);
  const last = ys[ys.length - 1];
  return (last ?? TABLEAU_Y) + CARD_H;
}

// ---- The waste -------------------------------------------------------------

/**
 * The waste's set memory as the table shows it: while the waste's top card is
 * in hand its set is one card smaller, and a set that leaves empty falls back
 * to the set before it. The declared `wasteSets` is untouched by a lift.
 */
export function shownWasteSets(state: CascadeState): readonly number[] {
  const drag = state.drag;
  if (drag === null || drag.fromPile !== "waste") return state.wasteSets;
  const sets = state.wasteSets.slice();
  let held = drag.cards.length;
  while (held > 0 && sets.length > 0) {
    const last = sets.length - 1;
    const take = Math.min(held, sets[last]);
    sets[last] -= take;
    held -= take;
    if (sets[last] <= 0) sets.pop();
  }
  return sets;
}

/** How many of the waste's cards are fanned: the shown set, at most three. */
export function wasteFanCount(state: CascadeState): number {
  const sets = shownWasteSets(state);
  if (sets.length === 0) return 0;
  return Math.max(
    0,
    Math.min(sets[sets.length - 1], WASTE_FAN_MAX, state.waste.length),
  );
}

/** The x of the `i`th fanned waste card, oldest first. */
export function wasteFanX(i: number): number {
  return WASTE_X + i * WASTE_FAN;
}

/** The waste's top card when the waste offers one to play, else `null`. */
export function playableWasteCard(state: CascadeState): CardState | null {
  if (state.wasteSets.length === 0) return null;
  return state.waste[state.waste.length - 1] ?? null;
}

// ---- Drop rectangles -------------------------------------------------------

export function pileAnchor(ref: PileRef): { x: number; y: number } {
  switch (ref.pile) {
    case "stock":
      return { x: STOCK_X, y: TOP_ROW_Y };
    case "waste":
      return { x: WASTE_X, y: TOP_ROW_Y };
    case "foundation":
      return { x: FOUNDATION_X[ref.index], y: TOP_ROW_Y };
    case "tableau":
      return { x: COLUMN_X[ref.index], y: TABLEAU_Y };
  }
}

/** The rectangle a pile answers a release in. */
export function dropRect(state: CascadeState, ref: PileRef): Rect {
  const anchor = pileAnchor(ref);
  if (ref.pile !== "tableau") return cardRect(anchor.x, anchor.y);
  const bottom = columnBottom(state.tableau[ref.index]);
  return { x: anchor.x, y: TABLEAU_Y, w: CARD_W, h: bottom - TABLEAU_Y };
}

/** All thirteen piles, in a fixed order. */
export function allPiles(): PileRef[] {
  const piles: PileRef[] = [
    { pile: "stock", index: 0 },
    { pile: "waste", index: 0 },
  ];
  for (let i = 0; i < FOUNDATION_X.length; i++)
    piles.push({ pile: "foundation", index: i });
  for (let i = 0; i < COLUMN_X.length; i++)
    piles.push({ pile: "tableau", index: i });
  return piles;
}

/** The pile whose drop rectangle holds the point, or `null`. */
export function pileAt(
  state: CascadeState,
  x: number,
  y: number,
): PileRef | null {
  return allPiles().find((ref) => contains(dropRect(state, ref), x, y)) ?? null;
}

// ---- What a press lands on -------------------------------------------------

/** The card drawn over every other at a point, and where it lies. */
export interface CardHit {
  readonly pile: "stock" | "waste" | "foundation" | "tableau";
  readonly index: number;
  readonly row: number;
  readonly card: CardState;
  /** The card's top-left as it is drawn. */
  readonly x: number;
  readonly y: number;
}

/** The topmost card drawn at a point, or `null` when the point is on no card. */
export function cardAt(
  state: CascadeState,
  x: number,
  y: number,
): CardHit | null {
  for (let c = 0; c < state.tableau.length; c++) {
    const column = state.tableau[c];
    const ys = columnCardYs(column);
    for (let row = column.length - 1; row >= 0; row--) {
      if (contains(cardRect(COLUMN_X[c], ys[row]), x, y)) {
        return {
          pile: "tableau",
          index: c,
          row,
          card: column[row],
          x: COLUMN_X[c],
          y: ys[row],
        };
      }
    }
  }
  for (let f = 0; f < state.foundations.length; f++) {
    const pile = state.foundations[f];
    const top = pile[pile.length - 1];
    if (
      top !== undefined &&
      contains(cardRect(FOUNDATION_X[f], TOP_ROW_Y), x, y)
    ) {
      return {
        pile: "foundation",
        index: f,
        row: pile.length - 1,
        card: top,
        x: FOUNDATION_X[f],
        y: TOP_ROW_Y,
      };
    }
  }
  const fan = wasteFanCount(state);
  for (let i = fan - 1; i >= 0; i--) {
    if (contains(cardRect(wasteFanX(i), TOP_ROW_Y), x, y)) {
      const row = state.waste.length - fan + i;
      return {
        pile: "waste",
        index: 0,
        row,
        card: state.waste[row],
        x: wasteFanX(i),
        y: TOP_ROW_Y,
      };
    }
  }
  const stockTop = state.stock[state.stock.length - 1];
  if (stockTop !== undefined && contains(cardRect(STOCK_X, TOP_ROW_Y), x, y)) {
    return {
      pile: "stock",
      index: 0,
      row: state.stock.length - 1,
      card: stockTop,
      x: STOCK_X,
      y: TOP_ROW_Y,
    };
  }
  return null;
}

// ---- The menus -------------------------------------------------------------

/** The labels of the menu a screen shows, in order. */
export function menuItems(screen: Screen): readonly string[] {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "howto":
      return [HOWTO_BACK_LABEL];
    case "playing":
      return HUD_ITEMS;
    case "won":
      return [];
  }
}

export const TITLE_ITEM_W = 320;
export const TITLE_ITEM_H = 56;
export const TITLE_ITEM_Y = 404;
export const TITLE_ITEM_GAP = 72;
export const HOWTO_BACK_RECT: Rect = { x: 540, y: 618, w: 200, h: 52 };
export const HUD_ITEM_W = 150;
export const HUD_ITEM_H = HUD_H - 6;
export const HUD_ITEM_X = 224;
export const HUD_ITEM_GAP = 14;

/** The hit region of item `index` on a screen's menu, or `null`. */
export function menuRect(screen: Screen, index: number): Rect | null {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= menuItems(screen).length
  )
    return null;
  switch (screen) {
    case "title":
      return {
        x: 640 - TITLE_ITEM_W / 2,
        y: TITLE_ITEM_Y + index * TITLE_ITEM_GAP,
        w: TITLE_ITEM_W,
        h: TITLE_ITEM_H,
      };
    case "howto":
      return HOWTO_BACK_RECT;
    case "playing":
      return {
        x: HUD_ITEM_X + index * (HUD_ITEM_W + HUD_ITEM_GAP),
        y: HUD_Y + 3,
        w: HUD_ITEM_W,
        h: HUD_ITEM_H,
      };
    case "won":
      return null;
  }
}

/** The index of the menu item whose region holds the point, or `-1`. */
export function menuItemAt(screen: Screen, x: number, y: number): number {
  const count = menuItems(screen).length;
  for (let i = 0; i < count; i++) {
    const rect = menuRect(screen, i);
    if (rect !== null && contains(rect, x, y)) return i;
  }
  return -1;
}
