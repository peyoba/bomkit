import type { AppRoute } from "../lib/navigation";
export type { AppRoute } from "../lib/navigation";

export function AppHeader({route, onNavigate, disabled = false}: {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  disabled?: boolean;
}) {
  const isBom = route === "excel" || route === "review";
  return <header className="e-topbar">
    <div className="e-wrap e-topbar-inner">
      <button type="button" className="e-brand" aria-label="Aistone 工具箱首页" disabled={disabled} onClick={() => onNavigate("home")}>Aistone 工具箱</button>
      <span className="e-brand-tag e-mono">硬件工程工具</span>
      <nav className="e-nav" aria-label="工具导航">
        <button type="button" className="e-nav-item" aria-current={isBom ? "location" : undefined}
          disabled={disabled} onClick={() => onNavigate("excel")}>BOM 工具</button>
        <button type="button" className="e-nav-item" aria-current={route === "resistance" ? "page" : undefined}
          disabled={disabled} onClick={() => onNavigate("resistance")}>电阻计算器</button>
      </nav>
      <span className="e-local-note"><span className="e-brand-tag e-mono">本地处理</span>数据不出浏览器</span>
    </div>
    {route !== "resistance" && <nav className="e-wrap e-subnav" aria-label="BOM 功能">
      <span className="e-subnav-label">BOM 工具</span>
      <button type="button" className="e-nav-item" aria-current={route === "excel" ? "page" : undefined}
        disabled={disabled} onClick={() => onNavigate("excel")}>Excel 转换</button>
      <button type="button" className="e-nav-item" aria-label="网页校对（可选）" aria-current={route === "review" ? "page" : undefined}
        disabled={disabled} onClick={() => onNavigate("review")}>网页校对<span className="e-nav-optional">可选</span></button>
    </nav>}
  </header>;
}
