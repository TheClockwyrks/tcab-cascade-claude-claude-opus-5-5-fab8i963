# Cascade

Cascade is a Klondike solitaire that runs entirely in the browser, drawn in
code on a felt table. Deal, build the seven columns down in alternating colors,
turn the stock three cards at a time (Draw Three), and carry all four suits home
to the foundations from Ace to King. Put the last card home and the table gives
way: every card launches off the foundations, bounces across the felt, and
paints a trail of itself until the table is buried.

There is no score, no timer, and no undo. A game with no moves left is left
through the HUD.

## Requirements

- Node.js 20 or newer and npm.

## Install

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Vite serves the game with hot reload and prints the local URL to open.

## Production build

```sh
npm run build
```

This type-checks and writes a self-contained static site to `dist/`, with
`index.html` at its root. It needs no backend and runs from any static file
server, at the root or under a sub-path. `npm run preview` serves `dist/` for a
final check.

## Controls

The table is played with a pointer; a mouse and a touchscreen work the same.

| Action | How |
| --- | --- |
| Move cards | Drag a face-up card; every card below it in the column comes with it. Release over a pile that accepts it (it is highlighted while you hold the cards over it). Anywhere else, the cards go back. |
| Turn the stock | Click the stock to turn three cards onto the waste. Only the front card of the waste is in play. |
| Recycle the stock | Click the empty stock slot to gather the waste back into the stock. |
| Send a card home | Double-click the waste's front card or a column's bottom card to move it to its foundation. |
| HUD | **NEW GAME** deals afresh, **MENU** returns to the title, **SOUND** mutes or unmutes. |
| After a win | Click anywhere to deal again. |

The menus — the title, the how-to screen, and the HUD — also take the keyboard:

| Key | Does |
| --- | --- |
| `↑` / `W` | Select the previous item |
| `↓` / `S` | Select the next item |
| `Enter` / `Space` | Activate the selected item |
| `Esc` | Back, on the how-to screen |
| `` ` `` | Show or hide the debug overlay |

## Development

| Command | Checks |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier, in check mode |
| `npm test` | Vitest over `src/**/*.test.ts`, with coverage |

The game is built on the Simple 2D engine (documented in `engine/`). The rules
live in plain modules under `src/` — `rules.ts`, `input.ts`, `cascade.ts` — that
read nothing from the renderer in `src/render/`, and `src/debug.ts` is the debug
and automation surface the engine hands back as `engine.debug`.

The showcase in `showcase/` is captured from real play by
`node scripts/run-ts.mjs scripts/capture-showcase.ts`, which finds a winnable
deal, plays it through dispatched pointer events, and records the engine's
drawing.
