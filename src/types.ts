// Cascade — shared vocabulary of the build's own modules.
//
// The state contract itself is declared in `src/game.ts`, as specs/state.md
// requires; this file holds the small types the rules, the input path, the
// renderer, and the debug surface share beside it.

import type { CardState, Suit } from "./game";

/** Any of the thirteen piles, named the way the debug surface names one. */
export interface PileRef {
  readonly pile: "stock" | "waste" | "foundation" | "tableau";
  readonly index: number;
}

/** A card's color, which follows its suit. */
export type CardColor = "red" | "black";

/** One stamp on the painted layer: a card drawn where a flyer stood. */
export interface TrailStamp {
  readonly suit: Suit;
  readonly rank: number;
  readonly x: number;
  readonly y: number;
}

/** An axis-aligned rectangle in logical units. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A run of cards, as it is carried between piles. */
export type Run = readonly CardState[];
