# UI方向确认

2026-09-10，用户原话：**“就用A方案吧，不要融合了”**。

已展示三版真实截图后选择A；本轮不融合B，不新增暗色/双主题。

- A 浅色专业：docs/design/a-light-reference.html 和 docs/design/a-light-preview.png，已选。
- B 精密工程台：本机 output/playwright/bomkit-ui-2026-09-10/design-demos/b-graphite.png，不实施。
- C 暖白轻工具：本机 output/playwright/bomkit-ui-2026-09-10/design-demos/c-paper.png，不实施。

## 实施边界

按A的白底、冷灰预览区、钴蓝强调色、横向导航、左侧文件表单和右侧输出示意落地。效果图里的示例文件不得当成用户真实已选择文件；必须包含真实空态、读取/转换中、错误与完成状态。

Excel优先、旧合并/排序/候选展开、PCBA/PCB字段、输出命名、可选附表、物料表可选、多工作表选择不变。可选网页校对流程保留。只改界面，不改Python/CLI/Excel输出格式。

在独立本地分支codex/ui-a-light实现与验证；本轮不推送，不触发Vercel生产部署。
