import { useState } from "react";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Home } from "./pages/Home";
import { Wizard } from "./pages/Wizard";
import { Preview } from "./pages/Preview";
import { TemplateManager } from "./pages/TemplateManager";
import { useWizardStore } from "./stores/wizardStore";

type Route = "home" | "wizard" | "templates";

function App() {
  const [route, setRoute] = useState<Route>("home");
  const step = useWizardStore((s) => s.step);

  return (
    <ConfigProvider locale={zhCN}>
      {route === "home" && (
        <Home onStart={() => setRoute("wizard")} onTemplates={() => setRoute("templates")} />
      )}
      {route === "templates" && <TemplateManager onBack={() => setRoute("home")} />}
      {route === "wizard" && (
        <>
          <Wizard />
          {step === "convert" && <Preview />}
        </>
      )}
    </ConfigProvider>
  );
}

export default App;
