import { describe, expect, it } from "vitest";
import { fingerprint, jaccardSimilarity } from "../fingerprint";

describe("fingerprint", () => {
  it("is order independent", async () => {
    const a = await fingerprint(["Name", "Designator", "Quantity"]);
    const b = await fingerprint(["Quantity", "Name", "Designator"]);
    expect(a).toBe(b);
  });

  it("is case and whitespace insensitive", async () => {
    const a = await fingerprint(["Name", "Designator"]);
    const b = await fingerprint([" name ", "DESIGNATOR"]);
    expect(a).toBe(b);
  });

  it("changes with different headers", async () => {
    const a = await fingerprint(["Name", "Designator"]);
    const b = await fingerprint(["Name", "Value"]);
    expect(a).not.toBe(b);
  });
});

describe("jaccardSimilarity", () => {
  it("is 1 for identical sets", () => {
    expect(jaccardSimilarity(["A", "B"], ["A", "B"])).toBe(1);
  });

  it("handles partial overlap", () => {
    expect(jaccardSimilarity(["A", "B", "C"], ["A", "B", "D"])).toBeCloseTo(0.5);
  });
});
