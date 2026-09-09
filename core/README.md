# bomcore

纯Python核心依赖openpyxl，无pandas：

- excel_api.py：默认公司Excel兼容流程；原分组/排序/候选展开，公司元信息、旧颜色与可选原始输入/提示附表。不要求网页确认。
- api.py / render.py：冻结v1接口保留，不直接改写旧契约。
- review_api.py / review_rules.py / review_export.py：可选v2网页核对流程，独立会话与确认规则。
- review_import.py：共享已知EDA输入定位、读取和原文保留，嘉立创Device列可选。

CLI与默认网页共用excel_api。11套公开合成旧工具黄金快照验证主表兼容；私有生成物只留Git忽略目录，不代用户审核生产料号。
