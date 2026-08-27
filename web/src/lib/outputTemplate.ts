/**
 * 内置默认 PCBA 输出模板 Profile（与 core/src/bomcore/presets/default_output_template.json
 * 字段完全一致，见 docs/02-contracts.md #3.2）。前端在向导「输出模板」步骤默认使用它；
 * 自定义模板由 TemplateAnnotator 生成 OutputTemplateProfile，不改动这个内置默认值。
 */
import type { OutputTemplateProfile } from "../types/contracts";

export const DEFAULT_OUTPUT_TEMPLATE: OutputTemplateProfile = {
  schema_version: 1,
  kind: "output_template",
  id: "builtin-default-pcba-template",
  name: "默认 PCBA 模板（内置）",
  builtin: true,
  base_xlsx_b64: null,
  sheet_index: 0,
  data_start_row: 5,
  columns: {
    A: "seq",
    B: "code",
    C: "material_name",
    D: "material_spec",
    E: "designator",
    F: "qty",
    G: "footprint",
    H: "manufacturer",
    I: null,
    J: "mpn",
    K: "description",
    L: "match_status",
  },
  meta_cells: {},
  fixed_rows: [],
  style: {
    borders: true,
    status_colors: true,
    missing_highlight: true,
    dnp_highlight: true,
    row_height_auto: true,
  },
};
