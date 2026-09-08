import { describe, expect, it } from "vitest";
import { summariseDelta } from "./delta";

describe("summariseDelta", () => {
  it("says nothing moved when nothing moved", () => {
    // An honest outcome, and the one the old screen hid entirely.
    const delta = summariseDelta({ "log-analysis": 0.7 }, { "log-analysis": 0.7 });

    expect(delta.firstRun).toBe(false);
    expect(delta.improved).toEqual([]);
    expect(delta.declined).toEqual([]);
    expect(delta.unchangedCount).toBe(1);
  });

  it("separates a rise from a fall and leads with the biggest", () => {
    const delta = summariseDelta(
      { a: 0.1, b: 0.7, c: 0.4 },
      { a: 0.9, b: 0.1, c: 0.7 }
    );

    expect(delta.improved.map((m) => m.skillId)).toEqual(["a", "c"]);
    expect(delta.improved[0].change).toBeCloseTo(0.8);
    expect(delta.declined.map((m) => m.skillId)).toEqual(["b"]);
    expect(delta.declined[0].change).toBeCloseTo(-0.6);
  });

  it("counts a never-before-assessed skill as new, not as an improvement", () => {
    // "Up from 0" would be a lie: it was not measured at zero, it was not
    // measured at all.
    const delta = summariseDelta({ a: 0.4 }, { a: 0.4, b: 0.9 });

    expect(delta.newlyAssessed.map((m) => m.skillId)).toEqual(["b"]);
    expect(delta.newlyAssessed[0].before).toBeNull();
    expect(delta.improved).toEqual([]);
  });

  it("marks a first run so the UI does not present it as a comparison", () => {
    const delta = summariseDelta({}, { a: 0.7 });

    expect(delta.firstRun).toBe(true);
    expect(delta.newlyAssessed).toHaveLength(1);
  });

  it("does not report floating-point dust as movement", () => {
    // 0.7 - 0.4 - 0.3 is not 0 in binary floating point; without a threshold
    // every rerun would claim a change.
    const delta = summariseDelta({ a: 0.1 + 0.2 }, { a: 0.3 });

    expect(delta.improved).toEqual([]);
    expect(delta.declined).toEqual([]);
    expect(delta.unchangedCount).toBe(1);
  });
});
