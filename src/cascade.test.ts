import { describe, expect, it } from "vitest";
import { drawLaunchVx, isOffStage, stepCascade, stepFlyer } from "./cascade";
import { SUITS } from "./constants";
import { createDebugApi } from "./debug";
import type { CascadeState } from "./game";
import { initialState } from "./state";

const d = createDebugApi();

function wonBoard(): CascadeState {
  let s = d.setScreen(initialState(false), "won");
  SUITS.forEach((suit, f) => {
    for (let r = 1; r <= 13; r++)
      s = d.addCard(s, "foundation", f, suit, r, true);
  });
  return d.setLaunchClock(s, 0.18);
}

function run(s: CascadeState, seconds: number, dt: number): CascadeState {
  let next = s;
  for (let t = 0; t < seconds - 1e-9; t += dt) next = stepCascade(next, dt);
  return next;
}

describe("a card in flight", () => {
  it("falls under gravity and moves by its velocity", () => {
    const f = stepFlyer(
      { id: 1, suit: "hearts", rank: 1, x: 100, y: 100, vx: 200, vy: -120 },
      0.1,
    );
    expect(f.vy).toBeCloseTo(60);
    expect(f.x).toBeCloseTo(120);
    expect(f.y).toBeCloseTo(106);
  });

  it("bounces off the floor, damped, keeping its drift", () => {
    const f = stepFlyer(
      { id: 1, suit: "hearts", rank: 1, x: 0, y: 575, vx: 50, vy: 500 },
      0.02,
    );
    expect(f.y).toBe(580);
    expect(f.vy).toBeCloseTo(-(500 + 36) * 0.8);
    expect(f.vx).toBe(50);
  });

  it("retires once wholly past a side edge", () => {
    const base = {
      id: 1,
      suit: "hearts" as const,
      rank: 1,
      y: 0,
      vx: 0,
      vy: 0,
    };
    expect(isOffStage({ ...base, x: -101 })).toBe(true);
    expect(isOffStage({ ...base, x: -99 })).toBe(false);
    expect(isOffStage({ ...base, x: 1281 })).toBe(true);
  });

  it("draws launch speeds of either sign within the range", () => {
    const draws = Array.from({ length: 200 }, () => drawLaunchVx());
    expect(draws.every((v) => Math.abs(v) >= 180 && Math.abs(v) <= 420)).toBe(
      true,
    );
    expect(draws.some((v) => v < 0)).toBe(true);
    expect(draws.some((v) => v > 0)).toBe(true);
    expect(drawLaunchVx(() => 0)).toBe(-180);
  });
});

describe("the cascade", () => {
  it("launches the first card on its first frame, cycling the foundations King first", () => {
    let s = stepCascade(wonBoard(), 1 / 60);
    expect(s.launched).toBe(1);
    expect(s.flyers[0]).toMatchObject({
      suit: "spades",
      rank: 13,
      x: 590,
      y: 24,
      vy: -120,
    });
    s = run(s, 0.54, 1 / 60);
    expect(s.flyers.map((f) => f.suit).slice(0, 4)).toEqual([
      "spades",
      "hearts",
      "diamonds",
      "clubs",
    ]);
  });

  it("launches floor(t / 0.18) + 1 cards after t seconds, however the time is divided", () => {
    const coarse = run(wonBoard(), 1.0, 0.05);
    const fine = run(wonBoard(), 1.0, 0.005);
    expect(coarse.launched).toBe(Math.floor(1.0 / 0.18) + 1);
    expect(fine.launched).toBe(coarse.launched);
  });

  it("skips emptied foundations", () => {
    let s = d.setScreen(initialState(false), "won");
    s = d.addCard(s, "foundation", 0, "hearts", 1, true);
    s = d.addCard(s, "foundation", 0, "hearts", 2, true);
    s = d.addCard(s, "foundation", 2, "clubs", 1, true);
    s = d.setLaunchClock(s, 0.18);
    s = run(s, 0.4, 0.02);
    expect(s.flyers.map((f) => `${f.suit}${f.rank}`)).toEqual([
      "hearts2",
      "clubs1",
      "hearts1",
    ]);
  });

  it("finishes once every card has launched and left", () => {
    let s = wonBoard();
    for (let i = 0; i < 2000 && !s.cascadeDone; i++) s = stepCascade(s, 1 / 30);
    expect(s.cascadeDone).toBe(true);
    expect(s.launched).toBe(52);
    expect(s.flyers).toEqual([]);
    expect(s.trailStamps).toBe(s.trail.length);
    expect(s.trailStamps).toBeGreaterThan(52);
  });

  it("stops launching when the gate is off and painting when that gate is off", () => {
    let s = d.setLaunching(wonBoard(), false);
    s = run(s, 1, 0.05);
    expect(s.launched).toBe(0);
    s = d.setTrailPainting(d.setLaunching(s, true), false);
    s = run(s, 0.5, 0.05);
    expect(s.launched).toBeGreaterThan(0);
    expect(s.trailStamps).toBe(0);
  });

  it("flies posed flyers on any screen without counting them as launches", () => {
    let s = d.addFlyer(
      d.setScreen(initialState(false), "playing"),
      "hearts",
      4,
      1200,
      100,
      400,
      0,
    );
    s = run(s, 1, 0.05);
    expect(s.flyers).toEqual([]);
    expect(s.launched).toBe(0);
    expect(s.cascadeDone).toBe(false);
    expect(s.trailStamps).toBeGreaterThan(0);
  });

  it("carries a flyer the same distance whether stepped once or sixty times", () => {
    const s = d.addFlyer(initialState(false), "hearts", 4, 100, 100, 240, 0);
    const once = stepCascade(s, 1).flyers[0];
    const many = run(s, 1, 1 / 60).flyers[0];
    expect(many.x).toBeCloseTo(once.x, 6);
  });
});
