// Cascade — the values the engine's debug overlay shows
// (specs/instrumentation.md, Diagnostics).
//
// Every source is a pure read of the state it is handed.

import type { InitApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { DEAL_MODE } from "./constants";
import type { CascadeState } from "./game";

type Source = (state: DeepReadonly<CascadeState>) => string | number | boolean;

export const DIAGNOSTIC_SOURCES: ReadonlyArray<readonly [string, Source]> = [
  ["screen", (s) => s.screen],
  ["deal mode", () => DEAL_MODE],
  ["stock", (s) => s.stock.length],
  ["waste", (s) => s.waste.length],
  ["foundations", (s) => s.foundations.map((p) => p.length).join(" / ")],
  ["columns", (s) => s.tableau.map((p) => p.length).join(" ")],
  [
    "in hand",
    (s) => (s.drag === null ? "none" : `${s.drag.cards.length} card(s)`),
  ],
  [
    "cascade",
    (s) =>
      s.screen === "won" || s.flyers.length > 0
        ? `launched ${s.launched}, flying ${s.flyers.length}`
        : "-",
  ],
];

export function registerDiagnostics(api: InitApi<CascadeState>): void {
  for (const [name, source] of DIAGNOSTIC_SOURCES)
    api.diagnostics.register(name, source);
}
