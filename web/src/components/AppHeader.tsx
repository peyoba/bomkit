import { SafetyOutlined } from "@ant-design/icons";

export type AppRoute = "home" | "excel" | "review";

export function AppHeader({route, onNavigate, disabled = false}: {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  disabled?: boolean;
}) {
  return <header className="a-header">
    <div className="a-wrap a-header-inner">
      <button type="button" className="a-brand" aria-label="bomkit 首页" disabled={disabled} onClick={() => onNavigate("home")}>bomkit</button>
      <span className="a-brand-caption">BOM → Excel</span>
      <nav className="a-navigation" aria-label="主要功能">
        <button type="button" className="a-nav-item" aria-current={route === "excel" ? "page" : undefined}
          disabled={disabled} onClick={() => onNavigate("excel")}>Excel 转换</button>
        <button type="button" className="a-nav-item" aria-label="网页校对（可选）" aria-current={route === "review" ? "page" : undefined}
          disabled={disabled} onClick={() => onNavigate("review")}>网页校对<span className="a-nav-optional">可选</span></button>
      </nav>
      <span className="a-local-note"><SafetyOutlined aria-hidden="true" />浏览器本地处理</span>
    </div>
  </header>;
}
