import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocalTableInput } from "../../components/LocalTableInput";
import { OutputExample } from "../../components/OutputExample";
import { AppHeader } from "../../components/AppHeader";
import type { LoadedTable } from "../../types/review";
import { loadTable } from "../reviewInput";

vi.mock("../reviewInput", async importOriginal => ({
  ...await importOriginal<typeof import("../reviewInput")>(),
  loadTable: vi.fn(),
}));
const table: LoadedTable = {rows: [["Name"], ["DEMO"]], sheet_name: "BOM", sheet_names: ["BOM"], file_name: "sample.xlsx"};
const mockedLoad = vi.mocked(loadTable);
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
const props = () => ({label: "BOM 文件", id: "bom-file", value: null, onChange: vi.fn(), onLoading: vi.fn(), disabled: false, appearance: "a" as const});

describe("A方案真实文件控件", () => {
  it("空态不预填示例文件，仍保留原生文件输入", () => {
    render(<LocalTableInput {...props()} />);
    const field = screen.getByLabelText("BOM 文件") as HTMLInputElement;
    expect(field.type).toBe("file");
    expect(field.accept).toBe(".xlsx,.txt,.tsv,.csv");
    expect(screen.queryByText("示例BOM.xlsx")).toBeNull();
    expect(screen.queryByText("选择BOM 文件")).not.toBeNull();
  });
  it("读文件调用原有解析器并转发真实数据", async () => {
    const p = props();
    mockedLoad.mockResolvedValue(table);
    render(<LocalTableInput {...p} />);
    const file = new File(["synthetic"], "sample.xlsx");
    fireEvent.change(screen.getByLabelText("BOM 文件"), {target: {files: [file]}});
    await waitFor(() => expect(p.onChange).toHaveBeenLastCalledWith(table));
    expect(mockedLoad).toHaveBeenCalledWith(file, undefined);
    expect(p.onLoading.mock.calls).toEqual([[true], [false]]);
  });
  it("读取错误在字段旁显示并关联aria，不吞掉错误", async () => {
    const p = props();
    mockedLoad.mockRejectedValue(new Error("不是有效的 XLSX 文件"));
    render(<LocalTableInput {...p} />);
    fireEvent.change(screen.getByLabelText("BOM 文件"), {target: {files: [new File(["bad"], "bad.xlsx")]}});
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("不是有效的 XLSX 文件"));
    expect(screen.getByLabelText("BOM 文件").getAttribute("aria-invalid")).toBe("true");
    expect(p.onChange).toHaveBeenLastCalledWith(null);
  });
  it("已选物料表可清除，不需要刷新页面", () => {
    const p = props();
    render(<LocalTableInput {...p} label="物料库文件" id="material-file" value={table} optional />);
    fireEvent.click(screen.getByRole("button", {name: "清除物料库文件"}));
    expect(p.onChange).toHaveBeenLastCalledWith(null);
  });
  it("忙碌时禁止更换和清除文件", () => {
    render(<LocalTableInput {...props()} value={table} disabled />);
    expect((screen.getByLabelText("BOM 文件") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", {name: "清除BOM 文件"}) as HTMLButtonElement).disabled).toBe(true);
  });
  it("原网页模式仍使用原样式路径而非替换业务", () => {
    render(<LocalTableInput {...props()} appearance="default" value={table} />);
    expect(screen.getByLabelText("BOM 文件").closest(".file-input")).not.toBeNull();
    expect(screen.queryByRole("button", {name: "清除BOM 文件"})).toBeNull();
  });
});

describe("A方案范围约束", () => {
  it("样式示意始终注明是合成局部，没有审批或实时数据", () => {
    render(<OutputExample />);
    expect(screen.getByText("主表局部 · 合成示例，非实时预览")).not.toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
  it("导航保留Excel和可选网页路径，不提供B/主题混合", () => {
    const navigate = vi.fn();
    render(<AppHeader route="excel" onNavigate={navigate} />);
    expect(screen.getByRole("button", {name: "Excel 转换"}).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", {name: "网页校对（可选）"}));
    expect(navigate).toHaveBeenCalledWith("review");
    expect(screen.queryByRole("switch")).toBeNull();
  });
  it("转换期间导航不可触发", () => {
    const navigate = vi.fn();
    render(<AppHeader route="excel" onNavigate={navigate} disabled />);
    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(navigate).not.toHaveBeenCalled();
  });
});
