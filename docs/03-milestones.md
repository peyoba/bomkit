# 03 · 里程碑与验收门

里程碑与任务卡（`04-agent-tasks.md`）的对应：M0=T0，M1=T1/T2/T3 并行，M2=T4，M3=T5。

## M0 骨架与契约落地（T0）

产出：monorepo 工具链骨架（core pyproject / web Vite 工程 / cli 入口，均空实现可构建）、契约 fixture（`core/tests/fixtures/contract/`）、黄金基准文件放置（private 目录）。
验收门：`pip install -e core/` 成功；`npm run build`（web）成功；契约 fixture 通过 JSON Schema 校验。

## M1 三线并行开发（T1 core / T2 web / T3 预设词库）

验收门（全部满足后进入 M2）：
- T1：pytest 全绿；旧测试全部迁移且语义不变；bomcore wheel 可构建；黄金回归脚本本地跑通（用 private 真实数据）。
- T2：mock 链路下完整向导流程可走通（上传→映射→模板→预览→下载出可打开的 xlsx——mock 阶段下载可为占位）；Vitest 全绿；Pyodide 加载设施用占位 wheel 演练成功。
- T3：词库/预设 JSON 全部通过 schema 校验；每种预设配套一个合成 fixture xlsx；detect_cases.json 覆盖每种预设至少 2 个用例。

## M2 集成与端到端验证（T4）

产出：三分支合入 main；真实 bomcore wheel 接入 web；mock 移除。
验收门：
1. 黄金回归：公司真实输入（private fixture）经"嘉立创预设 + 金蝶预设 + 默认输出模板"走新链路，输出与旧工具输出逐单元格等价（值 + 状态列文字 + 填充色）。允许的差异需逐条列出并经任务分发者确认。
2. Playwright E2E 绿：完整向导流程 + Profile 保存/指纹复用流程 + 多候选处理流程，三条用例。
3. 首次加载体验：冷加载有进度指示；二次访问 Pyodide 资源命中缓存。
4. 异常路径：错列文件、空文件、超大文件（≥5000 行 BOM）不崩溃、有可读错误提示。

## M3 部署与发布（T5）

产出：Cloudflare Pages 线上环境、落地页、README 用户版、推广素材草稿。
验收门：线上 URL 全流程可用（真实浏览器手测）；Lighthouse 性能与可访问性无红灯项；落地页明确传达"文件不出本机"并附验证方法说明。

## 验证策略（贯穿）

1. 单元层（pytest）：旧测试全量迁移（匹配置信度、R/C 解析、物料加载、公式注入、端到端）+ 新增 detect/schema/指纹测试。
2. 契约层：`detect_cases.json` 为 TS 与 Python 双端共享用例，防止双实现漂移；`analyze_expected.json` 锁定引擎行为。
3. 黄金回归（最高优先级）：保证公司内部场景零回归，这是唯一使用真实数据的测试，只在本地跑、结果不入库。
4. E2E（Playwright）：模拟真实用户全流程。

## 风险与对策

- Pyodide 首载体积：去 pandas 后约 8-12MB gzip；进度条 + SW 缓存 + 自托管。若实测超预期，检查 wheel 是否带入多余依赖。
- 词库覆盖不足：映射向导是兜底；页面留反馈入口收集未识别列名（mailto 或 GitHub issue 链接即可，MVP 不做上报接口）。
- 国内访问 Cloudflare Pages 不稳：MVP 接受；Post-MVP 用腾讯云 EdgeOne/COS + 备案域名。
- 双份核心（旧仓库 vs bomcore）：旧仓库冻结只修 bug；公司内部使用在 M2 黄金回归通过后切换到新 CLI。
- Obsidian Vault 同步干扰：本仓库位于 Obsidian Vault 内，建议在同步工具中排除 `bomkit/`（node_modules/.git 高频小文件会拖慢同步甚至制造冲突）。

## Post-MVP backlog（明确不在本期）

账号体系与云端配置同步；立创商城 API 查价/库存；BOM 版本对比；词库匿名上报；国内 CDN + 备案域名；英文界面；核心 TS 移植评估；桌面版（PyInstaller 复用 bomcore + 旧 GUI 退役）。
