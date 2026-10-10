import { useState } from "react";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Home } from "./pages/Home";
import { ReviewWorkspace } from "./pages/ReviewWorkspace";
import { ExcelWorkspace } from "./pages/ExcelWorkspace";
import { AppHeader, type AppRoute } from "./components/AppHeader";

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
  const [route, setRoute] = useState<AppRoute>("home");
  const [excelBusy, setExcelBusy] = useState(false);

  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <div className="e-layout">
        <a className="e-skip-link" href="#main-content">跳到主要内容</a>
        <AppHeader route={route} disabled={excelBusy} onNavigate={setRoute} />
        {route === "home" && <Home onStart={() => setRoute("excel")} />}
        {route === "excel" && <ExcelWorkspace onActivityChange={setExcelBusy} />}
        {route === "review" && <ReviewWorkspace />}
      </div>
    </ConfigProvider>
  );
}

export default App;
