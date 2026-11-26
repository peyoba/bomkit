import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ResistanceWorkspace } from "../../pages/ResistanceWorkspace";

afterEach(cleanup);
const section = (name: string) => within(screen.getByRole("region", {name}));

describe("电阻计算器独立界面", () => {
  it("无需 BOM 文件即可使用，默认不展示伪造结果", () => {
    render(<ResistanceWorkspace />);
    expect(screen.getByRole("heading", {name: "电阻计算器", level: 1})).not.toBeNull();
    expect(screen.queryByLabelText("BOM 文件")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("填写参数");
  });
  it("反馈和普通分压表单互相独立，四个计算入口均工作", () => {
    render(<ResistanceWorkspace />);
    fireEvent.change(screen.getByLabelText("反馈输出电压 Vout"), {target: {value: "3.4"}});
    expect((screen.getByLabelText("分压输出电压 Vout") as HTMLInputElement).value).toBe("1");
    for (const name of ["电源反馈分压", "普通电阻分压"]) {
      fireEvent.click(section(name).getByRole("button", {name: "无电阻并联组合"}));
      expect(screen.getByRole("table")).not.toBeNull();
      fireEvent.click(section(name).getByRole("button", {name: "有电阻并联组合"}));
      expect(screen.getByRole("status").textContent).toContain("找到 100 组");
      expect(screen.getAllByRole("row")).toHaveLength(101);
    }
  });
  it("搜索结果保留输入快照，清空只清除结果，不改参数", () => {
    render(<ResistanceWorkspace />);
    fireEvent.change(screen.getByLabelText("目标阻值"), {target: {value: "1000"}});
    fireEvent.click(screen.getByRole("button", {name: "搜索阻值"}));
    expect(screen.getByRole("status").textContent).toContain("目标 1000 Ω");
    expect(screen.getByRole("table").textContent).toContain("2000 ∥ 2000");
    fireEvent.change(screen.getByLabelText("目标阻值"), {target: {value: "1500"}});
    expect(screen.getByRole("status").textContent).toContain("目标 1000 Ω");
    fireEvent.click(screen.getByRole("button", {name: "清空结果"}));
    expect(screen.queryByRole("table")).toBeNull();
    expect((screen.getByLabelText("目标阻值") as HTMLInputElement).value).toBe("1500");
  });
  it("无结果、无效输入和恢复成功均有明确反馈", () => {
    render(<ResistanceWorkspace />);
    fireEvent.click(screen.getByRole("button", {name: "搜索阻值"}));
    expect(screen.getByRole("alert").textContent).toContain("目标阻值");
    fireEvent.change(screen.getByLabelText("目标阻值"), {target: {value: "1"}});
    fireEvent.click(screen.getByRole("button", {name: "搜索阻值"}));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("没有符合条件的组合");
    fireEvent.change(screen.getByLabelText("目标阻值"), {target: {value: "1000"}});
    fireEvent.click(screen.getByRole("button", {name: "搜索阻值"}));
    expect(screen.getByRole("table")).not.toBeNull();
  });
  it("隐藏时不占用另一个工具的主要内容锚点", () => {
    render(<ResistanceWorkspace active={false} />);
    expect(document.getElementById("main-content")).toBeNull();
  });
});
