/** v2 三平台输入。原文件不上传、不执行公式；编码和空字段不丢失。 */
import * as XLSX from "xlsx";
import presets from "../../../core/src/bomcore/presets/eda_inputs_v2.json";
import type { InputFormat, LoadedTable, Platform } from "../types/review";
import { normalizeHeader } from "./detect";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 100000;
const MAX_COLUMNS = 256;
function validateRows(rows: string[][]): void {
  if (!rows.length || rows.length > MAX_ROWS) throw new Error("表格为空或超过 100000 行限制");
  if (rows.some(r => r.length > MAX_COLUMNS || r.some(c => c.length > 32767))) throw new Error("表格列数或单元格长度超过限制");
}

/** 仅识别已验证模板；Comment 等同名列按平台上下文解释。 */
export function detectReviewInput(rows: string[][], platform: Platform = "auto"): InputFormat {
  validateRows(rows);
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const headers = rows[i].map(normalizeHeader);
    for (const preset of presets) {
      if (platform !== "auto" && platform !== preset.platform) continue;
      if (!preset.required_headers.every(h => headers.includes(h))) continue;
      if (preset.required_headers.some(h => headers.filter(x => x === h).length !== 1)) throw new Error("关键表头重复，请先校对原表");
      const map: Record<string, string | undefined> = preset.column_map;
      return { id: preset.id, platform: preset.platform, name: preset.name, header_row_index: i,
        column_map: Object.fromEntries(headers.flatMap((h, c) => map[h] ? [[rows[i][c], map[h]]] : [])) };
    }
  }
  throw new Error("未识别到已支持的 EDA 表头。请检查平台、工作表或导出格式");
}

export function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return {text: new TextDecoder("utf-16le", {fatal: true}).decode(bytes), encoding: "UTF-16LE"};
  try { return {text: new TextDecoder("utf-8", {fatal: true}).decode(bytes), encoding: "UTF-8"}; }
  catch {
    try { return {text: new TextDecoder("gb18030", {fatal: true}).decode(bytes), encoding: "GB18030/GBK"}; }
    catch { throw new Error("文本编码无法识别，请转存 UTF-8 后导入"); }
  }
}

/** CSV/TSV 状态机：保留空列和引号内换行，绝不按空格切分参数。 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || cell === "") quoted = !quoted;
      else cell += c;
    } else if (c === delimiter && !quoted) { row.push(cell); cell = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("文本引号未闭合，请检查文件");
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function workbookRows(wb: XLSX.WorkBook, sheetName?: string): {rows: string[][]; sheet_name: string} {
  const names = sheetName ? [sheetName] : wb.SheetNames;
  for (const name of names) {
    const ws = wb.Sheets[name];
    if (!ws) throw new Error("所选工作表不存在");
    // 某些 ERP 导出错误声明 !ref=A1；SheetJS 已读取的真实 cell 地址才是依据。
    const addresses = Object.keys(ws).filter(k => /^[A-Z]+[0-9]+$/.test(k));
    if (!addresses.some(k => ws[k]?.v !== undefined && String(ws[k].v) !== "")) continue;
    let maxR = 0, maxC = 0;
    for (const addr of addresses) { const rc = XLSX.utils.decode_cell(addr); maxR = Math.max(maxR, rc.r); maxC = Math.max(maxC, rc.c); }
    if (maxR >= MAX_ROWS || maxC >= MAX_COLUMNS) throw new Error("工作表范围超过限制");
    ws["!ref"] = XLSX.utils.encode_range({s: {r: 0, c: 0}, e: {r: maxR, c: maxC}});
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, {header: 1, raw: false, defval: "", blankrows: true});
    validateRows(rows);
    return {rows, sheet_name: name};
  }
  throw new Error("工作表为空");
}

export async function loadTable(file: File, sheetName?: string): Promise<LoadedTable> {
  if (file.size > MAX_FILE_BYTES) throw new Error("文件超过 20MB，请拆分后重试");
  const data = await file.arrayBuffer();
  if (/\.(txt|tsv|csv)$/i.test(file.name)) {
    const {text, encoding} = decodeText(new Uint8Array(data));
    const rows = parseDelimited(text, text.includes("\t") ? "\t" : ",");
    validateRows(rows);
    return {rows, sheet_name: file.name, file_name: file.name, sheet_names: [file.name], encoding};
  }
  if (!/\.xlsx$/i.test(file.name)) throw new Error("支持 XLSX、TXT、TSV、CSV；XLS 请先转存 XLSX");
  if (new Uint8Array(data)[0] !== 0x50 || new Uint8Array(data)[1] !== 0x4b) throw new Error("不是有效的 XLSX 文件");
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(data, {type: "array", cellFormula: false, cellHTML: false, nodim: true}); }
  catch { throw new Error("表格损坏或不受支持，请重新导出 XLSX"); }
  return {...workbookRows(wb, sheetName), file_name: file.name, sheet_names: wb.SheetNames};
}

export async function fileBase64(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error("模板超过 20MB");
  const data = new Uint8Array(await file.arrayBuffer()); let binary = "";
  for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(binary);
}
