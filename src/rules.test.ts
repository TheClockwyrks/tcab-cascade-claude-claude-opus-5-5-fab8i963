import { describe, expect, it } from "vitest";
import { SUITS } from "./constants";
import { createDebugApi } from "./debug";
import type { CascadeState, Suit } from "./game";
import {
  columnBottom,
  columnCardYs,
  faceUpOffset,
  wasteFanCount,
} from "./layout";
import { dealTable, sendHome, startGame, tryMove, turnStock } from "./rules";
import { initialState } from "./state";

const d = createDebugApi();

function playing(): CascadeState {
  return d.setScreen(initialState(false), "playing");
}

function add(
  s: CascadeState,
  pile: "stock" | "waste" | "foundation" | "tableau",
  index: number,
  suit: Suit,
  rank: number,
  faceUp = true,
): CascadeState {
  return d.addCard(s, pile, index, suit, rank, faceUp);
}

/** Foundations holding every card but the ones named. */
function nearlyWon(missing: number): CascadeState {
  let s = playing();
  SUITS.forEach((suit, f) => {
    const top = f === 3 ? 13 - missing : 13;
    for (let r = 1; r <= top; r++) s = add(s, "foundation", f, suit, r);
  });
  return s;
}

describe("the deal", () => {
  it("lays out 28 cards in seven columns, each showing one face-up card, and 24 in the stock", () => {
    const s = dealTable(playing());
    s.tableau.forEach((column, c) => {
      expect(column).toHaveLength(c + 1);
      column.forEach((card, r) => expect(card.faceUp).toBe(r === c));
    });
    expect(s.stock).toHaveLength(24);
    expect(s.stock.every((card) => !card.faceUp)).toBe(true);
    expect(s.waste).toEqual([]);
    expect(s.wasteSets).toEqual([]);
    expect(s.foundations.every((pile) => pile.length === 0)).toBe(true);
    const all = [...s.stock, ...s.tableau.flat()];
    expect(new Set(all.map((c) => `${c.suit}${c.rank}`)).size).toBe(52);
    expect(new Set(all.map((c) => c.id)).size).toBe(52);
    expect(s.pendingCues).toEqual(["deal"]);
  });

  it("clears the painted layer and the launch count, and leaves the screen alone", () => {
    const painted = {
      ...playing(),
      trail: [{ suit: "hearts" as const, rank: 1, x: 0, y: 0 }],
      trailStamps: 1,
      launched: 9,
    };
    const s = dealTable({ ...painted, screen: "title" });
    expect(s.trail).toEqual([]);
    expect(s.trailStamps).toBe(0);
    expect(s.launched).toBe(0);
    expect(s.screen).toBe("title");
  });

  it("starts play on the first HUD item with an empty hand", () => {
    const s = startGame({ ...initialState(false), menuIndex: 1 });
    expect(s.screen).toBe("playing");
    expect(s.menuIndex).toBe(0);
    expect(s.drag).toBeNull();
    expect(s.flyers).toEqual([]);
  });
});

describe("the stock", () => {
  it("turns three cards face-up, the stock's top card deepest", () => {
    let s = playing();
    for (let r = 1; r <= 5; r++) s = add(s, "stock", 0, "spades", r, false);
    s = turnStock(s);
    expect(s.stock.map((c) => c.rank)).toEqual([1, 2]);
    expect(s.waste.map((c) => c.rank)).toEqual([5, 4, 3]);
    expect(s.waste.every((c) => c.faceUp)).toBe(true);
    expect(s.wasteSets).toEqual([3]);
    expect(s.pendingCues).toContain("turn");
  });

  it("turns all that remain when fewer than three are left, as one set", () => {
    let s = playing();
    for (let r = 1; r <= 5; r++) s = add(s, "stock", 0, "spades", r, false);
    s = turnStock(turnStock(s));
    expect(s.stock).toEqual([]);
    expect(s.wasteSets).toEqual([3, 2]);
    expect(wasteFanCount(s)).toBe(2);
  });

  it("recycles the waste into an empty stock, face-down and in reverse", () => {
    let s = playing();
    for (let r = 1; r <= 4; r++) s = add(s, "stock", 0, "hearts", r, false);
    const before = s.stock.map((c) => c.id);
    s = turnStock(turnStock(s));
    s = turnStock({ ...s, pendingCues: [] });
    expect(s.waste).toEqual([]);
    expect(s.wasteSets).toEqual([]);
    expect(s.stock.map((c) => c.id)).toEqual(before);
    expect(s.stock.every((c) => !c.faceUp)).toBe(true);
    expect(s.pendingCues).toEqual(["recycle"]);
  });

  it("does nothing with the stock and the waste both empty", () => {
    const s = playing();
    expect(turnStock(s)).toBe(s);
  });
});

describe("playing off the waste", () => {
  function wasteOf(ranks: number[], sets: number[]): CascadeState {
    let s = playing();
    for (const r of ranks)
      s = add(s, "waste", 0, r % 2 ? "hearts" : "spades", r);
    for (const n of sets) s = d.addWasteSet(s, n);
    return s;
  }

  it("plays only the top card, and the set shrinks then falls back", () => {
    let s = wasteOf([5, 6, 1], [2, 1]);
    expect(
      tryMove(s, { pile: "waste", index: 0 }, 1, {
        pile: "foundation",
        index: 0,
      })[1],
    ).toBe(false);
    const [next, ok] = tryMove(s, { pile: "waste", index: 0 }, 2, {
      pile: "foundation",
      index: 0,
    });
    expect(ok).toBe(true);
    s = next;
    expect(s.wasteSets).toEqual([2]);
    expect(wasteFanCount(s)).toBe(2);
  });

  it("offers nothing to play when the set memory is empty", () => {
    const s = wasteOf([1], []);
    expect(
      tryMove(s, { pile: "waste", index: 0 }, 0, {
        pile: "foundation",
        index: 0,
      })[1],
    ).toBe(false);
    expect(sendHome(s, { pile: "waste", index: 0 })[1]).toBe(false);
  });
});

describe("moves between piles", () => {
  it("moves a run onto a column and turns the newly exposed card", () => {
    let s = playing();
    s = add(s, "tableau", 0, "clubs", 10, false);
    s = add(s, "tableau", 0, "hearts", 8);
    s = add(s, "tableau", 0, "spades", 7);
    s = add(s, "tableau", 1, "spades", 9);
    const [next, ok] = tryMove(s, { pile: "tableau", index: 0 }, 1, {
      pile: "tableau",
      index: 1,
    });
    expect(ok).toBe(true);
    expect(next.tableau[1].map((c) => c.rank)).toEqual([9, 8, 7]);
    expect(next.tableau[0]).toHaveLength(1);
    expect(next.tableau[0][0].faceUp).toBe(true);
    expect(next.pendingCues).toEqual(expect.arrayContaining(["drop", "flip"]));
  });

  it("leaves the exposed card face-down with auto-flip off", () => {
    let s = d.setAutoFlip(playing(), false);
    s = add(s, "tableau", 0, "clubs", 10, false);
    s = add(s, "tableau", 0, "hearts", 13);
    const [next, ok] = tryMove(s, { pile: "tableau", index: 0 }, 1, {
      pile: "tableau",
      index: 1,
    });
    expect(ok).toBe(true);
    expect(next.tableau[0][0].faceUp).toBe(false);
  });

  it("refuses a face-down card, a bad target, and a run back onto its own column", () => {
    let s = playing();
    s = add(s, "tableau", 0, "clubs", 10, false);
    s = add(s, "tableau", 0, "hearts", 13);
    expect(
      tryMove(s, { pile: "tableau", index: 0 }, 0, {
        pile: "tableau",
        index: 1,
      }),
    ).toEqual([s, false]);
    expect(
      tryMove(s, { pile: "tableau", index: 0 }, 1, {
        pile: "tableau",
        index: 0,
      }),
    ).toEqual([s, false]);
    expect(
      tryMove(s, { pile: "tableau", index: 0 }, 1, { pile: "waste", index: 0 }),
    ).toEqual([s, false]);
    expect(
      tryMove(s, { pile: "tableau", index: 0 }, 1, { pile: "stock", index: 0 }),
    ).toEqual([s, false]);
    expect(
      tryMove(s, { pile: "stock", index: 0 }, 0, { pile: "tableau", index: 1 }),
    ).toEqual([s, false]);
  });

  it("moves a foundation's top card back onto a column, and not to another foundation", () => {
    let s = playing();
    s = add(s, "foundation", 0, "hearts", 1);
    s = add(s, "foundation", 0, "hearts", 2);
    s = add(s, "tableau", 3, "clubs", 3);
    expect(
      tryMove(s, { pile: "foundation", index: 0 }, 0, {
        pile: "tableau",
        index: 3,
      })[1],
    ).toBe(false);
    expect(
      tryMove(s, { pile: "foundation", index: 0 }, 1, {
        pile: "foundation",
        index: 1,
      })[1],
    ).toBe(false);
    const [next, ok] = tryMove(s, { pile: "foundation", index: 0 }, 1, {
      pile: "tableau",
      index: 3,
    });
    expect(ok).toBe(true);
    expect(next.foundations[0]).toHaveLength(1);
    expect(next.tableau[3].map((c) => c.rank)).toEqual([3, 2]);
  });

  it("sends a playable card home with the home cue, and refuses one that does not fit", () => {
    let s = playing();
    s = add(s, "tableau", 2, "diamonds", 1);
    const [home, ok] = sendHome(s, { pile: "tableau", index: 2 });
    expect(ok).toBe(true);
    expect(home.foundations[0][0].suit).toBe("diamonds");
    expect(home.pendingCues).toEqual(["home"]);
    expect(sendHome(home, { pile: "tableau", index: 2 })[1]).toBe(false);
    expect(
      sendHome(add(home, "tableau", 1, "clubs", 5), {
        pile: "tableau",
        index: 1,
      })[1],
    ).toBe(false);
    expect(sendHome(home, { pile: "foundation", index: 0 })[1]).toBe(false);
  });
});

describe("the win", () => {
  it("moves to won and begins the cascade on the move that puts the last card home", () => {
    const s = add(nearlyWon(1), "tableau", 0, "clubs", 13);
    const [won, ok] = sendHome(s, { pile: "tableau", index: 0 });
    expect(ok).toBe(true);
    expect(won.screen).toBe("won");
    expect(won.launchClock).toBeCloseTo(0.18);
    expect(won.launched).toBe(0);
    expect(won.pendingCues).toEqual(expect.arrayContaining(["home", "win"]));
  });

  it("stays on playing with win detection off", () => {
    const s = d.setWinDetect(
      add(nearlyWon(1), "tableau", 0, "clubs", 13),
      false,
    );
    expect(sendHome(s, { pile: "tableau", index: 0 })[0].screen).toBe(
      "playing",
    );
  });
});

describe("column geometry", () => {
  it("fans face-down cards at 24 and face-up cards at 34", () => {
    let s = playing();
    s = add(s, "tableau", 0, "clubs", 10, false);
    s = add(s, "tableau", 0, "hearts", 9);
    s = add(s, "tableau", 0, "clubs", 8);
    expect(columnCardYs(s.tableau[0])).toEqual([180, 204, 238]);
    expect(columnBottom(s.tableau[0])).toBe(378);
    expect(columnBottom([])).toBe(320);
  });

  it("compresses a long column's face-up offset to fit above the limit, no lower than 14", () => {
    let s = playing();
    for (let i = 0; i < 6; i++) s = add(s, "tableau", 0, "clubs", 13, false);
    for (let r = 13; r >= 2; r--)
      s = add(s, "tableau", 0, r % 2 ? "spades" : "hearts", r);
    const column = s.tableau[0];
    const offset = faceUpOffset(column);
    expect(offset).toBeCloseTo((676 - 140 - 180 - 6 * 24) / 11);
    expect(columnBottom(column)).toBeCloseTo(676);
    let longer = s;
    for (let i = 0; i < 12; i++)
      longer = add(longer, "tableau", 1, "clubs", 1, false);
    for (let i = 0; i < 14; i++) longer = add(longer, "tableau", 1, "clubs", 1);
    expect(faceUpOffset(longer.tableau[1])).toBe(14);
    expect(faceUpOffset(column.slice(0, 9))).toBe(34);
  });
});
