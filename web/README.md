# bomkit web

React + TypeScript + Vite + Ant Design + Zustand 前端骨架。

## 开发

```bash
npm install
npm run dev      # 开发服务器
npm run build    # tsc -b && vite build
npm run test     # vitest run
npm run lint     # oxlint
```

## 当前状态（骨架阶段，见仓库根 docs/04-agent-tasks.md T2）

- `src/types/contracts.ts`：`docs/02-contracts.md` 的 TS 类型镜像。
- `src/lib/detect.ts`：表头探测 + 列名猜测的 TS 实现，与 Python 侧
  `core/src/bomcore/detect.py` 共用同一份测试用例
  (`core/tests/fixtures/detect_cases.json`，见 `src/lib/__tests__/detect.test.ts`)。
- `src/lib/fingerprint.ts`：表头指纹（Web Crypto sha256）+ Jaccard 相似度。
- `src/lib/xlsx.ts`：SheetJS 读取器，严格遵守契约第 2 节字符串化规则
  （`raw:false` + `defval:""`，防止金蝶编码前导零丢失）。
- `src/lib/profiles.ts`：Profile localStorage CRUD + 指纹复用判断。
- `src/workers/mockWorkerClient.ts`：读 `core/tests/fixtures/contract/analyze_expected.json`
  返回固定结果，用于在真实 bomcore wheel + Pyodide 接入前跑通完整向导流程。
- `src/workers/workerClient.ts` 的 `createPyodideWorkerClient()`：**尚未实现**，
  调用会抛出明确的错误信息。真实 Pyodide 接入是 T4 集成任务（见任务卡），
  需要先构建 bomcore wheel、下载 Pyodide runtime 到 `public/pyodide/`。
- 页面：`Home` → `Wizard`（BOM 上传映射 → 物料库上传映射(可跳过) → 输出模板 → 转换）
  → `Preview`（stats 汇总 + 状态着色 + 多候选选择）。已用 Playwright 验证
  mock 模式下完整流程无 JS 报错。

## 已知缺口（诚实披露，非"已完成"）

1. **导出下载未实现**：Preview 页面没有导出按钮——`render()` 依赖真实
   Pyodide Worker，mock Worker 明确拒绝 render 调用。
2. **TemplateAnnotator 未实现**：输出模板目前固定为契约里的内置默认布局，
   还没有"上传模板 + 标注"界面（见任务卡 T2 任务 6）。
3. **Service Worker 缓存未实现**（任务卡 T2 任务 7）。
4. **词库/预设仅为占位最小集**：真正的多 EDA 别名词库调研是 T3 任务。
5. Ant Design 版本：`npm install antd` 装到的是当前最新的 **6.x**，而非架构文档
   写的 "Ant Design 5"。功能上未发现受影响的 API 差异（用到的 Steps/Table/
   Upload/Statistic/Space 组件均正常工作，唯一因版本差异调整的是
   `Statistic.valueStyle`→`styles.content`、`Space.direction`→`orientation`
   两处新 API），但这是对架构文档技术栈基线的一个偏离，请任务分发者确认
   是否接受锁定到 6.x，或改为显式安装 `antd@5`。
