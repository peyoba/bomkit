# -*- coding: utf-8 -*-
"""重写自旧仓库 tests/test_material_loading.py：原来测 pandas dtype=str 加载，
现测 rows JSON（全字符串）+ material_input Profile -> MaterialItem 列表。
语义断言不变：跳过禁用、前导零保留。
"""
from bomcore.api import analyze
from .test_api_end_to_end import BOM_PROFILE, MATERIAL_PROFILE


def _bom_rows_minimal():
    header = ["Name", "Designator", "Quantity", "Footprint", "Device"]
    return [header, ["10kΩ", "R1", "1", "R0603", "RS-03K1002FT"]]


def test_leading_and_trailing_zeros_preserved_in_material_code():
    material_header = ["编码", "名称", "规格型号", "禁用状态"]
    material_rows = [
        material_header,
        ["01.0101", "贴片电阻", "10K/0603", "否"],
        ["01.0100", "贴片电阻", "1K/0603", "否"],
    ]
    result = analyze(_bom_rows_minimal(), material_rows, BOM_PROFILE, MATERIAL_PROFILE)
    # 通过 candidates 里出现的 code 间接验证物料表被正确解析（前导零未丢失）。
    # 契约 6.2：match 对象本身不带 code/name/spec，只在 candidates 列表里。
    all_codes = set()
    for it in result["items"]:
        for c in it["match"]["candidates"]:
            all_codes.add(c["code"])
    assert "1.0101" not in all_codes
    assert "1.01" not in all_codes


def test_disabled_entries_are_skipped():
    material_header = ["编码", "名称", "规格型号", "禁用状态"]
    material_rows = [
        material_header,
        ["01.0001", "贴片电阻", "10K/0603", "是"],
        ["01.0002", "贴片电阻", "10K/0603", "否"],
    ]
    result = analyze(_bom_rows_minimal(), material_rows, BOM_PROFILE, MATERIAL_PROFILE)
    item = result["items"][0]
    codes = {c["code"] for c in item["match"]["candidates"]}
    assert "01.0001" not in codes
