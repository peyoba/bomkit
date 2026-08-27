/**
 * 表头行探测 + 列名猜测的 TS 实现。必须与 bomcore.detect（Python 侧）遵守同一
 * 算法定义（契约第 5 节），并跑同一份共享用例
 * (core/tests/fixtures/detect_cases.json，见 Vitest 用例 detect.test.ts)。
 * 任何一侧的算法改动都必须同步另一侧、并重新跑通共享用例，防止双实现漂移。
 */
import { ALIASES, KIND_ALLOWED_FIELDS } from "./aliases";
import type { DetectColumn, DetectResult } from "../types/contracts";

/**
 * 与 Python 侧 guess_columns 相同的"字段认领裁决"：别名遍历按 field 名字母序
 * （保证双端一致），每个字段全表只认领一列（按 high→medium→low 分级、列序
 * 先到先得）。未认领成功的列回退为未映射，交由用户在界面手动指定。
 */
function scopedAliasFields(): string[] {
  return Object.keys(ALIASES).sort();
}

function pickGuessField(
  kind: "bom_input" | "material_input",
  normalized: string,
): { field: string; confidence: "high" | "medium" } | null {
  const allowed = KIND_ALLOWED_FIELDS[kind];
  // 1) 别名词库精确命中；field 字母序保证双端一致
  for (const field of scopedAliasFields()) {
    if (!allowed.has(field)) continue;
    if (ALIASES[field].some((w) => normalizeHeader(w) === normalized)) {
      return { field, confidence: "high" };
    }
  }
  // 2) 词库包含式命中
  for (const field of scopedAliasFields()) {
    if (!allowed.has(field)) continue;
    for (const rawWord of ALIASES[field]) {
      const word = normalizeHeader(rawWord);
      if (word.length < 2) continue;
      if (normalized.includes(word) || word.includes(normalized)) {
        return { field, confidence: "medium" };
      }
    }
  }
  return null;
}

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

/**
 * value 字段专属内容校验（与 bomcore.detect._looks_like_value_samples 同一算法定义）。
 * 子串命中"值"的列名如"物料名称"（内容是中文大类描述）也会被猜成 value；
 * 元件值应是短 token（10kΩ、100nF 等），按"非空样本多数不含 CJK 且长度有限"判定。
 * 样本窗口全空时不做裁决（维持猜测，与自由文本字段同一信任策略）。
 */
function looksLikeValueSamples(samples: string[]): boolean {
  const nonEmpty = samples.map((s) => cellText(s)).filter((s) => s);
  if (nonEmpty.length === 0) return true;
  const cjk = /[\u4e00-\u9fff]/;
  const good = nonEmpty.filter((s) => !cjk.test(s) && s.length <= 32).length;
  return good / nonEmpty.length >= 0.6;
}

function validateSamples(field: string, samples: string[]): boolean {
  const nonEmpty = samples.filter((s) => cellText(s));
  // 关键：只有当该字段本身没有内容验证规则（如 name/status 这类自由文本字段）时，
  // 样本全空才视为"无需验证、维持猜测结果"。对于有验证规则的字段（qty/designator/code），
  // 样本全空恰恰是最可疑的情况——真实故障复现过：物料表"编码"列前 20 行样本恰好全为空
  // （如尚未编号的新规格），此时旧逻辑直接判定 high 置信度放行，用户在界面上看到绿色
  // "high"标签会直接确认映射，导致后续所有匹配成功的物料行编码栏全部为空且无法察觉。
  // 现在对这种情况一律降级返回 false（外层调用处把 confidence 降为 low），提醒用户核查。
  if (nonEmpty.length === 0) {
    return field !== "qty" && !VALIDATORS[field];
  }

  if (field === "qty") {
    const ok = nonEmpty.filter((s) => !Number.isNaN(Number(String(s).replace(/,/g, "")))).length;
    return ok / nonEmpty.length >= 0.9;
  }

  const validator = VALIDATORS[field];
  if (!validator) return true;

  const ok = nonEmpty.filter((s) => validator.test(cellText(s))).length;
  return ok / nonEmpty.length >= 0.6;
}

export function guessColumns(
  rows: string[][],
  headerRowIndex: number,
  kind: "bom_input" | "material_input" = "bom_input"
): DetectColumn[] {
  const headerRow = rows[headerRowIndex] ?? [];
  const dataRows = rows.slice(headerRowIndex + 1, headerRowIndex + 21);

  // 与 Python guess_columns 相同：先逐列求候选，再做全局字段认领裁决
  // （每字段只认领一列，列名如"编码 + 旧物料编码"并存时旧编码列不会被
  // 猜成同字段导致下游覆盖；kind 过滤掉的猜测视为未猜出，落入透传）。
  const candidates: DetectColumn[] = headerRow.map((rawHeader, colIndex) => {
    const source = cellText(rawHeader);
    const normalized = normalizeHeader(source);
    const samples = dataRows
      .map((r) => cellText(r[colIndex]))
      .filter((s) => s)
      .slice(0, 20);

    let guessField: string | null = null;
    let confidence: DetectColumn["confidence"] = null;

    if (normalized) {
      const picked = pickGuessField(kind, normalized);
      if (picked) {
        guessField = picked.field;
        confidence = picked.confidence;
      }
    }

    if (guessField && !validateSamples(guessField, samples)) {
      confidence = "low";
    }

    // value 内容校验：样本不像元件值（中文大类描述等）则整个放弃猜测，
    // 否则它会挤掉真正的值列并污染分组键。
    if (guessField === "value" && !looksLikeValueSamples(samples)) {
      guessField = null;
      confidence = null;
    }

    return {
      col_index: colIndex,
      source,
      guess_field: guessField,
      confidence,
      samples: samples.slice(0, 5),
    };
  });

  // 字段认领：按置信度分级、列序先到先得。
  const winners = new Set<number>();
  const claimedFields = new Set<string>();
  for (const tier of ["high", "medium", "low"] as const) {
    for (const col of candidates) {
      if (!col.guess_field || col.confidence !== tier || claimedFields.has(col.guess_field)) continue;
      claimedFields.add(col.guess_field);
      winners.add(col.col_index);
    }
  }

  return candidates.map((col) =>
    col.guess_field && !winners.has(col.col_index)
      ? { ...col, guess_field: null, confidence: null }
      : col.guess_field
        ? col
        : { ...col, confidence: null }
  );
}

export function detect(rows: string[][], kind: "bom_input" | "material_input" = "bom_input"): DetectResult {
  const { headerRowIndex, lowConfidence } = detectHeaderRow(rows);
  const columns = guessColumns(rows, headerRowIndex, kind);
  return {
    header_row_index: headerRowIndex,
    low_confidence: lowConfidence,
    columns,
  };
}
