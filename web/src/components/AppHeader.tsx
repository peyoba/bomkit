export type AppRoute = "home" | "excel" | "review";

export function AppHeader({route, onNavigate, disabled = false}: {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  disabled?: boolean;
}) {
  return <header className="e-topbar">
    <div className="e-wrap e-topbar-inner">
      <button type="button" className="e-brand" aria-label="bomkit 首页" disabled={disabled} onClick={() => onNavigate("home")}>bomkit</button>
      <span className="e-brand-tag e-mono">BOM → XLSX</span>
      <nav className="e-nav" aria-label="主要功能">
        <button type="button" className="e-nav-item" aria-current={route === "excel" ? "page" : undefined}
          disabled={disabled} onClick={() => onNavigate("excel")}>Excel 转换</button>
        <button type="button" className="e-nav-item" aria-label="网页校对（可选）" aria-current={route === "review" ? "page" : undefined}
          disabled={disabled} onClick={() => onNavigate("review")}>网页校对<span className="e-nav-optional">可选</span></button>
      </nav>
      <span className="e-local-note"><span className="e-brand-tag e-mono">本地处理</span>文件不出浏览器</span>
    </div>
  </header>;
}
