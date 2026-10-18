import { describe, expect, it } from "vitest";
import {
  buildDeck,
  foundationAccepts,
  foundationFor,
  isBoardComplete,
  isRank,
  isRun,
  isSuit,
  shuffle,
  suitColor,
  tableauAccepts,
} from "./cards";
import { SUITS } from "./constants";
import type { CardState, Suit } from "./game";

let nextId = 1000;
function card(suit: Suit, rank: number, faceUp = true): CardState {
  return { id: nextId++, suit, rank, faceUp };
}

describe("the deck", () => {
  it("holds each of the 52 suit-and-rank pairs once, face-down, with distinct ids", () => {
    const deck = buildDeck(1);
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => `${c.suit}${c.rank}`)).size).toBe(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    expect(deck.every((c) => !c.faceUp)).toBe(true);
  });

  it("colors hearts and diamonds red, spades and clubs black", () => {
    expect(SUITS.map(suitColor)).toEqual(["black", "red", "red", "black"]);
  });

  it("validates suits and ranks", () => {
    expect(isSuit("hearts")).toBe(true);
    expect(isSuit("stars")).toBe(false);
    expect(isRank(1)).toBe(true);
    expect(isRank(13)).toBe(true);
    expect(isRank(0)).toBe(false);
    expect(isRank(14)).toBe(false);
    expect(isRank(2.5)).toBe(false);
    expect(isRank("3")).toBe(false);
  });

  it("shuffles into a permutation without touching its input", () => {
    const items = [1, 2, 3, 4, 5, 6];
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const out = shuffle(items, random);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out.slice().sort()).toEqual(items);
  });

  it("shuffles uniformly enough that every position sees every card", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++)
      seen.add(shuffle([1, 2, 3], Math.random).join());
    expect(seen.size).toBe(6);
  });
});

describe("runs", () => {
  it("accepts a single face-up card and an alternating descending sequence", () => {
    expect(isRun([card("spades", 5)])).toBe(true);
    expect(
      isRun([card("spades", 9), card("hearts", 8), card("clubs", 7)]),
    ).toBe(true);
  });

  it("refuses empty, face-down, same-color, and out-of-order sequences", () => {
    expect(isRun([])).toBe(false);
    expect(isRun([card("spades", 5, false)])).toBe(false);
    expect(isRun([card("spades", 9), card("clubs", 8)])).toBe(false);
    expect(isRun([card("spades", 9), card("hearts", 7)])).toBe(false);
  });
});

describe("a foundation", () => {
  it("takes an Ace of any suit when empty, and nothing else", () => {
    for (const suit of SUITS)
      expect(foundationAccepts([], [card(suit, 1)])).toBe(true);
    expect(foundationAccepts([], [card("hearts", 2)])).toBe(false);
  });

  it("builds up in its own suit only", () => {
    const pile = [card("hearts", 1), card("hearts", 2)];
    expect(foundationAccepts(pile, [card("hearts", 3)])).toBe(true);
    expect(foundationAccepts(pile, [card("diamonds", 3)])).toBe(false);
    expect(foundationAccepts(pile, [card("hearts", 4)])).toBe(false);
  });

  it("takes one card at a time, face-up", () => {
    expect(foundationAccepts([], [card("hearts", 1), card("spades", 13)])).toBe(
      false,
    );
    expect(foundationAccepts([], [card("hearts", 1, false)])).toBe(false);
  });

  it("takes nothing once its King is on", () => {
    const full = Array.from({ length: 13 }, (_, i) => card("clubs", i + 1));
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) {
        expect(foundationAccepts(full, [card(suit, rank)])).toBe(false);
      }
    }
  });

  it("finds the one foundation a card belongs on", () => {
    const foundations = [
      [card("hearts", 1)],
      [],
      [card("spades", 1), card("spades", 2)],
      [],
    ];
    expect(foundationFor(foundations, card("spades", 3))).toBe(2);
    expect(foundationFor(foundations, card("hearts", 2))).toBe(0);
    expect(foundationFor(foundations, card("clubs", 1))).toBe(1);
    expect(foundationFor(foundations, card("clubs", 2))).toBe(-1);
  });

  it("recognizes a complete board", () => {
    const full = SUITS.map((suit) =>
      Array.from({ length: 13 }, (_, i) => card(suit, i + 1)),
    );
    expect(isBoardComplete(full)).toBe(true);
    expect(
      isBoardComplete([full[0], full[1], full[2], full[3].slice(0, 12)]),
    ).toBe(false);
  });
});

describe("a column", () => {
  it("takes only a King-led run when empty", () => {
    expect(tableauAccepts([], [card("hearts", 13)])).toBe(true);
    expect(tableauAccepts([], [card("hearts", 13), card("spades", 12)])).toBe(
      true,
    );
    expect(tableauAccepts([], [card("hearts", 12)])).toBe(false);
  });

  it("builds down in alternating colors on a face-up lowest card", () => {
    const column = [card("spades", 4, false), card("spades", 9)];
    expect(tableauAccepts(column, [card("hearts", 8)])).toBe(true);
    expect(
      tableauAccepts(column, [card("diamonds", 8), card("clubs", 7)]),
    ).toBe(true);
    expect(tableauAccepts(column, [card("clubs", 8)])).toBe(false);
    expect(tableauAccepts(column, [card("hearts", 7)])).toBe(false);
  });

  it("takes nothing on a face-down lowest card, nor a run out of order", () => {
    expect(
      tableauAccepts([card("spades", 9, false)], [card("hearts", 8)]),
    ).toBe(false);
    expect(
      tableauAccepts(
        [card("spades", 9)],
        [card("hearts", 8), card("diamonds", 7)],
      ),
    ).toBe(false);
  });
});
