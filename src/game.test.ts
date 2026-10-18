import { describe, expect, it } from "vitest";
import { SUITS } from "./constants";
import { BACKGROUND } from "./game";
import { dispatchPointer, startHarness, tapKey } from "./testing/harness";

describe("the game on the engine", () => {
  it("opens on the title with the debug surface in place", async () => {
    const { engine } = await startHarness();
    await engine.advance(1);
    const snap = engine.debug.snapshot(engine.state);
    expect(snap.screen).toBe("title");
    expect(snap.muted).toBe(false);
    expect(snap.simTime).toBeCloseTo(1 / 60);
    expect(BACKGROUND).toMatch(/^#/);
  });

  it("is driven from the keyboard through the title, how-to, and HUD menus", async () => {
    const h = await startHarness();
    const { engine } = h;
    await tapKey(h, "KeyS");
    await tapKey(h, "Enter");
    expect(engine.state.screen).toBe("howto");
    await tapKey(h, "Escape");
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    await tapKey(h, "ArrowUp");
    await tapKey(h, "Space");
    expect(engine.state.screen).toBe("playing");
    expect(h.cues).toContain("deal");
    await tapKey(h, "ArrowDown");
    await tapKey(h, "ArrowDown");
    await tapKey(h, "Enter");
    await engine.advance(1);
    expect(engine.state.muted).toBe(true);
    await tapKey(h, "Enter");
    expect(engine.state.muted).toBe(false);
    await tapKey(h, "KeyW");
    await tapKey(h, "Enter");
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(0);
  });

  it("answers every pointer sample of a frame in order, a press and release inside one frame both counting", async () => {
    const h = await startHarness();
    const { engine } = h;
    engine.apply((s) =>
      engine.debug.deal(engine.debug.setScreen(s, "playing")),
    );
    dispatchPointer(h, "pointerdown", 270, 90);
    dispatchPointer(h, "pointerup", 270, 90);
    dispatchPointer(h, "pointerdown", 270, 90, "touch");
    dispatchPointer(h, "pointerup", 270, 90, "touch");
    await engine.advance(1);
    const snap = engine.debug.snapshot(engine.state);
    expect(snap.wasteSets).toEqual([3, 3]);
    expect(snap.pointer.down).toBe(false);
    expect(h.cues.filter((c) => c === "turn")).toHaveLength(1);
  });

  it("toggles mute from a debug click on the SOUND control", async () => {
    const { engine } = await startHarness();
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    const rect = engine.debug.menuItemRect(engine.state, 2);
    if (rect === null) throw new Error("no SOUND control");
    engine.apply((s) => engine.debug.pointerDown(s, rect.x + 4, rect.y + 4));
    engine.apply((s) => engine.debug.pointerUp(s, rect.x + 4, rect.y + 4));
    expect(engine.state.menuIndex).toBe(2);
    await engine.advance(1);
    expect(engine.debug.snapshot(engine.state).muted).toBe(true);
  });

  it("wins, cascades, and shows the message, with cues for each stage", async () => {
    const h = await startHarness(1000 / 30);
    const { engine } = h;
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    SUITS.forEach((suit, f) => {
      for (let r = 1; r <= 13; r++) {
        if (f === 3 && r === 13) continue;
        engine.apply((s) =>
          engine.debug.addCard(s, "foundation", f, suit, r, true),
        );
      }
    });
    engine.apply((s) =>
      engine.debug.addCard(s, "tableau", 4, "clubs", 13, true),
    );
    const before = engine.state.tableau[4][0].id;
    engine.apply((s) => engine.debug.pointerDown(s, 760, 200));
    engine.apply((s) => engine.debug.pointerUp(s, 760, 200));
    engine.apply((s) => engine.debug.pointerDown(s, 760, 200));
    expect(engine.state.screen).toBe("won");
    expect(engine.state.foundations[3][12].id).toBe(before);
    await engine.advance(1);
    expect(h.cues).toEqual(expect.arrayContaining(["home", "win", "launch"]));
    expect(engine.state.flyers[0]).toMatchObject({ suit: "spades", rank: 13 });
    for (let i = 0; i < 1500 && !engine.state.cascadeDone; i++)
      await engine.advance(1);
    expect(engine.state.cascadeDone).toBe(true);
    expect(engine.diagnostics().find((r) => r.name === "cascade")?.value).toBe(
      "launched 52, flying 0",
    );
    engine.apply((s) => engine.debug.pointerDown(s, 640, 360));
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
    expect(engine.state.trailStamps).toBe(0);
  }, 60000);

  it("registers the overlay's diagnostic values as pure reads", async () => {
    const { engine } = await startHarness();
    engine.apply((s) => engine.debug.deal(s));
    const readings = engine.diagnostics();
    expect(readings.map((r) => r.name)).toEqual([
      "screen",
      "deal mode",
      "stock",
      "waste",
      "foundations",
      "columns",
      "in hand",
      "cascade",
    ]);
    expect(readings.find((r) => r.name === "columns")?.value).toBe(
      "1 2 3 4 5 6 7",
    );
    expect(readings.find((r) => r.name === "in hand")?.value).toBe("none");
  });

  it("records its drawing on every screen, including the screen copy", async () => {
    const { engine } = await startHarness();
    const texts = new Set<string>();
    const collect = async (): Promise<void> => {
      engine.startRecording();
      await engine.advance(1);
      const rec = engine.stopRecording();
      for (const op of rec.ops) {
        if (op.op === "call" && op.method === "fillText")
          texts.add(String(op.args[0]));
      }
    };
    await collect();
    engine.apply((s) => engine.debug.setScreen(s, "howto"));
    await collect();
    engine.apply((s) =>
      engine.debug.deal(engine.debug.setScreen(s, "playing")),
    );
    engine.apply((s) => engine.debug.pointerDown(s, 1006, 335));
    engine.apply((s) => engine.debug.pointerMove(s, 600, 400));
    await collect();
    engine.apply((s) =>
      engine.debug.setScreen(engine.debug.clearTable(s), "won"),
    );
    engine.apply((s) =>
      engine.debug.addFlyer(s, "hearts", 1, 600, 100, 300, 0),
    );
    await collect();
    for (const t of [
      "CASCADE",
      "KLONDIKE SOLITAIRE",
      "NEW GAME",
      "HOW TO PLAY",
      "DRAW THREE",
      "BACK",
      "MENU",
      "SOUND",
    ]) {
      expect(texts).toContain(t);
    }
    const words = [...texts].join(" ").split(/[\s.,;:()]+/);
    for (const token of ["ACE", "KING", "STOCK", "DOUBLE-CLICK"])
      expect(words).toContain(token);
  });
});
