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
