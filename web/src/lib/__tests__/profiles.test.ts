import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_OUTPUT_TEMPLATE } from "../outputTemplate";
import { copyProfile, isBuiltinProfile, saveProfileGuarded } from "../profileGuard";
import { applyStoredMapping, listProfiles } from "../profiles";
import type { DetectColumn } from "../../types/contracts";

describe("saveProfile builtin guard", () => {
  beforeEach(() => window.localStorage.clear());

  it("treats the default PCBA template as builtin", () => {
    expect(isBuiltinProfile(DEFAULT_OUTPUT_TEMPLATE)).toBe(true);
  });

  it("refuses to persist the builtin default output template", () => {
    expect(() => saveProfileGuarded(DEFAULT_OUTPUT_TEMPLATE)).toThrow(/内置配置不可覆盖/);
    expect(listProfiles("output_template")).toHaveLength(0);
  });

  it("copy-then-save writes a non-builtin clone with a new id", () => {
    const clone = copyProfile(DEFAULT_OUTPUT_TEMPLATE, "我的 PCBA 模板");
    expect(clone.builtin).toBe(false);
    expect(clone.id).not.toBe(DEFAULT_OUTPUT_TEMPLATE.id);
    expect(isBuiltinProfile(clone)).toBe(false);
    saveProfileGuarded(clone);
    const listed = listProfiles("output_template");
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(clone.id);
  });
});

describe("applyStoredMapping (fingerprint reuse)", () => {
  const detected: DetectColumn[] = [
    { col_index: 0, source: "位号", guess_field: "designator", confidence: "high", samples: [] },
    { col_index: 1, source: "Description", guess_field: null, confidence: null, samples: [] },
    { col_index: 2, source: "新增列", guess_field: "qty", confidence: "medium", samples: [] },
  ];

  it("restores user-confirmed mappings including ones detect can never guess", () => {
    // Description -> value 是用户上次手动指定的；指纹复用的意义就在于把它带回来
    const mapped = applyStoredMapping(detected, { 位号: "designator", Description: "value" });
    expect(mapped[0].guess_field).toBe("designator");
    expect(mapped[1].guess_field).toBe("value");
    expect(mapped[1].confidence).toBe("high");
  });

  it("leaves columns absent from the stored mapping untouched", () => {
    const mapped = applyStoredMapping(detected, { 位号: "designator" });
    expect(mapped[2].guess_field).toBe("qty"); // 新出现的列保持 detect 猜测
    expect(mapped[2].confidence).toBe("medium");
  });

  it("returns unmapped columns unchanged when the profile has no entry for them", () => {
    const mapped = applyStoredMapping(detected, {});
    expect(mapped[1].guess_field).toBeNull();
    expect(mapped[1].confidence).toBeNull();
  });
});
