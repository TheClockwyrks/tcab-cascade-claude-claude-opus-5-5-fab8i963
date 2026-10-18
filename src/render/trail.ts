// Cascade — the painted layer (specs/victory.md).
//
// The layer is the list of stamps the cascade left, held in the state and
// drawn in order beneath everything else on the table. A stamp is opaque over
// its whole footprint, so one buried completely under later stamps adds
// nothing to the picture; the occlusion index below finds those and leaves
// them out, and a corner index buried the same way is left undrawn, which
// keeps a table buried under thousands of stamps cheap to draw while drawing
// the same picture. The index is a drawing resource only:
// it is rebuilt from the stamps whenever they are not the ones it was built
// from.

import { CARD_H, CARD_W, STAGE_H, STAGE_W } from "../constants";
import type { TrailStamp } from "../types";
import { drawStamp, INDEX_BOX } from "./cards";

/** The side of one occlusion cell, in logical units. */
const CELL = 8;
const COLS = Math.ceil(STAGE_W / CELL);
const ROWS = Math.ceil(STAGE_H / CELL);

/**
 * For each cell of the stage, the newest stamp that covers it completely
 * (`-1` for none), and which stamps still show at least one uncovered cell.
 */
export class OcclusionIndex {
  private readonly cover = new Int32Array(COLS * ROWS).fill(-1);
  private visible: number[] = [];
  private stamps: readonly TrailStamp[] = [];

  /** The indices of the stamps that show, oldest first. */
  update(stamps: readonly TrailStamp[]): readonly number[] {
    if (stamps === this.stamps) return this.visible;
    const extends_ =
      stamps.length >= this.stamps.length &&
      (this.stamps.length === 0 ||
        stamps[this.stamps.length - 1] === this.stamps[this.stamps.length - 1]);
    if (!extends_) {
      this.cover.fill(-1);
      this.visible = [];
      this.stamps = [];
    }
    const first = this.stamps.length;
    for (let i = first; i < stamps.length; i++) this.markCover(stamps[i], i);
    const candidates = this.visible;
    for (let i = first; i < stamps.length; i++) candidates.push(i);
    this.visible = candidates.filter((i) => this.shows(stamps[i], i));
    this.stamps = stamps;
    return this.visible;
  }

  private markCover(stamp: TrailStamp, index: number): void {
    const c0 = Math.max(0, Math.ceil(stamp.x / CELL));
    const c1 = Math.min(COLS, Math.floor((stamp.x + CARD_W) / CELL));
    const r0 = Math.max(0, Math.ceil(stamp.y / CELL));
    const r1 = Math.min(ROWS, Math.floor((stamp.y + CARD_H) / CELL));
    for (let r = r0; r < r1; r++) {
      this.cover.fill(index, r * COLS + c0, r * COLS + Math.max(c0, c1));
    }
  }

  private shows(stamp: TrailStamp, index: number): boolean {
    return this.uncovered(index, stamp.x, stamp.y, CARD_W, CARD_H);
  }

  /** Whether any cell of the box lies outside every stamp newer than `index`. */
  uncovered(
    index: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ): boolean {
    const c0 = Math.max(0, Math.floor(x / CELL));
    const c1 = Math.min(COLS, Math.ceil((x + w) / CELL));
    const r0 = Math.max(0, Math.floor(y / CELL));
    const r1 = Math.min(ROWS, Math.ceil((y + h) / CELL));
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        if (this.cover[r * COLS + c] <= index) return true;
      }
    }
    return false;
  }

  /** Which of a showing stamp's two corner indices still show. */
  corners(stamp: TrailStamp, index: number): { top: boolean; bottom: boolean } {
    const b = INDEX_BOX;
    return {
      top: this.uncovered(index, stamp.x + b.x, stamp.y + b.y, b.w, b.h),
      bottom: this.uncovered(
        index,
        stamp.x + CARD_W - b.x - b.w,
        stamp.y + CARD_H - b.y - b.h,
        b.w,
        b.h,
      ),
    };
  }
}

const index = new OcclusionIndex();

/** Draws the painted layer: every stamp that still shows, oldest first. */
export function drawTrail(
  ctx: CanvasRenderingContext2D,
  stamps: readonly TrailStamp[],
): void {
  if (stamps.length === 0) return;
  for (const i of index.update(stamps)) {
    const stamp = stamps[i];
    const corners = index.corners(stamp, i);
    drawStamp(ctx, stamp.x, stamp.y, stamp.suit, stamp.rank, corners);
  }
}
