import { describe, expect, it } from "vitest";
import { arrayBufferToBase64, base64ToArrayBuffer } from "../templateB64";
import { buildOutputTemplateProfile } from "../templateBuild";
import { isCustomTemplateReady } from "../templateReady";

const B64 = arrayBufferToBase64(new Uint8Array([9, 8, 7]).buffer);
const base = {
  name: "t",
  sheetIndex: 0,
  dataStartRow: 5,
  columns: { A: "seq" as string | null },
  metaCells: {} as Record<string, string>,
  baseXlsxB64: B64,
  columnCount: 1,
};

describe("buildOutputTemplateProfile validation", () => {
  it("does not invent extra top-level fields", () => {
    expect(Object.keys(buildOutputTemplateProfile(base)).sort()).toEqual([
      "base_xlsx_b64", "builtin", "columns", "data_start_row", "fixed_rows",
      "id", "kind", "meta_cells", "name", "schema_version", "sheet_index", "style",
    ].sort());
  });
  it("rejects missing base64 and bad data_start_row", () => {
    expect(() => buildOutputTemplateProfile({ ...base, baseXlsxB64: "" })).toThrow(/base_xlsx_b64/);
    expect(() => buildOutputTemplateProfile({ ...base, dataStartRow: 0 })).toThrow(/data_start_row/);
  });
  it("rejects invalid meta_cells refs and uppercases valid ones", () => {
    expect(() => buildOutputTemplateProfile({ ...base, metaCells: { "2B": "pcba_name" } })).toThrow(/单元格引用/);
    expect(buildOutputTemplateProfile({ ...base, metaCells: { b2: "pcba_name" } }).meta_cells).toEqual({ B2: "pcba_name" });
  });
});

describe("isCustomTemplateReady", () => {
  it("requires non-builtin profile with base64 and a mapped column", () => {
    const ready = buildOutputTemplateProfile(base);
    expect(isCustomTemplateReady(ready)).toBe(true);
    expect(isCustomTemplateReady({ ...ready, builtin: true })).toBe(false);
    expect(isCustomTemplateReady({ ...ready, base_xlsx_b64: null })).toBe(false);
    expect(isCustomTemplateReady({ ...ready, columns: { A: null } })).toBe(false);
  });
});

describe("base64 roundtrip", () => {
  it("survives arrayBuffer to base64 and back", () => {
    const src = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const decoded = new Uint8Array(base64ToArrayBuffer(arrayBufferToBase64(src.buffer)));
    expect(Array.from(decoded.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});
