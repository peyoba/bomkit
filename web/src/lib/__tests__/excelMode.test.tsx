import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../../App";
import { detectReviewInput } from "../reviewInput";

vi.mock("../../pages/ExcelWorkspace", () => ({ExcelWorkspace: () => <div data-testid="excel-page">Excel</div>}));
vi.mock("../../pages/ReviewWorkspace", () => ({ReviewWorkspace: () => <div data-testid="review-page">Review</div>}));
afterEach(cleanup);

describe("Excel优先入口", () => {
  it("开始转换进入Excel模式，而非强制校对页", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", {name: "开始转换"}));
    expect(screen.queryByTestId("excel-page")).not.toBeNull();
    expect(screen.queryByTestId("review-page")).toBeNull();
  });
  it("网页校对仍是独立可选入口", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", {name: "网页校对（可选）"}));
    expect(screen.queryByTestId("review-page")).not.toBeNull();
    expect(screen.queryByTestId("excel-page")).toBeNull();
  });
  it("支持旧公司合法的无Device列输入", () => {
    expect(detectReviewInput([["Name", "Designator", "Quantity", "Footprint"], ["10k欧", "R1", "1", "0603"]]).platform).toBe("jlc");
  });
});
