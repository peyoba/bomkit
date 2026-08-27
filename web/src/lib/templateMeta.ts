export const META_CELL_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: "material_code", label: "物料编码 (material_code)" },
  { value: "pcba_name", label: "PCBA 名称 (pcba_name)" },
  { value: "pcba_model", label: "PCBA 型号 (pcba_model)" },
  { value: "pcb_name", label: "PCB 空板名称 (pcb_name)" },
  { value: "pcb_model", label: "PCB 空板型号 (pcb_model)" },
];

export const DEFAULT_OUTPUT_STYLE = {
  borders: true,
  status_colors: true,
  missing_highlight: true,
  dnp_highlight: true,
  row_height_auto: true,
} as const;

export const TEMPLATE_PREVIEW_ROWS = 20;
