# bomcore

Python核心仅依赖openpyxl，无pandas。v1 api.py保留兼容；本次新闭环使用：

- review_import.py：三平台共享预设、原文留存、文本编码/Excel范围兼容。
- review_api.py：物料索引、推荐、人工确认状态与失效规则、Worker动作。
- review_export.py：用户模板布局、清旧数据、校对记录/原始输入、正式导出门禁。

安装、打包与全部测试命令见仓库根README。公开测试只使用合成数据；private_regression.py显式读取gitignored样例并生成禁止投产的技术输出，不替代业务确认。
