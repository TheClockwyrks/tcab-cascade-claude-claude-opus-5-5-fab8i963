// Cascade — drawing a frame: the felt, the thirteen piles, the hand, the
// cascade, the HUD, and the four screens (specs/table.md, specs/screens.md).
//
// Every function here reads the state and draws; none of them returns
// anything or changes what it was handed.

import type { DeepReadonly } from "ts-essentials";
import {
  CARD_H,
  CARD_W,
  COLUMN_X,
  DEAL_MODE_LABEL,
  FACE_UP_OFFSET,
  FOUNDATION_X,
  HUD_H,
  HUD_ITEMS,
  HUD_Y,
  HOWTO_BACK_LABEL,
  STAGE_H,
  STAGE_W,
  STOCK_X,
  TABLEAU_Y,
  TAGLINE_TEXT,
  TITLE_ITEMS,
  TITLE_TEXT,
  TOP_ROW_Y,
  WASTE_X,
  WIN_TEXT,
} from "../constants";
import type { CascadeState, Suit } from "../game";
import { columnCardYs, menuRect, wasteFanCount, wasteFanX } from "../layout";
import type { Rect } from "../types";
import { drawCardBack, drawCardFace, drawSlot, roundedRect } from "./cards";
import { FONT_SANS, FONT_SERIF, PALETTE } from "./palette";
import { drawTrail } from "./trail";

type Ctx = CanvasRenderingContext2D;
type State = DeepReadonly<CascadeState>;

/** The how-to copy, a line at a time; an empty string is a paragraph break. */
export const HOWTO_LINES: readonly string[] = [
  "Build all four foundations, one suit each, from ACE up to KING.",
  "",
  "In the seven columns, stack cards down in rank and alternate red and black:",
  "a red 7 goes on a black 8. Drag a face-up card to move it with every card",
  "below it. Only a KING (or a run led by one) fills an empty column.",
  "",
  "Click the STOCK to turn three cards onto the waste; only the front one plays.",
  "When the STOCK runs out, click its empty slot to gather the waste back.",
  "",
  "Drag any card where it fits, or DOUBLE-CLICK a card to send it home",
  "to its foundation. Free every buried card and the table cascades.",
];

// ---- Shared pieces ---------------------------------------------------------

function drawFelt(ctx: Ctx): void {
  const glow = ctx.createRadialGradient(640, 300, 80, 640, 360, 820);
  glow.addColorStop(0, PALETTE.feltCenter);
  glow.addColorStop(1, PALETTE.feltEdge);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = "center",
): void {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}

function drawButton(
  ctx: Ctx,
  rect: Rect,
  label: string,
  selected: boolean,
  size: number,
): void {
  roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, Math.min(10, rect.h / 2));
  ctx.fillStyle = selected ? PALETTE.buttonSelected : PALETTE.button;
  ctx.fill();
  ctx.strokeStyle = selected ? PALETTE.highlight : PALETTE.buttonEdge;
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.stroke();
  text(
    ctx,
    label,
    rect.x + rect.w / 2,
    rect.y + rect.h / 2 + 1,
    `bold ${size}px ${FONT_SANS}`,
    selected ? PALETTE.textDark : PALETTE.text,
  );
}

function drawLiftShadow(ctx: Ctx, x: number, y: number, h: number): void {
  roundedRect(ctx, x + 6, y + 10, CARD_W, h, 10);
  ctx.fillStyle = PALETTE.shadow;
  ctx.fill();
}

function drawHighlight(ctx: Ctx, rect: Rect): void {
  roundedRect(ctx, rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8, 12);
  ctx.fillStyle = PALETTE.highlightFill;
  ctx.fill();
  ctx.strokeStyle = PALETTE.highlight;
  ctx.lineWidth = 4;
  ctx.stroke();
}

/** A circular arrow, the mark of a stock that recycles on its next click. */
function drawRecycleMark(ctx: Ctx, x: number, y: number): void {
  const cx = x + CARD_W / 2;
  const cy = y + CARD_H / 2;
  ctx.strokeStyle = PALETTE.slotMark;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 22, -Math.PI * 0.35, Math.PI * 1.45);
  ctx.stroke();
  const ax = cx + 22 * Math.cos(-Math.PI * 0.35);
  const ay = cy + 22 * Math.sin(-Math.PI * 0.35);
  ctx.fillStyle = PALETTE.slotMark;
  ctx.beginPath();
  ctx.moveTo(ax + 10, ay - 4);
  ctx.lineTo(ax - 6, ay - 10);
  ctx.lineTo(ax - 2, ay + 8);
  ctx.closePath();
  ctx.fill();
}

function drawCard(
  ctx: Ctx,
  x: number,
  y: number,
  card: { suit: Suit; rank: number; faceUp: boolean },
): void {
  if (card.faceUp) drawCardFace(ctx, x, y, card.suit, card.rank);
  else drawCardBack(ctx, x, y);
}

// ---- The table -------------------------------------------------------------

function drawStock(ctx: Ctx, state: State): void {
  const count = state.stock.length;
  if (count === 0) {
    drawSlot(ctx, STOCK_X, TOP_ROW_Y);
    if (state.waste.length > 0) drawRecycleMark(ctx, STOCK_X, TOP_ROW_Y);
    return;
  }
  // A thicker stock shows a couple of card edges beneath its top card.
  const depth = Math.min(2, Math.floor((count - 1) / 8));
  for (let i = depth; i >= 0; i--)
    drawCardBack(ctx, STOCK_X - i * 2, TOP_ROW_Y - i * 2);
}

function drawWaste(ctx: Ctx, state: State): void {
  const fan = wasteFanCount(state);
  const shownSets =
    state.wasteSets.length > 0 && (fan > 0 || state.drag?.fromPile === "waste");
  if (!shownSets || state.waste.length === 0) {
    drawSlot(ctx, WASTE_X, TOP_ROW_Y);
    return;
  }
  const squared = state.waste.length - fan;
  if (squared > 0) drawCard(ctx, WASTE_X, TOP_ROW_Y, state.waste[squared - 1]);
  for (let i = 0; i < fan; i++) {
    drawCard(ctx, wasteFanX(i), TOP_ROW_Y, state.waste[squared + i]);
  }
}

/** The foundations' empty slots, their cards, or both. */
function drawFoundations(
  ctx: Ctx,
  state: State,
  part: "slots" | "cards" | "all" = "all",
): void {
  state.foundations.forEach((pile, f) => {
    const x = FOUNDATION_X[f];
    const top = pile[pile.length - 1];
    if (top === undefined) {
      if (part !== "cards") drawSlot(ctx, x, TOP_ROW_Y, "A");
      return;
    }
    if (part === "slots") return;
    if (pile.length > 1) drawCard(ctx, x, TOP_ROW_Y, pile[pile.length - 2]);
    drawCard(ctx, x, TOP_ROW_Y, top);
  });
}

function drawColumns(ctx: Ctx, state: State): void {
  state.tableau.forEach((column, c) => {
    const x = COLUMN_X[c];
    if (column.length === 0) {
      drawSlot(ctx, x, TABLEAU_Y, "K");
      return;
    }
    const ys = columnCardYs(column);
    column.forEach((card, row) => drawCard(ctx, x, ys[row], card));
  });
}

function targetRect(state: State): Rect | null {
  const target = state.dropTarget;
  if (target === null) return null;
  if (target.pile === "foundation") {
    return {
      x: FOUNDATION_X[target.index],
      y: TOP_ROW_Y,
      w: CARD_W,
      h: CARD_H,
    };
  }
  const column = state.tableau[target.index];
  const ys = columnCardYs(column);
  const y = ys[ys.length - 1] ?? TABLEAU_Y;
  return { x: COLUMN_X[target.index], y, w: CARD_W, h: CARD_H };
}

function drawHand(ctx: Ctx, state: State): void {
  const drag = state.drag;
  if (drag === null) return;
  const height = CARD_H + (drag.cards.length - 1) * FACE_UP_OFFSET;
  drawLiftShadow(ctx, drag.x, drag.y, height);
  drag.cards.forEach((card, i) =>
    drawCard(ctx, drag.x, drag.y + i * FACE_UP_OFFSET, card),
  );
}

function drawFlyers(ctx: Ctx, state: State): void {
  for (const flyer of state.flyers)
    drawCardFace(ctx, flyer.x, flyer.y, flyer.suit, flyer.rank);
}

function drawTable(ctx: Ctx, state: State): void {
  drawTrail(ctx, state.trail);
  drawStock(ctx, state);
  drawWaste(ctx, state);
  drawFoundations(ctx, state);
  drawColumns(ctx, state);
  const target = targetRect(state);
  if (target !== null) drawHighlight(ctx, target);
}

// ---- The HUD ---------------------------------------------------------------

function drawSpeaker(
  ctx: Ctx,
  x: number,
  y: number,
  muted: boolean,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x + 5, y - 4);
  ctx.lineTo(x + 11, y - 9);
  ctx.lineTo(x + 11, y + 9);
  ctx.lineTo(x + 5, y + 4);
  ctx.lineTo(x, y + 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (muted) {
    ctx.moveTo(x + 15, y - 5);
    ctx.lineTo(x + 24, y + 5);
    ctx.moveTo(x + 24, y - 5);
    ctx.lineTo(x + 15, y + 5);
  } else {
    ctx.arc(x + 12, y, 7, -Math.PI / 4, Math.PI / 4);
    ctx.moveTo(
      x + 12 + 12 * Math.cos(-Math.PI / 4),
      y + 12 * Math.sin(-Math.PI / 4),
    );
    ctx.arc(x + 12, y, 12, -Math.PI / 4, Math.PI / 4);
  }
  ctx.stroke();
}

function drawHud(ctx: Ctx, state: State): void {
  ctx.fillStyle = PALETTE.hudBand;
  ctx.fillRect(0, HUD_Y, STAGE_W, HUD_H);
  HUD_ITEMS.forEach((label, i) => {
    const rect = menuRect("playing", i);
    if (rect === null) return;
    const selected = state.menuIndex === i;
    drawButton(ctx, rect, label, selected, 15);
    if (label === "SOUND") {
      drawSpeaker(
        ctx,
        rect.x + rect.w - 34,
        rect.y + rect.h / 2,
        state.muted,
        selected ? PALETTE.textDark : PALETTE.text,
      );
    }
  });
  text(
    ctx,
    DEAL_MODE_LABEL,
    COLUMN_X[6] + CARD_W,
    HUD_Y + HUD_H / 2 + 1,
    `bold 16px ${FONT_SANS}`,
    PALETTE.gold,
    "right",
  );
}

// ---- The screens -----------------------------------------------------------

const TITLE_FAN: readonly { suit: Suit; rank: number }[] = [
  { suit: "spades", rank: 13 },
  { suit: "hearts", rank: 12 },
  { suit: "clubs", rank: 1 },
  { suit: "diamonds", rank: 11 },
  { suit: "hearts", rank: 10 },
];

function drawTitle(ctx: Ctx, state: State): void {
  ctx.fillStyle = PALETTE.scrim;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  // A fan of cards tumbling down the top of the screen.
  TITLE_FAN.forEach((card, i) => {
    const angle = (i - 2) * 0.16;
    ctx.save();
    ctx.translate(640 + (i - 2) * 92, 124 + Math.abs(i - 2) * 14);
    ctx.rotate(angle);
    drawCardFace(ctx, -CARD_W / 2, -CARD_H / 2, card.suit, card.rank);
    ctx.restore();
  });
  text(ctx, TITLE_TEXT, 643, 293, `bold 92px ${FONT_SERIF}`, PALETTE.shadow);
  text(ctx, TITLE_TEXT, 640, 288, `bold 92px ${FONT_SERIF}`, PALETTE.text);
  text(ctx, TAGLINE_TEXT, 640, 352, `bold 20px ${FONT_SANS}`, PALETTE.gold);
  TITLE_ITEMS.forEach((label, i) => {
    const rect = menuRect("title", i);
    if (rect !== null) drawButton(ctx, rect, label, state.menuIndex === i, 22);
  });
  roundedRect(ctx, 560, 566, 160, 32, 16);
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  text(ctx, DEAL_MODE_LABEL, 640, 583, `bold 15px ${FONT_SANS}`, PALETTE.gold);
  text(
    ctx,
    "Arrow keys or W / S to choose  ·  Enter or Space to confirm",
    640,
    660,
    `15px ${FONT_SANS}`,
    PALETTE.textDim,
  );
}

function drawHowTo(ctx: Ctx, state: State): void {
  ctx.fillStyle = PALETTE.scrim;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  roundedRect(ctx, 150, 60, 980, 530, 18);
  ctx.fillStyle = "rgba(3, 20, 15, 0.6)";
  ctx.fill();
  ctx.strokeStyle = PALETTE.buttonEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  text(ctx, "HOW TO PLAY", 640, 116, `bold 44px ${FONT_SERIF}`, PALETTE.text);
  let y = 186;
  for (const line of HOWTO_LINES) {
    if (line === "") {
      y += 16;
      continue;
    }
    text(ctx, line, 196, y, `20px ${FONT_SANS}`, PALETTE.text, "left");
    y += 32;
  }
  const rect = menuRect("howto", 0);
  if (rect !== null)
    drawButton(ctx, rect, HOWTO_BACK_LABEL, state.menuIndex === 0, 22);
}

function drawWon(ctx: Ctx, state: State): void {
  if (!state.cascadeDone) return;
  roundedRect(ctx, 400, 250, 480, 180, 22);
  ctx.fillStyle = PALETTE.scrim;
  ctx.fill();
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 3;
  ctx.stroke();
  text(ctx, WIN_TEXT, 643, 323, `bold 80px ${FONT_SERIF}`, PALETTE.shadow);
  text(ctx, WIN_TEXT, 640, 318, `bold 80px ${FONT_SERIF}`, PALETTE.gold);
  text(
    ctx,
    "Click anywhere to deal again",
    640,
    390,
    `18px ${FONT_SANS}`,
    PALETTE.text,
  );
}

/** Draws the whole frame for the state handed in. */
export function renderGame(ctx: Ctx, state: State): void {
  drawFelt(ctx);
  switch (state.screen) {
    case "title":
      drawTable(ctx, state);
      drawTitle(ctx, state);
      break;
    case "howto":
      drawTable(ctx, state);
      drawHowTo(ctx, state);
      break;
    case "playing":
      drawTable(ctx, state);
      drawHand(ctx, state);
      drawFlyers(ctx, state);
      drawHud(ctx, state);
      break;
    case "won":
      // The emptied piles lie under the paint; the cards still waiting to
      // launch and the cards in flight lie over it.
      drawStock(ctx, state);
      drawWaste(ctx, state);
      drawColumns(ctx, state);
      drawFoundations(ctx, state, "slots");
      drawTrail(ctx, state.trail);
      drawFoundations(ctx, state, "cards");
      drawFlyers(ctx, state);
      drawWon(ctx, state);
      break;
  }
}
