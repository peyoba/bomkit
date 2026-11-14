/**
 * Migrated from peyoba/resistance-calculator. No BOM, Python, network or shared store dependency.
 * Keep the original catalog and matching directions; remove duplicate divider rows and cap parallel results at 100.
 */
export const RESISTORS: readonly number[] = [
  100, 150, 180, 200, 220, 300, 330, 360, 430, 510, 560, 620, 680, 750, 820, 910,
  1000, 1200, 1500, 1600, 1800, 2000, 2200, 2400, 2700, 3000, 3300, 3600, 3900, 4300, 4700, 5100,
  5600, 6200, 6800, 7500, 8200, 9100, 12000, 18000, 10000, 20000, 22000, 27000, 30000, 33000, 36000, 39000,
  43000, 47000, 51000, 56000, 62000, 68000, 75000, 82000, 100000, 110000, 120000, 150000, 160000, 180000, 200000, 220000,
  270000, 300000, 330000, 360000, 90000, 430000, 470000, 510000, 560000, 620000, 680000, 820000, 910000,
];

export interface ResistorBranch { value: number; a: number; b: number }
export interface VoltageResult { r1: ResistorBranch; r2: ResistorBranch; value: number }
export interface ResistanceResult { r1: ResistorBranch; value: number }
export const PARALLEL_RESULT_LIMIT = 100;

const singles: ResistorBranch[] = RESISTORS.map(value => ({value, a: value, b: 0}));
const pairs: ResistorBranch[] = [];
for (let j = 0; j < RESISTORS.length; j++) {
  for (let i = j; i < RESISTORS.length; i++) {
    const a = RESISTORS[j], b = RESISTORS[i];
    pairs.push({value: a * b / (a + b), a, b});
  }
}
const catalog = [...singles, ...pairs];

export function readNumber(raw: string, label: string, allowZero = false): number {
  const value = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${label}请输入${allowZero ? "大于或等于 0" : "大于 0"}的有效数字。`);
  }
  return value;
}

function validatePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label}必须大于 0。`);
}
function validateTolerance(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error("精度必须大于或等于 0。");
}
const atOrAbove = (value: number, target: number, tolerance: number) =>
  value === target || (value > target && value - target < tolerance);

export function calculateVoltage(options: {
  mode: "feedback" | "divider";
  supply: number;
  output: number;
  toleranceMv: number;
  parallel: boolean;
}): VoltageResult[] {
  const {mode, supply, output, toleranceMv, parallel} = options;
  validatePositive(supply, mode === "feedback" ? "VFB" : "VCC");
  validatePositive(output, "Vout");
  validateTolerance(toleranceMv);
  if (mode === "feedback" && output <= supply) throw new Error("反馈分压的 Vout 必须大于 VFB。");
  if (mode === "divider" && output >= supply) throw new Error("普通分压的 Vout 必须小于 VCC。");
  const items = parallel ? catalog : singles;
  const tolerance = toleranceMv / 1000;
  const results: VoltageResult[] = [];
  const matches = (value: number) => mode === "divider" && !parallel
    ? value === output || Math.abs(value - output) < tolerance
    : atOrAbove(value, output, tolerance);
  const add = (r1: ResistorBranch, r2: ResistorBranch) => {
    const value = mode === "feedback" ? supply * (1 + r1.value / r2.value) : supply * r2.value / (r1.value + r2.value);
    if (Number.isFinite(value) && matches(value)) results.push({r1, r2, value});
    return parallel && results.length >= PARALLEL_RESULT_LIMIT;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i; j < items.length; j++) {
      // Preserve the upstream enumeration order; the ordinary divider swaps R1/R2 in its first pass.
      if (mode === "feedback") {
        if (add(items[i], items[j])) return results;
        if (i !== j && add(items[j], items[i])) return results;
      } else {
        if (add(items[j], items[i])) return results;
        if (i !== j && add(items[i], items[j])) return results;
      }
    }
  }
  return results;
}

export function searchResistance(target: number, tolerance: number): ResistanceResult[] {
  validatePositive(target, "目标阻值");
  validateTolerance(tolerance);
  return pairs.filter(item => item.value === target || (target > item.value && target - item.value < tolerance))
    .map(r1 => ({r1, value: r1.value}));
}

export function formatNumber(value: number): string {
  return Number(value.toPrecision(15)).toString();
}
