# 01 · 架构与技术选型

## 1. 关键决策记录（ADR 摘要）

### D1 纯前端本地处理（Pyodide），无后端
- 内容：所有文件解析、匹配、生成都在浏览器内完成。Python 核心（bomcore）编译为 wheel，由 Pyodide 在 Web Worker 中加载执行。无任何文件上传。
- 理由：BOM 与 ERP 物料库是企业供应链敏感数据，"文件不出本机"是最强推广卖点且可被用户验证；零服务器成本、免 ICP 备案、无运维。
- 代价与缓解：首次加载约 8-12MB gzip（已通过去 pandas 压缩）；用加载进度条 + Service Worker 缓存缓解，二次访问秒开。

### D2 复用 Python 核心（而非移植 TypeScript）
- 内容：匹配引擎沿用旧项目经生产验证的 Python 代码，重构而不重写。
- 理由：旧核心沉淀了大量难以重新发现的边界 case（见 `05-migration-map.md` 清单），移植等于重踩所有坑并引入双语言维护。
- TS 移植列入 Post-MVP 评估，不在本期。

### D3 核心去 pandas 化
- 内容：bomcore 仅依赖 openpyxl（用于写 xlsx 和 CLI 侧读 xlsx）。Web 侧读取由 SheetJS 完成，数据以"行数组 JSON"进入 Python。
- 理由：pandas 是 Pyodide 载荷的绝对大头（去掉后 ~30MB → ~10MB），且旧代码只用了 read_excel 和 groupby，均可低成本手写替代。

### D4 前端 React + TypeScript + Vite + Ant Design 5
- 状态管理 Zustand；大表格用 AntD Table 虚拟滚动，必要时 TanStack Table/Virtual。
- 理由：开发全部由 AI 代理完成，React+TS 训练语料密度最高、生成质量最稳；本项目 UI 主体是向导 + 数据密集表格，正是 AntD（Steps/Upload/Table）与 TanStack 生态强项。

### D5 无账号体系（MVP）
- 配置（Profile）存 localStorage，支持导出/导入 JSON 文件实现团队共享。账号与云端同步列入 Post-MVP。

### D6 输出模板 = "上传现有模板 + 可视化标注"
- 不做从零搭建的模板设计器。用户上传公司现成模板 xlsx → 标注数据起始行、列↔字段映射、元数据单元格 → openpyxl 加载模板保留原样式后填数。
- 内置默认模板（程序化生成）= 旧工具的公司 PCBA 模板输出，保证旧场景零回归。

## 2. 仓库结构（monorepo）

```
bomkit/
├── docs/                        # 本文档体系
├── core/                        # Python 包 bomcore（纯逻辑，仅依赖 openpyxl）
│   ├── pyproject.toml           # 构建 pure-python wheel（Pyodide 加载 + pip 安装）
│   ├── src/bomcore/
│   │   ├── models.py            # 标准中间模型 dataclass（见 02-contracts）
│   │   ├── schema.py            # 字段注册表 + Profile 校验（schema_version）
│   │   ├── detect.py            # 表头行探测 + 列名猜测（词库+内容验证+置信度）
│   │   ├── aliases/*.json       # 列名别名词库（数据文件）
│   │   ├── parse_rc.py          # R/C 值解析
│   │   ├── matching.py          # 可配置级联匹配管线
│   │   ├── grouping.py          # 分组合并 / 排序
│   │   ├── render.py            # 模板驱动 openpyxl 渲染 + 公式注入防护
│   │   ├── presets/*.json       # 内置 Profile（输入预设 / 物料表预设 / 默认输出模板）
│   │   └── api.py               # 稳定门面 detect()/analyze()/render()，CLI 与 Worker 共用
│   └── tests/
│       ├── fixtures/            # 脱敏合成 fixture（可入库）
│       └── fixtures/private/    # 公司真实数据（gitignored，仅本地黄金回归用）
├── cli/                         # 新 CLI（薄壳，兼容旧工具参数）
└── web/                         # React SPA
    ├── public/pyodide/          # 自托管 Pyodide runtime + openpyxl wheel + bomcore wheel（构建产物，gitignored）
    └── src/
        ├── workers/pyodide.worker.ts    # Worker 内加载 Pyodide，桥接 detect/analyze/render
        ├── lib/xlsx.ts                  # SheetJS 读取 → 行数组 JSON（字符串化规则见契约）
        ├── lib/profiles.ts              # Profile localStorage 存取 + 指纹匹配 + 导入导出
        ├── stores/                      # Zustand：向导状态、Profile 状态、Pyodide 加载状态
        ├── pages/Home.tsx               # 落地页（隐私卖点说明）
        ├── pages/Wizard.tsx             # 转换向导（步骤见下）
        ├── pages/Preview.tsx            # 结果预览与修正
        └── components/
            ├── MappingTable.tsx         # 列映射确认表（源列+样本数据+目标字段下拉+置信度着色）
            ├── TemplateAnnotator.tsx    # 输出模板标注器（网格预览+起始行+列映射+元数据单元格）
            └── CandidatePicker.tsx      # 多候选单选组件
```

## 3. 数据流

```
用户选择文件
   │  SheetJS（主线程或专用 worker）读取 → 行数组 JSON（全部字符串化）
   ▼
[detect] 前端即时：表头行探测 + 列名猜测（前 50 行）——不等 Pyodide
   │  用户在 MappingTable 确认/修正 → 生成/复用 Profile（指纹命中自动套用）
   ▼
[analyze] Pyodide Worker：bom_rows + material_rows + profiles + match_config
   │  返回逐行匹配结果（状态/置信度/候选列表）
   ▼
Preview 页：颜色状态渲染，用户处理多候选、手改编码
   │  用户点"导出"
   ▼
[render] Pyodide Worker：final_items + output_template Profile + meta
   │  返回 xlsx 字节（Uint8Array）
   ▼
前端 Blob 下载
```

detect 在前端有一份 TS 实现（即时反馈），在 bomcore 也有同等实现（CLI 复用 + 作为真值基准）；两者行为以 `02-contracts.md` 的算法定义为准，用共享测试用例约束一致性。

## 4. 用户流程（产品视角）

1. 上传 BOM → 自动识别表头，映射表绿色（高置信）/黄色（待确认）预填，用户确认。
2. （可选）上传物料库 → 同样映射确认。不上传则跳过匹配，仅做格式转换。
3. 选择输出模板：内置默认模板 / 已保存模板 / 上传新模板并标注。
4. 转换 → 预览页：匹配状态着色、多候选单选、可手改编码。
5. 下载。所有步骤配置自动存为 Profile；下次上传同构文件（指纹命中）直达"上传→转换→下载"。

## 5. 技术栈与版本基线

- Python ≥ 3.10；运行时依赖仅 openpyxl ≥ 3.1；开发依赖 pytest ≥ 7、ruff。
- Node ≥ 20；React 当前稳定版；Vite ≥ 5；TypeScript strict 模式；Ant Design 5；Zustand；SheetJS（xlsx CE ≥ 0.20）。
- Pyodide：锁定开工时的最新稳定版，版本号记入 `web/README.md` 并在 CI/构建脚本中固定。
- 测试：pytest（core）、Vitest（web 单元）、Playwright（E2E）。
- 部署：静态托管 Cloudflare Pages（免费、免备案）；国内加速为 Post-MVP。

## 6. 命名与代码规范

- Python：ruff 默认规则集；模块内函数保持纯函数风格，I/O 只出现在 api.py 边界与 CLI。
- TypeScript：strict；组件函数式；契约类型定义放 `web/src/types/contracts.ts`，字段名与 `02-contracts.md` 完全一致。
- 提交信息：Conventional Commits（feat:/fix:/docs:/test:/refactor:），末尾附 `Co-Authored-By: Warp <agent@warp.dev>`。
