/**
 * SheetJS 读取器。严格按契约第 2 节字符串化规则：
 * - sheet_to_json(ws, {header: 1, raw: false, defval: ""})
 * - 优先取格式化文本 cell.w，兜底 String(cell.v)
 * - 禁止 raw:true —— 金蝶编码 '01.0101' 会被数字化为 '1.0101'（前导零丢失）。
 * - 多 sheet 文件：默认取第一个非空 sheet。
 */
import * as XLSX from "xlsx";
import type { RowsPayload } from "../types/contracts";

function isSheetNonEmpty(ws: XLSX.WorkSheet): boolean {
  const ref = ws["!ref"];
  return Boolean(ref);
}

function firstNonEmptySheetName(workbook: XLSX.WorkBook): string {
  for (const name of workbook.SheetNames) {
    if (isSheetNonEmpty(workbook.Sheets[name])) return name;
  }
  return workbook.SheetNames[0];
}

/** 读取 xlsx 文件的全部行，转换为行数组的数组（全部字符串化，空单元格为 ""）。 */
export async function readXlsxRows(file: File | ArrayBuffer, sheetName?: string): Promise<RowsPayload> {
  const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const targetSheet = sheetName ?? firstNonEmptySheetName(workbook);
  const ws = workbook.Sheets[targetSheet];

  const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
  });

  return { rows: rows as string[][], sheet_name: targetSheet };
}

/** 只读取前 N 行，用于 detect 的即时反馈（不必等 Pyodide/整份文件解析完）。 */
export async function readXlsxRowsPreview(file: File, maxRows = 50): Promise<RowsPayload> {
  const full = await readXlsxRows(file);
  return { rows: full.rows.slice(0, maxRows), sheet_name: full.sheet_name };
}

export function listSheetNames(file: File | ArrayBuffer): Promise<string[]> {
  return (file instanceof ArrayBuffer ? Promise.resolve(file) : file.arrayBuffer()).then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array" });
    return workbook.SheetNames;
  });
}
