# 10 · 个人项目的GitHub → Cloudflare Pages部署

- GitHub仓库：[peyoba/bomkit](https://github.com/peyoba/bomkit)，个人公开仓库。
- 生产分支：`codex/excel-first-compat`。
- 目标：将前端静态站点迁移/双发到 Cloudflare Pages，结合自定义域名解决国内用户访问受限问题。

## Cloudflare Pages 控制台设置

在 [Cloudflare Dashboard](https://dash.cloudflare.com/) 中操作：
1. **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**。
2. 选择仓库 `peyoba/bomkit`。
3. 构建与部署参数：
   - **Production branch**（生产分支）：`codex/excel-first-compat`
   - **Framework preset**（框架预设）：`None`
   - **Build command**（构建命令）：`bash scripts/cloudflare-build.sh`
   - **Build output directory**（输出目录）：`web/dist`
   - **Root directory**（根目录）：留空（即仓库根目录）
4. **Environment variables**（环境变量，必须添加）：
   - `PYTHON_VERSION` = `3.11`
   - `NODE_VERSION` = `20`

## 架构与静态产物说明

- **自托管运行时**：构建脚本 `scripts/cloudflare-build.sh` 会自动在构建环境中安装 Python 构建工具、编译 `core` 模块为 wheel，并调用 `web/scripts/prepare-pyodide.mjs` 下载并固化 Pyodide 0.26.4 及其依赖包到 `web/public/pyodide`，最后由 Vite 打包至 `web/dist`。
- **响应头控制 (`_headers`)**：通过 `web/public/_headers` 配置 `/pyodide/bomcore-manifest.json` 的 `Cache-Control: no-store`，确保引擎元数据不被 CDN 强缓存。
- **SPA 路由兜底 (`_redirects`)**：通过 `web/public/_redirects` 配置 `/* /index.html 200`，避免深链接或页面刷新报 404。

## 大陆直连与自定义域名（必须配置）

1. Cloudflare Pages 分配的默认域名（如 `bomkit.pages.dev`）在部分国内网络中仍存在 SNI 阻断。
2. **必须绑定自定义域名**：
   - 在项目控制台进入 **Custom domains**。
   - 点击 **Set up a custom domain**，绑定你的独立域名（如 `bom.yourdomain.com`）。
   - 走 Cloudflare Anycast CDN，国内用户即可直接顺畅打开，免翻墙访问。
