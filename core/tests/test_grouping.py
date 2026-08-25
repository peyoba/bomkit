# -*- coding: utf-8 -*-
"""分组合并/排序测试。语义对应旧核心 process_data（旧核心 625-667 行）。"""
from bomcore.grouping import group_and_sort, join_designators, natural_key
from bomcore.models import BomItem


def test_natural_sort_of_designators():
    assert join_designators(["R10", "R2", "R1"]) == "R1, R2, R10"


def test_group_by_value_footprint_dnp_and_sum_qty():
    items = [
        BomItem(designator="R1", qty=1, value="10kΩ", footprint="R0603", category="贴片电阻"),
        BomItem(designator="R2", qty=1, value="10kΩ", footprint="R0603", category="贴片电阻"),
    ]
    merged = group_and_sort(items)
    assert len(merged) == 1
    assert merged[0].designator == "R1, R2"
    assert merged[0].qty == 2


def test_dnp_and_non_dnp_are_kept_separate_and_dnp_sorts_last():
    items = [
        BomItem(designator="R3", qty=1, value="10kΩ", footprint="R0603", category="贴片电阻", dnp=True),
        BomItem(designator="R1", qty=1, value="10kΩ", footprint="R0603", category="贴片电阻", dnp=False),
    ]
    merged = group_and_sort(items)
    assert len(merged) == 2
    assert merged[0].dnp is False
    assert merged[1].dnp is True


def test_component_order_takes_priority_over_value_alpha_order():
    items = [
        BomItem(designator="C1", qty=1, value="100nF", footprint="C0603", category="贴片电容"),
        BomItem(designator="R1", qty=1, value="10kΩ", footprint="R0603", category="贴片电阻"),
    ]
    merged = group_and_sort(items)
    # 电阻(order=1) 先于 电容(order=2)
    assert merged[0].category == "贴片电阻"
    assert merged[1].category == "贴片电容"


def test_natural_key_orders_numeric_suffix_correctly():
    assert natural_key("R2") < natural_key("R10")
