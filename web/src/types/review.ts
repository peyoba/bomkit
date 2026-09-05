import type { RowsPayload } from "./contracts";

export type Platform = "auto" | "jlc" | "altium" | "cadence";
export interface InputFormat { id: string; platform: string; name: string; header_row_index: number; column_map: Record<string, string> }
export interface ReviewMaterial { id: string; source_row: number; code: string; name: string; spec: string; footprint: string; manufacturer: string; tolerance: string }
export interface FinalFields { code: string; name: string; model: string; footprint: string }
export interface Confirmation { reviewer: string; at: string; fingerprint: string }
export interface ReviewItem {
  row_id: number; source_row: number; source: Record<string, string>;
  fields: { designator: string; qty: number; value: string; mpn: string; footprint: string; manufacturer: string; description: string; category: string; tolerance: string; source_code: string; dnp: boolean };
  original_model: string; issues: string[]; candidates: ReviewMaterial[]; candidate_count: number;
  match_level: string; match_label: string; selected_id: string | null; selected_material: ReviewMaterial | null;
  final: FinalFields; differences: string[]; note: string; confirmed: boolean; confirmation: Confirmation | null;
  history: Array<Confirmation & { selected_id: string | null; final: FinalFields; note: string }>;
}
export interface ReviewSnapshot {
  schema_version: 2; profile: InputFormat; source_name: string; sheet_name: string; items: ReviewItem[];
  material_stats: {total: number; enabled: number; disabled: number; missing_spec: number; duplicate_codes: number};
  skipped_rows: Array<{row: number; reason: string; text?: string}>;
  stats: {rows: number; quantity: number; confirmed: number; pending: number};
}
export interface LoadedTable extends RowsPayload { file_name: string; sheet_names: string[]; encoding?: string }
export type ReviewAction = "detect" | "start" | "clear" | "update" | "confirm" | "revoke" | "search" | "snapshot" | "export";
