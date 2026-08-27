import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_OUTPUT_TEMPLATE } from "../outputTemplate";
import { copyProfile, deleteProfile, listProfiles, saveProfile } from "../profiles";

describe("saveProfile builtin guard", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("refuses to persist the builtin default output template", () => {
    expect(() => saveProfile(DEFAULT_OUTPUT_TEMPLATE)).toThrow(/内置配置不可覆盖/);
    expect(listProfiles("output_template")).toHaveLength(0);
  });

  it("copy-then-save writes a non-builtin clone with a new id", () => {
    const clone = copyProfile(DEFAULT_OUTPUT_TEMPLATE, "我的 PCBA 模板");
    expect(clone.builtin).toBe(false);
    expect(clone.id).not.toBe(DEFAULT_OUTPUT_TEMPLATE.id);
    expect(clone.id.startsWith("builtin-")).toBe(false);
    expect(clone.name).toBe("我的 PCBA 模板");
    saveProfile(clone);
    const listed = listProfiles("output_template");
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(clone.id);
    expect(listed[0].builtin).toBe(false);
  });

  it("refuses to delete builtin ids", () => {
    expect(() => deleteProfile("output_template", DEFAULT_OUTPUT_TEMPLATE.id)).toThrow(/内置/);
  });
});
