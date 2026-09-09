# 09 · 个人项目的GitHub → Vercel部署

- GitHub仓库：[peyoba/bomkit](https://github.com/peyoba/bomkit)，个人公开仓库。
- Vercel个人空间：peyobas-projects，当前Hobby套餐；未升级套餐。
- Vercel项目：bomkit，原生连接GitHub仓库。
- 生产分支：codex/excel-first-compat。保留原main及其独立开发历史，不强推替换。
- Node版本：22.x。Root Directory留空（仓库根），Framework为Other/null。

## 构建与资源

vercel.json指定npm --prefix web ci --include=dev安装，随后bash scripts/vercel-build.sh，输出web/dist。

构建脚本选择可用的Python≥3.10并创建独立构建环境，使用core/requirements-build.txt的固定工具版本重新打wheel，再运行prepare:pyodide和前端build。因此GitHub中无需存放WASM/wheel，也不会沿用本机未提交的运行时。当前本机已做干净源码副本构建验证（NPM依赖复用本机安装；无本机wheel或私有样例）。云端NPM安装、Python选择、完整构建仍以实际部署日志为准。

运行时在同源根路径/pyodide提供，manifest使用no-store响应头；部署域名必须根路径承载应用。Vercel仅托管静态产物，无Python服务端函数或数据库。

## 数据与验收

不将公司来源的样例、物料库、模板或生成结果提交/上传。Git部署只读取已提交文件，.gitignore与.vercelignore进一步保护本机数据。页面使用时文件仍在浏览器本地解析、查库和导出。

预览/生产反馈工具栏关闭，避免给本机处理流程额外注入反馈脚本；不启用Analytics等附加服务。账号原有登录/部署保护不擅自关闭。

每次推送生产分支由原生GitHub连接触发构建。发布成功需同时核对：Vercel状态READY、Git提交SHA/分支正确、线上首页/manifest/WASM返回正常，以及仅合成数据的浏览器转换和下载。不得把BUILDING或仅Git推送成功报为上线完成。

首次公网发布地址及验收以本任务最终结果为准。个人项目用途改变时需自行重新核对套餐使用规则。
