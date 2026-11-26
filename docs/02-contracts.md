# 02 · 契约文档（v1，冻结）

> 本文档是所有代理的共同依据。**开工后不得擅自修改**；发现缺陷向任务分发者报告。所有 JSON 字段名以本文为准，Python 与 TypeScript 侧命名保持一致（snake_case）。

## 1. 标准中间模型（Canonical Model）

一切输入映射到该模型，一切输出从该模型渲染。避免 N×M 格式两两适配。

### 1.1 BomItem（BOM 行，分组合并后）

| 字段 | 类型 | 说明 | 旧工具对应列 |
|---|---|---|---|
| `designator` | str | 位号，合并后逗号+空格分隔，自然排序（R1, R2, R10） | Designator |
| `qty` | float | 数量，分组求和 | Quantity |
| `value` | str | 元件值/名称（如 `10kΩ`、`100nF`、器件名） | Name |
| `footprint` | str | 封装 | Footprint |
| `mpn` | str | 制造商料号/器件型号 | Device |
| `manufacturer` | str | 厂商 | Manufacturer |
| `description` | str | 描述/备注（含 DNP 原始标记） | Comment |
| `category` | str | 元件类别 | Secondary Category |
| `tolerance` | str | 精度（如 `±1%`） | Tolerance |
| `dnp` | bool | 是否不贴装 | 由 Comment 含 `DNP` 推导 |
| `extras` | dict[str,str] | 未映射的源列原值（列名→值），透传不丢失 | — |

### 1.2 MaterialItem（物料库条目）

| 字段 | 类型 | 说明 | 金蝶对应列 |
|---|---|---|---|
| `code` | str | 物料编码（保留前导零，如 `01.0101`） | 编码 |
| `name` | str | 物料名称 | 名称 |
| `spec` | str | 规格型号（匹配主键） | 规格型号 |
| `status` | str | `enabled` / `disabled`（disabled 条目加载时跳过） | 禁用状态=是 → disabled |
| `category` | str | 物料类别（可空） | — |
| `extras` | dict[str,str] | 未映射源列透传 | — |

### 1.3 必填与可选

- BOM 输入至少映射：`designator`、`qty`、`value`、`footprint`。缺任一 → analyze 返回 `INVALID_PROFILE` 错误。
- 物料库输入至少映射：`code`、`spec`。
- 其余字段可不映射（引擎按空值处理并降级相应能力，如无 `tolerance` 则参数匹配跳过精度过滤）。

## 2. 行数据传输格式（rows）

前端（SheetJS）与 CLI（openpyxl）读取文件后统一转为：

```json
{
  "rows": [["Name", "Designator", "Quantity", "Footprint"],
           ["10kΩ", "R1",         "2",        "R0603"]],
  "sheet_name": "Sheet1"
}
```

规则（两端必须一致）：
1. `rows` 为行数组的数组，全部单元格转为**字符串**；空单元格为 `""`。
2. SheetJS 侧：`sheet_to_json(ws, {header: 1, raw: false, defval: ""})`，优先取格式化文本 `cell.w`，兜底 `String(cell.v)`。**禁止 raw:true**——金蝶编码 `01.0101` 会被数字化为 `1.0101`（前导零丢失事故，旧工具用 `dtype=str` 防御的就是这个）。
3. openpyxl 侧（CLI）：`str(cell.value)`，`None` → `""`；日期等特殊类型按显示文本处理。
4. 多 sheet 文件：默认取第一个非空 sheet；前端允许用户切换 sheet 后重新 detect。

## 3. Profile 格式

三种 `kind` 同构，JSON 存储。localStorage key 规则：`bomkit.profile.{kind}.{uuid}`。

### 3.1 `bom_input` / `material_input`

```json
{
  "schema_version": 1,
  "kind": "bom_input",
  "id": "uuid-v4",
  "name": "嘉立创EDA 专业版",
  "builtin": false,
  "header_fingerprint": "sha256-hex",
  "header_row_index": 0,
  "column_map": {
    "Name": "value",
    "Designator": "designator",
    "Quantity": "qty",
    "Footprint": "footprint",
    "Device": "mpn",
    "Manufacturer": "manufacturer",
    "Comment": "description",
    "Secondary Category": "category",
    "Tolerance": "tolerance"
  },
  "options": {
    "dnp_markers": ["DNP"],
    "skip_disabled": true
  }
}
```

- `column_map` 键 = 源表头原文（trim 后），值 = 中间模型字段 ID；未列出的源列进 `extras`。
- `options.dnp_markers`：description 中命中任一标记（大小写不敏感）即 `dnp=true`。
- `options.skip_disabled`：仅 material_input 有效。
- `builtin: true` 的预设由 `core/src/bomcore/presets/` 提供，不可被用户覆盖（复制后另存）。

### 3.2 `output_template`

```json
{
  "schema_version": 1,
  "kind": "output_template",
  "id": "uuid-v4",
  "name": "公司PCBA模板",
  "builtin": false,
  "base_xlsx_b64": "<base64 或 null>",
  "sheet_index": 0,
  "data_start_row": 5,
  "columns": {
    "A": "seq", "B": "code", "C": "material_name", "D": "material_spec",
    "E": "designator", "F": "qty", "G": "footprint", "H": "manufacturer",
    "I": null, "J": "mpn", "K": "description", "L": "match_status"
  },
  "meta_cells": { "B2": "material_code", "D2": "pcba_name", "G2": "pcba_model" },
  "fixed_rows": [
    { "cells": { "A": "{seq}", "C": "{pcb_name}", "D": "{pcb_model}", "I": "PCB" } }
  ],
  "style": {
    "borders": true,
    "status_colors": true,
    "missing_highlight": true,
    "dnp_highlight": true,
    "row_height_auto": true
  }
}
```

- `columns` 值域：中间模型字段 ID、匹配结果字段（`code`、`material_name`、`material_spec`、`match_status`）、`seq`（序号）、`null`（留空列）。
- `base_xlsx_b64` 非空时：openpyxl 加载该模板，保留 `data_start_row` 之前的全部内容与样式，从 `data_start_row` 起写入 fixed_rows + 数据行；为空时：程序化生成表头（内置默认模板专用路径，复刻旧工具样式）。
- `fixed_rows`：数据区顶部的固定行（如 PCB 空板行）。`{xxx}` 占位符从 render 的 `meta` 取值；`{seq}` 为自动序号。数据行序号在 fixed_rows 之后接续。
- `meta_cells`：把 meta 值写入模板指定单元格（用于表头第 2 行这类元数据区）。

### 3.3 匹配配置（match_config，不属于 Profile，随 analyze 传入）

```json
{
  "levels": {
    "exact": true,
    "model": true,
    "substring": { "enabled": true, "min_len": 6 },
    "clean_retry": true,
    "param": { "enabled": true, "use_package": true, "use_tolerance": true }
  },
  "candidate_priority_prefix": "01.",
  "non_component_keywords": ["hole", "test-point", "test_point", "fiducial", "mounting_hole"]
}
```

以上为默认值；UI"高级设置"面板暴露，普通用户不感知。

## 4. 表头指纹与自动复用

### 4.1 归一化（normalize_header）

对每个表头字符串：Unicode NFKC → trim → 连续空白折叠为单个空格 → 小写。

### 4.2 指纹（fingerprint）

`sha256("\x1f".join(sorted(set(normalized_headers))))` 的 hex。空表头忽略。

### 4.3 复用策略（前端 lib/profiles.ts）

1. 精确命中（指纹相等）→ 自动套用该 Profile，向导映射步骤直接展示"已应用配置 X，可修改"。
2. 无精确命中 → 计算与已存 Profile 表头集合的 Jaccard 相似度，≥ 0.8 的作为"相似配置"推荐，用户一键套用后仅需补差异列。
3. 都没有 → 走 detect 词库自动猜测。

## 5. 表头探测与列名猜测（detect 算法定义）

TS 与 Python 双实现必须遵守同一定义，共享测试用例（`core/tests/fixtures/detect_cases.json`）。

### 5.1 表头行探测

扫描前 10 行，对每行打分：`score = 非空单元格数 × 1 + 命中别名词库的单元格数 × 3`，且要求该行下方至少 1 行数据。取最高分行；平分取最靠上。全部为 0 分 → 返回第 0 行 + `low_confidence` 标记。

### 5.2 列名猜测

1. 别名词库精确命中（归一化后相等）→ confidence `high`。
2. 词库包含式命中（表头包含别名或别名包含表头，长度 ≥ 2）→ confidence `medium`。
3. 内容验证修正：对候选列取前 20 个非空样本做正则验证，验证失败则降为 `low`：
   - `designator`：≥ 60% 样本匹配 `^[A-Za-z]{1,4}\d+$`（允许逗号分隔多值）
   - `qty`：≥ 90% 样本可解析为数字
   - `code`（物料编码）：≥ 60% 样本匹配 `^[0-9][0-9.\-]*$`
4. 未命中列 → `guess_field: null`。

### 5.3 别名词库（aliases/*.json 数据格式）

```json
{
  "field": "designator",
  "aliases": ["designator", "位号", "reference", "refdes", "ref", "位置", "标号"]
}
```

初始词库覆盖字段见 1.1/1.2 全部字段；来源与扩充责任见任务卡 T3。

## 6. Worker API（JS ↔ Pyodide 桥接）

Worker 消息协议：`{ id, fn, args }` 请求 / `{ id, ok, result | error }` 响应。三个函数：

### 6.1 `detect(rows, kind) → DetectResult`

```json
{
  "header_row_index": 0,
  "low_confidence": false,
  "columns": [
    { "col_index": 0, "source": "Name", "guess_field": "value",
      "confidence": "high", "samples": ["10kΩ", "100nF", "STM32F103C8T6"] }
  ]
}
```

### 6.2 `analyze(bom_rows, material_rows, bom_profile, material_profile, match_config) → AnalyzeResult`

`material_rows`/`material_profile` 可为 null（跳过匹配）。返回：

```json
{
  "items": [
    {
      "row_id": 0,
      "fields": { "designator": "R1, R2", "qty": 2, "value": "10kΩ",
                  "footprint": "R0603", "mpn": "0603WAF1002T5E",
                  "manufacturer": "UNI-ROYAL", "description": "",
                  "category": "电阻", "tolerance": "±1%", "dnp": false },
      "match": {
        "level": "exact",
        "status_text": "精确匹配",
        "confidence": "high",
        "candidates": [ { "code": "01.010203", "name": "贴片电阻", "spec": "10KΩ±1%/0603" } ],
        "selected": 0,
        "manual_code": null
      }
    }
  ],
  "stats": { "total": 120, "matched": 96, "low_confidence": 5, "param": 8,
             "multi": 4, "unmatched": 5, "non_component": 2 }
}
```

约定：
- `items` 顺序 = 输出顺序（引擎已完成分组合并与排序）。
- `match.level` 枚举：`exact` | `model` | `substring` | `param` | `multi` | `none` | `non_component` | `skipped`（未提供物料库）。
- `multi` 时 `candidates` 长度 > 1，`selected` 为引擎默认推荐索引（优先 `candidate_priority_prefix`）；用户在预览中改 `selected` 或填 `manual_code`。
- `manual_code` 非空时优先于 `selected` 生效。
- `qty` 为数值，其余 fields 为字符串。

### 6.3 `render(final_items, output_profile, meta) → bytes`

- `final_items`：analyze 返回的 `items`（含用户修改后的 `selected`/`manual_code`）。
- `meta`：`{ "pcba_name": "", "pcba_model": "", "pcb_name": "", "pcb_model": "", "material_code": "" }`，键集合开放（output_template 的占位符/meta_cells 引用什么就传什么）。
- 返回 xlsx 字节；JS 侧收到 Uint8Array 后 Blob 下载。文件名规则：`BOM_{pcba_model或输入文件名}_{yyyy-MM-dd}.xlsx`，前端生成。

### 6.4 错误格式

```json
{ "error": { "code": "INVALID_PROFILE", "message": "BOM 映射缺少必填字段: qty" } }
```

`code` 枚举：`INVALID_PROFILE` | `INVALID_ROWS` | `MISSING_REQUIRED_FIELD` | `BAD_TEMPLATE` | `INTERNAL`。message 用中文、面向最终用户可直接展示。

## 7. 匹配状态 → 颜色（预览 UI 与导出 Excel 必须一致）

| level / 情形 | 状态文字 | 颜色（hex 填充） |
|---|---|---|
| exact / model | 精确匹配 / 型号匹配 | `C6EFCE` 绿 |
| substring | 料号匹配（低置信，需人工确认） | `FFEB9C` 琥珀 |
| param（唯一） | 参数匹配 | `BDD7EE` 蓝 |
| multi（普通候选行） | 候选i/N | `FFE0B2` / `FFF3E0` 橙交替 |
| multi（参数候选行） | 候选i/N | `D6E4F0` / `E9EFF7` 浅蓝交替 |
| none | 未匹配 | `FFC7CE` 红 |
| non_component | 非物料 | `D9D9D9` 灰 |
| 编码/规格缺失单元格 | — | `FFFF00` 黄（单元格级） |
| dnp=true | — | `E6B8AF` 暗红（description 单元格） |

导出时 `multi` 行为：若用户已选定（`selected` 唯一或 `manual_code` 非空）则输出单行；未处理的 multi 行按旧工具行为展开为候选多行并交替着色（style.status_colors=true 时）。

## 8. 契约 fixture

`core/tests/fixtures/contract/` 下提供（T0 任务产出）：
- `bom_rows.json`、`material_rows.json`：合成输入
- `profiles.json`：三种 kind 各一份示例
- `analyze_expected.json`：上述输入的期望 analyze 输出
- `detect_cases.json`：探测算法共享测试用例（TS/Python 双端跑同一份）

web 端在真实 core 就绪前用这些 fixture mock Worker 响应。

---

## 附录 A · v1.1 增量（向后兼容，2026-11）

> 第 1–8 节内容不变，v1.1 只做**新增**：不改变既有字段语义、不改变"不给谱系输入时的旧输出"。
> 未使用新参数的既有调用方（Web 向导、`bomkit <bom>` 单文件命令）行为与 v1 完全一致。

### A.1 新增输入：谱系行（previous_rows / reference_rows）

`convert_excel(args)` 新增三个可选键：

```json
{
  "previous_rows": "[[\"物料编码\",\"规格型号（金蝶）\",\"位号\",…], …] | null",
  "reference_rows": ["<rows-JSON>", "…"],
  "sort_mode": "auto | legacy | company"
}
```

- 两个行集都遵循第 2 节 rows 规则（全字符串、空值为 `""`），内容是**已定稿的成品 PCBA BOM**：
  至少含 `物料编码`、`规格型号（金蝶）`、`位号` 三列表头；表头行可在前 30 行内任意位置。
- `previous_rows`（上一版 BOM）：按**位号联结**继承编码——封装一致、位号有交集、值等价才信任；
  值等价用阻容物理值换算（`0.047uF == 47nF`、`10R == 10Ω`、裸值 `499` 按 R 封装解析）。
  上一版编码在当前金蝶表里不存在时（死编码），排除该码后按本版型号/参数重新检索。
- `reference_rows`（物料参考表，可多份）：**不看位号**，按型号（精确/核心段/子串+封装守卫）
  或阻容参数（值 → 封装 → 公差级联收窄）直接查编码。
- 匹配优先级：上一版位号联结 → 参考表 → 金蝶物料库级联。
- 行集不符（缺必需表头）时返回 `INVALID_PROFILE`，message 指明"不是成品 PCBA BOM"。

### A.2 输出模板 v2（`sort_mode=company` 或给了谱系输入时启用）

列结构（13 列，`columns` 键 A–M）：

| 列 | 字段 | 说明 |
|---|---|---|
| A | `seq` | 序号，按 A.4 排序后连续编号 |
| B | `code` | 物料编码 |
| C | `material_name` | 物料名称（系统优先，缺失回退类别） |
| D | `material_spec` | 规格型号（金蝶）；未定码时先填新版原始型号 |
| E | `designator` | 位号 |
| F | `qty` | 数量 |
| G | `footprint` | 封装 |
| H | `manufacturer` | 厂商 |
| I | `note` | **备注**：匹配方式（`【上一版继承】`/`【参考表·型号匹配】`/`【参数匹配】`…）、`【DNP 不贴装】`、位号/数量异常 |
| J | `source_text` | **原始BOM型号（核对后删）**：新版 BOM 原文（嘉立创 Comment，含 `-DNP`） |
| K | `mpn` | JLC规格 / 器件型号 |
| L | `description` | Description（DNP 时单元格标暗红） |
| M | `match_status` | 匹配状态文字 |

多候选项在主表只占一行（推荐编码），其余候选与"未定码行的备选型号"统一放**底部候选区**
（`序号-1`、`序号-2`… 交替橙底，尾行图例）。

### A.3 行底色 v2（与 A.2 配套；覆盖第 7 节状态色的公司口径）

| 情形 | 行底色 |
|---|---|
| 精确匹配 / 编码直查（含上一版继承且金蝶可查） | 无底色 |
| 非精确匹配：型号匹配、料号匹配、参数匹配、参考表命中、位号拆分 | `DDEBF7` 蓝（建议人工确认） |
| 未定码 / 多候选 | `FCE4D6` 橙（编码格 `FFFF00` 黄） |
| 位号数与数量不一致 | `FFF2CC` 黄 |
| DNP / 测试点等非贴装 | `EDEDED` 灰 |

### A.4 排序规则（公司口径）

1. `DNP`/非物料项整段放最后（通常整段删除）；多候选项集中在正常项之后、DNP 之前。
2. 正常项按**类别顺序**分组：类别序取自上一版（其次参考表）成品 BOM 中 `物料名称` 首次出现顺序；
   未出现的类别按内置 `COMPONENT_ORDER` 兜底。
3. 组内阻容按物理值升序（`0Ω → 10Ω → 1k → 100k`；`pF → nF → µF`）；非阻容保持原 BOM 顺序。
4. "需新建编码"与模糊匹配项**不单独挪动**，留在各自类别位置，靠备注与底色标注。

### A.5 CLI 新增参数

```bash
bomkit <新版BOM.xlsx> [-m 物料表.xlsx] [--old 上一版成品BOM.xlsx] \
       [--ref 参考表1.xlsx] [--ref 参考表2.xlsx] [--sort auto|legacy|company] [-o 输出.xlsx]
```

- `--old` / `--ref` 会自动挑选文件中含 `物料编码/规格型号/位号` 表头的工作表。
- `--sort auto`（默认）：给了 `--old`/`--ref` 即用公司规则 v2，否则保持旧工具排序与 12 列输出。

### A.6 v1.1 变更记录

1. 新增 `bomcore.lineage`（谱系加载、位号联结、参考表检索、备选推荐、v2 排序）。
2. `parse_bom_rc_value(name, footprint=None)` 增补：封装以 `R` 开头时把裸数值（`499`、`1k`）解析为电阻。
   不传 `footprint` 时行为与 v1 完全一致。
3. `render._write_builtin_header` 支持 `output_template.headers` / `column_widths` 覆盖内置表头与列宽
   （缺省行为不变），供 A.2 的 13 列模板使用。
4. 验收测试：`core/tests/test_lineage.py`（继承/死码/位号拆分/裸值/参考表/排序/底色/候选区/输入校验）。
