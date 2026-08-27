import { describe, expect, it } from "vitest";
import { arrayBufferToBase64 } from "../templateB64";
import { buildOutputTemplateProfile } from "../templateBuild";
import type { TemplateAnnotation } from "../templateBuild";

const B64 = arrayBufferToBase64(new Uint8Array([1, 2, 3, 4]).buffer);

function annotation(patch?: Partial<TemplateAnnotation>): TemplateAnnotation {
  return {
    name: "公司PCBA模板",
    sheetIndex: 0,
    dataStartRow: 5,
    columns: { A: "seq", B: "code", C: "material_name", D: null, E: "designator" },
    metaCells: { B2: "material_code", D2: "pcba_name", G2: "pcba_model" },
    baseXlsxB64: B64,
    columnCount: 5,
    ...patch,
  };
}

describe("buildOutputTemplateProfile", () => {
  it("produces a valid contract 3.2 output_template Profile", () => {
    const p = buildOutputTemplateProfile(annotation());
    expect(p.schema_version).toBe(1);
    expect(p.kind).toBe("output_template");
    expect(p.builtin).toBe(false);
    expect(p.base_xlsx_b64).toBe(B64);
    expect(p.data_start_row).toBe(5);
    expect(p.columns).toEqual({
      A: "seq", B: "code", C: "material_name", D: null, E: "designator",
    });
    expect(p.meta_cells).toEqual({
      B2: "material_code", D2: "pcba_name", G2: "pcba_model",
    });
    expect(p.fixed_rows).toEqual([]);
    expect(p.id).toBeTruthy();
  });
});
