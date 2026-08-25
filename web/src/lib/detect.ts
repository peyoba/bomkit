/**
 * 表头行探测 + 列名猜测的 TS 实现。必须与 bomcore.detect（Python 侧）遵守同一
 * 算法定义（契约第 5 节），并跑同一份共享用例
 * (core/tests/fixtures/detect_cases.json，见 Vitest 用例 detect.test.ts)。
 * 任何一侧的算法改动都必须同步另一侧、并重新跑通共享用例，防止双实现漂移。
 */
import { ALIASES } from "./aliases";
import type { DetectColumn, DetectResult } from "../types/contracts";

export function normalizeHeader(text: string | null | undefined): string {
  if (!text) return "";
  return text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function cellText(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function allAliasWords(): Set<string> {
  const set = new Set<string>();
  for (const words of Object.values(ALIASES)) {
    for (const w of words) set.add(normalizeHeader(w));
  }
  return set;
}

/** 契约 5.1：扫描前 10 行，score = 非空单元格数*1 + 别名命中*3，
 * 且要求该行下方至少 1 行数据。取最高分行；平分取最靠上。
 * 全部为 0 分 -> 第 0 行 + low_confidence。
 */
export function detectHeaderRow(rows: string[][]): { headerRowIndex: number; lowConfidence: boolean } {
  const aliasWords = allAliasWords();
  let bestRow = 0;
  let bestScore = -1;
  const scanLimit = Math.min(10, rows.length);

  for (let i = 0; i < scanLimit; i++) {
    if (i + 1 >= rows.length) break; // 要求该行下方至少 1 行数据
    const row = rows[i];
    let score = 0;
    for (const cell of row) {
      const text = cellText(cell);
      if (!text) continue;
      score += 1;
      if (aliasWords.has(normalizeHeader(text))) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  const lowConfidence = bestScore <= 0;
  return { headerRowIndex: lowConfidence ? 0 : bestRow, lowConfidence };
}

const VALIDATORS: Record<string, RegExp> = {
  designator: /^[A-Za-z]{1,4}\d+(\s*,\s*[A-Za-z]{1,4}\d+)*$/,
  code: /^[0-9][0-9.-]*$/,
};

function validateSamples(field: string, samples: string[]): boolean {
  const nonEmpty = samples.filter((s) => cellText(s));
  if (nonEmpty.length === 0) return true;

  if (field === "qty") {
    const ok = nonEmpty.filter((s) => !Number.isNaN(Number(String(s).replace(/,/g, "")))).length;
    return ok / nonEmpty.length >= 0.9;
  }

  const validator = VALIDATORS[field];
  if (!validator) return true;

  const ok = nonEmpty.filter((s) => validator.test(cellText(s))).length;
  return ok / nonEmpty.length >= 0.6;
}

export function guessColumns(rows: string[][], headerRowIndex: number): DetectColumn[] {
  const headerRow = rows[headerRowIndex] ?? [];
  const dataRows = rows.slice(headerRowIndex + 1, headerRowIndex + 21);

  return headerRow.map((rawHeader, colIndex): DetectColumn => {
    const source = cellText(rawHeader);
    const normalized = normalizeHeader(source);
    const samples = dataRows
      .map((r) => cellText(r[colIndex]))
      .filter((s) => s)
      .slice(0, 20);

    let guessField: string | null = null;
    let confidence: DetectColumn["confidence"] = null;

    if (normalized) {
      for (const [field, words] of Object.entries(ALIASES)) {
        if (words.some((w) => normalizeHeader(w) === normalized)) {
          guessField = field;
          confidence = "high";
          break;
        }
      }
      if (!guessField) {
        outer: for (const [field, words] of Object.entries(ALIASES)) {
          for (const rawWord of words) {
            const word = normalizeHeader(rawWord);
            if (word.length < 2) continue;
            if (normalized.includes(word) || word.includes(normalized)) {
              guessField = field;
              confidence = "medium";
              break outer;
            }
          }
        }
      }
    }

    if (guessField && !validateSamples(guessField, samples)) {
      confidence = "low";
    }

    return {
      col_index: colIndex,
      source,
      guess_field: guessField,
      confidence,
      samples: samples.slice(0, 5),
    };
  });
}

export function detect(rows: string[][], _kind: "bom_input" | "material_input" = "bom_input"): DetectResult {
  const { headerRowIndex, lowConfidence } = detectHeaderRow(rows);
  const columns = guessColumns(rows, headerRowIndex);
  return {
    header_row_index: headerRowIndex,
    low_confidence: lowConfidence,
    columns,
  };
}
