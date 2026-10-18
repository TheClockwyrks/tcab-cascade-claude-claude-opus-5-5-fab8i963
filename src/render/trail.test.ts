import { describe, expect, it } from "vitest";
import { OcclusionIndex } from "./trail";

const stamp = (x: number, y: number) => ({
  suit: "hearts" as const,
  rank: 1,
  x,
  y,
});

describe("the painted layer's occlusion index", () => {
  it("leaves out a stamp wholly buried under later ones and keeps any that shows", () => {
    const index = new OcclusionIndex();
    const cover = [
      stamp(96, 96),
      stamp(104, 96),
      stamp(96, 104),
      stamp(104, 104),
    ];
    expect(index.update([stamp(100, 100), ...cover])).toEqual([1, 2, 3, 4]);
    expect(
      new OcclusionIndex().update([stamp(100, 100), stamp(103, 100)]),
    ).toEqual([0, 1]);
  });

  it("keeps up as stamps are appended, and rebuilds for a fresh layer", () => {
    const index = new OcclusionIndex();
    const first = [stamp(0, 0)];
    expect(index.update(first)).toEqual([0]);
    expect(index.update(first)).toEqual([0]);
    const grown = [...first, stamp(0, 0)];
    expect(index.update(grown)).toEqual([0, 1]);
    const buried = [
      ...grown,
      stamp(0, 0),
      stamp(8, 0),
      stamp(0, 8),
      stamp(8, 8),
    ];
    expect(index.update(buried)).toEqual([2, 3, 4, 5]);
    expect(index.update([stamp(500, 300)])).toEqual([0]);
  });

  it("drops stamps entirely off the stage", () => {
    expect(
      new OcclusionIndex().update([stamp(-200, 0), stamp(1300, 0)]),
    ).toEqual([]);
  });

  it("knows which corner index of a showing stamp is uncovered", () => {
    const index = new OcclusionIndex();
    const stamps = [stamp(100, 100), stamp(130, 100)];
    index.update(stamps);
    expect(index.corners(stamps[0], 0)).toEqual({ top: true, bottom: false });
    expect(index.corners(stamps[1], 1)).toEqual({ top: true, bottom: true });
  });
});
