import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../../App";

vi.mock("../../pages/ExcelWorkspace", () => ({ExcelWorkspace: ({onActivityChange}: {onActivityChange: (busy: boolean) => void}) =>
  <main id="main-content"><h1>测试 BOM 工作台</h1><button onClick={() => onActivityChange(true)}>模拟转换</button><button onClick={() => onActivityChange(false)}>结束转换</button></main>}));
vi.mock("../../pages/ReviewWorkspace", () => ({ReviewWorkspace: () => <main id="main-content"><h1>测试网页校对</h1></main>}));

afterEach(() => {cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, "", "/");});

describe("两个独立工具的导航", () => {
  it("首页有两个入口，电阻计算区不显示 BOM 子导航", async () => {
    render(<App />);
    expect(screen.getByRole("button", {name: "开始转换"})).not.toBeNull();
    expect(screen.getByRole("heading", {name: "硬件工程师的日常工具", level: 1})).not.toBeNull();
    expect(screen.getByRole("button", {name: "Aistone 工具箱首页"}).textContent).toBe("Aistone 工具箱");
    expect(document.title).toBe("Aistone 工具箱 · 硬件工程师的日常工具");
    expect(screen.queryByText(/各自独立|互不影响|两个独立功能区/)).toBeNull();
    fireEvent.click(screen.getByRole("button", {name: "打开电阻计算器"}));
    await screen.findByRole("heading", {name: "电阻计算器", level: 1});
    expect(window.location.hash).toBe("#resistance");
    expect(screen.queryByRole("navigation", {name: "BOM 功能"})).toBeNull();
    expect(screen.queryByRole("heading", {name: "测试 BOM 工作台"})).toBeNull();
  });
  it("可直接打开独立地址，并且切换回来保留电阻草稿和结果", async () => {
    window.history.replaceState(null, "", "/#resistance");
    render(<App />);
    await screen.findByLabelText("目标阻值");
    fireEvent.change(screen.getByLabelText("目标阻值"), {target: {value: "1000"}});
    fireEvent.click(screen.getByRole("button", {name: "搜索阻值"}));
    fireEvent.click(screen.getByRole("button", {name: "BOM 工具"}));
    await screen.findByRole("heading", {name: "测试 BOM 工作台"});
    expect(window.location.hash).toBe("#bom/excel");
    expect(screen.queryByRole("table")).toBeNull();
    expect(document.querySelectorAll("#main-content")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", {name: "电阻计算器"}));
    await screen.findByLabelText("目标阻值");
    expect((screen.getByLabelText("目标阻值") as HTMLInputElement).value).toBe("1000");
    expect(screen.getByRole("table").textContent).toContain("2000 ∥ 2000");
  });
  it("浏览器历史导航同步页面，跳到内容不会改变当前工具", async () => {
    window.history.replaceState(null, "", "/#bom/excel");
    render(<App />);
    await screen.findByRole("heading", {name: "测试 BOM 工作台"});
    act(() => {window.history.replaceState(null, "", "/#resistance"); window.dispatchEvent(new PopStateEvent("popstate"));});
    await screen.findByRole("heading", {name: "电阻计算器", level: 1});
    fireEvent.click(screen.getByRole("link", {name: "跳到主要内容"}));
    expect(window.location.hash).toBe("#resistance");
    expect(document.activeElement?.id).toBe("main-content");
    expect(document.title).toContain("电阻计算器");
  });
  it("BOM 转换忙碌期间，按钮和直接地址更改均不能切走", async () => {
    window.history.replaceState(null, "", "/#bom/excel");
    render(<App />);
    await screen.findByRole("heading", {name: "测试 BOM 工作台"});
    fireEvent.click(screen.getByRole("button", {name: "模拟转换"}));
    const resistance = screen.getByRole("button", {name: "电阻计算器"}) as HTMLButtonElement;
    expect(resistance.disabled).toBe(true);
    fireEvent.click(resistance);
    act(() => {window.history.replaceState(window.history.state, "", "/#resistance"); window.dispatchEvent(new HashChangeEvent("hashchange"));});
    await waitFor(() => expect(window.location.hash).toBe("#bom/excel"));
    expect(screen.getByRole("heading", {name: "测试 BOM 工作台"})).not.toBeNull();
    fireEvent.click(screen.getByRole("button", {name: "结束转换"}));
    expect(resistance.disabled).toBe(false);
  });
  it("忙碌时恢复历史位置，不改写上一条工具记录", async () => {
    window.history.replaceState(null, "", "/");
    render(<App />);
    fireEvent.click(screen.getByRole("button", {name: "打开电阻计算器"}));
    await screen.findByRole("heading", {name: "电阻计算器", level: 1});
    fireEvent.click(screen.getByRole("button", {name: "BOM 工具"}));
    await screen.findByRole("heading", {name: "测试 BOM 工作台"});
    const current = window.history.state.__bomkitRouteIndex;
    fireEvent.click(screen.getByRole("button", {name: "模拟转换"}));
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    act(() => {
      window.history.replaceState({__bomkitRouteIndex: current - 1}, "", "/#resistance");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(go).toHaveBeenCalledExactlyOnceWith(1);
    expect(window.location.hash).toBe("#resistance");
    expect(window.history.state.__bomkitRouteIndex).toBe(current - 1);
    expect(screen.getByRole("heading", {name: "测试 BOM 工作台"})).not.toBeNull();
    act(() => {
      window.history.replaceState({__bomkitRouteIndex: current}, "", "/#bom/excel");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    go.mockRestore();
    fireEvent.click(screen.getByRole("button", {name: "结束转换"}));
    act(() => window.history.back());
    await screen.findByRole("heading", {name: "电阻计算器", level: 1});
    expect(window.location.hash).toBe("#resistance");
    act(() => window.history.forward());
    await screen.findByRole("heading", {name: "测试 BOM 工作台"});
    expect(window.location.hash).toBe("#bom/excel");
  });
});
