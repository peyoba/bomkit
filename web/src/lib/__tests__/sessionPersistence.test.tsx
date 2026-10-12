import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExcelWorkspace } from "../../pages/ExcelWorkspace";
import { ReviewWorkspace } from "../../pages/ReviewWorkspace";
import { useSessionStore } from "../../stores/sessionStore";
import { loadTable } from "../reviewInput";
import type { LoadedTable, ReviewSnapshot } from "../../types/review";

vi.mock("../../workers/singleton", () => ({ getWorkerClient: () => ({ excel: vi.fn(), review: vi.fn() }) }));
vi.mock("../reviewInput", async importOriginal => ({
  ...await importOriginal<typeof import("../reviewInput")>(),
  loadTable: vi.fn(),
}));

const table: LoadedTable = {rows: [["Name"], ["DEMO"]], sheet_name: "BOM", sheet_names: ["BOM", "第二页"], file_name: "shared-bom.xlsx"};
const mockedLoad = vi.mocked(loadTable);

beforeAll(() => {
  // jsdom 缺少 antd 交互部件（Select 等）依赖的浏览器 API。
  globalThis.ResizeObserver ??= class {observe() {} unobserve() {} disconnect() {}} as unknown as typeof ResizeObserver;
  if (!window.matchMedia) window.matchMedia = ((query: string) => ({matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false})) as unknown as typeof window.matchMedia;
});
beforeEach(() => {vi.clearAllMocks(); useSessionStore.getState().resetAll();});
afterEach(cleanup);

async function uploadInExcel(file: File) {
  render(<ExcelWorkspace />);
  fireEvent.change(screen.getByLabelText("BOM 文件"), {target: {files: [file]}});
  await waitFor(() => expect(useSessionStore.getState().bom).toEqual(table));
}

describe("切换入口保留已上传文件", () => {
  it("Excel 转换页上传后切到网页校对页，文件仍在且无需重新上传", async () => {
    mockedLoad.mockResolvedValue(table);
    await uploadInExcel(new File(["synthetic"], "shared-bom.xlsx"));
    cleanup();
    render(<ReviewWorkspace />);
    expect(screen.getByText("shared-bom.xlsx")).not.toBeNull();
    expect(screen.getByText("本地文件已读取 · BOM")).not.toBeNull();
    // 工作表选择器仍可用：说明原始 File 也随会话保留，而不是只剩解析结果。
    expect(screen.getByLabelText("BOM 文件工作表")).not.toBeNull();
  });

  it("再切回 Excel 转换页，文件和已填表单都没丢", async () => {
    mockedLoad.mockResolvedValue(table);
    const file = new File(["synthetic"], "shared-bom.xlsx");
    await uploadInExcel(file);
    act(() => {
      useSessionStore.getState().setExcelMeta({pcba_name: "合成PCBA", pcba_model: "", pcb_name: "", pcb_model: ""});
      useSessionStore.getState().setExcelFilename("合成输出");
    });
    cleanup();
    render(<ExcelWorkspace />);
    expect(screen.getByText("shared-bom.xlsx")).not.toBeNull();
    expect((screen.getByLabelText("PCBA名称") as HTMLInputElement).value).toBe("合成PCBA");
    expect((screen.getByLabelText("输出文件名") as HTMLInputElement).value).toBe("合成输出");
    expect(useSessionStore.getState().bomFile).toBe(file);
  });

  it("更换输入文件会作废基于旧文件算出的校对快照", async () => {
    mockedLoad.mockResolvedValue(table);
    act(() => useSessionStore.setState({reviewSnapshot: {schema_version: 2, source_name: "old.xlsx"} as unknown as ReviewSnapshot}));
    await uploadInExcel(new File(["synthetic"], "shared-bom.xlsx"));
    expect(useSessionStore.getState().reviewSnapshot).toBeNull();
  });
});
