import { useState } from "react";
import { Button, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Home } from "./pages/Home";
import { ReviewWorkspace } from "./pages/ReviewWorkspace";
import { ExcelWorkspace } from "./pages/ExcelWorkspace";

type Route = "home" | "excel" | "review";

function App() {
  const [route, setRoute] = useState<Route>("home");

  return (
    <ConfigProvider locale={zhCN}>
      {route === "home" && <Home onStart={() => setRoute("excel")} onReview={() => setRoute("review")} />}
      {route !== "home" && <div style={{maxWidth: 1480, margin: "16px auto 0", padding: "0 24px"}}>
        <Button type="link" onClick={() => setRoute("home")}>返回首页（重新开始）</Button>
      </div>}
      {route === "excel" && <ExcelWorkspace />}
      {route === "review" && <ReviewWorkspace />}
    </ConfigProvider>
  );
}

export default App;
