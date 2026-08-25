# 05 · 旧代码迁移映射（T1 core-engine 专用）

旧核心文件（只读）：
`/Users/peyoba/Documents/Obsidian Vault/项目/jlc_bom_converter/jlc_bom_converter/jlc_bom_converter_core.py`（下称"旧核心"，行号以该文件当前版本为准）

原则：**重构不重写**。正则、常量表、算法顺序原样搬运后再做接口适配；每处行为改动必须有测试证明与旧行为等价或差异经确认。

## 1. 模块迁移映射

| 旧核心位置 | 内容 | 新模块 |
|---|---|---|
| 15-16 行 REQUIRED/OPTIONAL_COLUMNS | 列名要求 | 废弃——由 Profile 必填字段校验替代（契约 1.3） |
| 18-47 行 COMPONENT_ORDER | 元件类型排序表 | `grouping.py` 常量（保持可配置入口，默认原值） |
| 49 行 NON_COMPONENT_KEYWORDS | 非物料关键词 | match_config 默认值（契约 3.3） |
| 51-70 行 KNOWN_PACKAGES / PACKAGE_METRIC_TO_IMPERIAL | 封装表 + 公英制映射 | `parse_rc.py` 常量 |
| 72-78 行 _normalize_package | 封装归一化 | `parse_rc.py` |
| 107-123 行 _generate_output_filename | 防覆盖文件名 | `cli/` 专用（Web 端不需要，浏览器下载自行处理重名） |
| 127-245 行 物料表加载（新/旧格式探测与解析） | 格式自动探测 | 拆分：探测逻辑并入 `detect.py`（金蝶/旧简易表成为两个内置 material_input 预设）；解析并入 `models.py` 的 MaterialItem 构造。**dtype=str 语义由契约第 2 节 rows 字符串化承接** |
| 249-259 行 _clean_jlc_device / _is_non_component | mpn 清洗与非物料判定 | `matching.py` |
| 261-458 行 R/C 参数解析全部（_OHM_WORD、_RC_SPLIT_RE、_R_MULT、_C_UNIT_MULT、_rc_segments、_parse_resistor_ohms、_parse_capacitor_pf、_parse_bom_rc_value、_extract_package、_parse_material_rc_params、_normalize_tolerance、_rc_values_equal） | 值/封装/精度解析 | `parse_rc.py` **正则逐字符原样搬运**，含全部注释 |
| 460-500 行 _param_fallback_search | 参数级联过滤 | `matching.py` |
| 504-573 行 _match_device / _is_specific_substring_match / MIN_SUBSTRING_MATCH_LEN | 五级级联匹配 | `matching.py`（管线化 + match_config 参数化） |
| 575-609 行 _select_best_match / _lookup_material | 多候选消歧 | `matching.py`（`01.` 前缀 → candidate_priority_prefix 配置） |
| 613-623 行 read_jlc_bom | pandas 读 Excel | 废弃——rows JSON 进入（Web=SheetJS，CLI=openpyxl 读取器写在 cli/ 或 api.py 辅助函数） |
| 625-667 行 process_data | 校验/分组/排序 | `grouping.py` 去 pandas 重写（见第 3 节） |
| 671-878 行 create_excel | 输出渲染 | `render.py` 模板驱动重构：布局参数全部来自 output_template Profile；内置默认模板 preset 的渲染结果必须与旧输出等价 |
| 880-933 行 _write_data_row | 行写入 | `render.py` |
| 935-947 行 _save_workbook 重试 | 文件占用重试 | `cli/` 专用（Web 端返回字节流无此问题） |
| 956-1035 行 工具函数（_component_order、_is_dnp、_clean_secondary_category、_cell_text、_write_safe_text、_first_not_empty、_join_unique、_join_designators、_natural_key） | 通用工具 | `_cell_text/_write_safe_text` → `render.py`；`_is_dnp` → `models.py`（dnp_markers 配置化）；聚合函数与自然排序 → `grouping.py` |

## 2. 必须保留的边界 case 清单（每条都要有对应测试）

1. **文本读取防前导零丢失**：金蝶编码 `01.0101` 绝不能变 `1.0101`。旧防御是 pandas `dtype=str`；新防御是契约第 2 节的 rows 全字符串化。测试：带前导零编码经全链路后原样输出。
2. **欧姆词三写法**：`Ω`、`欧`、`ohm/OHM`（`_OHM_WORD` 正则，旧核心 278 行）。注意 `\b` 在 `Ω` 前失效的坑（Python 正则把 Ω 当 word 字符），旧实现已用显式边界替代，不要"优化"回 `\b`。
3. **微法两种 mu**：希腊 `μ`(U+03BC) 与 micro sign `µ`(U+00B5) 都要认；uF/UF/nF/NF/pF/PF 大小写全组合（281、339 行）。
4. **m/M 大小写敏感**：`m`=毫欧、`M`=兆欧，绝不能大小写不敏感合并——10mΩ 电流采样电阻误配 10MΩ 是真实事故模式（300-306 行注释）。
5. **紧凑记法仅限全段匹配**：`4R7`=4.7Ω、`10K1`=10.1kΩ 只在 `allow_compact` 且 `fullmatch` 短段时启用（325-329 行），防止把料号内数字读成阻值。
6. **料号内嵌值防误读**：`RS-03K1002FT` 不得解析出 3kΩ；`RL1812A470K` 应解析出 470kΩ（316-323 行的前后字符断言）。
7. **BOM 侧解析保守性**：`_parse_bom_rc_value` 要求整段被值表达式完全消费（`^...$`），物料侧 `_parse_material_rc_params` 才允许分段扫描（346-377 行注释解释了为什么不对称）。
8. **公英制封装等价**：`3216`(公制) ≡ `1206`(英制) 等映射表（60-70 行），参数匹配封装过滤前双方都要归一化。
9. **子串匹配护栏**：长度 ≥ 6（MIN_SUBSTRING_MATCH_LEN）+ 完整 token 边界（前后不能紧邻字母数字），命中也只给低置信度琥珀色（529-573 行）。
10. **mpn 清洗**：去 `_C\d+` 后缀（嘉立创元件库编号）、逗号取首段；先试原值再试清洗值，用 `dict.fromkeys` 去重保序（514 行）。
11. **参数匹配分级过滤**：值(±1% 相对误差)→封装→精度，每级"有结果则缩小、无结果则保留上级候选"（460-500 行），不是硬 AND。
12. **候选消歧**：多候选优先 `01.` 前缀（参数化为 candidate_priority_prefix），展开为多行交替底色（575-589、800-837 行）。
13. **公式注入防护**：以 `= + - @` 开头的文本单元格强制 `data_type='s'`（984-1008 行），所有来自输入文件的文本都过 `_write_safe_text`。
14. **DNP 语义**：Comment 含 `DNP`（大小写不敏感）→ dnp=true；BOM Name 尾部 `-DNP` 在值解析前剥离（358 行）；DNP 行排序沉底、description 单元格暗红。
15. **分组键**：(value, footprint, dnp) 三元组分组；designator 自然排序合并（R1,R2,R10 不是 R1,R10,R2）；qty 求和；其余字段取首个非空（642-656 行）。
16. **排序链**：非 DNP 优先 → 有类别优先 → COMPONENT_ORDER → value 字母序（658-663 行）。
17. **Quantity 非数字报错带行号**：错误信息标注 Excel 实际行号（637 行），错误提示对用户可读（契约 6.4）。

## 3. 去 pandas 指引

- `read_excel(dtype=str)` → 输入侧已由 rows JSON（全字符串）替代；CLI 读取器用 openpyxl `iter_rows(values_only=True)` + `str(v) if v is not None else ""`。
- `groupby().agg()` → 手写：`dict[(value, footprint, dnp)] -> list[row]` 累积后逐组聚合（聚合函数沿用旧 _join_designators/_first_not_empty/_join_unique）。
- `pd.isna` → `value is None or str(value).strip() == ""`（注意旧 `_cell_text` 会把字符串 `"nan"` 当普通文本，rows JSON 化后不再产生 `"nan"`，删除相关分支时要留测试证明）。
- `sort_values(多键)` → `sorted(key=tuple)`，键序按第 2 节第 16 条。

## 4. 旧测试迁移表

旧仓库 `tests/` → `core/tests/`：

| 旧文件 | 迁移说明 |
|---|---|
| test_value_parsing.py | 直接迁移到 test_parse_rc.py，import 路径改 bomcore.parse_rc |
| test_matching_confidence.py | 迁移到 test_matching.py；构造入参改为 MaterialItem/match_config |
| test_material_loading.py | 重写：原来测 pandas 加载，现改测 rows JSON + material_input Profile → MaterialItem 列表（语义断言不变：跳过禁用、前导零保留、新旧格式探测） |
| test_package_normalization.py | 直接迁移 |
| test_output_path_and_safety.py | 拆分：公式注入部分 → test_render.py；输出路径防覆盖部分 → cli 测试 |
| test_end_to_end.py | 重写为 api 层测试：rows+profiles 进、xlsx 字节出，断言用 openpyxl 重新打开校验 |

## 5. 需参数化的硬编码点汇总

MIN_SUBSTRING_MATCH_LEN(6)、`01.` 候选优先前缀、NON_COMPONENT_KEYWORDS、DNP 标记词、COMPONENT_ORDER 表、KNOWN_PACKAGES、PACKAGE_METRIC_TO_IMPERIAL——前四项进 match_config/Profile options（默认值=契约 3.3），后三项保留为模块常量（数据稳定，暂不暴露配置）。
