import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReviewFindings } from "../../components/ReviewFindings";

afterEach(cleanup);

describe("仅显示有证据的问题", () => {
  it("确定项没有标签、提示或确认占位", () => {
    const { container } = render(<ReviewFindings findings={[]} />);
    expect(container.innerHTML).toBe("");
  });
  it("问题同时给出字段、原因和双方原值", () => {
    render(<ReviewFindings findings={[{
      code: "package_mismatch", field: "footprint", label: "封装",
      original: "R0603", library: "0805", final: "", reason: "封装不一致",
    }]} />);
    expect(screen.getByText("封装：封装不一致")).toBeTruthy();
    expect(screen.getByText("R0603")).toBeTruthy();
    expect(screen.getByText("0805")).toBeTruthy();
    expect(screen.queryByText("修改后的值：")).toBeNull();
  });
  it("手工改动另外列明最终值而不替换原始证据", () => {
    render(<ReviewFindings findings={[{
      code: "edited_final", field: "model", label: "最终型号",
      original: "PART-A", library: "PART-B", final: "PART-C", reason: "需核实修改",
    }]} />);
    for (const value of ["PART-A", "PART-B", "PART-C"]) expect(screen.getByText(value)).toBeTruthy();
  });
});
