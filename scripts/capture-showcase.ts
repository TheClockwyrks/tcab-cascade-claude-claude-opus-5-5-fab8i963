// Captures the showcase media from real play.
//
//   node scripts/run-ts.mjs scripts/capture-showcase.ts [seed]
//
// The game is dealt from its own title screen with a seeded `Math.random`, a
// small solver finds a line of play that wins that deal, and the line is then
// played through the engine's real input path: pointer events dispatched at
// the surface the engine listens on, exactly as a browser delivers them —
// clicks on the stock, drags between piles, and double clicks to send cards
// home. Nothing is posed through the debug surface. The recorder captures the
// game's own drawing, and screenshots are the engine's canvas.

import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import {
  CARD_H,
  CARD_W,
  COLUMN_X,
  FOUNDATION_X,
  STOCK_X,
  TOP_ROW_Y,
} from "../src/constants";
import type { CascadeState } from "../src/game";
import {
  columnCardYs,
  menuRect,
  wasteFanCount,
  wasteFanX,
} from "../src/layout";
import {
  dealTable,
  pileCards,
  sendHome,
  tryMove,
  turnStock,
} from "../src/rules";
import { initialState } from "../src/state";
import {
  dispatchPointer,
  startHarness,
  type Harness,
} from "../src/testing/harness";
import type { PileRef } from "../src/types";

const OUT = "showcase";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- A solver over the game's own rules ------------------------------------

type Move =
  | { readonly kind: "turn" }
  | { readonly kind: "home"; readonly from: PileRef }
  | {
      readonly kind: "move";
      readonly from: PileRef;
      readonly row: number;
      readonly to: PileRef;
    };

function key(s: CascadeState): string {
  const ids = (cards: readonly { id: number; faceUp: boolean }[]) =>
    cards.map((c) => (c.faceUp ? c.id : -c.id)).join(",");
  return [
    ids(s.stock),
    ids(s.waste),
    s.wasteSets.join(","),
    s.foundations.map((p) => p.length).join(","),
    ...s.tableau.map(ids),
  ].join("|");
}

function candidates(s: CascadeState): Move[] {
  const homes: Move[] = [];
  const exposing: Move[] = [];
  const fromWaste: Move[] = [];
  const others: Move[] = [];
  const sources: PileRef[] = [{ pile: "waste", index: 0 }];
  for (let c = 0; c < 7; c++) sources.push({ pile: "tableau", index: c });
  for (const from of sources) homes.push({ kind: "home", from });
  for (let c = 0; c < 7; c++) {
    const column = s.tableau[c];
    for (let row = 0; row < column.length; row++) {
      if (!column[row].faceUp) continue;
      for (let t = 0; t < 7; t++) {
        if (t === c) continue;
        if (row === 0 && s.tableau[t].length === 0) continue;
        const move: Move = {
          kind: "move",
          from: { pile: "tableau", index: c },
          row,
          to: { pile: "tableau", index: t },
        };
        if (row === 0 || !column[row - 1].faceUp) exposing.push(move);
        else others.push(move);
      }
    }
  }
  for (let t = 0; t < 7; t++) {
    fromWaste.push({
      kind: "move",
      from: { pile: "waste", index: 0 },
      row: s.waste.length - 1,
      to: { pile: "tableau", index: t },
    });
  }
  return [...homes, ...exposing, ...fromWaste, { kind: "turn" }, ...others];
}

function apply(s: CascadeState, move: Move): CascadeState | null {
  if (move.kind === "turn") {
    if (s.stock.length === 0 && s.waste.length === 0) return null;
    return turnStock(s);
  }
  if (move.kind === "home") {
    const [next, ok] = sendHome(s, move.from);
    return ok ? next : null;
  }
  if (move.row < 0) return null;
  const [next, ok] = tryMove(s, move.from, move.row, move.to);
  return ok ? next : null;
}

function solve(start: CascadeState, limit: number): Move[] | null {
  const seen = new Set<string>();
  const path: Move[] = [];
  let nodes = 0;
  const dfs = (s: CascadeState): boolean => {
    if (s.screen === "won") return true;
    if (++nodes > limit) return false;
    const k = key(s);
    if (seen.has(k)) return false;
    seen.add(k);
    for (const move of candidates(s)) {
      const next = apply(s, move);
      if (next === null) continue;
      path.push(move);
      if (dfs({ ...next, pendingCues: [] })) return true;
      path.pop();
    }
    return false;
  };
  return dfs(start) ? path : null;
}

// ---- Playing a move by hand ---------------------------------------------------

async function frames(h: Harness, n: number): Promise<void> {
  await h.engine.advance(n);
}

async function click(h: Harness, x: number, y: number): Promise<void> {
  dispatchPointer(h, "pointerdown", x, y);
  await frames(h, 2);
  dispatchPointer(h, "pointerup", x, y);
  await frames(h, 1);
}

async function drag(
  h: Harness,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Promise<void> {
  dispatchPointer(h, "pointerdown", x0, y0);
  await frames(h, 3);
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t * t * (3 - 2 * t);
    dispatchPointer(
      h,
      "pointermove",
      x0 + (x1 - x0) * ease,
      y0 + (y1 - y0) * ease,
    );
    await frames(h, 1);
  }
  await frames(h, 3);
  dispatchPointer(h, "pointerup", x1, y1);
  await frames(h, 1);
}

/** Where a card of a pile is drawn, so a press can land on it. */
function cardPoint(
  s: CascadeState,
  ref: PileRef,
  row: number,
): { x: number; y: number } {
  if (ref.pile === "tableau") {
    const ys = columnCardYs(s.tableau[ref.index]);
    const last = row === s.tableau[ref.index].length - 1;
    return {
      x: COLUMN_X[ref.index] + CARD_W / 2,
      y: ys[row] + (last ? CARD_H / 2 : 12),
    };
  }
  if (ref.pile === "waste") {
    return {
      x: wasteFanX(wasteFanCount(s) - 1) + CARD_W / 2 + 20,
      y: TOP_ROW_Y + CARD_H / 2,
    };
  }
  return { x: FOUNDATION_X[ref.index] + CARD_W / 2, y: TOP_ROW_Y + CARD_H / 2 };
}

async function play(h: Harness, move: Move): Promise<void> {
  const s = h.engine.state as CascadeState;
  if (move.kind === "turn") {
    await click(h, STOCK_X + CARD_W / 2, TOP_ROW_Y + CARD_H / 2);
    await frames(h, 10);
    return;
  }
  if (move.kind === "home") {
    const row = pileCards(s, move.from).length - 1;
    const p = cardPoint(s, move.from, row);
    await click(h, p.x, p.y);
    await frames(h, 4);
    await click(h, p.x, p.y);
    // Long enough that the next press is never read as a third click.
    await frames(h, 24);
    return;
  }
  const p = cardPoint(s, move.from, move.row);
  const lead =
    move.from.pile === "tableau"
      ? columnCardYs(s.tableau[move.from.index])[move.row]
      : TOP_ROW_Y;
  const leadX =
    move.from.pile === "waste"
      ? wasteFanX(wasteFanCount(s) - 1)
      : COLUMN_X[move.from.index];
  const target = s.tableau[move.to.index];
  const ys = columnCardYs(target);
  const targetY = target.length === 0 ? 180 : ys[ys.length - 1] + 34;
  const dx = COLUMN_X[move.to.index] - leadX;
  const dy = targetY - lead;
  await drag(h, p.x, p.y, p.x + dx, p.y + dy);
  await frames(h, 10);
}

function verify(h: Harness, expected: CascadeState, move?: Move): void {
  if (key(h.engine.state as CascadeState) !== key(expected)) {
    console.error(JSON.stringify(move));
    console.error(key(h.engine.state as CascadeState));
    console.error(key(expected));
    throw new Error("the played table diverged from the solved line");
  }
}

async function save(name: string, data: Buffer): Promise<void> {
  writeFileSync(`${OUT}/${name}`, data);
  console.log(`${name}: ${(data.length / 1024).toFixed(0)} KiB`);
}

export default async function capture(seedArg?: string): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const realRandom = Math.random;

  // Find a deal the solver wins.
  let seed = seedArg === undefined ? 1 : Number(seedArg);
  let line: Move[] | null = null;
  for (; line === null; seed++) {
    const dealt = dealTable(
      { ...initialState(false), screen: "playing" },
      mulberry32(seed),
    );
    line = solve({ ...dealt, pendingCues: [] }, 400000);
    console.log(
      `seed ${seed}: ${line === null ? "no win found" : `${line.length} moves`}`,
    );
    if (line !== null) break;
  }
  if (line === null) throw new Error("no deal found");

  // The title screen, as the game opens.
  const h = await startHarness();
  await frames(h, 2);
  await save("title.png", h.canvas.toBuffer("image/png"));

  // Deal from the title's own NEW GAME, with the solved seed.
  Math.random = mulberry32(seed);
  const newGame = menuRect("title", 0);
  if (newGame === null) throw new Error("no NEW GAME");
  dispatchPointer(h, "pointermove", newGame.x + 40, newGame.y + 20);
  await click(h, newGame.x + newGame.w / 2, newGame.y + newGame.h / 2);
  Math.random = realRandom;
  await frames(h, 20);

  let expected = {
    ...dealTable(
      { ...initialState(false), screen: "playing" },
      mulberry32(seed),
    ),
    pendingCues: [],
  };
  verify(h, expected);

  // Live play: the opening moves of the game, recorded.
  const PLAY_MOVES = 14;
  h.engine.startRecording();
  for (let i = 0; i < line.length - 1; i++) {
    if (i === PLAY_MOVES) {
      await save(
        "play.json.gz",
        gzipSync(JSON.stringify(h.engine.stopRecording())),
      );
    }
    await play(h, line[i]);
    const next = apply(expected, line[i]);
    if (next === null) throw new Error("solved move refused");
    expected = { ...next, pendingCues: [] };
    verify(h, expected, line[i]);
    if (i === Math.floor(line.length * 0.45)) {
      await save("table.png", h.canvas.toBuffer("image/png"));
    }
  }

  // The last card home, and the cascade it sets off, at 30 frames a second.
  h.engine.setClock(
    new (await import("@clockwyrks/simple-2d")).ConstantClock(1000 / 30),
  );
  h.engine.startRecording();
  await play(h, line[line.length - 1]);
  if (h.engine.state.screen !== "won") throw new Error("the line did not win");
  let t = 0;
  while (!h.engine.state.cascadeDone && t < 2000) {
    await frames(h, 1);
    t++;
  }
  await frames(h, 45);
  await save(
    "cascade.json.gz",
    gzipSync(JSON.stringify(h.engine.stopRecording())),
  );
  await save("won.png", h.canvas.toBuffer("image/png"));
  console.log(`seed ${seed}, ${line.length} moves, cascade ${t} frames`);
}
