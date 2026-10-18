// Cascade — a headless engine for the build's own tests and captures.
//
// Stands the real engine up over an `@napi-rs/canvas` canvas with a surface of
// its own and a constant clock, so a test steps the game with `advance` and
// drives it through the debug surface or through dispatched pointer events.

import { createCanvas, type Canvas } from "@napi-rs/canvas";
import {
  ConstantClock,
  createEngine,
  type Engine,
} from "@clockwyrks/simple-2d";
import { STAGE_H, STAGE_W } from "../constants";
import {
  BACKGROUND,
  game,
  type CascadeDebugApi,
  type CascadeState,
} from "../game";

export interface Harness {
  readonly engine: Engine<CascadeState, CascadeDebugApi>;
  readonly canvas: Canvas;
  readonly events: EventTarget;
  /** The cue names played since the harness started, in order. */
  readonly cues: string[];
}

export async function startHarness(stepMs = 1000 / 60): Promise<Harness> {
  const canvas = createCanvas(STAGE_W, STAGE_H);
  const events = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: STAGE_W,
    height: STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => STAGE_W,
      cssHeight: () => STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  const cues: string[] = [];
  engine.events.on("cue:played", (event) => cues.push(event.cue));
  await engine.initialize();
  return { engine, canvas, events, cues };
}

type PointerKind = "pointerdown" | "pointermove" | "pointerup";

/** Dispatches a pointer event as a browser would, at a stage point. */
export function dispatchPointer(
  harness: Harness,
  type: PointerKind,
  x: number,
  y: number,
  pointerType: "mouse" | "touch" = "mouse",
): void {
  const down = type === "pointerdown" || type === "pointermove";
  const event = Object.assign(new Event(type), {
    clientX: x,
    clientY: y,
    pointerId: pointerType === "mouse" ? 1 : 7,
    pointerType,
    isPrimary: true,
    button: type === "pointermove" ? -1 : 0,
    buttons: down && type !== "pointermove" ? 1 : 0,
  });
  harness.events.dispatchEvent(event);
}

/** Dispatches a key press and its release, a frame apart. */
export async function tapKey(harness: Harness, code: string): Promise<void> {
  harness.events.dispatchEvent(
    Object.assign(new Event("keydown"), { code, key: code, repeat: false }),
  );
  await harness.engine.advance(1);
  harness.events.dispatchEvent(
    Object.assign(new Event("keyup"), { code, key: code, repeat: false }),
  );
}
