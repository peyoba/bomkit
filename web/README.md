# bomkit Web

当前入口为 v2 校对工作台：Home → ReviewWorkspace。真实 Pyodide Worker 调用 bomcore.review_api.dispatch；旧 Wizard/Preview 仅保留作 v1 参考，不在主页面流程中使用。

## 命令

    npm ci
    npm run prepare:pyodide
    npm run dev -- --host 127.0.0.1
    npm test
    npm run lint
    npm run build
    npm run preview -- --host 127.0.0.1

prepare 前需先在仓库根用 .venv/bin/python -m build --wheel --no-isolation core 生成当前wheel。prebuild检查缺失/陈旧资源，Worker通过内容hash版本清单加载，避免缓存旧wheel。

## 浏览器回归

保持dev/preview运行，另一个终端执行 npm run test:e2e。设置 BOMKIT_PRIVATE_TESTS=1 时增加六份用户输入和三种用户模板的草稿回归。BOMKIT_E2E_URL 可指定本机preview地址。

脚本用实际 Chromium+Pyodide，检查无外部请求/无上传、候选搜索、确认、下载回读、修改后失效、5000行、空/坏文件。真实样例不自动代用户确认。

## 关键文件

- src/lib/reviewInput.ts：XLSX/TXT解码、范围修复、预设识别；预设与Python共用JSON。
- src/pages/ReviewWorkspace.tsx：导入、源/库/最终值并排校对和导出。
- src/components/ReviewFindings.tsx：列表与详情共用字段证据；确定项不渲染标签或警告。默认问题筛选和正式导出门禁均以 export_ready 判断，不能用 confirmed=false 判断“待校对”。
- src/workers/pyodide.worker.ts：自托管runtime、串行会话动作、释放临时Python代理。
- src/types/review.ts：独立v2类型，不修改v1冻结契约。
- scripts/test-review-e2e.mjs：可重复的真实引擎浏览器回归。

当前采用 React19 / Ant Design6 / Vite8 / Pyodide0.26.4（package-lock锁定）。不宣称已完成Service Worker离线缓存、Profile跨刷新持久化或任意模板设计器。所有源文件只在本机内存中使用；刷新会失去校对会话。
