import { describe, expect, it } from "vitest";
import { calculateVoltage, searchResistance, readNumber, formatNumber, RESISTORS, PARALLEL_RESULT_LIMIT } from "./calculator";

const feedback = {mode: "feedback" as const, supply: 0.6, output: 3.3, toleranceMv: 20, parallel: false};
const divider = {mode: "divider" as const, supply: 5, output: 1, toleranceMv: 10, parallel: false};

describe("独立电阻计算核心", () => {
  it("完整保留原仓库的 77 个常用阻值", () => {
    expect(RESISTORS).toHaveLength(77);
    expect(new Set(RESISTORS).size).toBe(77);
    expect(Math.min(...RESISTORS)).toBe(100);
    expect(Math.max(...RESISTORS)).toBe(910000);
  });
  it("反馈分压按原公式保留等于或略高于目标的单电阻组合", () => {
    const rows = calculateVoltage(feedback);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.r1.b).toBe(0);
      expect(row.r2.b).toBe(0);
      expect(row.value).toBe(0.6 * (1 + row.r1.value / row.r2.value));
      expect(row.value).toBeGreaterThanOrEqual(3.3);
      expect(row.value - 3.3).toBeLessThan(0.020);
    }
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({r1: {a: 90000, b: 0, value: 90000}, r2: {a: 20000, b: 0, value: 20000}, value: 3.3});
  });
  it("普通单电阻分压允许目标两侧偏差，并消除原有重复行", () => {
    const rows = calculateVoltage(divider);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.value).toBe(5 * row.r2.value / (row.r1.value + row.r2.value));
      expect(Math.abs(row.value - 1)).toBeLessThan(0.010);
    }
    expect(new Set(rows.map(row => `${row.r1.a}/${row.r2.a}`)).size).toBe(rows.length);
    expect(rows).toHaveLength(15);
    expect(rows[0]).toEqual({r1: {a: 1200, b: 0, value: 1200}, r2: {a: 300, b: 0, value: 300}, value: 1});
  });
  it.each([feedback, divider])("含并联组合严格限制前 100 组 ($mode)", options => {
    const rows = calculateVoltage({...options, parallel: true});
    expect(rows).toHaveLength(PARALLEL_RESULT_LIMIT);
    const first = options.mode === "feedback" ? {a: 510, b: 3900} : {a: 430, b: 5100};
    expect(rows[0].r1).toMatchObject(first);
    expect(rows[0].r2).toEqual({a: 100, b: 0, value: 100});
    expect(rows.some(row => row.r1.b > 0 || row.r2.b > 0)).toBe(true);
    for (const row of rows) {
      for (const branch of [row.r1, row.r2]) {
        expect(branch.value).toBe(branch.b ? branch.a * branch.b / (branch.a + branch.b) : branch.a);
      }
      expect(row.value).toBeGreaterThanOrEqual(options.output);
      expect(row.value - options.output).toBeLessThan(options.toleranceMv / 1000);
    }
  });
  it("零精度仍允许精确匹配，不重复相同 R1/R2", () => {
    const rows = calculateVoltage({...divider, output: 2.5, toleranceMv: 0});
    expect(rows).toHaveLength(77);
    expect(rows.every(row => row.r1.a === row.r2.a && row.value === 2.5)).toBe(true);
    expect(calculateVoltage({...feedback, supply: 1, output: 2, toleranceMv: 0})).toHaveLength(77);
  });
  it("目标阻值搜索只使用两电阻并联，匹配等于或略低于目标", () => {
    const rows = searchResistance(1000, 10);
    expect(rows).toHaveLength(22);
    expect(rows.some(row => row.r1.a === 2000 && row.r1.b === 2000 && row.value === 1000)).toBe(true);
    for (const row of rows) {
      expect(row.r1.b).toBeGreaterThan(0);
      expect(row.value).toBe(row.r1.a * row.r1.b / (row.r1.a + row.r1.b));
      expect(row.value).toBeLessThanOrEqual(1000);
      expect(1000 - row.value).toBeLessThan(10);
    }
  });
  it("阻值精度边界为开区间，但包含精确匹配", () => {
    expect(searchResistance(50, 0)).toEqual([{r1: {a: 100, b: 100, value: 50}, value: 50}]);
    expect(searchResistance(60, 10)).not.toContainEqual({r1: {a: 100, b: 100, value: 50}, value: 50});
    expect(searchResistance(1, 0)).toEqual([]);
    expect(calculateVoltage({...feedback, output: 1e9})).toEqual([]);
  });
  it.each(["", " ", "abc", "Infinity", "NaN", "-1", "0"])("拒绝无效正数输入 %j", raw => {
    expect(() => readNumber(raw, "目标阻值")).toThrow("有效数字");
  });
  it("精度允许 0，数字允许小数和科学计数法", () => {
    expect(readNumber("0", "精度", true)).toBe(0);
    expect(readNumber(" 0.6 ", "VFB")).toBe(0.6);
    expect(readNumber("1e3", "阻值")).toBe(1000);
    expect(() => readNumber("-1", "精度", true)).toThrow();
  });
  it("计算 API 拒绝非物理输入和负精度", () => {
    expect(() => calculateVoltage({...feedback, supply: 0})).toThrow();
    expect(() => calculateVoltage({...feedback, output: 0.5})).toThrow("大于 VFB");
    expect(() => calculateVoltage({...divider, output: 5})).toThrow("小于 VCC");
    expect(() => calculateVoltage({...divider, toleranceMv: -1})).toThrow("精度");
    expect(() => searchResistance(Infinity, 10)).toThrow();
    expect(() => searchResistance(1000, NaN)).toThrow();
  });
  it("格式化不会留下多余的二进制浮点尾数", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatNumber(1000)).toBe("1000");
  });
});
