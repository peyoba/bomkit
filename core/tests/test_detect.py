# -*- coding: utf-8 -*-
"""表头探测算法测试（契约 5 节）。"""
from bomcore.detect import detect, detect_header_row, normalize_header


def test_normalize_header_trims_and_lowercases():
    assert normalize_header("  Designator  ") == "designator"
    assert normalize_header("Quantity") == "quantity"


def test_detect_header_row_finds_standard_first_row():
    rows = [
        ["Designator", "Quantity", "Name", "Footprint"],
        ["R1", "2", "10kΩ", "R0603"],
    ]
    idx, low_conf = detect_header_row(rows)
    assert idx == 0
    assert low_conf is False


def test_detect_header_row_finds_offset_header():
    rows = [
        ["某标题占位行"],
        [""],
        ["Designator", "Quantity", "Name", "Footprint"],
        ["R1", "2", "10kΩ", "R0603"],
    ]
    idx, low_conf = detect_header_row(rows)
    assert idx == 2
    assert low_conf is False


def test_detect_guesses_columns_with_confidence():
    rows = [
        ["Designator", "Quantity", "Name", "Footprint"],
        ["R1", "2", "10kΩ", "R0603"],
    ]
    result = detect(rows, "bom_input")
    fields = {c["source"]: c["guess_field"] for c in result["columns"]}
    assert fields["Designator"] == "designator"
    assert fields["Quantity"] == "qty"
    assert fields["Footprint"] == "footprint"


def test_all_empty_required_field_column_downgraded_to_low_confidence():
    """真实故障复现：物料表“编码”列在前 20 行样本里恰好全为空（如尚未编号的
    新规格），旧逻辑对“无可验证样本”一律放行为 high 置信度，导致用户在向导
    界面看到绿色 high 标签、直接确认映射，而实际这一列毫无内容，后续所有
    匹配到的物料行编码栏全部为空且完全无法从界面觉察。见开发报告：
    “生产 BOM 物料编码一个都没填”。TS 侧同名用例见 web/src/lib/__tests__/detect.test.ts。
    """
    header = ["编码", "名称", "规格型号", "禁用状态"]
    rows = [header]
    for i in range(20):
        rows.append(["", "贴片电阻", f"0Ω ±1% /R0603 (RS-0300{i}FT)/FH(风华)", "否"])
    result = detect(rows, "material_input")
    code_column = result["columns"][0]
    assert code_column["guess_field"] == "code"
    assert code_column["confidence"] == "low"


def test_free_text_field_with_all_empty_samples_still_trusted():
    """对照组：没有内容验证规则的字段（如 name/manufacturer 这类自由文本
    字段）样本全空时，仍维持猜测结果，不应被这次修复误伤——这类字段本来
    就无法用正则验证内容，只有 designator/qty/code 三个字段在 _VALIDATORS
    里注册了校验规则（含 qty 的数值校验分支）。"""
    header = ["厂商"]
    rows = [header, [""], [""], [""]]
    result = detect(rows, "bom_input")
    assert result["columns"][0]["guess_field"] == "manufacturer"
    assert result["columns"][0]["confidence"] == "high"
