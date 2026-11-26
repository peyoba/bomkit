# Aistone 工具箱：工具模块与边界

网站总品牌已确定为 **Aistone 工具箱（Aistone Tools）**，介绍为“硬件工程师的日常工具”。BOMKit 保留为 BOM 模块名称；仓库、CLI、Python 包和部署项目不随网站品牌更名。

## 入口与边界

- `/`：双工具首页。
- `/#bom/excel`：BOM 默认 Excel 转换；`/#bom/review`：BOM 可选网页校对。
- `/#resistance`：电阻计算器。

采用 hash 导航，不新增依赖、不需要服务端 rewrite。保留当前 pathname 和 query；浏览器前进/后退、分享地址和刷新均可定位入口。BOM 转换活动期间禁止切换，沿用原有下载保护。历史记录带站内位置标记；忙碌期间前进/后退会恢复原位置，不改写目标记录，结束后仍可正常遍历工具历史。

BOM 的两个子入口仍共用原 `sessionStore` 和惰性 Worker 单例。电阻页面只依赖 React、本模块的计算函数、局部 CSS 和静态电路图；没有对 BOM 文件、store、Worker 或 Pyodide 的引用。两个页面分别按需加载。

首次打开电阻页面后，切换时仅隐藏该实例，保留当前页面内的参数与结果；不使用全局变量、localStorage 或云存储。BOM 文件和草稿继续由原会话 store 保留。刷新页面会清空两者的临时状态。隐藏页面不占用 `main-content` 锚点。

## 电阻功能迁移来源

- 原仓库：<https://github.com/peyoba/resistance-calculator>
- 来源版本：`e51c934f9b5600f9a9aa58af3a6744465c43fd1b`（main）。
- `index.html` 的原生 JS 计算逻辑移至 `web/src/features/resistance/calculator.ts`；`assets/circuit.png` 复制为同模块静态资源，原仓库未修改。
- UI 改为与 BOMKit 相同的视觉风格、三块独立表单及带单位的结果表，不带入原有全局 CSS 或 DOM 事件绑定。

保留 77 个阻值及枚举顺序、单电阻和两电阻并联支路：

| 模式 | 公式 | 匹配窗口 |
|---|---|---|
| 反馈分压，单电阻/含并联 | `Vout = VFB × (1 + R1/R2)` | 等于或高于目标，差值小于精度 |
| 普通分压，单电阻 | `Vout = VCC × R2/(R1+R2)` | 目标两侧绝对差值小于精度，或精确相等 |
| 普通分压，含并联 | 同上 | 等于或高于目标，差值小于精度 |
| 目标阻值 | `R = Ra × Rb/(Ra+Rb)` | 等于或低于目标，差值小于精度 |

明确修正：普通单电阻分压不重复相同行；含并联电压结果严格限制 100 组（原代码 `count > 100` 会超限）；空/非有限/负数与非物理电压组合有错误提示；无结果改为中文说明；“关闭窗口”改用网站导航，不再调用 `window.close()`。

结果标明计算时的目标与精度，修改参数不会让旧结果冒充新计算；清空只清除结果。精度为搜索窗口，**不是元件制造公差或电路精度保证**。内置库并非完整 E96，实际选型需另外核对功耗、容差和负载。

## 验证命令

在 `web` 目录运行：

```sh
npm test
npm run lint
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
# 另开终端
npm run test:e2e:tools
npm run test:e2e
npm run test:e2e:ui
```

单元测试覆盖公式、并联等效值、方向/精度边界、零精度、无结果、输入错误、100 组上限、导航和隔离。工具 E2E 在真实浏览器验证五种计算入口、不加载 BOM/Pyodide、路由前进/后退/刷新、BOM 与电阻草稿互不影响，以及 320～1440px 布局。报告/截图写入 `PI_SCRATCH_DIR`；CI 可指定 `BOMKIT_TOOLS_E2E_OUTPUT`。BOM 原有 E2E 继续使用真正 Pyodide 和公开合成数据，不启用私有样例。

本地验收不代表生产发布成功。推送 `codex/excel-first-compat` 沿用原生 GitHub → Vercel 自动部署；必须核对提交 SHA、生产部署完成状态和线上功能，不能只看本地构建或 Git 推送成功。部署方式见 `docs/09-vercel.md`。

## 本地验收结果

- 前端：75 项通过，6 项需私有样例的测试跳过；Lint 无警告/错误，TypeScript 和生产构建通过。
- Python 核心与部署脚本：192 项通过，另 9 个 subtest 通过；Python 业务代码未修改。
- 真实 Pyodide Excel 导出：16 个场景；网页校对确认/下载/失效检查通过。
- 双工具：9 个流程、14 项布局检查；原 BOM UI：5 个流程、23 项布局检查。品牌更名后增加 640px、960px 首页检查，站名与浏览器标题断言通过。
- 已验证电阻页面不加载 BOM/Pyodide、切换独立保留草稿、独立地址刷新和忙碌期间历史保护；无外部请求或资料上传。
- `git diff --check` 通过。仅保留原有 BOM 共享 chunk 大于 500kB 的构建提醒，不影响构建。
