# Aistone 工具箱 — 硬件工程师的日常工具

网站总品牌为 **Aistone 工具箱（Aistone Tools）**，逐步增加硬件工程师日常使用的工具。**BOMKit** 保留为 BOM 整理与转换模块名称；仓库、CLI、Python 包与现有部署项目仍使用 `bomkit`，本次不更名。

这是个人项目；“原公司工具”仅指兼容基线，不代表公司部署或使用。

**以原公司工具为兼容基线：按旧规则合并、排序、展开候选，下载后在 Excel 中处理。网页校对只是可选增强，不再是默认导出的门槛。**

## 当前工具

首页与顶栏提供两个工具入口，均在同一网站中本地运行：

| 功能区 | 独立地址 | 功能 |
|---|---|---|
| BOMKit / BOM 工具 | `/#bom/excel` | 原有 Excel 转换，保留可选 `/#bom/review` 网页校对 |
| 电阻计算器 | `/#resistance` | 反馈分压、普通分压、单电阻/并联组合、目标阻值搜索 |

使用 hash 地址，无需新增服务器路由，Vercel / Cloudflare / 静态托管均可直接打开与刷新。两个工具按需加载；电阻模块不依赖 BOM 文件、会话 store 或 Pyodide，不会读取或修改 BOM 数据。切换工具时，当前页面内的电阻参数/结果与 BOM 已选文件/草稿分别保留；刷新页面后不保留，不写入云端。

电阻计算器迁自 `peyoba/resistance-calculator`，完整保留 77 个阻值与原有匹配方向。并联电压搜索最多显示前 100 组；结果用表格展示上臂 R1、下臂 R2 和实际输出值。精度是搜索窗口，不是元件公差；实际电路仍须校核功耗、容差和负载。来源与模块边界见 `docs/12-independent-tools.md`。

## BOM 工具的两种入口

| 入口 | 用途 | 是否要求网页确认 |
|---|---|---|
| 开始转换（默认） | 公司原版PCBA主表，候选展开、原标色、Excel内校对 | 不需要，未匹配/多候选也可下载 |
| 网页校对（可选） | 保留已有逐项核对、自定义中文模板、校对历史 | 该模式内部保留自己的确认规则 |

默认入口保留PCBA名称/型号、PCB空板名称/型号及自动空板行，主表含厂商、JLC规格、Description和匹配状态。原公司工具仓库只读，未修改。

两个入口在同一浏览器会话内共用已选文件和表单草稿：切换入口不需要重新上传，工作表选择也仍然可用。只改界面不碰文件内容，文件依旧只在浏览器本地解析。更换 BOM 或物料表会作废基于旧文件算出的校对结果。

### 谱系匹配（可选）：上一版 BOM 与物料参考表

工作表 "输入文件" 里还有两个可选上传位：**上一版成品 BOM** 与 **物料参考表**（都是本工具曾经输出的公司 PCBA BOM）。
给了任一个，就启用公司规则 v2 输出（`docs/02-contracts.md` 附录 A）：

- **上一版 BOM**：按位号继承编码（封装一致 + 位号有交集 + 值等价才信任）；上一版编码已从金蝶删除时改配，
  同位号改值（如 C3 由 100nF 改 10pF）标"位号拆分"并按新值重查；PCBA 名称/型号未填时从它继承。
- **物料参考表**：不看位号，按型号或阻容参数（值→封装→公差）直接查编码，适合全新板卡复用已批过的料。
- 输出：主表 13 列（新增"备注"匹配方式与"原始BOM型号（核对后删）"），行底色分级（蓝=非精确匹配、
  橙=未定码、黄=位号/数量异常、灰=DNP），排序按上一版类别顺序、组内阻容值升序、多候选与 DNP 集中在后。
- CLI 等价写法：`bomkit 新版.xlsx -m 物料.xlsx --old 上一版.xlsx --ref 参考表.xlsx`（`--sort legacy` 可退回旧排序）。
- 不上传这两个文件时，输出与旧工具完全一致（12 列、按旧类别顺序、候选展开）。

## 默认流程

1. 选择BOM与可选物料表；可切换工作表。嘉立创Device列可选；支持已验证的Altium、Cadence及TXT变体。
2. 可选填写PCBA/PCB信息、输出文件名。物料表支持金蝶完整格式，以及“规格、物料编码、金蝶系统型号”的旧简易格式。
3. 点击“生成 Excel，在表格中校对”，直接下载，没有网页逐项确认步骤。
4. 在Excel保留正确候选并删除多余候选，补充未匹配项，核对数量，再按公司流程审核。

分组键仍为Name/值 + Footprint/封装 + DNP，数量求和、位号自然排序，其余字段取首个非空；按旧类别顺序及DNP沉底。不会因为新增网页规则而擅自取消合并或只输出默认推荐候选。

**候选展开数量不是采购数量。** 同一真实样例55行171件，旧/新公司模式都输出69行候选展示、数量合计206；需要在Excel删选后再使用。合并后的原值差异可放到附表提醒，不改变旧主表、不阻断下载。

“附原始输入和Excel校对提示”是可选增强：保留所有输入、提示组内型号/厂商差异、明确参数冲突及候选处理注意事项；不会伪造审核人或批准结果。关闭后只导出原公司主表。

## 本地运行

需要Python≥3.10（建议3.12）、Node ^20.19或≥22.12；使用者在浏览器里运行时不需要安装Python。

    uv venv .venv --python 3.12
    uv pip install --python .venv/bin/python -e './core[dev]' -e './cli' setuptools wheel
    .venv/bin/python -m build --wheel --no-isolation core
    cd web
    npm ci
    npm run prepare:pyodide
    npm run build
    npm run preview -- --host 127.0.0.1 --port 4173 --strictPort

修改Python后务必重新打wheel、prepare和build，不可仅复制旧wheel。现有prebuild主要检查文件存在/时间；目前不是完整的源码内容hash门禁。Worker用wheel内容hash版本加载。

## 命令行

CLI与默认网页使用相同Excel转换核心，保留原参数和输出防覆盖/占用重试：

    .venv/bin/bomkit input.xlsx -m material.xlsx -o output.xlsx \
      --pcba-name "PCBA名称" --pcba-model "PCBA型号" \
      --pcb-name "空板名称" --pcb-model "空板型号"

新增可选参数：--platform auto|jlc|altium|cadence、--bom-sheet、--material-sheet、--with-trace。CLI默认不加附表，保持旧单主表形式。不指定-o时使用不重名文件；显式-o按用户指定位置写入。

## 回归

    .venv/bin/python -m pytest core/tests -q
    cd web
    npm test
    npm run lint
    npm run test:e2e

E2E默认访问本机preview 4173，使用真正Pyodide；可用BOMKIT_E2E_URL修改。test:e2e:excel单测默认Excel流程，test:e2e:review单测可选网页流程。

    npm run test:e2e:tools

独立工具 E2E 验证五种计算入口、路由历史/刷新、输入/结果隔离、320～1440px 响应式及电阻页面不加载 Pyodide。

有授权私有样例时再显式启用：

    BOMKIT_PRIVATE_TESTS=1 npm test
    BOMKIT_PRIVATE_TESTS=1 npm run test:e2e

公开公司黄金快照仅含11套合成数据，断言主表值/文本类型/样式/合并/宽高；不包含公司明细。真实样例输出仅保存在Git忽略的private目录，技术自动化结果禁止投产。

## 边界

- 默认公司主表已做旧工具对照；自定义中文模板仍在可选网页入口，尚未迁入默认Excel模式。远端独立模板标注/Profile开发线尚未合并，不冒充已集成。
- 多平台支持限已验证模板；XLS请先转存XLSX。未知PART_NUMBER不猜成企业编码。
- 默认不保存浏览器会话；下载文件由用户在Excel中编辑保存。没有ERP直连、云端自动保存、Service Worker离线保证或生产物料批准能力。
- 主bundle仍有大chunk提示；本地验收及GitHub→Vercel部署分别见下方记录。
- 公司输入/物料表/模板/输出只放core/tests/fixtures/private/；只可部署web/dist，不能将整个工作区发布。

## 文档

- docs/08-excel-first.md：当前默认工作流与兼容验收。
- docs/06-review-contract-v2.md：可选网页校对规则，不约束默认Excel导出。
- docs/07-validation.md：此前v2交付记录，历史时点证据。
- docs/02-contracts.md：v1冻结契约，未改；新Excel入口为独立扩展。
- docs/01-architecture.md、03-milestones.md、04-agent-tasks.md、05-migration-map.md：历史设计及迁移参考，不把未完成计划算交付。

## GitHub → Vercel

在线使用：[bomkit.vercel.app](https://bomkit.vercel.app)。

仓库：<https://github.com/peyoba/bomkit>。Vercel项目bomkit位于个人空间peyobas-projects，生产分支为codex/excel-first-compat；没有覆盖远端main。

构建从仓库根目录运行：npm在web安装完整构建依赖，scripts/vercel-build.sh选择Python≥3.10、安装固定打包工具、重新构建bomcore wheel、准备自托管Pyodide并构建网页。只发布web/dist，不部署Python函数、不使用数据库，也不需要上传BOM资料。

详情见docs/09-vercel.md。每次推送生产分支由原生GitHub连接触发部署；必须以Vercel READY及线上验收结果判断成功，不能只看git push成功。
