# 10 · Cloudflare Workers 静态托管部署

- 生产分支：`codex/excel-first-compat`
- 部署模式：Cloudflare Workers Static Assets
- 线上正式地址：[https://bomkit.peyoba660703.workers.dev](https://bomkit.peyoba660703.workers.dev)

## GitHub 自动部署（默认）

Cloudflare 已连接 `peyoba/bomkit`，推送生产分支后自动构建和部署，不需要每次打开控制台。
2026-09-14 已核对的后台配置：

| 项目 | 值 |
| --- | --- |
| 生产分支 | `codex/excel-first-compat` |
| 根目录 | `/` |
| 构建命令 | `bash scripts/cloudflare-build.sh` |
| 部署命令 | `npx wrangler deploy` |
| 非生产分支版本命令 | `npx wrangler versions upload` |
| 构建环境变量 | `NODE_VERSION=20`、`PYTHON_VERSION=3.11` |

`main` 不是当前生产分支，不要为触发部署覆盖或强推它。非生产分支的版本上传也不等于切换了生产版本。

### 发布前验证

```bash
bash -n scripts/cloudflare-build.sh scripts/deploy.sh
python3 -m unittest discover -s scripts/tests -v
bash scripts/cloudflare-build.sh
npx wrangler deploy --dry-run
```

构建回归测试不联网、不发布，覆盖 Python 候选顺序、缺少 `ensurepip`、venv/pip 失败回退、显式解释器覆盖和私有产物拦截。
需要验证干净构建时，仅复制 Git 跟踪的源码到临时目录，避免复用旧 wheel 或把本地公司样例带入产物。

### 推送后的验收

推送成功不等于部署成功。用当前提交 SHA 检查 GitHub 的 `Workers Builds: bomkit` 结果：

```bash
gh api "repos/peyoba/bomkit/commits/$(git rev-parse HEAD)/check-runs" \
  --jq '.check_runs[] | select(.name == "Workers Builds: bomkit") | {head_sha, status, conclusion, details_url}'
npx wrangler deployments list
```

必须等该提交的构建检查为 `completed / success`，并确认新版本承接生产流量；然后检查首页、
`/pyodide/bomcore-manifest.json` 和 `/pyodide/pyodide.asm.wasm`。旧版本仍能访问不能证明本次 Git 部署成功。

### Python 构建故障说明

旧脚本优先选择系统 `python3.12`，即使 Cloudflare 已安装 Python 3.11，仍可能因系统 Python 缺少 `ensurepip` 而失败。
现在优先采用 PATH 中的 `python3` / `python`，并检查版本、`venv`、`ensurepip` 以及实际创建环境后的 `pip`。
不合格的解释器自动跳过；每次重建专用的 `.build/python`，不需要 `sudo apt install`。

如显式设置 `BOMKIT_BUILD_PYTHON`，只使用该解释器，不合格就失败，避免静默违背指定版本。Cloudflare 默认不需要设置此变量。

## 本地一键部署（备用）

已打通 Wrangler 本地 OAuth 凭证与一键部署脚本，无需每次打开 Cloudflare 网页控制台：

```bash
bash scripts/deploy.sh
```

执行后会自动：
1. 构建 Python 核心包（`bomcore` wheel）；
2. 固化本地自托管 Pyodide 运行环境（`web/public/pyodide`）；
3. 编译前端生产静态文件（`web/dist`）；
4. 通过 Wrangler 发布到 Cloudflare，并输出部署版本。

本地部署只能作为备用通道，不能替代 GitHub 自动构建成功的验收。

## 生产运行配置说明

- 配置文件：根目录 `wrangler.json`
  - `assets.directory`: `./web/dist`
  - `assets.not_found_handling`: `single-page-application`（原生处理单页路由，无重定向死循环）
- 响应头控制：`web/public/_headers`
  - `/pyodide/bomcore-manifest.json` 设置 `Cache-Control: no-store`。
- 产物检查：阻止 `private` 路径及 `.xls`、`.xlsx`、`.rar` 文件发布；允许 Pyodide 必需的 `python_stdlib.zip`。
- 大陆可达性需使用实际目标网络验证；迁移到 Cloudflare 或绑定自定义域名并不保证所有运营商都能直连。
