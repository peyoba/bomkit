import { v4 as uuidv4 } from "uuid";
import type { OutputTemplateProfile } from "../types/contracts";
import { DEFAULT_OUTPUT_STYLE } from "./templateMeta";
import { inferredColumnCount, normalizeColumns } from "./templateColumns";

const CELL_REF_RE = /^[A-Za-z]+[1-9]\d*$/;

export interface TemplateAnnotation {
  name: string;
  sheetIndex: number;
  dataStartRow: number;
  columns: Record<string, string | null>;
  metaCells: Record<string, string>;
  baseXlsxB64: string;
  columnCount?: number;
  id?: string;
}

export function buildOutputTemplateProfile(a: TemplateAnnotation): OutputTemplateProfile {
  const b64 = a.baseXlsxB64.trim();
  if (!b64) throw new Error("缺少模板文件（base_xlsx_b64）");
  if (!Number.isInteger(a.dataStartRow) || a.dataStartRow < 1) {
    throw new Error("data_start_row 必须是从 1 起的 Excel 行号");
  }
  if (!Number.isInteger(a.sheetIndex) || a.sheetIndex < 0) {
    throw new Error("sheet_index 无效");
  }
  const count = a.columnCount ?? inferredColumnCount(a.columns);
  const columns = count > 0 ? normalizeColumns(a.columns, count) : { ...a.columns };
  const meta_cells: Record<string, string> = {};
  for (const [ref, key] of Object.entries(a.metaCells)) {
    if (!CELL_REF_RE.test(ref)) throw new Error(`meta_cells 单元格引用无效: ${ref}`);
    if (key) meta_cells[ref.toUpperCase()] = key;
  }
  return {
    schema_version: 1,
    kind: "output_template",
    id: a.id ?? uuidv4(),
    name: a.name.trim() || "未命名输出模板",
    builtin: false,
    base_xlsx_b64: b64,
    sheet_index: a.sheetIndex,
    data_start_row: a.dataStartRow,
    columns,
    meta_cells,
    fixed_rows: [],
    style: { ...DEFAULT_OUTPUT_STYLE },
  };
}
