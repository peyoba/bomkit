import { useState } from "react";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Home } from "./pages/Home";
import { ReviewWorkspace } from "./pages/ReviewWorkspace";

type Route = "home" | "wizard";

function App() {
  const [route, setRoute] = useState<Route>("home");

  return (
    <ConfigProvider locale={zhCN}>
      {route === "home" && <Home onStart={() => setRoute("wizard")} />}
      {route === "wizard" && (
        <ReviewWorkspace />
      )}
    </ConfigProvider>
  );
}

export default App;
