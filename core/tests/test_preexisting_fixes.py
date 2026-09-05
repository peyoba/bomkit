"""接续开发前已有的三项未提交修复的针对性回归。"""

import io

from openpyxl import load_workbook

from bomcore.api import analyze, render
from bomcore.detect import detect
from bomcore.parse_rc import extract_package, normalize_package

from .test_api_end_to_end import BOM_PROFILE, MATERIAL_PROFILE, OUTPUT_TEMPLATE


def test_kind_domain_filters_before_alias_competition():
    bom = detect([["名称", "位号", "数量", "封装"], ["10kΩ", "R1", "1", "0603"]], "bom_input")
    assert {c["source"]: c["guess_field"] for c in bom["columns"]}["名称"] == "value"
    material = detect([["物料编码", "名称", "型号"], ["01.0001", "电阻", "10kΩ"]], "material_input")
    fields = {c["source"]: c["guess_field"] for c in material["columns"]}
    assert fields["物料编码"] == "code" and fields["型号"] == "spec"


def test_metric_packages_are_recognized_before_normalization():
    assert normalize_package(extract_package("R1608")) == "0603"
    assert normalize_package(extract_package("C2012")) == "0805"
    assert normalize_package(extract_package("C3225")) == "1210"


def test_value_only_unmatched_bom_keeps_missing_code_highlight():
    bom = [["Name", "Designator", "Quantity", "Footprint", "Device"], ["UNKNOWN-PART", "U1", "1", "QFN", ""]]
    material = [["编码", "名称", "规格型号", "禁用状态"], ["01.1", "其他元件", "OTHER-PART", "否"]]
    result = analyze(bom, material, BOM_PROFILE, MATERIAL_PROFILE)
    book = load_workbook(io.BytesIO(render(result["items"], OUTPUT_TEMPLATE)))
    assert book.active["B5"].fill.fgColor.rgb.endswith("FFFF00")
    assert book.active["D5"].fill.fgColor.rgb.endswith("FFFF00")
