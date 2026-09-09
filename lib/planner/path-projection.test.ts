import { describe, expect, it } from "vitest";
import { projectMasteryAfterPath, requirementsPathWontCover } from "./path-projection";
import type { Role } from "@/lib/types";

const ROLE = {
  id: "pentester",
  domainId: "cybersecurity",
  title: "Junior Penetration Tester",
  description: "",
  requiredSkills: [
    { skillId: "burp-suite", importance: 1 },
    { skillId: "sql-injection", importance: 0.9 }
  ]
} as Role;

describe("projectMasteryAfterPath", () => {
  it("raises the skills the path teaches to the mastered threshold", () => {
    const projected = projectMasteryAfterPath({ "burp-suite": 0.4, "sql-injection": 0 }, ROLE);

    expect(projected["burp-suite"]).toBe(0.8);
    expect(projected["sql-injection"]).toBe(0.8);
  });

  it("leaves skills the path does not teach exactly where they are", () => {
    // This is what makes the comparison honest rather than an advert: a posting
    // asking for Python when the role never teaches it must still show Python
    // as open after the path.
    const projected = projectMasteryAfterPath({ "burp-suite": 0.4, python: 0.1 }, ROLE);

    expect(projected.python).toBe(0.1);
  });

  it("never moves a skill down", () => {
    const projected = projectMasteryAfterPath({ "burp-suite": 0.95 }, ROLE);

    expect(projected["burp-suite"]).toBe(0.95);
  });

  it("does not mutate the mastery it was given", () => {
    const actual = { "burp-suite": 0.4 };
    projectMasteryAfterPath(actual, ROLE);

    expect(actual["burp-suite"]).toBe(0.4);
  });
});

describe("requirementsPathWontCover", () => {
  it("names the posting's requirements that the target role never teaches", () => {
    const matched = [
      { graphSkill: { id: "burp-suite", name: "Burp Suite" }, isRequired: true },
      { graphSkill: { id: "python", name: "Python Basics" }, isRequired: false },
      { graphSkill: { id: "shell", name: "Shell Scripting" }, isRequired: false }
    ];

    expect(requirementsPathWontCover(matched, ROLE)).toEqual(["Python Basics", "Shell Scripting"]);
  });

  it("is empty when the role covers everything the posting asked for", () => {
    const matched = [{ graphSkill: { id: "burp-suite", name: "Burp Suite" }, isRequired: true }];

    expect(requirementsPathWontCover(matched, ROLE)).toEqual([]);
  });
});
