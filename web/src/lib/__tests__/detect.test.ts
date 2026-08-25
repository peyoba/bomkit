import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { detectHeaderRow, normalizeHeader } from "../detect";

// 共享用例：与 core/tests/fixtures/detect_cases.json 是同一份文件（契约第 5 节
// 要求 TS/Python 双端跑同一份用例，防止两个独立实现的算法定义漂移）。
// 用 process.cwd()（vitest 运行时 = web/ 目录）而非 import.meta.url 定位，
// 避免不同 Vitest/Node 版本对 file:// URL 解析行为不一致导致的坑。
const fixturePath = path.resolve(
  process.cwd(),
  "../core/tests/fixtures/detect_cases.json"
);
const cases = JSON.parse(readFileSync(fixturePath, "utf-8")).cases as Array<{
  name: string;
  rows: string[][];
  expected_header_row_index: number;
  expected_low_confidence: boolean;
}>;

describe("normalizeHeader", () => {
  it("trims and lowercases", () => {
    expect(normalizeHeader("  Designator  ")).toBe("designator");
    expect(normalizeHeader("Quantity")).toBe("quantity");
  });
});

describe("detectHeaderRow shared fixture cases", () => {
  for (const c of cases) {
    it(c.name, () => {
      const { headerRowIndex, lowConfidence } = detectHeaderRow(c.rows);
      expect(headerRowIndex).toBe(c.expected_header_row_index);
      expect(lowConfidence).toBe(c.expected_low_confidence);
    });
  }
});
