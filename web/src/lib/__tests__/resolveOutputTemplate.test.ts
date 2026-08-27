import { describe, expect, it } from "vitest";
import { DEFAULT_OUTPUT_TEMPLATE } from "../outputTemplate";
import { buildOutputTemplateProfile } from "../templateBuild";
import { arrayBufferToBase64 } from "../templateB64";
import { resolveOutputTemplate } from "../resolveOutputTemplate";

const custom = buildOutputTemplateProfile({
  name: "co",
  sheetIndex: 0,
  dataStartRow: 4,
  columns: { A: "seq" },
  metaCells: {},
  baseXlsxB64: arrayBufferToBase64(new Uint8Array([1]).buffer),
  columnCount: 1,
});

describe("resolveOutputTemplate", () => {
  it("keeps annotated profile; default only if none chosen", () => {
    const keep = resolveOutputTemplate("builtin", custom);
    expect(keep.ok).toBe(true);
    if (keep.ok) expect(keep.profile.id).toBe(custom.id);
    const fallback = resolveOutputTemplate("builtin", null);
    expect(fallback.ok).toBe(true);
    if (fallback.ok) expect(fallback.profile.id).toBe(DEFAULT_OUTPUT_TEMPLATE.id);
    expect(resolveOutputTemplate("custom", DEFAULT_OUTPUT_TEMPLATE).ok).toBe(false);
  });
});
