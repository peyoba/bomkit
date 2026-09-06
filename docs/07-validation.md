# 07 · 三平台闭环验证记录

## 本次交付范围

2026-09-06，本地分支 codex/eda-review-loop。以用户提供的三平台文件和既有中文输出样表验证导入、查库、仅问题项确认、模板输出与回读。此轮已按用户纠正取消“全表强制确认”。没有公网部署，也没有代用户批准真实物料。

## 验证清单

| 要求 | 证据 | 结果 |
|---|---|---|
| 三平台输入与 Cadence TXT/逐件/汇总变体 | Python 私有矩阵 + SheetJS 私有测试 + 真实浏览器上传 | 均通过 |
| 企业库完整读取与前导零 | 读取真实17371条；错误 dimension=A1 合成与私有回归 | 通过 |
| 原字段保留、不合并不同属性行 | 原始输入逐格回读；源行/位号/数量逐条核对 | 通过 |
| 确定项无需点击或标注 | 独立规则测试 + 浏览器确定行无警告/确认按钮 + 主表状态留空 | 通过 |
| 默认只显示问题及原因 | 浏览器默认不显示确定行；问题显示字段、BOM原值、库值与原因 | 通过 |
| 只拦截未处理问题 | 合成3行：1行自动通过，只人工确认2项问题即可正式导出 | 通过 |
| 不把候选/近似匹配当确定 | 精确值、m/M、封装、精度、电压、介质、厂商、多候选、缺证据、重复编码专项测试 | 通过 |
| 搜索候选与手动修改 | 合成数据浏览器搜索、选择、最终编码/型号回读 | 通过 |
| 修改后撤销确认 | Python校验+浏览器保存修改后正式导出禁用 | 通过 |
| 三份用户输出样表 | 6输入×3模板×草稿/模拟正式=36个输出逐项回读 | 通过 |
| 清旧明细页脚并保留结构 | 单测、私有矩阵、列宽样式/合并/旧内容/批次数量检查 | 通过 |
| 公式安全 | 原文/最终值/说明的公式样式文本保持字符串 | 通过 |
| 真实 Python 浏览器引擎 | 请求中确认实际WASM和bomcore wheel，禁止mock | 通过 |
| 无文件上传 | Chromium请求记录无POST/外部origin；外部请求主动拦截 | 通过 |
| 大表/坏输入 | 5000行确定项，零人工确认直接正式下载；草稿/正式行数数量回读；空TXT/坏XLSX报错 | 通过 |
| v1兼容与新规则 | Python共140项，含封装/属性伪型号拦截、源参数矛盾及差异原文证据 | 通过 |
| 前端测试、lint、生产构建 | 公开29项；含私有35项；lint；tsc/Vite/prebuild | 通过 |
| 生产产物而非仅dev | 在本机preview地址运行同一E2E脚本 | 通过，最终复跑见私有report |
| v1冻结契约 | 原文SHA256与HEAD相同 | 未修改 |

## 私有输入与结果

真实输入、模板及输出被 Git 忽略。命名统一保存在 core/tests/fixtures/private/closed-loop/inputs/，不需要上传到任何服务。

| 输入文件别名 | 平台变体 | 明细行 | 数量合计 |
|---|---|---:|---:|
| jlc.xlsx | 嘉立创 | 55 | 171 |
| altium.xlsx | Altium | 94 | 250 |
| cadence-report.xlsx | Cadence 五列汇总 | 309 | 1004 |
| cadence-detail.xlsx | Cadence 详细逐件 | 76 | 76 |
| cadence-grouped.xlsx | Cadence 七列汇总 | 33 | 76 |
| cadence-grouped.txt | 同一七列汇总TXT | 33 | 76 |

另需 material.xlsx（用户物料表）及 template-company.xlsx / template-company-alt.xlsx / template-simple.xlsx（用户三份中文清单的布局）。别名与原来源的对应仅保存在本地样例上下文，不提交明细。

- outputs/verification.json：36个模板/模式组合，含每份输出校验、文件名与SHA256。
- outputs/e2e/report.json：真实浏览器9组场景、网络请求边界、5000行结果；baseURL标明测试dev/preview。
- outputs/e2e/*.xlsx：实际浏览器下载回读文件。
- outputs/browser/：ego-browser本机手工操作下载和截图。

技术模拟正式文件明显标注“技术模拟/禁止投产”，且人工操作记录的校对人明确为自动化模拟；真实BOM在浏览器验收中没有被自动确认。

### 当前物料库的覆盖边界

本轮同一17371条库的实测自动通过 / 待处理数量：

| 输入 | 无需人工确认 | 待处理问题 |
|---|---:|---:|
| 嘉立创55行 | 29 | 26 |
| Altium94行 | 43 | 51 |
| Cadence报表309行 | 3 | 306 |
| Cadence明细76行 | 0 | 76 |
| Cadence汇总XLSX / TXT各33行 | 各0 | 各33 |

这些是真实匹配/证据结果，不是要求用户逐行确认的硬编码。尤其 Cadence 样例有库未覆盖的型号、不同封装/参数、以及不能排除的多编码；不能承诺使用不对应的物料库也只剩少量问题。应补齐对应库或明确参数，而不是为了减少计数放行风险。合成5000行完整确定数据已验证无需任何确认。

## 复现

依赖安装和运行时准备见根 README。在仓库根：

    .venv/bin/python -m pytest core/tests -q
    .venv/bin/python core/tests/private_regression.py
    cd web
    BOMKIT_PRIVATE_TESTS=1 npm test
    npm run lint
    npm run build
    npm run preview -- --host 127.0.0.1 --port 4173 --strictPort

保持preview运行，另一个终端：

    cd web
    BOMKIT_E2E_URL=http://127.0.0.1:4173/ BOMKIT_PRIVATE_TESTS=1 npm run test:e2e

公开checkout没有私有文件时不要启用私有变量。仅运行 npm test / npm run test:e2e 使用合成用例即可。

## 边界与后续

- 代码层面闭环与真实物料业务正确性是两项验收。工具只要求处理不确定项，不对确定项强制重复确认；企业生产审核仍按其自身流程进行。
- 样例中的 PART_NUMBER 未确认业务含义，只原样保留；不凭列名擅自填企业编码。
- 不提供会话跨刷新恢复、Service Worker离线保证、任意Excel版式编辑器、ERP直连或模型训练；这些不属于本次授权闭环所必需的已交付能力。
- 浏览器主bundle约1.38MB（gzip约447KB），构建有大chunk提示，后续可分包；未声称做过Lighthouse线上性能验收。
- 已查看本轮合成数据浏览器截图，并检查1440px页面不整体横向溢出；这不等于完整人工打印验收。Excel结构、文本、数量、样式及公式安全另有自动化检查。
- 上轮三个Python修复已在基线236df7e提交并含独立回归；本轮只改问题驱动判定及界面/导出。用户原有未跟踪方案文档不改动、不纳入提交，新私有资料目录也已纳入Git忽略。
