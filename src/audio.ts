// Cascade — the ten cues (specs/audio.md).
//
// Each is a short synthesized sound, distinct by pitch, sweep, and waveform so
// the ten events are told apart by ear. The engine owns the bus, the unlock,
// and muting; the game only names and plays these.

import type { CueSpec, InitApi } from "@clockwyrks/simple-2d";
import { CUES, type CueName } from "./constants";

export const CUE_SPECS: Readonly<Record<CueName, CueSpec>> = {
  [CUES.deal]: {
    wave: "triangle",
    freq: 220,
    freqTo: 660,
    durationMs: 260,
    gain: 0.18,
  },
  [CUES.turn]: {
    wave: "triangle",
    freq: 520,
    freqTo: 380,
    durationMs: 70,
    gain: 0.14,
  },
  [CUES.recycle]: {
    wave: "sawtooth",
    freq: 180,
    freqTo: 420,
    durationMs: 220,
    gain: 0.08,
  },
  [CUES.lift]: {
    wave: "sine",
    freq: 600,
    freqTo: 760,
    durationMs: 50,
    gain: 0.12,
  },
  [CUES.drop]: {
    wave: "sine",
    freq: 340,
    freqTo: 240,
    durationMs: 80,
    gain: 0.18,
  },
  [CUES.reject]: {
    wave: "square",
    freq: 160,
    freqTo: 110,
    durationMs: 140,
    gain: 0.08,
  },
  [CUES.flip]: {
    wave: "triangle",
    freq: 880,
    freqTo: 1100,
    durationMs: 60,
    gain: 0.12,
  },
  [CUES.home]: {
    wave: "sine",
    freq: 784,
    freqTo: 1046,
    durationMs: 140,
    gain: 0.16,
  },
  [CUES.launch]: {
    wave: "triangle",
    freq: 440,
    freqTo: 990,
    durationMs: 90,
    gain: 0.08,
  },
  [CUES.win]: {
    wave: "square",
    freq: 523,
    freqTo: 1568,
    durationMs: 700,
    gain: 0.1,
  },
};

export function defineCues<S>(api: InitApi<S>): void {
  for (const cue of Object.values(CUES)) api.audio.define(cue, CUE_SPECS[cue]);
}
