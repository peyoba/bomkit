import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { detect, detectHeaderRow, guessColumns, normalizeHeader } from "../detect";

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

describe("guessColumns content validation (real-world regression)", () => {
  it("downgrades an all-empty required-field column instead of trusting alias-name match alone", () => {
    // 真实故障复现：物料表“编码”列在前 20 行样本里恰好全为空（如尚未编号的新规格），
    // 旧逻辑对“无可验证样本”一律放行为 high 置信度，导致用户在向导界面看到绿色 high
    // 标签、直接确认映射，而实际这一列毫无内容，后续所有匹配到的物料行编码栏全部为空
    // 且完全无法从界面察觉。见开发报告：“生产 BOM 物料编码一个都没填”。
    const header = ["编码", "名称", "规格型号", "禁用状态"];
    const rows = [header];
    for (let i = 0; i < 20; i++) {
      rows.push(["", "贴片电阻", `0Ω ±1% /R0603 (RS-0300${i}FT)/FH(风华)`, "否"]);
    }
    // 该表头集合是物料库侧表——kind 字段域过滤后需显式按 material_input 求猜测。
    const columns = guessColumns(rows, 0, "material_input");
    const codeColumn = columns[0];
    expect(codeColumn.guess_field).toBe("code");
    expect(codeColumn.confidence).toBe("low");
  });

  it("still trusts a free-text field (name) with an all-empty sample window", () => {
    // 对照组：没有内容验证规则的字段（如 name）样本全空时，仍维持猜测结果，
    // 不应被这次修复误伤——这类字段本来就无法用正则校验内容。
    const header = ["名称"];
    const rows = [header, [""], [""], [""]];
    const columns = guessColumns(rows, 0);
    expect(columns[0].guess_field).toBe("value");
    expect(columns[0].confidence).toBe("high");
  });
});

describe("kind-scoped guessing + first-wins claiming (2026-08 real-user regression)", () => {
  it("BOM: 物料编码 -> source_code, JLC规格 -> mpn, 中文大类列与跨类字段不再误配", () => {
    // 用户真实 BOM：立创EDA 二次加工表。旧行为把物料库字段偷换到 BOM 列上，
    // BomItem 解析时全部静默丢弃——"料号全空、编码提取不出"的直接根源。
    const rows = [
      ["二单元主板BOM"],
      ["导出时间 2026-08-20"],
      ["序号", "物料编码", "物料名称", "规格型号", "位号", "数量", "封装",
       "厂商", "备注", "JLC规格", "Description"],
      ["2", "", "贴片电阻", "RS-03000FT", "R22", "4", "R0603",
       "FH(风华)", "", "RS-03000FT", "0Ω"],
    ];
    const result = detect(rows, "bom_input");
    const bySource = new Map(result.columns.map((c) => [c.source, c]));
    expect(bySource.get("物料编码")!.guess_field).toBe("source_code");
    expect(bySource.get("JLC规格")!.guess_field).toBe("mpn");
    expect(bySource.get("位号")!.guess_field).toBe("designator");
    // 中文大类描述不是元件值；规格型号列属于物料库语义，均保持未映射
    expect(bySource.get("物料名称")!.guess_field).toBeNull();
    expect(bySource.get("规格型号")!.guess_field).toBeNull();
    // Description 与 备注 竞争 description 字段，先到的备注列赢
    expect(bySource.get("备注")!.guess_field).toBe("description");
    expect(bySource.get("Description")!.guess_field).toBeNull();
  });

  it("material: 名称 归 name 而非 value；旧物料编码 不再覆盖 编码 的 code 认领", () => {
    const rows = [
      ["编码", "名称", "规格型号", "描述", "数据状态", "物料属性", "基本单位",
       "旧物料编码", "使用组织"],
      ["01.01.001.00001", "单片机", "STM32F103RCT6/ST/LQFP64", "",
       "已审核", "外购", "Pcs", "010101.0011", "深圳"],
    ];
    const result = detect(rows, "material_input");
    const bySource = new Map(result.columns.map((c) => [c.source, c]));
    expect(bySource.get("编码")!.guess_field).toBe("code");
    expect(bySource.get("名称")!.guess_field).toBe("name");
    expect(bySource.get("规格型号")!.guess_field).toBe("spec");
    expect(bySource.get("旧物料编码")!.guess_field).toBeNull();
  });
});
