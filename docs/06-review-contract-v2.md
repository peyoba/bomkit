# 06 · 三平台校对闭环契约 v2

本文件记录 2026-09-05 用户授权开发的新版行为。02-contracts.md v1 保持原文冻结；旧 bomcore.api 和 CLI 继续兼容 v1，新网页入口使用独立 v2，不把推荐索引当人工确认。

## 1. 范围与不变量

- 已验证嘉立创 EDA、Altium、Cadence 逐件/汇总导出样例；同一软件可能有其他模板，不宣称支持所有导出。
- 文件在本机浏览器解析，Python 在 Web Worker/Pyodide 运行，不上传原文件或向外部接口查询。
- 每条有效输入行对应一条校对记录和输出行，保留位号、数量、全部源字段、原始型号。不按值/封装自动合并，不展开候选导致数量翻倍。
- 原型号与库规格并排对比，包括大小写、空白差异。归一化只用于候选搜索，不改原文，不代表物料等价。
- 所有行都需要显式确认（比仅差异行更保守）。修改候选、最终字段、说明后确认失效，历史确认不自动复用。
- 人工确认不能保证供应链零错误；工具提供核对信息和留痕，不替代工程评审。

## 2. 输入

### 2.1 已知 EDA 预设

单一数据源：core/src/bomcore/presets/eda_inputs_v2.json，Python 和 TS 共用。

| 变体 | 位号 | 数量 | 原始值 / 型号 | 封装 |
|---|---|---|---|---|
| 嘉立创 | Designator | Quantity | Name、Device | Footprint |
| Altium | Components | Quantity | Comment | Pattern |
| Cadence 汇总 | Reference | Quantity | Part | PCB footprint |
| Cadence 明细 | Part Reference | Quantity | Value、非空 Manufacturer Part Number | PCB Footprint |

- 扫描前 50 行，按预设必需表头集合定位，不假设表头总在第一行。关键表头重复时报错。
- Supplier Part 和未明确含义的 PART_NUMBER 留在源字段，不擅自当企业编码或厂家 MPN。
- 原型号优先取非空 Device/MPN，否则取值字段；两列都原样保留。
- XLSX 默认首个实际非空工作表，允许切换；兼容 ERP 错误声明 dimension=A1，依据真实单元格范围读取。
- TXT/TSV/CSV 保留空列与引号内换行；优先严格 UTF-8，失败尝试 GB18030（覆盖本次 GBK 样例）。不按空格切列、不替换字符吞乱码。
- 文件上限 20MB，100000 行、256 列、单元格 32767 字符；Python XLSX 解包另有体积限制。损坏输入明确报错。
- 空行/报表分隔线标记跳过；明确的表尾备注保留并展示提示，不作为软件指令执行。其他异常明细不静默丢弃。
- 数量非数值、负数、NaN/Infinity 返回带源行错误；缺封装/位号、重复位号、数量与位号数不同、DNP 均进入人工校对提示，不自动猜补或删行。

### 2.2 物料库

识别编码、名称、规格型号、禁用状态及可选封装/精度/厂商。编码按文本保留前导零；跳过明确禁用项。有编码无规格的记录保留供搜索并提示缺失，重复编码以源行 ID 分开。

现有匹配管线只作为建议，另可按关键词/编码搜索。空物料表、全禁用或没有编码记录明确报错；未选择物料表时可明确校对保留原文，不生成猜测编码。

## 3. 会话与行结构

v2 Worker 持有唯一 ReviewSession。主线程只发送动作，导出不接受主线程传来的 confirmed 或替换行列表。

每行包含源行号、所有原列、fields、original_model、候选列表及总数、推荐等级、selected_id、selected_material、final、差异、说明和确认历史。

final = {code, name, model, footprint} 是建议初值，可由用户校对。confirmation 记录校对人、UTC 时间和与源行/库/选项/最终值/说明绑定的 fingerprint。它避免软件陈旧状态，不是防恶意用户篡改的数字签名。

位号与数量当前只读；如有错误需修正源文件后重导。缺编码/封装、未关联库或原数据有异常时确认需要说明。最终型号为空不能确认。

## 4. Worker 动作

请求为 {id, fn:review, args:{action,...}}，响应 {id,ok,result|error}。请求串行执行并释放临时 PyProxy。

| action | 参数 | 返回 |
|---|---|---|
| detect | rows, platform | 格式与表头位置 |
| start | bom_rows, material_rows?, platform?, source_name?, sheet_name? | 新 snapshot，旧确认清空 |
| search | query | 前 30 条记录及总数 |
| update | row_id, patch（仅 selected_id/final/note） | 更新行，撤销确认 |
| confirm | row_id, reviewer, note? | 经校验后的确认行 |
| revoke | row_id | 撤销确认 |
| snapshot | 无 | 会话快照 |
| export | template_b64?, meta?, mode | XLSX 字节 |
| clear | 无 | 释放会话 |

新增错误码 CONFIRMATION_REQUIRED。不提供 mock v2，防止固定结果冒充真实匹配。

## 5. 模板与导出

- 接受用户给出的中文 BOM 样表：序号、名称、数量、位号、型号/规格型号、封装、物料编码，支持“需求8”/“9套”类批次列。
- 自动选含核心列的模板页；保留表头、列顺序、列宽、首数据行样式；清除旧明细/页脚/数据区合并/旧标题/无关工作表，不带入旧项目数据。
- 标题使用本次输入名或用户填写标题；生产套数默认 1，绝不沿用旧模板 8/9。
- 未上传模板用默认中文七列；上传模板损坏/不识别时报错，不悄悄换默认模板。
- draft 可含未确认行，工作表/标题/状态明确待校对和不可投产。final 必须 Python 会话验证全部确认且 fingerprint 未变化。
- 主表写 final 和原位号/数量，每源行一输出。另附“校对记录”“原始输入”，包含原型号/库规格/最终值/差异/说明/校对人/时间/历史。
- 所有输入文本强制字符串写入，禁止公式注入。未匹配项可由人工说明后明确保留，空编码保持空，不填假编码。

## 6. 验证与边界

公开单测只用合成数据；私有回归显式启用，原文件和结果仅保存在 gitignored private 目录。真实输入在浏览器只导草稿；脚本模拟确认产物标记技术测试、禁止投产，不等于业务验收。

暂不包含任意模板设计器、自动料号替换、云同步、ERP API 直连和生产部署。其他新格式补样例回归后再加入预设。
