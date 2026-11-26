import { afterEach, describe, expect, it } from "vitest";
import { routeFromHash, routeURL } from "../navigation";

afterEach(() => window.history.replaceState(null, "", "/"));
describe("独立功能区地址", () => {
  it("空地址和未知地址回到双入口首页", () => {
    expect(routeFromHash("")).toBe("home");
    expect(routeFromHash("#unknown")).toBe("home");
  });
  it("两个工具有各自可直接打开的地址", () => {
    expect(routeFromHash("#bom/excel")).toBe("excel");
    expect(routeFromHash("#bom/review")).toBe("review");
    expect(routeFromHash("#resistance")).toBe("resistance");
  });
  it("导航保留部署子路径与现有查询参数", () => {
    window.history.replaceState(null, "", "/tools/?worker=mock#resistance");
    expect(routeURL("excel")).toBe("/tools/?worker=mock#bom/excel");
    expect(routeURL("home")).toBe("/tools/?worker=mock");
  });
});
