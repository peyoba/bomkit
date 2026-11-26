import type { Platform } from "./review";

export interface ExcelArgs {
  bom_rows: string[][];
  material_rows: string[][] | null;
  /** 上一版成品 BOM（可选）：按位号继承编码，并作为排序与 PCBA 名称/型号来源。 */
  previous_rows?: string[][] | null;
  /** 物料参考表（可选，可多份）：已有成品 BOM，按型号/阻容参数直接查编码。 */
  reference_rows?: string[][][];
  /** 排序：auto（给了谱系输入时用公司规则 v2）/ legacy（旧工具排序）/ company（强制 v2）。 */
  sort_mode?: "auto" | "legacy" | "company";
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
    output_rows: number; display_quantity: number;
    /** 谱系匹配：上一版位号继承 / 参考表命中的项数（仅公司规则 v2 路径返回）。 */
    previous?: number; reference?: number};
}
