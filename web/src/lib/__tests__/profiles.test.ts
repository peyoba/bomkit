import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_OUTPUT_TEMPLATE } from "../outputTemplate";
import { copyProfile, isBuiltinProfile, saveProfileGuarded } from "../profileGuard";
import { listProfiles } from "../profiles";

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
