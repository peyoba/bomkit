"""谱系匹配（上一版 / 参考表）与公司规则 v2 输出的回归测试。

覆盖 docs/02-contracts.md 附录 A 的验收点：
- 上一版位号联结继承编码、死编码改配、位号拆分改值、金蝶死码不写回
- 参考表按型号/阻容参数命中（不看位号）
- 排序：类别按上一版顺序、组内阻容值升序、多候选集中、DNP 最后
- 输出：公司规则 v2 列结构、备注列、原始BOM型号列、行底色分级、底部候选区
- 输入校验：不是成品 PCBA BOM 时给出可读错误
"""

import io

import pytest
from openpyxl import load_workbook

from bomcore.excel_api import analyze_excel, convert_excel
from bomcore.lineage import load_lineage
from bomcore.schema import ProfileError

BOM_HEADER = ["Name", "Designator", "Quantity", "Footprint", "Device", "Manufacturer",
              "Comment", "Secondary Category", "Tolerance"]

MATERIAL = [
    ["编码", "名称", "规格型号"],
    ["01.01.001.01832", "贴片电阻", "10kΩ±1%/R0603(RS-03K1002FT)"],
    ["01.01.001.00873", "贴片电阻", "1K±1%/R0603(RS-03K1001FT)"],
    ["01.01.001.02359", "贴片电阻", "499Ω±1%/R0603"],
    ["01.01.001.01946", "贴片电容", "100nF±10%/50V/C0603（0603B104K500NT)"],
    ["01.01.001.01822", "贴片电容", "1uF±10%/50V/C0603(0603B105K500NT)"],
    ["01.01.001.02396", "贴片电容", "2.2nF±5%/50V/C0603(0603CG222J500NT)"],
    ["01.01.001.02368", "逻辑芯片", "SN74LVC1G3157DBVR/SOT-23-6"],
]

PREVIOUS = [
    ["PCBA BOM表"],
    ["物料编码", "", "PCBA名称", "OLD-BOARD", "", "PCBA型号", "OLD-V1.0"],
    ["序号", "物料编码", "物料名称", "规格型号（金蝶）", "位号", "数量", "封装", "厂商", "备注"],
    ["1", "", "OLD-BOARD（空）", "OLD-V1.0", "", "", "", "", "PCB"],
    ["2", "01.01.001.02368", "逻辑芯片", "SN74LVC1G3157DBVR/SOT-23-6", "U1", "1", "SOT-23-6", "TI", ""],
    ["3", "01.01.001.01832", "贴片电阻", "10kΩ±1%/R0603(RS-03K1002FT)", "R1", "1", "R0603", "国产", ""],
    ["4", "99.99.999.99999", "贴片电阻", "1K±1%/R0603(RS-03K1001FT)", "R2", "1", "R0603", "FLAG", ""],
    ["5", "01.01.001.01946", "贴片电容", "100nF±10%/50V/C0603（0603B104K500NT)", "C3", "1", "C0603", "国产", ""],
]

# 新版：R1 同位号同值(继承)、R2 旧码已删(改配)、C3 同位号改值(位号拆分)、
# U1 同位号同型号(继承)、R9 裸值 499(参数匹配)、R7 DNP(排最后)、Q9 全新料(需新建)
NEW_BOM = [
    BOM_HEADER,
    ["10kΩ", "R1", "1", "R0603", "10kΩ", "国产", "10kΩ", "贴片电阻", "±1%"],
    ["1k", "R2", "1", "R0603", "1k", "FLAG", "1k", "贴片电阻", "±1%"],
    ["10pF", "C3", "1", "C0603", "10pF", "国产", "10pF", "贴片电容", "±5%"],
    ["SN74LVC1G3157DBVR", "U1", "1", "SOT-23-6", "SN74LVC1G3157DBVR", "TI", "SN74LVC1G3157DBVR", "逻辑芯片", ""],
    ["499", "R9", "1", "R0603", "499", "国产", "499", "贴片电阻", "±1%"],
    ["100nF", "R7", "1", "C0603", "100nF-DNP", "国产", "100nF-DNP", "贴片电容", "±10%"],
    ["XYZ-NOT-EXIST-1", "Q9", "1", "SOT-23", "XYZ-NOT-EXIST-1", "未知", "XYZ-NOT-EXIST-1", "场效应管", ""],
]


def _by_designator(analysis):
    return {item["fields"]["designator"]: item for item in analysis["items"]}


def test_load_lineage_reads_rows_categories_and_title():
    lineage = load_lineage(PREVIOUS, source="上一版")
    assert lineage is not None
    assert lineage.pcba_name == "OLD-BOARD"
    assert lineage.pcba_model == "OLD-V1.0"
    assert [e.code for e in lineage.entries] == [
        "01.01.001.02368", "01.01.001.01832", "99.99.999.99999", "01.01.001.01946",
    ]
    # PCB 空板行（无编码）与备注被跳过；类别顺序 = 物料名称首次出现顺序
    assert lineage.category_order == ["逻辑芯片", "贴片电阻", "贴片电容"]
    assert lineage.entries[0].designators == {"U1"}


def test_load_lineage_rejects_non_pcba_sheet():
    assert load_lineage(BOM_HEADER and [BOM_HEADER, ["10kΩ", "R1", "1", "R0603"]]) is None


def test_previous_inherits_code_and_dead_code_is_replaced():
    analysis = analyze_excel(NEW_BOM, MATERIAL, previous_rows=PREVIOUS)
    items = _by_designator(analysis)
    assert items["R1"]["match"]["level"] == "exact"
    assert items["R1"]["match"]["candidates"][0]["code"] == "01.01.001.01832"
    assert "上一版继承" in items["R1"]["fields"]["note"]
    # 死编码：上一版 99.99.999.99999 不在金蝶表 → 按本版 1k 重新参数匹配
    assert items["R2"]["match"]["candidates"][0]["code"] == "01.01.001.00873"
    assert "已从金蝶删除" in items["R2"]["fields"]["note"]
    # 同位号改值：C3 从 100nF 改 10pF，旧码不沿用
    assert items["C3"]["match"]["level"] == "none"
    assert "位号拆分" in items["C3"]["fields"]["note"]


def test_bare_value_resistor_matches_by_ohm_spec():
    """499Ω 写在金蝶规格里（Ω 写法）也曾漏匹配，必须能参数命中。"""
    analysis = analyze_excel([["Name", "Designator", "Quantity", "Footprint"], ["499", "R9", "1", "R0603"]],
                             MATERIAL, sort_mode="company")
    assert analysis["items"][0]["match"]["candidates"][0]["code"] == "01.01.001.02359"


def test_reference_matches_by_model_and_param_without_designator():
    reference = [row for row in PREVIOUS if row[0] != "序号"]
    reference[2] = ["序号", "物料编码", "物料名称", "规格型号（金蝶）", "位号", "数量", "封装", "厂商", "备注"]
    reference[3] = ["1", "01.01.001.02396", "贴片电容", "2.2nF±5%/50V/C0603(0603CG222J500NT)", "C90", "1", "C0603", "", ""]
    rows = [BOM_HEADER, ["2.2nF", "C7", "1", "C0603", "2.2nF", "", "2.2nF", "贴片电容", "±5%"]]
    analysis = analyze_excel(rows, MATERIAL, reference_rows=[reference])
    match = analysis["items"][0]["match"]
    assert match["candidates"][0]["code"] == "01.01.001.02396"
    assert match["source"] == "reference"
    assert "参考表" in analysis["items"][0]["fields"]["note"]


def test_company_sort_order_values_and_dnp_last():
    analysis = analyze_excel(NEW_BOM, MATERIAL, previous_rows=PREVIOUS)
    # 类别顺序跟上一版（逻辑芯片 → 贴片电阻 → 贴片电容），组内阻容值升序，
    # 上一版没有的类别排其后，DNP/非贴装项整段放最后。
    assert [i["fields"]["category"] for i in analysis["items"]] == [
        "逻辑芯片", "贴片电阻", "贴片电阻", "贴片电阻", "贴片电容", "场效应管", "贴片电容",
    ]
    assert [i["fields"]["designator"] for i in analysis["items"]] == [
        "U1", "R9", "R2", "R1", "C3", "Q9", "R7",
    ]
    assert analysis["items"][-1]["fields"]["dnp"] is True


def test_v2_workbook_columns_note_and_candidate_zone():
    result = convert_excel({
        "bom_rows": NEW_BOM, "material_rows": MATERIAL, "previous_rows": PREVIOUS,
        "include_trace": False,
    })
    ws = load_workbook(io.BytesIO(result["data"])).active
    header = [ws.cell(3, col).value for col in range(1, 14)]
    assert header == ["序号", "物料编码", "物料名称", "规格型号（金蝶）", "位号", "数量", "封装", "厂商",
                      "备注", "原始BOM型号（核对后删）", "JLC规格", "Description", "匹配状态"]
    # PCBA 名称/型号从上一版表头继承
    assert ws["D2"].value == "OLD-BOARD"
    assert ws["G2"].value == "OLD-V1.0"
    # 第 5 行起为数据行：备注写匹配方式，原始型号列保留新版原文（含 -DNP）
    notes = [ws.cell(row, 9).value or "" for row in range(5, 5 + len(NEW_BOM) - 1)]
    assert any("上一版继承" in note for note in notes)
    assert any("位号拆分" in note for note in notes)
    sources = [ws.cell(row, 10).value or "" for row in range(5, 12)]
    assert "100nF-DNP" in sources
    # 底部候选区（未定码项若有备选则展开），且不产生重复候选行
    assert result["stats"]["output_rows"] == len(NEW_BOM) - 1


def test_legacy_output_is_untouched_when_no_lineage_input():
    """不给 --old/--ref 时必须是旧工具 12 列格式，不受 v2 影响。"""
    result = convert_excel({"bom_rows": NEW_BOM, "material_rows": MATERIAL})
    ws = load_workbook(io.BytesIO(result["data"])).active
    assert ws.cell(3, 10).value == "JLC规格"
    assert ws.max_column == 12


def test_invalid_previous_file_reports_readable_error():
    with pytest.raises(ProfileError) as exc:
        convert_excel({"bom_rows": NEW_BOM, "material_rows": MATERIAL,
                       "previous_rows": [BOM_HEADER, ["10kΩ", "R1", "1", "R0603"]]})
    assert "上一版 BOM" in exc.value.message
    assert "物料编码" in exc.value.message


def test_rows_without_lineage_behave_as_before():
    """无谱系输入时 match 不应带 previous/reference 来源。"""
    analysis = analyze_excel(NEW_BOM, MATERIAL)
    assert all(item["match"].get("source", "") == "" for item in analysis["items"])
    assert analysis["stats"]["previous"] == 0
    assert analysis["stats"]["reference"] == 0


MULTI_MATERIAL = [
    ["编码", "名称", "规格型号"],
    ["01.01.001.00001", "贴片电阻", "10kΩ±1%/R0603(A)"],
    ["30.01.001.00002", "贴片电阻", "10kΩ±1%/R0603(B)"],
    ["01.01.001.00003", "贴片电阻", "10kΩ±1%/R0805(C)"],
]


def test_candidate_zone_renders_multi_candidates():
    """多候选必须落到候选区（回归 StyleProxy 边框复制崩溃）。"""
    rows = [["Name", "Designator", "Quantity", "Footprint"], ["10kΩ", "R1", "1", "R0603"]]
    result = convert_excel({"bom_rows": rows, "material_rows": MULTI_MATERIAL, "sort_mode": "company"})
    ws = load_workbook(io.BytesIO(result["data"])).active
    assert ws["A5"].value == 2  # 主表每项一行（推荐编码）
    zone = next(r for r in range(6, ws.max_row + 1) if str(ws.cell(r, 1).value or "").startswith("▼"))
    codes = [ws.cell(r, 2).value for r in range(zone + 1, ws.max_row + 1)
             if str(ws.cell(r, 1).value or "").endswith("-1")]
    assert "01.01.001.00001" in codes or "30.01.001.00002" in codes
    assert str(ws.cell(ws.max_row, 1).value).startswith("备注：")


def test_suggestion_zone_lists_near_model_for_unmatched():
    """未定码且型号近似时，备选型号进候选区，并在备注里提示。"""
    rows = [["Name", "Designator", "Quantity", "Footprint"], ["XYZ-12345", "U9", "1", "SOT-23-6"]]
    material = [["编码", "名称", "规格型号"], ["01.01.001.00010", "逻辑芯片", "XYZ-12346/SOT-23-6"]]
    result = convert_excel({"bom_rows": rows, "material_rows": material, "sort_mode": "company"})
    ws = load_workbook(io.BytesIO(result["data"])).active
    zone = next(r for r in range(6, ws.max_row + 1) if str(ws.cell(r, 1).value or "").startswith("▼"))
    labels = [str(ws.cell(r, 9).value or "") for r in range(zone + 1, ws.max_row + 1)]
    assert any("备选·未定码" in text for text in labels)
    assert "备选" in (ws["I5"].value or "")


def test_sort_mode_auto_is_accepted_and_resolves_by_lineage():
    """网页固定传 sort_mode="auto"：无谱系→旧 12 列；有谱系→公司规则 13 列；显式 legacy 优先。"""
    rows = [["Name", "Designator", "Quantity", "Footprint"], ["10kΩ", "R1", "1", "R0603"]]
    material = [["编码", "名称", "规格型号"], ["01.01.001.01832", "贴片电阻", "10kΩ±1%/R0603(A)"]]
    previous = [["物料编码", "规格型号（金蝶）", "位号", "封装"],
                ["01.01.001.01832", "10kΩ±1%/R0603(A)", "R1", "R0603"]]
    base = {"bom_rows": rows, "material_rows": material}
    auto = load_workbook(io.BytesIO(convert_excel({**base, "sort_mode": "auto"})["data"])).active
    assert auto.max_column == 12
    with_previous = load_workbook(io.BytesIO(
        convert_excel({**base, "sort_mode": "auto", "previous_rows": previous})["data"])).active
    assert with_previous.max_column == 13
    assert "上一版继承" in (with_previous["I5"].value or "")
    explicit_legacy = load_workbook(io.BytesIO(
        convert_excel({**base, "sort_mode": "legacy", "previous_rows": previous})["data"])).active
    assert explicit_legacy.max_column == 12
