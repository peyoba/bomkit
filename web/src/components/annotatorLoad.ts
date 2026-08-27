import { listSheetNames, readXlsxRows } from "../lib/xlsx";
import { TEMPLATE_PREVIEW_ROWS } from "../lib/templateMeta";
import { arrayBufferToBase64, base64ToArrayBuffer } from "../lib/templateB64";
import { guessOutputColumns } from "../lib/templateGuess";
import { colLetterToIndex } from "../lib/colLetters";
import { maxColumnCount, padRow } from "../lib/templateColumns";
import { emptyAnnotator, type AnnotatorLocal } from "./annotatorState";
import type { OutputTemplateProfile } from "../types/contracts";
import { v4 as uuidv4 } from "uuid";

export async function annotatorFromProfile(profile: OutputTemplateProfile): Promise<AnnotatorLocal> {
  const buffer = base64ToArrayBuffer(profile.base_xlsx_b64 as string);
  const names = await listSheetNames(buffer);
  const sheetIndex = Math.min(profile.sheet_index, Math.max(0, names.length - 1));
  const payload = await readXlsxRows(buffer, names[sheetIndex]);
  const preview = payload.rows.slice(0, TEMPLATE_PREVIEW_ROWS);
  const fromMap = Object.keys(profile.columns).map((l) => colLetterToIndex(l) + 1);
  const columnCount = Math.max(maxColumnCount(preview), 0, ...fromMap);
  return emptyAnnotator({
    id: profile.id,
    name: profile.name,
    sheetIndex,
    sheetNames: names,
    dataStartRow: profile.data_start_row,
    columns: { ...profile.columns },
    metaCells: { ...profile.meta_cells },
    baseXlsxB64: profile.base_xlsx_b64 as string,
    previewRows: preview,
    columnCount,
  });
}

export async function annotatorFromFile(buffer: ArrayBuffer, fileName: string): Promise<AnnotatorLocal> {
  const names = await listSheetNames(buffer);
  const payload = await readXlsxRows(buffer, names[0]);
  const preview = payload.rows.slice(0, TEMPLATE_PREVIEW_ROWS);
  const columnCount = maxColumnCount(preview);
  const dataStartRow = preview.length >= 2 ? 2 : 1;
  const header = dataStartRow > 1 ? padRow(preview[dataStartRow - 2] ?? [], columnCount) : [];
  return emptyAnnotator({
    id: uuidv4(),
    name: fileName.replace(/\.(xlsx|xls)$/i, "") || "未命名输出模板",
    sheetIndex: 0,
    sheetNames: names,
    dataStartRow,
    columns: header.length ? guessOutputColumns(header) : {},
    baseXlsxB64: arrayBufferToBase64(buffer),
    previewRows: preview,
    columnCount,
  });
}
