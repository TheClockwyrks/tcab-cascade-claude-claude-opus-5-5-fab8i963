import { describe, expect, it } from "vitest";
import { createDebugApi } from "./debug";
import type { CascadeState, Suit } from "./game";
import {
  activate,
  menuKeys,
  pointerDown,
  pointerMove,
  pointerUp,
} from "./input";
import { menuRect } from "./layout";
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

const NO_KEYS = { up: false, down: false, confirm: false, back: false };

/** A column 0 holding a face-down card under a red 8, and a black 9 in column 1. */
function table(): CascadeState {
  let s = playing();
  s = add(s, "tableau", 0, "clubs", 4, false);
  s = add(s, "tableau", 0, "hearts", 8);
  s = add(s, "tableau", 1, "spades", 9);
  return s;
}

describe("a press", () => {
  it("lifts a face-up card and everything below it, keeping the face-down card beneath unturned", () => {
    let s = table();
    s = add(s, "tableau", 0, "spades", 7);
    s = pointerDown(s, 250, 215);
    expect(s.drag?.cards.map((c) => c.rank)).toEqual([8, 7]);
    expect(s.drag?.fromPile).toBe("tableau");
    expect(s.drag?.x).toBe(224);
    expect(s.drag?.y).toBe(204);
    expect(s.tableau[0]).toHaveLength(1);
    expect(s.tableau[0][0].faceUp).toBe(false);
    expect(s.lastPress).toEqual({ x: 250, y: 215, at: 0 });
    expect(s.pendingCues).toContain("lift");
  });

  it("lifts nothing from a face-down card, the stock, a buried waste card, or bare felt", () => {
    let s = table();
    for (let r = 1; r <= 3; r++) s = add(s, "stock", 0, "clubs", r, false);
    s = add(s, "waste", 0, "hearts", 2);
    s = add(s, "waste", 0, "hearts", 3);
    s = d.addWasteSet(s, 2);
    expect(pointerDown(s, 250, 190).drag).toBeNull();
    expect(pointerDown(s, 250, 60).drag).toBeNull();
    expect(pointerDown(s, 352, 60).drag).toBeNull();
    expect(pointerDown(s, 40, 400).drag).toBeNull();
    expect(pointerDown(s, 440, 60).drag?.cards[0].rank).toBe(3);
  });

  it("lifts a foundation's top card", () => {
    const s = pointerDown(
      add(playing(), "foundation", 2, "hearts", 1),
      860,
      60,
    );
    expect(s.drag?.fromPile).toBe("foundation");
    expect(s.foundations[2]).toEqual([]);
  });
});

describe("a drop", () => {
  it("follows the pointer and highlights the pile that would accept it", () => {
    let s = pointerDown(table(), 250, 215);
    s = pointerMove(s, 372, 240);
    expect(s.drag?.x).toBe(346);
    expect(s.drag?.y).toBe(229);
    expect(s.dropTarget).toEqual({ pile: "tableau", index: 1 });
    s = pointerMove(s, 700, 500);
    expect(s.dropTarget).toBeNull();
  });

  it("lands on an accepting pile and turns the exposed card", () => {
    let s = pointerDown(table(), 250, 215);
    s = pointerUp(pointerMove(s, 372, 240), 372, 240);
    expect(s.drag).toBeNull();
    expect(s.tableau[1].map((c) => c.rank)).toEqual([9, 8]);
    expect(s.tableau[0][0].faceUp).toBe(true);
    expect(s.pendingCues).toEqual(expect.arrayContaining(["drop", "flip"]));
  });

  it("returns a refused run to where it came from, unchanged", () => {
    const start = table();
    let s = pointerDown(start, 250, 215);
    s = pointerUp(s, 620, 260);
    expect(s.tableau).toEqual(start.tableau);
    expect(s.pendingCues).toContain("reject");
    s = pointerUp(pointerDown(start, 250, 215), 40, 600);
    expect(s.tableau).toEqual(start.tableau);
  });

  it("treats a short release as a click that returns the run and turns nothing", () => {
    const start = table();
    const s = pointerUp(pointerDown(start, 250, 215), 253, 218);
    expect(s.tableau).toEqual(start.tableau);
    expect(s.pendingCues).not.toContain("reject");
  });

  it("returns a lifted waste card to its own set", () => {
    let s = playing();
    for (let r = 1; r <= 6; r++) s = add(s, "waste", 0, "spades", r + 5);
    s = d.addWasteSet(d.addWasteSet(s, 3), 3);
    const before = s.waste;
    s = pointerDown(s, 440, 60);
    expect(s.wasteSets).toEqual([3, 3]);
    s = pointerUp(s, 700, 400);
    expect(s.waste).toEqual(before);
    expect(s.wasteSets).toEqual([3, 3]);
  });
});

describe("clicks on the stock", () => {
  it("turns the stock on a click and not on a drag that started there", () => {
    let s = playing();
    for (let r = 1; r <= 4; r++) s = add(s, "stock", 0, "clubs", r, false);
    const clicked = pointerUp(pointerDown(s, 270, 90), 272, 91);
    expect(clicked.waste).toHaveLength(3);
    const dragged = pointerUp(pointerDown(s, 270, 90), 400, 300);
    expect(dragged.waste).toHaveLength(0);
  });
});

describe("the double click", () => {
  it("sends a playable card home and lifts nothing", () => {
    let s = add(table(), "tableau", 2, "diamonds", 1);
    s = pointerUp(pointerDown(s, 500, 230), 500, 230);
    s = { ...s, simTime: 0.2 };
    s = pointerDown(s, 505, 232);
    expect(s.drag).toBeNull();
    expect(s.foundations[0].map((c) => c.rank)).toEqual([1]);
    expect(s.tableau[2]).toEqual([]);
    expect(pointerUp(s, 505, 232).foundations[0]).toHaveLength(1);
  });

  it("is not a double click when too slow or too far", () => {
    let s = add(table(), "tableau", 2, "diamonds", 1);
    s = pointerUp(pointerDown(s, 500, 230), 500, 230);
    expect(pointerDown({ ...s, simTime: 0.31 }, 500, 230).drag).not.toBeNull();
    expect(pointerDown(s, 500, 300).drag).not.toBeNull();
  });

  it("leaves a card the foundations refuse where it is", () => {
    let s = table();
    s = pointerUp(pointerDown(s, 372, 230), 372, 230);
    s = pointerDown(s, 372, 230);
    expect(s.drag).toBeNull();
    expect(s.tableau[1]).toHaveLength(1);
  });
});

describe("menus", () => {
  it("moves the title selection with wrapping, up before down and movement before confirm", () => {
    const s = initialState(false);
    expect(menuKeys(s, { ...NO_KEYS, up: true }).menuIndex).toBe(1);
    expect(menuKeys(s, { ...NO_KEYS, down: true }).menuIndex).toBe(1);
    expect(
      menuKeys({ ...s, menuIndex: 1 }, { ...NO_KEYS, down: true }).menuIndex,
    ).toBe(0);
    expect(menuKeys(s, { ...NO_KEYS, up: true, down: true }).menuIndex).toBe(1);
    const moved = menuKeys(s, { ...NO_KEYS, down: true, confirm: true });
    expect(moved.screen).toBe("title");
    expect(menuKeys(s, { ...NO_KEYS, back: true })).toBe(s);
  });

  it("goes to how-to and back to the entry that led there", () => {
    let s = activate(initialState(false), 1);
    expect(s.screen).toBe("howto");
    expect(s.titleIndex).toBe(1);
    expect(menuKeys(s, { ...NO_KEYS, down: true })).toBe(s);
    s = menuKeys(s, { ...NO_KEYS, back: true });
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(1);
  });

  it("starts a game from the title and returns to it from the HUD", () => {
    let s = menuKeys(initialState(false), { ...NO_KEYS, confirm: true });
    expect(s.screen).toBe("playing");
    expect(s.titleIndex).toBe(0);
    expect(s.stock).toHaveLength(24);
    s = menuKeys(s, { ...NO_KEYS, down: true });
    expect(s.menuIndex).toBe(1);
    s = menuKeys(s, { ...NO_KEYS, confirm: true });
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(0);
  });

  it("asks for a mute flip from SOUND and deals afresh from NEW GAME", () => {
    const s = activate(playing(), 2);
    expect(s.pendingMuteToggle).toBe(true);
    const dealt = activate(add(playing(), "tableau", 0, "hearts", 3), 0);
    expect(dealt.tableau[6]).toHaveLength(7);
    expect(dealt.screen).toBe("playing");
  });

  it("ignores the keyboard on won", () => {
    const s = d.setScreen(initialState(false), "won");
    expect(
      menuKeys(s, { up: true, down: true, confirm: true, back: true }),
    ).toBe(s);
  });

  it("selects on hover and activates when press and release share a region", () => {
    const s = initialState(false);
    const howto = menuRect("title", 1);
    if (howto === null) throw new Error("no rect");
    const cx = howto.x + howto.w / 2;
    const cy = howto.y + howto.h / 2;
    expect(pointerMove(s, cx, cy).menuIndex).toBe(1);
    expect(pointerUp(pointerDown(s, cx, cy), cx + 20, cy).screen).toBe("howto");
    const newGame = menuRect("title", 0);
    if (newGame === null) throw new Error("no rect");
    const split = pointerUp(
      pointerDown(s, cx, cy),
      newGame.x + 5,
      newGame.y + 5,
    );
    expect(split.screen).toBe("title");
  });

  it("deals from won on a press, and the release that follows does nothing more", () => {
    let s = d.setScreen(initialState(false), "won");
    s = pointerDown(s, 270, 90);
    expect(s.screen).toBe("playing");
    expect(s.stock).toHaveLength(24);
    expect(pointerUp(s, 270, 90).waste).toHaveLength(0);
  });
});
