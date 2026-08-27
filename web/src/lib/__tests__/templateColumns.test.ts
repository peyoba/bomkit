import { describe, expect, it } from "vitest";
import { cellRef, colLetterToIndex, indexToColLetter } from "../colLetters";
import { guessOutputColumns } from "../templateGuess";
import { normalizeColumns } from "../templateColumns";

describe("col letters", () => {
  it("maps 0-based index to Excel letters and back", () => {
    expect(indexToColLetter(0)).toBe("A");
    expect(indexToColLetter(25)).toBe("Z");
    expect(indexToColLetter(26)).toBe("AA");
    expect(colLetterToIndex("A")).toBe(0);
    expect(colLetterToIndex("AA")).toBe(26);
    expect(cellRef(1, 2)).toBe("B2");
  });
});

describe("guessOutputColumns", () => {
  it("maps Chinese PCBA headers to contract field ids", () => {
    expect(guessOutputColumns(["序号", "物料编码", "物料名称", "位号", ""])).toEqual({
      A: "seq",
      B: "code",
      C: "material_name",
      D: "designator",
      E: null,
    });
  });
});

describe("normalizeColumns", () => {
  it("pads missing letters with null", () => {
    expect(normalizeColumns({ A: "seq", C: "designator" }, 4)).toEqual({
      A: "seq",
      B: null,
      C: "designator",
      D: null,
    });
  });
});
