# bomkit — BOM 校对与标准化导出

将嘉立创 EDA、Altium Designer、Cadence 的已验证导出格式导入本机，对照企业物料库。确定项直接通过，只标出不确定项及具体原因，处理后按已有 Excel 模板输出。

## 已实现

- Excel、TXT/TSV/CSV 输入，自动识别三平台的已知模板和前置报表标题；Cadence 逐件与汇总形式均保留源行，不擅自合并。
- 物料库查码与型号/参数候选，排除禁用物料，保留前导零；没有匹配时允许人工搜索或明确保留原文。
- 唯一完整型号或精确参数可确定且无冲突的项自动通过，不标注、不要求点击。默认只列问题项，逐字段显示原因、BOM 原值、库值和人工改动。
- 正式导出只拦截未处理的问题；修改后重新判断，无实际变化的保存不会撤销确认。自动通过与人工确认分开留痕，不伪造校对人。
- 上传用户已有中文 BOM 模板，保留列布局与样式，清除旧明细和页脚；输出含校对记录与原始输入两张附表。
- 浏览器本地 Pyodide Worker，无后端文件上传。模板和文件不自动保存到云端。

## 本地运行

需要 Python ≥3.10（推荐3.12）和 Node ≥20.19（已验证22）。本机系统默认 python3 可能是3.9，请显式选择合适版本。

在仓库根执行：

    uv venv .venv --python 3.12
    uv pip install --python .venv/bin/python -e './core[dev]' -e './cli' setuptools wheel
    .venv/bin/python -m build --wheel --no-isolation core
    cd web
    npm ci
    npm run prepare:pyodide
    npm run dev -- --host 127.0.0.1

浏览器打开终端显示的本机地址。首次依赖准备需要联网下载公开运行时；实际使用过程不会向这些服务发送 BOM。修改 Python 核心后必须重新打 wheel 和 prepare:pyodide，再刷新浏览器。

生产产物本机验证：

    cd web
    npm run build
    npm run preview -- --host 127.0.0.1

prebuild 会阻止缺失运行时或未重新打包的旧核心产物。当前主包约1.38MB，仍有分包优化空间。

## 使用步骤

1. 选择三平台 BOM 和可选企业物料表；多工作表可切换。核对识别出的平台和表头行。
2. 选择已给定布局的中文模板，填写本次标题和套数（默认1，不沿用模板的旧8套/9套）。
3. 点击“检查 BOM”，默认只看需确认项，直接查看每个问题的字段、原值、库值和原因。需要时搜索选料或修改最终值，保存后重新检查，再确认剩余问题。取消筛选可查看全表，确定项没有确认按钮。
4. 未处理问题可导出待校对稿；无未处理问题即可正式导出，无须逐行点确认。未关联库/缺编码/缺封装等情况需填写保留原因，工具不会编造值。
5. 重新导入会清空会话确认。当前不跨刷新保存会话，请先导出校对稿留存；它不是可重新导入的确认凭证。

## 测试

公开合成测试：

    .venv/bin/python -m pytest core/tests -q
    cd web && npm test && npm run lint

真实浏览器回归（先启动本机 dev 或 preview）：

    cd web
    npm run test:e2e

若 Chromium 未安装：npm exec playwright install chromium。E2E 使用真正 Pyodide，不提供 mock 校对；自动确认仅用合成数据。

私有矩阵仅在已获授权的样例存在时运行，资料和产物均被 Git 忽略：

    .venv/bin/python core/tests/private_regression.py
    cd web
    BOMKIT_PRIVATE_TESTS=1 npm test
    BOMKIT_PRIVATE_TESTS=1 npm run test:e2e

指定生产preview地址可设置 BOMKIT_E2E_URL=http://127.0.0.1:4173/ 。私有输入位置与命名见 docs/07-validation.md。

## 验收边界

代码闭环、单测、真实浏览器、私有输出回读证明软件行为，不保证真实元件选型一定正确，也不替代企业生产审核。只有无法确定或存在冲突的项需要在工具内人工确认，不要求重复核对确定项。脚本生成的“技术模拟禁止投产”文件不是业务审核结果。

仅支持已验证的导出/中文模板结构，不是任意模板设计器。未知 PART_NUMBER 不自动认作企业编码。原 v1 CLI 为兼容入口，不含新人工确认门禁；需要门禁请使用网页 v2。

## 文档与数据红线

- docs/06-review-contract-v2.md：新闭环契约，优先用于本次功能。
- docs/07-validation.md：实测证据、复现命令、验收范围。
- docs/01-architecture.md、03-milestones.md、04-agent-tasks.md、05-migration-map.md：历史设计和迁移参考，未做的旧宏大范围不自动算首版已交付。
- docs/02-contracts.md：v1 原文冻结，新API独立实现，不改旧契约。
- 公司真实输入/模板/输出只放 core/tests/fixtures/private/；docs 中已提供的表格/压缩包也已 Git 忽略，禁止提交。
- 前身 jlc_bom_converter 仅只读参考，未修改。
