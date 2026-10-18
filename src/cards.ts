// Cascade — the deck and the acceptance rules (specs/deal.md,
// specs/foundations.md, specs/tableau.md).
//
// Pure functions over cards and piles. Nothing here knows about the screen, the
// pointer, or the state as a whole.

import { DECK_SIZE, RANK_MAX, RANK_MIN, SUITS } from "./constants";
import type { CardState, Suit } from "./game";
import type { CardColor, Run } from "./types";

export function suitColor(suit: Suit): CardColor {
  return suit === "hearts" || suit === "diamonds" ? "red" : "black";
}

export function isSuit(value: unknown): value is Suit {
  return (SUITS as readonly unknown[]).includes(value);
}

export function isRank(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= RANK_MIN &&
    value <= RANK_MAX
  );
}

/** The fifty-two cards in suit order, face-down, with ids from `firstId` up. */
export function buildDeck(firstId: number): CardState[] {
  const deck: CardState[] = [];
  for (const suit of SUITS) {
    for (let rank = RANK_MIN; rank <= RANK_MAX; rank++) {
      deck.push({ id: firstId + deck.length, suit, rank, faceUp: false });
    }
  }
  return deck;
}

/** A uniform Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const held = out[i];
    out[i] = out[j];
    out[j] = held;
  }
  return out;
}

/**
 * Whether `cards` are in run order: all face-up, each one rank lower than and
 * the opposite color of the card above it. A single face-up card is a run.
 */
export function isRun(cards: Run): boolean {
  if (cards.length === 0) return false;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card.faceUp) return false;
    if (i > 0) {
      const above = cards[i - 1];
      if (card.rank !== above.rank - 1) return false;
      if (suitColor(card.suit) === suitColor(above.suit)) return false;
    }
  }
  return true;
}

/** What a foundation accepts: one card, the next of its suit, Ace on empty. */
export function foundationAccepts(pile: Run, run: Run): boolean {
  if (run.length !== 1 || !isRun(run)) return false;
  const card = run[0];
  const top = pile[pile.length - 1];
  if (top === undefined) return card.rank === RANK_MIN;
  return card.suit === top.suit && card.rank === top.rank + 1;
}

/** What a column accepts: a run led by a King on empty, else down and across. */
export function tableauAccepts(column: Run, run: Run): boolean {
  if (!isRun(run)) return false;
  const lead = run[0];
  const lowest = column[column.length - 1];
  if (lowest === undefined) return lead.rank === RANK_MAX;
  if (!lowest.faceUp) return false;
  return (
    lead.rank === lowest.rank - 1 &&
    suitColor(lead.suit) !== suitColor(lowest.suit)
  );
}

/** The foundation `card` belongs on, or `-1` when none would accept it. */
export function foundationFor(
  foundations: readonly Run[],
  card: CardState,
): number {
  return foundations.findIndex((pile) => foundationAccepts(pile, [card]));
}

/** Whether every card of the deck is home, each foundation Ace to King. */
export function isBoardComplete(foundations: readonly Run[]): boolean {
  const total = foundations.reduce((sum, pile) => sum + pile.length, 0);
  return (
    total === DECK_SIZE &&
    foundations.every((pile) => pile.length === RANK_MAX - RANK_MIN + 1)
  );
}
