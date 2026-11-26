import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Home } from "./pages/Home";
import { AppHeader } from "./components/AppHeader";
import { routeFromHash, routeURL, type AppRoute } from "./lib/navigation";

const ExcelWorkspace = lazy(() => import("./pages/ExcelWorkspace").then(module => ({default: module.ExcelWorkspace})));
const ReviewWorkspace = lazy(() => import("./pages/ReviewWorkspace").then(module => ({default: module.ReviewWorkspace})));
const ResistanceWorkspace = lazy(() => import("./pages/ResistanceWorkspace").then(module => ({default: module.ResistanceWorkspace})));

const historyKey = "__bomkitRouteIndex";
function currentHistoryIndex(): number | null {
  const index = window.history.state?.[historyKey];
  return typeof index === "number" && Number.isSafeInteger(index) ? index : null;
}
function indexedState(index: number) {
  return {...window.history.state, [historyKey]: index};
}

/** antd 只负责交互部件；颜色与圆角按方向 E 的 tokens.css 取值（十六进制为同一 oklch 的换算）。 */
const theme = {
  token: {
    colorPrimary: "#bf2e16", colorSuccess: "#2b654b", colorWarning: "#8f5300", colorError: "#b00008", colorInfo: "#4d5857",
    colorText: "#152120", colorTextSecondary: "#4d5857", colorTextTertiary: "#5b6665",
    colorBgContainer: "#fbfdfb", colorBgLayout: "#f4f8f4", colorBgElevated: "#fbfdfb",
    colorBorder: "#c9d0c9", colorBorderSecondary: "#dfe4e0",
    borderRadius: 2, borderRadiusSM: 2, borderRadiusLG: 3,
    fontFamily: '"Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    fontSize: 14, controlHeight: 40,
  },
};

function App() {
  const [route, setRoute] = useState<AppRoute>(() => routeFromHash(window.location.hash));
  const [resistanceVisited, setResistanceVisited] = useState(() => routeFromHash(window.location.hash) === "resistance");
  const [excelBusy, setExcelBusy] = useState(false);
  const historyIndex = useRef(currentHistoryIndex() ?? 0);
  const restoringHistory = useRef(false);

  useEffect(() => {
    window.history.replaceState(indexedState(historyIndex.current), "");
  }, []);

  function navigate(next: AppRoute) {
    if (excelBusy || next === route) return;
    historyIndex.current += 1;
    window.history.pushState(indexedState(historyIndex.current), "", routeURL(next));
    if (next === "resistance") setResistanceVisited(true);
    setRoute(next);
  }

  useEffect(() => {
    const syncRoute = (event: PopStateEvent | HashChangeEvent) => {
      const destinationIndex = currentHistoryIndex();
      if (restoringHistory.current) {
        if (destinationIndex === historyIndex.current) restoringHistory.current = false;
        return;
      }
      if (excelBusy) {
        if (destinationIndex === historyIndex.current) {
          // A same-entry hash replacement is safe to undo; never rewrite a Back/Forward destination.
          window.history.replaceState(indexedState(historyIndex.current), "", routeURL(route));
        } else {
          restoringHistory.current = true;
          window.history.go(destinationIndex === null
            ? (event.type === "hashchange" ? -1 : 1)
            : historyIndex.current - destinationIndex);
        }
        return;
      }
      historyIndex.current = destinationIndex ?? historyIndex.current + 1;
      if (destinationIndex === null) window.history.replaceState(indexedState(historyIndex.current), "");
      const next = routeFromHash(window.location.hash);
      if (next === "resistance") setResistanceVisited(true);
      setRoute(next);
    };
    window.addEventListener("popstate", syncRoute);
    window.addEventListener("hashchange", syncRoute);
    return () => {
      window.removeEventListener("popstate", syncRoute);
      window.removeEventListener("hashchange", syncRoute);
    };
  }, [excelBusy, route]);

  useEffect(() => {
    const titles: Record<AppRoute, string> = {
      home: "硬件工程师的日常工具", excel: "BOM 转 Excel", review: "BOM 网页校对", resistance: "电阻计算器",
    };
    document.title = `Aistone 工具箱 · ${titles[route]}`;
  }, [route]);

  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <div className="e-layout">
        <a className="e-skip-link" href="#main-content" onClick={event => {
          event.preventDefault();
          const main = document.getElementById("main-content");
          main?.setAttribute("tabindex", "-1");
          main?.focus();
        }}>跳到主要内容</a>
        <AppHeader route={route} disabled={excelBusy} onNavigate={navigate} />
        <Suspense fallback={<main className="e-page e-wrap" id="main-content" aria-busy="true"><p role="status">正在打开工具…</p></main>}>
          {route === "home" && <Home onStart={() => navigate("excel")} onResistance={() => navigate("resistance")} />}
          {route === "excel" && <ExcelWorkspace onActivityChange={setExcelBusy} />}
          {route === "review" && <ReviewWorkspace />}
          {(resistanceVisited || route === "resistance") && <div hidden={route !== "resistance"}>
            <ResistanceWorkspace active={route === "resistance"} />
          </div>}
        </Suspense>
      </div>
    </ConfigProvider>
  );
}

export default App;
