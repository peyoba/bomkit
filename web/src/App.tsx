import { useState } from "react";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Home } from "./pages/Home";
import { ReviewWorkspace } from "./pages/ReviewWorkspace";
import { ExcelWorkspace } from "./pages/ExcelWorkspace";
import { AppHeader, type AppRoute } from "./components/AppHeader";

function App() {
  const [route, setRoute] = useState<AppRoute>("home");
  const [excelBusy, setExcelBusy] = useState(false);

  return (
    <ConfigProvider locale={zhCN}>
      <div className="a-layout">
        <a className="a-skip-link" href="#main-content">跳到主要内容</a>
        <AppHeader route={route} disabled={excelBusy} onNavigate={setRoute} />
        {route === "home" && <Home onStart={() => setRoute("excel")} />}
        {route === "excel" && <ExcelWorkspace onActivityChange={setExcelBusy} />}
        {route === "review" && <div className="a-review-shell" id="main-content"><ReviewWorkspace /></div>}
      </div>
    </ConfigProvider>
  );
}

export default App;
