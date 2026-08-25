/**
 * 契约类型定义。字段名与仓库根 docs/02-contracts.md 完全一致（snake_case），
 * 这是刻意的：Profile/Worker 消息在 JS 与 Python 之间原样传递 JSON，字段名
 * 两侧统一可以避免序列化时的一次隐式转换/映射（少一个可能出错的环节）。
 * 修改前必读 02-contracts.md（冻结文档，不得擅自变更结构）。
 */

// ── 1. 标准中间模型 ──────────────────────────────────────────

/** BOM 行（分组合并后）。见契约 1.1。 */
export interface BomItemFields {
  designator: string;
  qty: number;
  value: string;
  footprint: string;
  mpn: string;
  manufacturer: string;
  description: string;
  category: string;
  tolerance: string;
  dnp: boolean;
}

/** 物料库候选条目（在 match.candidates 中使用）。见契约 1.2、6.2。 */
export interface MaterialCandidate {
  code: string;
  name: string;
  spec: string;
}

// ── 2. 行数据传输格式 ────────────────────────────────────────

/** SheetJS/openpyxl 读取文件后的统一行数组格式。见契约第 2 节。 */
export interface RowsPayload {
  rows: string[][];
  sheet_name: string;
}

// ── 3. Profile 格式 ──────────────────────────────────────────

export type ProfileKind = "bom_input" | "material_input" | "output_template";

export interface InputProfileOptions {
  /** dnp_markers 仅 bom_input 使用；skip_disabled 仅 material_input 使用。 */
  dnp_markers?: string[];
  skip_disabled?: boolean;
}

/** bom_input / material_input Profile。见契约 3.1。 */
export interface InputProfile {
  schema_version: 1;
  kind: "bom_input" | "material_input";
  id: string;
  name: string;
  builtin: boolean;
  header_fingerprint: string | null;
  header_row_index: number;
  /** 键 = 源表头原文（trim 后），值 = 中间模型字段 ID。 */
  column_map: Record<string, string>;
  options: InputProfileOptions;
}

export interface OutputTemplateFixedRow {
  cells: Record<string, string>;
}

export interface OutputTemplateStyle {
  borders?: boolean;
  status_colors?: boolean;
  missing_highlight?: boolean;
  dnp_highlight?: boolean;
  row_height_auto?: boolean;
}

/** output_template Profile。见契约 3.2。 */
export interface OutputTemplateProfile {
  schema_version: 1;
  kind: "output_template";
  id: string;
  name: string;
  builtin: boolean;
  base_xlsx_b64: string | null;
  sheet_index: number;
  data_start_row: number;
  /** 列字母(A/B/C...) -> 字段 ID | 匹配结果字段 | 'seq' | null(留空列)。 */
  columns: Record<string, string | null>;
  meta_cells: Record<string, string>;
  fixed_rows: OutputTemplateFixedRow[];
  style: OutputTemplateStyle;
}

export type Profile = InputProfile | OutputTemplateProfile;

/** 匹配配置（match_config）。不属于 Profile，随 analyze 传入。见契约 3.3。 */
export interface MatchConfig {
  levels: {
    exact: boolean;
    model: boolean;
    substring: { enabled: boolean; min_len: number };
    clean_retry: boolean;
    param: { enabled: boolean; use_package: boolean; use_tolerance: boolean };
  };
  candidate_priority_prefix: string;
  non_component_keywords: string[];
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  levels: {
    exact: true,
    model: true,
    substring: { enabled: true, min_len: 6 },
    clean_retry: true,
    param: { enabled: true, use_package: true, use_tolerance: true },
  },
  candidate_priority_prefix: "01.",
  non_component_keywords: ["hole", "test-point", "test_point", "fiducial", "mounting_hole"],
};

// ── 5. 表头探测（detect 算法）────────────────────────────────

export type FieldConfidence = "high" | "medium" | "low" | null;

export interface DetectColumn {
  col_index: number;
  source: string;
  guess_field: string | null;
  confidence: FieldConfidence;
  samples: string[];
}

/** detect(rows, kind) -> DetectResult。见契约 6.1。 */
export interface DetectResult {
  header_row_index: number;
  low_confidence: boolean;
  columns: DetectColumn[];
}

// ── 6. Worker API ────────────────────────────────────────────

export type MatchLevel =
  | "exact"
  | "model"
  | "substring"
  | "param"
  | "multi"
  | "none"
  | "non_component"
  | "skipped";

export type MatchConfidence = "high" | "medium" | "low" | null;

export interface MatchResult {
  level: MatchLevel;
  status_text: string;
  confidence: MatchConfidence;
  candidates: MaterialCandidate[];
  /** 引擎默认推荐索引（优先 candidate_priority_prefix）。 */
  selected: number;
  /** 非空时优先于 selected 生效（用户手填编码）。 */
  manual_code: string | null;
}

export interface AnalyzeItem {
  row_id: number;
  fields: BomItemFields;
  match: MatchResult;
}

export interface AnalyzeStats {
  total: number;
  matched: number;
  low_confidence: number;
  param: number;
  multi: number;
  unmatched: number;
  non_component: number;
}

/** analyze(...) -> AnalyzeResult。见契约 6.2。 */
export interface AnalyzeResult {
  items: AnalyzeItem[];
  stats: AnalyzeStats;
}

/** render(...) 的 meta 参数。键集合开放，见契约 6.3。 */
export interface RenderMeta {
  pcba_name?: string;
  pcba_model?: string;
  pcb_name?: string;
  pcb_model?: string;
  material_code?: string;
  [key: string]: string | undefined;
}

export type ErrorCode =
  | "INVALID_PROFILE"
  | "INVALID_ROWS"
  | "MISSING_REQUIRED_FIELD"
  | "BAD_TEMPLATE"
  | "INTERNAL";

/** 错误格式。见契约 6.4。message 用中文，面向最终用户可直接展示。 */
export interface WorkerErrorPayload {
  error: {
    code: ErrorCode;
    message: string;
  };
}

// ── Worker 消息协议 ──────────────────────────────────────────

export type WorkerFn = "detect" | "analyze" | "render";

export interface WorkerRequest<TArgs = unknown> {
  id: number;
  fn: WorkerFn;
  args: TArgs;
}

export type WorkerResponse<TResult = unknown> =
  | { id: number; ok: true; result: TResult }
  | { id: number; ok: false; error: WorkerErrorPayload["error"] };

export interface DetectArgs {
  rows: string[][];
  kind: "bom_input" | "material_input";
}

export interface AnalyzeArgs {
  bom_rows: string[][];
  material_rows: string[][] | null;
  bom_profile: InputProfile;
  material_profile: InputProfile | null;
  match_config?: MatchConfig;
}

export interface RenderArgs {
  final_items: AnalyzeItem[];
  output_profile: OutputTemplateProfile;
  meta?: RenderMeta;
}

// ── 7. 匹配状态 -> 颜色（预览 UI 与导出 Excel 必须一致）────────

export const MATCH_STATUS_COLORS: Record<string, string> = {
  exact: "#C6EFCE",
  model: "#C6EFCE",
  substring: "#FFEB9C",
  param: "#BDD7EE",
  multi_a: "#FFE0B2",
  multi_b: "#FFF3E0",
  multi_param_a: "#D6E4F0",
  multi_param_b: "#E9EFF7",
  none: "#FFC7CE",
  non_component: "#D9D9D9",
  missing_cell: "#FFFF00",
  dnp_cell: "#E6B8AF",
};
