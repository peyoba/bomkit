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
  it("builtin uses default; custom requires a ready annotated profile", () => {
    const builtin = resolveOutputTemplate("builtin", custom);
    expect(builtin.ok).toBe(true);
    if (builtin.ok) expect(builtin.profile.id).toBe(DEFAULT_OUTPUT_TEMPLATE.id);

    const customOk = resolveOutputTemplate("custom", custom);
    expect(customOk.ok).toBe(true);
    if (customOk.ok) expect(customOk.profile.id).toBe(custom.id);

    expect(resolveOutputTemplate("custom", DEFAULT_OUTPUT_TEMPLATE).ok).toBe(false);
    expect(resolveOutputTemplate("custom", null).ok).toBe(false);
  });
});
