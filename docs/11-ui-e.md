# 11 · 方向 E「红笔校对」实施

## 已确认范围

用户对 A 浅色方向不满意，要求完全重新设计。本轮按 `output/site-ui-mockups-20261008/` 中已认可的方向 E 效果图实施到真实代码，不混入其它方向，不增加主题切换。效果图、规格与边界见该目录下 `index.html` 与 `design-spec.md`。

## 方向概念

校对红笔加方格纸。全站只用一支校对红，且只用在需要人工判断的地方：候选行、需确认项、参数冲突、错误、主操作。工作区铺极淡方格，内容贴在不透明白纸块上并编号。数字与编码一律等宽。

## 已实现

- 根 `tokens.css` 改为方向 E 取值，保留全部旧变量名并新增 `--color-grid`、`--color-paper-raised`、`--font-mono`、`--cell` 等。
- `web/src/styles/e-proof.css` 替代 `a-light.css`，由 `main.tsx` 引入。类名前缀统一为 `e-`。
- `App.tsx` 通过 `ConfigProvider` 的 theme 把 antd 交互部件（Modal、Select、Table、Input、Alert）统一到校对红、2px 圆角与纸面色。十六进制值为同一 oklch 的换算。
- 首页：方格纸底、Excel 红底下划线、红色主操作、工作表示意带列标与页签。
- Excel 转换页：01 输入文件、02 输出信息与下载合并为一个纸块，四个元信息横排一行，文件名与附表复选框并排，生成按钮在首屏内；03 Excel 已生成只在真实下载后出现。
- 网页校对页：01 选择 BOM、02 选择企业物料库、03 输出模板与标题、04 本次校对范围、05 开始检查；结果页为摘要条、工具栏与校对表，需确认行红底加红笔竖线，已处理行淡绿底；行处理弹窗内使用同一套纸块。
- 文件格统一为 `LocalTableInput` 的 `appearance="e"`：空态虚线、已选红边、读取中灰底、错误红底，保留原生文件输入、工作表选择与清除。
- 全部业务逻辑、数据契约、`data-testid` 与 e2e 依赖的标签、按钮名、antd 选择器未变。

## 未改动

- `core/`、worker、转换与校对协议。
- `web/src/index.css` 中的旧全局样式与 `.file-input` 路径，供未接入新样式的旧页面使用。
- 未引用的 `Wizard.tsx`、`Preview.tsx`、`CandidatePicker.tsx`、`MappingTable.tsx`、`wizardStore.ts` 仍在仓库中，本轮不删除。

## 验证

本轮在沙箱内完成 TypeScript、vitest 与生产构建。浏览器 e2e 需在用户终端执行：

    cd web && npm run build && npm run preview
    npm run test:e2e:ui
    npm run test:e2e

结果只证明所列机器检查，不等同目视验收、Windows 真机 Excel 或物料工程批准。
