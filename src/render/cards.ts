// Cascade — drawing a card, a card back, an empty slot, and a painted stamp.
//
// Every card is drawn in code from shapes and text: the suit pips are paths,
// the rank is text, and the back is a lattice. Nothing here reads the state.

import { CARD_H, CARD_W } from "../constants";
import type { Suit } from "../game";
import { suitColor } from "../cards";
import { FONT_SERIF, PALETTE } from "./palette";

type Ctx = CanvasRenderingContext2D;

const CORNER_RADIUS = 9;

/** Traces a rounded rectangle as the current path. */
export function roundedRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function rankLabel(rank: number): string {
  switch (rank) {
    case 1:
      return "A";
    case 11:
      return "J";
    case 12:
      return "Q";
    case 13:
      return "K";
    default:
      return String(rank);
  }
}

export function inkFor(suit: Suit): string {
  return suitColor(suit) === "red" ? PALETTE.red : PALETTE.black;
}

/**
 * Fills a suit pip centred on (cx, cy), `size` units tall. `invert` turns it
 * upside down, as the pips on a card's lower half are drawn.
 */
export function drawPip(
  ctx: Ctx,
  suit: Suit,
  cx: number,
  cy: number,
  size: number,
  invert = false,
): void {
  const s = size / 2;
  const d = invert ? -1 : 1;
  ctx.fillStyle = inkFor(suit);
  ctx.beginPath();
  switch (suit) {
    case "diamonds":
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s * 0.72, cy);
      ctx.lineTo(cx, cy + s);
      ctx.lineTo(cx - s * 0.72, cy);
      ctx.closePath();
      break;
    case "hearts":
      ctx.moveTo(cx, cy + s * d);
      ctx.bezierCurveTo(
        cx - s * 1.25,
        cy + s * 0.05 * d,
        cx - s * 0.95,
        cy - s * 1.05 * d,
        cx,
        cy - s * 0.45 * d,
      );
      ctx.bezierCurveTo(
        cx + s * 0.95,
        cy - s * 1.05 * d,
        cx + s * 1.25,
        cy + s * 0.05 * d,
        cx,
        cy + s * d,
      );
      ctx.closePath();
      break;
    case "spades":
      ctx.moveTo(cx, cy - s * d);
      ctx.bezierCurveTo(
        cx + s * 1.3,
        cy - s * 0.1 * d,
        cx + s * 0.85,
        cy + s * 0.85 * d,
        cx + s * 0.06,
        cy + s * 0.38 * d,
      );
      ctx.lineTo(cx + s * 0.38, cy + s * d);
      ctx.lineTo(cx - s * 0.38, cy + s * d);
      ctx.lineTo(cx - s * 0.06, cy + s * 0.38 * d);
      ctx.bezierCurveTo(
        cx - s * 0.85,
        cy + s * 0.85 * d,
        cx - s * 1.3,
        cy - s * 0.1 * d,
        cx,
        cy - s * d,
      );
      ctx.closePath();
      break;
    case "clubs": {
      const r = s * 0.42;
      ctx.arc(cx, cy - s * 0.48 * d, r, 0, Math.PI * 2);
      ctx.moveTo(cx - s * 0.46 + r, cy + s * 0.12 * d);
      ctx.arc(cx - s * 0.46, cy + s * 0.12 * d, r, 0, Math.PI * 2);
      ctx.moveTo(cx + s * 0.46 + r, cy + s * 0.12 * d);
      ctx.arc(cx + s * 0.46, cy + s * 0.12 * d, r, 0, Math.PI * 2);
      ctx.moveTo(cx - s * 0.1, cy + s * 0.05 * d);
      ctx.lineTo(cx + s * 0.1, cy + s * 0.05 * d);
      ctx.lineTo(cx + s * 0.36, cy + s * d);
      ctx.lineTo(cx - s * 0.36, cy + s * d);
      ctx.closePath();
      break;
    }
  }
  ctx.fill();
}

// Pip positions on the face, as fractions of the card: columns and rows.
const L = 0.35;
const C = 0.5;
const R = 0.65;
const PIP_LAYOUTS: Readonly<
  Record<number, readonly (readonly [number, number])[]>
> = {
  2: [
    [C, 0.22],
    [C, 0.78],
  ],
  3: [
    [C, 0.22],
    [C, 0.5],
    [C, 0.78],
  ],
  4: [
    [L, 0.22],
    [R, 0.22],
    [L, 0.78],
    [R, 0.78],
  ],
  5: [
    [L, 0.22],
    [R, 0.22],
    [C, 0.5],
    [L, 0.78],
    [R, 0.78],
  ],
  6: [
    [L, 0.22],
    [R, 0.22],
    [L, 0.5],
    [R, 0.5],
    [L, 0.78],
    [R, 0.78],
  ],
  7: [
    [L, 0.22],
    [R, 0.22],
    [C, 0.36],
    [L, 0.5],
    [R, 0.5],
    [L, 0.78],
    [R, 0.78],
  ],
  8: [
    [L, 0.22],
    [R, 0.22],
    [C, 0.36],
    [L, 0.5],
    [R, 0.5],
    [C, 0.64],
    [L, 0.78],
    [R, 0.78],
  ],
  9: [
    [L, 0.22],
    [R, 0.22],
    [L, 0.407],
    [R, 0.407],
    [C, 0.5],
    [L, 0.593],
    [R, 0.593],
    [L, 0.78],
    [R, 0.78],
  ],
  10: [
    [L, 0.22],
    [R, 0.22],
    [C, 0.314],
    [L, 0.407],
    [R, 0.407],
    [L, 0.593],
    [R, 0.593],
    [C, 0.686],
    [L, 0.78],
    [R, 0.78],
  ],
};

/** The rank and a small pip in a card's top-left corner, and again turned in the bottom-right. */
function drawTopIndex(
  ctx: Ctx,
  x: number,
  y: number,
  suit: Suit,
  rank: number,
): void {
  const label = rankLabel(rank);
  ctx.fillStyle = inkFor(suit);
  ctx.font = `bold ${label.length > 1 ? 20 : 23}px ${FONT_SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 15, y + 18);
  drawPip(ctx, suit, x + 15, y + 39, 15);
}

/** The same index, turned about the card's centre into the bottom-right corner. */
function drawBottomIndex(
  ctx: Ctx,
  x: number,
  y: number,
  suit: Suit,
  rank: number,
): void {
  ctx.save();
  ctx.translate(x + CARD_W, y + CARD_H);
  ctx.rotate(Math.PI);
  drawTopIndex(ctx, 0, 0, suit, rank);
  ctx.restore();
}

/** The box a corner index occupies, relative to the card's top-left. */
export const INDEX_BOX = { x: 4, y: 4, w: 24, h: 46 } as const;

function drawCourt(
  ctx: Ctx,
  x: number,
  y: number,
  suit: Suit,
  rank: number,
): void {
  const fx = x + 27;
  const fy = y + 22;
  const fw = CARD_W - 54;
  const fh = CARD_H - 44;
  ctx.fillStyle =
    suitColor(suit) === "red" ? PALETTE.courtRed : PALETTE.courtBlack;
  roundedRect(ctx, fx, fy, fw, fh, 5);
  ctx.fill();
  ctx.strokeStyle = inkFor(suit);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(fx + 6, y + 84, fw - 12, 2);
  ctx.fillStyle = inkFor(suit);
  ctx.font = `bold 38px ${FONT_SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(rankLabel(rank), x + CARD_W / 2, y + 58);
  drawPip(ctx, suit, x + CARD_W / 2, y + 101, 18);
}

/** A face-up card: its rank and suit in two corners and its pips between. */
export function drawCardFace(
  ctx: Ctx,
  x: number,
  y: number,
  suit: Suit,
  rank: number,
): void {
  roundedRect(ctx, x, y, CARD_W, CARD_H, CORNER_RADIUS);
  ctx.fillStyle = PALETTE.face;
  ctx.fill();
  ctx.strokeStyle = PALETTE.faceEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawTopIndex(ctx, x, y, suit, rank);
  drawBottomIndex(ctx, x, y, suit, rank);
  if (rank === 1) {
    drawPip(ctx, suit, x + CARD_W / 2, y + CARD_H / 2, 50);
  } else if (rank > 10) {
    drawCourt(ctx, x, y, suit, rank);
  } else {
    for (const [px, py] of PIP_LAYOUTS[rank] ?? []) {
      drawPip(ctx, suit, x + px * CARD_W, y + py * CARD_H, 17, py > 0.55);
    }
  }
}

/** A face-down card: a navy lattice inside a cream border. */
export function drawCardBack(ctx: Ctx, x: number, y: number): void {
  roundedRect(ctx, x, y, CARD_W, CARD_H, CORNER_RADIUS);
  ctx.fillStyle = PALETTE.backEdge;
  ctx.fill();
  ctx.strokeStyle = PALETTE.backOutline;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const ix = x + 7;
  const iy = y + 7;
  const iw = CARD_W - 14;
  const ih = CARD_H - 14;
  roundedRect(ctx, ix, iy, iw, ih, 5);
  ctx.fillStyle = PALETTE.back;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = PALETTE.backLattice;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = -ih; k < iw; k += 13) {
    ctx.moveTo(ix + k, iy);
    ctx.lineTo(ix + k + ih, iy + ih);
    ctx.moveTo(ix + k + ih, iy);
    ctx.lineTo(ix + k, iy + ih);
  }
  ctx.stroke();
  ctx.restore();
  // A medallion at the centre: a cream diamond around a gold one.
  const cx = x + CARD_W / 2;
  const cy = y + CARD_H / 2;
  diamond(ctx, cx, cy, 17, 24);
  ctx.fillStyle = PALETTE.backEdge;
  ctx.fill();
  diamond(ctx, cx, cy, 10, 15);
  ctx.fillStyle = PALETTE.gold;
  ctx.fill();
}

function diamond(
  ctx: Ctx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.lineTo(cx + rx, cy);
  ctx.lineTo(cx, cy + ry);
  ctx.lineTo(cx - rx, cy);
  ctx.closePath();
}

/** An empty pile's slot: a dashed outline and an optional faint mark. */
export function drawSlot(ctx: Ctx, x: number, y: number, mark = ""): void {
  roundedRect(ctx, x + 1, y + 1, CARD_W - 2, CARD_H - 2, CORNER_RADIUS);
  ctx.fillStyle = PALETTE.slotFill;
  ctx.fill();
  ctx.setLineDash([7, 5]);
  ctx.strokeStyle = PALETTE.slotEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  if (mark !== "") {
    ctx.fillStyle = PALETTE.slotMark;
    ctx.font = `bold 40px ${FONT_SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mark, x + CARD_W / 2, y + CARD_H / 2 + 2);
  }
}

/**
 * A card as the painted layer stamps it: square-cornered and opaque over its
 * whole footprint, so a later stamp hides it exactly, with whichever of its
 * corner indices still shows.
 */
export function drawStamp(
  ctx: Ctx,
  x: number,
  y: number,
  suit: Suit,
  rank: number,
  corners: { readonly top: boolean; readonly bottom: boolean },
): void {
  ctx.fillStyle = PALETTE.stampEdge;
  ctx.fillRect(x, y, CARD_W, CARD_H);
  ctx.fillStyle = PALETTE.face;
  ctx.fillRect(x + 1.5, y + 1.5, CARD_W - 3, CARD_H - 3);
  if (corners.top) drawTopIndex(ctx, x, y, suit, rank);
  if (corners.bottom) drawBottomIndex(ctx, x, y, suit, rank);
}
