# bomkit · A浅色专业设计系统

唯一视觉依据为用户已选A原型，详见direction-approved.md。不得融合B或新增深色主题。

## 结构与功能

- 首页保留开始转换入口，导航保留Excel转换和可选网页校对。
- Excel工作台采用左主表单、右样式示意；示意是静态合成局部表格，不是新增实时预览或选料功能。
- 可选网页校对继承应用外壳，不改确认、搜索、模板能力。
- 不新增账户、云同步、仪表盘或伪造成功状态。

## 颜色与排印

根tokens.css为新视觉token来源，按A原型转为OKLCH：白底、深蓝灰文字、冷灰细线/预览区、钴蓝按钮。参考色为#fff、#1b2839、#536175、#637085、#dce2ea、#2852c4、#f1f4f8。

字体延续A的Avenir Next/PingFang SC/系统中文无衬线，示意数量用DIN Alternate。无网络字体。标题直立、正文至少14px、辅助至少12px，输入与相邻操作至少44px，主按钮50px。

## 交互与适配

文件区域有空、已选、读取、禁用、错误与键盘焦点状态，保留工作表选择并提供清除。桌面沿用A结构比例；320/375/414/768px改为可完整访问的单列或双列，不横向滚动。

新样式限定.a-layout/.a-workspace，不删除原index.css规则。没有入场动画；焦点即时可见，尊重减少动态效果。业务和文件数据仍在本机处理。

## 修改范围

App/Home/ExcelWorkspace/LocalTableInput原位接线；新增AppHeader/OutputExample与A独立样式。Python、CLI、v1契约和可选v2业务代码不动。

## Token导出

本项目实际运行使用根tokens.css（由web/src/styles/a-light.css导入），不引入Tailwind或shadcn依赖。移植参考均以该文件为准：

- Tailwind v4可将color/font/text token放入@theme，space映射到spacing；当前代码不加载这一格式。
- DTCG语义类型分别是color/fontFamily/dimension；色值保留OKLCH。
- shadcn变量映射：background→paper、foreground→ink、primary→accent、primary-foreground→paper、muted→surface、muted-foreground→secondary、border/input→input-border、ring→accent。

## 校验边界

只按所选A实现，跳过与用户选择冲突的主题轮换。机器检查覆盖23组布局、71处对比度和真实文件下载。自评为结构/层级/一致性检查，不冒称已完成图片目视评审；实际界面截图由用户复核。
