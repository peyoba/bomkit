# -*- coding: utf-8 -*-
"""回归：BOM 没有独立型号列（mpn 映射后为空）时，匹配主键必须回退到 value。

真实故障：立创EDA 导出的 BOM 把完整料号直接放在"名称"列，没有 Device/型号列。
旧逻辑在进入任何匹配级别前就因 `not bom_item.mpn` 直接判"未匹配"，导致整表
74 行无一命中（物料库里明明存在可子串命中的条目）。修复后 mpn 为空回退用
value 参与级联匹配；两者皆空的行为保持与旧实现一致（未匹配）。
"""
from bomcore.api import analyze

BOM_PROFILE = {
    "kind": "bom_input",
    "header_row_index": 0,
    "column_map": {"位号": "designator", "数量": "qty", "名称": "value", "封装": "footprint"},
}

MATERIAL_PROFILE = {
    "kind": "material_input",
    "header_row_index": 0,
    "column_map": {"编码": "code", "名称": "name", "规格型号": "spec", "禁用状态": "status"},
}


def _bom_rows():
    return [
        ["位号", "数量", "名称", "封装"],
        ["SW1", "1", "B3U-1000PM", "KEY-SMD_B3U-1000PM"],
        ["CN1,CN2", "2", "", ""],  # 值也为空：整行无任何可匹配文本
    ]


def _material_rows():
    return [
        ["编码", "名称", "规格型号", "禁用状态"],
        ["01.060708", "轻触开关", "B3U-1000PM(欧姆龙)", "否"],
    ]


def test_value_fallback_matches_when_mpn_column_absent():
    result = analyze(_bom_rows(), _material_rows(), BOM_PROFILE, MATERIAL_PROFILE)
    items = result["items"]
    assert len(items) == 2

    switch = next(it for it in items if it["fields"]["value"] == "B3U-1000PM")
    assert switch["match"]["level"] == "substring"
    assert switch["match"]["confidence"] == "low"
    assert switch["match"]["candidates"][0]["code"] == "01.060708"

    # 值也为空的行不能崩溃或误报命中，仍应为未匹配
    empty = next(it for it in items if it["fields"]["value"] == "")
    assert empty["match"]["level"] == "none"


def test_stats_reflect_value_fallback_match():
    result = analyze(_bom_rows(), _material_rows(), BOM_PROFILE, MATERIAL_PROFILE)
    assert result["stats"]["total"] == 2
    assert result["stats"]["low_confidence"] == 1
    assert result["stats"]["unmatched"] == 1
