import { describe, expect, it } from "vitest";
import { createDebugApi } from "./debug";
import type { CascadeState } from "./game";
import { initialState } from "./state";

const d = createDebugApi();

function playing(): CascadeState {
  return d.setScreen(initialState(false), "playing");
}

describe("the debug surface", () => {
  it("reports version 1 and the build's deal mode", () => {
    const snap = d.snapshot(initialState(false));
    expect(d.version).toBe(1);
    expect(snap).toMatchObject({
      version: 1,
      screen: "title",
      dealMode: "draw-three",
      turnCount: 3,
      dealModeLabel: "DRAW THREE",
      wasteVisibleCount: 0,
      drag: null,
      dropTarget: null,
      lastPress: null,
    });
    expect(snap.foundations).toHaveLength(4);
    expect(snap.tableau).toHaveLength(7);
  });

  it("adds cards with fresh ids, reports their color, and finds them again", () => {
    let s = d.addCard(playing(), "tableau", 3, "diamonds", 12, true);
    s = d.addCard(s, "tableau", 3, "spades", 11, false);
    const column = d.snapshot(s).tableau[3];
    expect(column.map((c) => c.color)).toEqual(["red", "black"]);
    expect(column[0].id).not.toBe(column[1].id);
    s = d.setCardFaceUp(s, column[1].id, true);
    expect(d.snapshot(s).tableau[3][1].faceUp).toBe(true);
    s = d.removeCard(s, column[0].id);
    expect(d.snapshot(s).tableau[3].map((c) => c.rank)).toEqual([11]);
  });

  it("removing a waste card spends the newest set", () => {
    let s = d.addCard(playing(), "waste", 0, "hearts", 1, true);
    s = d.addCard(s, "waste", 0, "hearts", 2, true);
    s = d.addWasteSet(d.addWasteSet(s, 1), 1);
    expect(d.snapshot(s).wasteVisibleCount).toBe(1);
    s = d.removeCard(s, d.snapshot(s).waste[1].id);
    expect(d.snapshot(s).wasteSets).toEqual([1]);
    s = d.clearWasteSets(s);
    expect(s.waste).toHaveLength(1);
    expect(d.snapshot(s).wasteVisibleCount).toBe(0);
  });

  it("clears one pile, or the whole table and the hand", () => {
    let s = d.addCard(playing(), "waste", 0, "hearts", 1, true);
    s = d.addWasteSet(s, 1);
    s = d.addCard(s, "tableau", 0, "clubs", 5, true);
    s = d.addCard(s, "tableau", 1, "clubs", 6, true);
    s = d.clearPile(s, "waste", 0);
    expect(s.waste).toEqual([]);
    expect(s.wasteSets).toEqual([]);
    s = d.pointerDown(s, 250, 200);
    expect(s.drag).not.toBeNull();
    s = d.clearPile(s, "tableau", 1);
    expect(s.drag).not.toBeNull();
    s = d.clearTable(s);
    expect(s.drag).toBeNull();
    expect(s.tableau.flat()).toEqual([]);
  });

  it("fails loudly on a call naming nothing", () => {
    const s = playing();
    expect(() => d.addCard(s, "tableau", 7, "hearts", 1, true)).toThrow();
    expect(() => d.addCard(s, "stock", 1, "hearts", 1, true)).toThrow();
    expect(() =>
      d.addCard(s, "tableau", 0, "stars" as never, 1, true),
    ).toThrow();
    expect(() => d.addCard(s, "tableau", 0, "hearts", 0, true)).toThrow();
    expect(() => d.clearPile(s, "pond" as never, 0)).toThrow();
    expect(() => d.removeCard(s, 999)).toThrow();
    expect(() => d.setCardFaceUp(s, 999, true)).toThrow();
    expect(() => d.addWasteSet(s, 1.5)).toThrow();
    expect(() => d.removeFlyer(s, 999)).toThrow();
    expect(() => d.setFlyerPosition(s, 999, 0, 0)).toThrow();
    expect(() => d.setFlyerVelocity(s, 999, 0, 0)).toThrow();
    expect(() => d.setScreen(s, "pause" as never)).toThrow();
    expect(() => d.setTitleIndex(s, 2)).toThrow();
    expect(() => d.setMenuIndex(s, -1)).toThrow();
    expect(() => d.move(s, "tableau", 0, 0, "tableau", 1)).toThrow();
    expect(() => d.autoMove(s, "foundation", 4)).toThrow();
    expect(() => d.setAutoFlip(s, "yes" as never)).toThrow();
    expect(() => d.pointerDown(s, Number.NaN, 0)).toThrow();
  });

  it("moves and auto-moves through the game's rules, reporting the verdict", () => {
    let s = d.addCard(playing(), "tableau", 0, "hearts", 1, true);
    s = d.addCard(s, "tableau", 1, "spades", 3, true);
    expect(d.move(s, "tableau", 1, 0, "foundation", 0)[1]).toBe(false);
    const [moved, ok] = d.move(s, "tableau", 0, 0, "foundation", 2);
    expect(ok).toBe(true);
    expect(moved.foundations[2]).toHaveLength(1);
    expect(d.autoMove(moved, "tableau", 1)[1]).toBe(false);
    expect(d.autoMove(s, "tableau", 0)[1]).toBe(true);
    expect(d.autoMove(s, "stock", 0)[1]).toBe(false);
  });

  it("deals and turns from any screen", () => {
    let s = d.deal(initialState(false));
    expect(s.screen).toBe("title");
    expect(s.stock).toHaveLength(24);
    s = d.turnStock(s);
    expect(d.snapshot(s).wasteVisibleCount).toBe(3);
  });

  it("poses screens and selections without side effects", () => {
    let s = d.setMenuIndex(initialState(false), 1);
    s = d.setTitleIndex(s, 1);
    s = d.setScreen(s, "howto");
    expect([s.screen, s.menuIndex, s.titleIndex]).toEqual(["howto", 1, 1]);
  });

  it("reports menu item regions for the current screen only", () => {
    const title = initialState(false);
    expect(d.menuItemRect(title, 0)).toEqual({ x: 480, y: 404, w: 320, h: 56 });
    expect(d.menuItemRect(title, 2)).toBeNull();
    const hud = d.menuItemRect(playing(), 2);
    expect(hud).not.toBeNull();
    expect(hud && hud.y >= 680 && hud.y + hud.h <= 716).toBe(true);
    expect(d.menuItemRect(d.setScreen(title, "won"), 0)).toBeNull();
  });

  it("sets the gates and the cascade's figures", () => {
    let s = d.setLaunchClock(initialState(false), 0.1);
    s = d.addFlyer(s, "clubs", 9, 10, 20, 30, 40);
    const id = s.flyers[0].id;
    s = d.setFlyerPosition(s, id, 50, 60);
    s = d.setFlyerVelocity(s, id, -5, -6);
    expect(d.snapshot(s).flyers[0]).toEqual({
      id,
      suit: "clubs",
      rank: 9,
      x: 50,
      y: 60,
      vx: -5,
      vy: -6,
    });
    expect(d.snapshot(d.removeFlyer(s, id)).flyers).toEqual([]);
    expect(d.clearFlyers(s).flyers).toEqual([]);
    expect(s.launchClock).toBe(0.1);
    const painted = {
      ...s,
      trail: [{ suit: "clubs" as const, rank: 1, x: 0, y: 0 }],
      trailStamps: 1,
    };
    const cleared = d.clearTrail(painted);
    expect([
      cleared.trailStamps,
      cleared.trail.length,
      cleared.flyers.length,
    ]).toEqual([0, 0, 1]);
    const v = d.drawLaunchVx(s);
    expect(Math.abs(v)).toBeGreaterThanOrEqual(180);
    const gated = d.setTrailPainting(
      d.setLaunching(d.setWinDetect(d.setAutoFlip(s, false), false), false),
      false,
    );
    expect(d.snapshot(gated)).toMatchObject({
      autoFlip: false,
      winDetect: false,
      launching: false,
      trailPainting: false,
    });
  });

  it("resets every declared field to the title screen, keeping mute", () => {
    let s = d.deal(playing());
    s = d.pointerDown(s, 1006, 330);
    s = { ...s, muted: true, simTime: 5 };
    const reset = d.reset(s);
    expect(reset).toEqual({ ...initialState(true) });
  });

  it("reconciles the drop target with a table posed under the held run", () => {
    let s = d.addCard(playing(), "tableau", 0, "hearts", 8, true);
    s = d.pointerDown(s, 250, 200);
    s = d.pointerMove(s, 372, 210);
    expect(s.dropTarget).toBeNull();
    s = d.addCard(s, "tableau", 1, "spades", 9, true);
    expect(d.snapshot(s).dropTarget).toEqual({ pile: "tableau", index: 1 });
    const reconciled = d.reconcile(s);
    expect(reconciled.dropTarget).toEqual({ pile: "tableau", index: 1 });
    expect(d.reconcile(reconciled)).toBe(reconciled);
    expect(reconciled.simTime).toBe(s.simTime);
  });
});
