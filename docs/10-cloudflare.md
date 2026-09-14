# 10 · Cloudflare Workers 静态托管部署

- 生产分支：`codex/excel-first-compat`
- 部署模式：Cloudflare Workers Static Assets
- 线上正式地址：[https://bomkit.peyoba660703.workers.dev](https://bomkit.peyoba660703.workers.dev)

## 本地一键部署（推荐）

已打通 Wrangler 本地 OAuth 凭证与一键部署脚本，无需每次打开 Cloudflare 网页控制台：

```bash
bash scripts/deploy.sh
```

执行后会自动：
1. 构建 Python 核心包（`bomcore` wheel）；
2. 固化本地自托管 Pyodide 运行环境（`web/public/pyodide`）；
3. 编译前端生产静态文件（`web/dist`）；
4. 通过 Wrangler 秒级推送到 Cloudflare 边缘网络并生效。

## 生产运行配置说明

- 配置文件：根目录 `wrangler.json`
  - `assets.directory`: `./web/dist`
  - `assets.not_found_handling`: `single-page-application`（原生处理单页路由，无重定向死循环）
- 响应头控制：`web/public/_headers`
  - `/pyodide/bomcore-manifest.json` 设置 `Cache-Control: no-store`。
