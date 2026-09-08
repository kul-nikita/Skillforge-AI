import { describe, expect, it } from "vitest";
import { parseHoursPerWeek, parseWeeks } from "./duration-phrases";

describe("parseWeeks", () => {
  it("reads the phrasings a learner actually types", () => {
    expect(parseWeeks("12 weeks")).toBe(12);
    expect(parseWeeks("about five months")).toBe(22);
    expect(parseWeeks("half a year")).toBe(26);
    expect(parseWeeks("a couple of months")).toBe(9);
    expect(parseWeeks("3 wks")).toBe(3);
  });

  it("treats a bare number as weeks, since that is what the field asks for", () => {
    expect(parseWeeks("20")).toBe(20);
  });

  it("declines rather than guessing a unit that was not typed", () => {
    // "as soon as possible" names no quantity, and "5 sessions" is not a timeline.
    expect(parseWeeks("as soon as possible")).toBeNull();
    expect(parseWeeks("5 sessions")).toBeNull();
    expect(parseWeeks("")).toBeNull();
  });

  it("clamps to the range the profile schema accepts", () => {
    // z.number().int().min(1).max(52) — an unclamped "3 years" would 400.
    expect(parseWeeks("3 years")).toBe(52);
    expect(parseWeeks("0 weeks")).toBeNull();
  });
});

describe("parseHoursPerWeek", () => {
  it("reads hours, including the ones written as words", () => {
    expect(parseHoursPerWeek("8 hours")).toBe(8);
    expect(parseHoursPerWeek("about four hours a week")).toBe(4);
    expect(parseHoursPerWeek("an hour")).toBe(1);
    expect(parseHoursPerWeek("2.5 hrs")).toBe(2.5);
  });

  it("counts an evening as a study session, not as one hour", () => {
    // Reading "a couple of evenings" as 2 hours would halve every plan built
    // from it, and the learner would never see why.
    expect(parseHoursPerWeek("a couple of evenings a week")).toBe(4);
    expect(parseHoursPerWeek("three nights")).toBe(6);
  });

  it("declines what it cannot read", () => {
    expect(parseHoursPerWeek("whenever I can")).toBeNull();
    expect(parseHoursPerWeek("")).toBeNull();
  });

  it("clamps to the range the profile schema accepts", () => {
    expect(parseHoursPerWeek("100 hours")).toBe(60);
  });
});
