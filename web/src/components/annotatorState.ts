import { v4 as uuidv4 } from "uuid";
import { message } from "antd";
import { buildOutputTemplateProfile } from "../lib/templateBuild";
import type { OutputTemplateProfile } from "../types/contracts";

export interface AnnotatorLocal {
  id: string;
  name: string;
  sheetIndex: number;
  sheetNames: string[];
  dataStartRow: number;
  columns: Record<string, string | null>;
  metaCells: Record<string, string>;
  baseXlsxB64: string;
  previewRows: string[][];
  columnCount: number;
}

export function emptyAnnotator(partial?: Partial<AnnotatorLocal>): AnnotatorLocal {
  return {
    id: uuidv4(),
    name: "",
    sheetIndex: 0,
    sheetNames: [],
    dataStartRow: 2,
    columns: {},
    metaCells: {},
    baseXlsxB64: "",
    previewRows: [],
    columnCount: 0,
    ...partial,
  };
}

export function emitAnnotator(
  state: AnnotatorLocal,
  onChange: (p: OutputTemplateProfile) => void
): void {
  if (!state.baseXlsxB64) return;
  try {
    onChange(
      buildOutputTemplateProfile({
        id: state.id,
        name: state.name,
        sheetIndex: state.sheetIndex,
        dataStartRow: state.dataStartRow,
        columns: state.columns,
        metaCells: state.metaCells,
        baseXlsxB64: state.baseXlsxB64,
        columnCount: state.columnCount,
      })
    );
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err));
  }
}
