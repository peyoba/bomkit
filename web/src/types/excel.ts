import type { Platform } from "./review";
export interface ExcelArgs {
  bom_rows: string[][];
  material_rows: string[][] | null;
  platform: Platform;
  meta: {pcba_name: string; pcba_model: string; pcb_name: string; pcb_model: string};
  include_trace: boolean;
}
export interface ExcelResult {
  data: Uint8Array;
  format: string;
  material_format: string;
  stats: {source_rows: number; groups: number; quantity: number; material_count: number;
    multi: number; unmatched: number; non_component: number; low_confidence: number;
    output_rows: number; display_quantity: number};
}
