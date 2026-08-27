# -*- coding: utf-8 -*-
"""回归：真实用户数据的三类故障。

背景（2026-08 用户实测，74 行 BOM 全部未匹配、编码列全空）：
1. detect 无视 kind——BOM 表里同名的"物料编码/物料名称/规格型号"列被猜成
   物料库字段，解析 BomItem 时被静默丢弃；
2. 物料库"编码"与"旧物料编码"两列同时映射 code，末列覆盖后输出旧编码；
3. BOM 自带企业编码的行没有任何提取通路。

对应修复：kind 字段域过滤、first-wins 认领去重、source_code 字段 +
编码直配预检、value 内容校验拒绝中文大类描述。
"""
from bomcore.api import _rows_to_bom_items, analyze
from bomcore.detect import detect

BOM_ROWS = [
    ["二单元主板BOM"],
    ["导出时间 2026-08-20"],
    ["序号", "物料编码", "物料名称", "规格型号", "位号", "数量", "封装",
     "厂商", "备注", "JLC规格", "Description"],
    ["1", "", "主控板", "YYKJ_1000_A_V1.0", "", "", "", "", "PCB", "", ""],
    ["2", "", "贴片电阻", "RS-03000FT", "R22,R32,R37,R56", "4", "R0603",
     "FH(风华)", "", "RS-03000FT", "0Ω"],
    ["3", "", "贴片电容", "0603B104K500NT", "C5,C6,C8", "3", "C0603",
     "SAM(三星)", "", "0603B104K500NT", "100nF"],
]

MATERIAL_ROWS = [
    ["编码", "名称", "规格型号", "描述", "数据状态", "物料属性", "基本单位",
     "旧物料编码", "使用组织"],
    ["01.01.001.00001", "单片机", "STM32F103RCT6/ST/LQFP64", "",
     "已审核", "外购", "Pcs", "010101.0011", "深圳"],
    ["01.01.02.00031", "贴片电容", "100nF±10%/50V/C0603(0603B104K500NT)/SAM", "",
     "已审核", "外购", "Pcs", "010102.0031", "深圳"],
    ["01.01.01.00012", "贴片电阻", "0Ω±1%/R0603(RS-03000FT)/FH(风华)", "",
     "已审核", "外购", "Pcs", "010101.0012", "深圳"],
]

# 自动检测后需要用户手动补的仅一处：Description -> value
BOM_MAP_AUTO_PLUS_VALUE = {
    "物料编码": "source_code",
    "位号": "designator",
    "数量": "qty",
    "封装": "footprint",
    "厂商": "manufacturer",
    "备注": "description",
    "JLC规格": "mpn",
    "Description": "value",
}

MATERIAL_MAP = {"编码": "code", "名称": "name", "规格型号": "spec", "数据状态": "status"}

BOM_PROFILE = {"kind": "bom_input", "header_row_index": 2, "column_map": BOM_MAP_AUTO_PLUS_VALUE}
MATERIAL_PROFILE = {"kind": "material_input", "header_row_index": 0, "column_map": MATERIAL_MAP}


def test_detect_scopes_fields_by_kind():
    bom_columns = {c["source"]: c["guess_field"] for c in detect(BOM_ROWS, "bom_input")["columns"]}
    # 不再被猜成物料库字段
    assert bom_columns["物料编码"] == "source_code"
    assert bom_columns["物料名称"] is None      # 中文大类描述，value 内容校验拒收
    assert bom_columns["规格型号"] is None
    assert bom_columns["JLC规格"] == "mpn"
    assert bom_columns["Description"] is None  # 英文 description 精确命中备注语义，
    # 但两列竞争 description 只认领先到的"备注"，Description 保持未映射

    mat_columns = {c["source"]: c["guess_field"] for c in detect(MATERIAL_ROWS, "material_input")["columns"]}
    assert mat_columns["编码"] == "code"
    assert mat_columns["名称"] == "name"        # 不再被 value 抢走
    assert mat_columns["规格型号"] == "spec"
    assert mat_columns["旧物料编码"] is None    # 编码已被先到的"编码"列认领


def test_source_code_direct_match_and_new_style_code_output():
    rows = [r[:] for r in BOM_ROWS]
    rows[4][1] = "01.01.01.00012"  # 给电阻行填上企业编码
    result = analyze(rows, MATERIAL_ROWS, BOM_PROFILE, MATERIAL_PROFILE)
    r_row = next(i for i in result["items"] if i["fields"]["designator"].startswith("R22"))
    m = r_row["match"]
    assert m["level"] == "exact"
    assert m["candidates"][m["selected"]]["code"] == "01.01.01.00012"

    c_row = next(i for i in result["items"] if i["fields"]["designator"].startswith("C5"))
    cm = c_row["match"]
    assert cm["level"] == "substring"
    # 关键断言：输出的是正式编码而非旧物料编码 010102.0031
    assert cm["candidates"][cm["selected"]]["code"] == "01.01.02.00031"


def test_legacy_profile_maps_wuliao_code_as_code():
    """存量 Profile 兼容：老版 detect 把"物料编码"列存成 code 字段。"""
    profile = dict(BOM_PROFILE)
    profile["column_map"] = dict(BOM_MAP_AUTO_PLUS_VALUE, 物料编码="code")
    rows = [r[:] for r in BOM_ROWS]
    rows[4][1] = "01.01.01.00012"
    result = analyze(rows, MATERIAL_ROWS, profile, MATERIAL_PROFILE)
    r_row = next(i for i in result["items"] if i["fields"]["designator"].startswith("R22"))
    assert r_row["match"]["level"] == "exact"


def test_first_non_empty_column_assignment_within_row():
    """手动把两列拖到同一字段时首列非空生效，后者不覆盖。"""
    items = _rows_to_bom_items(
        [["位号", "值", "Description"], ["R1", "10kΩ", "20kΩ"]],
        {"kind": "bom_input", "header_row_index": 0,
         "column_map": {"位号": "designator", "值": "value", "Description": "value"}},
    )
    assert items[0].value == "10kΩ"
